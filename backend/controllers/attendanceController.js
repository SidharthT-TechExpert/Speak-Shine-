/**
 * Attendance Controller
 * HTTP request handlers for attendance endpoints
 */

import * as attendanceService from "../services/attendance/attendanceService.js";

/**
 * POST /api/attendance/mark - Mark single attendance entry
 */
export async function markAttendance(req, res) {
  try {
    const { studentPhone, date, activityType = "daily_video", status } = req.body;
    const markedBy = req.user.phone;
    
    const result = await attendanceService.markAttendance(
      studentPhone, 
      date, 
      activityType, 
      status, 
      markedBy
    );
    
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ 
        error: error.message,
        phone: error.phone
      });
    }
    console.error("[Attendance] Mark error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/attendance/bulk - Bulk attendance marking
 */
export async function markBulkAttendance(req, res) {
  try {
    const { entries } = req.body;
    const markedBy = req.user.phone;
    
    const result = await attendanceService.markBulkAttendance(entries, markedBy);
    res.json(result);
  } catch (error) {
    console.error("[Attendance] Bulk mark error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/attendance/:phone - Get student attendance history
 */
export async function getStudentAttendance(req, res) {
  try {
    const { phone } = req.params;
    const { startDate, endDate } = req.query;
    
    const result = await attendanceService.getStudentAttendance(phone, startDate, endDate);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ 
        error: error.message,
        phone: error.phone
      });
    }
    console.error("[Attendance] Get by phone error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/attendance/date/:date - Get all attendance for a specific date
 */
export async function getAttendanceByDate(req, res) {
  try {
    const { date } = req.params;
    const result = await attendanceService.getAttendanceByDate(date);
    res.json(result);
  } catch (error) {
    console.error("[Attendance] Get by date error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
