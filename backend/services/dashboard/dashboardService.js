/**
 * Dashboard Service
 * Business logic for dashboard stats, reports, and settings
 */

import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";
import DailyReport from "../../../models/dailyReportSchema.js";
import { generateSVGPoster } from "../../../api/posterGenerator.js";
import {
  cached,
  userProfileKey, OVERVIEW_KEY, WEEKLY_KEY, MONTHLY_KEY,
  TTL_18H,
} from "../cache/cacheService.js";

/**
 * Get poster image - use bot's stored PNG if available, else generate SVG fallback
 */
function getPosterImage(status) {
  if (status?.todayPosterImage) {
    const isExpired = status.posterExpiresAt && new Date() > new Date(status.posterExpiresAt);
    if (!isExpired) return status.todayPosterImage;
  }
  // Fallback: generate SVG with correct category
  if (!status?.todayQuestion) return null;
  return generateSVGPoster({
    topic: status.todayTopic || "Speaking Practice",
    question: status.todayQuestion,
    category: status.todayCategory || "General",
  });
}

/**
 * Get today's dashboard overview (all roles) — cached 18h
 */
export async function getTodayOverview() {
  return cached(OVERVIEW_KEY, TTL_18H, async () => {
    const status = await Status.findOne().lean();
    const users = await User.find().lean();

    const completed = users.filter(u => u.completed);
    const pending = users.filter(u => !u.completed);
    const totalFines = users.reduce((s, u) => s + (u.fine || 0), 0);
    const topStreak = [...users]
      .sort((a, b) => (b.streak || 0) - (a.streak || 0))
      .slice(0, 5)
      .map(u => ({
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
        posterImage: getPosterImage(status),
      },
      stats: {
        total: users.length,
        completed: completed.length,
        pending: pending.length,
        totalFines,
      },
      topStreak,
    };
  });
}

/**
 * Get weekly report summary (admin/trainer only) — cached 18h
 */
export async function getWeeklyReport() {
  return cached(WEEKLY_KEY, TTL_18H, async () => {
    const users = await User.find().lean();
    const sorted = [...users].sort((a, b) => (b.weeklySubmissions || 0) - (a.weeklySubmissions || 0));
    return sorted.map(u => ({
      name: u.name,
      userId: u.userId,
      weeklySubmissions: u.weeklySubmissions || 0,
      weeklyFine: u.weeklyFine || 0,
      streak: u.streak || 0,
    }));
  });
}

/**
 * Get monthly report summary (admin/trainer only) — cached 18h
 */
export async function getMonthlyReport() {
  return cached(MONTHLY_KEY, TTL_18H, async () => {
    const users = await User.find().lean();
    const sorted = [...users].sort((a, b) => (b.monthlySubmissions || 0) - (a.monthlySubmissions || 0));
    return sorted.map(u => ({
      name: u.name,
      userId: u.userId,
      monthlySubmissions: u.monthlySubmissions || 0,
      fine: u.fine || 0,
      streak: u.streak || 0,
    }));
  });
}

/**
 * Get full profile for logged-in user — cached 18h, invalidated on video upload
 */
export async function getUserProfile(phone) {
  return cached(userProfileKey(phone), TTL_18H, async () => {
    let user = await User.findOne({ 
      phone: { $in: [phone, phone.replace(/^91/, ""), `91${phone}`] } 
    }).lean();

    if (!user) {
      user = {
        name: "User",
        phone: phone,
        feedbackScores: [],
        streak: 0,
        fine: 0,
        completed: false,
        weeklySubmissions: 0,
        monthlySubmissions: 0,
      };
    }

    const status = await Status.findOne().lean();
    const allUsers = await User.find().lean();
    const completed = allUsers.filter(u => u.completed).length;
    const totalFines = allUsers.reduce((s, u) => s + (u.fine || 0), 0);
    const topStreak = [...allUsers]
      .sort((a, b) => (b.streak || 0) - (a.streak || 0))
      .slice(0, 5)
      .map(u => ({ 
        name: u.name, 
        userId: u.userId, 
        streak: u.streak || 0, 
        weeklySubmissions: u.weeklySubmissions || 0, 
        completed: u.completed || false 
      }));

    let dailyReport = null;
    let showReport = false;
    
    if (status?.dailyReportGenerated && status?.reportExpiresAt) {
      const now = new Date();
      if (now < new Date(status.reportExpiresAt)) {
        showReport = true;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        if (user && user._id) {
          dailyReport = await DailyReport.findOne({
            userId: user._id,
            date: todayStart,
          }).lean();
        }
      }
    }

    return {
      profile: {
        name: user.name,
        feedbackScores: user.feedbackScores || [],
        streak: user.streak || 0,
        fine: user.fine || 0,
        weeklyFine: user.weeklyFine || 0,
        completed: user.completed || false,
        weeklySubmissions: user.weeklySubmissions || 0,
        monthlySubmissions: user.monthlySubmissions || 0,
        linkedPhone: user.phone || null,
      },
      today: {
        questionSent: status?.questionSentToday || false,
        topic: status?.todayTopic || null,
        question: status?.todayQuestion || null,
        category: status?.todayCategory || null,
        posterImage: getPosterImage(status),
        isMonthlyReflection: status?.isMonthlyReflectionDay || false,
        isMonthlyGoals: status?.isMonthlyGoalsDay || false,
        isWeeklyReflection: status?.isWeeklyReflectionDay || false,
      },
      dailyReport: showReport ? dailyReport : null,
      showReport,
      reportExpiresAt: showReport ? status.reportExpiresAt : null,
      posterSendTime: status?.posterSendTime || "08:00",
      stats: {
        total: allUsers.length,
        completed,
        pending: allUsers.length - completed,
        totalFines,
      },
      topStreak,
    };
  });
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
    fine: user.fine || 0,
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
      questionSentToday: true,
    }
  }, { upsert: true });
  
  return { success: true };
}

