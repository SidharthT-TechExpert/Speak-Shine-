/**
 * Standalone daily-reset logic check (no Vitest, no DB).
 *
 * From project root:
 *   node backend/services/scheduler/test-daily-reset-standalone.js
 *
 * Uses FINE_AMOUNT from env (default 2), same as production reset.
 *
 * Do NOT run dailyResetService.test.js with node — use: npm test
 */

import { computeMissedDayFineUpdate } from "./dailyResetService.js";

const FINE = Number(process.env.FINE_AMOUNT) || 2;
let passed = 0;
let failed = 0;

function assertEqual(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual:   ${JSON.stringify(actual)}`);
  }
}

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

console.log(`\n[DailyReset] Standalone logic tests (FINE_AMOUNT=${FINE})\n`);

console.log("computeMissedDayFineUpdate:");
assertEqual("buffer absorb", computeMissedDayFineUpdate(-5, FINE), {
  fineCharged: false,
  setFine: -5 + FINE,
  weeklyFineInc: 0,
});
assertEqual("buffer partial", computeMissedDayFineUpdate(-1, FINE), {
  fineCharged: true,
  setFine: -1 + FINE,
  weeklyFineInc: -1 + FINE,
});
assertEqual("no buffer", computeMissedDayFineUpdate(0, FINE), {
  fineCharged: true,
  incFine: FINE,
  weeklyFineInc: FINE,
});

console.log("\nsimulated midnight reset:");
const [buffered] = simulateReset([
  { name: "buffered", completed: false, fine: -5, streak: 14, weeklyFine: 0 },
]);
assertEqual("miss+buffer keeps streak", buffered.streak, 14);
assertEqual("miss+buffer fine", buffered.fine, -5 + FINE);

const [missed] = simulateReset([
  { name: "missed", completed: false, fine: 0, streak: 10, weeklyFine: 0 },
]);
assertEqual("miss+fine resets streak", missed.streak, 0);
assertEqual("miss+fine amount", missed.fine, FINE);

const [submitted] = simulateReset([
  { name: "submitted", completed: true, fine: 0, streak: 6, weeklyFine: 0 },
]);
assertEqual("submit increments streak", submitted.streak, 7);

const bufferFine = -(FINE + 1); // always fully absorbed for any FINE_AMOUNT
const mixed = simulateReset([
  { name: "a", completed: true, fine: 0, streak: 3, weeklyFine: 0 },
  { name: "b", completed: false, fine: bufferFine, streak: 12, weeklyFine: 1 },
  { name: "c", completed: false, fine: 1, streak: 5, weeklyFine: 0 },
]);
const b = mixed.find((u) => u.name === "b");
const c = mixed.find((u) => u.name === "c");
assertEqual("mixed: buffered streak", b.streak, 12);
assertEqual("mixed: buffered fine", b.fine, bufferFine + FINE);
assertEqual("mixed: fined streak reset", c.streak, 0);
assertEqual("mixed: fined amount", c.fine, 1 + FINE);

console.log(`\n[DailyReset] ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
