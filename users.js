import dotenv from "dotenv";
import { connectDB } from "./db.js";
import User from "./models/userSchema.js";

dotenv.config();
await connectDB();

const users = await User.find().sort({ fine: -1 });

if (!users.length) {
  console.log("⚠️ No users found in DB.");
  process.exit(0);
}

// ── Avg feedback score helper ─────────────────────────────────────────────
const avgScore = (scores, key) => {
  if (!scores?.length) return "—";
  const vals = scores.map(s => s[key]).filter(v => v != null);
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
};

const LINE = "─".repeat(130);

console.log(`\n👥 Total Users: ${users.length}\n`);
console.log(LINE);
console.log(
  `${"#".padEnd(4)} ${"Name".padEnd(20)} ${"Done".padEnd(6)} ${"Streak".padEnd(8)} ${"Monthly".padEnd(9)} ${"Weekly".padEnd(8)} ${"Fine".padEnd(8)} ${"Wk Fine".padEnd(9)} ${"Fluency".padEnd(9)} ${"Grammar".padEnd(9)} ${"Confid.".padEnd(9)} ${"Vocab".padEnd(7)} ${"Subs"}`
);
console.log(LINE);

users.forEach((u, i) => {
  const name    = (u.name || u.userId?.split("@")[0].split(":")[0] || "unknown").slice(0, 18);
  const done    = u.completed ? "✅" : "❌";
  const streak  = u.streak || 0;
  const badge   = streak >= 7 ? `🔥${streak}` : streak >= 3 ? `⚡${streak}` : `📅${streak}`;
  const monthly = String(u.monthlySubmissions || 0);
  const weekly  = String(u.weeklySubmissions || 0);
  const fine    = `₹${u.fine || 0}`;
  const wkFine  = `₹${u.weeklyFine || 0}`;
  const scores  = u.feedbackScores || [];
  const fl      = avgScore(scores, "fluency");
  const gr      = avgScore(scores, "grammar");
  const co      = avgScore(scores, "confidence");
  const vo      = avgScore(scores, "vocabulary");
  const subs    = scores.length;

  console.log(
    `${String(i + 1).padEnd(4)} ${name.padEnd(20)} ${done.padEnd(6)} ${badge.padEnd(8)} ${monthly.padEnd(9)} ${weekly.padEnd(8)} ${fine.padEnd(8)} ${wkFine.padEnd(9)} ${fl.padEnd(9)} ${gr.padEnd(9)} ${co.padEnd(9)} ${vo.padEnd(7)} ${subs}`
  );
});

console.log(LINE);

const totalFine    = users.reduce((sum, u) => sum + (u.fine || 0), 0);
const totalWkFine  = users.reduce((sum, u) => sum + (u.weeklyFine || 0), 0);
const completed    = users.filter(u => u.completed).length;
const topStreak    = Math.max(...users.map(u => u.streak || 0));
const totalMonthly = users.reduce((sum, u) => sum + (u.monthlySubmissions || 0), 0);

console.log(`✅ Completed Today : ${completed} / ${users.length}`);
console.log(`📅 Monthly Subs    : ${totalMonthly} total across all users`);
console.log(`💰 Total Fine Pool : ₹${totalFine}`);
console.log(`💸 Weekly Fines    : ₹${totalWkFine}`);
console.log(`🔥 Top Streak      : ${topStreak} days\n`);

process.exit(0);
