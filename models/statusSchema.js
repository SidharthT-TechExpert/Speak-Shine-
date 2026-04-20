import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  questionSentToday: { type: Boolean, default: false },
  notifiedEmpty: { type: Boolean, default: false },
  notifiedLast: { type: Boolean, default: false },
  fineAppliedToday: { type: Boolean, default: false },
  todayTopic: { type: String, default: null },    // topic (broad subject)
  todayQuestion: { type: String, default: null }, // actual question asked to members
}, { timestamps: true });

export default mongoose.model("Status", statusSchema);
