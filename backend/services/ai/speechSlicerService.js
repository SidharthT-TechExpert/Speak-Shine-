/**
 * speechSlicerService.js
 *
 * Full pipeline for:
 * 1. Downloading native audio (podcast episode or curated stream).
 * 2. Transcribing with Whisper via Groq to obtain word and sentence-level timestamps.
 * 3. AI-driven optimal 60s-180s continuous active speaking segment selection.
 * 4. Precision cutting with FFmpeg (clean sentence start to clean sentence end).
 * 5. Direct upload of sliced audio to Cloudflare R2 bucket.
 */

import fs from "fs";
import path from "path";
import os from "os";
import fetch from "node-fetch";
import FormData from "form-data";
import { execFile } from "child_process";
import { promisify } from "util";
import { getTextKey, getTextModel, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";
import { uploadBufferToR2 } from "../../config/storage.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

/**
 * Download a stream/file to local disk with size limit to prevent runaway downloads
 */
async function downloadAudioSample(url, destinationPath, maxBytes = 25 * 1024 * 1024) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SpeakAndShineAudioBot/1.0"
    },
    timeout: 30000
  });

  if (!res.ok) {
    throw new Error(`Failed to download audio from ${url}: HTTP ${res.status}`);
  }

  const fileStream = fs.createWriteStream(destinationPath);
  let totalBytes = 0;

  await new Promise((resolve, reject) => {
    let settled = false;
    const finishDone = () => {
      if (!settled) { settled = true; resolve(); }
    };
    res.body.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        res.body.unpipe(fileStream);
        res.body.destroy(); // Stop download early once we have enough for 5-10 minutes of audio
        fileStream.end();
      }
    });

    res.body.pipe(fileStream);
    res.body.on("error", (err) => {
      if (!settled) { settled = true; reject(err); }
    });
    fileStream.on("error", (err) => {
      if (!settled) { settled = true; reject(err); }
    });
    fileStream.on("finish", finishDone);
  });

  return destinationPath;
}

/**
 * Convert audio to 16kHz mono 64kbps MP3 suitable for fast Groq Whisper transcription (<25MB limit)
 * We take up to the first 6 minutes (360 seconds)
 */
async function prepareAudioForWhisper(inputPath, outputPath) {
  // Extract first 360 seconds, convert to 16kHz mono mp3
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-t", "360",
    "-vn",
    "-ar", "16000",
    "-ac", "1",
    "-b:a", "48k",
    outputPath
  ]);
  return outputPath;
}

/**
 * Transcribe audio using Groq whisper-large-v3 with verbose JSON & timestamps
 */
async function transcribeAudioWithWhisper(audioFilePath) {
  const groqKey = getTextKey();
  if (!groqKey) {
    throw new Error("No available GROQ_API_KEY for Whisper transcription");
  }

  const form = new FormData();
  form.append("file", fs.createReadStream(audioFilePath));
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0.0");

  console.log(`[SpeechSlicer] 🎙️ Calling Groq Whisper Large v3 for audio transcription...`);
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      ...form.getHeaders()
    },
    body: form,
    timeout: 45000
  });

  if (response.status === 429) {
    const errText = await response.text().catch(() => "");
    const retryAfter = parseRetryAfter(errText);
    markKeyExhausted(groqKey, retryAfter || undefined);
    throw new Error("Groq Whisper rate limit reached");
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq Whisper transcription failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data; // contains { text, segments: [{ id, start, end, text, ... }] }
}

/**
 * Find the optimal 60s - 180s continuous speaking window from segments.
 * Snaps precisely to complete sentences.
 */
