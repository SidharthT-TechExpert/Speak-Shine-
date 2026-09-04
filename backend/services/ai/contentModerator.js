import { execFile } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";
import { getVisionModel, getVisionKey, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";

const execFileAsync = promisify(execFile);

/**
 * Extract a single frame directly into memory as base64 via ffmpeg pipe
 */
async function extractFrameInMemory(videoPath, timestamp) {
  try {
    const { stdout } = await execFileAsync("ffmpeg", [
      "-ss", String(timestamp),
      "-i", videoPath,
      "-frames:v", "1",
      "-q:v", "3",
      "-vf", "scale=640:-1",
      "-f", "image2",
      "pipe:1",
    ], { encoding: "buffer", maxBuffer: 5 * 1024 * 1024, timeout: 10000 });

    if (!stdout || stdout.length < 500) return null;
    return stdout.toString("base64");
  } catch {
    return null;
  }
}

/**
 * Extract 2-3 sample frames across the video duration directly in memory
 */
async function getSampleFrameBase64s(videoPath, count = 2) {
  let duration = 30;
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ], { timeout: 8000 });
    const dur = parseFloat((stdout || "").trim());
    if (!isNaN(dur) && dur > 0) duration = dur;
  } catch {}

  const timestamps = [];
  for (let i = 1; i <= count; i++) {
    timestamps.push(Math.max(1, Math.floor((duration / (count + 1)) * i)));
  }

  const framePromises = timestamps.map(ts => extractFrameInMemory(videoPath, ts));
  const frames = await Promise.all(framePromises);
  return frames.filter(Boolean);
}

/**
 * Analyze multiple frames in a SINGLE Vision API call
 * @param {string[]} base64Frames
 */
async function checkFramesWithVisionAI(base64Frames) {
  if (!base64Frames || base64Frames.length === 0) {
    return { approved: true, skipped: true, flags: [], confidence: 0 };
  }

  const apiKey = getVisionKey();
  if (!apiKey) {
    console.log("[ContentModerator] No vision API key available — skipping check");
    return { approved: true, skipped: true, flags: [], confidence: 0 };
  }

  const imageContents = base64Frames.slice(0, 3).map(b64 => ({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${b64}` }
  }));

  const prompt = `Analyze all attached images for inappropriate content:
- Violence or gore
- Nudity or sexual content
- Hate symbols or offensive gestures
- Illegal activities or weapons

Respond with JSON only:
{"safe": true, "categories": []} or {"safe": false, "categories": ["category_name"], "reason": "brief"}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getVisionModel(),
        messages: [{
          role: "user",
          content: [{ type: "text", text: prompt }, ...imageContents]
        }],
        temperature: 0.1,
        max_tokens: 150
      })
    });

    if (res.status === 429) {
      const txt = await res.text();
      const wait = parseRetryAfter(txt) || 5000;
      markKeyExhausted(apiKey, wait);
      console.warn("[ContentModerator] 429 rate limit hit — allowing video");
      return { approved: true, skipped: true, flags: [] };
    }

    if (!res.ok) {
      console.warn(`[ContentModerator] Vision API HTTP ${res.status} — bypassing safety check`);
      return { approved: true, skipped: true, flags: [] };
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "{}";

    let jsonStr = raw;
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) jsonStr = match[0];

    const result = JSON.parse(jsonStr);
    const approved = result.safe !== false;
    const flags = result.categories || [];

    return {
      approved,
      flags,
      confidence: result.confidence || 0.9,
      reason: result.reason || (approved ? "Safe" : "Safety violation")
    };
  } catch (err) {
    console.error("[ContentModerator] Vision API call error:", err.message);
    return { approved: true, skipped: true, flags: [] };
  }
}

/**
 * Moderate video content — accelerated with in-memory single-request checks
 * @param {string} videoPath - Path to video file
 * @param {Array<string|object>} [browserFrames] - Optional pre-extracted browser frames
 * @returns {Promise<{approved: boolean, flags: string[], confidence: number, details?: object}>}
 */
export async function moderateVideo(videoPath, browserFrames = null) {
  const startTime = Date.now();

  try {
    let base64List = [];

    if (browserFrames && browserFrames.length > 0) {
      // Pick 2-3 spread-out frames already in memory from browser!
      const step = Math.max(1, Math.floor(browserFrames.length / 3));
      for (let i = 0; i < browserFrames.length && base64List.length < 3; i += step) {
        const item = browserFrames[i];
        const b64 = typeof item === "string" ? item : item?.base64;
        if (b64) base64List.push(b64);
      }
      console.log(`[ContentModerator] ⚡ Using ${base64List.length} pre-extracted frames (zero ffmpeg overhead)`);
    } else {
      // Extract 2 frames concurrently into memory without disk files
      console.log("[ContentModerator] Extracting 2 sample frames in memory...");
      base64List = await getSampleFrameBase64s(videoPath, 2);
    }

    if (base64List.length === 0) {
      console.warn("[ContentModerator] No frames available - skipping moderation");
      return { approved: true, flags: [], confidence: 0, skipped: true, reason: "No frames" };
    }

    // Single Vision API call evaluating all sample frames at once
    console.log(`[ContentModerator] Performing single-pass safety analysis on ${base64List.length} frames...`);
    const result = await checkFramesWithVisionAI(base64List);
    const moderationTime = Date.now() - startTime;

    console.log(`[ContentModerator] Result: ${result.approved ? "APPROVED" : "REJECTED"} (${moderationTime}ms)`);
    return {
      ...result,
      moderationTime,
    };
  } catch (err) {
    console.error("[ContentModerator] Error:", err.message);
    return {
      approved: true,
      flags: [],
      confidence: 0,
      error: err.message,
      moderationTime: Date.now() - startTime,
    };
  }
}

/**
 * Quick moderation check (single frame)
 * Faster but less thorough than full moderation
 */
export async function quickModerateVideo(videoPath) {
  try {
    const frames = await extractFrames(videoPath, 1);
    if (frames.length === 0) {
      return { approved: true, skipped: true };
    }

    const result = await analyzeFrame(frames[0]);
    
    // Clean up
    try { fs.unlinkSync(frames[0]); } catch {}

    return {
      approved: result.safe,
      flags: result.categories,
      confidence: result.confidence,
      reason: result.reason,
    };
  } catch (err) {
    console.error('[ContentModerator] Quick check error:', err.message);
    return { approved: true, error: err.message };
  }
}

/**
 * Check if content moderation is available
 */
export async function isModerationAvailable() {
  return !!process.env.GROQ_API_KEY;
}
