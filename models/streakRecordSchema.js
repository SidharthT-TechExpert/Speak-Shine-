import mongoose from "mongoose";

/**
 * All-time streak record — "Hall of Fame"
 * Only one document ever exists. Updated when someone beats the record.
 */
const streakRecordSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  userId:    { type: String, default: null },
  streak:    { type: Number, required: true },
  achievedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model("StreakRecord", streakRecordSchema);
