/**
 * Submissions Routes
 * Handles submission-related operations for admin dashboard
 */

import express from "express";
import * as submissionsController from "../controllers/submissionsController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// ── Submission Management ────────────────────────────────────────────────────
router.patch("/:phone/monthly", authMiddleware, requireRole("admin", "trainer"), submissionsController.adjustMonthlySubmissions);
router.patch("/:phone/weekly", authMiddleware, requireRole("admin", "trainer"), submissionsController.adjustWeeklySubmissions);
router.patch("/:phone/daily", authMiddleware, requireRole("admin", "trainer"), submissionsController.adjustDailySubmissions);

export default router;