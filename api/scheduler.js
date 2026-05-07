/**
 * scheduler.js — Standalone question scheduler for the webapp.
 * Runs inside api/server.js so it works independently of the WhatsApp bot.
 * Every minute checks if it's time to publish today's question to the webapp.
 */

import cron from "node-cron";
import Status from "../models/statusSchema.js";
import Question from "../models/questionSchema.js";
import User from "../models/userSchema.js";
import DailyReport from "../models/dailyReportSchema.js";
import VideoReport from "../models/videoReportSchema.js";
import { generateAndInsertQuestions } from "../backend/services/ai/questionGenerator.js";
import { deleteFromR2 } from "../r2.js";
import { invalidateAll } from "../backend/services/cache/cacheService.js";

const TIMEZONE = "Asia/Kolkata";

// Monthly reflection questions — shown on the last day of every month
export const MONTHLY_REFLECTION_QUESTIONS = [
  "How many reviews did you attend this month?",
  "How many reviews passed and how many failed? Why did you fail?",
  "How many extensions did you take this month?",
  "What is your current growth and progress in the program?",
  "What did you do this month to improve your communication skill?",
  "What is your communication skill level now compared to last month?",
];
export const MONTHLY_REFLECTION_TOPIC    = "Monthly Reflection";
export const MONTHLY_REFLECTION_CATEGORY = "Monthly Reflection";

// Monthly goal-setting questions — shown on the 1st of every month
export const MONTHLY_GOALS_QUESTIONS = [
  "What is your main goal for this month in the program?",
  "What is your dream or target you are working toward right now?",
  "What specific steps will you take this month to improve your communication?",
  "What was your biggest challenge last month and how will you overcome it this month?",
  "How many reviews are you planning to attend this month?",
  "What will you do differently this month to grow faster?",
];
export const MONTHLY_GOALS_TOPIC    = "Monthly Goal Setting";
export const MONTHLY_GOALS_CATEGORY = "Monthly Goals";

// Weekly reflection questions — shown every Sunday
export const WEEKLY_REFLECTION_QUESTIONS = [
  "Did you attend your review this week? If yes, did you pass or fail? Why?",
  "How many days did you submit your speaking video this week?",
  "What was the best speaking moment you had this week?",
  "What was the most difficult part of speaking this week?",
  "What new word or phrase did you learn and use this week?",
  "What is your focus for next week — in both review preparation and communication?",
];
export const WEEKLY_REFLECTION_TOPIC    = "Weekly Reflection";
export const WEEKLY_REFLECTION_CATEGORY = "Weekly Reflection";

/** Returns true if today is the last day of the month (IST) */
function isLastDayOfMonth() {
  const now = new Date();
  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const lastDate = new Date(istDate.getFullYear(), istDate.getMonth() + 1, 0).getDate();
  return istDate.getDate() === lastDate;
}

/** Returns true if today is the 1st of the month (IST) */
function isFirstDayOfMonth() {
  const now = new Date();
  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return istDate.getDate() === 1;
}

/** Returns true if today is Sunday (IST) */
function isSunday() {
  const now = new Date();
  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return istDate.getDay() === 0; // 0 = Sunday
}

