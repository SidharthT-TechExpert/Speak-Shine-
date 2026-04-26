import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server as SocketIO } from "socket.io";
import jwt from "jsonwebtoken";
import { connectDB } from "../db.js";
import { getRedisClient, isRedisAvailable } from "../redis.js";
import { roomKey, getMessages, saveMessages, MAX_MESSAGES } from "./routes/chat.js";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import dashboardRoutes from "./routes/dashboard.js";
import questionRoutes from "./routes/questions.js";
import videoAnalysisRoutes from "./routes/videoAnalysis.js";
import attendanceRoutes from "./routes/attendance.js";
import submissionRoutes from "./routes/submissions.js";
import chatRoutes from "./routes/chat.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "speakshine_secret_2024";

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || process.env.API_PORT || 3001;
const isProd = process.env.NODE_ENV === "production";

// ── Socket.io ───────────────────────────────────────────────────────────────
const io = new SocketIO(httpServer, {
  cors: { origin: "*", credentials: true },
});

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

// Track online users: phone → socketId
const onlineUsers = new Map();

io.on("connection", (socket) => {
  const { phone, name, role } = socket.user;
  onlineUsers.set(phone, socket.id);
  console.log(`[Chat] Connected: ${name} (${role})`);

  // ── Join a DM room with a peer ──────────────────────────────────────────
  socket.on("chat:join", async ({ peerPhone }) => {
    if (!peerPhone) return;
    const room = roomKey(phone, peerPhone);
    socket.join(room);

    // Send history on join
    if (isRedisAvailable()) {
      const redis = getRedisClient();
      const messages = await getMessages(redis, room);
      socket.emit("chat:history", { room, messages });
    }
  });

  // ── Send a message ──────────────────────────────────────────────────────
  socket.on("chat:send", async ({ peerPhone, text }) => {
    if (!peerPhone || !text?.trim()) return;

    const room = roomKey(phone, peerPhone);
    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: phone,
      fromName: name,
      text: text.trim(),
      ts: Date.now(),
    };

    // Persist to Redis
    if (isRedisAvailable()) {
      const redis = getRedisClient();
      const messages = await getMessages(redis, room);
      messages.push(message);
      // Keep only last MAX_MESSAGES
      if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES);
      await saveMessages(redis, room, messages);
    }

    // Broadcast to both users in the room
    io.to(room).emit("chat:message", { room, message });

    // If peer is online but not in the room, send a notification
    const peerSocketId = onlineUsers.get(peerPhone);
    if (peerSocketId) {
      const peerSocket = io.sockets.sockets.get(peerSocketId);
      const rooms = peerSocket?.rooms || new Set();
      if (!rooms.has(room)) {
        io.to(peerSocketId).emit("chat:notify", {
          from: phone,
          fromName: name,
          preview: text.trim().slice(0, 60),
        });
      }
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

// ── Express setup ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "../tmp/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));

// ── API Routes ──────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ status: "ok", app: "Speak & Shine 🗣️" }));
app.use("/api/auth",        authRoutes);
app.use("/api/users",       userRoutes);
app.use("/api/dashboard",   dashboardRoutes);
app.use("/api/questions",   questionRoutes);
app.use("/api/video",       videoAnalysisRoutes);
app.use("/api/attendance",  attendanceRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/chat",        chatRoutes);

app.use("/api", (_, res) => res.status(404).json({ error: "API route not found" }));

// ── Serve React in production ───────────────────────────────────────────────
if (isProd) {
  const distPath = path.join(__dirname, "../frontend/dist");
  if (fs.existsSync(distPath)) {
    console.log("📦 Serving frontend from:", distPath);
    app.use(express.static(distPath));
    app.get("*", (_, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    console.warn("⚠️ Frontend dist not found — API-only mode");
  }
}

// ── Start ───────────────────────────────────────────────────────────────────
connectDB()
  .then(() => {
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Speak & Shine API running on port ${PORT} [${isProd ? "production" : "development"}]`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  });

export default app;
