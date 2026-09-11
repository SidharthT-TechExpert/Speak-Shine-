import { describe, it, expect } from "vitest";
import { getNewStreakBadgeIds } from "../../utils/streakBadges.js";

/**
 * In-memory simulation of the atomic MongoDB update filter and operation:
 * Query: { _id, lastStreakDate: { $ne: todayIST } }
 * Update: { $inc: { streak: 1 }, $set: { lastStreakDate: todayIST, completed: true } }
 */
function simulateAtomicStreakUpdate(user, todayIST) {
  // Condition: lastStreakDate !== todayIST
  if (user.lastStreakDate === todayIST) {
    return { modifiedCount: 0, user: { ...user } };
  }

  const newStreak = (user.streak || 0) + 1;
  const updatedUser = {
    ...user,
    streak: newStreak,
    lastStreakDate: todayIST,
    completed: true,
    fineChargedToday: false,
  };

  // Milestone awards
  const awards = {
    streakFreezeAwarded: false,
    newBadges: [],
  };

  // Continuous 7-day Streak Freeze Progress
  const FREEZE_AWARD_DAYS = 7;
  let currentProgress = user.freezeStreakProgress;
  if (typeof currentProgress !== "number") {
    currentProgress = (user.streak || 0) % FREEZE_AWARD_DAYS;
  }
  const nextProgress = currentProgress + 1;

  if (nextProgress >= FREEZE_AWARD_DAYS) {
    updatedUser.streakFreeze = (updatedUser.streakFreeze || 0) + 1;
    updatedUser.freezeStreakProgress = 0;
    awards.streakFreezeAwarded = true;
  } else {
    updatedUser.freezeStreakProgress = nextProgress;
  }

  const newBadgeIds = getNewStreakBadgeIds(newStreak, user.earnedBadges || []);
  if (newBadgeIds.length > 0) {
    updatedUser.earnedBadges = [...(updatedUser.earnedBadges || []), ...newBadgeIds];
    awards.newBadges = newBadgeIds;
  }

  return { modifiedCount: 1, user: updatedUser, awards };
}

/**
 * In-memory simulation of midnight applyStreakUpdates catch-up filter:
 * Query: { completed: true, lastStreakDate: { $ne: todayIST } }
 */
function simulateMidnightCatchup(users, todayIST) {
  return users.map(user => {
    // Only catch-up users who completed but somehow did not get lastStreakDate stamped
    if (user.completed && user.lastStreakDate !== todayIST) {
      return {
        ...user,
        streak: (user.streak || 0) + 1,
        lastStreakDate: todayIST,
        fineChargedToday: false,
      };
    }
    return { ...user };
  });
}

