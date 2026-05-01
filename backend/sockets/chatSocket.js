/**
 * Chat Socket Handler
 * Real-time messaging with Socket.io
 */

import jwt from "jsonwebtoken";
import { roomKey, getMessages, saveMessages, MAX_MESSAGES, GROUP_ROOM } from "../services/chat/chatService.js";
import { isRedisAvailable, getRedisClient } from "../../redis.js";

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Initialize chat socket handlers
 * @param {SocketIO.Server} io - Socket.io server instance
 * @param {Map} onlineUsers - Map of online users (phone -> socketId)
 */
export function initializeChatSocket(io, onlineUsers) {
  // Auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("No token"));
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const { phone, name, role } = socket.user;
    onlineUsers.set(phone, socket.id);
    console.log(`[Chat] Connected: ${name} (${role})`);

    // ── Auto-join group room ────────────────────────────────────────────────
    socket.join(GROUP_ROOM);

    // ── Join group chat (load history) ─────────────────────────────────────
    socket.on("group:join", async () => {
      if (isRedisAvailable()) {
        const redis = getRedisClient();
        const messages = await getMessages(redis, GROUP_ROOM);
        socket.emit("group:history", { messages });
      }
    });

    // ── Send group message ──────────────────────────────────────────────────
    socket.on("group:send", async ({ text, replyTo }) => {
      if (!text?.trim()) return;

      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        from: phone,
        fromName: name,
        role,
        text: text.trim(),
        ts: Date.now(),
        replyTo: replyTo || null, // { id, fromName, text }
      };

      if (isRedisAvailable()) {
        const redis = getRedisClient();
        const messages = await getMessages(redis, GROUP_ROOM);
        messages.push(message);
        if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES);
        await saveMessages(redis, GROUP_ROOM, messages);
      }

      io.to(GROUP_ROOM).emit("group:message", { message });
    });

    // ── Group typing indicator ──────────────────────────────────────────────
    socket.on("group:typing", ({ isTyping }) => {
      socket.to(GROUP_ROOM).emit("group:typing", { from: phone, fromName: name, isTyping });
    });

    // ── Join a DM room with a peer ──────────────────────────────────────────
    socket.on("chat:join", async ({ peerPhone }) => {
      if (!peerPhone) return;
      const room = roomKey(phone, peerPhone);
      socket.join(room);

      if (isRedisAvailable()) {
        const redis = getRedisClient();
        const messages = await getMessages(redis, room);

        // Mark peer's undelivered messages as delivered now that we're in the room
        let changed = false;
        for (const msg of messages) {
          if (msg.from === peerPhone && msg.status === "sent") {
            msg.status = "delivered";
            changed = true;
          }
        }
        if (changed) {
          await saveMessages(redis, room, messages);
          // Tell sender their messages are delivered
          const peerSocketId = onlineUsers.get(peerPhone);
          if (peerSocketId) io.to(peerSocketId).emit("chat:delivered", { room });
        }

        socket.emit("chat:history", { room, messages });
      }
    });

    // ── Send a message ──────────────────────────────────────────────────────
    socket.on("chat:send", async ({ peerPhone, text }) => {
      if (!peerPhone || !text?.trim()) return;

      const room = roomKey(phone, peerPhone);
      const peerOnline = onlineUsers.has(peerPhone);
      const peerSocketId = onlineUsers.get(peerPhone);
      const peerInRoom = peerSocketId
        ? io.sockets.sockets.get(peerSocketId)?.rooms?.has(room)
        : false;

      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        from: phone,
        fromName: name,
        text: text.trim(),
        ts: Date.now(),
        // sent → delivered (peer online) → seen (peer has room open)
        status: peerInRoom ? "seen" : peerOnline ? "delivered" : "sent",
      };

      // Persist to Redis
      if (isRedisAvailable()) {
        const redis = getRedisClient();
        const messages = await getMessages(redis, room);
        messages.push(message);
        if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES);
        await saveMessages(redis, room, messages);
      }

      // Broadcast to both users in the room
      io.to(room).emit("chat:message", { room, message });

      // Notify peer if not in room
      if (peerSocketId && !peerInRoom) {
        io.to(peerSocketId).emit("chat:notify", {
          from: phone,
          fromName: name,
          preview: text.trim().slice(0, 60),
        });
      }
    });

    // ── Mark messages as seen ───────────────────────────────────────────────
    socket.on("chat:seen", async ({ peerPhone }) => {
      if (!peerPhone) return;
      const room = roomKey(phone, peerPhone);

      if (isRedisAvailable()) {
        const redis = getRedisClient();
        const messages = await getMessages(redis, room);
        let changed = false;
        for (const msg of messages) {
          // Only update messages sent by the peer (not mine)
          if (msg.from === peerPhone && msg.status !== "seen") {
            msg.status = "seen";
            changed = true;
          }
        }
        if (changed) await saveMessages(redis, room, messages);
      }

      // Tell the sender their messages were seen
      const peerSocketId = onlineUsers.get(peerPhone);
      if (peerSocketId) {
        io.to(peerSocketId).emit("chat:seen", { by: phone, room });
      }
    });

    // ── Typing indicator ────────────────────────────────────────────────────
    socket.on("chat:typing", ({ peerPhone, isTyping }) => {
      if (!peerPhone) return;
      const room = roomKey(phone, peerPhone);
      socket.to(room).emit("chat:typing", { from: phone, isTyping });
    });

    socket.on("disconnect", () => {
      onlineUsers.delete(phone);
      console.log(`[Chat] Disconnected: ${name}`);
    });
  });
}
