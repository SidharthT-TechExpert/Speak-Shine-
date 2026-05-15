import { execFile } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";
import { getVisionKey, markKeyExhausted, parseRetryAfter, keyStatus } from "./groqKeyManager.js";

const execFileAsync = promisify(execFile);

const FRAME_COUNT = 16;
const GROQ_BATCH_LIMIT = 4;

/** Formats seconds as m:ss (e.g. 75 → "1:15") */
function formatSec(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function getVideoDuration(videoPath) {
  return execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ], { timeout: 10000 })
    .then(({ stdout }) => {
      const dur = parseFloat((stdout || "").trim());
      return isNaN(dur) || dur <= 0 ? 60 : dur;
    })
    .catch(err => { console.log("ffprobe error:", err.message); return 60; });
}

/**
 * Extracts a single frame into memory as base64.
 * Returns { base64, timestamp, frameIndex } or null on failure.
 */
async function extractFrame(videoPath, timestamp, frameIndex) {
  return execFileAsync("ffmpeg", [
    "-ss", String(timestamp),
    "-i", videoPath,
    "-frames:v", "1",
    "-q:v", "3",
    "-vf", "scale=640:-1",
    "-f", "image2",
    "pipe:1",
  ], { encoding: "buffer", maxBuffer: 5 * 1024 * 1024, timeout: 15000 })
    .then(({ stdout }) => {
      if (!stdout || stdout.length < 500) return null;
      return { base64: stdout.toString("base64"), timestamp, frameIndex };
    })
    .catch(() => null);
}

/**
 * Extracts FRAME_COUNT timestamps evenly spaced across the video.
 * Returns only the timestamps — no frames loaded yet.
 */
async function getFrameTimestamps(videoPath) {
  const { existsSync } = await import("fs");
  if (!existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);

  const duration = await getVideoDuration(videoPath);
  const timestamps = [];
  for (let i = 1; i <= FRAME_COUNT; i++) {
    timestamps.push(Math.max(1, Math.floor((duration / FRAME_COUNT) * i)));
  }

  console.log(`[Visual] duration=${duration}s, interval=${(duration / FRAME_COUNT).toFixed(1)}s, timestamps=[${timestamps.join(", ")}]`);
  return { timestamps, duration };
}

/**
 * Sends one batch of frames to Groq Vision and returns the parsed result.
 * Reads each frame file just before sending, then deletes it immediately.
 */
