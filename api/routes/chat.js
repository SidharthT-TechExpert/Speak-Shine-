/**
 * chat.js — REST endpoints for DM chat history
 * Messages stored in Redis with 24h TTL (auto-expire)
 * Room key: chat:{phoneA}:{phoneB} — phones sorted alphabetically
 */

import express from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import Auth from "../../models/authSchema.js";
import { getRedisClient, isRedisAvailable } from "../../redis.js";

const router = express.Router();
const TTL = 86400; // 24 hours in seconds
const MAX_MESSAGES = 200; // keep last 200 messages per room

/** Canonical room key — sorted so both sides resolve the same key */
function roomKey(phoneA, phoneB) {
  const [a, b] = [phoneA, phoneB].sort();
  return `chat:${a}:${b}`;
}

/** Load messages from Redis for a room */
async function getMessages(redis, key) {
  const raw = await redis.get(key);
  return raw ? JSON.parse(raw) : [];
}

/** Save messages to Redis, reset TTL */
async function saveMessages(redis, key, messages) {
  await redis.set(key, JSON.stringify(messages), "EX", TTL);
}

// GET /api/chat/trainers — user: list available trainers to DM
router.get("/trainers", authMiddleware, async (req, res) => {
  try {
    const trainers = await Auth.find(
      { role: { $in: ["trainer", "admin"] }, isActive: true },
      { phone: 1, name: 1, role: 1 }
    ).lean();
    res.json(trainers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/users — trainer/admin: list users they have chats with
router.get("/users", authMiddleware, requireRole("trainer", "admin"), async (req, res) => {
  try {
    const users = await Auth.find(
      { role: "user", isActive: true },
      { phone: 1, name: 1 }
    ).lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/:peerPhone — load message history with a peer
router.get("/:peerPhone", authMiddleware, async (req, res) => {
  try {
    if (!isRedisAvailable()) {
      return res.status(503).json({ error: "Chat unavailable — Redis not connected" });
    }
    const redis = getRedisClient();
    const myPhone = req.user.phone;
    const peerPhone = req.params.peerPhone;

    const key = roomKey(myPhone, peerPhone);
    const messages = await getMessages(redis, key);

    res.json({ messages, room: key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export { roomKey, getMessages, saveMessages, MAX_MESSAGES, TTL };
export default router;
