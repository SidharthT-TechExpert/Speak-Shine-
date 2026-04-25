/**
 * humanizedb.js — standalone script to humanize all DB questions.
 * Run: node humanizedb.js
 */
import dotenv from "dotenv";
import { connectDB } from "./db.js";
import { humanizeAllDbQuestions } from "./ai/questionGenerator.js";
import Question from "./models/questionSchema.js";

dotenv.config();
await connectDB();

const total = await Question.countDocuments();
console.log(`\n📊 Total questions in DB: ${total}`);

if (total === 0) {
  console.log("⚠️  No questions found. Run /genq first.");
  process.exit(0);
}

console.log("🤖 Starting humanize pass...\n");

const { updated, skipped, total: tot } = await humanizeAllDbQuestions();

console.log(`\n✅ Done!`);
console.log(`✍️  Rewritten : ${updated}`);
console.log(`⏭️  Already natural: ${skipped}`);
console.log(`📊 Total processed: ${tot}\n`);

process.exit(0);
