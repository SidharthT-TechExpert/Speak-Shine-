/**
 * Migration: backfill freezeStreakProgress for existing users
 *
 * Streak Freeze is awarded only after 7 continuous days of submissions.
 * To protect existing users near their 7-day milestone (e.g. user at streak 12 is
 * 2 days away from their next shield), this migration initializes:
 *   freezeStreakProgress = (streak || 0) % 7
 *
 * Safe to run multiple times — idempotent (only touches users without freezeStreakProgress).
 *
 * Usage:
 *   node scripts/migrate-freeze-progress.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGODB_URI not set in .env");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("✅ Connected to MongoDB");

const User = mongoose.model(
  "User",
  new mongoose.Schema({}, { strict: false, collection: "users" })
);

const users = await User.find({
  $or: [
    { freezeStreakProgress: { $exists: false } },
    { freezeStreakProgress: null },
  ],
}).lean();

console.log(`Found ${users.length} user(s) needing freezeStreakProgress initialization`);

let updated = 0;

for (const u of users) {
  const streak = u.streak || 0;
  const progress = streak % 7;

  await User.updateOne(
    { _id: u._id },
    { $set: { freezeStreakProgress: progress } }
  );

  console.log(`  ✓ ${u.name || u.phone || u._id}: streak=${streak} → freezeStreakProgress=${progress}/7`);
  updated++;
}

console.log(`\n🎉 Done! Updated ${updated} user(s).`);
await mongoose.disconnect();
