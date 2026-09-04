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
  challengeType: { type: String, default: null },
  
  // Analysis results (same structure as WhatsApp feedback)
  analysis: {
    // Speech scores
    fluency: { type: Number, min: 0, max: 10 },
    grammar: { type: Number, min: 0, max: 10 },
    confidence: { type: Number, min: 0, max: 10 },
    vocabulary: { type: Number, min: 0, max: 10 },
    coherence: { type: Number, min: 0, max: 10 },
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
      wordCount: Number,
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
    
    // Vocabulary challenge
    vocabularyScore: { type: Number, min: 0, max: 10, default: null }, // out of 10
    vocabularyUsed:  { type: [String], default: [] }, // which of today's 5 words were used correctly
    challengeType: { type: String, default: null },

    // Composite 100-point score (added to monthlyScore)
    compositeScore: { type: Number, default: null },  // today's earned pts (0–100)
    scoreBreakdown: {
      length:    { type: Number, default: null }, // duration part (0–33.33)
      vocabUsed: { type: Number, default: null }, // vocabulary used part (0–33.33)
      topic:     { type: Number, default: null }, // topic relevance part (0–16.67)
      comm:      { type: Number, default: null }, // communication part (0–16.67/33.34)
      isSpecialDay: { type: Boolean, default: false },
      maxLength:    { type: Number, default: 33.33 },
      maxVocab:     { type: Number, default: 33.33 },
      maxTopic:     { type: Number, default: 16.67 },
      maxComm:      { type: Number, default: 16.67 },
      speechRatio:     { type: Number, default: null }, // % of time speaking
      speechMultiplier: { type: Number, default: null }, // 0–100 effective multiplier
      // Option B: Personal Growth & Improvement Scoring
      growth:       { type: Number, default: null }, // personal growth points (0–15)
      maxGrowth:    { type: Number, default: 15 },
      growthDelta:  { type: Number, default: null }, // todayComm - baselineComm (+/-)
      baselineComm: { type: Number, default: null }, // user's 7-submission communication average
      // Picture-description scoring (Communication 20 + Content 35 + Vocabulary 10 + Duration 20 + Growth 15 = 100)
      communication: { type: Number, default: null },
      content:      { type: Number, default: null },
      maxCommunication: { type: Number, default: null },
      maxContent:       { type: Number, default: null },
      // Legacy picture fields retained so older reports remain readable.
      fluency:    { type: Number, default: null },
      coherence:  { type: Number, default: null },
      vocabulary: { type: Number, default: null },
      grammar:    { type: Number, default: null },
      description:{ type: Number, default: null },
      confidence: { type: Number, default: null },
      duration:   { type: Number, default: null },
      isPictureDescription: { type: Boolean, default: false },
      maxFluency:    { type: Number, default: null },
      maxCoherence:  { type: Number, default: null },
      maxVocabulary: { type: Number, default: null },
      maxGrammar:    { type: Number, default: null },
      maxDescription:{ type: Number, default: null },
      maxConfidence: { type: Number, default: null },
      maxDuration:   { type: Number, default: null },
    },
    // Score outcome for re-submissions
    // "new"      — first submission today, score added
    // "improved" — re-submission that beat today's previous score
    // "dropped"  — re-submission with a lower/equal score, previous kept
    scoreOutcome: { type: String, enum: ["new", "improved", "dropped", null], default: null },
    previousScore: { type: Number, default: null }, // previous today's score (for "improved" outcome)
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
  // Prevent rapid visibility churn (also enforced atomically by the service).
  visibilityChangedAt: { type: Date, default: null },
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
