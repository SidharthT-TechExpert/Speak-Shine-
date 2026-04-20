import mongoose from "mongoose";

const userStatsSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  groupId: { type: String, required: true },
  totalCorrections: { type: Number, default: 0 },
  grammarScore: { type: Number, default: 0 },
  streakDays: { type: Number, default: 0 },
  lastCorrectionDate: { type: Date },
  commonMistakes: [{ type: String }],
  lastMessageTime: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

userStatsSchema.index({ userId: 1, groupId: 1 }, { unique: true });

export default mongoose.model("UserStats", userStatsSchema);
