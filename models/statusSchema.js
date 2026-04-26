import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  questionSentToday: { type: Boolean, default: false },
  notifiedEmpty: { type: Boolean, default: false },
  notifiedLast: { type: Boolean, default: false },
  fineAppliedToday: { type: Boolean, default: false },
  todayTopic: { type: String, default: null },
  todayQuestion: { type: String, default: null },
  todayPosterImage: { type: String, default: null }, // base64 PNG of today's question poster
  recentCategories: { type: [String], default: [] },
}, { timestamps: true });

export default mongoose.model("Status", statusSchema);
