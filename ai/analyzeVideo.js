import { exec } from "child_process";
import fs from "fs";
import fetch from "node-fetch";

/**
 * Gets video duration in seconds using ffprobe.
 * Falls back to 60s if ffprobe fails.
 */
function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      (err, stdout, stderr) => {
        if (err) {
          console.log("⚠️ ffprobe error (using fallback 60s):", err.message);
          return resolve(60);
        }
        const dur = parseFloat((stdout || "").trim());
        console.log(`📏 Video duration: ${dur}s`);
        resolve(isNaN(dur) || dur <= 0 ? 60 : dur);
      }
    );
  });
}

/**
 * Extracts a single frame at a given timestamp.
 * Returns base64 JPEG string or null if failed.
 */
function extractFrame(videoPath, timestamp) {
  return new Promise((resolve) => {
    const framePath = `${videoPath}_frame_${timestamp}.jpg`;
    exec(
      `ffmpeg -ss ${timestamp} -i "${videoPath}" -frames:v 1 -q:v 3 -vf "scale=640:-1" "${framePath}" -y`,
      (err, stdout, stderr) => {
        if (err) {
          console.log(`⚠️ Frame extraction failed at ${timestamp}s:`, err.message);
          return resolve(null);
        }
        if (!fs.existsSync(framePath)) {
          console.log(`⚠️ Frame file not found after extraction at ${timestamp}s`);
          return resolve(null);
        }
        try {
          const buffer = fs.readFileSync(framePath);
          fs.unlinkSync(framePath);
          if (buffer.length < 1000) {
            console.log(`⚠️ Frame too small (${buffer.length} bytes) at ${timestamp}s — skipping`);
            return resolve(null);
          }
          console.log(`✅ Frame at ${timestamp}s: ${buffer.length} bytes`);
          resolve(buffer.toString("base64"));
        } catch (readErr) {
          console.log(`⚠️ Frame read error at ${timestamp}s:`, readErr.message);
          resolve(null);
        }
      }
    );
  });
}

/**
 * Extracts N evenly-spaced frames from a video file.
 * Returns array of base64-encoded JPEG strings (skips failed frames).
 */
async function extractFrames(videoPath, frameCount = 3) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const duration = await getVideoDuration(videoPath);

  // Sample at 25%, 50%, 75% of video duration
  const timestamps = [];
  for (let i = 1; i <= frameCount; i++) {
    const t = Math.max(1, Math.floor((duration * i) / (frameCount + 1)));
    timestamps.push(t);
  }
  console.log(`🎬 Extracting frames at timestamps: ${timestamps.join(", ")}s`);

  // Extract all frames in parallel
  const results = await Promise.all(timestamps.map((ts) => extractFrame(videoPath, ts)));
  return results.filter(Boolean); // remove nulls
}

/**
 * Analyzes video frames using Google Gemini Vision API.
 * Evaluates: eye contact, facial expressions, body language, confidence, gestures.
 *
 * @param {string} videoPath - Path to the video file
 * @returns {Promise<object|null>} Visual analysis result, or null if unavailable
 */
export async function analyzeVideo(videoPath) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.log("⚠️ GEMINI_API_KEY not set — skipping visual analysis");
    return null;
  }

  console.log("🎥 Starting visual analysis for:", videoPath);

  let frames = [];
  try {
    frames = await extractFrames(videoPath, 3);
  } catch (err) {
    console.log("⚠️ Frame extraction error:", err.message);
    return null;
  }

  if (frames.length === 0) {
    console.log("⚠️ No usable frames extracted — skipping visual analysis");
    return null;
  }

  console.log(`🖼️ Sending ${frames.length} frame(s) to Gemini Vision...`);

  const prompt = `You are an expert public speaking coach analyzing video frames of a student giving a spoken English presentation.

Analyze these ${frames.length} frame(s) sampled from their video and evaluate their non-verbal communication.

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text, no explanation):

{
  "eyeContact": <integer 1-10>,
  "bodyLanguage": <integer 1-10>,
  "facialExpression": <integer 1-10>,
  "overallPresence": <integer 1-10>,
  "eyeContactNote": "<one specific observation about where they are looking>",
  "bodyLanguageNote": "<one specific observation about posture, gestures, or movement>",
  "expressionNote": "<one specific observation about facial expressions and engagement>",
  "visualSuggestions": ["<specific actionable tip>", "<specific actionable tip>"],
  "visualStrengths": ["<one positive visual observation>"]
}

SCORING GUIDE:
- eyeContact: 10 = consistently looking at camera, 1 = always looking away
- bodyLanguage: 10 = confident posture, open gestures, 1 = slouching, closed off
- facialExpression: 10 = engaged, expressive, natural smile, 1 = blank or stiff
- overallPresence: overall visual confidence and stage presence

Be specific and honest. If image quality is low or face is not clearly visible, still give your best assessment and mention it in the notes.`;

  const parts = [
    { text: prompt },
    ...frames.map((b64) => ({
      inline_data: { mime_type: "image/jpeg", data: b64 },
    })),
  ];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.log(`⚠️ Gemini API HTTP ${res.status}:`, errText.slice(0, 300));
      return null;
    }

    const data = await res.json();
    console.log("🤖 Gemini finish reason:", data?.candidates?.[0]?.finishReason);

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) {
      console.log("⚠️ Gemini returned no text. Response:", JSON.stringify(data).slice(0, 400));
      return null;
    }

    console.log("📝 Gemini raw text:", raw.slice(0, 400));

    // Strip markdown code fences if present
    let jsonStr = raw;
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    } else {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end !== -1) jsonStr = raw.slice(start, end + 1);
    }

    // Remove trailing commas (common LLM JSON issue)
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

    const parsed = JSON.parse(jsonStr);
    console.log("✅ Visual analysis complete:", JSON.stringify(parsed).slice(0, 200));
    return parsed;

  } catch (err) {
    console.log("⚠️ Visual analysis failed:", err.message);
    return null;
  }
}
