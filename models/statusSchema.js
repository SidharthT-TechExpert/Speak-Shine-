import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  questionSentToday: { type: Boolean, default: false },
  notifiedEmpty: { type: Boolean, default: false },
  notifiedLast: { type: Boolean, default: false },
  fineAppliedToday: { type: Boolean, default: false },
  todayTopic: { type: String, default: null },
  todayQuestion: { type: String, default: null },
  todayPosterImage: { type: String, default: null }, // base64 PNG — cleared after 15h or midnight
  posterExpiresAt: { type: Date, default: null },    // when to auto-clear the poster
  recentCategories: { type: [String], default: [] },
}, { timestamps: true });

export default mongoose.model("Status", statusSchema);
