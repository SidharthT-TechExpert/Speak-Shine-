const mongoose = require("mongoose");

const liveSessionSchema = new mongoose.Schema({
  title:        { type: String, required: true, trim: true },
  description:  { type: String, default: "" },
  scheduledAt:  { type: Date, required: true },
  status:       { type: String, enum: ["scheduled", "live", "ended"], default: "scheduled" },
  roomName:     { type: String, unique: true, sparse: true },
  createdBy:    { type: String, required: true }, // admin phone
  participants: [{ type: String }],               // phone numbers who joined
  startedAt:    { type: Date, default: null },
  endedAt:      { type: Date, default: null },
  createdAt:    { type: Date, default: Date.now },
});

// Virtual fields
liveSessionSchema.virtual("participantCount").get(function () {
  return this.participants.length;
});
liveSessionSchema.virtual("durationMinutes").get(function () {
  if (!this.startedAt || !this.endedAt) return null;
  return Math.round((this.endedAt - this.startedAt) / 60000);
});

liveSessionSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("LiveSession", liveSessionSchema);
