/**
 * Dashboard Service
 * Business logic for dashboard stats, reports, and settings
 */

import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";
import DailyReport from "../../../models/dailyReportSchema.js";
import StreakRecord from "../../../models/streakRecordSchema.js";
import VideoReport from "../../../models/videoReportSchema.js";
import { generateSVGPoster } from "../../../api/posterGenerator.js";
import env from "../../config/env.js";
import { getTodayVocabulary } from "../ai/vocabularyGenerator.js";
import { getDurationLimits } from "../video/submitGate.js";
import { serializeStreakBadges } from "../../utils/streakBadges.js";
import { getMonthlyGracePeriodInfo } from "../../utils/gracePeriodUtils.js";

const withBadgeData = (user, data = {}) => ({ ...data, ...serializeStreakBadges(user) });
const activeStoryTask = (status) => status?.todayContentType === "story_audio"
  || (status?.isStorySummaryDay && status?.todayContentType !== "picture_description");
const activePictureTask = (status) => status?.todayContentType === "picture_description"
  || (status?.isPictureDescriptionDay && status?.todayContentType !== "story_audio");

/**
 * Get poster image - use bot's stored PNG if available, else generate SVG fallback
 */
function getPosterImage(status) {
  if (!status?.todayQuestion && !status?.todayTopic) return null;
  return generateSVGPoster({
    topic: status.todayTopic || "Speaking Practice",
    question: status.todayQuestion || "",
    category: status.todayCategory || "General",
    contentType: status.todayContentType || "question",
    vocabulary: status.todayVocabulary || [],
  });
}

/**
 * Get today's dashboard overview (all roles)
 */
export async function getTodayOverview() {
  try {
    const { publishDueManualQuestion } = await import("../scheduler/questionSchedulerService.js");
    await publishDueManualQuestion();
  } catch {
    // non-fatal
  }

  const [status, users] = await Promise.all([
    Status.findOne().lean(),
    User.find({ paid: true }).select("name userId streak weeklySubmissions completed earnedBadges paid").lean(),
  ]);

  const completed = users.filter(u => u.completed);
  const pending = users.filter(u => !u.completed);
  const topStreak = [...users]
    .sort((a, b) => (b.streak || 0) - (a.streak || 0))
    .slice(0, 5)
    .map(u => withBadgeData(u, {
      name: u.name,
      userId: u.userId,
      streak: u.streak || 0,
      weeklySubmissions: u.weeklySubmissions || 0,
      completed: u.completed || false,
    }));

  return {
    today: {
      questionSent: status?.questionSentToday || false,
      topic: status?.todayTopic || null,
      question: status?.todayQuestion || null,
      category: status?.todayCategory || null,
      contentType: status?.todayContentType || "question",
      audioUrl: status?.todayAudioUrl || null,
      isStorySummary: activeStoryTask(status),
      isPictureDescription: activePictureTask(status),
      isMonthlyReflection: Boolean(status?.isMonthlyReflectionDay),
      isMonthlyGoals: Boolean(status?.isMonthlyGoalsDay),
      imageUrl:          status?.todayImageUrl || null,
      imageSource:       status?.todayImageSource || null,
      imagePageUrl:      status?.todayImagePageUrl || null,
      imagePhotographer: status?.todayImagePhotographer || null,
      imageInstructions: status?.todayImageInstructions || null,
      posterImage: getPosterImage(status),
      vocabulary: status?.todayVocabulary || [],
    },
    stats: {
      total: users.length,
      completed: completed.length,
      pending: pending.length,
    },
    topStreak,
  };
}

/**
 * Get weekly report summary (admin/trainer only)
 */
export async function getWeeklyReport() {
  const users = await User.find().select("name userId weeklySubmissions streak streakFreeze monthlyScore").lean();
  const sorted = [...users].sort((a, b) => (b.weeklySubmissions || 0) - (a.weeklySubmissions || 0));
  
  return sorted.map(u => ({
    name: u.name,
    userId: u.userId,
    weeklySubmissions: u.weeklySubmissions || 0,
    streak: u.streak || 0,
    streakFreeze: u.streakFreeze || 0,
    monthlyScore: u.monthlyScore || 0,
  }));
}

/**
 * Get monthly report summary (admin/trainer only)
 */
export async function getMonthlyReport() {
  const users = await User.find().select("name userId monthlySubmissions monthlyScore streak streakFreeze").lean();
  const sorted = [...users].sort((a, b) => (b.monthlyScore ?? 0) - (a.monthlyScore ?? 0));
  
  return sorted.map(u => ({
    name: u.name,
    userId: u.userId,
    monthlySubmissions: u.monthlySubmissions || 0,
    monthlyScore: u.monthlyScore || 0,
    streak: u.streak || 0,
    streakFreeze: u.streakFreeze || 0,
  }));
}

/**
 * Get full profile for logged-in user
 */
