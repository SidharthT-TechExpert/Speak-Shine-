import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import VideoReport from "../../models/videoReportSchema.js";
import User from "../../models/userSchema.js";
import { getVideoDuration } from "../../ai/webVideoProcessor.js";
import { uploadToR2, deleteFromR2, getR2Key, getPresignedUploadUrl } from "../../r2.js";
import { enqueue, enqueueRetry, registerSseClient, unregisterSseClient, estimateWait } from "../videoQueue.js";

const router = express.Router();

// ── Helper: Download video from R2 and enqueue ──────────────────────────────
// ffprobe cannot read from HTTPS URLs in Railway environment
async function downloadAndEnqueue(reportId, videoUrl, phone, displayName) {
  const tempPath = `./tmp/uploads/confirm-${reportId}-${Date.now()}.mp4`;
  
  try {
    console.log(`[VideoConfirm] Downloading video for ${reportId}...`);
    
    // Ensure tmp directory exists
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(buffer));
    
    console.log(`[VideoConfirm] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`);
    
    // Enqueue for processing
    enqueue({
      reportId,
      videoPath: tempPath,
      phone,
      displayName,
    });
  } catch (err) {
    console.error(`[VideoConfirm] Download failed for ${reportId}:`, err.message);
    
    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
    
    // Mark report as failed
    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: "Failed to download video for processing: " + err.message,
    });
  }
}

// Configure multer for video uploads (max 110MB — large files cause OOM on Railway)
const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 110 * 1024 * 1024 },
});

