/**
 * Chat Socket Handler
 * Real-time messaging with Socket.io
 */

import jwt from "jsonwebtoken";
import { roomKey, getMessages, saveMessages, MAX_MESSAGES, GROUP_ROOM } from "../services/chat/chatService.js";
import { isRedisAvailable, getRedisClient } from "../../redis.js";
import { sanitizeText, isValidPhone, SanitizeError, LIMITS } from "../utils/textSanitizer.js";

const JWT_SECRET = process.env.JWT_SECRET;

// ── Per-user rate limiter (in-memory, resets on server restart) ───────────────
// Allows MAX_MSG messages per WINDOW_MS per phone number.
const RATE_WINDOW_MS = 5_000;  // 5 seconds
const MAX_MSG        = 5;       // max messages per window

const rateBuckets = new Map(); // phone → { count, resetAt }

function checkRateLimit(phone) {
  const now = Date.now();
  let bucket = rateBuckets.get(phone);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(phone, bucket);
  }

  bucket.count++;
  return bucket.count <= MAX_MSG;
}

// Clean up stale buckets every minute to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [phone, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(phone);
  }
}, 60_000);

// ── Sanitize replyTo object ───────────────────────────────────────────────────
function sanitizeReplyTo(replyTo) {
  if (!replyTo || typeof replyTo !== "object") return null;

  try {
    return {
      id:       typeof replyTo.id === "string" ? replyTo.id.slice(0, 64) : null,
      fromName: sanitizeText(String(replyTo.fromName || ""), LIMITS.NAME_PREVIEW, "Reply name"),
      text:     sanitizeText(String(replyTo.text     || ""), LIMITS.REPLY_PREVIEW, "Reply text"),
    };
  } catch {
    return null; // drop malformed replyTo silently
  }
}

// Module-level references so forceLogoutUser can be called from outside
let _io = null;
let _onlineUsers = null;

/**
 * Force-logout a user by phone number in real time.
 * Emits `force:logout` to their socket if they are currently connected.
 * Called by userService.toggleUserStatus when an account is disabled.
 */
export function forceLogoutUser(phone) {
  if (!_io || !_onlineUsers) return;
  const socketId = _onlineUsers.get(phone);
  if (socketId) {
    _io.to(socketId).emit("force:logout", { reason: "Account disabled by admin" });
    console.log(`[Chat] force:logout sent to ${phone} (socket ${socketId})`);
  }
}

/**
 * Initialize chat socket handlers
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {Map} onlineUsers - Map of online users (phone -> socketId)
 */