describe("Atomic Streak Counting System (Option B)", () => {
  const TODAY = "2026-09-10";
  const TOMORROW = "2026-09-11";

  it("increments streak on first video analysis of the day", () => {
    const user = {
      _id: "user_1",
      name: "Sidharth",
      streak: 5,
      lastStreakDate: "2026-09-09",
      completed: false,
      streakFreeze: 0,
      earnedBadges: [],
    };

    const res1 = simulateAtomicStreakUpdate(user, TODAY);
    expect(res1.modifiedCount).toBe(1);
    expect(res1.user.streak).toBe(6);
    expect(res1.user.lastStreakDate).toBe(TODAY);
    expect(res1.user.completed).toBe(true);
  });

  it("prevents double-increment when user uploads again on the same day (re-submission edge case)", () => {
    const user = {
      _id: "user_1",
      name: "Sidharth",
      streak: 5,
      lastStreakDate: "2026-09-09",
      completed: false,
      streakFreeze: 0,
      earnedBadges: [],
    };

    // 1st submission today
    const res1 = simulateAtomicStreakUpdate(user, TODAY);
    expect(res1.modifiedCount).toBe(1);
    expect(res1.user.streak).toBe(6);

    // 2nd submission today (same day, e.g. re-recording for higher score)
    const res2 = simulateAtomicStreakUpdate(res1.user, TODAY);
    expect(res2.modifiedCount).toBe(0);
    expect(res2.user.streak).toBe(6); // Streak stays 6!
    expect(res2.user.lastStreakDate).toBe(TODAY);

    // 3rd submission today
    const res3 = simulateAtomicStreakUpdate(res2.user, TODAY);
    expect(res3.modifiedCount).toBe(0);
    expect(res3.user.streak).toBe(6); // Still 6!
  });

  it("increments streak again when submitting on the next day", () => {
    const user = {
      _id: "user_1",
      name: "Sidharth",
      streak: 6,
      lastStreakDate: TODAY,
      completed: true,
      streakFreeze: 0,
      earnedBadges: [],
    };

    // Tomorrow submission
    const resTomorrow = simulateAtomicStreakUpdate(user, TOMORROW);
    expect(resTomorrow.modifiedCount).toBe(1);
    expect(resTomorrow.user.streak).toBe(7);
    expect(resTomorrow.user.lastStreakDate).toBe(TOMORROW);
  });

  it("awards +1 streakFreeze shield at 7 continuous days and resets progress to 0", () => {
    const userAt6 = {
      _id: "user_1",
      name: "Sidharth",
      streak: 6,
      freezeStreakProgress: 6,
      lastStreakDate: "2026-09-09",
      completed: false,
      streakFreeze: 0,
      earnedBadges: [],
    };

    const res = simulateAtomicStreakUpdate(userAt6, TODAY);
    expect(res.user.streak).toBe(7);
    expect(res.awards.streakFreezeAwarded).toBe(true);
    expect(res.user.streakFreeze).toBe(1);
    expect(res.user.freezeStreakProgress).toBe(0); // Cycle reset to 0/7
  });

  it("handles user at streak 12 needing exactly 2 days to earn freeze shield", () => {
    // Existing user with streak 12 has freezeStreakProgress = 12 % 7 = 5
    let user = {
      _id: "user_12",
      name: "Student12",
      streak: 12,
      freezeStreakProgress: 5,
      lastStreakDate: "2026-09-08",
      completed: false,
      streakFreeze: 1,
      earnedBadges: [],
    };

    // Day 1: Submits -> streak becomes 13, progress becomes 6 (not awarded yet)
    const day1Res = simulateAtomicStreakUpdate(user, "2026-09-09");
    expect(day1Res.user.streak).toBe(13);
    expect(day1Res.user.freezeStreakProgress).toBe(6);
    expect(day1Res.awards.streakFreezeAwarded).toBe(false);
    expect(day1Res.user.streakFreeze).toBe(1);

    // Day 2: Submits -> streak becomes 14, progress reaches 7 -> awarded! Progress resets to 0
    const day2Res = simulateAtomicStreakUpdate(day1Res.user, "2026-09-10");
    expect(day2Res.user.streak).toBe(14);
    expect(day2Res.awards.streakFreezeAwarded).toBe(true);
    expect(day2Res.user.streakFreeze).toBe(2);
    expect(day2Res.user.freezeStreakProgress).toBe(0); // Reset for next 7-day cycle
  });

  it("does not award freeze shield if continuous streak was broken by a freeze day", () => {
    // User had streak 6, missed a day so freeze shield was used, preserving streak at 6
    // BUT continuous streak progress was reset to 0
    const userAfterFreezeUsed = {
      _id: "user_broken",
      name: "ProtectedUser",
      streak: 6,
      freezeStreakProgress: 0, // Reset to 0 on missed day!
      lastStreakDate: "2026-09-08",
      completed: false,
      streakFreeze: 0,
      earnedBadges: [],
    };

    // Next day user submits -> streak 7 (7 % 7 === 0), but continuous progress is only 1!
    const res = simulateAtomicStreakUpdate(userAfterFreezeUsed, TODAY);
    expect(res.user.streak).toBe(7);
    expect(res.user.freezeStreakProgress).toBe(1);
    expect(res.awards.streakFreezeAwarded).toBe(false); // NOT awarded because not 7 continuous days!
    expect(res.user.streakFreeze).toBe(0);
  });

  it("awards milestone badge when milestone reached", () => {
    const userAt6 = {
      _id: "user_1",
      name: "Sidharth",
      streak: 6,
      lastStreakDate: "2026-09-09",
      completed: false,
      streakFreeze: 0,
      earnedBadges: ["first-steps", "momentum-builder"],
    };

    const res = simulateAtomicStreakUpdate(userAt6, TODAY);
    expect(res.user.streak).toBe(7);
    expect(res.awards.newBadges).toContain("consistent-speaker");
    expect(res.user.earnedBadges).toContain("consistent-speaker");
  });

  it("midnight reset does not double-increment users whose streak already incremented today", () => {
    const submitters = [
      // User A: submitted video today -> streak already incremented to 8 at analysis time
      { _id: "user_a", name: "Alice", streak: 8, lastStreakDate: TODAY, completed: true },
      // User B: submitted video today -> streak already incremented to 15 at analysis time
      { _id: "user_b", name: "Bob", streak: 15, lastStreakDate: TODAY, completed: true },
      // User C: edge-case admin override (completed=true but lastStreakDate wasn't set)
      { _id: "user_c", name: "Charlie", streak: 3, lastStreakDate: "2026-09-09", completed: true },
    ];

    const afterMidnight = simulateMidnightCatchup(submitters, TODAY);

    // Alice and Bob already got their streak today -> MUST NOT increment again at midnight!
    expect(afterMidnight[0].streak).toBe(8);
    expect(afterMidnight[1].streak).toBe(15);

    // Charlie was an unincremented admin edge case -> safely caught up once
    expect(afterMidnight[2].streak).toBe(4);
    expect(afterMidnight[2].lastStreakDate).toBe(TODAY);
  });
});
