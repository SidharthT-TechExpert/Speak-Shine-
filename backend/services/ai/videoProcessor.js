/**
 * Web Video Processor
 * Runs the AI pipeline directly on a local file — bypasses WhatsApp download entirely.
 */

import fs from "fs";
import { exec, execFile, execSync } from "child_process";
import { promisify } from "util";
import { extractAudio } from "./extractAudio.js";
import { transcribe } from "./transcribe.js";
import { analyzeSpeech } from "./analyzeSpeech.js";
import { analyzeVideo } from "./analyzeVideo.js";
import { synthesizeOverallComment, parseFeedbackToStructure } from "./webFeedbackHelpers.js";
import {
  withTimeout,
  startStage,
  TRANSCRIBE_TIMEOUT_MS,
  SPEECH_TIMEOUT_MS,
  VISUAL_TIMEOUT_MS,
} from "./pipeline.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Process a locally uploaded video file through the AI pipeline.
 * Does NOT use WhatsApp/Baileys at all.
 *
 * @param {string}   videoPath    - Absolute path to the uploaded video file
 * @param {string}   displayName  - User's display name
 * @param {Function} onProgress   - async (stage: string) => void
 * @returns {Promise<object>}     - { analysis, duration }
 */
export async function processWebVideo(videoPath, displayName = "User", onProgress = () => {}) {
  const id = Date.now();
  let audioPath = null;
  const isUrl = videoPath.startsWith("http");

  try {
    if (!isUrl && !fs.existsSync(videoPath)) throw new Error("Video file not found");

    const duration = await getVideoDuration(videoPath, isUrl);

    if (duration < 60) throw new Error(`Video is too short (${duration}s). Minimum is 1 minute.`);
    // Add 5-second tolerance to account for recording timer drift
    // Default: 305s (5 min + 5s), but can be 425s (7 min) or 605s (10 min) for special days
    if (duration > 605) throw new Error(`Video is too long (${duration}s). Maximum is 10 minutes.`);

    await onProgress("Extracting audio…");

    // Stage 1: Extract audio
    const extractStage = startStage("extractAudio");
    let qualityWarning, meanVolume;
    try {
      const extracted = await extractAudio(videoPath, id);
      audioPath = extracted.audioPath;
      qualityWarning = extracted.qualityWarning;
      meanVolume = extracted.meanVolume ?? null;
      extractStage.end();
    } catch (err) {
      extractStage.end(err);
      throw err;
    }

    await onProgress("Analysing your video…");

    // Stage 2: Visual + transcription in parallel
    const parallelStage = startStage("parallel");

    const visualPromise = withTimeout(
      analyzeVideo(videoPath),
      Number(process.env.VISUAL_TIMEOUT_MS) || VISUAL_TIMEOUT_MS,
      "visual"
    );

    let transcription = null;
    let speechResult = null;
    let transcriptionError = null;

    const speechChainPromise = withTimeout(
      transcribe(audioPath, { meanVolume }),
      Number(process.env.TRANSCRIBE_TIMEOUT_MS) || TRANSCRIBE_TIMEOUT_MS,
      "transcription"
    ).then(async (t) => {
      transcription = t;
      if (!t?.text || t.text.length < 10) return;

      await onProgress("Scoring your speech…");

      const speechStage = startStage("analyzeSpeech");
      try {
        speechResult = await withTimeout(
          analyzeSpeech(
            t.text,
            t.duration > 0 ? t.duration : duration,
            t.words,
            null, null,
            t.pronunciationIssues || [],
            t.rhythm || null
          ),
          Number(process.env.SPEECH_TIMEOUT_MS) || SPEECH_TIMEOUT_MS,
          "speech"
        );
        speechStage.end();
      } catch (err) {
        speechStage.end(err);
        throw err;
      }
    }).catch(err => { transcriptionError = err; });

    const [, visualSettled] = await Promise.all([
      speechChainPromise,
      visualPromise
        .then(v => ({ status: "fulfilled", value: v }))
        .catch(e => ({ status: "rejected", reason: e })),
    ]);

    parallelStage.end();

    const visual = visualSettled.status === "fulfilled" ? visualSettled.value : null;
    if (visualSettled.status === "rejected") {
      console.log("⚠️ Visual analysis failed (non-fatal):", visualSettled.reason?.message);
    }

    if (transcriptionError) throw new Error("Transcription failed: " + transcriptionError.message);
    if (!transcription?.text || transcription.text.length < 10) throw new Error("Could not detect speech in the video.");
    if (!speechResult) throw new Error("Speech scoring failed.");

    await onProgress("Generating feedback…");

    // Stage 3: Synthesize overall comment
    speechResult.overallComment = await synthesizeOverallComment(speechResult, visual);

    // Stage 4: Build structured analysis object directly (no text parsing needed)
    const analysis = buildStructuredAnalysis(speechResult, visual, qualityWarning);

    return { analysis, duration };

  } finally {
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    // NOTE: videoPath is cleaned up by the caller (videoAnalysis route)
    // If videoPath is a URL, nothing to clean up here
  }
}

/**
 * Build structured analysis object directly from pipeline results.
 * No regex parsing needed — we have the raw objects.
 */
