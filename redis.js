/**
 * redis.js — Shared Redis client singleton.
 * Used by dedupCache, groqKeyManager, and grammar cooldown.
 * Falls back gracefully if REDIS_URL is not set.
 */

import Redis from 'ioredis';

let _redis = null;
let _available = false;

export function getRedisClient() {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  _redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    enableOfflineQueue: false,
  });

  _redis.on('ready', () => {
    _available = true;
    console.log('[Redis] Connected');
  });

  _redis.on('error', (err) => {
    if (_available) console.log('[Redis] Error — falling back to in-memory:', err.message);
    _available = false;
  });

  _redis.on('close', () => { _available = false; });

  _redis.connect().catch(() => {});

  return _redis;
}

export function isRedisAvailable() {
  return _available;
}
