import { exec } from "child_process";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

/**
 * Extracts N evenly-spaced frames from a video file using ffmpeg.
 * Returns array of base64-encoded JPEG strings.
 *
 * @param {string} videoPath - Path to the video file
 * @param {number} frameCount - How many frames to extract (default 3)
 * @returns {Promise<string[]>} Array of base64 JPEG strings
 */
async function extractFrames(videoPath, frameCount = 3) {
  // Get video duration first
  const duration = await getVideoDuration(videoPath);

  // Sample frames at 25%, 50%, 75% of the video
  const timestamps = [];
  for (let i = 1; i <= frameCount; i++) {
    const t = Math.floor((duration * i) / (frameCount + 1));
    timestamps.push(Math.max(1, t)); // at least 1 second in
  }

  const frames = [];
  for (const ts of timestamps) {
    const framePath = `${videoPath}_frame_${ts}.jpg`;
    await new Promise((resolve, reject) => {
      exec(
        `ffmpeg -ss ${ts} -i "${videoPath}" -frames:v 1 -q:v 2 "${framePath}" -y`,
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });

    if (fs.existsSync(framePath)) {
      const buffer = fs.readFileSync(framePath);
      frames.push(buffer.toString("base64"));
      fs.unlinkSync(framePath); // clean up immediately
    }
  }

  return frames;
}

/**
 * Gets video duration in seconds using ffprobe.
 */
function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve(30); // fallback 30s
        const dur = parseFloat(stdout.trim());
        resolve(isNaN(dur) ? 30 : dur);
      }
    );
  });
}

/**
 * Analyzes video frames using Google Gemini Vision API.
 * Looks for: eye contact, facial expressions, body language, confidence, gestures.
 *
 * @param {string} videoPath - Path to the video file
 * @returns {Promise<object>} Visual analysis result
 */
export async function analyzeVideo(videoPath) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.log("⚠️ GEMINI_API_KEY not set — skipping visual analysis");
    return null;
  }

  let frames = [];
  try {
    frames = await extractFrames(videoPath, 3);
  } catch (err) {
    console.log("⚠️ Frame extraction failed:", err.message);
    return null;
  }

  if (frames.length === 0) {
    console.log("⚠️ No frames extracted — skipping visual analysis");
    return null;
  }

  // Build Gemini request parts — one text prompt + all frames as inline images
  const parts = [
    {
      text: `You are an expert public speaking coach analyzing video frames of a student giving a spoken English presentation.

Analyze these ${frames.length} frames sampled from their video and evaluate their non-verbal communication.

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):

{
  "eyeContact": <integer 1-10>,
  "bodyLanguage": <integer 1-10>,
  "facialExpression": <integer 1-10>,
  "overallPresence": <integer 1-10>,
  "eyeContactNote": "<one specific observation about where they are looking>",
  "bodyLanguageNote": "<one specific observation about posture, gestures, or movement>",
  "expressionNote": "<one specific observation about facial expressions and engagement>",
  "visualSuggestions": ["<specific tip>", "<specific tip>"],
  "visualStrengths": ["<positive observation>"]
}

SCORING GUIDE:
- eyeContact: 10 = consistently looking at camera, 1 = always looking away
- bodyLanguage: 10 = confident posture, open gestures, 1 = slouching, closed off
- facialExpression: 10 = engaged, expressive, smiling naturally, 1 = blank/stiff
- overallPresence: overall visual confidence and stage presence

Be specific and honest. If the image quality is low or face is not clearly visible, still give your best assessment and note it.`,
    },
    ...frames.map((b64) => ({
      inline_data: {
        mime_type: "image/jpeg",
        data: b64,
      },
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
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 600,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.log("⚠️ Gemini vision API error:", err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) return null;

    // Strip markdown fences if present
    let jsonStr = raw;
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    } else {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end !== -1) jsonStr = raw.slice(start, end + 1);
    }

    // Clean trailing commas
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

    return JSON.parse(jsonStr);
  } catch (err) {
    console.log("⚠️ Visual analysis failed:", err.message);
    return null;
  }
}