export async function getUserProfile(phone) {
  const strippedPhone = phone ? phone.replace(/^91/, "") : "";
  const phoneCandidates = phone ? [phone, strippedPhone, `91${phone}`] : [];

  const [user, status, allUsers, existingStreakRecord] = await Promise.all([
    phone ? User.findOne({ phone: { $in: phoneCandidates } }).lean() : Promise.resolve(null),
    Status.findOne().lean(),
    User.find().select("name phone userId streak weeklySubmissions monthlySubmissions monthlyScore completed lastScoreDate todayScore earnedBadges paid").lean(),
    StreakRecord.findOne().lean(),
  ]);

  const profileUser = user || {
    name: "User",
    phone: phone,
    feedbackScores: [],
    streak: 0,
    fine: 0,
    completed: false,
    weeklySubmissions: 0,
    monthlySubmissions: 0,
    monthlyScore: 0,
    streakFreeze: 0,
  };

  const recentCompletedReport = profileUser._id
    ? await VideoReport.findOne({ userId: profileUser._id, status: "completed", videoDuration: { $gt: 0 } })
        .sort({ submittedAt: -1 })
        .select("videoDuration submittedAt")
        .lean()
    : null;
  const feedbackScores = [...(profileUser.feedbackScores || [])];
  const lastFeedback = feedbackScores[feedbackScores.length - 1];
  // Older completed reports may predate duration persistence. Enrich the latest
  // score from the still-available report so today's recorded time is visible.
  if (recentCompletedReport?.videoDuration && lastFeedback && !lastFeedback.duration) {
    const reportAgeMs = Date.now() - new Date(recentCompletedReport.submittedAt || 0).getTime();
    if (reportAgeMs >= 0 && reportAgeMs < 48 * 60 * 60 * 1000) {
      feedbackScores[feedbackScores.length - 1] = {
        ...lastFeedback,
        duration: recentCompletedReport.videoDuration,
      };
    }
  }
  const completed = allUsers.filter(u => u.completed).length;
  const sortedByStreak = [...allUsers].sort((a, b) => (b.streak || 0) - (a.streak || 0));

  // Lazy-generate vocabulary if missing (non-blocking — resolves in parallel)
  const vocabularyPromise = (status?.questionSentToday && status?.todayQuestion)
    ? getTodayVocabulary().catch(() => [])
    : Promise.resolve(status?.todayVocabulary || []);

  // ── Leaderboard sort (Paid Members Only) ──────────────────────────────────
  // Only paid active students appear on the public competitive leaderboard.
  // Primary sort: monthlyScore desc (highest pts first, always)
  // Secondary sort: streak desc (tiebreaker when scores are equal)
  // Submitted today floats above non-submitted at equal score
  const paidUsers = allUsers.filter(u => u.paid === true);
  const leaderboardSorted = [...paidUsers].sort((a, b) => {
    const scoreA = a.monthlyScore ?? 0;
    const scoreB = b.monthlyScore ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;          // higher pts first
    if (b.completed !== a.completed) return b.completed ? 1 : -1; // submitted floats up
    return (b.streak || 0) - (a.streak || 0);               // streak tiebreaker
  });

  const topStreak = leaderboardSorted
    .map(u => withBadgeData(u, {
      name: u.name,
      userId: u.userId,
      streak: u.streak || 0,
      weeklySubmissions: u.weeklySubmissions || 0,
      completed: u.completed || false,
      monthlyScore: u.monthlyScore ?? 0,
    }));

  // ── Today's top scorer ──────────────────────────────────────────────────
  // Find the user with the highest todayScore who actually scored today
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayIST = `${nowIST.getFullYear()}-${String(nowIST.getMonth()+1).padStart(2,"0")}-${String(nowIST.getDate()).padStart(2,"0")}`;
  const todayScoredUsers = allUsers.filter(u => u.lastScoreDate === todayIST && u.todayScore != null);
  const topScorerToday = todayScoredUsers.length > 0
    ? todayScoredUsers.reduce((best, u) => (u.todayScore > best.todayScore ? u : best))
    : null;
  const todayTopScorer = topScorerToday ? {
    name: topScorerToday.name,
    score: Math.round(topScorerToday.todayScore),
  } : null;

  // Find the current user's rank in the full leaderboard
  const myRankIdx = leaderboardSorted.findIndex(u =>
    u.phone === phone ||
    u.phone === phone.replace(/^91/, "") ||
    u.phone === `91${phone}`
  );
  const myStreakEntry = myRankIdx >= 0 ? withBadgeData(leaderboardSorted[myRankIdx], {
    rank: myRankIdx + 1,
    name: leaderboardSorted[myRankIdx].name,
    userId: leaderboardSorted[myRankIdx].userId,
    streak: leaderboardSorted[myRankIdx].streak || 0,
    weeklySubmissions: leaderboardSorted[myRankIdx].weeklySubmissions || 0,
    completed: leaderboardSorted[myRankIdx].completed || false,
    monthlyScore: leaderboardSorted[myRankIdx].monthlyScore ?? 0,
    inTop5: myRankIdx < 5,
  }) : null;

  // Check if we should show daily report (12 AM - 8 AM)
  let dailyReport = null;
  let showReport = false;
  
  if (status?.dailyReportGenerated && status?.reportExpiresAt) {
    const now = new Date();
    if (now < new Date(status.reportExpiresAt)) {
      // We're in the report window
      showReport = true;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      if (profileUser && profileUser._id) {
        dailyReport = await DailyReport.findOne({
          userId: profileUser._id,
          date: todayStart,
        }).lean();
      }
    }
  }

  const allTimeSessions = Math.max(profileUser.totalSessions || 0, feedbackScores.length);
  const feedbackDurationSum = feedbackScores.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
  const allTimeRecordedSeconds = Math.max(profileUser.totalRecordedSeconds || 0, feedbackDurationSum);

  return {
    profile: {
      name: profileUser.name,
      feedbackScores,
      totalSessions: allTimeSessions,
      totalRecordedSeconds: allTimeRecordedSeconds,
      streak: profileUser.streak || 0,
      streakFreeze: profileUser.streakFreeze || 0,
      monthlyScore: profileUser.monthlyScore || 0,
      completed: profileUser.completed || false,
      weeklySubmissions: profileUser.weeklySubmissions || 0,
      monthlySubmissions: profileUser.monthlySubmissions || 0,
      linkedPhone: profileUser.phone || null,
      ...serializeStreakBadges(profileUser),
    },
    today: {
      questionSent: status?.questionSentToday || false,
      topic: status?.todayTopic || null,
      question: status?.todayQuestion || null,
      category: status?.todayCategory || null,
      contentType: status?.todayContentType || "question",
      audioUrl: status?.todayAudioUrl || null,
      posterImage: getPosterImage(status),
      isMonthlyReflection: status?.isMonthlyReflectionDay || false,
      isMonthlyGoals: status?.isMonthlyGoalsDay || false,
      isStorySummary: activeStoryTask(status),
      isPictureDescription: activePictureTask(status),
      // Picture description image data (only populated on picture description days)
      imageUrl:             status?.todayImageUrl || null,
      imageSource:          status?.todayImageSource || null,
      imagePageUrl:         status?.todayImagePageUrl || null,
      imagePhotographer:    status?.todayImagePhotographer || null,
      imagePhotographerUrl: status?.todayImagePhotographerUrl || null,
      imageSearchQuery:     status?.todayImageSearchQuery || null,
      imageInstructions:    status?.todayImageInstructions || null,
      vocabulary: await vocabularyPromise,
      allowPrivateVideos: status?.allowPrivateVideos ?? true,
      vocabWordCount: activePictureTask(status)
        ? (status?.vocabPictureWordCount ?? status?.vocabWordCount ?? 5)
        : activeStoryTask(status)
        ? (status?.vocabStoryWordCount ?? status?.vocabWordCount ?? 5)
        : (status?.vocabNormalWordCount ?? status?.vocabWordCount ?? 5),
      vocabRequiredCount: activePictureTask(status)
        ? (status?.vocabPictureRequiredCount ?? status?.vocabRequiredCount ?? 3)
        : activeStoryTask(status)
        ? (status?.vocabStoryRequiredCount ?? status?.vocabRequiredCount ?? 3)
        : (status?.vocabNormalRequiredCount ?? status?.vocabRequiredCount ?? 3),
      vocabNormalWordCount: status?.vocabNormalWordCount ?? status?.vocabWordCount ?? 5,
      vocabNormalRequiredCount: status?.vocabNormalRequiredCount ?? status?.vocabRequiredCount ?? 3,
      vocabStoryWordCount: status?.vocabStoryWordCount ?? status?.vocabWordCount ?? 5,
      vocabStoryRequiredCount: status?.vocabStoryRequiredCount ?? status?.vocabRequiredCount ?? 3,
      vocabPictureWordCount: status?.vocabPictureWordCount ?? status?.vocabWordCount ?? 5,
      vocabPictureRequiredCount: status?.vocabPictureRequiredCount ?? status?.vocabRequiredCount ?? 3,
      durationLimits: getDurationLimits({
        isMonthlyReflection: status?.isMonthlyReflectionDay || false,
        isMonthlyGoals: status?.isMonthlyGoalsDay || false,
        isStorySummary: activeStoryTask(status),
        isPictureDescription: activePictureTask(status),
      }, status || {}),
    },
    gracePeriod: getMonthlyGracePeriodInfo(),
    dailyReport: showReport ? dailyReport : null,
    showReport,
    reportExpiresAt: showReport ? status.reportExpiresAt : null,
    posterSendTime: status?.posterSendTime || "08:00",
    stats: {
      total: allUsers.length,
      completed,
      pending: allUsers.length - completed,
      totalFreeze: allUsers.reduce((sum, u) => sum + (u.streakFreeze || 0), 0),
    },
    topStreak,
    myStreakEntry,
    todayTopScorer,
    streakRecord: await (async () => {
      // Always check if current top user beats the stored record
      const topUser = sortedByStreak[0];
      const existing = existingStreakRecord;
      if (topUser && (topUser.streak || 0) > 0) {
        if (!existing || topUser.streak > existing.streak) {
          return await StreakRecord.findOneAndUpdate(
            {},
            {
              name: topUser.name || topUser.userId || "Unknown",
              userId: topUser.userId || null,
              streak: topUser.streak,
              achievedAt: new Date(),
            },
            { upsert: true, new: true }
          ).lean();
        }
      }
      return existing;
    })(),
  };
}

