import dotenv from "dotenv";
dotenv.config();

import { analyzeStoryVoice, getAvailableVoices, STORY_VOICES } from "../backend/services/ai/storyVoiceAnalyzer.js";

async function testAnalyzer() {
  console.log("=== 1. Testing Available Voices ===");
  const voices = getAvailableVoices();
  console.log(`Found ${voices.length} voices:`, voices.map(v => `${v.name} (${v.gender})`).join(", "));

  console.log("\n=== 2. Testing Story 1 (Female Character - Aisha, Design Student) ===");
  const story1 = `Aisha stared at the blank laptop screen in the noisy college canteen, her iced tea half-finished. 
Her design portfolio submission was in four hours, and her original file was corrupted. For a moment, panic hit her throat. 
Then her friend Maya slid into the chair opposite, dropped a warm cookie on her notebook, and whispered, "Breathe. You know these designs in your sleep." 
Laughing through the tension, Aisha opened a fresh canvas and rebuilt her main branding project with cleaner, bolder simplicity than before. 
When she hit submit with twenty minutes to spare, she realized stress had forced her to drop the unnecessary clutter.`;

  const rec1 = await analyzeStoryVoice(story1, { name: "Aisha", type: "a 22-year-old design student", pronoun: "she" });
  console.log("Result 1:", JSON.stringify(rec1, null, 2));

  console.log("\n=== 3. Testing Story 2 (Male Character - Rohan, Software Trainee) ===");
  const story2 = `Rohan nervously adjusted his headset as his team leader called his name during the morning sprint meeting. 
It was his third week at the tech consultancy, and he had spent all yesterday tracking a stubborn bug in the payment gateway. 
He had two choices: pretend it was almost resolved or admit he needed another engineer's pair-programming eyes. 
Taking a deep breath, he said honestly, "I traced the issue to the webhook handler, but I'd really appreciate twenty minutes with someone experienced to verify my fix." 
To his surprise, the senior architect smiled and said, "Smart call, Rohan. Let's do it right after this." 
Walking out of the call, Rohan realized transparency saved days of silent struggle.`;

  const rec2 = await analyzeStoryVoice(story2, { name: "Rohan", type: "a 25-year-old software trainee", pronoun: "he" });
  console.log("Result 2:", JSON.stringify(rec2, null, 2));

  console.log("\n=== Verification Successful! ===");
}

testAnalyzer().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
