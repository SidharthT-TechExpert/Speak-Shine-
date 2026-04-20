import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  questionSentToday: { type: Boolean, default: false },
  notifiedEmpty: { type: Boolean, default: false },
  notifiedLast: { type: Boolean, default: false },
  fineAppliedToday: { type: Boolean, default: false },
  todayTopic: { type: String, default: null }, // today's speaking topic for AI feedback
}, { timestamps: true });

export default mongoose.model("Status", statusSchema);
