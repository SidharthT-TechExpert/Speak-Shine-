import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import VideoReport from "../../models/videoReportSchema.js";
import User from "../../models/userSchema.js";
import { processWebVideo, getVideoDuration } from "../../ai/webVideoProcessor.js";

const router = express.Router();

// In-memory SSE clients map: reportId → res
const sseClients = new Map();

// Configure multer for video uploads (max 350MB)
const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 350 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm",
      "video/mpeg", "video/3gpp", "video/x-flv", "video/x-ms-wmv",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed (MP4, MOV, AVI, WEBM, MPEG, 3GP, FLV, WMV)."));
    }
  },
});

// ── SSE progress stream ──────────────────────────────────────────────────────
// GET /api/video/progress/:reportId
// Client subscribes here to get real-time stage updates
router.get("/progress/:reportId", authMiddleware, async (req, res) => {
  const { reportId } = req.params;

  // Verify the report belongs to this user
  const report = await VideoReport.findById(reportId).lean();
  if (!report || report.userId.toString() !== req.user.id) {
    return res.status(403).json({ error: "Access denied" });
  }

  // If already done, just return immediately
  if (report.status === "completed" || report.status === "failed") {
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ status: report.status })}\n\n`);
    return res.end();
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.set(reportId, res);

  // Send a heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(reportId);
  });
});

// Helper to push SSE event to a specific report's client
function pushProgress(reportId, data) {
  const client = sseClients.get(String(reportId));
  if (client) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

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
      return res.status(400).json({ error: `Video is too long. Maximum is 5 minutes.` });
    }

    // Create report
    const user = await User.findOne({ phone });

    // ── Mark submitted (same as WhatsApp bot) ───────────────────────────
    // completed=true + weeklySubmissions+1 at submission time (matches WhatsApp)
    // monthlySubmissions is incremented after analysis (matches WhatsApp)
    await User.findOneAndUpdate(
      { phone },
      {
        completed: true,
        $inc: { weeklySubmissions: 1 },
        ...(req.user.name ? { $set: { name: req.user.name } } : {}),
      }
    );

    const report = await VideoReport.create({
      userId,
      phone,
      videoFileName: req.file.originalname,
      videoDuration: duration,
      status: "processing",
    });

    console.log(`[VideoUpload] Report created: ${report._id}`);

    // Respond immediately — processing happens in background
    res.json({
      success: true,
      reportId: report._id,
      message: "Video uploaded. Analysis in progress…",
      estimatedTime: "2-3 minutes",
    });

    // Process in background
    processInBackground(report._id, videoPath, phone, user?.name || phone);

  } catch (err) {
    console.error("[VideoUpload] Error:", err);
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
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
      analysis:      report.status === "completed" ? report.analysis : null,
      errorMessage:  report.errorMessage,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch report" });
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

// ── Background processor ─────────────────────────────────────────────────────
async function processInBackground(reportId, videoPath, phone, displayName) {
  try {
    console.log(`[VideoAnalysis] Starting ${reportId}`);

    const result = await processWebVideo(
      videoPath,
      displayName,
      async (stage) => {
        console.log(`[VideoAnalysis] ${reportId}: ${stage}`);
        pushProgress(reportId, { status: "processing", stage });
      }
    );

    await VideoReport.findByIdAndUpdate(reportId, {
      status: "completed",
      analysis: result.analysis,
    });

    // ── Save feedback scores + monthlySubmissions after analysis ────────
    // (matches WhatsApp bot behavior exactly)
    const { fluency, grammar, confidence, vocabulary } = result.analysis;
    if (fluency != null || grammar != null) {
      await User.findOneAndUpdate(
        { phone },
        {
          $push: {
            feedbackScores: {
              $each: [{ fluency, grammar, confidence, vocabulary, date: new Date() }],
              $slice: -30,
            },
          },
          $inc: { monthlySubmissions: 1 },
        }
      );
    }

    // Push completion to SSE client
    pushProgress(reportId, { status: "completed" });
    const client = sseClients.get(String(reportId));
    if (client) { client.end(); sseClients.delete(String(reportId)); }

    console.log(`[VideoAnalysis] ${reportId} completed`);

  } catch (err) {
    console.error(`[VideoAnalysis] ${reportId} failed:`, err.message);

    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: err.message || "Analysis failed",
    });

    pushProgress(reportId, { status: "failed", error: err.message });
    const client = sseClients.get(String(reportId));
    if (client) { client.end(); sseClients.delete(String(reportId)); }

  } finally {
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  }
}

export default router;