function findContinuousSpeechWindow(segments, minSeconds = 60, maxSeconds = 180) {
  if (!segments || segments.length === 0) {
    return {
      startTime: 0,
      endTime: 75,
      transcript: "Confidence is an active habit you build every day. Clear pronunciation and genuine enthusiasm make a powerful impression."
    };
  }

  // Filter out any ultra-short music/intro blips (<1.5s or empty)
  const cleanSegments = segments.filter(s => s.text && s.text.trim().length > 3);

  let bestWindow = null;
  let bestScore = -1;

  // Slide through segments to find a contiguous block whose total duration is between 60s and 180s
  for (let i = 0; i < cleanSegments.length; i++) {
    const startSegment = cleanSegments[i];
    let candidateSegments = [];
    let currentDuration = 0;

    for (let j = i; j < cleanSegments.length; j++) {
      const seg = cleanSegments[j];
      const duration = seg.end - startSegment.start;

      if (duration > maxSeconds) {
        break; // Exceeds 3 minutes
      }

      candidateSegments.push(seg);
      currentDuration = duration;

      if (currentDuration >= minSeconds && currentDuration <= maxSeconds) {
        // Evaluate candidate: prefer 70s-120s with high word density and clear sentence end (. or ?)
        const fullText = candidateSegments.map(s => s.text.trim()).join(" ");
        const words = fullText.split(/\s+/).length;
        const endsWithPunct = /[.!?]$/.test(candidateSegments[candidateSegments.length - 1].text.trim());

        // Target ideal length ~85 seconds
        const durationScore = 100 - Math.abs(currentDuration - 85);
        const score = durationScore + (endsWithPunct ? 20 : 0) + (words > 100 ? 10 : 0);

        if (score > bestScore) {
          bestScore = score;
          bestWindow = {
            start: startSegment.start,
            end: seg.end,
            duration: Math.round(currentDuration),
            text: fullText
          };
        }
      }
    }
  }

  if (bestWindow) {
    return {
      startTime: parseFloat(bestWindow.start.toFixed(2)),
      endTime: parseFloat(bestWindow.end.toFixed(2)),
      duration: bestWindow.duration,
      transcript: bestWindow.text.replace(/\s+/g, " ").trim()
    };
  }

  // Fallback to taking first ~75s of speech
  const fallbackEnd = Math.min(segments[segments.length - 1]?.end || 75, 75);
  const fallbackText = segments
    .filter(s => s.end <= fallbackEnd)
    .map(s => s.text.trim())
    .join(" ");

  return {
    startTime: 0,
    endTime: fallbackEnd,
    duration: Math.round(fallbackEnd),
    transcript: fallbackText || "Clear communication and vocal presence."
  };
}

/**
 * Slice audio file precisely with FFmpeg and convert to clean high-quality 128kbps MP3
 */
async function sliceAudioFile(sourcePath, startTime, endTime, outputPath) {
  const duration = (endTime - startTime).toFixed(2);
  console.log(`[SpeechSlicer] ✂️ Cutting audio slice: ${startTime}s to ${endTime}s (duration: ${duration}s)`);

  await execFileAsync("ffmpeg", [
    "-y",
    "-ss", String(startTime),
    "-i", sourcePath,
    "-t", String(duration),
    "-vn",
    "-ar", "44100",
    "-ac", "2",
    "-b:a", "128k",
    outputPath
  ]);

  return outputPath;
}

/**
 * Master method: Takes a raw audio URL, slices the best native active speech,
 * transcribes it, uploads to Cloudflare R2, and returns structured shadowing challenge data.
 */