function buildStructuredAnalysis(speechResult, visual, qualityWarning) {
  const s = speechResult._stats || {};

  return {
    // Speech scores
    fluency:        speechResult.fluency,
    grammar:        speechResult.grammar,
    confidence:     speechResult.confidence,
    vocabulary:     speechResult.vocabulary,
    topicRelevance: speechResult.topicRelevance ?? null,

    // Visual scores
    eyeContact:       visual?.eyeContact ?? null,
    bodyLanguage:     visual?.bodyLanguage ?? null,
    facialExpression: visual?.facialExpression ?? null,
    overallPresence:  visual?.overallPresence ?? null,

    // Visual notes
    eyeContactNote:   visual?.eyeContactNote ?? null,
    bodyLanguageNote: visual?.bodyLanguageNote ?? null,
    expressionNote:   visual?.expressionNote ?? null,
    visualSuggestions: visual?.visualSuggestions ?? [],
    visualStrengths:   visual?.visualStrengths ?? [],

    // Feedback text
    overallComment:  speechResult.overallComment,
    strongPoints:    speechResult.strongPoints || [],
    suggestions:     speechResult.suggestions || [],
    grammarErrors:   speechResult.grammarErrors || [],
    vocabularyHighlights: speechResult.vocabularyHighlights || { strong: [], weak: [] },

    // Notes
    pronunciationNote: speechResult.pronunciationNote ?? null,
    rhythmNote:        speechResult.rhythmNote ?? null,
    topicFeedback:     speechResult.topicFeedback ?? null,
    qualityWarning:    qualityWarning ?? null,

    // Stats
    stats: {
      duration:    s.duration ?? null,
      wpm:         s.wpm ?? null,
      fillerWords: s.fillerWords ?? {},
      fillerTotal: s.fillerTotal ?? 0,
      pauses:      s.pauses ?? 0,
      cefrLevel:   s.cefrLevel ?? null,
      rhythm:      s.rhythm ?? null,
    },
  };
}

/**
 * Get video duration using ffprobe JSON output — works without file extension.
 * Uses execFile for security (prevents command injection).
 */
export function getVideoDuration(videoPath, isUrl = false) {
  return new Promise((resolve, reject) => {
    // Try to find ffprobe in common locations
    const ffprobePaths = [
      'ffprobe', // Try PATH first
      '/nix/store/*/bin/ffprobe', // Nix store (Railway/Nixpacks)
      '/usr/bin/ffprobe', // Standard Linux
      '/usr/local/bin/ffprobe', // Homebrew/custom installs
    ];

    // Find which ffprobe exists - always try to locate it
    let ffprobeCmd = 'ffprobe';
    
    // Try to find ffprobe using which or find in nix store
    try {
      const result = execSync('which ffprobe 2>/dev/null || find /nix/store -name ffprobe -type f 2>/dev/null | head -1', {
        encoding: 'utf8',
        timeout: 5000
      }).trim();
      
      if (result) {
        ffprobeCmd = result;
        console.log('[ffprobe] Found at:', ffprobeCmd);
      } else {
        console.log('[ffprobe] Not found in PATH or /nix/store, trying default "ffprobe"');
      }
    } catch (findErr) {
      console.log('[ffprobe] Search failed, using default "ffprobe":', findErr.message);
    }

    // Build args array for ffprobe
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-count_packets',
      videoPath
    ];

    console.log('[ffprobe] Executing:', ffprobeCmd);

    execFile(ffprobeCmd || 'ffprobe', args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err || !stdout?.trim()) {
        console.error("[ffprobe] failed:", stderr || err?.message);
        console.error("[ffprobe] Command was:", ffprobeCmd);
        return reject(new Error("Could not read video duration. Please ensure the file is a valid video."));
      }
      try {
        const info = JSON.parse(stdout);
        // [ffprobe] Raw metadata removed — too verbose for production

        // Try format duration first
        let dur = parseFloat(info?.format?.duration);

        // Fallback: calculate from nb_read_packets * avg frame duration
        if (!dur || dur <= 0) {
          const videoStream = info?.streams?.find(s => s.codec_type === "video");
          dur = parseFloat(videoStream?.duration) || 0;

          // Last resort: use nb_read_packets and r_frame_rate
          if ((!dur || dur <= 0) && videoStream?.nb_read_packets && videoStream?.r_frame_rate) {
            const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
            const fps = den ? num / den : 0;
            console.log("[ffprobe] Calculating from packets:", videoStream.nb_read_packets, "fps:", fps);
            if (fps > 0) dur = parseInt(videoStream.nb_read_packets) / fps;
          }
        }

        console.log("[ffprobe] Final duration:", dur);
        
        // Emergency fallback: estimate from file size (only for local files)
        if (!dur || dur <= 0) {
          if (!isUrl) {
            const fileSize = fs.statSync(videoPath).size;
            const estimatedDur = Math.round(fileSize / (1024 * 1024) * 10);
            if (estimatedDur > 0) { dur = estimatedDur; }
          }
          if (!dur || dur <= 0) {
            return reject(new Error("Could not determine video duration."));
          }
        }
        
        resolve(Math.round(dur));
      } catch (parseErr) {
        console.error("[ffprobe] Parse error:", parseErr);
        reject(new Error("Could not read video metadata."));
      }
    });
  });
}

export { parseFeedbackToStructure };
