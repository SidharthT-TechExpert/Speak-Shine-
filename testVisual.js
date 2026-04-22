import dotenv from "dotenv";
dotenv.config();

import { exec } from "child_process";
import fs from "fs";
import fetch from "node-fetch";

// ── 1. Check env ──────────────────────────────────────────────
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "✅ set" : "❌ MISSING");

// ── 2. Check ffmpeg / ffprobe ─────────────────────────────────
function checkCmd(cmd) {
  return new Promise((resolve) => {
    exec(`${cmd} -version`, (err, stdout) => {
      if (err) {
        console.log(`❌ ${cmd} not found:`, err.message.slice(0, 100));
        resolve(false);
      } else {
        console.log(`✅ ${cmd} found:`, stdout.split("\n")[0]);
        resolve(true);
      }
    });
  });
}

// ── 3. Check tmp folder ───────────────────────────────────────
function checkTmp() {
  const files = fs.readdirSync("./tmp").filter(f => f.match(/\.(mp4|mov|mkv|avi|3gp|webm)$/i));
  console.log(`📁 tmp/ video files: ${files.length > 0 ? files.join(", ") : "none"}`);
  return files[0] ? `./tmp/${files[0]}` : null;
}

// ── 4. Test frame extraction ──────────────────────────────────
function extractTestFrame(videoPath) {
  return new Promise((resolve) => {
    const out = `./tmp/test_frame.jpg`;
    exec(`ffmpeg -ss 2 -i "${videoPath}" -frames:v 1 -q:v 3 -vf "scale=640:-1" "${out}" -y`, (err, stdout, stderr) => {
      if (err) {
        console.log("❌ Frame extraction failed:", err.message);
        console.log("stderr:", stderr?.slice(0, 300));
        return resolve(null);
      }
      if (!fs.existsSync(out)) {
        console.log("❌ Frame file not created");
        return resolve(null);
      }
      const size = fs.statSync(out).size;
      console.log(`✅ Frame extracted: ${size} bytes`);
      const b64 = fs.readFileSync(out).toString("base64");
      fs.unlinkSync(out);
      resolve(b64);
    });
  });
}

// ── 5. Test Gemini API ────────────────────────────────────────
async function testGemini(b64Frame) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return;

  console.log("\n🤖 Calling Gemini Vision API...");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Describe what you see in this image in one sentence. Then return JSON: {"eyeContact": 7, "bodyLanguage": 8}' },
            { inline_data: { mime_type: "image/jpeg", data: b64Frame } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
      })
    }
  );

  const status = res.status;
  const body = await res.text();
  console.log(`📡 Gemini HTTP status: ${status}`);
  console.log(`📝 Gemini response: ${body.slice(0, 600)}`);
}

// ── Run all checks ────────────────────────────────────────────
(async () => {
  console.log("\n=== Visual Analysis Diagnostic ===\n");

  await checkCmd("ffmpeg");
  await checkCmd("ffprobe");

  const videoFile = checkTmp();

  if (!videoFile) {
    console.log("\n⚠️  No video file in tmp/ — send a video to the bot first, then run this test immediately after.");
    console.log("   OR place any .mp4 file in ./tmp/ and re-run.");
    process.exit(0);
  }

  console.log(`\n🎬 Testing with: ${videoFile}`);
  const frame = await extractTestFrame(videoFile);

  if (frame) {
    await testGemini(frame);
  }

  console.log("\n=== Done ===");
})();
