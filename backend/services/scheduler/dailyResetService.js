/**
 * Daily Reset Service
 * Business logic for daily resets, fines, streaks, and counters
 */

import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";
import StreakRecord from "../../../models/streakRecordSchema.js";
import { getNewStreakBadgeIds } from "../../utils/streakBadges.js";

const TIMEZONE = "Asia/Kolkata";

export function computeMissedDayFineUpdate(currentFine = 0, dailyFine = 2) {
  if (currentFine < 0) {
    const remainingBuffer = currentFine + dailyFine;
    if (remainingBuffer <= 0) {
      return { fineCharged: false, setFine: remainingBuffer, weeklyFineInc: 0 };
    }
    return { fineCharged: true, setFine: remainingBuffer, weeklyFineInc: remainingBuffer };
  }

  return { fineCharged: true, incFine: dailyFine, weeklyFineInc: dailyFine };
}

/**
 * Update streaks at midnight.
 * - Submitted today  → streak +1; award +1 streakFreeze at every 7-day milestone
 * - Missed today     → consume 1 streakFreeze (streak kept) OR reset streak to 0
 */
export async function applyStreakUpdates() {
  try {
    const FREEZE_AWARD_DAYS = 7; // earn 1 freeze every 7-day streak

    // ── 1. Submitted today ───────────────────────────────────────────────────
    // Streaks are now incremented in real-time at video analysis completion (Option B)
    // with atomic lastStreakDate guard.
    // At midnight, we only run a safety catch-up for any user marked completed: true
    // whose streak was not yet incremented today (e.g. manual admin override).
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const y  = nowIST.getFullYear();
    const mo = String(nowIST.getMonth() + 1).padStart(2, "0");
    const d  = String(nowIST.getDate()).padStart(2, "0");
    const todayIST = `${y}-${mo}-${d}`;

    // Clear fineChargedToday for all submitters
    await User.updateMany(
      { completed: true },
      { $set: { fineChargedToday: false } }
    );

    // Safety fallback: only increment submitters who were not already incremented today
    const pendingSubmitters = await User.find({
      completed: true,
      lastStreakDate: { $ne: todayIST },
    }).lean();

    let freezesAwarded = 0;
    for (const u of pendingSubmitters) {
      const updateRes = await User.updateOne(
        { _id: u._id, lastStreakDate: { $ne: todayIST } },
        { $inc: { streak: 1 }, $set: { lastStreakDate: todayIST } }
      );
      if (updateRes.modifiedCount === 1) {
        const newStreak = (u.streak || 0) + 1;
        const newBadgeIds = getNewStreakBadgeIds(newStreak, u.earnedBadges || []);
        if (newBadgeIds.length > 0) {
          await User.updateOne({ _id: u._id }, { $addToSet: { earnedBadges: { $each: newBadgeIds } } });
          console.log(`[DailyReset] 🏅 Badges awarded to ${u.name}: ${newBadgeIds.join(", ")}`);
        }
        if (newStreak > 0 && newStreak % FREEZE_AWARD_DAYS === 0) {
          await User.updateOne({ _id: u._id }, { $inc: { streakFreeze: 1 } });
          freezesAwarded++;
          console.log(`[DailyReset] 🧊 StreakFreeze awarded to ${u.name} (streak=${newStreak})`);
        }
      }
    }

    // ── 2. Missed today → use freeze or reset streak ───────────────────────
    const missedUsers = await User.find({ completed: false }).lean();
    let freezesUsed = 0;
    let streaksReset = 0;

    for (const u of missedUsers) {
      if ((u.streakFreeze || 0) > 0) {
        // Consume one freeze — streak survives
        await User.updateOne(
          { _id: u._id },
          { $inc: { streakFreeze: -1 }, $set: { fineChargedToday: false } }
        );
        freezesUsed++;
        console.log(`[DailyReset] 🧊 StreakFreeze used for ${u.name} (streak=${u.streak} preserved)`);
      } else {
        // No freeze — reset streak
        await User.updateOne(
          { _id: u._id },
          { $set: { streak: 0, fineChargedToday: false } }
        );
        streaksReset++;
      }
    }

    // ── 3. Update all-time streak record (Hall of Fame) ───────────────────
    try {
      const updatedUsers = await User.find({}).lean();
      const topUser = updatedUsers.reduce((best, u) =>
        (u.streak || 0) > (best ? (best.streak || 0) : 0) ? u : best, null);

      if (topUser && (topUser.streak || 0) > 0) {
        const existing = await StreakRecord.findOne();
        if (!existing || topUser.streak > existing.streak) {
          await StreakRecord.findOneAndUpdate(
            {},
            {
              name: topUser.name || topUser.userId || "Unknown",
              userId: topUser.userId || null,
              streak: topUser.streak,
              achievedAt: new Date(),
            },
            { upsert: true, new: true }
          );
          console.log(`[DailyReset] 🏆 New all-time streak record: ${topUser.name} — ${topUser.streak} days`);
        }
      }
    } catch (recErr) {
      console.error("[DailyReset] Streak record update failed:", recErr);
    }

    return { streaksReset, freezesAwarded, freezesUsed };
  } catch (err) {
    console.error("[DailyReset] Streak update error:", err);
    throw err;
  }
}

