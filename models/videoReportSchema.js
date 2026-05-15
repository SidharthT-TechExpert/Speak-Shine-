import mongoose from "mongoose";

/**
 * Temporary video analysis reports — auto-deleted after 18 hours.
 * Users can submit videos via the website and view their analysis report.
 * Reports are NOT permanently stored — only cached for quick review.
 */
const videoReportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  phone: { type: String, required: true },
  
  // Video metadata
  videoFileName: { type: String },
  videoDuration: { type: Number }, // seconds
  submittedAt: { type: Date, default: Date.now },
  
  // Analysis results (same structure as WhatsApp feedback)
  analysis: {
    // Speech scores
    fluency: { type: Number, min: 0, max: 10 },
    grammar: { type: Number, min: 0, max: 10 },
    confidence: { type: Number, min: 0, max: 10 },
    vocabulary: { type: Number, min: 0, max: 10 },
    topicRelevance: { type: Number, min: 0, max: 10 },
    
    // Visual scores
    eyeContact: { type: Number, min: 0, max: 10 },
    bodyLanguage: { type: Number, min: 0, max: 10 },
    facialExpression: { type: Number, min: 0, max: 10 },
    overallPresence: { type: Number, min: 0, max: 10 },
    
    // Detailed feedback
    transcription: { type: String },
    overallComment: { type: String },
    strongPoints: [String],
    suggestions: [String],
    grammarErrors: [{
      original: String,
      correction: String,
      rule: String,
    }],
    vocabularyHighlights: {
      strong: [String],
      weak: [String],
    },
    
    // Visual observations
    eyeContactNote: String,
    bodyLanguageNote: String,
    expressionNote: String,
    visualSuggestions: [String],
    visualStrengths: [String],
    
    // Stats
    stats: {
      duration: String,
      wpm: Number,
      fillerWords: mongoose.Schema.Types.Mixed,
      fillerTotal: Number,
      pauses: Number,
      cefrLevel: {
        level: String,
        description: String,
      },
      rhythm: {
        speechRatio: Number,
        rushesAtStart: Boolean,
        rushesAtEnd: Boolean,
        paceConsistency: Number,
      },
    },
    
    pronunciationNote: String,
    rhythmNote: String,
    topicFeedback: String,
    qualityWarning: String,
  },
  
  // Processing status
  status: {
    type: String,
    enum: ["processing", "completed", "failed"],
    default: "processing",
  },
  errorMessage: String,
  retryCount: { type: Number, default: 0 }, // how many times recovery has been attempted

  // R2 video storage
  videoUrl:   { type: String, default: null },  // public CDN URL
  videoKey:   { type: String, default: null },  // R2 object key (for deletion)
  frameKeys:  { type: [String], default: [] },  // R2 keys for browser-extracted frames (deleted after 24h)
  isPublic:   { type: Boolean, default: false }, // user opted in to community feed
  uploaderName: { type: String, default: null }, // display name for community feed

  // ── Community engagement ──────────────────────────────────────────────────
  likes:    [{ type: String }], // array of phone numbers who liked
  dislikes: [{ type: String }], // array of phone numbers who disliked
  comments: [{
    _id:       { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    phone:     { type: String, required: true },
    name:      { type: String, required: true },
    role:      { type: String, default: "user" },
    text:      { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  }],

  // Auto-delete after 18 hours
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 18 * 60 * 60 * 1000),
  },
});

// Indexes
videoReportSchema.index({ userId: 1, submittedAt: -1 });
videoReportSchema.index({ phone: 1, submittedAt: -1 });
videoReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export default mongoose.model("VideoReport", videoReportSchema);
