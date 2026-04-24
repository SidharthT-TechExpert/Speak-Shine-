/**
 * generateQuestions.js — CLI script to generate AI questions.
 *
 * Usage:
 *   node generateQuestions.js          → generates 7 questions (1 per category)
 *   node generateQuestions.js 14       → generates 14 questions (2 per category)
 *   node generateQuestions.js 21       → generates 21 questions (3 per category)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { generateAndInsertQuestions } from "./ai/questionGenerator.js";

dotenv.config();

const countArg = parseInt(process.argv[2] ?? "7");
if (isNaN(countArg) || countArg <= 0) {
  console.error("Usage: node generateQuestions.js [total_count]");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
console.log("✅ DB Connected");
console.log(`🤖 Generating ${countArg} questions...\n`);

try {
  const { inserted, skipped, totalInDb } = await generateAndInsertQuestions(countArg);

  if (skipped.length > 0) {
    console.log(`⚠️  Skipped ${skipped.length} question(s):`);
    skipped.forEach(({ reason, q }) => console.log(`   - [${reason}] "${q.topic ?? "?"}"`));
    console.log();
  }

  console.log(`🎉 Inserted ${inserted.length} new questions!\n`);
  console.log("📋 New questions added:");
  inserted.forEach((q, i) => {
    console.log(`\n${i + 1}. [${q.category}]`);
    console.log(`   Topic:    ${q.topic}`);
    console.log(`   Question: ${q.question}`);
  });

  console.log(`\n📊 Total questions in DB: ${totalInDb}`);
} catch (err) {
  console.error("❌ Error:", err.message);
} finally {
  await mongoose.connection.close();
}
