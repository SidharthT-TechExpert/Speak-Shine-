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

  if (newStreak > 0 && newStreak % 7 === 0) {
    updatedUser.streakFreeze = (updatedUser.streakFreeze || 0) + 1;
    awards.streakFreezeAwarded = true;
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

  it("awards +1 streakFreeze shield at 7-day milestone", () => {
    const userAt6 = {
      _id: "user_1",
      name: "Sidharth",
      streak: 6,
      lastStreakDate: "2026-09-09",
      completed: false,
      streakFreeze: 0,
      earnedBadges: [],
    };

    const res = simulateAtomicStreakUpdate(userAt6, TODAY);
    expect(res.user.streak).toBe(7);
    expect(res.awards.streakFreezeAwarded).toBe(true);
    expect(res.user.streakFreeze).toBe(1);
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
