/**
 * cacheService.js — Redis-backed cache with in-memory fallback
 *
 * Strategy:
 *   - All dashboard data cached for 18 hours
 *   - Invalidated on video upload (user + overview + community)
 *   - Invalidated at midnight reset (everything)
 */

import { getRedisClient, isRedisAvailable } from "../../../redis.js";

export const TTL_18H = 18 * 60 * 60; // seconds

// In-memory fallback when Redis is unavailable
const memCache = new Map(); // key → { value, expiresAt }

// ── Low-level helpers ────────────────────────────────────────────────────────

async function get(key) {
  if (isRedisAvailable()) {
    try {
      const raw = await getRedisClient().get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn(`[Cache] Redis GET failed for ${key}:`, err.message);
    }
  }
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { memCache.delete(key); return null; }
  return entry.value;
}

async function set(key, value, ttlSeconds) {
  if (isRedisAvailable()) {
    try {
      await getRedisClient().set(key, JSON.stringify(value), "EX", ttlSeconds);
      return;
    } catch (err) {
      console.warn(`[Cache] Redis SET failed for ${key}:`, err.message);
    }
  }
  memCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function del(key) {
  if (isRedisAvailable()) {
    try { await getRedisClient().del(key); } catch {}
  }
  memCache.delete(key);
}

async function delPattern(pattern) {
  if (isRedisAvailable()) {
    try {
      const keys = await getRedisClient().keys(pattern);
      if (keys.length > 0) await getRedisClient().del(...keys);
    } catch (err) {
      console.warn(`[Cache] Redis DEL pattern failed:`, err.message);
    }
  }
  // Memory fallback
  const prefix = pattern.replace("*", "");
  for (const k of memCache.keys()) {
    if (k.startsWith(prefix)) memCache.delete(k);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get or compute a cached value.
 * Cache miss → calls fn(), stores result, returns it.
 */
export async function cached(key, ttlSeconds, fn) {
  const hit = await get(key);
  if (hit !== null) {
    console.log(`[Cache] HIT  ${key}`);
    return hit;
  }
  console.log(`[Cache] MISS ${key}`);
  const value = await fn();
  await set(key, value, ttlSeconds);
  return value;
}

// ── Cache keys ───────────────────────────────────────────────────────────────

export const userDashboardKey  = (phone) => `dashboard:user:${phone}`;
export const userProfileKey    = (phone) => `profile:user:${phone}`;
export const OVERVIEW_KEY      = "dashboard:overview";
export const WEEKLY_KEY        = "dashboard:weekly";
export const MONTHLY_KEY       = "dashboard:monthly";
export const COMMUNITY_KEY     = "dashboard:community";

// ── Invalidation helpers ─────────────────────────────────────────────────────

/**
 * Called when a user uploads a video.
 * Clears their personal profile + shared overview + community feed.
 */
export async function invalidateOnUpload(phone) {
  await Promise.all([
    del(userProfileKey(phone)),
    del(OVERVIEW_KEY),
    del(COMMUNITY_KEY),
  ]);
  console.log(`[Cache] Invalidated on upload for ${phone}`);
}

/**
 * Called when submission counts are manually adjusted (admin/trainer).
 * Clears weekly and monthly report caches.
 */
export async function invalidateOnSubmissionChange() {
  await Promise.all([
    del(WEEKLY_KEY),
    del(MONTHLY_KEY),
  ]);
  console.log("[Cache] Invalidated weekly + monthly reports (submission adjusted)");
}

/**
 * Called at midnight reset.
 * Clears all dashboard caches so everyone gets fresh data.
 */
export async function invalidateAll() {
  await Promise.all([
    delPattern("dashboard:*"),
    delPattern("profile:*"),
  ]);
  console.log("[Cache] Invalidated all dashboard + profile caches (midnight reset)");
}
