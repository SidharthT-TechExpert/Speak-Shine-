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

console.log(`\n👥 Total Users: ${users.length}\n`);
console.log("─".repeat(95));
console.log(`${"#".padEnd(4)} ${"Name".padEnd(20)} ${"Done".padEnd(8)} ${"Streak".padEnd(10)} ${"Weekly Submissions".padEnd(20)} ${"Fine".padEnd(10)} ${"Weekly Fine".padEnd(12)}`);
console.log("─".repeat(95));

users.forEach((u, i) => {
  const name = (u.name || u.userId?.split("@")[0].split(":")[0] || "unknown").slice(0, 18);
  const done = u.completed ? "✅ Yes" : "❌ No";
  const streak = u.streak || 0;
  const streakBadge = streak >= 7 ? `🔥${streak}` : streak >= 3 ? `⚡${streak}` : `📅${streak}`;
  const fine = `₹${u.fine || 0}`;
  const weeklyFine = `₹${u.weeklyFine || 0}`;
  const weeklySubmissions = String(u.weeklySubmissions || 0);
  console.log(`${String(i + 1).padEnd(4)} ${name.padEnd(20)} ${done.padEnd(8)} ${streakBadge.padEnd(10)} ${weeklySubmissions.padEnd(20)} ${fine.padEnd(10)} ${weeklyFine.padEnd(12)}`);
});

console.log("─".repeat(95));
const totalFine = users.reduce((sum, u) => sum + (u.fine || 0), 0);
const totalWeeklyFine = users.reduce((sum, u) => sum + (u.weeklyFine || 0), 0);
const completed = users.filter((u) => u.completed).length;
const topStreak = Math.max(...users.map(u => u.streak || 0));
console.log(`✅ Completed: ${completed} / ${users.length}`);
console.log(`💰 Total Fine Pool: ₹${totalFine}`);
console.log(`💸 Total Weekly Fines: ₹${totalWeeklyFine}`);
console.log(`🔥 Top Streak: ${topStreak} days\n`);

process.exit(0);
