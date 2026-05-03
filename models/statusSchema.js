import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  questionSentToday: { type: Boolean, default: false },
  notifiedEmpty: { type: Boolean, default: false },
  notifiedLast: { type: Boolean, default: false },
  fineAppliedToday: { type: Boolean, default: false },
  todayTopic: { type: String, default: null },
  todayQuestion: { type: String, default: null },
  todayCategory: { type: String, default: null },
  todayPosterImage: { type: String, default: null },
  posterExpiresAt: { type: Date, default: null },
  recentCategories: { type: [String], default: [] },
  // Monthly reflection
  isMonthlyReflectionDay: { type: Boolean, default: false },
  isMonthlyGoalsDay: { type: Boolean, default: false },
  isWeeklyReflectionDay: { type: Boolean, default: false },
  // Daily report tracking
  dailyReportGenerated: { type: Boolean, default: false },
  reportExpiresAt: { type: Date, default: null },
  // Configurable schedule times (HH:MM, 24h, IST)
  posterSendTime: { type: String, default: "08:00" },
  questionGenerateTime: { type: String, default: "07:00" },
  // Track last successful daily reset (YYYY-MM-DD in IST) to detect missed resets
  lastResetDate: { type: String, default: null },
}, { timestamps: true });

export default mongoose.model("Status", statusSchema);
