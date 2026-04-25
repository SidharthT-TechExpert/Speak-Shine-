import { exec } from "child_process";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { getVisionKey, markKeyExhausted, parseRetryAfter, keyStatus } from "./groqKeyManager.js";

const FRAME_COUNT = 8;
const GROQ_BATCH_LIMIT = 4; // split 8 frames into 2 batches of 4 (well under the 5-image limit)

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
 * Extracts a single frame to a temp file and returns { framePath, timestamp, frameIndex }.
 * Returns null if extraction fails.
 */
async function extractFrame(videoPath, timestamp, frameIndex, tmpDir) {
  const framePath = path.join(tmpDir, `frame_${frameIndex}_${timestamp}.jpg`);
  return new Promise((resolve) => {
    exec(
      `ffmpeg -ss ${timestamp} -i "${videoPath}" -frames:v 1 -q:v 3 -vf "scale=640:-1" "${framePath}" -y`,
      (err) => {
        if (err) return resolve(null);
        if (!fs.existsSync(framePath)) return resolve(null);
        const size = fs.statSync(framePath).size;
        if (size < 1000) { fs.unlinkSync(framePath); return resolve(null); }
        resolve({ framePath, timestamp, frameIndex });
      }
    );
  });
}

/**
 * Extracts FRAME_COUNT frames spaced evenly by video duration.
 * Returns array of { framePath, timestamp, frameIndex } objects.
 * All frames are written to tmpDir as JPEG files.
 */
async function extractFrames(videoPath, tmpDir) {
  if (!fs.existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const duration = await getVideoDuration(videoPath);
  const timestamps = [];
  for (let i = 1; i <= FRAME_COUNT; i++) {
    timestamps.push(Math.max(1, Math.floor((duration / FRAME_COUNT) * i)));
  }

  console.log(`[Visual] duration=${duration}s, interval=${(duration / FRAME_COUNT).toFixed(1)}s, timestamps=[${timestamps.join(", ")}]`);

  // Extract all frames in parallel
  const results = await Promise.all(
    timestamps.map((ts, i) => extractFrame(videoPath, ts, i, tmpDir))
  );

  return results.filter(Boolean);
}

/**
 * Reads a frame file as base64, then immediately deletes it to free disk space.
 */
function readAndDeleteFrame(framePath) {
  try {
    const base64 = fs.readFileSync(framePath).toString("base64");
    fs.unlinkSync(framePath);
    return base64;
  } catch {
    return null;
  }
}

/**
 * Cleans up all remaining frame files in tmpDir.
 */
function cleanupFrames(frames) {
  for (const f of frames) {
    try { if (fs.existsSync(f.framePath)) fs.unlinkSync(f.framePath); } catch {}
  }
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

  // Read frames from disk and build request content — delete each file immediately after reading
  const imageContent = frames.map((f) => {
    const base64 = readAndDeleteFrame(f.framePath);
    if (!base64) return null;
    return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } };
  }).filter(Boolean);

  if (imageContent.length === 0) {
    console.log(`[Visual] ${batchLabel} no readable frames`);
    return null;
  }

  const userContent = [{ type: "text", text: prompt }, ...imageContent];

  // Try each available key — rotate on 429
  while (true) {
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
      markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
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
}

function mergeBatchResults(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;

  const avg = (x, y) => Math.round((x + y) / 2);
  const combineNotes = (noteA, noteB) => {
    const a = (noteA || "").trim();
    const b = (noteB || "").trim();
    if (!a) return b;
    if (!b) return a;
    if (a === b) return a;
    if (a === "Analysis partially available." || b === "Analysis partially available.") {
      return a === "Analysis partially available." ? b : a;
    }
    return `${a} ${b}`;
  };

  return {
    eyeContact:       avg(a.eyeContact,       b.eyeContact),
    bodyLanguage:     avg(a.bodyLanguage,      b.bodyLanguage),
    facialExpression: avg(a.facialExpression,  b.facialExpression),
    overallPresence:  avg(a.overallPresence,   b.overallPresence),
    eyeContactNote:   combineNotes(a.eyeContactNote,   b.eyeContactNote),
    bodyLanguageNote: combineNotes(a.bodyLanguageNote, b.bodyLanguageNote),
    expressionNote:   combineNotes(a.expressionNote,   b.expressionNote),
    visualSuggestions: [...new Set([...(a.visualSuggestions ?? []), ...(b.visualSuggestions ?? [])])],
    visualStrengths:   [...new Set([...(a.visualStrengths ?? []),   ...(b.visualStrengths ?? [])])],
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

  // Use a unique temp directory per video — cleaned up at the end
  const tmpDir = path.resolve(`./tmp/frames_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

  let frames = [];
  try {
    frames = await extractFrames(videoPath, tmpDir);
  } catch (err) {
    console.log("Visual frame extraction error:", err.message);
    return null;
  }

  if (frames.length === 0) {
    console.log("No frames extracted");
    return null;
  }

  try {
    console.log(`[Visual] ${frames.length} frames extracted, splitting into batches of ${GROQ_BATCH_LIMIT}`);

    // Split into batches
    const batches = [];
    for (let i = 0; i < frames.length; i += GROQ_BATCH_LIMIT) {
      batches.push(frames.slice(i, i + GROQ_BATCH_LIMIT));
    }

    const batchResults = await Promise.all(
      batches.map((batch, idx) => {
        const startSec = batch[0]?.timestamp ?? null;
        const endSec = batch[batch.length - 1]?.timestamp ?? null;
        return analyzeFrameBatch(
          batch,
          `batch${idx + 1}/${batches.length}`,
          { index: idx, total: batches.length, startSec, endSec }
        );
      })
    );

    // Merge all batch results
    const merged = batchResults.reduce((acc, result) => mergeBatchResults(acc, result), null);

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

  } finally {
    // Always clean up remaining frame files and temp dir
    cleanupFrames(frames);
    try { fs.rmdirSync(tmpDir); } catch {}
  }
}
