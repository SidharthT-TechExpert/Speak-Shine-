/**
 * Monitoring Routes
 * URL mapping for system monitoring endpoints
 */

import express from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { getMonitoring } from "../controllers/monitoringController.js";

const router = express.Router();

// GET /api/monitoring - Get system monitoring data (admin only)
router.get("/", authMiddleware, requireRole("admin"), getMonitoring);

export default router;

