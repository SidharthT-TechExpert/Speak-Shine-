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
import { deleteFromR2 } from "../backend/config/storage.js";

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

/** Returns true if today is Saturday (IST) */
function isSaturday() {
  const now = new Date();
  const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return istDate.getDay() === 6; // 6 = Saturday
}

async function publishDailyQuestion() {
  try {
    const { publishDailyQuestion: publishFromService } = await import("../backend/services/scheduler/questionSchedulerService.js");
    return await publishFromService();
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

      // ── 0. Publish due manual tasks (normal, story, picture, reflection, goals) ─────
      const { publishDueManualQuestion } = await import("../backend/services/scheduler/questionSchedulerService.js");
      const manualResult = await publishDueManualQuestion();
      if (manualResult?.published) {
        console.log(`[Scheduler] 📝 Due manual task published (${manualResult.type}): ${manualResult.topic}`);
        return;
      }

      // ── 1. Publish daily question / send poster at posterSendTime ───────
      const sendTime = s.posterSendTime || "08:00";
      const todayDate = getTodayIST();
      if (nowTime === sendTime) {
        if (!s.questionSentToday) {
          console.log(`[Scheduler] ⏰ Time matched: ${nowTime} — publishing question & dispatching poster`);
          const { publishDailyQuestion: publishFromService } = await import("../backend/services/scheduler/questionSchedulerService.js");
          await publishFromService();
        } else if (s.lastPosterStatus === "failed" || (s.lastPosterStatus !== "success" && s.lastPosterSentDate !== todayDate)) {
          console.log(`[Scheduler] ⏰ Time matched: ${nowTime} — question already published, dispatching poster to WhatsApp group`);
          try {
            const { sendDailyPosterToGroup } = await import("../backend/services/whatsapp/whatsappService.js");
            await sendDailyPosterToGroup();
          } catch (posterErr) {
            console.warn("[Scheduler] Poster dispatch failed:", posterErr.message);
          }
        }
      }

      // ── 2. Auto-generate questions at questionGenerateTime ───────────────
      const genTime = s.questionGenerateTime || "07:00";
      if (nowTime === genTime) {
        const count = await Question.countDocuments();
        if (count <= 14) {
          console.log(`[Scheduler] 🤖 Auto-generate time (${genTime}) — bank has ${count} questions, generating 14 more…`);
          generateAndInsertQuestions(14)
            .then(({ inserted, totalInDb }) =>
              console.log(`[Scheduler] ✅ Auto-generated ${inserted.length} questions. Bank total: ${totalInDb}`)
            )
            .catch(err =>
              console.error("[Scheduler] ❌ Auto-generate failed:", err.message)
            );
        } else {
          console.log(`[Scheduler] ℹ️  Auto-generate time (${genTime}) — bank has ${count} questions, no refill needed`);
        }
      }

      // ── 3. Auto-send daily submission report to WhatsApp group ──────────
      const reportEnabled = s.submissionReportEnabled !== false;
      if (reportEnabled) {
        const configuredTimes = Array.isArray(s.submissionReportTimes) && s.submissionReportTimes.length > 0
          ? s.submissionReportTimes
          : [s.submissionReportTime1 || "18:00", s.submissionReportTime2 || "21:00"].filter(Boolean);

        if (configuredTimes.includes(nowTime)) {
          if (s.lastSubmissionReportDate !== todayDate || s.lastSubmissionReportTime !== nowTime) {
            console.log(`[Scheduler] ⏰ Submission report time matched (${nowTime}) — dispatching to WhatsApp group...`);
            const { sendDailySubmissionReportToGroup } = await import("../backend/services/whatsapp/whatsappService.js");
            const matchedSlot = Array.isArray(s.submissionReportSlots) ? s.submissionReportSlots.find(slot => slot.time === nowTime) : null;
            const slotIdx = Array.isArray(s.submissionReportSlots) ? s.submissionReportSlots.findIndex(slot => slot.time === nowTime) : -1;

            try {
              await sendDailySubmissionReportToGroup({
                timeSlot: nowTime,
                templateType: matchedSlot?.templateType || "comprehensive",
                customTemplate: matchedSlot?.customTemplate || null,
              });

              // Mark slot as success
              const statusDoc = await Status.findOne();
              if (statusDoc && Array.isArray(statusDoc.submissionReportSlots) && slotIdx !== -1) {
                statusDoc.submissionReportSlots[slotIdx].lastSentDate = todayDate;
                statusDoc.submissionReportSlots[slotIdx].lastSentTime = nowTime;
                statusDoc.submissionReportSlots[slotIdx].lastStatus = "success";
                statusDoc.submissionReportSlots[slotIdx].lastError = null;
                statusDoc.submissionReportSlots[slotIdx].lastSentAt = new Date();
                statusDoc.lastSubmissionReportDate = todayDate;
                statusDoc.lastSubmissionReportTime = nowTime;
                statusDoc.markModified("submissionReportSlots");
                await statusDoc.save();
              } else {
                await Status.updateOne({}, { $set: { lastSubmissionReportDate: todayDate, lastSubmissionReportTime: nowTime } });
              }
              console.log(`[Scheduler] ✅ Auto submission report sent successfully for slot ${nowTime}`);
            } catch (err) {
              console.warn(`[Scheduler] ❌ Auto submission report failed for slot ${nowTime}:`, err.message);
              // Mark slot as failed with error reason
              try {
                const statusDoc = await Status.findOne();
                if (statusDoc && Array.isArray(statusDoc.submissionReportSlots) && slotIdx !== -1) {
                  statusDoc.submissionReportSlots[slotIdx].lastSentDate = todayDate;
                  statusDoc.submissionReportSlots[slotIdx].lastSentTime = nowTime;
                  statusDoc.submissionReportSlots[slotIdx].lastStatus = "failed";
                  statusDoc.submissionReportSlots[slotIdx].lastError = err.message || "Failed to dispatch WhatsApp report";
                  statusDoc.submissionReportSlots[slotIdx].lastSentAt = new Date();
                  statusDoc.lastSubmissionReportDate = todayDate;
                  statusDoc.lastSubmissionReportTime = nowTime;
                  statusDoc.markModified("submissionReportSlots");
                  await statusDoc.save();
                } else {
                  await Status.updateOne({}, { $set: { lastSubmissionReportDate: todayDate, lastSubmissionReportTime: nowTime } });
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.log("[Scheduler] Cron error:", err.message);
    }
  }, { timezone: TIMEZONE });

  // Catch-up on startup: if scheduled times already passed today
  setTimeout(async () => {
    try {
      const s = await Status.findOne().lean();
      if (!s) return;

      const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
      const nowMins = nowIST.getHours() * 60 + nowIST.getMinutes();

      const { publishDueManualStoryQuestion, publishDueManualPictureDescriptionQuestion } = await import("../backend/services/scheduler/questionSchedulerService.js");
      const storyResult = await publishDueManualStoryQuestion();
      if (storyResult?.published) {
        console.log(`[Scheduler] Catch-up: story summary published: ${storyResult.topic}`);
      }
      const pictureResult = await publishDueManualPictureDescriptionQuestion();
      if (pictureResult?.published) {
        console.log(`[Scheduler] Catch-up: picture description published: ${pictureResult.topic}`);
      }

      // ── Catch-up: publish question if posterSendTime passed ──────────────
      if (!s.questionSentToday) {
        const sendTime = s.posterSendTime || "08:00";
        const [sh, sm] = sendTime.split(":").map(Number);
        const sendMins = sh * 60 + sm;
        // If within 4-hour window after scheduled time
        if (nowMins >= sendMins && nowMins <= sendMins + 240) {
          console.log(`[Scheduler] Catch-up: ${sendTime} already passed, publishing now...`);
          const { publishDailyQuestion: publishFromService } = await import("../backend/services/scheduler/questionSchedulerService.js");
          await publishFromService();
        }
      } else if (s.lastPosterStatus === "failed" || (s.lastPosterStatus !== "success" && s.lastPosterSentDate !== todayDate)) {
        console.log(`[Scheduler] Catch-up: Question already published for today, but poster dispatch is pending/failed (${s.lastPosterStatus || "pending"}). Retrying dispatch...`);
        try {
          const { sendDailyPosterToGroup } = await import("../backend/services/whatsapp/whatsappService.js");
          await sendDailyPosterToGroup();
        } catch (catchUpPosterErr) {
          console.warn("[Scheduler] Catch-up poster dispatch failed:", catchUpPosterErr.message);
        }
      }

      // ── Catch-up: auto-generate if questionGenerateTime passed and bank is low ──
      const genTime = s.questionGenerateTime || "07:00";
      const [gh, gm] = genTime.split(":").map(Number);
      const genMins = gh * 60 + gm;
      // If generate time passed today (within 12h window) and bank is low
      if (nowMins >= genMins && nowMins <= genMins + 720) {
        const count = await Question.countDocuments();
        if (count <= 14) {
          console.log(`[Scheduler] Catch-up: generate time ${genTime} passed, bank has ${count} — generating now…`);
          generateAndInsertQuestions(14)
            .then(({ inserted, totalInDb }) =>
              console.log(`[Scheduler] ✅ Catch-up generated ${inserted.length} questions. Bank total: ${totalInDb}`)
            )
            .catch(err =>
              console.error("[Scheduler] ❌ Catch-up generate failed:", err.message)
            );
        }
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
 * Daily reset at midnight IST — delegates to dailyResetService (single source of truth)
 */
async function dailyReset() {
  const { performDailyReset } = await import("../backend/services/scheduler/dailyResetService.js");
  await performDailyReset();
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
//   2. Update streaks + freeze logic
//   3. Increment weekly/monthly counters
//   4. Reset completed flag + status flags
async function midnightJob() {
  // Step 1: generate reports first (needs current completed state)
  // Use the service version which includes streakFreeze + monthlyScore in report
  const { generateDailyReports: generateReports } = await import("../backend/services/scheduler/dailyReportService.js");
  await generateReports();
  // Step 2-4: streaks, counters, resets
  await dailyReset();
}

// ── Clean expired R2 videos + frames ────────────────────────────────────────
async function cleanExpiredVideos() {
  try {
    // Find reports expiring in the next hour OR already expired, that still have a video key or frame keys
    const cutoff = new Date(Date.now() + 60 * 60 * 1000); // now + 1hr buffer
    const toClean = await VideoReport.find({
      expiresAt: { $lt: cutoff },
      $or: [
        { videoKey:  { $ne: null } },
        { frameKeys: { $not: { $size: 0 } } },
      ],
    }).select("_id videoKey frameKeys").lean();

    if (toClean.length === 0) return;

    console.log(`[Scheduler] Cleaning ${toClean.length} expired/expiring report(s) from R2…`);

    for (const report of toClean) {
      // Delete main video
      if (report.videoKey) {
        await deleteFromR2(report.videoKey);
      }

      // Delete all browser-extracted frames
      if (report.frameKeys?.length > 0) {
        for (const fk of report.frameKeys) {
          await deleteFromR2(fk);
        }
        console.log(`[Scheduler] Deleted ${report.frameKeys.length} frame(s) for report ${report._id}`);
      }

      await VideoReport.updateOne(
        { _id: report._id },
        { $set: { videoKey: null, videoUrl: null, frameKeys: [] } }
      );

      // Delete all notifications related to this video
      try {
        const Notification = (await import("../models/notificationSchema.js")).default;
        await Notification.deleteMany({ reportId: report._id });
      } catch (notifErr) {
        console.error(`[Scheduler] Failed to delete notifications for report ${report._id}:`, notifErr.message);
      }
    }

    console.log(`[Scheduler] ✅ Cleaned ${toClean.length} report(s)`);
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

  // ── Month-End Prize Distribution Report Cron (23:59 IST / 11:59 PM IST on last day of month) ──
  // Runs 1 minute before 12:00 AM midnight reset so final monthly scores and totals are intact!
  cron.schedule("59 23 * * *", async () => {
    try {
      const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
      const tomorrowIST = new Date(nowIST);
      tomorrowIST.setDate(tomorrowIST.getDate() + 1);

      // Check if tomorrow is the 1st of the new month (i.e. today is the last day of the month)
      if (tomorrowIST.getDate() === 1) {
        const Status = (await import("../models/statusSchema.js")).default;
        const status = await Status.findOne().lean().catch(() => null);

        if (status?.monthEndReportAutoSend !== false) {
          console.log(`[Scheduler] 🏆 Month-end detected (${nowIST.toLocaleDateString("en-IN")}) — dispatching automated Month-End Prize Distribution Report at 11:59 PM IST...`);
          const { sendMonthEndPrizeReportToGroup } = await import("../backend/services/whatsapp/whatsappService.js");
          await sendMonthEndPrizeReportToGroup();
        } else {
          console.log("[Scheduler] ℹ️ Month-end prize report auto-send is disabled in settings.");
        }
      }
    } catch (err) {
      console.error("[Scheduler] ❌ Month-end prize report cron error:", err.message);
    }
  }, { timezone: TIMEZONE });

  // Run once on startup to catch any orphaned videos from previous sessions
  setTimeout(cleanExpiredVideos, 5000);
  
  console.log("[Scheduler] ✅ Daily reset scheduler running (00:00 midnight + 23:59 11:59PM month-end + 00:05 safety fallback)");
}
