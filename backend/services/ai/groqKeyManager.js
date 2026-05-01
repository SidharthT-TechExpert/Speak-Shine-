/**
 * ai/groqKeyManager.js — Smart API key rotation for Groq.
 *
 * Reads GROQ_API_KEYS (comma-separated) from .env.
 * Falls back to GROQ_API_KEY if only one key is configured.
 *
 * Strategy: smart rotation with per-key rate-limit tracking.
 *   - Picks the next available (non-exhausted) key in round-robin order.
 *   - When a key gets a 429, marks it as exhausted until its reset time.
 *   - If ALL keys are exhausted, returns null so the caller can skip gracefully.
 *
 * Usage:
 *   import { getVisionKey, markKeyExhausted } from './groqKeyManager.js';
 *
 *   const key = getVisionKey();
 *   if (!key) { ... skip visual analysis ... }
 *
 *   const res = await fetch(..., { headers: { Authorization: `Bearer ${key}` } });
 *   if (res.status === 429) {
 *     const retryAfterMs = parseRetryAfter(res);
 *     markKeyExhausted(key, retryAfterMs);
 *   }
 */

import { getRedisClient, isRedisAvailable } from '../../../redis.js';

// ---------------------------------------------------------------------------
// Load keys from environment
// ---------------------------------------------------------------------------

function loadKeys() {
  const multi = process.env.GROQ_API_KEYS;
  if (multi) {
    const keys = multi.split(",").map(k => k.trim()).filter(Boolean);
    if (keys.length > 0) return keys;
  }
  const single = process.env.GROQ_API_KEY;
  if (single) return [single.trim()];
  return [];
}

// Keys are loaded lazily on first use so dotenv has time to populate process.env
let _keys = null;
function getKeys() {
  if (!_keys) _keys = loadKeys();
  return _keys;
}

// ---------------------------------------------------------------------------
// Per-key state tracking
// ---------------------------------------------------------------------------

/**
 * Maps key → timestamp (ms) when it becomes available again.
 * If not in this map (or timestamp is in the past), the key is available.
 * @type {Map<string, number>}
 */
const exhaustedUntil = new Map();

// Round-robin cursors — separate for vision and text so they don't interfere
let visionCursor = 0;
let textCursor = 0;

// ---------------------------------------------------------------------------
// Internal helper — picks next available key from a given cursor
// ---------------------------------------------------------------------------

function pickKey(cursorRef, label) {
  const KEYS = getKeys();
  if (KEYS.length === 0) return { key: null };

  const now = Date.now();
  for (let i = 0; i < KEYS.length; i++) {
    const idx = (cursorRef.value + i) % KEYS.length;
    const key = KEYS[idx];
    const blockedUntil = exhaustedUntil.get(key) ?? 0;

    if (now >= blockedUntil) {
      cursorRef.value = (idx + 1) % KEYS.length;
      return { key };
    }
  }

  const earliest = Math.min(...[...exhaustedUntil.values()]);
  const waitSec = Math.ceil((earliest - now) / 1000);
  console.log(`[KeyManager] ⚠️ All ${getKeys().length} Groq key(s) exhausted (${label}). Next reset in ~${waitSec}s`);
  return { key: null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the next available Groq API key for vision (image) calls.
 * Uses its own round-robin cursor independent of text calls.
 * @returns {string | null}
 */
export function getVisionKey() {
  const ref = { value: visionCursor };
  const { key } = pickKey(ref, "vision");
  visionCursor = ref.value;
  return key;
}

/**
 * Returns the next available Groq API key for text calls
 * (Whisper transcription, Llama speech analysis).
 * Uses its own round-robin cursor independent of vision calls.
 * @returns {string | null}
 */
export function getTextKey() {
  const ref = { value: textCursor };
  const { key } = pickKey(ref, "text");
  textCursor = ref.value;
  return key;
}

/**
 * Marks a key as rate-limited until `resetAfterMs` milliseconds from now.
 * If resetAfterMs is not provided, defaults to 24 hours (safe fallback for daily TPD limits).
 *
 * @param {string} key
 * @param {number} [resetAfterMs]
 */
export function markKeyExhausted(key, resetAfterMs) {
  const ms = resetAfterMs ?? 24 * 60 * 60 * 1000;
  const resetAt = Date.now() + ms;
  exhaustedUntil.set(key, resetAt);

  // Persist to Redis so restarts don't forget exhausted keys
  const client = getRedisClient();
  if (client && isRedisAvailable()) {
    const ttlS = Math.ceil(ms / 1000);
    client.set(`groq:exhausted:${key.slice(-8)}`, String(resetAt), 'EX', ttlS).catch(() => {});
  }

  const resetIn = Math.ceil(ms / 60000);
  const keyHint = key.slice(-6);
  console.log(`[KeyManager] Key ...${keyHint} exhausted — will retry in ~${resetIn} min (${getKeys().length - countExhausted()} key(s) remaining)`);
}

/**
 * Parses the retry-after duration from a Groq 429 response body.
 * Groq includes "Please try again in Xm Ys" in the error message.
 *
 * @param {string} responseText — raw response body text
 * @returns {number} milliseconds to wait, or 0 if not parseable
 */
export function parseRetryAfter(responseText) {
  // Match "Please try again in 23m35.4048s" or "in 5m" or "in 30s"
  const match = responseText.match(/try again in\s+(?:(\d+)m)?(?:([\d.]+)s)?/i);
  if (!match) return 0;
  const minutes = parseInt(match[1] ?? "0");
  const seconds = parseFloat(match[2] ?? "0");
  return Math.ceil((minutes * 60 + seconds) * 1000) + 5000; // +5s buffer
}

/**
 * Returns total number of configured keys.
 * @returns {number}
 */
export function keyCount() {
  return getKeys().length;
}

function countExhausted() {
  const now = Date.now();
  return [...exhaustedUntil.values()].filter(t => t > now).length;
}

export function keyStatus() {
  const total = getKeys().length;
  const exhausted = countExhausted();
  return `${total} key(s) configured (${total - exhausted} available, ${exhausted} exhausted)`;
}
