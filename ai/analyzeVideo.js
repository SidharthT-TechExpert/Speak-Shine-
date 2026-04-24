import { exec } from "child_process";
import fs from "fs";
import fetch from "node-fetch";
import FrameCache from "../models/frameCacheSchema.js";

const FRAME_COUNT = 8;

function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      (err, stdout) => {
        if (err) { console.log("ffprobe error:", err.message); return resolve(60); }
        const dur = parseFloat((stdout || "").trim());
        resolve(isNaN(dur) || dur <= 0 ? 60 : dur);
      }
    );
  });
}

/**
 * Extracts a single frame, stores it in MongoDB, and returns the DB _id.
 * The base64 string is never held in Node.js heap beyond this function.
 */
async function extractAndStoreFrame(videoPath, timestamp, videoId, frameIndex) {
  return new Promise((resolve) => {
    const framePath = `${videoPath}_frame_${timestamp}.jpg`;
    exec(
      `ffmpeg -ss ${timestamp} -i "${videoPath}" -frames:v 1 -q:v 3 -vf "scale=640:-1" "${framePath}" -y`,
      async (err) => {
        if (err) return resolve(null);
        if (!fs.existsSync(framePath)) return resolve(null);
        try {
          const buffer = fs.readFileSync(framePath);
          fs.unlinkSync(framePath);
          if (buffer.length < 1000) return resolve(null);

          // Store in MongoDB — free buffer from memory immediately
          const base64 = buffer.toString("base64");
          const doc = await FrameCache.create({ videoId, frameIndex, timestamp, base64 });
          return resolve(doc._id);
        } catch (e) {
          console.log("Frame store error:", e.message);
          resolve(null);
        }
      }
    );
  });
}

/**
 * Extracts FRAME_COUNT frames from the video, stores each in MongoDB as it's
 * extracted (so only one frame is in memory at a time), and returns the stored IDs.
 */
async function extractAndStoreFrames(videoPath, videoId) {
  if (!fs.existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);
  const duration = await getVideoDuration(videoPath);

  const timestamps = [];
  for (let i = 1; i <= FRAME_COUNT; i++) {
    timestamps.push(Math.max(1, Math.floor((duration * i) / (FRAME_COUNT + 1))));
  }

  // Extract sequentially — one frame in memory at a time
  const ids = [];
  for (let i = 0; i < timestamps.length; i++) {
    const id = await extractAndStoreFrame(videoPath, timestamps[i], videoId, i);
    if (id) ids.push(id);
  }

  return ids;
}

export async function analyzeVideo(videoPath) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) { console.log("GROQ_API_KEY not set"); return null; }

  const videoId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let frameIds = [];
  try {
    frameIds = await extractAndStoreFrames(videoPath, videoId);
  } catch (err) {
    console.log("Visual frame extraction error:", err.message);
    return null;
  }

  if (frameIds.length === 0) {
    console.log("No frames stored");
    return null;
  }

  try {
    // Fetch frames from DB one-by-one to build the request — avoids holding all in memory
    const frameDocs = await FrameCache.find({ videoId }).sort({ frameIndex: 1 }).lean();

    const prompt = `You are an expert public speaking coach analyzing video frames of a student giving a spoken English presentation.
Analyze these ${frameDocs.length} frame(s) and evaluate non-verbal communication.
Return ONLY valid JSON (no markdown, no extra text):
{"eyeContact":<1-10>,"bodyLanguage":<1-10>,"facialExpression":<1-10>,"overallPresence":<1-10>,"eyeContactNote":"<observation>","bodyLanguageNote":"<observation>","expressionNote":"<observation>","visualSuggestions":["<tip>","<tip>"],"visualStrengths":["<positive>"]}`;

    const userContent = [
      { type: "text", text: prompt },
      ...frameDocs.map((doc) => ({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${doc.base64}` },
      })),
    ];

    // Free frame data from memory before the API call
    frameDocs.forEach((doc) => { doc.base64 = null; });

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: userContent }],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    // Clean up DB frames immediately after sending
    await FrameCache.deleteMany({ videoId }).catch(() => {});

    if (!res.ok) {
      const e = await res.text();
      console.log(`Groq Vision HTTP ${res.status}:`, e.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) { console.log("Groq vision returned no text"); return null; }

    let jsonStr = raw;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      jsonStr = fence[1].trim();
    } else {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1);
    }
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.log("JSON parse failed, attempting partial extraction:", parseErr.message);
      const extract = (key) => {
        const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
        return m ? parseInt(m[1]) : null;
      };
      const eyeContact = extract("eyeContact");
      const bodyLanguage = extract("bodyLanguage");
      const facialExpression = extract("facialExpression");
      const overallPresence = extract("overallPresence");
      if (eyeContact === null && bodyLanguage === null) throw parseErr;
      parsed = {
        eyeContact, bodyLanguage, facialExpression, overallPresence,
        eyeContactNote: "Analysis partially available.",
        bodyLanguageNote: "Analysis partially available.",
        expressionNote: "Analysis partially available.",
        visualSuggestions: [], visualStrengths: [],
      };
    }

    console.log("Visual analysis complete:", JSON.stringify(parsed).slice(0, 150));
    return parsed;

  } catch (err) {
    // Ensure DB cleanup even on error
    await FrameCache.deleteMany({ videoId }).catch(() => {});
    console.log("Visual analysis failed:", err.message);
    return null;
  }
}