async function analyzeFrameBatch(frames, batchLabel, batchInfo = {}) {
  const { index = 0, total = 1, startSec = null, endSec = null } = batchInfo;

  const timeContext = (startSec !== null && endSec !== null)
    ? `These ${frames.length} frame(s) are from the ${index === 0 ? "first" : index === total - 1 ? "last" : "middle"} part of the video (approximately ${formatSec(startSec)}–${formatSec(endSec)}).`
    : `These ${frames.length} frame(s) are from part ${index + 1} of ${total} of the video.`;

  const prompt = `You are an expert public speaking coach analyzing video frames of a student giving a spoken English presentation.
${timeContext}
Evaluate non-verbal communication based on what you observe in these frames.
Do NOT reference frame numbers in your notes — describe what you see naturally (e.g. "The speaker maintains good eye contact" not "In frame 1...").
Return ONLY valid JSON (no markdown, no extra text):
{"eyeContact":<1-10>,"bodyLanguage":<1-10>,"facialExpression":<1-10>,"overallPresence":<1-10>,"eyeContactNote":"<observation>","bodyLanguageNote":"<observation>","expressionNote":"<observation>","visualSuggestions":["<tip>","<tip>"],"visualStrengths":["<positive>"]}`;

  // Frames are already in memory as base64 — no disk reads needed
  const imageContent = frames.map((f) => {
    if (!f.base64) return null;
    return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${f.base64}` } };
  }).filter(Boolean);

  if (imageContent.length === 0) {
    console.log(`[Visual] ${batchLabel} no readable frames`);
    return null;
  }

  const userContent = [{ type: "text", text: prompt }, ...imageContent];

  // Try each available key — rotate on 429, max 6 retries before giving up
  let retries = 0;
  while (retries < 6) {
    const apiKey = getVisionKey();
    if (!apiKey) {
      console.log(`[Visual] ${batchLabel} no available keys — skipping batch`);
      return null;
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: userContent }],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (res.status === 429) {
      const errText = await res.text();
      const waitMs = parseRetryAfter(errText) || 5000;
      markKeyExhausted(apiKey, waitMs);
      retries++;
      // Brief pause before retrying with next key
      await new Promise(r => setTimeout(r, Math.min(waitMs, 8000)));
      continue;
    }

    if (!res.ok) {
      const e = await res.text();
      console.log(`[Visual] ${batchLabel} Groq HTTP ${res.status}:`, e.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) { console.log(`[Visual] ${batchLabel} no text returned`); return null; }

    let jsonStr = raw;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      jsonStr = fence[1].trim();
    } else {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1);
    }
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

    try {
      return JSON.parse(jsonStr);
    } catch (parseErr) {
      console.log(`[Visual] ${batchLabel} JSON parse failed, attempting partial extraction`);
      const extract = (key) => {
        const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
        return m ? parseInt(m[1]) : null;
      };
      const eyeContact = extract("eyeContact");
      const bodyLanguage = extract("bodyLanguage");
      const facialExpression = extract("facialExpression");
      const overallPresence = extract("overallPresence");
      if (eyeContact === null && bodyLanguage === null) return null;
      return {
        eyeContact, bodyLanguage, facialExpression, overallPresence,
        eyeContactNote: "Analysis partially available.",
        bodyLanguageNote: "Analysis partially available.",
        expressionNote: "Analysis partially available.",
        visualSuggestions: [], visualStrengths: [],
      };
    }
  }
  console.log(`[Visual] ${batchLabel} max retries reached — skipping`);
  return null;
}

/**
 * Merges all batch results with positional 60/40 weighting.
 * The second half of the video gets 60% weight, first half gets 40%.
 * For >2 batches, weight increases linearly toward the end.
 * Falls back to equal weighting if only one valid result exists.
 *
 * @param {Array<object|null>} results - ordered array of batch results
 * @returns {object|null}
 */
function mergeWeightedBatchResults(results) {
  const valid = results
    .map((r, i) => ({ result: r, index: i, total: results.length }))
    .filter(({ result }) => result != null);

  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0].result;

  // Assign weights: linearly scale from 0.4 (first) to 0.6 (last)
  // For 2 batches: [0.4, 0.6]
  // For 3 batches: [0.267, 0.333, 0.4] — still back-weighted
  const n = valid.length;
  const rawWeights = valid.map(({ index, total }) => {
    // position 0 = 0.4 weight, position (total-1) = 0.6 weight
    const pos = index / Math.max(total - 1, 1); // 0.0 → 1.0
    return 0.4 + pos * 0.2;
  });
  const weightSum = rawWeights.reduce((s, w) => s + w, 0);
  const weights = rawWeights.map(w => w / weightSum); // normalize to sum=1

  const SCORE_KEYS = ['eyeContact', 'bodyLanguage', 'facialExpression', 'overallPresence'];

  // Weighted average for numeric scores
  const weightedScore = (key) => {
    let sum = 0, wSum = 0;
    valid.forEach(({ result }, i) => {
      const v = result[key];
      if (v != null) { sum += v * weights[i]; wSum += weights[i]; }
    });
    return wSum > 0 ? Math.round(sum / wSum) : null;
  };

  // Deduplicate tips by normalising to lowercase + stripping punctuation,
  // then keep only the longest version of near-duplicate tips. Cap at 4.
  const deduplicateTips = (key) => {
    const all = valid.flatMap(({ result }) => result[key] ?? []).filter(Boolean);
    const seen = new Map(); // normalised key → best (longest) tip
    for (const tip of all) {
      // Normalise: lowercase, strip punctuation, collapse spaces
      const norm = tip.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      // Use first 6 words as the dedup key so near-identical tips collapse
      const shortKey = norm.split(" ").slice(0, 6).join(" ");
      if (!seen.has(shortKey) || tip.length > seen.get(shortKey).length) {
        seen.set(shortKey, tip);
      }
    }
    return [...seen.values()].slice(0, 4);
  };

  // Pick the single best note — highest-weighted batch that has a real, non-generic note
  const pickBestNote = (key) => {
    const candidates = valid
      .map(({ result }, i) => ({ text: (result[key] || '').trim(), weight: weights[i] }))
      .filter(c => c.text && c.text !== 'Analysis partially available.')
      .sort((a, b) => b.weight - a.weight);
    if (candidates.length === 0) return valid[valid.length - 1].result[key] || '';
    // Return only the top-weighted note — no concatenation
    return candidates[0].text;
  };

  return {
    eyeContact:       weightedScore('eyeContact'),
    bodyLanguage:     weightedScore('bodyLanguage'),
    facialExpression: weightedScore('facialExpression'),
    overallPresence:  weightedScore('overallPresence'),
    eyeContactNote:   pickBestNote('eyeContactNote'),
    bodyLanguageNote: pickBestNote('bodyLanguageNote'),
    expressionNote:   pickBestNote('expressionNote'),
    visualSuggestions: deduplicateTips('visualSuggestions'),
    visualStrengths:   deduplicateTips('visualStrengths'),
  };
}

const SCORE_KEYS = ['eyeContact', 'bodyLanguage', 'facialExpression', 'overallPresence'];
const RECONCILE_THRESHOLD = 2;

function scoresAreClose(results) {
  for (const key of SCORE_KEYS) {
    const vals = results.map(r => r[key]).filter(v => v != null);
    if (vals.length < 2) continue;
    if (Math.max(...vals) - Math.min(...vals) > RECONCILE_THRESHOLD) return false;
  }
  return true;
}

async function validateAndReconcile(batchResults, merged) {
  const batchSummaries = batchResults.map((r, i) => {
    return `Assessment ${i + 1} (${i === 0 ? "first half" : i === batchResults.length - 1 ? "second half" : `part ${i + 1}`} of video):
- Eye Contact: ${r.eyeContact}/10 — ${r.eyeContactNote ?? ""}
- Body Language: ${r.bodyLanguage}/10 — ${r.bodyLanguageNote ?? ""}
- Facial Expression: ${r.facialExpression}/10 — ${r.expressionNote ?? ""}
- Overall Presence: ${r.overallPresence}/10
- Strengths: ${(r.visualStrengths ?? []).join("; ") || "none noted"}
- Suggestions: ${(r.visualSuggestions ?? []).join("; ") || "none noted"}`;
  }).join("\n\n");

  const prompt = `You are a senior public speaking coach reviewing multiple partial assessments of the same student's video presentation. Each assessment covers a different segment of the video.

Your job is to:
1. Reconcile any contradictions between assessments
2. Produce a single final score for each dimension that reflects the WHOLE video
3. Write clean, natural observation notes (describe the student directly, no "assessment 1 says...")
4. Keep suggestions and strengths that are genuinely useful, remove duplicates

Here are the partial assessments:

${batchSummaries}

Return ONLY valid JSON (no markdown, no extra text):
{"eyeContact":<1-10>,"bodyLanguage":<1-10>,"facialExpression":<1-10>,"overallPresence":<1-10>,"eyeContactNote":"<one clear observation>","bodyLanguageNote":"<one clear observation>","expressionNote":"<one clear observation>","visualSuggestions":["<tip>","<tip>"],"visualStrengths":["<positive>"]}`;

  try {
    const apiKey = getVisionKey();
    if (!apiKey) { console.log("[Visual] validator: no available keys"); return null; }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!res.ok) {
      const e = await res.text();
      console.log(`[Visual] validator HTTP ${res.status}:`, e.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) { console.log("[Visual] validator returned no text"); return null; }

    let jsonStr = raw;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      jsonStr = fence[1].trim();
    } else {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1);
    }
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

    const validated = JSON.parse(jsonStr);
    console.log("[Visual] validator reconciled result:", JSON.stringify(validated).slice(0, 150));
    return validated;

  } catch (err) {
    console.log("[Visual] validator failed (using merged result):", err.message);
    return null;
  }
}

/**
 * Analyze video using browser-extracted frames (optimization for 512MB RAM)
 * @param {Array<string>} frameBase64Array - Array of base64-encoded JPEG frames from browser
 * @returns {Promise<object|null>} - Visual analysis result
 */
export async function analyzeVideoFromBrowserFrames(frameBase64Array) {
  const initialKey = getVisionKey();
  if (!initialKey) { 
    console.log(`[Visual] No Groq API keys configured (${keyStatus()})`); 
    return null; 
  }

  if (!frameBase64Array || frameBase64Array.length === 0) {
    console.log("[Visual] No frames provided");
    return null;
  }

  console.log(`[Visual] ⚡ Using ${frameBase64Array.length} browser-extracted frames (skipping ffmpeg extraction)`);

  // Convert base64 strings to frame objects
  const frames = frameBase64Array.map((base64, index) => ({
    base64,
    timestamp: index * 10, // Approximate timestamps (not critical for analysis)
    frameIndex: index,
  }));

  // Process batches SEQUENTIALLY to keep peak memory at 4 frames max
  const totalBatches = Math.ceil(frames.length / GROQ_BATCH_LIMIT);
  console.log(`[Visual] ${frames.length} frames → ${totalBatches} batches of ${GROQ_BATCH_LIMIT}, processing sequentially`);

  const batchResults = [];
  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchFrames = frames.slice(
      batchIdx * GROQ_BATCH_LIMIT,
      (batchIdx + 1) * GROQ_BATCH_LIMIT
    );

    if (batchFrames.length === 0) {
      batchResults.push(null);
      continue;
    }

    const startSec = batchFrames[0].timestamp;
    const endSec = batchFrames[batchFrames.length - 1].timestamp;

    const result = await analyzeFrameBatch(
      batchFrames,
      `batch${batchIdx + 1}/${totalBatches}`,
      { index: batchIdx, total: totalBatches, startSec, endSec }
    );

    // Free base64 data immediately after sending to Groq
    batchFrames.forEach(f => { f.base64 = null; });
    // Hint GC to reclaim the freed frame memory before next batch
    if (global.gc) global.gc();

    batchResults.push(result);
  }

  // Merge all batch results with 60/40 second-half weighting
  const merged = mergeWeightedBatchResults(batchResults);

  if (!merged) {
    console.log("[Visual] All batches failed");
    return null;
  }

  // Validation pass
  const validBatchResults = batchResults.filter(Boolean);
  let validated;
  if (validBatchResults.length >= 2 && !scoresAreClose(validBatchResults)) {
    console.log("[Visual] scores diverge — running reconciliation");
    validated = await validateAndReconcile(validBatchResults, merged);
  } else {
    if (validBatchResults.length >= 2) console.log("[Visual] scores are close — skipping reconciliation");
    validated = merged;
  }

  const final = validated ?? merged;
  console.log("Visual analysis complete (browser frames):", JSON.stringify(final).slice(0, 150));
  return final;
}

/**
 * Main entry point - uses browser frames if provided, otherwise extracts from video
 */
export async function analyzeVideo(videoPath, browserFrames = null) {
  // If browser provided frames, use them (huge optimization!)
  if (browserFrames && browserFrames.length > 0) {
    return analyzeVideoFromBrowserFrames(browserFrames);
  }
  
  // Otherwise, extract frames from video (original behavior)
  const initialKey = getVisionKey();
  if (!initialKey) { console.log(`[Visual] No Groq API keys configured (${keyStatus()})`); return null; }

  let timestamps;
  try {
    const info = await getFrameTimestamps(videoPath);
    timestamps = info.timestamps;
  } catch (err) {
    console.log("Visual frame extraction error:", err.message);
    return null;
  }

  if (timestamps.length === 0) {
    console.log("No frame timestamps computed");
    return null;
  }

  // Process batches SEQUENTIALLY to keep peak memory at 4 frames max.
  // Each batch: extract 4 frames → send to Groq → free base64 → next batch.
  // This keeps 16-frame quality while never holding all 16 in memory at once.
  const totalBatches = Math.ceil(timestamps.length / GROQ_BATCH_LIMIT);
  console.log(`[Visual] ${timestamps.length} frames → ${totalBatches} batches of ${GROQ_BATCH_LIMIT}, processing sequentially to limit memory`);

  const batchResults = [];
  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchTimestamps = timestamps.slice(
      batchIdx * GROQ_BATCH_LIMIT,
      (batchIdx + 1) * GROQ_BATCH_LIMIT
    );

    // Extract this batch's frames sequentially
    const frames = [];
    for (let i = 0; i < batchTimestamps.length; i++) {
      const globalIdx = batchIdx * GROQ_BATCH_LIMIT + i;
      const frame = await extractFrame(videoPath, batchTimestamps[i], globalIdx);
      if (frame) frames.push(frame);
    }

    if (frames.length === 0) {
      batchResults.push(null);
      continue;
    }

    const startSec = frames[0].timestamp;
    const endSec = frames[frames.length - 1].timestamp;

    const result = await analyzeFrameBatch(
      frames,
      `batch${batchIdx + 1}/${totalBatches}`,
      { index: batchIdx, total: totalBatches, startSec, endSec }
    );

    // Free base64 data immediately after sending to Groq
    frames.forEach(f => { f.base64 = null; });
    // Hint GC to reclaim the freed frame memory before next batch
    if (global.gc) global.gc();

    batchResults.push(result);
  }

  // Merge all batch results with 60/40 second-half weighting
  const merged = mergeWeightedBatchResults(batchResults);

  if (!merged) {
    console.log("[Visual] All batches failed");
    return null;
  }

  // Validation pass — skip reconciliation if all scores are within threshold
  const validBatchResults = batchResults.filter(Boolean);
  let validated;
  if (validBatchResults.length >= 2 && !scoresAreClose(validBatchResults)) {
    console.log("[Visual] scores diverge — running reconciliation");
    validated = await validateAndReconcile(validBatchResults, merged);
  } else {
    if (validBatchResults.length >= 2) console.log("[Visual] scores are close — skipping reconciliation");
    validated = merged;
  }

  const final = validated ?? merged;
  console.log("Visual analysis complete:", JSON.stringify(final).slice(0, 150));
  return final;
}