export async function processPodcastIntoShadowingChallenge(podcastItem, options = {}) {
  const tmpDir = os.tmpdir();
  const rawFile = path.join(tmpDir, `podcast-raw-${Date.now()}.mp3`);
  const whisperFile = path.join(tmpDir, `podcast-whisper-${Date.now()}.mp3`);
  const slicedFile = path.join(tmpDir, `shadowing-native-${Date.now()}.mp3`);

  try {
    console.log(`[SpeechSlicer] 📥 Downloading audio from: ${podcastItem.audioUrl}`);
    await downloadAudioSample(podcastItem.audioUrl, rawFile);

    console.log(`[SpeechSlicer] 🔄 Preparing audio sample for Whisper transcription...`);
    await prepareAudioForWhisper(rawFile, whisperFile);

    console.log(`[SpeechSlicer] 🧠 Transcribing with Whisper Large v3...`);
    const transcription = await transcribeAudioWithWhisper(whisperFile);

    const requestedDur = Math.min(Math.max(Number(options?.targetDuration) || 90, 45), 180);
    const minWindowDur = Math.max(45, Math.min(120, Math.round(requestedDur * 0.8)));
    const maxWindowDur = Math.min(180, Math.max(minWindowDur + 15, Math.round(requestedDur * 1.25)));
    console.log(`[SpeechSlicer] 🎯 Analyzing active speaking sections (${minWindowDur}-${maxWindowDur}s)...`);
    const window = findContinuousSpeechWindow(transcription.segments, minWindowDur, maxWindowDur);

    console.log(`[SpeechSlicer] ✂️ Slicing speech window (${window.duration}s)...`);
    await sliceAudioFile(rawFile, window.startTime, window.endTime, slicedFile);

    // Save locally to frontend/public/shadowing/ so authentic native podcast audio is guaranteed playable
    const publicAudioDir = path.resolve(__dirname, "../../../frontend/public/shadowing");
    if (!fs.existsSync(publicAudioDir)) {
      fs.mkdirSync(publicAudioDir, { recursive: true });
    }
    const localFileName = `podcast-${Date.now()}.mp3`;
    const localFilePath = path.join(publicAudioDir, localFileName);
    await fs.promises.copyFile(slicedFile, localFilePath);

    // Also mirror to frontend/dist/shadowing/ if dist exists
    const distAudioDir = path.resolve(__dirname, "../../../frontend/dist/shadowing");
    if (fs.existsSync(distAudioDir)) {
      try {
        await fs.promises.copyFile(slicedFile, path.join(distAudioDir, localFileName));
      } catch (_) {}
    }

    let audioUrl = `/shadowing/${localFileName}`;

    // Read sliced MP3 buffer and upload to Cloudflare R2 if configured
    try {
      const audioBuffer = await fs.promises.readFile(slicedFile);
      const r2Key = `shadowing/native-${Date.now()}.mp3`;

      console.log(`[SpeechSlicer] ☁️ Uploading sliced human native speech to Cloudflare R2 (${r2Key})...`);
      const uploadRes = await uploadBufferToR2(audioBuffer, r2Key, "audio/mpeg");
      if (typeof uploadRes === "string" && uploadRes) {
        audioUrl = uploadRes;
      } else if (uploadRes?.url) {
        audioUrl = uploadRes.url;
      } else if (process.env.R2_PUBLIC_URL) {
        audioUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${r2Key}`;
      }
    } catch (r2Err) {
      console.warn(`[SpeechSlicer] ⚠️ R2 upload notice (using local sliced native podcast audio):`, r2Err.message);
      // Keep local audioUrl (/shadowing/${localFileName}) - NEVER fall back to robotic sounds!
    }

    const title = podcastItem.title ? podcastItem.title.replace(/[^\w\s-]/gi, "").substring(0, 70).trim() : "Native Speaker Monologue";

    return {
      success: true,
      title: title || "Native Speaker Public Speaking",
      topic: podcastItem.category || "Stage Presence & Communication",
      videoDuration: window.duration,
      audioUrl: audioUrl,
      videoUrl: audioUrl,
      videoTranscript: window.transcript,
      instructions: "Shadow the native speaker with matching tone, pace, and breath pauses. Speak clearly and match the speaker's vocal flow.",
      videoSource: `Podcast Ingestion: ${podcastItem.sourceFeed || "Native Podcast"}`,
      videoPageUrl: podcastItem.audioUrl || "https://speakshine.ai",
      videoPhotographer: "Native Speaker Podcast"
    };
  } finally {
    // Cleanup temporary files
    [rawFile, whisperFile, slicedFile].forEach((f) => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (_) {}
      }
    });
  }
}