/**
 * Get bot schedule settings (admin only)
 */
export async function getSettings() {
  let status = await Status.findOne().lean();
  if (!status) {
    status = await Status.create({});
  }
  
  return {
    posterSendTime: status.posterSendTime || "08:00",
    questionGenerateTime: status.questionGenerateTime || "07:00",
  };
}

/**
 * Update bot schedule settings (admin only)
 */
export async function updateSettings(posterSendTime, questionGenerateTime) {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const updates = {};
  
  if (posterSendTime !== undefined) {
    if (!timeRegex.test(posterSendTime)) {
      const error = new Error("Invalid posterSendTime format (HH:MM)");
      error.statusCode = 400;
      throw error;
    }
    updates.posterSendTime = posterSendTime;
  }
  
  if (questionGenerateTime !== undefined) {
    if (!timeRegex.test(questionGenerateTime)) {
      const error = new Error("Invalid questionGenerateTime format (HH:MM)");
      error.statusCode = 400;
      throw error;
    }
    updates.questionGenerateTime = questionGenerateTime;
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
  const { generateDailyReports } = await import("../../../api/scheduler.js");
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
      todayTopic: MONTHLY_REFLECTION_TOPIC,
      todayQuestion: reflectionText,
      todayCategory: MONTHLY_REFLECTION_CATEGORY,
    }
  }, { upsert: true });
  
  return { success: true, message: "Monthly reflection mode activated — refresh the app to see it" };
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
      isWeeklyReflectionDay: false,
      todayTopic: MONTHLY_GOALS_TOPIC,
      todayQuestion: goalsText,
      todayCategory: MONTHLY_GOALS_CATEGORY,
    }
  }, { upsert: true });
  
  return { success: true, message: "Monthly goal-setting mode activated — refresh the app to see it" };
}

/**
 * Force weekly reflection mode ON (admin only, for testing)
 */
export async function enableWeeklyReflection() {
  const { WEEKLY_REFLECTION_QUESTIONS, WEEKLY_REFLECTION_TOPIC, WEEKLY_REFLECTION_CATEGORY } = await import("../../../api/scheduler.js");
  const weeklyText = WEEKLY_REFLECTION_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n");
  
  await Status.updateOne({}, {
    $set: {
      questionSentToday: true,
      isWeeklyReflectionDay: true,
      isMonthlyReflectionDay: false,
      isMonthlyGoalsDay: false,
      todayTopic: WEEKLY_REFLECTION_TOPIC,
      todayQuestion: weeklyText,
      todayCategory: WEEKLY_REFLECTION_CATEGORY,
    }
  }, { upsert: true });
  
  return { success: true, message: "Weekly reflection mode activated — refresh the app to see it" };
}

/**
 * Turn off all special modes (admin only)
 */
export async function disableSpecialModes() {
  await Status.updateOne({}, {
    $set: {
      isMonthlyReflectionDay: false,
      isMonthlyGoalsDay: false,
      isWeeklyReflectionDay: false,
      questionSentToday: false,
      todayTopic: null,
      todayQuestion: null,
      todayCategory: null,
    }
  });
  
  return { success: true, message: "All special modes turned off" };
}