/**
 * Increment weekly and monthly submission counters
 */
export async function incrementSubmissionCounters() {
  try {
    const result = await User.updateMany(
      { completed: true },
      { $inc: { weeklySubmissions: 1, monthlySubmissions: 1 } }
    );

    return {
      updated: result.modifiedCount
    };
  } catch (err) {
    console.error("[DailyReset] Increment counters error:", err);
    throw err;
  }
}

/**
 * Reset daily completed flags
 */
export async function resetDailyFlags() {
  try {
    const result = await User.updateMany({}, { completed: false, fineChargedToday: false, todayScore: null });

    return {
      reset: result.modifiedCount
    };
  } catch (err) {
    console.error("[DailyReset] Reset flags error:", err);
    throw err;
  }
}

/**
 * Reset weekly submissions and fines (Sunday only)
 */
export async function resetWeeklyCounters() {
  try {
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const dayOfWeek = nowIST.getDay(); // 0 = Sunday

    if (dayOfWeek !== 0) {
      return { isSunday: false, reset: false };
    }

    const result = await User.updateMany(
      {},
      { $set: { weeklySubmissions: 0 } }
    );

    return {
      isSunday: true,
      reset: true,
      updated: result.modifiedCount
    };
  } catch (err) {
    console.error("[DailyReset] Reset weekly error:", err);
    throw err;
  }
}

/**
 * Reset monthly submissions and payment status (1st of month only)
 * Every month starts a new subscription cycle with a 2-day free upload window (1st & 2nd).
 */
export async function resetMonthlyCounters() {
  try {
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const dayOfMonth = nowIST.getDate();

    if (dayOfMonth !== 1) {
      return { isFirstDay: false, reset: false };
    }

    const result = await User.updateMany(
      {},
      {
        $set: {
          monthlySubmissions: 0,
          monthlyScore: 0,
          lastScoreDate: null,
          todayScore: null,
          paid: false,
          razorpayOrderId: null,
          razorpayPaymentId: null,
          paidAt: null,
        },
      }
    );

    return {
      isFirstDay: true,
      reset: true,
      updated: result.modifiedCount
    };
  } catch (err) {
    console.error("[DailyReset] Reset monthly error:", err);
    throw err;
  }
}

/**
 * Reset status flags
 */
export async function resetStatusFlags() {
  try {
    await Status.updateOne({}, {
      $set: {
        questionSentToday: false,
        dailyReportGenerated: false,
        isMonthlyReflectionDay: false,
        isMonthlyGoalsDay: false,
        isStorySummaryDay: false,
        isPictureDescriptionDay: false,
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
        todayQuestion: null,
        todayTopic: null,
        todayCategory: null,
        todayPosterImage: null,
        todayVocabulary: [],
      }
    }, { upsert: true });

    return { reset: true };
  } catch (err) {
    console.error("[DailyReset] Reset status error:", err);
    throw err;
  }
}

