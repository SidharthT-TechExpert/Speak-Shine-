import { generatePNGPosterBuffer } from "../api/posterGenerator.js";
import fs from "fs";
import path from "path";

async function testCleanPoster() {
  const png = await generatePNGPosterBuffer({
    topic: "Life-Changing Moments",
    question: "What's a moment that changed your life forever?",
    category: "Free Talk",
    contentType: "question",
    vocabulary: [
      { word: "turning point", meaning: "a moment that causes a significant change", example: "Graduating was a turning point in my career path." },
      { word: "epiphany", meaning: "a sudden realization that changes your perspective", example: "I had an epiphany about my priorities after the accident." },
      { word: "milestone", meaning: "an important event marking progress or change", example: "Moving abroad was a milestone that reshaped my outlook." },
      { word: "transformative", meaning: "causing a thorough or dramatic change", example: "The volunteer experience was transformative for my personal growth." },
      { word: "catalyst", meaning: "something that speeds up or triggers change", example: "Meeting my mentor acted as a catalyst for my confidence." }
    ],
    vocabRequiredCount: 3
  });

  const outPath = path.resolve("./scratch/clean_poster_test.png");
  fs.writeFileSync(outPath, png);
  console.log("✅ Wrote clean poster to:", outPath, "Size:", png.length);
}

testCleanPoster();