// ── Presigned upload URL ─────────────────────────────────────────────────────
// GET /api/video/presign?filename=foo.mp4&mimeType=video/mp4
// Returns a presigned PUT URL so the browser uploads directly to R2 (no Railway RAM used)
router.get("/presign", authMiddleware, async (req, res) => {
  try {
    const { filename = "video.webm", mimeType = "video/webm" } = req.query;
    const key = getR2Key(req.user.id, filename);
    const uploadUrl = await getPresignedUploadUrl(key, mimeType);
    const publicUrl = `${process.env.R2_PUBLIC_URL?.replace(/\/$/, "")}/${key}`;
    res.json({ uploadUrl, key, publicUrl });
  } catch (err) {
    console.error("[Presign] Error:", err.message);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ── Confirm direct upload & start analysis ───────────────────────────────────
// POST /api/video/confirm
// Called after browser has uploaded directly to R2
router.post("/confirm", authMiddleware, async (req, res) => {
  const { key, publicUrl, mimeType = "video/webm", isPublic = true } = req.body;
  if (!key || !publicUrl) return res.status(400).json({ error: "key and publicUrl are required" });

  const userId = req.user.id;
  const phone  = req.user.phone;
  const isWebm = mimeType.includes("webm") || key.endsWith(".webm");

  // Normalise phone — strip country code so it matches the WhatsApp User document
  const strippedPhone = phone.replace(/^(\+91|91)/, "");

  // ── Check file size before accepting for analysis ────────────────────────
  // Railway has limited RAM — large files cause OOM crashes during download+processing
  // Safe limit: 110MB (leaves headroom for Node.js + ffmpeg + other processes)
  const MAX_ANALYSIS_MB = 110;
  try {
    const headRes = await fetch(publicUrl, { method: "HEAD" });
    const contentLength = parseInt(headRes.headers.get("content-length") || "0", 10);
    const fileMB = contentLength / 1024 / 1024;
    if (contentLength > 0 && fileMB > MAX_ANALYSIS_MB) {
      // Delete from R2 since we won't process it
      try { await deleteFromR2(key); } catch {}
      return res.status(400).json({
        error: `Video file is too large for analysis (${fileMB.toFixed(0)}MB). Maximum is ${MAX_ANALYSIS_MB}MB. Please record a shorter or lower-quality video.`
      });
    }
  } catch (headErr) {
    // If HEAD fails, proceed anyway — size check is best-effort
    console.warn("[VideoConfirm] Could not check file size:", headErr.message);
  }

  try {
    const user = await User.findOne({ phone: { $in: [phone, strippedPhone] } });

    // Mark user as submitted for today (works for both 10-digit and 91-prefixed formats)
    await User.findOneAndUpdate(
      { phone: { $in: [phone, strippedPhone] } },
      { completed: true }
    );

    const report = await VideoReport.create({
      userId,
      phone,
      videoFileName: path.basename(key),
      status: "processing",
      videoUrl: publicUrl,
      videoKey: key,
      isPublic: isPublic === true || isPublic === "true",
      uploaderName: user?.name || phone,
    });

    console.log(`[VideoConfirm] Report created: ${report._id} key=${key} webm=${isWebm}`);

    if (isWebm) {
      // For WebM: transcode first, THEN queue analysis with the MP4 URL
      transcodeWebmToMp4(report._id, key, publicUrl, userId.toString())
        .then(mp4Url => {
          downloadAndEnqueue(report._id, mp4Url, strippedPhone, user?.name || strippedPhone);
        })
        .catch(err => {
          console.error(`[Transcode] Failed for ${report._id}:`, err.message);
          downloadAndEnqueue(report._id, publicUrl, strippedPhone, user?.name || strippedPhone);
        });
    } else {
      downloadAndEnqueue(report._id, publicUrl, strippedPhone, user?.name || strippedPhone);
    }

    res.json({
      success: true,
      reportId: report._id,
      message: isWebm ? "Video uploaded. Transcoding for best quality, then analysing…" : "Processing now…",
      queuePosition: 1,
      estimatedWait: isWebm ? 3 : 1,
    });
  } catch (err) {
    console.error("[VideoConfirm] Error:", err.message);
    try { await deleteFromR2(key); } catch {}
    res.status(500).json({ error: err.message || "Failed to start analysis" });
  }
});

// ── Transcode WebM → MP4 for proper seeking support ─────────────────────────
async function transcodeWebmToMp4(reportId, webmKey, webmUrl, userId) {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const tmpWebm = `./tmp/uploads/transcode-${reportId}.webm`;
  const tmpMp4  = `./tmp/uploads/transcode-${reportId}.mp4`;

  try {
    // Download WebM from R2
    console.log(`[Transcode] Downloading WebM for ${reportId}…`);
    const resp = await fetch(webmUrl);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const buf = await resp.arrayBuffer();
    fs.writeFileSync(tmpWebm, Buffer.from(buf));

    // Transcode to MP4 with fast-start (moov atom at front = seekable)
    console.log(`[Transcode] Converting to MP4…`);
    await execAsync(
      `ffmpeg -i "${tmpWebm}" -c:v copy -c:a aac -movflags +faststart "${tmpMp4}" -y`,
      { timeout: 120000 }
    );

    // Upload MP4 to R2
    const mp4Key = webmKey.replace(/\.webm$/, ".mp4");
    const mp4Url = await uploadToR2(tmpMp4, mp4Key, "video/mp4");
    console.log(`[Transcode] MP4 saved: ${mp4Url}`);

    // Update report with MP4 URL
    await VideoReport.findByIdAndUpdate(reportId, {
      videoUrl: mp4Url,
      videoKey: mp4Key,
      videoFileName: path.basename(mp4Key),
    });

    // Delete original WebM from R2
    await deleteFromR2(webmKey);
    console.log(`[Transcode] Done for ${reportId}`);

    return mp4Url; // return so analysis can use it
  } finally {
    if (fs.existsSync(tmpWebm)) fs.unlinkSync(tmpWebm);
    if (fs.existsSync(tmpMp4))  fs.unlinkSync(tmpMp4);
  }
}

// ── SSE progress stream ──────────────────────────────────────────────────────
// GET /api/video/progress/:reportId
router.get("/progress/:reportId", authMiddleware, async (req, res) => {
  const { reportId } = req.params;

  const report = await VideoReport.findById(reportId).lean();
  if (!report || report.userId.toString() !== req.user.id) {
    return res.status(403).json({ error: "Access denied" });
  }

  // If already done, return immediately
  if (report.status === "completed" || report.status === "failed") {
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ status: report.status })}\n\n`);
    return res.end();
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  registerSseClient(reportId, res);

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unregisterSseClient(reportId);
  });
});

// ── Upload ───────────────────────────────────────────────────────────────────
// POST /api/video/upload
router.post("/upload", authMiddleware, (req, res, next) => {
  upload.single("video")(req, res, (err) => {
    if (err) {
      console.error("[VideoUpload] Multer error:", err.message);
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large. Maximum size is 100MB. Please compress your video." });
      }
      return res.status(400).json({ error: err.message || "File upload failed" });
    }
    next();
  });
}, async (req, res) => {
  let videoPath = null;
  let videoKey = null;
  let videoUrl = null;

  try {
    if (!req.file) return res.status(400).json({ error: "No video file uploaded" });

    videoPath = req.file.path;
    const userId = req.user.id;
    const phone  = req.user.phone;

    // Normalise phone — strip country code so it matches the WhatsApp User document
    const strippedPhone = phone.replace(/^(\+91|91)/, "");

    console.log(`[VideoUpload] ${req.file.originalname} (${(req.file.size/1024/1024).toFixed(1)}MB) user=${phone}`);

    // Ensure upload dir exists
    fs.mkdirSync(path.dirname(videoPath), { recursive: true });

    // Check duration
    let duration;
    try {
      duration = await getVideoDuration(videoPath);
      console.log(`[VideoUpload] Duration: ${duration}s`);
    } catch (err) {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(400).json({ error: err.message });
    }

    if (duration < 60) {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(400).json({ error: `Video is too short (${duration}s). Minimum is 1 minute.` });
    }
    if (duration > 300) {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(400).json({ error: `Video is too long (${duration}s). Maximum is 5 minutes.` });
    }

    // ── SAVE VIDEO TO R2 FIRST (before processing) ──────────────────────
    // This ensures the video is never lost, even if processing fails
    try {
      videoKey = getR2Key(userId.toString(), req.file.originalname);
      videoUrl = await uploadToR2(videoPath, videoKey, req.file.mimetype);
      console.log(`[R2] Video saved: ${videoUrl}`);
    } catch (r2Err) {
      console.error(`[R2] Upload failed:`, r2Err);
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(500).json({ error: "Failed to save video. Please try again." });
    }

    // Create report
    const user = await User.findOne({ phone: { $in: [phone, strippedPhone] } });

    // ── Mark submitted ───────────────────────────────────────────────────
    // Set completed=true at submission time
    // Weekly/monthly submissions are incremented at midnight reset (not here)
    await User.findOneAndUpdate(
      { phone: { $in: [phone, strippedPhone] } },
      {
        completed: true,
        ...(req.user.name ? { $set: { name: req.user.name } } : {}),
      }
    );

    const report = await VideoReport.create({
      userId,
      phone,
      videoFileName: req.file.originalname,
      videoDuration: duration,
      status: "processing",
      videoUrl,      // Video is already saved
      videoKey,      // Key for deletion later
      isPublic: req.body.isPublic === "true" || req.body.isPublic === true,
      uploaderName: user?.name || phone,
    });

    console.log(`[VideoUpload] Report created: ${report._id}`);

    // Add to queue — returns position and estimated wait
    const { position, estimatedWait } = enqueue({
      reportId: report._id,
      videoPath,
      phone,
      displayName: user?.name || phone,
    });

    // Respond immediately with queue position
    res.json({
      success: true,
      reportId: report._id,
      message: position === 1
        ? "Video uploaded. Processing now…"
        : `Video uploaded. You are #${position} in queue.`,
      queuePosition: position,
      estimatedWait,
    });

  } catch (err) {
    console.error("[VideoUpload] Error:", err);
    
    // Clean up local file
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    
    // If R2 upload succeeded but something else failed, clean up R2
    if (videoKey) {
      try {
        await deleteFromR2(videoKey);
      } catch {}
    }
    
    res.status(500).json({ error: err.message || "Failed to upload video" });
  }
});

