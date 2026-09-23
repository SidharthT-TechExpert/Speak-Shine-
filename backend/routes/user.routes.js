/**
 * User Routes
 * Thin routing layer for user management endpoints
 */

import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import * as userController from "../controllers/userController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

function isLocalRequest(req) {
  if (process.env.NODE_ENV !== "production") return true;
  const ip = req?.ip || req?.connection?.remoteAddress || "";
  const host = req?.headers?.host || req?.hostname || "";
  if (ip.includes("127.0.0.1") || ip === "::1" || ip.includes("::ffff:127.0.0.1")) return true;
  if (host.includes("localhost") || host.includes("127.0.0.1")) return true;
  return false;
}

const localBypass = (limiter) => (req, res, next) => {
  if (isLocalRequest(req)) return next();
  if (["admin", "admins"].includes(req.user?.role)) return next();
  return limiter(req, res, next);
};

// Hourly rate limiter for profile photo updates (5 updates per hour per user)
const avatarUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 uploads per hour per user
  keyGenerator: (req) => req.user?.id || req.user?.phone || req.ip,
  message: { error: "Hourly limit reached for profile photo updates. You can update your photo up to 5 times per hour." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isLocalRequest(req) || ["admin", "admins"].includes(req.user?.role),
});

// Configure memory storage for avatar uploads (max 5MB, images only)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
    }
  },
});

function handleAvatarUpload(req, res, next) {
  avatarUpload.single("photo")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "Profile photo is too large. Maximum size is 5MB." });
      }
      return res.status(400).json({ error: err.message || "Failed to process photo upload" });
    }
    next();
  });
}

// ── User List & Profile ──────────────────────────────────────────────────────
router.get("/", authMiddleware, requireRole("admin", "admins", "trainer", "viewer"), userController.getAllUsers);
router.get("/me", authMiddleware, userController.getMyProfile);
router.patch("/me/profile", authMiddleware, localBypass(avatarUploadLimiter), handleAvatarUpload, userController.updateMyProfile);
router.patch("/me/password", authMiddleware, userController.changeMyPassword);
router.patch("/me/phone", authMiddleware, userController.changeMyPhone);
router.patch("/me/theme", authMiddleware, userController.updateMyTheme);
router.get("/:phone", authMiddleware, requireRole("admin", "admins", "trainer", "viewer"), userController.getUserByPhone);

// ── User Management (Admin) ──────────────────────────────────────────────────
router.patch("/:phone/role", authMiddleware, requireRole("admin", "admins"), userController.updateUserRole);
router.patch("/:phone/toggle", authMiddleware, requireRole("admin", "admins"), userController.toggleUserStatus);
router.patch("/:phone/toggle-submitted", authMiddleware, requireRole("admin", "admins", "trainer"), userController.toggleSubmissionStatus);
router.delete("/:phone", authMiddleware, requireRole("admin", "admins"), userController.deleteUser);
router.patch("/:phone/fine", authMiddleware, requireRole("admin", "admins"), userController.adjustUserFine);
router.patch("/:phone/points", authMiddleware, requireRole("admin", "admins", "trainer"), userController.adjustUserPoints);
router.patch("/:phone/streak", authMiddleware, requireRole("admin", "admins", "trainer"), userController.adjustUserStreak);
router.patch("/:phone/freeze", authMiddleware, requireRole("admin", "admins", "trainer"), userController.adjustUserFreeze);

// ── Bulk Reset Operations (Admin/Trainer) ────────────────────────────────────
router.post("/reset/weekly", authMiddleware, requireRole("admin", "admins", "trainer"), userController.resetWeeklySubmissions);
router.post("/reset/monthly", authMiddleware, requireRole("admin", "admins", "trainer"), userController.resetMonthlySubmissions);
router.post("/reset/day", authMiddleware, requireRole("admin", "admins", "trainer"), userController.resetDailySubmissions);
router.post("/reset/fines", authMiddleware, requireRole("admin", "admins"), userController.resetAllFines);

// ── Admin User Creation (OTP-protected) ──────────────────────────────────────
router.post("/admin-send-otp", authMiddleware, requireRole("admin", "admins"), userController.sendAdminOTP);
router.post("/admin-verify-otp", authMiddleware, requireRole("admin", "admins"), userController.verifyAdminOTP);
router.post("/admin-create", authMiddleware, requireRole("admin", "admins"), userController.createUserAccount);

export default router;
