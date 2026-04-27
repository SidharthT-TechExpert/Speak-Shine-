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
  // Configurable schedule times (HH:MM, 24h, IST)
  posterSendTime: { type: String, default: "08:00" },
  questionGenerateTime: { type: String, default: "07:00" },
}, { timestamps: true });

export default mongoose.model("Status", statusSchema);
