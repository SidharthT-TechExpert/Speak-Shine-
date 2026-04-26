import express from "express";
import Attendance from "../../models/attendanceSchema.js";
import User from "../../models/userSchema.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * Normalize date to UTC midnight for consistent day boundaries.
 * Accepts date string in YYYY-MM-DD format or Date object.
 */
function normalizeToUTCMidnight(dateInput) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Find user by phone number (handles variations with/without country code).
 * Matches against User.phone field or User.userId regex.
 */
async function findUserByPhone(phone) {
  const stripped = phone.replace(/^91/, ""); // remove country code if present
  
  // Try phone field first (exact or without country code)
  let user = await User.findOne({ phone: { $in: [phone, stripped] } });
  if (user) return user;
  
  // Fallback: userId contains the phone digits
  user = await User.findOne({ userId: { $regex: stripped } });
  return user || null;
}

// POST /api/attendance/mark — single attendance entry
router.post("/mark", authMiddleware, requireRole("trainer", "admin"), async (req, res) => {
  try {
    const { studentPhone, date, activityType = "daily_video", status } = req.body;
    
    // Validate required fields
    if (!studentPhone || !date || !status) {
      return res.status(400).json({ 
        error: "Missing required fields: studentPhone, date, and status are required" 
      });
    }
    
    // Validate status enum
    if (!["present", "absent"].includes(status)) {
      return res.status(400).json({ 
        error: "Invalid status. Must be 'present' or 'absent'" 
      });
    }
    
    // Validate date format
    const normalizedDate = normalizeToUTCMidnight(date);
    if (isNaN(normalizedDate.getTime())) {
      return res.status(400).json({ 
        error: "Invalid date format. Use YYYY-MM-DD" 
      });
    }
    
    // Verify student exists
    const student = await findUserByPhone(studentPhone);
    if (!student) {
      return res.status(404).json({ 
        error: "Student not found",
        phone: studentPhone
      });
    }
    
    // Get marker's phone from JWT token
    const markedBy = req.user.phone;
    
    // Upsert attendance record (create or update)
    const record = await Attendance.findOneAndUpdate(
      { 
        studentPhone, 
        date: normalizedDate, 
        activityType 
      },
      { 
        status, 
        markedBy,
        markedAt: new Date()
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );
    
    res.json({ 
      success: true, 
      record 
    });
    
  } catch (err) {
    console.error("[Attendance] Mark error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/bulk — bulk attendance marking
router.post("/bulk", authMiddleware, requireRole("trainer", "admin"), async (req, res) => {
  try {
    const { entries } = req.body;
    
    // Validate request body
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ 
        error: "Request body must contain 'entries' array with at least one entry" 
      });
    }
    
    // Get marker's phone from JWT token
    const markedBy = req.user.phone;
    
    // Track results
    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];
    
    // Process each entry independently
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      
      try {
        const { studentPhone, date, activityType = "daily_video", status } = entry;
        
        // Validate required fields
        if (!studentPhone || !date || !status) {
          failed++;
          errors.push({
            index: i,
            entry,
            error: "Missing required fields: studentPhone, date, and status are required"
          });
          continue;
        }
        
        // Validate status enum
        if (!["present", "absent"].includes(status)) {
          failed++;
          errors.push({
            index: i,
            entry,
            error: "Invalid status. Must be 'present' or 'absent'"
          });
          continue;
        }
        
        // Validate date format
        const normalizedDate = normalizeToUTCMidnight(date);
        if (isNaN(normalizedDate.getTime())) {
          failed++;
          errors.push({
            index: i,
            entry,
            error: "Invalid date format. Use YYYY-MM-DD"
          });
          continue;
        }
        
        // Verify student exists
        const student = await findUserByPhone(studentPhone);
        if (!student) {
          failed++;
          errors.push({
            index: i,
            entry,
            error: "Student not found",
            phone: studentPhone
          });
          continue;
        }
        
        // Check if record already exists
        const existingRecord = await Attendance.findOne({
          studentPhone,
          date: normalizedDate,
          activityType
        });
        
        // Upsert attendance record
        await Attendance.findOneAndUpdate(
          { 
            studentPhone, 
            date: normalizedDate, 
            activityType 
          },
          { 
            status, 
            markedBy,
            markedAt: new Date()
          },
          { 
            upsert: true, 
            new: true,
            setDefaultsOnInsert: true
          }
        );
        
        // Track whether this was a create or update
        if (existingRecord) {
          updated++;
        } else {
          created++;
        }
        
      } catch (err) {
        failed++;
        errors.push({
          index: i,
          entry,
          error: err.message
        });
      }
    }
    
    res.json({ 
      created, 
      updated, 
      failed, 
      errors 
    });
    
  } catch (err) {
    console.error("[Attendance] Bulk mark error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/:phone — student attendance history
router.get("/:phone", authMiddleware, requireRole("trainer", "admin"), async (req, res) => {
  try {
    const { phone } = req.params;
    const { startDate, endDate } = req.query;
    
    // Verify student exists
    const student = await findUserByPhone(phone);
    if (!student) {
      return res.status(404).json({ 
        error: "Student not found",
        phone 
      });
    }
    
    // Build query filter
    const filter = { studentPhone: student.phone };
    
    // Add date range filters if provided
    if (startDate || endDate) {
      filter.date = {};
      
      if (startDate) {
        const start = normalizeToUTCMidnight(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({ 
            error: "Invalid startDate format. Use YYYY-MM-DD" 
          });
        }
        filter.date.$gte = start;
      }
      
      if (endDate) {
        const end = normalizeToUTCMidnight(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({ 
            error: "Invalid endDate format. Use YYYY-MM-DD" 
          });
        }
        // Include the entire end date by adding 1 day
        filter.date.$lt = new Date(end.getTime() + 24 * 60 * 60 * 1000);
      }
    }
    
    // Query attendance records sorted by date descending
    const records = await Attendance.find(filter)
      .sort({ date: -1 })
      .select("date activityType status markedBy markedAt")
      .lean();
    
    res.json({ 
      phone: student.phone,
      name: student.name,
      records 
    });
    
  } catch (err) {
    console.error("[Attendance] Get by phone error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/date/:date — all attendance for a specific date
router.get("/date/:date", authMiddleware, requireRole("trainer", "admin"), async (req, res) => {
  try {
    const { date } = req.params;
    
    // Validate and normalize date
    const normalizedDate = normalizeToUTCMidnight(date);
    if (isNaN(normalizedDate.getTime())) {
      return res.status(400).json({ 
        error: "Invalid date format. Use YYYY-MM-DD" 
      });
    }
    
    // Query all attendance records for this date
    const records = await Attendance.find({ date: normalizedDate })
      .select("studentPhone status activityType markedBy markedAt")
      .lean();
    
    // Enrich with student names
    const enrichedRecords = await Promise.all(
      records.map(async (record) => {
        const student = await findUserByPhone(record.studentPhone);
        return {
          studentPhone: record.studentPhone,
          studentName: student ? student.name : "Unknown",
          status: record.status,
          activityType: record.activityType,
          markedBy: record.markedBy,
          markedAt: record.markedAt
        };
      })
    );
    
    res.json({ 
      date: normalizedDate,
      records: enrichedRecords 
    });
    
  } catch (err) {
    console.error("[Attendance] Get by date error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
