import mongoose from "mongoose";

/**
 * Attendance tracking for students.
 * Stores per-student, per-day attendance records with activity type.
 * Trainers and admins can mark students as present or absent.
 */
const attendanceSchema = new mongoose.Schema({
  studentPhone: { type: String, required: true, index: true },
  date: { type: Date, required: true, index: true }, // UTC midnight
  activityType: { type: String, required: true, default: "daily_video" },
  status: { type: String, enum: ["present", "absent"], required: true },
  markedBy: { type: String, required: true }, // trainer/admin phone
  markedAt: { type: Date, default: Date.now },
});

// Compound unique index: prevents duplicate attendance records for same student, date, and activity
attendanceSchema.index({ studentPhone: 1, date: 1, activityType: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema);