async function publishDailyQuestion() {
  try {
    const statusCheck = await Status.findOne();
    if (statusCheck?.questionSentToday) {
      return; // already published today
    }

    // ── 1st of month → Monthly Goal Setting (takes priority over Sunday) ─
    if (isFirstDayOfMonth()) {
      const goalsText = MONTHLY_GOALS_QUESTIONS
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n");
      await Status.updateOne({}, {
        $set: {
          questionSentToday: true,
          isMonthlyGoalsDay: true,
          todayTopic: MONTHLY_GOALS_TOPIC,
          todayQuestion: goalsText,
          todayCategory: MONTHLY_GOALS_CATEGORY,
        }
      }, { upsert: true });
      console.log("[Scheduler] 🎯 Monthly Goal Setting published for 1st of month");
      return;
    }

    // ── Last day of month → Monthly Reflection (takes priority over Sunday)
    if (isLastDayOfMonth()) {
      const reflectionText = MONTHLY_REFLECTION_QUESTIONS
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n");
      await Status.updateOne({}, {
        $set: {
          questionSentToday: true,
          isMonthlyReflectionDay: true,
          todayTopic: MONTHLY_REFLECTION_TOPIC,
          todayQuestion: reflectionText,
          todayCategory: MONTHLY_REFLECTION_CATEGORY,
        }
      }, { upsert: true });
      console.log("[Scheduler] 🌟 Monthly Reflection published for last day of month");
      return;
    }

    // ── Sunday → Weekly Reflection ────────────────────────────────────────
    if (isSunday()) {
      const weeklyText = WEEKLY_REFLECTION_QUESTIONS
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n");
      await Status.updateOne({}, {
        $set: {
          questionSentToday: true,
          isWeeklyReflectionDay: true,
          todayTopic: WEEKLY_REFLECTION_TOPIC,
          todayQuestion: weeklyText,
          todayCategory: WEEKLY_REFLECTION_CATEGORY,
        }
      }, { upsert: true });
      console.log("[Scheduler] 📅 Weekly Reflection published for Sunday");
      return;
    }

    // Ensure question bank has questions
    let count = await Question.countDocuments();
    if (count === 0) {
      console.log("[Scheduler] Question bank empty — auto-generating 14...");
      try {
        const { totalInDb } = await generateAndInsertQuestions(14);
        count = totalInDb;
        console.log(`[Scheduler] Generated questions. Total: ${count}`);
      } catch (err) {
        console.log("[Scheduler] Auto-generate failed:", err.message);
        return;
      }
    } else if (count <= 7) {
      // Refill in background
      generateAndInsertQuestions(14)
        .then(({ inserted, totalInDb }) => console.log(`[Scheduler] Auto-refill: +${inserted.length} questions. Total: ${totalInDb}`))
        .catch(err => console.log("[Scheduler] Background refill failed:", err.message));
    }

    // Pick a question avoiding recent categories
    const statusDoc = await Status.findOne();
    const recentCategories = statusDoc?.recentCategories || [];

    let q = null;
    if (recentCategories.length > 0) {
      const fresh = await Question.aggregate([
        { $match: { category: { $nin: recentCategories } } },
        { $sample: { size: 1 } },
      ]);
      if (fresh?.length) q = fresh;
    }
    if (!q || !q.length) {
      q = await Question.aggregate([{ $sample: { size: 1 } }]);
    }
    if (!q || !q.length) {
      console.log("[Scheduler] No questions available");
      return;
    }

    const question = q[0];
    const updatedRecent = question.category
      ? [...new Set([...recentCategories, question.category])].slice(-7)
      : recentCategories;

    await Status.updateOne({}, {
      $set: {
        questionSentToday: true,
        todayTopic: question.topic || null,
        todayQuestion: question.question || null,
        todayCategory: question.category || null,
        recentCategories: updatedRecent,
      }
    }, { upsert: true });

    await Question.findByIdAndDelete(question._id);
    console.log(`[Scheduler] ✅ Question published | Topic: ${question.topic} | Category: ${question.category}`);
  } catch (err) {
    console.log("[Scheduler] Error:", err.message);
  }
}

