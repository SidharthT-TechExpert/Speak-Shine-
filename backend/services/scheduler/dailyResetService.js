/**
 * Daily Reset Service
 * Business logic for daily resets, fines, streaks, and counters
 */

import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";

const TIMEZONE = "Asia/Kolkata";

/**
 * Apply daily fines and update streaks
 * Runs at midnight IST
 */
export async function applyDailyFinesAndStreaks() {
  try {
    const FINE_AMOUNT = Number(process.env.FINE_AMOUNT) || 2;
    const STREAK_REWARD_DAYS = 7;
    const STREAK_REWARD_AMOUNT = 5;

    // ── 1. Apply fine to users who missed today (completed: false) ────────
    const missedResult = await User.updateMany(
      { completed: false },
      { $inc: { fine: FINE_AMOUNT, weeklyFine: FINE_AMOUNT } }
    );

    // ── 2. Streak: increment for submitted, reset for missed ──────────────
    await User.updateMany({ completed: true }, { $inc: { streak: 1 } });
    await User.updateMany({ completed: false }, { $set: { streak: 0 } });

    // ── 3. 7-day streak reward: deduct ₹5 from fine (min 0) ──────────────
    const rewardUsers = await User.find({ completed: true }).lean();
    const rewardedUsers = [];
    
    for (const u of rewardUsers) {
      const currentStreak = u.streak || 0;
      if (currentStreak > 0 && currentStreak % STREAK_REWARD_DAYS === 0) {
        const deduct = Math.min(u.fine || 0, STREAK_REWARD_AMOUNT);
        if (deduct > 0) {
          await User.updateOne({ _id: u._id }, { $inc: { fine: -deduct } });
          rewardedUsers.push({
            name: u.name || u.phone,
            deducted: deduct,
            streak: currentStreak
          });
        }
      }
    }

    return {
      finesApplied: missedResult.modifiedCount,
      fineAmount: FINE_AMOUNT,
      streaksUpdated: true,
      rewardedUsers
    };
  } catch (err) {
    console.error("[DailyReset] Apply fines error:", err);
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
    const result = await User.updateMany({}, { completed: false });

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
      { $set: { weeklySubmissions: 0, weeklyFine: 0 } }
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
 * Reset monthly submissions (1st of month only)
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
      { $set: { monthlySubmissions: 0 } }
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
        isWeeklyReflectionDay: false,
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

    // 1. Apply fines and update streaks
    const finesResult = await applyDailyFinesAndStreaks();
    console.log(`[DailyReset] ✅ Fine ₹${finesResult.fineAmount} applied to ${finesResult.finesApplied} missed users`);
    console.log("[DailyReset] ✅ Streaks updated");
    
    if (finesResult.rewardedUsers.length > 0) {
      finesResult.rewardedUsers.forEach(u => {
        console.log(`[DailyReset] 🎁 Streak reward: ${u.name} -₹${u.deducted} fine (${u.streak} day streak)`);
      });
    }

    // 2. Increment submission counters
    const countersResult = await incrementSubmissionCounters();
    console.log("[DailyReset] ✅ Incremented weekly/monthly submissions");

    // 3. Reset daily flags
    const flagsResult = await resetDailyFlags();
    console.log("[DailyReset] ✅ Reset completed flags");

    // 4. Sunday: reset weekly
    const weeklyResult = await resetWeeklyCounters();
    if (weeklyResult.isSunday) {
      console.log("[DailyReset] ✅ Weekly submissions + fines reset (Sunday)");
    }

    // 5. 1st of month: reset monthly
    const monthlyResult = await resetMonthlyCounters();
    if (monthlyResult.isFirstDay) {
      console.log("[DailyReset] ✅ Monthly submissions reset (1st of month)");
    }

    // 6. Reset status flags
    await resetStatusFlags();
    console.log("[DailyReset] ✅ Status flags reset");

    console.log("[DailyReset] 🔄 Daily reset complete");

    return {
      success: true,
      finesApplied: finesResult.finesApplied,
      streakRewards: finesResult.rewardedUsers.length,
      countersUpdated: countersResult.updated,
      flagsReset: flagsResult.reset,
      weeklyReset: weeklyResult.reset,
      monthlyReset: monthlyResult.reset
    };
  } catch (err) {
    console.error("[DailyReset] ❌ Daily reset error:", err);
    throw err;
  }
}
