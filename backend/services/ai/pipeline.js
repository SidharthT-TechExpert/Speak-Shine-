/**
 * ai/pipeline.js — Timeout wrapper and stage logger for the video feedback pipeline.
 *
 * Exports:
 *   - withTimeout(promise, ms, label)
 *   - startStage(stageName)
 *   - TRANSCRIBE_TIMEOUT_MS
 *   - SPEECH_TIMEOUT_MS
 *   - VISUAL_TIMEOUT_MS
 */

// ---------------------------------------------------------------------------
// Timeout constants (env-overridable with numeric fallback)
// ---------------------------------------------------------------------------

/** Maximum ms to wait for Groq Whisper transcription. Default: 180 000 (3 min) */
export const TRANSCRIBE_TIMEOUT_MS =
  Number(process.env.TRANSCRIBE_TIMEOUT_MS) || 180_000;

/** Maximum ms to wait for Groq Llama speech analysis. Default: 90 000 (1.5 min) */
export const SPEECH_TIMEOUT_MS =
  Number(process.env.SPEECH_TIMEOUT_MS) || 90_000;

/** Maximum ms to wait for Groq Vision visual analysis. Default: 180 000 (3 min) */
export const VISUAL_TIMEOUT_MS =
  Number(process.env.VISUAL_TIMEOUT_MS) || 180_000;

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------

/**
 * Races `promise` against a timer that rejects after `ms` milliseconds.
 * The rejection message includes `label` and the timeout value so callers
 * can identify which stage timed out.
 *
 * @param {Promise<any>} promise  — the operation to guard
 * @param {number}       ms      — timeout in milliseconds
 * @param {string}       label   — human-readable name included in the error
 * @returns {Promise<any>}
 */
export function withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(`Timeout: ${label} exceeded ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]);
}

// ---------------------------------------------------------------------------
// startStage
// ---------------------------------------------------------------------------

/**
 * Logs `[PIPELINE] <name> START ts=<epoch>` immediately and returns an object
 * whose `.end(err?)` method logs the completion line.
 *
 * On success:  `[PIPELINE] <name> DONE elapsed=<ms>`
 * On failure:  `[PIPELINE] <name> FAIL elapsed=<ms> error=<message>`
 *
 * @param {string} stageName
 * @returns {{ end: (err?: Error | null) => void }}
 */
export function startStage(stageName) {
  const startTs = Date.now();
  console.log(`[PIPELINE] ${stageName} START ts=${startTs}`);

  return {
    end(err) {
      const elapsed = Date.now() - startTs;
      if (err) {
        console.log(
          `[PIPELINE] ${stageName} FAIL elapsed=${elapsed} error=${err.message}`
        );
      } else {
        console.log(`[PIPELINE] ${stageName} DONE elapsed=${elapsed}`);
      }
    },
  };
}
