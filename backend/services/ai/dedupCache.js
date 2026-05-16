/**
 * ai/dedupCache.js — Redis-backed deduplication cache for the video feedback pipeline.
 * Falls back to an in-memory Map if Redis is unavailable or not configured.
 *
 * Exports:
 *   - hashBuffer(buffer)
 *   - markProcessing(hash)
 *   - storeResult(hash, result)
 *   - getCacheEntry(hash)
 *   - evict(hash)
 *   - dedupCache  (the underlying Map — used only in fallback / tests)
 *   - CACHE_TTL_MS
 */

import { createHash } from 'node:crypto';
import { getRedisClient, isRedisAvailable } from '../../config/redis.js';

// ---------------------------------------------------------------------------
// TTL helpers — expire at midnight IST (Asia/Kolkata)
// ---------------------------------------------------------------------------

/** CACHE_TTL_MS kept for in-memory fallback and tests. */
export const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 50_400_000;

/**
 * Returns seconds remaining until the next midnight in IST (Asia/Kolkata).
 * Minimum 60s so we never set a near-zero TTL right at midnight.
 */
function secondsUntilMidnightIST() {
  const now = new Date();
  // Midnight IST = next day 00:00:00 in Asia/Kolkata
  const midnight = new Date(
    new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  );
  midnight.setHours(24, 0, 0, 0); // next midnight in local IST wall-clock
  // Convert back: get IST offset in ms
  const istOffset = 5.5 * 60 * 60 * 1000; // UTC+5:30
  const midnightUTC = midnight.getTime() - istOffset;
  const diff = Math.floor((midnightUTC - now.getTime()) / 1000);
  return Math.max(diff, 60);
}

const KEY_PREFIX = 'dedup:';

// ---------------------------------------------------------------------------
// In-memory fallback Map
// ---------------------------------------------------------------------------

/**
 * Fallback Map used when Redis is unavailable.
 * Also exported so existing tests can inspect / clear it directly.
 * @type {Map<string, 'processing' | string>}
 */
export const dedupCache = new Map();

// ---------------------------------------------------------------------------
// hashBuffer
// ---------------------------------------------------------------------------

/**
 * Computes a SHA-256 hex digest of the given Buffer.
 *
 * @param {Buffer | Uint8Array} buffer
 * @returns {string}  hex digest
 */
export function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// ---------------------------------------------------------------------------
// Cache operations — Redis-first, Map fallback
// ---------------------------------------------------------------------------

/**
 * Marks a hash as currently being processed.
 * Expires at midnight IST so the lock auto-clears with the daily reset.
 *
 * @param {string} hash
 */
export async function markProcessing(hash) {
  const client = getRedisClient();
  if (client && isRedisAvailable()) {
    try {
      await client.set(`${KEY_PREFIX}${hash}`, 'processing', 'EX', secondsUntilMidnightIST());
      return;
    } catch (err) {
      console.log('[DedupCache] markProcessing Redis error, using fallback:', err.message);
    }
  }
  dedupCache.set(hash, 'processing');
}

/**
 * Stores a completed feedback result.
 * Expires at midnight IST — aligns with the daily reset at 12:00 AM.
 *
 * @param {string} hash
 * @param {string} result  — formatted feedback text
 */
export async function storeResult(hash, result) {
  const client = getRedisClient();
  if (client && isRedisAvailable()) {
    try {
      await client.set(`${KEY_PREFIX}${hash}`, result, 'EX', secondsUntilMidnightIST());
      return;
    } catch (err) {
      console.log('[DedupCache] storeResult Redis error, using fallback:', err.message);
    }
  }
  dedupCache.set(hash, result);
  setTimeout(() => evict(hash), CACHE_TTL_MS);
}

/**
 * Returns the current cache state for a hash.
 * Returns 'processing', a result string, or null if not found.
 *
 * @param {string} hash
 * @returns {Promise<'processing' | string | null>}
 */
export async function getCacheEntry(hash) {
  const client = getRedisClient();
  if (client && isRedisAvailable()) {
    try {
      return await client.get(`${KEY_PREFIX}${hash}`);
    } catch (err) {
      console.log('[DedupCache] getCacheEntry Redis error, using fallback:', err.message);
    }
  }
  return dedupCache.get(hash) ?? null;
}

/**
 * Removes a hash from the cache.
 *
 * @param {string} hash
 */
export async function evict(hash) {
  const client = getRedisClient();
  if (client && isRedisAvailable()) {
    try {
      await client.del(`${KEY_PREFIX}${hash}`);
      return;
    } catch (err) {
      console.log('[DedupCache] evict Redis error, using fallback:', err.message);
    }
  }
  dedupCache.delete(hash);
}
