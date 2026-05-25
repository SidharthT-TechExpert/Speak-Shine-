/**
 * Vitest tests — run from project root only:
 *   npm test
 *   npx vitest run backend/services/scheduler/dailyResetService.test.js
 *
 * For plain node on a server (no Vitest):
 *   node backend/services/scheduler/test-daily-reset-standalone.js
 */
import { describe, it, expect } from "vitest";
import { computeMissedDayFineUpdate } from "./dailyResetService.js";

const FINE = 2;

/** In-memory simulation of missed-day + submitter streak rules (no DB). */
function simulateReset(users) {
  const out = users.map((u) => ({ ...u }));

  for (const u of out.filter((x) => !x.completed)) {
    const update = computeMissedDayFineUpdate(u.fine, FINE);
    if (update.setFine !== undefined) {
      u.fine = update.setFine;
      if (update.weeklyFineInc) u.weeklyFine = (u.weeklyFine || 0) + update.weeklyFineInc;
    } else {
      u.fine = (u.fine || 0) + update.incFine;
      u.weeklyFine = (u.weeklyFine || 0) + update.weeklyFineInc;
    }
    if (update.fineCharged) u.streak = 0;
  }

  for (const u of out.filter((x) => x.completed)) {
    u.streak = (u.streak || 0) + 1;
  }

  return out;
}

describe("computeMissedDayFineUpdate", () => {
  it("absorbs full fine when buffer covers it", () => {
    expect(computeMissedDayFineUpdate(-5, FINE)).toEqual({
      fineCharged: false,
      setFine: -3,
      weeklyFineInc: 0,
    });
  });

  it("charges overflow when buffer is partially exhausted", () => {
    expect(computeMissedDayFineUpdate(-1, FINE)).toEqual({
      fineCharged: true,
      setFine: 1,
      weeklyFineInc: 1,
    });
  });

  it("charges full fine when no buffer", () => {
    expect(computeMissedDayFineUpdate(0, FINE)).toEqual({
      fineCharged: true,
      incFine: FINE,
      weeklyFineInc: FINE,
    });
  });

  it("charges full fine when fine is already positive", () => {
    expect(computeMissedDayFineUpdate(4, FINE)).toEqual({
      fineCharged: true,
      incFine: FINE,
      weeklyFineInc: FINE,
    });
  });
});

describe("daily reset simulation (fine vs streak)", () => {
  it("miss with buffer: fine absorbed, streak kept", () => {
    const [u] = simulateReset([
      { name: "buffered", completed: false, fine: -5, streak: 14, weeklyFine: 0 },
    ]);
    expect(u.fine).toBe(-3);
    expect(u.streak).toBe(14);
    expect(u.weeklyFine).toBe(0);
  });

  it("miss without buffer: fine added, streak reset", () => {
    const [u] = simulateReset([
      { name: "missed", completed: false, fine: 0, streak: 10, weeklyFine: 0 },
    ]);
    expect(u.fine).toBe(2);
    expect(u.streak).toBe(0);
    expect(u.weeklyFine).toBe(2);
  });

  it("submitted: streak +1, no fine", () => {
    const [u] = simulateReset([
      { name: "submitted", completed: true, fine: 0, streak: 6, weeklyFine: 0 },
    ]);
    expect(u.fine).toBe(0);
    expect(u.streak).toBe(7);
  });

  it("mixed group: only fined misses lose streak", () => {
    const result = simulateReset([
      { name: "a", completed: true, fine: 0, streak: 3, weeklyFine: 0 },
      { name: "b", completed: false, fine: -4, streak: 12, weeklyFine: 1 },
      { name: "c", completed: false, fine: 1, streak: 5, weeklyFine: 0 },
    ]);
    const a = result.find((u) => u.name === "a");
    const b = result.find((u) => u.name === "b");
    const c = result.find((u) => u.name === "c");

    expect(a.streak).toBe(4);
    expect(b.fine).toBe(-2);
    expect(b.streak).toBe(12);
    expect(c.fine).toBe(3);
    expect(c.streak).toBe(0);
  });
});