export function startScheduler() {
  console.log("[Scheduler] Starting question scheduler...");

  // Run every minute — check if it's time based on DB setting
  cron.schedule("* * * * *", async () => {
    try {
      const s = await Status.findOne().lean();
      if (!s) return;

      const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
      const nowTime = `${String(nowIST.getHours()).padStart(2,"0")}:${String(nowIST.getMinutes()).padStart(2,"0")}`;

      const sendTime = s.posterSendTime || "08:00";
      if (nowTime === sendTime && !s.questionSentToday) {
        console.log(`[Scheduler] ⏰ Time matched: ${nowTime} — publishing question`);
        await publishDailyQuestion();
      }
    } catch (err) {
      console.log("[Scheduler] Cron error:", err.message);
    }
  }, { timezone: TIMEZONE });

  // Catch-up: if scheduled time already passed today and question not sent yet
  setTimeout(async () => {
    try {
      const s = await Status.findOne().lean();
      if (!s || s.questionSentToday) return;

      const sendTime = s.posterSendTime || "08:00";
      const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
      const nowMins = nowIST.getHours() * 60 + nowIST.getMinutes();
      const [sh, sm] = sendTime.split(":").map(Number);
      const sendMins = sh * 60 + sm;

      // If within 4-hour window after scheduled time
      if (nowMins >= sendMins && nowMins <= sendMins + 240) {
        console.log(`[Scheduler] Catch-up: ${sendTime} already passed, publishing now...`);
        await publishDailyQuestion();
      }
    } catch (err) {
      console.log("[Scheduler] Catch-up error:", err.message);
    }
  }, 5000); // wait 5s for DB to connect

  console.log("[Scheduler] ✅ Question scheduler running");
}

/**
 * Returns today's date string in IST as "YYYY-MM-DD"
 */
