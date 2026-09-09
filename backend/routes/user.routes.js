/**
 * User Routes
 * Thin routing layer for user management endpoints
 */

import express from "express";
import * as userController from "../controllers/userController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// ── User List & Profile ──────────────────────────────────────────────────────
router.get("/", authMiddleware, requireRole("admin", "admins", "trainer", "viewer"), userController.getAllUsers);
router.get("/me", authMiddleware, userController.getMyProfile);
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