// ── Get single report ────────────────────────────────────────────────────────
router.get("/report/:reportId", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: "Report not found or expired" });
    if (report.userId.toString() !== req.user.id) return res.status(403).json({ error: "Access denied" });

    res.json({
      reportId:      report._id,
      status:        report.status,
      submittedAt:   report.submittedAt,
      expiresAt:     report.expiresAt,
      videoFileName: report.videoFileName,
      videoDuration: report.videoDuration,
      videoUrl:      report.videoUrl || null,
      isPublic:      report.isPublic || false,
      analysis:      report.status === "completed" ? report.analysis : null,
      errorMessage:  report.errorMessage,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

// ── Community feed — today's public submissions ──────────────────────────────
// GET /api/video/community-feed
router.get("/community-feed", authMiddleware, async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const feed = await VideoReport.find({
      status:   "completed",
      isPublic: true,
      videoUrl: { $ne: null },
      submittedAt: { $gte: since },
      expiresAt:   { $gt: new Date() },
    })
      .sort({ submittedAt: -1 })
      .limit(20)
      .select("uploaderName submittedAt videoDuration videoUrl analysis expiresAt")
      .lean();

    res.json({ feed });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch community feed" });
  }
});

// ── Toggle public/private for own report ────────────────────────────────────
router.patch("/report/:reportId/visibility", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: "Report not found" });
    if (report.userId.toString() !== req.user.id) return res.status(403).json({ error: "Access denied" });
    if (!report.videoUrl) return res.status(400).json({ error: "No video stored for this report" });

    report.isPublic = !report.isPublic;
    await report.save();
    res.json({ isPublic: report.isPublic });
  } catch (err) {
    res.status(500).json({ error: "Failed to update visibility" });
  }
});

