import mongoose from "mongoose";

/**
 * Stores extracted video frames temporarily in MongoDB.
 * TTL index auto-deletes documents after 1 hour.
 * This keeps frame data out of Node.js heap memory.
 */
const frameCacheSchema = new mongoose.Schema({
  videoId: { type: String, required: true, index: true }, // unique ID per video (timestamp-based)
  frameIndex: { type: Number, required: true },           // 0-based frame order
  timestamp: { type: Number, required: true },            // seconds into video
  base64: { type: String, required: true },               // JPEG frame as base64
  createdAt: { type: Date, default: Date.now, expires: 3600 }, // TTL: 1 hour
});

frameCacheSchema.index({ videoId: 1, frameIndex: 1 });

export default mongoose.model("FrameCache", frameCacheSchema);
