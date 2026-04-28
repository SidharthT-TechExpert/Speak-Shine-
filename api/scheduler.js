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
import { generateAndInsertQuestions } from "../ai/questionGenerator.js";
import { resetStatus } from "../resetStatus.js";
import { deleteFromR2 } from "../r2.js";

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

export const MONTHLY_REFLECTION_TOPIC = "Monthly Reflection";
export const MONTHLY_REFLECTION_CATEGORY = "Monthly Reflection";

/** Returns true if today is the last day of the month (IST) */
function isLastDayOfMonth() {
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
  const tomorrow = new Date(nowIST);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDate() === 1;
}

async function publishDailyQuestion() {
  try {
    const statusCheck = await Status.findOne();
    if (statusCheck?.questionSentToday) {
      return; // already published today
    }

    // ── Last day of month → publish Monthly Reflection instead ──────────
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
 * Daily reset at 12:05 AM IST
 * Resets daily flags, increments counters, handles weekly/monthly resets
 */
async function dailyReset() {
  try {
    console.log("[Scheduler] 🔄 Running daily reset...");

    const FINE_AMOUNT          = Number(process.env.FINE_AMOUNT) || 2;
    const STREAK_REWARD_DAYS   = 7;
    const STREAK_REWARD_AMOUNT = 5;

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
    // Fetch updated streak values after the increment above
    const rewardUsers = await User.find({ completed: true }).lean();
    for (const u of rewardUsers) {
      const currentStreak = u.streak || 0; // already incremented in DB
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

    // ── 5. Reset daily completed flag ─────────────────────────────────────
    await User.updateMany({}, { completed: false });
    console.log("[Scheduler] ✅ Reset completed flags");

    // ── 6. Sunday: reset weekly submissions + weekly fines ────────────────
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const dayOfWeek = nowIST.getDay(); // 0 = Sunday
    if (dayOfWeek === 0) {
      await User.updateMany({}, { $set: { weeklySubmissions: 0, weeklyFine: 0 } });
      console.log("[Scheduler] ✅ Weekly submissions + fines reset (Sunday)");
    }

    // ── 7. 1st of month: reset monthly submissions ────────────────────────
    const dayOfMonth = nowIST.getDate();
    if (dayOfMonth === 1) {
      await User.updateMany({}, { $set: { monthlySubmissions: 0 } });
      console.log("[Scheduler] ✅ Monthly submissions reset (1st of month)");
    }

    // ── 8. Reset status flags ─────────────────────────────────────────────
    await resetStatus();
    console.log("[Scheduler] ✅ Status flags reset");

    console.log("[Scheduler] 🔄 Daily reset complete");
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

  // Clean up expired R2 videos every hour
  cron.schedule("0 * * * *", cleanExpiredVideos, { timezone: TIMEZONE });

  // Run once on startup to catch any orphaned videos from previous sessions
  setTimeout(cleanExpiredVideos, 5000);
  
  console.log("[Scheduler] ✅ Daily reset scheduler running (00:00 midnight job)");
}
