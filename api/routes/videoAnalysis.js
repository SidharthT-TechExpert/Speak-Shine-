import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import VideoReport from "../../models/videoReportSchema.js";
import User from "../../models/userSchema.js";
import { getVideoDuration } from "../../ai/webVideoProcessor.js";
import { uploadToR2, deleteFromR2, getR2Key } from "../../r2.js";
import { enqueue, enqueueRetry, registerSseClient, unregisterSseClient, estimateWait } from "../videoQueue.js";

const router = express.Router();

// Configure multer for video uploads (max 350MB)
const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 350 * 1024 * 1024 },
});

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
        return res.status(400).json({ error: "File too large. Maximum size is 350MB." });
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
    const user = await User.findOne({ phone });

    // ── Mark submitted ───────────────────────────────────────────────────
    // Set completed=true at submission time
    // Weekly/monthly submissions are incremented at midnight reset (not here)
    await User.findOneAndUpdate(
      { phone },
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

    res.json({
      success: true,
      message: "Retrying analysis...",
      reportId: req.params.reportId,
    });

    // Download from R2 and re-enqueue
    enqueueRetry(req.params.reportId, report.videoUrl, report.phone, report.uploaderName)
      .catch(err => console.error("[VideoRetry] enqueueRetry failed:", err.message));
    
  } catch (err) {
    console.error("[VideoRetry] Error:", err);
    res.status(500).json({ error: "Failed to retry analysis" });
  }
});

export default router;
