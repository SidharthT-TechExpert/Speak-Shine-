import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execFileAsync = promisify(execFile);

// Minimum mean volume in dB — below this the audio is too quiet to transcribe reliably
const MIN_VOLUME_DB = -40;

/**
 * Extracts audio from video AND checks quality in a single ffmpeg pass.
 * Uses execFile (no shell injection risk) and combines both operations.
 *
 * Single ffmpeg command:
 *   - Extracts mono 16kHz audio (optimal for Whisper — smaller file, same quality)
 *   - Simultaneously runs volumedetect filter to measure loudness
 *   - Outputs audio to file, volume stats to stderr
 *
 * Returns { audioPath, qualityWarning, meanVolume }
 */
export async function extractAudio(videoPath, id) {
  const audioPath = path.resolve(`./tmp/audio_${id}.wav`);

  // Single-pass: extract audio + measure volume simultaneously
  // -af "volumedetect,anull" — volumedetect measures, anull passes through
  // Two outputs: the wav file and a null sink for volume stats
  let stderr = "";
  try {
    const result = await execFileAsync("ffmpeg", [
      "-i", videoPath,
      "-vn",                    // no video
      "-ar", "16000",           // 16kHz — Whisper's native rate
      "-ac", "1",               // mono
      "-acodec", "pcm_s16le",   // WAV PCM — no encoding overhead, fastest
      "-af", "volumedetect",    // measure volume in same pass
      "-f", "wav",
      audioPath,
      "-y",                     // overwrite
    ], {
      timeout: 60000,
      // stderr contains volumedetect output
    }).catch(err => {
      // ffmpeg exits non-zero when volumedetect is used with a file output
      // but the file is still written correctly — capture stderr
      stderr = err.stderr || "";
      if (!err.stderr?.includes("volumedetect") && err.code !== 0) throw err;
      return { stderr: err.stderr || "" };
    });

    stderr = result?.stderr || stderr;
  } catch (err) {
    throw new Error(`Audio extraction failed: ${err.message}`);
  }

  // Parse volume stats from stderr
  const meanMatch = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
  const maxMatch  = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
  const meanVolume = meanMatch ? parseFloat(meanMatch[1]) : null;
  const maxVolume  = maxMatch  ? parseFloat(maxMatch[1])  : null;

  if (meanVolume !== null) {
    console.log(`🔊 Audio quality: mean=${meanVolume}dB max=${maxVolume}dB`);
  }

  // Detect complete silence or muted microphone (mean below -48dB or peak never above -40dB)
  // Human speech is typically -18dB to -32dB; even a whisper into mic is -36dB to -44dB.
  // Below -48dB is pure room noise, empty silence, or a muted microphone.
  const isSilent = (meanVolume !== null && meanVolume < -48) || (maxVolume !== null && maxVolume < -40);

  // Automatic amplification / normalization for quiet recordings
  // If maxVolume is quiet (below -6dB) or meanVolume is below -32dB, boost gain so Whisper transcribes accurately
  // CRITICAL: NEVER amplify pure silence (< -48dB) as that boosts microphone hiss and triggers Whisper hallucinations!
  if (!isSilent && maxVolume !== null && maxVolume < -6) {
    const boostDb = Math.min(26, Math.max(3, -2 - maxVolume));
    console.log(`🔊 Low audio level detected (${maxVolume}dB max, ${meanVolume}dB mean). Amplifying by +${boostDb.toFixed(1)}dB for Whisper...`);
    const boostedPath = path.resolve(`./tmp/audio_${id}_norm.wav`);
    try {
      await execFileAsync("ffmpeg", [
        "-i", audioPath,
        "-af", `volume=${boostDb.toFixed(1)}dB`,
        "-ar", "16000",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        boostedPath,
        "-y",
      ], { timeout: 30000 });
      if (fs.existsSync(boostedPath)) {
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        fs.renameSync(boostedPath, audioPath);
        console.log(`✅ Audio amplified by +${boostDb.toFixed(1)}dB for high-accuracy Whisper transcription`);
      }
    } catch (normErr) {
      console.warn("Audio normalization warning:", normErr.message);
    }
  }

  if (isSilent) {
    console.log(`🔇 Pure silence detected (mean=${meanVolume}dB, max=${maxVolume}dB) — no speech present`);
    return {
      audioPath,
      isSilent: true,
      qualityWarning: `Audio is silent (${meanVolume ?? maxVolume}dB). No audible speech detected.`,
      meanVolume,
      maxVolume,
    };
  }

  if (meanVolume !== null && meanVolume < MIN_VOLUME_DB) {
    console.log(`⚠️ Audio too quiet (${meanVolume}dB) — transcription may be inaccurate`);
    return {
      audioPath,
      isSilent: false,
      qualityWarning: `Audio is quiet (${meanVolume}dB). For best clarity, record in a quieter environment and speak closer to your microphone.`,
      meanVolume,
      maxVolume,
    };
  }

  return { audioPath, isSilent: false, qualityWarning: null, meanVolume: meanVolume ?? null, maxVolume: maxVolume ?? null };
}
