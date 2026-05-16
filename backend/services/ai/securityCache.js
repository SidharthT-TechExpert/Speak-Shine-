/**
 * Security Check Cache
 * Lightweight Redis-based cache for security check results
 * Designed for 512MB RAM servers - stores only tiny metadata
 */

import { getRedisClient, isRedisAvailable } from '../../config/redis.js';

const CACHE_PREFIX = 'security:';
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days

/**
 * Check if video hash has passed security checks before
 * @param {string} videoHash - 16-frame hash from frontend
 * @returns {Promise<object|null>} - Cached result or null
 */
export async function checkSecurityCache(videoHash) {
  if (!isRedisAvailable()) return null;
  
  try {
    const redis = getRedisClient();
    const key = `${CACHE_PREFIX}${videoHash}`;
    const cached = await redis.get(key);
    
    if (!cached) return null;
    
    const result = JSON.parse(cached);
    console.log(`[SecurityCache] ✅ Cache HIT for ${videoHash.substring(0, 12)}...`);
    
    return result;
  } catch (err) {
    console.warn('[SecurityCache] Check failed:', err.message);
    return null;
  }
}

/**
 * Save security check result to cache
 * @param {string} videoHash - 16-frame hash from frontend
 * @param {object} result - { passed: boolean, checks: {...} }
 */
export async function saveSecurityCache(videoHash, result) {
  if (!isRedisAvailable()) return;
  
  try {
    const redis = getRedisClient();
    const key = `${CACHE_PREFIX}${videoHash}`;
    
    // Store minimal data - only pass/fail status and check names
    const cacheData = {
      passed: result.passed,
      checks: result.checks, // { virusScan: true, codecValid: true, contentSafe: true }
      cachedAt: Date.now(),
    };
    
    await redis.setex(key, CACHE_TTL, JSON.stringify(cacheData));
    console.log(`[SecurityCache] 💾 Cached result for ${videoHash.substring(0, 12)}...`);
  } catch (err) {
    console.warn('[SecurityCache] Save failed:', err.message);
  }
}

/**
 * Get cache statistics (for monitoring)
 */
export async function getSecurityCacheStats() {
  if (!isRedisAvailable()) {
    return { available: false, keys: 0, memoryUsed: 0 };
  }
  
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    
    // Get memory usage (Redis INFO command)
    const info = await redis.info('memory');
    const memMatch = info.match(/used_memory:(\d+)/);
    const memoryUsed = memMatch ? parseInt(memMatch[1]) : 0;
    
    return {
      available: true,
      keys: keys.length,
      memoryUsed: Math.round(memoryUsed / 1024), // KB
      ttl: CACHE_TTL,
    };
  } catch (err) {
    console.warn('[SecurityCache] Stats failed:', err.message);
    return { available: false, keys: 0, memoryUsed: 0 };
  }
}

/**
 * Clear all security cache entries (admin function)
 */
export async function clearSecurityCache() {
  if (!isRedisAvailable()) return { cleared: 0 };
  
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    
    if (keys.length === 0) return { cleared: 0 };
    
    await redis.del(...keys);
    console.log(`[SecurityCache] 🗑️ Cleared ${keys.length} entries`);
    
    return { cleared: keys.length };
  } catch (err) {
    console.warn('[SecurityCache] Clear failed:', err.message);
    return { cleared: 0, error: err.message };
  }
}