export function initializeChatSocket(io, onlineUsers) {
  _io = io;
  _onlineUsers = onlineUsers;
  // ── Auth middleware ──────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      console.log("[Chat] Socket connection rejected: No token provided");
      return next(new Error("No token"));
    }
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      console.log(`[Chat] Socket authenticated: ${socket.user.name} (${socket.user.phone})`);
      next();
    } catch (err) {
      console.log(`[Chat] Socket authentication failed: ${err.message}`);
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const { phone, name, role } = socket.user;
    onlineUsers.set(phone, socket.id);
    console.log(`[Chat] Connected: ${name} (${role}) - Socket ID: ${socket.id}`);

    if (!isRedisAvailable()) {
      console.warn(`[Chat] Redis unavailable for user ${name} - chat features limited`);
      socket.emit("chat:error", { message: "Chat service temporarily unavailable" });
    }

    // ── Auto-join group room ─────────────────────────────────────────────────
    socket.join(GROUP_ROOM);

    // ── Group: load history ──────────────────────────────────────────────────
    socket.on("group:join", async () => {
      try {
        if (isRedisAvailable()) {
          const redis = getRedisClient();
          const messages = await getMessages(redis, GROUP_ROOM);
          socket.emit("group:history", { messages });
        } else {
          socket.emit("group:history", { messages: [] });
          socket.emit("chat:error", { message: "Chat history unavailable — Redis disconnected" });
        }
      } catch (err) {
        console.error(`[Chat] group:join error for ${name}:`, err);
        socket.emit("group:history", { messages: [] });
        socket.emit("chat:error", { message: "Failed to load chat history" });
      }
    });

    // ── Group: send message ──────────────────────────────────────────────────
    socket.on("group:send", async (payload) => {
      // Rate limit
      if (!checkRateLimit(phone)) {
        socket.emit("chat:error", { message: "You're sending messages too fast. Please slow down." });
        return;
      }

      let cleanText;
      try {
        cleanText = sanitizeText(payload?.text, LIMITS.CHAT_MESSAGE, "Message");
      } catch (err) {
        socket.emit("chat:error", { message: err instanceof SanitizeError ? err.message : "Invalid message" });
        return;
      }

      const cleanReplyTo = sanitizeReplyTo(payload?.replyTo);

      const message = {
        id:       `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        from:     phone,
        fromName: name,
        role,
        text:     cleanText,
        ts:       Date.now(),
        replyTo:  cleanReplyTo,
      };

      try {
        if (isRedisAvailable()) {
          const redis = getRedisClient();
          const messages = await getMessages(redis, GROUP_ROOM);
          messages.push(message);
          if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES);
          await saveMessages(redis, GROUP_ROOM, messages);
        } else {
          console.warn(`[Chat] Redis unavailable — message from ${name} not persisted`);
        }
        io.to(GROUP_ROOM).emit("group:message", { message });
      } catch (err) {
        console.error(`[Chat] group:send error for ${name}:`, err);
        socket.emit("chat:error", { message: "Failed to send message" });
      }
    });

    // ── Group: typing indicator ──────────────────────────────────────────────
    socket.on("group:typing", ({ isTyping }) => {
      socket.to(GROUP_ROOM).emit("group:typing", { from: phone, fromName: name, isTyping: !!isTyping });
    });

    // ── DM: join room ────────────────────────────────────────────────────────
    socket.on("chat:join", async ({ peerPhone }) => {
      if (!isValidPhone(peerPhone)) {
        console.warn(`[Chat] Invalid peer phone from ${name}: ${peerPhone}`);
        socket.emit("chat:error", { message: "Invalid peer" });
        return;
      }

      const room = roomKey(phone, peerPhone);
      socket.join(room);

      try {
        if (isRedisAvailable()) {
          const redis = getRedisClient();
          const messages = await getMessages(redis, room);

          let changed = false;
          for (const msg of messages) {
            if (msg.from === peerPhone && msg.status === "sent") {
              msg.status = "delivered";
              changed = true;
            }
          }
          if (changed) {
            await saveMessages(redis, room, messages);
            const peerSocketId = onlineUsers.get(peerPhone);
            if (peerSocketId) io.to(peerSocketId).emit("chat:delivered", { room });
          }

          socket.emit("chat:history", { room, messages });
        } else {
          socket.emit("chat:history", { room, messages: [] });
          socket.emit("chat:error", { message: "Chat history unavailable — Redis disconnected" });
        }
      } catch (err) {
        console.error(`[Chat] chat:join error for ${name}:`, err);
        socket.emit("chat:history", { room, messages: [] });
        socket.emit("chat:error", { message: "Failed to load chat history" });
      }
    });

    // ── DM: send message ─────────────────────────────────────────────────────
    socket.on("chat:send", async ({ peerPhone, text }) => {
      // Validate peer
      if (!isValidPhone(peerPhone)) {
        socket.emit("chat:error", { message: "Invalid recipient" });
        return;
      }

      // Rate limit
      if (!checkRateLimit(phone)) {
        socket.emit("chat:error", { message: "You're sending messages too fast. Please slow down." });
        return;
      }

      // Sanitize text
      let cleanText;
      try {
        cleanText = sanitizeText(text, LIMITS.CHAT_MESSAGE, "Message");
      } catch (err) {
        socket.emit("chat:error", { message: err instanceof SanitizeError ? err.message : "Invalid message" });
        return;
      }

      const room = roomKey(phone, peerPhone);
      const peerSocketId = onlineUsers.get(peerPhone);
      const peerInRoom   = peerSocketId
        ? io.sockets.sockets.get(peerSocketId)?.rooms?.has(room)
        : false;

      const message = {
        id:       `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        from:     phone,
        fromName: name,
        text:     cleanText,
        ts:       Date.now(),
        status:   peerInRoom ? "seen" : onlineUsers.has(peerPhone) ? "delivered" : "sent",
      };

      try {
        if (isRedisAvailable()) {
          const redis = getRedisClient();
          const messages = await getMessages(redis, room);
          messages.push(message);
          if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES);
          await saveMessages(redis, room, messages);
        }

        io.to(room).emit("chat:message", { room, message });

        if (peerSocketId && !peerInRoom) {
          io.to(peerSocketId).emit("chat:notify", {
            from:     phone,
            fromName: name,
            preview:  cleanText.slice(0, 60),
          });
        }
      } catch (err) {
        console.error(`[Chat] chat:send error for ${name}:`, err);
        socket.emit("chat:error", { message: "Failed to send message" });
      }
    });

    // ── DM: mark seen ────────────────────────────────────────────────────────
    socket.on("chat:seen", async ({ peerPhone }) => {
      if (!isValidPhone(peerPhone)) return;
      const room = roomKey(phone, peerPhone);

      try {
        if (isRedisAvailable()) {
          const redis = getRedisClient();
          const messages = await getMessages(redis, room);
          let changed = false;
          for (const msg of messages) {
            if (msg.from === peerPhone && msg.status !== "seen") {
              msg.status = "seen";
              changed = true;
            }
          }
          if (changed) await saveMessages(redis, room, messages);
        }

        const peerSocketId = onlineUsers.get(peerPhone);
        if (peerSocketId) io.to(peerSocketId).emit("chat:seen", { by: phone, room });
      } catch (err) {
        console.error(`[Chat] chat:seen error for ${name}:`, err);
      }
    });

    // ── DM: typing indicator ─────────────────────────────────────────────────
    socket.on("chat:typing", ({ peerPhone, isTyping }) => {
      if (!isValidPhone(peerPhone)) return;
      const room = roomKey(phone, peerPhone);
      socket.to(room).emit("chat:typing", { from: phone, isTyping: !!isTyping });
    });

    socket.on("disconnect", () => {
      onlineUsers.delete(phone);
      console.log(`[Chat] Disconnected: ${name} (${phone})`);
    });
  });
}