/**
 * Get feedback score history for a user
 * Tries multiple phone formats to handle country code variations
 */
export async function getUserScores(phone) {
  const stripped = phone.replace(/^(\+91|91)/, "");
  const user = await User.findOne({
    phone: { $in: [phone, stripped, `91${stripped}`, `+91${stripped}`] }
  }).lean();

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  return {
    name: user.name,
    feedbackScores: user.feedbackScores || [],
    streak: user.streak || 0,
    streakFreeze: user.streakFreeze || 0,
    monthlyScore: user.monthlyScore || 0,
  };
}

/**
 * Manually set today's question (admin only)
 */
export async function setTodayQuestion(topic, question, category) {
  if (!question) {
    throw new Error("question is required");
  }
  
  await Status.updateOne({}, {
    $set: {
      todayQuestion: question,
      todayTopic: topic || null,
      todayCategory: category || null,
      todayContentType: "question",
      todayAudioUrl: null,
      todayStoryTranscript: null,
      todaySummaryGuide: null,
      isStorySummaryDay: false,
      isPictureDescriptionDay: false,
      todayImageUrl: null,
      todayImageSource: null,
      todayImagePageUrl: null,
      todayImagePhotographer: null,
      todayImagePhotographerUrl: null,
      todayImageSearchQuery: null,
      todayImageInstructions: null,
      questionSentToday: true,
    }
  }, { upsert: true });
  
  return { success: true };
}

/**
 * Get bot schedule settings (admin only)
 */
