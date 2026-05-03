/**
 * Video Routes
 * Thin routing layer for video endpoints
 */

import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import * as videoController from "../controllers/videoController.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Rate limit: 5 actual submissions per hour per user ID
// Applied only to /confirm and /upload — not /presign (URL generation doesn't count)
const videoUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Upload limit reached. You can upload up to 5 videos per hour." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id || "anon"),
});

const router = express.Router();

// Configure multer for video uploads (max 110MB)
const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 110 * 1024 * 1024 },
});

// Multer error handler middleware
function handleMulterError(err, req, res, next) {
  if (err) {
    console.error("[VideoUpload] Multer error:", err.message);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ 
        error: "File too large. Maximum size is 100MB. Please compress your video." 
      });
    }
    return res.status(400).json({ error: err.message || "File upload failed" });
  }
  next();
}

// ── Presigned Upload Routes ──────────────────────────────────────────────────
// /presign just generates a URL — doesn't count against upload limit
router.get("/presign", authMiddleware, videoController.getPresignedUrl);
// /confirm is the real submission — apply rate limit here
router.post("/confirm", authMiddleware, videoUploadLimiter, videoController.confirmUpload);

// ── Direct Upload Route ──────────────────────────────────────────────────────
router.post(
  "/upload",
  authMiddleware,
  videoUploadLimiter,
  (req, res, next) => upload.single("video")(req, res, (err) => handleMulterError(err, req, res, next)),
  videoController.uploadVideo
);

// ── Progress Stream ──────────────────────────────────────────────────────────
router.get("/progress/:reportId", authMiddleware, videoController.getProgress);

// ── Report Management ────────────────────────────────────────────────────────
router.get("/report/:reportId", authMiddleware, videoController.getReport);
router.get("/my-reports", authMiddleware, videoController.getMyReports);
router.delete("/report/:reportId", authMiddleware, videoController.deleteReport);
router.post("/retry/:reportId", authMiddleware, videoController.retryAnalysis);

// ── Community Feed ───────────────────────────────────────────────────────────
router.get("/community-feed", authMiddleware, videoController.getCommunityFeed);
router.patch("/report/:reportId/visibility", authMiddleware, videoController.toggleVisibility);

// ── Community Engagement ─────────────────────────────────────────────────────
router.post("/react/:reportId",                    authMiddleware, videoController.reactToVideo);
router.post("/comment/:reportId",                  authMiddleware, videoController.addComment);
router.delete("/comment/:reportId/:commentId",     authMiddleware, videoController.deleteComment);

export default router;
