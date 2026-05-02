/**
 * User Routes
 * Thin routing layer for user management endpoints
 */

import express from "express";
import * as userController from "../controllers/userController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// ── User List & Profile ──────────────────────────────────────────────────────
router.get("/", authMiddleware, requireRole("admin", "trainer", "viewer"), userController.getAllUsers);
router.get("/me", authMiddleware, userController.getMyProfile);
router.get("/:phone", authMiddleware, requireRole("admin", "trainer", "viewer"), userController.getUserByPhone);

// ── User Management (Admin) ──────────────────────────────────────────────────
router.patch("/:phone/role", authMiddleware, requireRole("admin"), userController.updateUserRole);
router.patch("/:phone/toggle", authMiddleware, requireRole("admin"), userController.toggleUserStatus);
router.patch("/:phone/toggle-submitted", authMiddleware, requireRole("admin", "trainer"), userController.toggleSubmissionStatus);
router.delete("/:phone", authMiddleware, requireRole("admin"), userController.deleteUser);
router.patch("/:phone/fine", authMiddleware, requireRole("admin"), userController.adjustUserFine);

// ── Bulk Reset Operations (Admin/Trainer) ────────────────────────────────────
router.post("/reset/weekly", authMiddleware, requireRole("admin", "trainer"), userController.resetWeeklySubmissions);
router.post("/reset/monthly", authMiddleware, requireRole("admin", "trainer"), userController.resetMonthlySubmissions);
router.post("/reset/day", authMiddleware, requireRole("admin", "trainer"), userController.resetDailySubmissions);
router.post("/reset/fines", authMiddleware, requireRole("admin"), userController.resetAllFines);

// ── Admin User Creation (OTP-protected) ──────────────────────────────────────
router.post("/admin-send-otp", authMiddleware, requireRole("admin"), userController.sendAdminOTP);
router.post("/admin-verify-otp", authMiddleware, requireRole("admin"), userController.verifyAdminOTP);
router.post("/admin-create", authMiddleware, requireRole("admin"), userController.createUserAccount);

export default router;
