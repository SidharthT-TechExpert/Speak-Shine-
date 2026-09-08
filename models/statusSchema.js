import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  questionSentToday: { type: Boolean, default: false },
  notifiedEmpty: { type: Boolean, default: false },
  notifiedLast: { type: Boolean, default: false },
  fineAppliedToday: { type: Boolean, default: false },
  todayTopic: { type: String, default: null },
  todayQuestion: { type: String, default: null },
  todayCategory: { type: String, default: null },
  todayContentType: { type: String, enum: ["question", "story_audio", "picture_description"], default: "question" },
  todayAudioUrl: { type: String, default: null },
  todayStoryTranscript: { type: String, default: null },
  todaySummaryGuide: { type: String, default: null },
  // Picture Description fields — populated when isPictureDescriptionDay is true
  todayImageUrl: { type: String, default: null },
  todayImageSource: { type: String, default: null },       // e.g. "Unsplash"
  todayImagePageUrl: { type: String, default: null },      // link back to source page
  todayImagePhotographer: { type: String, default: null }, // photographer name
  todayImagePhotographerUrl: { type: String, default: null },
  todayImageSearchQuery: { type: String, default: null },  // query used to find the image
  todayImageInstructions: { type: String, default: null }, // speaking instructions for the user
  todayPosterImage: { type: String, default: null },
  posterExpiresAt: { type: Date, default: null },
  lastPosterSentDate: { type: String, default: null },
  lastPosterSentTime: { type: String, default: null },
  recentCategories: { type: [String], default: [] },
  // Daily vocabulary words (configurable count, related to today's question)
  todayVocabulary: {
    type: [{
      word:    { type: String, required: true },
      meaning: { type: String, required: true },
      example: { type: String, required: true },
    }],
    default: [],
  },
  // Vocabulary challenge settings (admin-configurable)
  vocabWordCount: { type: Number, default: 5, min: 1, max: 10 }, // how many words shown per day
  vocabRequiredCount: { type: Number, default: 3, min: 1, max: 10 }, // how many words user must use
  vocabNormalWordCount: { type: Number, default: 5, min: 1, max: 10 },
  vocabNormalRequiredCount: { type: Number, default: 3, min: 1, max: 10 },
  vocabStoryWordCount: { type: Number, default: 5, min: 1, max: 10 },
  vocabStoryRequiredCount: { type: Number, default: 3, min: 1, max: 10 },
  vocabPictureWordCount: { type: Number, default: 5, min: 1, max: 10 },
  vocabPictureRequiredCount: { type: Number, default: 3, min: 1, max: 10 },
  vocabLevel: { type: String, default: "B2", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] }, // CEFR level
  // Story Summary settings (admin-configurable)
  storyWordCount: { type: Number, default: 200, min: 100, max: 400 },
  usedStoryThemes: { type: [String], default: [] },
  storyLevel: { type: String, default: "B1", enum: ["A2", "B1", "B2", "C1"] },
  allowPrivateVideos: { type: Boolean, default: true }, // admin can disable to force all videos public
  enableBackgroundBlur: { type: Boolean, default: false }, // admin setting to enable/disable AI background blur
  // Which days of the week auto-story runs (array of 0=Sun, 1=Mon, ... 6=Sat). Default: [6] (Saturday)
  storyDays: { type: [Number], default: [6] },
  storyDay: { type: Number, default: 6, min: 0, max: 6 },
  // Which days of the week picture description runs (array of 0=Sun ... 6=Sat). Default: [4] (Thursday).
  pictureDescriptionDays: { type: [Number], default: [4] },
  pictureDescriptionDay: { type: Number, default: 4, min: -1, max: 6 },
  // Payment settings (admin-configurable)
  paymentAmount: { type: Number, default: 5, min: 1, max: 100000 },
  // Duration scoring settings (admin-configurable)
  durationDefaultMax: { type: Number, default: 300, min: 60, max: 1200 },
  durationDefaultFull: { type: Number, default: 300, min: 60, max: 1200 },
  durationStoryMax: { type: Number, default: 180, min: 60, max: 1200 },
  durationStoryFull: { type: Number, default: 180, min: 60, max: 1200 },
  durationWeeklyMax: { type: Number, default: 420, min: 60, max: 1200 },
  durationWeeklyFull: { type: Number, default: 300, min: 60, max: 1200 },
  durationMonthlyReflectionMax: { type: Number, default: 420, min: 60, max: 1200 },
  durationMonthlyReflectionFull: { type: Number, default: 420, min: 60, max: 1200 },
  durationMonthlyGoalsMax: { type: Number, default: 600, min: 60, max: 1200 },
  durationMonthlyGoalsFull: { type: Number, default: 420, min: 60, max: 1200 },
  // Monthly reflection
  isMonthlyReflectionDay: { type: Boolean, default: false },
  isMonthlyGoalsDay: { type: Boolean, default: false },
  isStorySummaryDay: { type: Boolean, default: false },
  isPictureDescriptionDay: { type: Boolean, default: false },
  // Duration scoring — picture description (admin-configurable)
  durationPictureMax:  { type: Number, default: 180, min: 60, max: 600 },
  durationPictureFull: { type: Number, default: 180, min: 60, max: 600 },
  // Daily report tracking
  dailyReportGenerated: { type: Boolean, default: false },
  reportExpiresAt: { type: Date, default: null },
  // Configurable schedule times (HH:MM, 24h, IST)
  posterSendTime: { type: String, default: "08:00" },
  questionGenerateTime: { type: String, default: "07:00" },
  submissionReportEnabled: { type: Boolean, default: true },
  submissionReportTimes: { type: [String], default: ["18:00", "21:00"] },
  submissionReportTime1: { type: String, default: "18:00" },
  submissionReportTime2: { type: String, default: "21:00" },
  submissionReportSlots: {
    type: [{
      time: { type: String, required: true },
      templateType: { type: String, enum: ["comprehensive", "urgent", "motivation", "custom"], default: "comprehensive" },
      customTemplate: { type: String, default: "" },
      lastSentDate: { type: String, default: null }, // "YYYY-MM-DD" in IST
      lastSentTime: { type: String, default: null }, // "HH:MM"
      lastStatus: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
      lastError: { type: String, default: null },
      lastSentAt: { type: Date, default: null },
    }],
    default: [
      { time: "18:00", templateType: "comprehensive", customTemplate: "", lastSentDate: null, lastStatus: "pending", lastError: null },
      { time: "21:00", templateType: "urgent", customTemplate: "", lastSentDate: null, lastStatus: "pending", lastError: null },
    ],
  },
  submissionReportTemplates: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  submissionReportTemplate: { type: String, default: null },
  submissionReportSlotTemplates: { type: Map, of: String, default: {} },
  lastSubmissionReportDate: { type: String, default: null },
  lastSubmissionReportTime: { type: String, default: null },
  // Personal notification settings for admin
  adminNotifyPhone: { type: String, default: null }, // e.g. "919048336746"
  deploymentNotifyEnabled: { type: Boolean, default: true },
  // Track last successful daily reset (YYYY-MM-DD in IST) to detect missed resets
  lastResetDate: { type: String, default: null },
  // Month-End Prize Distribution & Rewards settings
  prizeWinnerCount: { type: Number, default: 3, min: 3, max: 6 },
  prizeCalculationMethod: { type: String, enum: ["preset_top3", "preset_top4", "preset_top5", "preset_top6", "equal", "custom"], default: "preset_top3" },
  prizeCustomTotalCollection: { type: Number, default: null },
  prizeCustomAmounts: { type: [Number], default: [] },
  prizeCustomWinnerNames: { type: [String], default: [] },
  prizeFooterNote: { type: String, default: "*Rewards will credit before evening*" },
  monthEndReportAutoSend: { type: Boolean, default: true },
  lastMonthEndReportDate: { type: String, default: null },
  lastMonthEndReportStatus: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
  lastMonthEndReportError: { type: String, default: null },
}, { timestamps: true });

export default mongoose.model("Status", statusSchema);
