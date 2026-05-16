/**
 * Chat Service
 * Business logic for chat messaging
 */

import Auth from "../../../models/authSchema.js";
import { getRedisClient, isRedisAvailable } from "../../config/redis.js";

const TTL          = 86400;        // 24 hours — DM and group chat
const TTL_LIVE     = 12 * 3600;    // 12 hours — live session chat (after session ends)
const MAX_MESSAGES = 200;
const GROUP_ROOM   = "chat:group";

/**
 * Canonical room key for DMs
 */
function roomKey(phoneA, phoneB) {
  const [a, b] = [phoneA, phoneB].sort();
  return `chat:${a}:${b}`;
}

/**
 * Room key for a live session chat
 */
function liveSessionRoom(sessionId) {
  return `chat:live:${sessionId}`;
}

/**
 * Load messages from Redis for a room
 */
async function getMessages(redis, key) {
  const raw = await redis.get(key);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Save messages to Redis, reset TTL
 */
async function saveMessages(redis, key, messages, ttl = TTL) {
  await redis.set(key, JSON.stringify(messages), "EX", ttl);
}

/**
 * Set a 12-hour expiry on a live session chat room (called when session ends)
 * Pass immediate=true to delete right away instead of expiring.
 */
async function expireLiveSessionChat(sessionId, immediate = false) {
  if (!isRedisAvailable()) return;
  try {
    const redis = getRedisClient();
    const key = liveSessionRoom(sessionId);
    const exists = await redis.exists(key);
    if (exists) {
      if (immediate) {
        await redis.del(key);
        console.log(`[Chat] Live session ${sessionId} chat deleted immediately`);
      } else {
        await redis.expire(key, TTL_LIVE);
        console.log(`[Chat] Live session ${sessionId} chat expires in 12h`);
      }
    }
  } catch (err) {
    console.warn("[Chat] Failed to expire live session chat:", err.message);
  }
}

/**
 * Check if Redis is available
 */
function checkRedisAvailable() {
  if (!isRedisAvailable()) {
    const error = new Error("Chat unavailable — Redis not connected");
    error.statusCode = 503;
    throw error;
  }
}

/**
 * Get group chat history
 */
export async function getGroupChatHistory() {
  checkRedisAvailable();
  const redis = getRedisClient();
  const messages = await getMessages(redis, GROUP_ROOM);
  return { messages, room: GROUP_ROOM };
}

/**
 * Get list of available trainers to DM (for users)
 */
export async function getAvailableTrainers() {
  const trainers = await Auth.find(
    { role: { $in: ["trainer", "admin"] }, isActive: true },
    { phone: 1, name: 1, role: 1 }
  ).lean();
  return trainers;
}

/**
 * Get list of users (for trainers/admins)
 */
export async function getAvailableUsers() {
  const users = await Auth.find(
    { role: "user", isActive: true },
    { phone: 1, name: 1, role: 1 }
  ).lean();
  return users;
}

/**
 * Get DM peer list based on the caller's role
 */
export async function getPeers(myPhone, myRole) {
  let query;
  if (myRole === "admin") {
    query = { isActive: true, phone: { $ne: myPhone } };
  } else if (myRole === "trainer") {
    query = { role: "user", isActive: true };
  } else {
    query = { role: { $in: ["admin", "trainer"] }, isActive: true };
  }
  const peers = await Auth.find(query, { phone: 1, name: 1, role: 1 }).lean();
  return peers;
}

/**
 * Get message history with a peer
 */
export async function getChatHistory(myPhone, peerPhone) {
  checkRedisAvailable();
  const redis = getRedisClient();
  const key = roomKey(myPhone, peerPhone);
  const messages = await getMessages(redis, key);
  return { messages, room: key };
}

// Export utility functions for socket handlers
export {
  roomKey, liveSessionRoom, getMessages, saveMessages,
  MAX_MESSAGES, TTL, TTL_LIVE, GROUP_ROOM, expireLiveSessionChat,
};
