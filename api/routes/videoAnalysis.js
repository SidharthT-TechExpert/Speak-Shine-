import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import VideoReport from "../../models/videoReportSchema.js";
import User from "../../models/userSchema.js";
import { processWebVideo } from "../../ai/webVideoProcessor.js";
import { exec } from "child_process";

const router = express.Router();

// Configure multer for video uploads (max 100MB)
const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed (MP4, MOV, AVI, WEBM)"));
    }
  },
});

/**
 * POST /api/video/upload
 * Upload a video for analysis (web-based submission)
 * Returns a report ID that can be used to check status
 */
router.post("/upload", authMiddleware, upload.single("video"), async (req, res) => {
  let videoPath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No video file uploaded" });
    }

    videoPath = req.file.path;
    const userId = req.user.id; // from JWT token
    const phone = req.user.phone;

    // Get video duration
    const duration = await getVideoDuration(videoPath);
    
    if (duration < 30) {
      fs.unlinkSync(videoPath);
      return res.status(400).json({ error: "Video must be at least 30 seconds long" });
    }

    if (duration > 300) {
      fs.unlinkSync(videoPath);
      return res.status(400).json({ error: "Video must be less than 5 minutes long" });
    }

    // Create a pending report entry
    const report = await VideoReport.create({
      userId,
      phone,
      videoFileName: req.file.originalname,
      videoDuration: duration,
      status: "processing",
    });

    // Start processing in background (don't await)
    processVideoInBackground(report._id, videoPath, duration, userId, phone);

    res.json({
      success: true,
      reportId: report._id,
      message: "Video uploaded successfully. Analysis in progress...",
      estimatedTime: "2-3 minutes",
    });

  } catch (err) {
    console.error("Video upload error:", err);
    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    res.status(500).json({ error: err.message || "Failed to upload video" });
  }
});

/**
 * GET /api/video/report/:reportId
 * Get the analysis report for a specific video submission
 */
router.get("/report/:reportId", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    
    if (!report) {
      return res.status(404).json({ error: "Report not found or expired" });
    }

    // Verify ownership
    if (report.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({
      reportId: report._id,
      status: report.status,
      submittedAt: report.submittedAt,
      expiresAt: report.expiresAt,
      videoFileName: report.videoFileName,
      videoDuration: report.videoDuration,
      analysis: report.status === "completed" ? report.analysis : null,
      errorMessage: report.errorMessage,
    });

  } catch (err) {
    console.error("Get report error:", err);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

/**
 * GET /api/video/my-reports
 * Get all active reports for the current user (not expired)
 */
router.get("/my-reports", authMiddleware, async (req, res) => {
  try {
    const reports = await VideoReport.find({
      userId: req.user.id,
      expiresAt: { $gt: new Date() }, // Only non-expired reports
    })
      .sort({ submittedAt: -1 })
      .limit(10)
      .select("-analysis.transcription"); // Exclude full transcription for list view

    res.json({ reports });

  } catch (err) {
    console.error("Get reports error:", err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

/**
 * DELETE /api/video/report/:reportId
 * Delete a report before it expires (optional — reports auto-delete after 12h)
 */
router.delete("/report/:reportId", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    // Verify ownership
    if (report.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    await VideoReport.deleteOne({ _id: req.params.reportId });
    res.json({ success: true, message: "Report deleted" });

  } catch (err) {
    console.error("Delete report error:", err);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get video duration using ffprobe
 */
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      (err, stdout) => {
        if (err) return reject(new Error("Failed to read video metadata"));
        const dur = parseFloat((stdout || "").trim());
        if (isNaN(dur) || dur <= 0) return reject(new Error("Invalid video duration"));
        resolve(Math.round(dur));
      }
    );
  });
}

/**
 * Process video in background using the web video processor
 */
async function processVideoInBackground(reportId, videoPath, duration, userId, phone) {
  try {
    console.log(`[VideoAnalysis] Processing report ${reportId} for user ${phone}`);

    // Get user's display name
    const user = await User.findOne({ phone });
    const displayName = user?.name || phone;

    // Process the video using the web processor
    const result = await processWebVideo(
      videoPath,
      userId,
      phone,
      displayName,
      async (stage) => {
        console.log(`[VideoAnalysis] ${reportId}: ${stage}`);
      }
    );

    // Update the report with results
    await VideoReport.findByIdAndUpdate(reportId, {
      status: "completed",
      analysis: result.analysis,
    });

    console.log(`[VideoAnalysis] Report ${reportId} completed successfully`);

  } catch (err) {
    console.error(`[VideoAnalysis] Report ${reportId} failed:`, err);
    
    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: err.message || "Analysis failed",
    });

  } finally {
    // Clean up video file
    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  }
}

export default router;
