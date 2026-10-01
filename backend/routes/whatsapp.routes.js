/**
 * backend/routes/whatsapp.routes.js
 */

import express from "express";
import {
  getWhatsAppStatus,
  sendPoster,
  sendSubmissionReport,
  sendSlotReport,
  sendTestAdminAlert,
  sendCustomGroupMessage,
  getGroups,
  reconnectWhatsApp,
  logoutWhatsApp,
  getMonthEndPrizeSummary,
  sendMonthEndPrizeReport,
  saveMonthEndSettings,
} from "../controllers/whatsappController.js";
import { authMiddleware, optionalAuthMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Admin only routes
router.get("/status", optionalAuthMiddleware, getWhatsAppStatus);
router.get("/groups", authMiddleware, requireRole("admin", "admins"), getGroups);
router.get("/month-end-summary", authMiddleware, requireRole("admin", "admins"), getMonthEndPrizeSummary);
router.post("/send-poster", authMiddleware, requireRole("admin", "admins"), sendPoster);
router.post("/send-submission-report", authMiddleware, requireRole("admin", "admins"), sendSubmissionReport);
router.post("/send-slot-report", authMiddleware, requireRole("admin", "admins"), sendSlotReport);
router.post("/send-custom-message", authMiddleware, requireRole("admin", "admins"), sendCustomGroupMessage);
router.post("/send-month-end-report", authMiddleware, requireRole("admin", "admins"), sendMonthEndPrizeReport);
router.post("/save-month-end-settings", authMiddleware, requireRole("admin", "admins"), saveMonthEndSettings);
router.post("/send-test-admin-alert", authMiddleware, requireRole("admin", "admins"), sendTestAdminAlert);
router.post("/reconnect", authMiddleware, requireRole("admin", "admins"), reconnectWhatsApp);
router.post("/logout", authMiddleware, requireRole("admin", "admins"), logoutWhatsApp);

export default router;
