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
import { roomKey, getMessages, saveMessages, MAX_MESSAGES, GROUP_ROOM } from "./routes/chat.js";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import dashboardRoutes from "./routes/dashboard.js";
import questionRoutes from "./routes/questions.js";
import videoAnalysisRoutes from "./routes/videoAnalysis.js";
import attendanceRoutes from "./routes/attendance.js";
import submissionRoutes from "./routes/submissions.js";
import chatRoutes from "./routes/chat.js";
import qrRoutes from "./routes/qr.js";
import dailyReportRoutes from "./routes/dailyReport.js";
import liveSessionRoutes from "./routes/liveSessions.js";
import monitoringRoutes, { setOnlineUsersRef, recordResponseTime } from "./routes/monitoring.js";
import { recoverStuckJobs } from "./videoQueue.js";
import { startScheduler } from "./scheduler.js";
import { startDailyReset } from "./scheduler.js";

dotenv.config();

// Initialize Redis client
const redis = getRedisClient();
if (redis) {
  console.log('[Redis] Initializing connection...');
} else {
  console.log('[Redis] No REDIS_URL configured, using in-memory storage');
}

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
setOnlineUsersRef(onlineUsers);

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

// ── Express setup ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "../tmp/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));

// ── Response time middleware ─────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => recordResponseTime(Date.now() - start));
  next();
});

// ── API Routes ──────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ status: "ok", app: "Speak & Shine 🗣️" }));
app.use("/api/auth",         authRoutes);
app.use("/api/users",        userRoutes);
app.use("/api/dashboard",    dashboardRoutes);
app.use("/api/questions",    questionRoutes);
app.use("/api/video",        videoAnalysisRoutes);
app.use("/api/attendance",   attendanceRoutes);
app.use("/api/submissions",  submissionRoutes);
app.use("/api/chat",         chatRoutes);
app.use("/api/qr",           qrRoutes);
app.use("/api/daily-report", dailyReportRoutes);
app.use("/api/live-sessions", liveSessionRoutes);
app.use("/api/monitoring",   monitoringRoutes);

app.use("/api", (_, res) => res.status(404).json({ error: "API route not found" }));

// ── Serve React in production ───────────────────────────────────────────────
if (isProd) {
  const distPath = path.join(__dirname, "../frontend/dist");
  console.log("🔍 Looking for frontend dist at:", distPath);
  console.log("🔍 Dist exists:", fs.existsSync(distPath));
  if (fs.existsSync(distPath)) {
    const files = fs.readdirSync(distPath);
    console.log("📁 Dist contents:", files);
    console.log("📦 Serving frontend from:", distPath);
    
    // Enable SharedArrayBuffer for FFmpeg.wasm (video compression)
    app.use((req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
    
    // Serve static assets with correct MIME types and long-term caching
    app.use(express.static(distPath, {
      maxAge: "1y",
      immutable: true,
      setHeaders(res, filePath) {
        // Ensure JS modules get the correct MIME type
        if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        } else if (filePath.endsWith(".css")) {
          res.setHeader("Content-Type", "text/css; charset=utf-8");
        }
        // index.html should never be cached
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    }));
    // SPA fallback — all non-API, non-asset routes serve index.html
    app.get("*", (req, res) => {
      // Don't serve index.html for asset requests that weren't found
      if (req.path.match(/\.(js|css|png|jpg|svg|ico|wasm|json)$/)) {
        return res.status(404).send("Not found");
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
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
    startScheduler();
    startDailyReset();
    // Recover any jobs that were processing when the server last shut down
    recoverStuckJobs();
  })
  .catch((err) => {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  });

export default app;
