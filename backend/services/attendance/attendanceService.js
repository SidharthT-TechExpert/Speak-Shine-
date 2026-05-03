/**
 * Attendance Service
 * Business logic for attendance tracking
 */

import Attendance from "../../../models/attendanceSchema.js";
import User from "../../../models/userSchema.js";
import { escapeRegex } from "../../utils/phoneUtils.js";

/**
 * Normalize date to UTC midnight for consistent day boundaries
 */
function normalizeToUTCMidnight(dateInput) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Find user by phone number (handles variations with/without country code)
 */
async function findUserByPhone(phone) {
  const stripped = phone.replace(/^91/, "");
  
  // Try phone field first
  let user = await User.findOne({ phone: { $in: [phone, stripped] } });
  if (user) return user;
  
  // Fallback: userId contains the phone digits
  user = await User.findOne({ userId: { $regex: escapeRegex(stripped) } });
  return user || null;
}

/**
 * Mark single attendance entry
 */
export async function markAttendance(studentPhone, date, activityType = "daily_video", status, markedBy) {
  // Validate required fields
  if (!studentPhone || !date || !status) {
    throw new Error("Missing required fields: studentPhone, date, and status are required");
  }
  
  // Validate status enum
  if (!["present", "absent"].includes(status)) {
    throw new Error("Invalid status. Must be 'present' or 'absent'");
  }
  
  // Validate date format
  const normalizedDate = normalizeToUTCMidnight(date);
  if (isNaN(normalizedDate.getTime())) {
    throw new Error("Invalid date format. Use YYYY-MM-DD");
  }
  
  // Verify student exists
  const student = await findUserByPhone(studentPhone);
  if (!student) {
    const error = new Error("Student not found");
    error.statusCode = 404;
    error.phone = studentPhone;
    throw error;
  }
  
  // Upsert attendance record
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
  
  return { success: true, record };
}

/**
 * Bulk attendance marking
 */
export async function markBulkAttendance(entries, markedBy) {
  // Validate request
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    throw new Error("Request body must contain 'entries' array with at least one entry");
  }
  
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
  
  return { created, updated, failed, errors };
}

/**
 * Get student attendance history
 */
export async function getStudentAttendance(phone, startDate, endDate) {
  // Verify student exists
  const student = await findUserByPhone(phone);
  if (!student) {
    const error = new Error("Student not found");
    error.statusCode = 404;
    error.phone = phone;
    throw error;
  }
  
  // Build query filter
  const filter = { studentPhone: student.phone };
  
  // Add date range filters if provided
  if (startDate || endDate) {
    filter.date = {};
    
    if (startDate) {
      const start = normalizeToUTCMidnight(startDate);
      if (isNaN(start.getTime())) {
        throw new Error("Invalid startDate format. Use YYYY-MM-DD");
      }
      filter.date.$gte = start;
    }
    
    if (endDate) {
      const end = normalizeToUTCMidnight(endDate);
      if (isNaN(end.getTime())) {
        throw new Error("Invalid endDate format. Use YYYY-MM-DD");
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
  
  return {
    phone: student.phone,
    name: student.name,
    records
  };
}

/**
 * Get all attendance for a specific date
 */
export async function getAttendanceByDate(date) {
  // Validate and normalize date
  const normalizedDate = normalizeToUTCMidnight(date);
  if (isNaN(normalizedDate.getTime())) {
    throw new Error("Invalid date format. Use YYYY-MM-DD");
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
  
  return {
    date: normalizedDate,
    records: enrichedRecords
  };
}
