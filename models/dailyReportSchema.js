import mongoose from "mongoose";

const dailyReportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  phone: { type: String, required: true, index: true },
  date: { type: Date, required: true, index: true }, // Date of the report (midnight)
  
  // Submission status
  submitted: { type: Boolean, default: false },
  submittedAt: { type: Date, default: null },
  
  // Scores from yesterday's video
  fluency: { type: Number, default: null },
  grammar: { type: Number, default: null },
  confidence: { type: Number, default: null },
  vocabulary: { type: Number, default: null },
  
  // Visual scores
  eyeContact: { type: Number, default: null },
  bodyLanguage: { type: Number, default: null },
  facialExpression: { type: Number, default: null },
  
  // Stats
  streak: { type: Number, default: 0 },
  weeklySubmissions: { type: Number, default: 0 },
  monthlySubmissions: { type: Number, default: 0 },
  
  // Overall feedback
  overallComment: { type: String, default: null },
  strongPoints: { type: [String], default: [] },
  suggestions: { type: [String], default: [] },
  
  // Report expires at 8 AM
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

// Compound index for efficient queries
dailyReportSchema.index({ userId: 1, date: -1 });
dailyReportSchema.index({ expiresAt: 1 }); // For cleanup

export default mongoose.model("DailyReport", dailyReportSchema);
