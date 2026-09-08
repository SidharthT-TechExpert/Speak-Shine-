import { generatePNGPosterBuffer } from "../api/posterGenerator.js";

async function testAllPosters() {
  console.log("1. Testing picture_description...");
  const picPng = await generatePNGPosterBuffer({
    topic: "Evening Fountain Scene",
    question: "Describe the bustling plaza at sunset, focusing on the musician's performance & the child's balloon stall.",
    category: "Picture Description",
    contentType: "picture_description",
    vocabulary: [{ word: "bustling", meaning: "full of energetic activity", example: "The streets were bustling & crowded." }],
    vocabRequiredCount: 1,
  });
  console.log("✅ Picture poster rendered PNG:", picPng.length);

  console.log("2. Testing question with ampersands and quotes...");
  const normPng = await generatePNGPosterBuffer({
    topic: "Career & Work-Life Balance",
    question: "How do you manage your work & personal life? What's your secret?",
    category: "Personal Experience",
    contentType: "question",
    vocabulary: [
      { word: "resilient", meaning: "able to recover quickly", example: "She is resilient & stays positive." },
      { word: "prioritize", meaning: "treat something as more important", example: "You must prioritize tasks & time." },
    ],
    vocabRequiredCount: 3,
  });
  console.log("✅ Normal question poster rendered PNG:", normPng.length);
}

testAllPosters();
