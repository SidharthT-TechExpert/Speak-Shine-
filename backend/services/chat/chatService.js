/**
 * Chat Service
 * Business logic for chat messaging
 */

import Auth from "../../../models/authSchema.js";
import { getRedisClient, isRedisAvailable } from "../../../redis.js";

const TTL = 86400; // 24 hours in seconds
const MAX_MESSAGES = 200; // keep last 200 messages per room
const GROUP_ROOM = "chat:group"; // single shared group room

/**
 * Canonical room key - sorted so both sides resolve the same key
 */
function roomKey(phoneA, phoneB) {
  const [a, b] = [phoneA, phoneB].sort();
  return `chat:${a}:${b}`;
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
async function saveMessages(redis, key, messages) {
  await redis.set(key, JSON.stringify(messages), "EX", TTL);
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
    { phone: 1, name: 1 }
  ).lean();
  
  return users;
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
export { roomKey, getMessages, saveMessages, MAX_MESSAGES, TTL, GROUP_ROOM };