function getTodayIST() {
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
  const y = nowIST.getFullYear();
  const m = String(nowIST.getMonth() + 1).padStart(2, "0");
  const d = String(nowIST.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Daily reset at 12:05 AM IST
 * Resets daily flags, increments counters, handles weekly/monthly resets
 */
async function dailyReset() {
  try {
    console.log("[Scheduler] 🔄 Running daily reset...");

    const FINE_AMOUNT          = Number(process.env.FINE_AMOUNT) || 2;
    const STREAK_REWARD_DAYS   = 7;
    const STREAK_REWARD_AMOUNT = 5;
    const AUTO_DISABLE_SKIPS   = 3; // disable after this many consecutive missed days

    // ── 1. Apply fine to users who missed today (completed: false) ────────
    const missedResult = await User.updateMany(
      { completed: false },
      { $inc: { fine: FINE_AMOUNT, weeklyFine: FINE_AMOUNT } }
    );
    console.log(`[Scheduler] ✅ Fine ₹${FINE_AMOUNT} applied to ${missedResult.modifiedCount} missed users`);

    // ── 2. Streak: increment for submitted, reset for missed ──────────────
    await User.updateMany({ completed: true  }, { $inc: { streak: 1 } });
    await User.updateMany({ completed: false }, { $set: { streak: 0 } });
    console.log("[Scheduler] ✅ Streaks updated");

    // ── 3. 7-day streak reward: deduct ₹5 from fine (min 0) ──────────────
    const rewardUsers = await User.find({ completed: true }).lean();
    for (const u of rewardUsers) {
      const currentStreak = u.streak || 0;
      if (currentStreak > 0 && currentStreak % STREAK_REWARD_DAYS === 0) {
        const deduct = Math.min(u.fine || 0, STREAK_REWARD_AMOUNT);
        if (deduct > 0) {
          await User.updateOne({ _id: u._id }, { $inc: { fine: -deduct } });
          console.log(`[Scheduler] 🎁 Streak reward: ${u.name || u.phone} -₹${deduct} fine (${currentStreak} day streak)`);
        }
      }
    }

    // ── 4. Increment weekly/monthly submission counters ───────────────────
    await User.updateMany({ completed: true }, { $inc: { weeklySubmissions: 1, monthlySubmissions: 1 } });
    console.log("[Scheduler] ✅ Incremented weekly/monthly submissions");

    // ── 5. Consecutive skip tracking + auto-disable ───────────────────────
    // Reset skip counter for users who submitted today
    await User.updateMany({ completed: true }, { $set: { consecutiveSkips: 0 } });

    // Increment skip counter for users who missed today
    await User.updateMany({ completed: false }, { $inc: { consecutiveSkips: 1 } });

    // Find users who have now hit the threshold
    const toDisable = await User.find({
      consecutiveSkips: { $gte: AUTO_DISABLE_SKIPS },
    }).select("phone name consecutiveSkips").lean();

    if (toDisable.length > 0) {
      const Auth = (await import("../models/authSchema.js")).default;
      const { forceLogoutUser } = await import("../backend/sockets/chatSocket.js");

      for (const u of toDisable) {
        const phone = u.phone;
        if (!phone) continue;

        // Disable the auth account and revoke all tokens
        const updated = await Auth.findOneAndUpdate(
          { phone, isActive: true }, // only disable if currently active
          { $set: { isActive: false, refreshTokens: [] } },
          { new: true }
        );

        if (updated) {
          console.log(`[Scheduler] 🚫 Auto-disabled ${u.name || phone} after ${u.consecutiveSkips} consecutive skips`);
          // Push real-time force-logout if they are online
          forceLogoutUser(phone);
        }
      }
    }

    // ── 6. Reset daily completed flag ─────────────────────────────────────
    await User.updateMany({}, { completed: false });
    console.log("[Scheduler] ✅ Reset completed flags");

    // ── 7. Sunday: reset weekly submissions + weekly fines ────────────────
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const dayOfWeek = nowIST.getDay(); // 0 = Sunday
    if (dayOfWeek === 0) {
      await User.updateMany({}, { $set: { weeklySubmissions: 0, weeklyFine: 0 } });
      console.log("[Scheduler] ✅ Weekly submissions + fines reset (Sunday)");
    }

    // ── 8. 1st of month: reset monthly submissions ────────────────────────
    const dayOfMonth = nowIST.getDate();
    if (dayOfMonth === 1) {
      await User.updateMany({}, { $set: { monthlySubmissions: 0 } });
      console.log("[Scheduler] ✅ Monthly submissions reset (1st of month)");
    }

    // ── 9. Reset status flags ─────────────────────────────────────────────
    await Status.updateOne({}, {
      $set: {
        questionSentToday: false,
        dailyReportGenerated: false,
        isMonthlyReflectionDay: false,
        isMonthlyGoalsDay: false,
        isWeeklyReflectionDay: false,
        // Clear today's question so stale question doesn't show after midnight
        todayQuestion: null,
        todayTopic: null,
        todayCategory: null,
        todayPosterImage: null,
        lastResetDate: getTodayIST(),   // ← stamp today so we can detect missed resets
      }
    }, { upsert: true });
    console.log("[Scheduler] ✅ Status flags reset");

    console.log("[Scheduler] 🔄 Daily reset complete");

    // Invalidate all dashboard caches so everyone gets fresh data on next request
    await invalidateAll();
  } catch (err) {
    console.error("[Scheduler] ❌ Daily reset error:", err);
  }
}

/**
 * Generate daily reports at 12:00 AM IST
 * Creates a report for each user showing yesterday's performance
 */
export async function generateDailyReports() {
  try {
    console.log("[Scheduler] 📊 Generating daily reports...");

    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const reportDate = new Date(nowIST);
    reportDate.setHours(0, 0, 0, 0);
    
    // Report expires at 8 AM today
    const expiresAt = new Date(reportDate);
    expiresAt.setHours(8, 0, 0, 0);

    // Get all users
    const users = await User.find({}).lean();
    
    // Get yesterday's date range (for finding video reports)
    const yesterdayStart = new Date(reportDate);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(reportDate);

    let reportsCreated = 0;

    for (const user of users) {
      // Find yesterday's video report
      const videoReport = await VideoReport.findOne({
        userId: user._id,
        submittedAt: { $gte: yesterdayStart, $lt: yesterdayEnd },
        status: "completed"
      }).sort({ submittedAt: -1 }).lean();

      const report = {
        userId: user._id,
        phone: user.phone,
        date: reportDate,
        submitted: !!videoReport,
        submittedAt: videoReport?.submittedAt || null,
        
        // Scores from yesterday's video
        fluency: videoReport?.analysis?.fluency || null,
        grammar: videoReport?.analysis?.grammar || null,
        confidence: videoReport?.analysis?.confidence || null,
        vocabulary: videoReport?.analysis?.vocabulary || null,
        
        // Visual scores
        eyeContact: videoReport?.analysis?.eyeContact || null,
        bodyLanguage: videoReport?.analysis?.bodyLanguage || null,
        facialExpression: videoReport?.analysis?.facialExpression || null,
        
        // Current stats
        streak: user.streak || 0,
        weeklySubmissions: user.weeklySubmissions || 0,
        monthlySubmissions: user.monthlySubmissions || 0,
        
        // Fine information
        fine: user.fine || 0,
        weeklyFine: user.weeklyFine || 0,
        fineAdded: !videoReport, // Fine was added if they didn't submit
        
        // Feedback
        overallComment: videoReport?.analysis?.overallComment || null,
        strongPoints: videoReport?.analysis?.strongPoints || [],
        suggestions: videoReport?.analysis?.suggestions || [],
        
        expiresAt,
      };

      await DailyReport.create(report);
      reportsCreated++;
    }

    // Update status to mark reports as generated
    await Status.updateOne({}, {
      $set: {
        dailyReportGenerated: true,
        reportExpiresAt: expiresAt,
      }
    }, { upsert: true });

    console.log(`[Scheduler] ✅ Generated ${reportsCreated} daily reports (expire at 08:00)`);
  } catch (err) {
    console.error("[Scheduler] ❌ Daily report generation error:", err);
  }
}

// ── Midnight job: reports → fines/streaks → reset ───────────────────────────
// Runs at exactly 12:00 AM IST. Order matters:
//   1. Generate daily reports (reads completed flag before it's reset)
//   2. Apply fines to missed users
//   3. Update streaks
//   4. Apply 7-day streak reward
//   5. Increment weekly/monthly counters
//   6. Reset completed flag
async function midnightJob() {
  // Step 1: generate reports first (needs current completed state)
  await generateDailyReports();
  // Step 2-6: fines, streaks, resets
  await dailyReset();
}

// ── Clean expired R2 videos ──────────────────────────────────────────────────
async function cleanExpiredVideos() {
  try {
    // Find reports expiring in the next hour OR already expired, that still have a video key
    const cutoff = new Date(Date.now() + 60 * 60 * 1000); // now + 1hr buffer
    const toClean = await VideoReport.find({
      expiresAt: { $lt: cutoff },
      videoKey:  { $ne: null },
    }).select("_id videoKey").lean();

    if (toClean.length === 0) return;

    console.log(`[Scheduler] Cleaning ${toClean.length} expired/expiring video(s) from R2…`);

    for (const report of toClean) {
      await deleteFromR2(report.videoKey);
      await VideoReport.updateOne({ _id: report._id }, { $set: { videoKey: null, videoUrl: null } });
    }

    console.log(`[Scheduler] ✅ Cleaned ${toClean.length} video(s)`);
  } catch (err) {
    console.error("[Scheduler] Video cleanup error:", err.message);
  }
}

export function startDailyReset() {
  console.log("[Scheduler] Starting daily reset scheduler...");
  
  // Single midnight job: generate reports → apply fines/streaks → reset flags
  cron.schedule("0 0 * * *", midnightJob, { timezone: TIMEZONE });

  // ── Safety fallback at 12:05 AM ──────────────────────────────────────────
  // If the midnight job failed or was skipped (e.g. server was down at 00:00),
  // this catches it 5 minutes later by checking lastResetDate.
  cron.schedule("5 0 * * *", async () => {
    try {
      const s = await Status.findOne().lean();
      const today = getTodayIST();

      if (s?.lastResetDate === today) {
        // Reset already ran successfully at midnight — nothing to do
        return;
      }

      console.log("[Scheduler] ⚠️  Midnight reset missed — running safety fallback at 00:05...");
      await midnightJob();
    } catch (err) {
      console.error("[Scheduler] ❌ Safety fallback error:", err);
    }
  }, { timezone: TIMEZONE });

  // Clean up expired R2 videos every hour
  cron.schedule("0 * * * *", cleanExpiredVideos, { timezone: TIMEZONE });

  // Run once on startup to catch any orphaned videos from previous sessions
  setTimeout(cleanExpiredVideos, 5000);
  
  console.log("[Scheduler] ✅ Daily reset scheduler running (00:00 midnight + 00:05 safety fallback)");
}
