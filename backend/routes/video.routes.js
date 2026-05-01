/**
 * Video Routes
 * Thin routing layer for video endpoints
 */

import express from "express";
import multer from "multer";
import * as videoController from "../controllers/videoController.js";
import { authMiddleware } from "../middleware/auth.js";

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
router.get("/presign", authMiddleware, videoController.getPresignedUrl);
router.post("/confirm", authMiddleware, videoController.confirmUpload);

// ── Direct Upload Route ──────────────────────────────────────────────────────
router.post(
  "/upload",
  authMiddleware,
  (req, res, next) => upload.single("video")(req, res, (err) => handleMulterError(err, req, res, next)),
  videoController.uploadVideo
);

// ── Progress Stream ──────────────────────────────────────────────────────────
router.get("/progress/:reportId", authMiddleware, videoController.getProgress);

// ── Report Management ────────────────────────────────────────────────────────
router.get("/report/:reportId", authMiddleware, videoController.getReport);
router.get("/my-reports", authMiddleware, videoController.getMyReports);
router.delete("/report/:reportId", authMiddleware, videoController.deleteReport);

// ── Community Feed ───────────────────────────────────────────────────────────
router.get("/community-feed", authMiddleware, videoController.getCommunityFeed);
router.patch("/report/:reportId/visibility", authMiddleware, videoController.toggleVisibility);

export default router;
