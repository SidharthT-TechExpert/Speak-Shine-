import { getRedisClient, isRedisAvailable } from '../redis.js';

// In-memory fallback
const cooldowns = new Map();

const KEY = (userId, groupId) => `cooldown:${userId}_${groupId}`;

export async function isOnCooldown(userId, groupId, minutes = 2) {
  const cooldownMs = minutes * 60 * 1000;

  const client = getRedisClient();
  if (client && isRedisAvailable()) {
    try {
      const val = await client.get(KEY(userId, groupId));
      if (!val) return false;
      return (Date.now() - Number(val)) < cooldownMs;
    } catch (_) {}
  }

  // fallback
  const lastTime = cooldowns.get(KEY(userId, groupId));
  if (!lastTime) return false;
  return (Date.now() - lastTime) < cooldownMs;
}

export async function setCooldown(userId, groupId, minutes = 2) {
  const ttlS = minutes * 60;
  const now = Date.now();

  const client = getRedisClient();
  if (client && isRedisAvailable()) {
    try {
      await client.set(KEY(userId, groupId), String(now), 'EX', ttlS);
      return;
    } catch (_) {}
  }

  // fallback
  const k = KEY(userId, groupId);
  cooldowns.set(k, now);
  setTimeout(() => cooldowns.delete(k), ttlS * 1000);
}

export async function getRemainingCooldown(userId, groupId, minutes = 2) {
  const cooldownMs = minutes * 60 * 1000;

  const client = getRedisClient();
  if (client && isRedisAvailable()) {
    try {
      const val = await client.get(KEY(userId, groupId));
      if (!val) return 0;
      const remaining = cooldownMs - (Date.now() - Number(val));
      return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    } catch (_) {}
  }

  // fallback
  const lastTime = cooldowns.get(KEY(userId, groupId));
  if (!lastTime) return 0;
  const remaining = cooldownMs - (Date.now() - lastTime);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}
