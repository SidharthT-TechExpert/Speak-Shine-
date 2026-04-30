import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
import dailyReportRoutes from "./routes/dailyReport.js";
import liveSessionRoutes from "./routes/liveSessions.js";
import monitoringRoutes, { setOnlineUsersRef, recordResponseTime } from "./routes/monitoring.js";
import { recoverStuckJobs } from "./videoQueue.js";
import { startScheduler } from "./scheduler.js";
import { startDailyReset } from "./scheduler.js";

// Load environment variables from .env file (local development only)
// In production (Railway), environment variables are set via dashboard
const __filename_temp = fileURLToPath(import.meta.url);
const __dirname_temp = path.dirname(__filename_temp);
const envPath = path.join(__dirname_temp, '../.env');

console.log('[ENV] Current directory:', process.cwd());
console.log('[ENV] Script directory:', __dirname_temp);
console.log('[ENV] Looking for .env at:', envPath);
console.log('[ENV] .env exists:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error('[ENV] Error loading .env:', result.error);
  } else {
    console.log('[ENV] Loaded .env file successfully');
    console.log('[ENV] JWT_SECRET loaded:', !!process.env.JWT_SECRET);
  }
} else {
  console.log('[ENV] No .env file found - using environment variables from system');
}

// Initialize Redis client
const redis = getRedisClient();
if (redis) {
  console.log('[Redis] Initializing connection...');
} else {
  console.log('[Redis] No REDIS_URL configured, using in-memory storage');
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET environment variable is not set. Refusing to start.");
  process.exit(1);
}

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

const app = express();
const httpServer = createServer(app);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || process.env.API_PORT || 3001;
const isProd = process.env.NODE_ENV === "production";

// Trust proxy - required for Railway/reverse proxies to get real client IP
app.set('trust proxy', 1);

// Force HTTPS in production
if (isProd) {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

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

// Security headers with HSTS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // TODO: Remove unsafe-inline/eval gradually
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: [
        "'self'", 
        process.env.R2_PUBLIC_URL || "https:", 
        "https://*.95507d8602ddb955795f0d78ed3d2df5.r2.cloudflarestorage.com", // Allow R2 presigned upload URLs (bucket.account-id.r2.cloudflarestorage.com)
        "wss:", 
        "ws:"
      ],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:", process.env.R2_PUBLIC_URL || "https:"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS — restrict to known origins in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [];
app.use(cors({
  origin: isProd
    ? (origin, cb) => {
        // Allow requests with no origin (like mobile apps, Postman, server-to-server)
        if (!origin) {
          cb(null, true);
          return;
        }
        // If no origins configured, allow all (fallback for misconfiguration)
        if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
          cb(null, true);
          return;
        }
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
          cb(null, true);
        } else {
          console.error(`[CORS] Blocked origin: ${origin}. Allowed: ${allowedOrigins.join(", ")}`);
          cb(new Error("Not allowed by CORS"));
        }
      }
    : "*",
  credentials: true,
}));

// Limit JSON body size to prevent payload DoS
app.use(express.json({ limit: "1mb" }));

// General API rate limit: 200 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/api/health", // don't rate-limit health checks
});
app.use("/api", apiLimiter);

// Video upload rate limit: 5 uploads per hour per user (prevents storage abuse)
// Temporarily disabled due to IPv6 validation issues - will re-enable after testing
const videoUploadLimiter = (req, res, next) => next(); // Passthrough middleware

// ── Response time middleware ─────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => recordResponseTime(Date.now() - start));
  next();
});

// ── API Routes ──────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ status: "ok", app: "Speak & Shine 🗣️" }));

// Simple test endpoint to verify server is responding
app.get("/api/test", (req, res) => {
  res.json({ 
    message: "Server is working!", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV 
  });
});

// Debug endpoint to list all registered routes (only in development)
if (!isProd) {
  app.get("/api/debug/routes", (req, res) => {
    const routes = [];
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler) => {
          if (handler.route) {
            const path = middleware.regexp.source.replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/').replace('^', '');
            routes.push({
              path: path + handler.route.path,
              methods: Object.keys(handler.route.methods)
            });
          }
        });
      }
    });
    res.json({ routes });
  });
}

app.use("/api/auth",         authRoutes);
app.use("/api/users",        userRoutes);
app.use("/api/dashboard",    dashboardRoutes);
console.log("[Routes] Dashboard routes mounted at /api/dashboard");
app.use("/api/questions",    questionRoutes);
app.use("/api/video",        videoUploadLimiter, videoAnalysisRoutes); // Apply video rate limiter
app.use("/api/attendance",   attendanceRoutes);
app.use("/api/submissions",  submissionRoutes);
app.use("/api/chat",         chatRoutes);
app.use("/api/daily-report", dailyReportRoutes);
app.use("/api/live-sessions", liveSessionRoutes);
app.use("/api/monitoring",   monitoringRoutes);

app.use("/api", (_, res) => res.status(404).json({ error: "API route not found" }));

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  
  // Don't expose stack traces in production
  const errorResponse = {
    error: isProd ? "Internal server error" : err.message,
  };
  
  if (!isProd && err.stack) {
    errorResponse.stack = err.stack;
  }
  
  res.status(err.status || 500).json(errorResponse);
});

// ── Serve React in production ───────────────────────────────────────────────
if (isProd) {
  const distPath = path.join(__dirname, "../frontend/dist");
  console.log("🔍 Looking for frontend dist at:", distPath);
  console.log("🔍 Dist exists:", fs.existsSync(distPath));
  if (fs.existsSync(distPath)) {
    const files = fs.readdirSync(distPath);
    console.log("📁 Dist contents:", files);
    console.log("📦 Serving frontend from:", distPath);
    
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
    // Express 5 compatible: use app.use() instead of app.get() for catch-all
    app.use((req, res, next) => {
      // Skip API routes - let them 404 properly
      if (req.path.startsWith("/api/")) {
        return next();
      }
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
