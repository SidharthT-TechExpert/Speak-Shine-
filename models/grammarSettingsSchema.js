import mongoose from "mongoose";

const grammarSettingsSchema = new mongoose.Schema({
  groupId: { type: String, required: true, unique: true },
  grammarEnabled: { type: Boolean, default: true },
  tenseEnabled: { type: Boolean, default: true },
  vocabEnabled: { type: Boolean, default: true },
  cooldownMinutes: { type: Number, default: 2 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("GrammarSettings", grammarSettingsSchema);
