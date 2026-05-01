/**
 * Pure helper functions for ai/analyzeVideo.js.
 * Extracted here so they can be property-tested without requiring ffmpeg.
 */

/**
 * Generates evenly distributed frame extraction timestamps for a video.
 *
 * For each i in 1..frameCount, the timestamp is:
 *   Math.max(1, Math.floor((duration * i) / (frameCount + 1)))
 *
 * @param {number} duration   - Video duration in seconds (positive number)
 * @param {number} frameCount - Number of frames to extract (positive integer)
 * @returns {number[]}        - Array of frameCount timestamps in seconds
 */
export function generateTimestamps(duration, frameCount) {
  const timestamps = [];
  for (let i = 1; i <= frameCount; i++) {
    const t = Math.max(1, Math.floor((duration * i) / (frameCount + 1)));
    timestamps.push(t);
  }
  return timestamps;
}

/**
 * Filters an array of frame extraction results, removing null entries.
 * Preserves the relative order of non-null entries.
 *
 * @param {Array<string|null>} results - Array of base64 frame strings or nulls
 * @returns {string[]}                 - Array containing only non-null entries
 */
export function filterFrames(results) {
  return results.filter(Boolean);
}