export async function getSettings() {
  let status = null;
  try {
    status = await Status.findOne().lean();
    if (!status) {
      const created = await Status.create({});
      status = created?.toObject ? created.toObject() : created;
    }
  } catch (dbErr) {
    console.error("[Dashboard] Error fetching Status doc from DB:", dbErr.message);
    status = {};
  }
  
  if (!status) status = {};

  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayDate = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, "0")}-${String(nowIST.getDate()).padStart(2, "0")}`;

  // Safe extraction of times
  const rawTimes = Array.isArray(status.submissionReportTimes) && status.submissionReportTimes.length > 0
    ? status.submissionReportTimes
    : [status.submissionReportTime1 || "18:00", status.submissionReportTime2 || "21:00"].filter(Boolean);

  // Safe extraction of slots
  let slots = [];
  if (Array.isArray(status.submissionReportSlots) && status.submissionReportSlots.length > 0) {
    slots = status.submissionReportSlots.map((slot, idx) => {
      if (!slot) return null;
      const isString = typeof slot === "string";
      const timeVal = isString ? slot : (slot.time || rawTimes[idx] || "18:00");
      const isToday = !isString && slot.lastSentDate === todayDate;
      const statusVal = isToday ? (slot.lastStatus || "pending") : "pending";
      const errorVal = isToday ? (slot.lastError || null) : null;
      return {
        time: timeVal,
        templateType: (!isString && slot.templateType) ? slot.templateType : (idx === 1 ? "urgent" : "comprehensive"),
        customTemplate: (!isString && slot.customTemplate) ? slot.customTemplate : "",
        lastSentDate: (!isString && slot.lastSentDate) ? slot.lastSentDate : null,
        lastSentTime: (!isString && slot.lastSentTime) ? slot.lastSentTime : null,
        lastStatus: statusVal,
        lastError: errorVal,
        lastSentAt: (!isString && slot.lastSentAt) ? slot.lastSentAt : null,
        completed: statusVal === "success",
        failed: statusVal === "failed",
      };
    }).filter(Boolean);
  }

  if (slots.length === 0) {
    slots = (rawTimes.length > 0 ? rawTimes : ["18:00", "21:00"]).map((t, idx) => ({
      time: typeof t === "string" ? t : (t?.time || "18:00"),
      templateType: idx === 1 ? "urgent" : "comprehensive",
      customTemplate: "",
      lastSentDate: null,
      lastSentTime: null,
      lastStatus: "pending",
      lastError: null,
      lastSentAt: null,
      completed: false,
      failed: false,
    }));
  }

  // Safe slot templates
  let slotTemplates = {};
  if (status.submissionReportSlotTemplates) {
    if (status.submissionReportSlotTemplates instanceof Map) {
      slotTemplates = Object.fromEntries(status.submissionReportSlotTemplates);
    } else if (typeof status.submissionReportSlotTemplates === "object") {
      slotTemplates = { ...status.submissionReportSlotTemplates };
    }
  }

  return {
    posterSendTime: status.posterSendTime || "08:00",
    questionGenerateTime: status.questionGenerateTime || "07:00",
    submissionReportEnabled: status.submissionReportEnabled !== false,
    submissionReportTimes: rawTimes.map(t => (typeof t === "string" ? t : (t?.time || "18:00"))),
    submissionReportSlots: slots,
    submissionReportTemplates: status.submissionReportTemplates && typeof status.submissionReportTemplates === "object" ? status.submissionReportTemplates : {},
    submissionReportTime1: status.submissionReportTime1 || "18:00",
    submissionReportTime2: status.submissionReportTime2 || "21:00",
    submissionReportTemplate: status.submissionReportTemplate || null,
    submissionReportSlotTemplates: slotTemplates,
    vocabWordCount: status.vocabWordCount ?? 5,
    vocabRequiredCount: status.vocabRequiredCount ?? 3,
    vocabNormalWordCount: status.vocabNormalWordCount ?? status.vocabWordCount ?? 5,
    vocabNormalRequiredCount: status.vocabNormalRequiredCount ?? status.vocabRequiredCount ?? 3,
    vocabStoryWordCount: status.vocabStoryWordCount ?? status.vocabWordCount ?? 5,
    vocabStoryRequiredCount: status.vocabStoryRequiredCount ?? status.vocabRequiredCount ?? 3,
    vocabPictureWordCount: status.vocabPictureWordCount ?? status.vocabWordCount ?? 5,
    vocabPictureRequiredCount: status.vocabPictureRequiredCount ?? status.vocabRequiredCount ?? 3,
    vocabLevel: status.vocabLevel || "B2",
    storyWordCount: status.storyWordCount ?? 200,
    storyLevel: status.storyLevel || "B1",
    allowPrivateVideos: status.allowPrivateVideos ?? true,
    storyDays: Array.isArray(status.storyDays) && status.storyDays.length > 0
      ? status.storyDays
      : (status.storyDay !== undefined && status.storyDay !== null ? [status.storyDay] : [6]),
    storyDay: status.storyDay ?? (Array.isArray(status.storyDays) && status.storyDays.length > 0 ? status.storyDays[0] : 6),
    pictureDescriptionDays: Array.isArray(status.pictureDescriptionDays)
      ? status.pictureDescriptionDays
      : (status.pictureDescriptionDay !== undefined && status.pictureDescriptionDay !== null && status.pictureDescriptionDay !== -1
          ? [status.pictureDescriptionDay]
          : (status.pictureDescriptionDay === -1 ? [] : [4])),
    pictureDescriptionDay: status.pictureDescriptionDay ?? (Array.isArray(status.pictureDescriptionDays) && status.pictureDescriptionDays.length > 0 ? status.pictureDescriptionDays[0] : -1),
    paymentAmount: status.paymentAmount ?? 5,
    durationDefaultMax: status.durationDefaultMax ?? 300,
    durationDefaultFull: status.durationDefaultFull ?? 300,
    durationStoryMax: status.durationStoryMax ?? 180,
    durationStoryFull: status.durationStoryFull ?? 180,
    durationWeeklyMax: status.durationWeeklyMax ?? 420,
    durationWeeklyFull: status.durationWeeklyFull ?? 300,
    durationMonthlyReflectionMax: status.durationMonthlyReflectionMax ?? 420,
    durationMonthlyReflectionFull: status.durationMonthlyReflectionFull ?? 420,
    durationMonthlyGoalsMax: status.durationMonthlyGoalsMax ?? 600,
    durationMonthlyGoalsFull: status.durationMonthlyGoalsFull ?? 420,
    durationPictureMax: status.durationPictureMax ?? 180,
    durationPictureFull: status.durationPictureFull ?? 180,
    adminNotifyPhone: status.adminNotifyPhone || process.env.ADMIN_NOTIFY_PHONE || null,
    deploymentNotifyEnabled: status.deploymentNotifyEnabled !== false,
    prizeWinnerCount: status.prizeWinnerCount ?? 3,
    prizeCalculationMethod: status.prizeCalculationMethod || "preset_top3",
    prizeCustomTotalCollection: status.prizeCustomTotalCollection ?? null,
    prizeCustomAmounts: Array.isArray(status.prizeCustomAmounts) ? status.prizeCustomAmounts : [],
    prizeFooterNote: status.prizeFooterNote || "*Rewards will credit before evening*",
    monthEndReportAutoSend: status.monthEndReportAutoSend !== false,
    lastMonthEndReportDate: status.lastMonthEndReportDate || null,
    lastMonthEndReportStatus: status.lastMonthEndReportStatus || "pending",
  };
}

/**
 * Update bot schedule settings (admin only)
 */
export async function updateSettings(input, ...rest) {
  let params = {};
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    params = input;
  } else {
    const [
      posterSendTime, questionGenerateTime, vocabWordCount, vocabRequiredCount, vocabLevel, storyWordCount, storyLevel, storyDay,
      paymentAmount,
      durationDefaultMax, durationDefaultFull,
      durationStoryMax, durationStoryFull,
      durationWeeklyMax, durationWeeklyFull,
      durationMonthlyReflectionMax, durationMonthlyReflectionFull,
      durationMonthlyGoalsMax, durationMonthlyGoalsFull,
      allowPrivateVideos,
      pictureDescriptionDay,
      durationPictureMax, durationPictureFull,
      vocabNormalWordCount, vocabNormalRequiredCount,
      vocabStoryWordCount, vocabStoryRequiredCount,
      vocabPictureWordCount, vocabPictureRequiredCount,
      submissionReportEnabled,
      submissionReportTime1,
      submissionReportTime2,
      submissionReportTimes,
      submissionReportTemplate,
      submissionReportSlotTemplates,
      submissionReportSlots,
      submissionReportTemplates,
      adminNotifyPhone,
      deploymentNotifyEnabled,
      storyDays,
      pictureDescriptionDays
    ] = [input, ...rest];
    params = {
      posterSendTime, questionGenerateTime, vocabWordCount, vocabRequiredCount, vocabLevel, storyWordCount, storyLevel, storyDay, storyDays,
      paymentAmount,
      durationDefaultMax, durationDefaultFull,
      durationStoryMax, durationStoryFull,
      durationWeeklyMax, durationWeeklyFull,
      durationMonthlyReflectionMax, durationMonthlyReflectionFull,
      durationMonthlyGoalsMax, durationMonthlyGoalsFull,
      allowPrivateVideos,
      pictureDescriptionDay, pictureDescriptionDays,
      durationPictureMax, durationPictureFull,
      vocabNormalWordCount, vocabNormalRequiredCount,
      vocabStoryWordCount, vocabStoryRequiredCount,
      vocabPictureWordCount, vocabPictureRequiredCount,
      submissionReportEnabled,
      submissionReportTime1,
      submissionReportTime2,
      submissionReportTimes,
      submissionReportTemplate,
      submissionReportSlotTemplates,
      submissionReportSlots,
      submissionReportTemplates,
      adminNotifyPhone,
      deploymentNotifyEnabled
    };
  }

  const {
    posterSendTime, questionGenerateTime, vocabWordCount, vocabRequiredCount, vocabLevel, storyWordCount, storyLevel, storyDay, storyDays,
    paymentAmount,
    durationDefaultMax, durationDefaultFull,
    durationStoryMax, durationStoryFull,
    durationWeeklyMax, durationWeeklyFull,
    durationMonthlyReflectionMax, durationMonthlyReflectionFull,
    durationMonthlyGoalsMax, durationMonthlyGoalsFull,
    allowPrivateVideos,
    pictureDescriptionDay, pictureDescriptionDays,
    durationPictureMax, durationPictureFull,
    vocabNormalWordCount, vocabNormalRequiredCount,
    vocabStoryWordCount, vocabStoryRequiredCount,
    vocabPictureWordCount, vocabPictureRequiredCount,
    submissionReportEnabled,
    submissionReportTime1,
    submissionReportTime2,
    submissionReportTimes,
    submissionReportTemplate,
    submissionReportSlotTemplates,
    submissionReportSlots,
    submissionReportTemplates,
    adminNotifyPhone,
    deploymentNotifyEnabled
  } = params;

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const updates = {};

  if (adminNotifyPhone !== undefined) {
    updates.adminNotifyPhone = typeof adminNotifyPhone === "string" ? adminNotifyPhone.trim() : null;
  }

  if (deploymentNotifyEnabled !== undefined) {
    updates.deploymentNotifyEnabled = deploymentNotifyEnabled === true || deploymentNotifyEnabled === "true";
  }
  
  if (submissionReportSlots !== undefined) {
    if (Array.isArray(submissionReportSlots)) {
      const existingStatus = await Status.findOne().lean();
      const existingSlots = Array.isArray(existingStatus?.submissionReportSlots) ? existingStatus.submissionReportSlots : [];

      const validSlots = submissionReportSlots
        .filter(s => s && s.time && timeRegex.test(s.time))
        .map(s => {
          const matchedOld = existingSlots.find(old => old.time === s.time);
          return {
            time: s.time,
            templateType: ["comprehensive", "urgent", "motivation", "custom"].includes(s.templateType) ? s.templateType : "comprehensive",
            customTemplate: typeof s.customTemplate === "string" ? s.customTemplate : "",
            lastSentDate: s.lastSentDate !== undefined ? s.lastSentDate : (matchedOld?.lastSentDate || null),
            lastSentTime: s.lastSentTime !== undefined ? s.lastSentTime : (matchedOld?.lastSentTime || null),
            lastStatus: s.lastStatus || matchedOld?.lastStatus || "pending",
            lastError: s.lastError !== undefined ? s.lastError : (matchedOld?.lastError || null),
            lastSentAt: s.lastSentAt || matchedOld?.lastSentAt || null,
          };
        });
      if (validSlots.length > 0) {
        updates.submissionReportSlots = validSlots;
        updates.submissionReportTimes = validSlots.map(s => s.time);
        updates.submissionReportTime1 = validSlots[0]?.time || "18:00";
        updates.submissionReportTime2 = validSlots[1]?.time || "21:00";
      }
    }
  }

  if (submissionReportTemplates !== undefined) {
    updates.submissionReportTemplates = typeof submissionReportTemplates === "object" && submissionReportTemplates !== null ? submissionReportTemplates : {};
  }

  if (submissionReportTemplate !== undefined) {
    updates.submissionReportTemplate = typeof submissionReportTemplate === "string" ? submissionReportTemplate.trim() : null;
  }

  if (submissionReportSlotTemplates !== undefined) {
    updates.submissionReportSlotTemplates = typeof submissionReportSlotTemplates === "object" && submissionReportSlotTemplates !== null ? submissionReportSlotTemplates : {};
  }
  
  if (posterSendTime !== undefined) {
    if (!timeRegex.test(posterSendTime)) {
      const error = new Error("Invalid posterSendTime format (HH:MM)");
      error.statusCode = 400;
      throw error;
    }
    updates.posterSendTime = posterSendTime;
    updates.lastPosterSentTime = null;
  }
  
  if (questionGenerateTime !== undefined) {
    if (!timeRegex.test(questionGenerateTime)) {
      const error = new Error("Invalid questionGenerateTime format (HH:MM)");
      error.statusCode = 400;
      throw error;
    }
    updates.questionGenerateTime = questionGenerateTime;
  }

  if (submissionReportEnabled !== undefined) {
    updates.submissionReportEnabled = submissionReportEnabled === true || submissionReportEnabled === "true";
  }

  if (submissionReportTimes !== undefined) {
    const rawTimes = Array.isArray(submissionReportTimes)
      ? submissionReportTimes
      : typeof submissionReportTimes === "string"
      ? submissionReportTimes.split(",").map(t => t.trim())
      : [];
    const validTimes = rawTimes.filter(t => timeRegex.test(t));
    if (validTimes.length > 0) {
      updates.submissionReportTimes = validTimes;
      updates.submissionReportTime1 = validTimes[0] || "18:00";
      updates.submissionReportTime2 = validTimes[1] || "21:00";
    }
    updates.lastSubmissionReportTime = null;
    updates.lastSubmissionReportDate = null;
  } else {
    if (submissionReportTime1 !== undefined) {
      if (!timeRegex.test(submissionReportTime1)) {
        const error = new Error("Invalid submissionReportTime1 format (HH:MM)");
        error.statusCode = 400;
        throw error;
      }
      updates.submissionReportTime1 = submissionReportTime1;
      updates.lastSubmissionReportTime = null;
    }

    if (submissionReportTime2 !== undefined) {
      if (!timeRegex.test(submissionReportTime2)) {
        const error = new Error("Invalid submissionReportTime2 format (HH:MM)");
        error.statusCode = 400;
        throw error;
      }
      updates.submissionReportTime2 = submissionReportTime2;
      updates.lastSubmissionReportTime = null;
    }
  }

  if (vocabWordCount !== undefined) {
    const count = parseInt(vocabWordCount, 10);
    if (isNaN(count) || count < 1 || count > 10) {
      const error = new Error("vocabWordCount must be between 1 and 10");
      error.statusCode = 400;
      throw error;
    }
    updates.vocabWordCount = count;
    // Clear today's vocab so it regenerates with new count
    updates.todayVocabulary = [];
  }

  if (vocabRequiredCount !== undefined) {
    const required = parseInt(vocabRequiredCount, 10);
    if (isNaN(required) || required < 1 || required > 10) {
      const error = new Error("vocabRequiredCount must be between 1 and 10");
      error.statusCode = 400;
      throw error;
    }
    updates.vocabRequiredCount = required;
  }

  const vocabGroups = [
    ["vocabNormalWordCount", vocabNormalWordCount, "vocabNormalRequiredCount", vocabNormalRequiredCount],
    ["vocabStoryWordCount", vocabStoryWordCount, "vocabStoryRequiredCount", vocabStoryRequiredCount],
    ["vocabPictureWordCount", vocabPictureWordCount, "vocabPictureRequiredCount", vocabPictureRequiredCount],
  ];
  for (const [wordKey, rawWords, requiredKey, rawRequired] of vocabGroups) {
    if (rawWords !== undefined) {
      const count = parseInt(rawWords, 10);
      if (isNaN(count) || count < 1 || count > 10) {
        const error = new Error(`${wordKey} must be between 1 and 10`);
        error.statusCode = 400;
        throw error;
      }
      updates[wordKey] = count;
      updates.todayVocabulary = [];
    }
    if (rawRequired !== undefined) {
      const required = parseInt(rawRequired, 10);
      if (isNaN(required) || required < 1 || required > 10) {
        const error = new Error(`${requiredKey} must be between 1 and 10`);
        error.statusCode = 400;
        throw error;
      }
      updates[requiredKey] = required;
    }
  }

  const vocabStatus = await Status.findOne().lean();
  for (const [wordKey, , requiredKey] of vocabGroups) {
    const words = updates[wordKey] ?? vocabStatus?.[wordKey] ?? vocabStatus?.vocabWordCount ?? 5;
    const required = updates[requiredKey] ?? vocabStatus?.[requiredKey] ?? vocabStatus?.vocabRequiredCount ?? 3;
    if (required > words) {
      const error = new Error(`${requiredKey} cannot exceed ${wordKey}`);
      error.statusCode = 400;
      throw error;
    }
  }

  // Ensure required count never exceeds word count
  if (updates.vocabRequiredCount !== undefined || updates.vocabWordCount !== undefined) {
    const status = await Status.findOne().lean();
    const finalWordCount = updates.vocabWordCount ?? status?.vocabWordCount ?? 5;
    const finalRequiredCount = updates.vocabRequiredCount ?? status?.vocabRequiredCount ?? 3;
    if (finalRequiredCount > finalWordCount) {
      const error = new Error("vocabRequiredCount cannot exceed vocabWordCount");
      error.statusCode = 400;
      throw error;
    }
  }

  if (vocabLevel !== undefined) {
    const VALID_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
    if (!VALID_LEVELS.includes(vocabLevel)) {
      const error = new Error(`vocabLevel must be one of: ${VALID_LEVELS.join(", ")}`);
      error.statusCode = 400;
      throw error;
    }
    updates.vocabLevel = vocabLevel;
    // Clear today's vocab so it regenerates with new level
    updates.todayVocabulary = [];
  }

  if (storyWordCount !== undefined) {
    const count = parseInt(storyWordCount, 10);
    if (isNaN(count) || count < 100 || count > 400) {
      const error = new Error("storyWordCount must be between 100 and 400");
      error.statusCode = 400;
      throw error;
    }
    updates.storyWordCount = count;
  }

  if (storyLevel !== undefined) {
    const VALID_STORY_LEVELS = ["A2", "B1", "B2", "C1"];
    if (!VALID_STORY_LEVELS.includes(storyLevel)) {
      const error = new Error(`storyLevel must be one of: ${VALID_STORY_LEVELS.join(", ")}`);
      error.statusCode = 400;
      throw error;
    }
    updates.storyLevel = storyLevel;
  }

  if (storyDays !== undefined) {
    if (!Array.isArray(storyDays)) {
      const error = new Error("storyDays must be an array of day numbers (0-6)");
      error.statusCode = 400;
      throw error;
    }
    const parsed = storyDays.map(d => parseInt(d, 10));
    if (parsed.some(d => isNaN(d) || d < 0 || d > 6)) {
      const error = new Error("All days in storyDays must be numbers between 0 (Sunday) and 6 (Saturday)");
      error.statusCode = 400;
      throw error;
    }
    const uniqueDays = [...new Set(parsed)].sort((a, b) => a - b);
    updates.storyDays = uniqueDays;
    updates.storyDay = uniqueDays.length > 0 ? uniqueDays[0] : 6;
  } else if (storyDay !== undefined) {
    const day = parseInt(storyDay, 10);
    if (isNaN(day) || day < 0 || day > 6) {
      const error = new Error("storyDay must be 0 (Sunday) through 6 (Saturday)");
      error.statusCode = 400;
      throw error;
    }
    updates.storyDay = day;
    updates.storyDays = [day];
  }

  if (pictureDescriptionDays !== undefined) {
    if (!Array.isArray(pictureDescriptionDays)) {
      const error = new Error("pictureDescriptionDays must be an array of day numbers (0-6)");
      error.statusCode = 400;
      throw error;
    }
    const parsed = pictureDescriptionDays.map(d => parseInt(d, 10));
    if (parsed.some(d => isNaN(d) || d < 0 || d > 6)) {
      const error = new Error("All days in pictureDescriptionDays must be numbers between 0 (Sunday) and 6 (Saturday)");
      error.statusCode = 400;
      throw error;
    }
    const uniqueDays = [...new Set(parsed)].sort((a, b) => a - b);
    updates.pictureDescriptionDays = uniqueDays;
    updates.pictureDescriptionDay = uniqueDays.length > 0 ? uniqueDays[0] : -1;
  } else if (pictureDescriptionDay !== undefined) {
    const day = parseInt(pictureDescriptionDay, 10);
    if (isNaN(day) || day < -1 || day > 6) {
      const error = new Error("pictureDescriptionDay must be -1 (disabled) or 0 (Sunday) through 6 (Saturday)");
      error.statusCode = 400;
      throw error;
    }
    updates.pictureDescriptionDay = day;
    updates.pictureDescriptionDays = day === -1 ? [] : [day];
  }

  if (paymentAmount !== undefined) {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
      const error = new Error("paymentAmount must be between ₹1 and ₹100000");
      error.statusCode = 400;
      throw error;
    }
    updates.paymentAmount = Math.round(amount * 100) / 100;
  }

  // Duration fields validation
  const durationFields = [
    { name: "durationDefaultMax", label: "Default Max Duration" },
    { name: "durationDefaultFull", label: "Default Full Score Duration" },
    { name: "durationStoryMax", label: "Story Max Duration" },
    { name: "durationStoryFull", label: "Story Full Score Duration" },
    { name: "durationWeeklyMax", label: "Weekly Max Duration" },
    { name: "durationWeeklyFull", label: "Weekly Full Score Duration" },
    { name: "durationMonthlyReflectionMax", label: "Monthly Reflection Max Duration" },
    { name: "durationMonthlyReflectionFull", label: "Monthly Reflection Full Score Duration" },
    { name: "durationMonthlyGoalsMax", label: "Monthly Goals Max Duration" },
    { name: "durationMonthlyGoalsFull", label: "Monthly Goals Full Score Duration" },
    { name: "durationPictureMax", label: "Picture Description Max Duration" },
    { name: "durationPictureFull", label: "Picture Description Full Score Duration" },
  ];

  const durationArgs = {
    durationDefaultMax, durationDefaultFull,
    durationStoryMax, durationStoryFull,
    durationWeeklyMax, durationWeeklyFull,
    durationMonthlyReflectionMax, durationMonthlyReflectionFull,
    durationMonthlyGoalsMax, durationMonthlyGoalsFull,
    durationPictureMax, durationPictureFull,
  };

  for (const { name, label } of durationFields) {
    const rawVal = durationArgs[name];
    if (rawVal !== undefined) {
      const val = parseInt(rawVal, 10);
      if (isNaN(val) || val < 60 || val > 1200) {
        const error = new Error(`${label} must be between 60 and 1200 seconds`);
        error.statusCode = 400;
        throw error;
      }
      updates[name] = val;
    }
  }

  // Verify fullScoreSeconds <= maxSeconds relation checks
  const status = await Status.findOne().lean();
  const getVal = (key, def) => updates[key] !== undefined ? updates[key] : (status?.[key] ?? def);

  const checkRelation = (groupLabel, maxKey, fullKey, maxDef, fullDef) => {
    const maxVal = getVal(maxKey, maxDef);
    const fullVal = getVal(fullKey, fullDef);
    if (fullVal > maxVal) {
      const error = new Error(`${groupLabel} Full Score Duration cannot exceed Max Duration`);
      error.statusCode = 400;
      throw error;
    }
  };

  checkRelation("Default Daily", "durationDefaultMax", "durationDefaultFull", 300, 300);
  checkRelation("Story Summary", "durationStoryMax", "durationStoryFull", 180, 180);
  checkRelation("Weekly Reflection", "durationWeeklyMax", "durationWeeklyFull", 420, 300);
  checkRelation("Monthly Reflection", "durationMonthlyReflectionMax", "durationMonthlyReflectionFull", 420, 420);
  checkRelation("Monthly Goals", "durationMonthlyGoalsMax", "durationMonthlyGoalsFull", 600, 420);
  checkRelation("Picture Description", "durationPictureMax", "durationPictureFull", 180, 180);

  if (allowPrivateVideos !== undefined) {
    updates.allowPrivateVideos = allowPrivateVideos === true || allowPrivateVideos === "true";
  }

  // Month-End Prize Settings
  if (params.prizeWinnerCount !== undefined) {
    const count = parseInt(params.prizeWinnerCount, 10);
    if (!isNaN(count) && count >= 3 && count <= 6) {
      updates.prizeWinnerCount = count;
    }
  }

  if (params.prizeCalculationMethod !== undefined) {
    const validMethods = ["preset_top3", "preset_top4", "preset_top5", "preset_top6", "equal", "custom"];
    if (validMethods.includes(params.prizeCalculationMethod)) {
      updates.prizeCalculationMethod = params.prizeCalculationMethod;
    }
  }

  if (params.prizeCustomTotalCollection !== undefined) {
    updates.prizeCustomTotalCollection = params.prizeCustomTotalCollection !== null && params.prizeCustomTotalCollection !== ""
      ? Number(params.prizeCustomTotalCollection)
      : null;
  }

  if (params.prizeCustomAmounts !== undefined) {
    if (Array.isArray(params.prizeCustomAmounts)) {
      updates.prizeCustomAmounts = params.prizeCustomAmounts.map(Number).filter(n => !isNaN(n));
    }
  }

  if (params.prizeFooterNote !== undefined) {
    updates.prizeFooterNote = typeof params.prizeFooterNote === "string" ? params.prizeFooterNote.trim() : "*Rewards will credit before evening*";
  }

  if (params.monthEndReportAutoSend !== undefined) {
    updates.monthEndReportAutoSend = params.monthEndReportAutoSend === true || params.monthEndReportAutoSend === "true";
  }

  await Status.updateOne({}, { $set: updates }, { upsert: true });
  
  return { success: true, ...updates };
}

/**
 * Debug daily report status (admin only)
 */
export async function getDebugReport() {
  const status = await Status.findOne().lean();
  const now = new Date();
  const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  
  const todayStart = new Date(nowIST);
  todayStart.setHours(0, 0, 0, 0);
  
  const reportCount = await DailyReport.countDocuments({
    date: { $gte: todayStart }
  });
  
  return {
    currentTime: now,
    currentTimeIST: nowIST,
    status: {
      dailyReportGenerated: status?.dailyReportGenerated || false,
      reportExpiresAt: status?.reportExpiresAt || null,
      questionSentToday: status?.questionSentToday || false,
    },
    reportCount,
    showReport: status?.dailyReportGenerated && status?.reportExpiresAt && now < new Date(status.reportExpiresAt),
    explanation: !status?.dailyReportGenerated 
      ? "Reports not generated yet (scheduler hasn't run at midnight)"
      : now >= new Date(status.reportExpiresAt)
      ? "Report window expired (past 8 AM)"
      : "Report should be visible",
  };
}

/**
 * Manually trigger report generation (admin only, for testing)
 */
export async function generateReportNow() {
  const { generateDailyReports } = await import("../../../backend/services/scheduler/dailyReportService.js");
  await generateDailyReports();
  return { success: true, message: "Daily reports generated successfully" };
}

/**
 * Force monthly reflection mode ON (admin only, for testing)
 */
export async function enableMonthlyReflection() {
  const { MONTHLY_REFLECTION_QUESTIONS, MONTHLY_REFLECTION_TOPIC, MONTHLY_REFLECTION_CATEGORY } = await import("../../../api/scheduler.js");
  const reflectionText = MONTHLY_REFLECTION_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n");
  
  await Status.updateOne({}, {
    $set: {
      questionSentToday: true,
      isMonthlyReflectionDay: true,
      isMonthlyGoalsDay: false,
      isStorySummaryDay: false,
      isPictureDescriptionDay: false,
      todayContentType: "question",
      todayAudioUrl: null,
      todayStoryTranscript: null,
      todaySummaryGuide: null,
      todayImageUrl: null,
      todayPosterImage: null,
      todayTopic: MONTHLY_REFLECTION_TOPIC,
      todayQuestion: reflectionText,
      todayCategory: MONTHLY_REFLECTION_CATEGORY,
    }
  }, { upsert: true });

  const { ensureTodayVocabulary } = await import("../ai/vocabularyGenerator.js");
  await ensureTodayVocabulary().catch(err => console.warn("[Dashboard] Vocabulary generation failed:", err.message));

  try {
    const { sendDailyPosterToGroup } = await import("../whatsapp/whatsappService.js");
    await sendDailyPosterToGroup({
      topic: MONTHLY_REFLECTION_TOPIC,
      question: reflectionText,
      category: MONTHLY_REFLECTION_CATEGORY,
    });
  } catch (waErr) {
    console.warn("[Dashboard] WhatsApp poster auto-send skipped/failed:", waErr.message);
  }
  
  return { success: true, message: "Monthly reflection mode activated and poster sent to WhatsApp" };
}

/**
 * Force monthly goal-setting mode ON (admin only, for testing)
 */
export async function enableMonthlyGoals() {
  const { MONTHLY_GOALS_QUESTIONS, MONTHLY_GOALS_TOPIC, MONTHLY_GOALS_CATEGORY } = await import("../../../api/scheduler.js");
  const goalsText = MONTHLY_GOALS_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n");
  
  await Status.updateOne({}, {
    $set: {
      questionSentToday: true,
      isMonthlyGoalsDay: true,
      isMonthlyReflectionDay: false,
      isStorySummaryDay: false,
      isPictureDescriptionDay: false,
      todayContentType: "question",
      todayAudioUrl: null,
      todayStoryTranscript: null,
      todaySummaryGuide: null,
      todayImageUrl: null,
      todayPosterImage: null,
      todayTopic: MONTHLY_GOALS_TOPIC,
      todayQuestion: goalsText,
      todayCategory: MONTHLY_GOALS_CATEGORY,
    }
  }, { upsert: true });

  const { ensureTodayVocabulary } = await import("../ai/vocabularyGenerator.js");
  await ensureTodayVocabulary().catch(err => console.warn("[Dashboard] Vocabulary generation failed:", err.message));

  try {
    const { sendDailyPosterToGroup } = await import("../whatsapp/whatsappService.js");
    await sendDailyPosterToGroup({
      topic: MONTHLY_GOALS_TOPIC,
      question: goalsText,
      category: MONTHLY_GOALS_CATEGORY,
    });
  } catch (waErr) {
    console.warn("[Dashboard] WhatsApp poster auto-send skipped/failed:", waErr.message);
  }
  
  return { success: true, message: "Monthly goal-setting mode activated and poster sent to WhatsApp" };
}


/**
 * Force story summary mode ON (admin only, for testing)
 */
export async function enableStorySummaryDemo() {
  const { publishAutoSaturdayStory } = await import("../scheduler/questionSchedulerService.js");
  const result = await publishAutoSaturdayStory();
  if (!result.published) {
    const error = new Error(result.error || "Failed to generate story summary");
    error.statusCode = 500;
    throw error;
  }
  return { success: true, message: `Story summary demo activated: "${result.topic}" — refresh the app to see it` };
}

/**
 * Turn off all special modes (admin only)
 */
export async function disableSpecialModes() {
  await Status.updateOne({}, {
    $set: {
      isMonthlyReflectionDay: false,
      isMonthlyGoalsDay: false,
      isStorySummaryDay: false,
      isPictureDescriptionDay: false,
      questionSentToday: false,
      todayTopic: null,
      todayQuestion: null,
      todayCategory: null,
      todayContentType: "question",
      todayAudioUrl: null,
      todayStoryTranscript: null,
      todaySummaryGuide: null,
      todayImageUrl: null,
      todayImageSource: null,
      todayImagePageUrl: null,
      todayImagePhotographer: null,
      todayImagePhotographerUrl: null,
      todayImageSearchQuery: null,
      todayImageInstructions: null,
      todayStoryTranscript: null,
      todaySummaryGuide: null,
    }
  });
  
  return { success: true, message: "All special modes turned off" };
}
