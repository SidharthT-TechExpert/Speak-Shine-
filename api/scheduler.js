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

const TIMEZONE = "Asia/Kolkata";

async function publishDailyQuestion() {
  try {
    const statusCheck = await Status.findOne();
    if (statusCheck?.questionSentToday) {
      return; // already published today
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

    // Increment weekly/monthly submissions for users who completed today
    await User.updateMany({ completed: true }, { $inc: { weeklySubmissions: 1, monthlySubmissions: 1 } });
    console.log("[Scheduler] ✅ Incremented weekly/monthly submissions");

    // Reset all users' daily completed flag
    await User.updateMany({}, { completed: false });
    console.log("[Scheduler] ✅ Reset completed flags");

    // On Sunday midnight (IST) reset weekly submissions + weekly fines
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const dayOfWeek = nowIST.getDay(); // 0 = Sunday
    if (dayOfWeek === 0) {
      await User.updateMany({}, { $set: { weeklySubmissions: 0, weeklyFine: 0 } });
      console.log("[Scheduler] ✅ Weekly submissions + fines reset (Sunday)");
    }

    // On 1st of month reset monthly submissions
    const dayOfMonth = nowIST.getDate();
    if (dayOfMonth === 1) {
      await User.updateMany({}, { $set: { monthlySubmissions: 0 } });
      console.log("[Scheduler] ✅ Monthly submissions reset (1st of month)");
    }

    // Reset status flags
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

export function startDailyReset() {
  console.log("[Scheduler] Starting daily reset scheduler...");
  
  // Generate reports at 00:00 (12:00 AM) IST
  cron.schedule("0 0 * * *", generateDailyReports, { timezone: TIMEZONE });
  
  // Run reset at 00:05 (12:05 AM) IST
  cron.schedule("5 0 * * *", dailyReset, { timezone: TIMEZONE });
  
  console.log("[Scheduler] ✅ Daily reset scheduler running (00:00 reports, 00:05 reset)");
}