// ── List my reports ──────────────────────────────────────────────────────────
router.get("/my-reports", authMiddleware, async (req, res) => {
  try {
    const reports = await VideoReport.find({
      userId: req.user.id,
      expiresAt: { $gt: new Date() },
    }).sort({ submittedAt: -1 }).limit(10).select("-analysis.transcription");

    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

// ── Delete report ────────────────────────────────────────────────────────────
router.delete("/report/:reportId", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: "Report not found" });
    if (report.userId.toString() !== req.user.id) return res.status(403).json({ error: "Access denied" });

    await VideoReport.deleteOne({ _id: req.params.reportId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete report" });
  }
});

// ── Retry failed analysis ────────────────────────────────────────────────────
// POST /api/video/retry/:reportId
// Retries analysis for a failed report (video is already in R2)
router.post("/retry/:reportId", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    if (!report) return res.status(404).json({ error: "Report not found" });
    if (report.userId.toString() !== req.user.id) return res.status(403).json({ error: "Access denied" });
    
    // Only allow retry for failed reports
    if (report.status !== "failed") {
      return res.status(400).json({ error: "Can only retry failed reports" });
    }
    
    // Check if video exists in R2
    if (!report.videoUrl || !report.videoKey) {
      return res.status(400).json({ error: "Video not found. Please re-upload." });
    }
    
    // Reset status to processing
    await VideoReport.findByIdAndUpdate(req.params.reportId, {
      status: "processing",
      errorMessage: null,
      analysis: {
        vocabularyHighlights: { strong: [], weak: [] },
        strongPoints: [],
        suggestions: [],
        visualSuggestions: [],
        visualStrengths: [],
        grammarErrors: [],
      },
    });

    console.log(`[VideoRetry] Retrying analysis for ${req.params.reportId}`);

    // Re-enqueue for processing (using R2 URL directly)
    const { position, estimatedWait } = await enqueueRetry(
      req.params.reportId, 
      report.videoUrl, 
      report.phone, 
      report.uploaderName || report.phone
    );

    res.json({
      success: true,
      message: position === 1 
        ? "Retrying analysis now..." 
        : `Retrying analysis. Position #${position} in queue.`,
      reportId: req.params.reportId,
      queuePosition: position,
      estimatedWait,
    });
    
  } catch (err) {
    console.error("[VideoRetry] Error:", err);
    res.status(500).json({ error: err.message || "Failed to retry analysis" });
  }
});

export default router;
