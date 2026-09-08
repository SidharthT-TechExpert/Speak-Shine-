import dotenv from "dotenv";
dotenv.config();
import { generateListeningStory } from "../backend/services/ai/storyGenerator.js";
import { generatePictureDescriptionChallenge } from "../backend/services/ai/pictureDescriptionGenerator.js";

async function testAll() {
  console.log("--- TESTING STORY GENERATION ---");
  try {
    const story = await generateListeningStory({ wordCount: 150, level: "B1" });
    console.log("✅ Story generated successfully:", {
      topic: story.topic,
      storyLength: story.story.length,
      summaryPoints: story.summaryGuide.length,
      question: story.question,
    });
  } catch (err) {
    console.error("❌ Story generation failed:", err.message);
  }

  console.log("\n--- TESTING PICTURE DESCRIPTION CHALLENGE ---");
  try {
    const pic = await generatePictureDescriptionChallenge();
    console.log("✅ Picture challenge generated successfully:", {
      title: pic.title,
      imageUrl: pic.imageUrl,
      instructions: pic.instructions,
      difficulty: pic.difficulty,
    });
  } catch (err) {
    console.error("❌ Picture description generation failed:", err.message);
  }

  process.exit(0);
}

testAll();