/**
 * Complete daily reset process
 * Runs all reset tasks in order
 */
export async function performDailyReset() {
  try {
    console.log("[DailyReset] 🔄 Running daily reset...");

    // 1. Update streaks only (no fines, no auto-disable)
    const streakResult = await applyStreakUpdates();
    if (streakResult.streaksReset > 0) {
      console.log(`[DailyReset] ✅ Streak reset for ${streakResult.streaksReset} user(s) who missed (no freeze)`);
    }
    if (streakResult.freezesUsed > 0) {
      console.log(`[DailyReset] 🧊 ${streakResult.freezesUsed} streak freeze(s) consumed — streaks protected`);
    }
    if (streakResult.freezesAwarded > 0) {
      console.log(`[DailyReset] 🧊 ${streakResult.freezesAwarded} streak freeze(s) awarded (7-day milestone)`);
    }
    console.log("[DailyReset] ✅ Streaks incremented for submitters");

    // 2. Increment submission counters
    const countersResult = await incrementSubmissionCounters();
    console.log("[DailyReset] ✅ Incremented weekly/monthly submissions");

    // 3. Reset daily flags
    const flagsResult = await resetDailyFlags();
    console.log("[DailyReset] ✅ Reset completed flags");

    // 4. Sunday: reset weekly
    const weeklyResult = await resetWeeklyCounters();
    if (weeklyResult.isSunday) {
      console.log("[DailyReset] ✅ Weekly submissions reset (Sunday)");
    }

    // 5. 1st of month: reset monthly
    const monthlyResult = await resetMonthlyCounters();
    if (monthlyResult.isFirstDay) {
      console.log("[DailyReset] ✅ Monthly submissions reset (1st of month)");
    }

    // 6. Reset status flags + vocabulary + stamp lastResetDate
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const y = nowIST.getFullYear();
    const mo = String(nowIST.getMonth() + 1).padStart(2, "0");
    const d = String(nowIST.getDate()).padStart(2, "0");
    const todayIST = `${y}-${mo}-${d}`;

    await Status.updateOne({}, {
      $set: {
        questionSentToday: false,
        dailyReportGenerated: false,
        isMonthlyReflectionDay: false,
        isMonthlyGoalsDay: false,
        isStorySummaryDay: false,
        isPictureDescriptionDay: false,
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
        todayQuestion: null,
        todayTopic: null,
        todayCategory: null,
        todayPosterImage: null,
        todayVocabulary: [],
        lastResetDate: todayIST,
        lastSubmissionReportDate: null,
        lastSubmissionReportTime: null,
      }
    }, { upsert: true });

    // Reset auto-send slot statuses for the new day
    const statusDoc = await Status.findOne();
    if (statusDoc && Array.isArray(statusDoc.submissionReportSlots)) {
      statusDoc.submissionReportSlots = statusDoc.submissionReportSlots.map(slot => ({
        time: slot.time,
        templateType: slot.templateType || "comprehensive",
        customTemplate: slot.customTemplate || "",
        lastSentDate: null,
        lastSentTime: null,
        lastStatus: "pending",
        lastError: null,
        lastSentAt: null,
      }));
      statusDoc.markModified("submissionReportSlots");
      await statusDoc.save();
    }
    console.log("[DailyReset] ✅ Status flags + vocabulary + submission slot statuses reset");

    console.log("[DailyReset] 🔄 Daily reset complete");

    return {
      success: true,
      streaksReset: streakResult.streaksReset,
      countersUpdated: countersResult.updated,
      flagsReset: flagsResult.reset,
      weeklyReset: weeklyResult.reset,
      monthlyReset: monthlyResult.reset,
    };
  } catch (err) {
    console.error("[DailyReset] ❌ Daily reset error:", err);
    throw err;
  }
}
