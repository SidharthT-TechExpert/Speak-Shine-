// Cooldown management
const cooldowns = new Map();

export function isOnCooldown(userId, groupId, minutes = 2) {
  const key = `${userId}_${groupId}`;
  const lastTime = cooldowns.get(key);
  
  if (!lastTime) return false;
  
  const now = Date.now();
  const diff = now - lastTime;
  const cooldownMs = minutes * 60 * 1000;
  
  return diff < cooldownMs;
}

export function setCooldown(userId, groupId) {
  const key = `${userId}_${groupId}`;
  cooldowns.set(key, Date.now());
  
  // Clean up old entries after 10 minutes
  setTimeout(() => {
    cooldowns.delete(key);
  }, 10 * 60 * 1000);
}

export function getRemainingCooldown(userId, groupId, minutes = 2) {
  const key = `${userId}_${groupId}`;
  const lastTime = cooldowns.get(key);
  
  if (!lastTime) return 0;
  
  const now = Date.now();
  const diff = now - lastTime;
  const cooldownMs = minutes * 60 * 1000;
  const remaining = cooldownMs - diff;
  
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}
