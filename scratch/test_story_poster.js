import { generateSVGPoster, generatePNGPosterBuffer } from "../api/posterGenerator.js";
import sharp from "sharp";

async function testStoryPoster() {
  console.log("Testing story_audio poster generation...");
  try {
    const png = await generatePNGPosterBuffer({
      topic: "Garden Hobby Connects",
      question: "Listen to the story and describe how Rohan’s new hobby changed his social life.",
      category: "Story Summary",
      contentType: "story_audio",
      vocabulary: [
        { word: "cultivate", meaning: "to develop or grow", example: "He tried to cultivate new friendships." },
        { word: "flourish", meaning: "to thrive and prosper", example: "His garden began to flourish quickly." }
      ],
      vocabRequiredCount: 3
    });
    console.log("✅ Success! PNG Buffer size:", png.length);
  } catch (err) {
    console.error("❌ Sharp Error:", err.message);
  }
}

testStoryPoster();
