import { exec } from "child_process";
import path from "path";

// Minimum mean volume in dB — below this the audio is too quiet to transcribe reliably
const MIN_VOLUME_DB = -40;

/**
 * Checks audio loudness using ffmpeg volumedetect filter.
 * Returns { meanVolume, maxVolume } in dB, or null if check fails.
 */
function checkAudioQuality(audioPath) {
  return new Promise((resolve) => {
    exec(
      `ffmpeg -i "${audioPath}" -af "volumedetect" -f null /dev/null`,
      (err, stdout, stderr) => {
        // volumedetect output goes to stderr
        const output = stderr || stdout || "";
        const meanMatch = output.match(/mean_volume:\s*([-\d.]+)\s*dB/);
        const maxMatch = output.match(/max_volume:\s*([-\d.]+)\s*dB/);
        if (!meanMatch) {
          resolve(null);
          return;
        }
        resolve({
          meanVolume: parseFloat(meanMatch[1]),
          maxVolume: maxMatch ? parseFloat(maxMatch[1]) : null,
        });
      }
    );
  });
}

/**
 * Extracts audio from video and runs a quality pre-check.
 * Returns { audioPath, qualityWarning } where qualityWarning is a string
 * if the audio is too quiet/noisy, or null if audio is fine.
 */
export async function extractAudio(videoPath, id) {
  return new Promise((resolve, reject) => {
    const audioPath = path.resolve(`./tmp/audio_${id}.mp3`);
    // Use 64k for longer videos to stay well under Groq's 25MB file size limit.
    // 64kbps × 600s (10 min) = ~4.8MB — safe for any reasonable video length.
    exec(
      `ffmpeg -i "${videoPath}" -vn -ar 16000 -ac 1 -b:a 64k "${audioPath}" -y`,
      async (err) => {
        if (err) return reject(err);

        // Run quality check after extraction
        let quality = null;
        try {
          quality = await checkAudioQuality(audioPath);
          if (quality) {
            console.log(`🔊 Audio quality: mean=${quality.meanVolume}dB max=${quality.maxVolume}dB`);
            if (quality.meanVolume < MIN_VOLUME_DB) {
              console.log(`⚠️ Audio too quiet (${quality.meanVolume}dB) — transcription may be inaccurate`);
              resolve({
                audioPath,
                qualityWarning: `Audio is very quiet (${quality.meanVolume}dB). For better feedback, record in a quieter environment and speak closer to the microphone.`,
                meanVolume: quality.meanVolume,
              });
              return;
            }
          }
        } catch (_) {
          // Quality check is non-fatal
        }

        resolve({ audioPath, qualityWarning: null, meanVolume: quality?.meanVolume ?? null });
      }
    );
  });
}
