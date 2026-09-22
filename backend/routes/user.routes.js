/**
 * User Routes
 * Thin routing layer for user management endpoints
 */

import express from "express";
import multer from "multer";
import * as userController from "../controllers/userController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

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
router.patch("/me/profile", authMiddleware, handleAvatarUpload, userController.updateMyProfile);
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
