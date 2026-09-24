/**
 * Dashboard Routes
 * URL mapping for dashboard endpoints
 */

import express from "express";
import * as dashboardController from "../controllers/dashboardController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Public authenticated routes (all roles)
router.get("/", authMiddleware, dashboardController.getTodayOverview);
router.get("/me", authMiddleware, dashboardController.getUserProfile);
router.get("/scores/:phone", authMiddleware, dashboardController.getUserScores);
router.get("/prize-info", authMiddleware, dashboardController.getPrizeInfo);

// Admin/Trainer routes — viewer can read these too
router.get("/report/weekly", authMiddleware, requireRole("admin", "admins", "trainer", "viewer"), dashboardController.getWeeklyReport);
router.get("/report/monthly", authMiddleware, requireRole("admin", "admins", "trainer", "viewer"), dashboardController.getMonthlyReport);

// Admin-only routes
router.patch("/today-question", authMiddleware, requireRole("admin", "admins"), dashboardController.setTodayQuestion);
router.get("/settings", authMiddleware, requireRole("admin", "admins"), dashboardController.getSettings);
router.patch("/settings", authMiddleware, requireRole("admin", "admins"), dashboardController.updateSettings);
router.get("/debug-report", authMiddleware, requireRole("admin", "admins"), dashboardController.getDebugReport);
router.post("/generate-report-now", authMiddleware, requireRole("admin", "admins"), dashboardController.generateReportNow);
router.post("/demo-monthly-reflection", authMiddleware, requireRole("admin", "admins"), dashboardController.enableMonthlyReflection);
router.post("/demo-monthly-goals", authMiddleware, requireRole("admin", "admins"), dashboardController.enableMonthlyGoals);
router.post("/demo-monthly-reflection-off", authMiddleware, requireRole("admin", "admins"), dashboardController.disableSpecialModes);
router.post("/demo-story-summary", authMiddleware, requireRole("admin", "admins"), dashboardController.enableStorySummaryDemo);

export default router;
