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

// Admin/Trainer routes — viewer can read these too
router.get("/report/weekly", authMiddleware, requireRole("admin", "trainer", "viewer"), dashboardController.getWeeklyReport);
router.get("/report/monthly", authMiddleware, requireRole("admin", "trainer", "viewer"), dashboardController.getMonthlyReport);

// Admin-only routes
router.patch("/today-question", authMiddleware, requireRole("admin"), dashboardController.setTodayQuestion);
router.get("/settings", authMiddleware, requireRole("admin"), dashboardController.getSettings);
router.patch("/settings", authMiddleware, requireRole("admin"), dashboardController.updateSettings);
router.get("/debug-report", authMiddleware, requireRole("admin"), dashboardController.getDebugReport);
router.post("/generate-report-now", authMiddleware, requireRole("admin"), dashboardController.generateReportNow);
router.post("/demo-monthly-reflection", authMiddleware, requireRole("admin"), dashboardController.enableMonthlyReflection);
router.post("/demo-monthly-goals", authMiddleware, requireRole("admin"), dashboardController.enableMonthlyGoals);
router.post("/demo-weekly-reflection", authMiddleware, requireRole("admin"), dashboardController.enableWeeklyReflection);
router.post("/demo-monthly-reflection-off", authMiddleware, requireRole("admin"), dashboardController.disableSpecialModes);

export default router;
