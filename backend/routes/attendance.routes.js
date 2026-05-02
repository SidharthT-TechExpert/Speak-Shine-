/**
 * Attendance Routes
 * URL mapping for attendance endpoints
 */

import express from "express";
import * as attendanceController from "../controllers/attendanceController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// All attendance routes require trainer or admin role — viewer can read
router.post("/mark", authMiddleware, requireRole("trainer", "admin"), attendanceController.markAttendance);
router.post("/bulk", authMiddleware, requireRole("trainer", "admin"), attendanceController.markBulkAttendance);
router.get("/:phone", authMiddleware, requireRole("trainer", "admin", "viewer"), attendanceController.getStudentAttendance);
router.get("/date/:date", authMiddleware, requireRole("trainer", "admin", "viewer"), attendanceController.getAttendanceByDate);

export default router;
