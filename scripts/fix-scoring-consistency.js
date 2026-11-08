/**
 * scripts/fix-scoring-consistency.js
 *
 * Finds and fixes any VideoReport and User records with scoring inconsistencies:
 * 1. Breakdown sum mismatching compositeScore (e.g. 18.2 + 7.5 + 10 + 20 + 6 = 61.7 vs 34).
 * 2. Sunday bonus doubling tracking (baseScore vs bonusScore).
 * 3. Updates User's todayScore, monthlyScore, and feedbackScores points.
 *
 * Usage: node scripts/fix-scoring-consistency.js [--apply]
 */

import "dotenv/config";
import mongoose from "mongoose";
import { calculateCompositeScore } from "../backend/services/video/submitGate.js";

const applyChanges = process.argv.includes("--apply");

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("No MongoDB URI configured in .env");
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log(`Connected to MongoDB. Mode: ${applyChanges ? "APPLY CHANGES" : "DRY RUN (pass --apply to execute)"}\n`);

  const statusDoc = await mongoose.connection.db.collection("statuses").findOne({});

  // Find all completed reports from the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const reports = await mongoose.connection.db.collection("videoreports")
    .find({
      status: "completed",
      "analysis.compositeScore": { $ne: null },
      $or: [
        { submittedAt: { $gte: sevenDaysAgo } },
        { createdAt: { $gte: sevenDaysAgo } }
      ]
    })
    .sort({ submittedAt: -1, _id: -1 })
    .toArray();

  console.log(`Checking ${reports.length} recent completed report(s)...\n`);

  let inconsistentCount = 0;

  for (const r of reports) {
    const a = r.analysis || {};
    const bd = a.scoreBreakdown || {};
    const cs = a.compositeScore;
    const isPic = r.challengeType === "picture_description" || a.challengeType === "picture_description" || bd.isPictureDescription === true;

    const breakdownSum = isPic
      ? Math.round(((bd.communication || 0) + (bd.content || 0) + (bd.vocabulary || 0) + (bd.duration || 0) + (bd.growth || 0)) * 100) / 100
      : Math.round(((bd.length || 0) + (bd.vocabUsed || 0) + (bd.topic || 0) + (bd.comm || 0) + (bd.growth || 0)) * 100) / 100;

    const diff = Math.abs(cs - breakdownSum);
    const hasDiscrepancy = diff > 1.0;

    const subDate = r.submittedAt || r.createdAt || new Date();
    const dateIST = new Date(new Date(subDate).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const isSunday = dateIST.getDay() === 0;

    if (hasDiscrepancy || (isSunday && (a.bonusScore == null || a.sundayBonus !== true))) {
      inconsistentCount++;
      console.log(`--------------------------------------------------`);
      console.log(`Report [${r._id}] for ${r.phone || "Unknown"}:`);
      console.log(`  Date: ${subDate.toISOString()} (IST Day: ${dateIST.getDay() === 0 ? "Sunday" : "Weekday"})`);
      console.log(`  Type: ${isPic ? "picture_description" : "normal/story"}`);
      console.log(`  Current compositeScore: ${cs}`);
      console.log(`  Current breakdown sum: ${breakdownSum} (diff: ${diff.toFixed(2)})`);

      // Fetch user history for growth calculation
      const userDoc = r.phone ? await mongoose.connection.db.collection("users").findOne({ phone: r.phone }) : null;
      const userHistory = userDoc?.feedbackScores || [];

      // Recalculate with corrected logic
      const configuredPicWords = statusDoc?.vocabPictureWordCount ?? statusDoc?.vocabWordCount ?? 5;
      const configuredPicReq = statusDoc?.vocabPictureRequiredCount ?? statusDoc?.vocabRequiredCount ?? 1;
      const effectivePicTotal = statusDoc?.todayVocabulary?.length || configuredPicWords;
      const effectivePicReq = Math.min(configuredPicReq, effectivePicTotal);

      const recalc = calculateCompositeScore({
        durationSeconds: r.videoDuration || 0,
        maxDurationSeconds: isPic ? (statusDoc?.durationPictureFull ?? 180) : (statusDoc?.durationDefaultFull ?? 300),
        vocabularyUsed: a.vocabularyUsed || [],
        totalVocabWords: isPic ? effectivePicTotal : (statusDoc?.vocabNormalWordCount ?? 5),
        requiredVocabWords: isPic ? effectivePicReq : (statusDoc?.vocabNormalRequiredCount ?? 3),
        topicRelevance: a.topicRelevance ?? null,
        analysis: a,
        isPictureDescription: isPic,
        userHistory,
      });

      const newBaseScore = recalc.score;
      const newEffectiveScore = isSunday ? Math.round(newBaseScore * 2 * 100) / 100 : newBaseScore;

      console.log(`  👉 Corrected compositeScore: ${newBaseScore}`);
      console.log(`  👉 Corrected breakdown: Comm ${recalc.breakdown.communication || recalc.breakdown.comm}, Content ${recalc.breakdown.content || recalc.breakdown.topic}, Vocab ${recalc.breakdown.vocabulary || recalc.breakdown.vocabUsed}, Dur ${recalc.breakdown.duration || recalc.breakdown.length}, Growth ${recalc.breakdown.growth}`);
      if (isSunday) {
        console.log(`  🎉 Sunday 2x Bonus: Base ${newBaseScore} -> Bonus ${newEffectiveScore}`);
      }

      if (applyChanges) {
        // Update VideoReport
        await mongoose.connection.db.collection("videoreports").updateOne(
          { _id: r._id },
          {
            $set: {
              "analysis.compositeScore": newBaseScore,
              "analysis._compositeScore": newBaseScore,
              "analysis.scoreBreakdown": recalc.breakdown,
              "analysis._scoreBreakdown": recalc.breakdown,
              "analysis.sundayBonus": isSunday,
              "analysis.baseScore": newBaseScore,
              "analysis.bonusScore": newEffectiveScore,
            }
          }
        );
        console.log(`  ✓ Updated VideoReport ${r._id}`);

        // Update User if needed
        if (userDoc) {
          const y = dateIST.getFullYear();
          const mo = String(dateIST.getMonth() + 1).padStart(2, "0");
          const d = String(dateIST.getDate()).padStart(2, "0");
          const reportISTDate = `${y}-${mo}-${d}`;

          // If this was user's todayScore
          if (userDoc.lastScoreDate === reportISTDate) {
            const oldScore = userDoc.todayScore ?? 0;
            const diffScore = newEffectiveScore - oldScore;

            await mongoose.connection.db.collection("users").updateOne(
              { _id: userDoc._id },
              {
                $inc: { monthlyScore: diffScore },
                $set: { todayScore: newEffectiveScore }
              }
            );
            console.log(`  ✓ Updated User ${r.phone}: todayScore ${oldScore} -> ${newEffectiveScore}, monthlyScore adjustment: +${diffScore.toFixed(2)}`);
          }

          // Update latest feedbackScores points
          await mongoose.connection.db.collection("users").updateOne(
            { _id: userDoc._id, "feedbackScores.date": { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            {
              $set: {
                "feedbackScores.$.points": newEffectiveScore,
                "feedbackScores.$.sundayBonus": isSunday
              }
            }
          );
          console.log(`  ✓ Updated User feedbackScores latest points -> ${newEffectiveScore}`);
        }
      }
      console.log("");
    }
  }

  console.log(`Summary: Found ${inconsistentCount} report(s) needing update.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
