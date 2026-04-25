import { exec } from "child_process";
import fetch from "node-fetch";
import { getVisionKey, markKeyExhausted, parseRetryAfter, keyStatus } from "./groqKeyManager.js";

const FRAME_COUNT = 16;
const GROQ_BATCH_LIMIT = 4; // 16 frames → 4 batches of 4, all run in parallel via Promise.all

/** Formats seconds as m:ss (e.g. 75 → "1:15") */
function formatSec(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

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
 * Extracts a single frame into memory and returns { base64, timestamp, frameIndex }.
 * Returns null if extraction fails. No disk I/O — ffmpeg pipes directly to stdout.
 */
async function extractFrame(videoPath, timestamp, frameIndex) {
  return new Promise((resolve) => {
    exec(
      `ffmpeg -ss ${timestamp} -i "${videoPath}" -frames:v 1 -q:v 3 -vf "scale=640:-1" -f image2 pipe:1`,
      { encoding: "buffer", maxBuffer: 5 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || stdout.length < 1000) return resolve(null);
        resolve({ base64: stdout.toString("base64"), timestamp, frameIndex });
      }
    );
  });
}

/**
 * Extracts FRAME_COUNT frames spaced evenly by video duration.
 * Returns array of { base64, timestamp, frameIndex } objects — fully in-memory.
 */
async function extractFrames(videoPath) {
  const { existsSync } = await import("fs");
  if (!existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);

  const duration = await getVideoDuration(videoPath);
  const timestamps = [];
  for (let i = 1; i <= FRAME_COUNT; i++) {
    timestamps.push(Math.max(1, Math.floor((duration / FRAME_COUNT) * i)));
  }

  console.log(`[Visual] duration=${duration}s, interval=${(duration / FRAME_COUNT).toFixed(1)}s, timestamps=[${timestamps.join(", ")}]`);

  const results = await Promise.all(
    timestamps.map((ts, i) => extractFrame(videoPath, ts, i))
  );

  return results.filter(Boolean);
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

  // Pick note from the highest-weighted valid batch that has a real note
  const pickNote = (key) => {
    const candidates = valid
      .map(({ result }, i) => ({ text: (result[key] || '').trim(), weight: weights[i] }))
      .filter(c => c.text && c.text !== 'Analysis partially available.')
      .sort((a, b) => b.weight - a.weight);
    if (candidates.length === 0) return valid[valid.length - 1].result[key] || '';
    if (candidates.length === 1) return candidates[0].text;
    // Combine top two if they differ
    const [first, second] = candidates;
    return first.text === second.text ? first.text : `${first.text} ${second.text}`;
  };

  const allArrays = (key) =>
    [...new Set(valid.flatMap(({ result }) => result[key] ?? []))];

  return {
    eyeContact:       weightedScore('eyeContact'),
    bodyLanguage:     weightedScore('bodyLanguage'),
    facialExpression: weightedScore('facialExpression'),
    overallPresence:  weightedScore('overallPresence'),
    eyeContactNote:   pickNote('eyeContactNote'),
    bodyLanguageNote: pickNote('bodyLanguageNote'),
    expressionNote:   pickNote('expressionNote'),
    visualSuggestions: allArrays('visualSuggestions'),
    visualStrengths:   allArrays('visualStrengths'),
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

export async function analyzeVideo(videoPath) {
  const initialKey = getVisionKey();
  if (!initialKey) { console.log(`[Visual] No Groq API keys configured (${keyStatus()})`); return null; }

  let frames = [];
  try {
    frames = await extractFrames(videoPath);
  } catch (err) {
    console.log("Visual frame extraction error:", err.message);
    return null;
  }

  if (frames.length === 0) {
    console.log("No frames extracted");
    return null;
  }

  console.log(`[Visual] ${frames.length} frames extracted in memory, splitting into batches of ${GROQ_BATCH_LIMIT}`);

  // Split into batches
  const batches = [];
  for (let i = 0; i < frames.length; i += GROQ_BATCH_LIMIT) {
    batches.push(frames.slice(i, i + GROQ_BATCH_LIMIT));
  }

  // Run batches in 2 waves of 2 to avoid hammering all API keys simultaneously
  // Wave 1: batches 0,1 — Wave 2: batches 2,3
  const WAVE_SIZE = 2;
  const batchResults = [];
  for (let w = 0; w < batches.length; w += WAVE_SIZE) {
    const wave = batches.slice(w, w + WAVE_SIZE);
    const waveResults = await Promise.all(
      wave.map((batch, i) => {
        const idx = w + i;
        const startSec = batch[0]?.timestamp ?? null;
        const endSec = batch[batch.length - 1]?.timestamp ?? null;
        return analyzeFrameBatch(
          batch,
          `batch${idx + 1}/${batches.length}`,
          { index: idx, total: batches.length, startSec, endSec }
        );
      })
    );
    batchResults.push(...waveResults);
    // Small gap between waves to let rate limits breathe
    if (w + WAVE_SIZE < batches.length) await new Promise(r => setTimeout(r, 1000));
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
