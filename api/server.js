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

// ── Load .env FIRST before any other imports that use process.env ────────────
// dotenv.config() with override:true ensures .env always wins over PM2 cached env
{
  const __fn = fileURLToPath(import.meta.url);
  const __dn = path.dirname(__fn);
  const envPath = path.join(__dn, '../.env');
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath, override: true });
    if (result.error) {
      console.error('[ENV] Error loading .env:', result.error.message);
    } else {
      console.log('[ENV] ✅ .env loaded successfully (override mode)');
      console.log('[ENV] NODE_ENV:', process.env.NODE_ENV);
      console.log('[ENV] R2_ACCESS_KEY_ID:', process.env.R2_ACCESS_KEY_ID?.substring(0, 8) + '...');
    }
  } else {
    console.log('[ENV] No .env file — using system environment variables');
  }
}
// ─────────────────────────────────────────────────────────────────────────────
import { connectDB } from "../backend/config/database.js";
import { getRedisClient } from "../backend/config/redis.js";
import { initializeChatSocket } from "../backend/sockets/chatSocket.js";
import { blockViewer } from "../backend/middleware/auth.js";

// Monitoring service (for tracking metrics)
import { setOnlineUsersRef, recordResponseTime } from "../backend/services/monitoring/monitoringService.js";

// New MVC routes
import authRoutes from "../backend/routes/auth.routes.js";
import userRoutes from "../backend/routes/user.routes.js";
import dashboardRoutes from "../backend/routes/dashboard.routes.js";
import questionRoutes from "../backend/routes/questions.routes.js";
import videoAnalysisRoutes from "../backend/routes/video.routes.js";
import attendanceRoutes from "../backend/routes/attendance.routes.js";
import chatRoutes from "../backend/routes/chat.routes.js";
import liveSessionRoutes from "../backend/routes/liveSessions.routes.js";
import monitoringRoutes from "../backend/routes/monitoring.routes.js";
import notificationRoutes from "../backend/routes/notifications.routes.js";
import submissionsRoutes from "../backend/routes/submissions.routes.js";

console.log("[Routes] Loading MVC routes...");
console.log("[Routes] Auth routes loaded:", !!authRoutes);
console.log("[Routes] User routes loaded:", !!userRoutes);
console.log("[Routes] Dashboard routes loaded:", !!dashboardRoutes);
console.log("[Routes] Questions routes loaded:", !!questionRoutes);
console.log("[Routes] Video routes loaded:", !!videoAnalysisRoutes);
console.log("[Routes] Attendance routes loaded:", !!attendanceRoutes);
console.log("[Routes] Chat routes loaded:", !!chatRoutes);
console.log("[Routes] Live sessions routes loaded:", !!liveSessionRoutes);
console.log("[Routes] Submissions routes loaded:", !!submissionsRoutes);
console.log("[Routes] Notification routes loaded:", !!notificationRoutes);
import { recoverStuckJobs } from "./videoQueue.js";
import { startScheduler } from "./scheduler.js";
import { startDailyReset } from "./scheduler.js";

// (env already loaded at top of file — see dotenv block above)
const __filename_server = fileURLToPath(import.meta.url);
const __dirname_server = path.dirname(__filename_server);

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

// Force HTTPS in production (only when behind a proxy that sets x-forwarded-proto,
// e.g. Railway. On EC2 behind Nginx, Nginx handles SSL termination so this is skipped.)
if (isProd && process.env.FORCE_HTTPS === "true") {
  app.use((req, res, next) => {
    // Skip WebSocket upgrade requests — they handle their own protocol
    if (req.headers.upgrade === "websocket") return next();
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// ── Socket.io ───────────────────────────────────────────────────────────────
const socketAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [];

const io = new SocketIO(httpServer, {
  cors: {
    origin: isProd
      ? (origin, cb) => {
          // Allow same-origin requests (origin is undefined/null for same-origin)
          if (!origin) return cb(null, true);
          // Allow all if no origins configured
          if (socketAllowedOrigins.length === 0 || socketAllowedOrigins.includes("*")) {
            return cb(null, true);
          }
          if (socketAllowedOrigins.includes(origin)) {
            return cb(null, true);
          }
          // Also allow any *.railway.app origin as a safety net
          if (origin.endsWith(".railway.app") || origin.endsWith(".up.railway.app")) {
            return cb(null, true);
          }
          console.error(`[Socket.io CORS] Blocked origin: ${origin}`);
          cb(new Error("Not allowed by CORS"));
        }
      : "*",
    credentials: true,
  },
  // Increase ping timeout for slow connections
  pingTimeout: 30000,
  pingInterval: 10000,
});

// Track online users: phone → socketId
const onlineUsers = new Map();
setOnlineUsersRef(onlineUsers);

// Initialize chat socket handlers
initializeChatSocket(io, onlineUsers);

// ── Express setup ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "../tmp/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Make io available to controllers via req.app.get("io")
app.set("io", io);
// Make onlineUsers available to controllers via req.app.get("onlineUsers")
app.set("onlineUsers", onlineUsers);

// Security headers with HSTS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://static.cloudflareinsights.com"], // TODO: Remove unsafe-inline/eval gradually
      "script-src-attr": ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: [
        "'self'",
        process.env.R2_PUBLIC_URL || "https:",
        `https://${(process.env.R2_ENDPOINT || "").replace(/^https?:\/\//, "")}`,
        "https://cloudflareinsights.com",
        "https://*.livekit.cloud",
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
// /api/video/upload-frames sends 16 base64 frames (~5.6MB), so allow 10MB for that route
app.use("/api/video/upload-frames", express.json({ limit: "10mb" }));
// /api/video/proxy-upload — skip ALL body parsing so the controller can stream
// the request body directly to R2 (avoids buffering the entire file in RAM).
// The global JSON parser below must also skip this route.
app.use(express.json({
  limit: "1mb",
  type: (req) => {
    // Don't parse proxy-upload — its body is streamed directly to R2
    if (req.path === "/api/video/proxy-upload") return false;
    return req.headers["content-type"]?.includes("json");
  },
}));

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
// Block all write operations for viewer accounts across every route
app.use("/api", blockViewer);
app.use("/api/users",        userRoutes);
app.use("/api/dashboard",    dashboardRoutes);
console.log("[Routes] Dashboard routes mounted at /api/dashboard");
app.use("/api/questions",    questionRoutes);
app.use("/api/video",        videoAnalysisRoutes); // Rate limiting applied per-route inside video.routes.js
app.use("/api/attendance",   attendanceRoutes);
app.use("/api/chat",         chatRoutes);
app.use("/api/live-sessions", liveSessionRoutes);
app.use("/api/monitoring",   monitoringRoutes);
app.use("/api/submissions",  submissionsRoutes);
app.use("/api/notifications", notificationRoutes);

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

// ── Self-ping to prevent Render free tier sleep ─────────────────────────────
// Render spins down free services after 15 min of inactivity.
// Smart ping strategy:
//   - Active hours (05:45–00:20 IST): ping every 14 min to stay awake for users
//   - Night hours (00:20–05:45 IST): let server sleep to save free hours
//     to ensure the daily reset cron fires at 00:00 IST
//
// ⚠️  cron-job.org must be set to 05:45 IST so Render has 15 min to cold-start
//     before the 06:00 active period. Without this the 6 AM ping gets a 503.
function startSelfPing() {
  if (!isProd) return; // only needed in production
  // RENDER_EXTERNAL_URL is set on Render; on EC2 use APP_URL or fall back to localhost
  const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || `http://localhost:${PORT}`;
  const pingUrl = `${selfUrl}/api/health`;

  function getISTHour() {
    const now = new Date();
    const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    return ist.getHours() + ist.getMinutes() / 60; // e.g. 23.75 = 23:45
  }

  function shouldPing() {
    const h = getISTHour();
    // Ping 05:45–00:20 IST (covers full day + warm-up buffer + midnight reset)
    // Sleep 00:20–05:45 IST — saves ~5.5 hrs/day (~165 hrs/month)
    if (h >= 5.75 || h <= 0.333) return true; // 5.75 = 05:45, 0.333 = 00:20
    return false;
  }

  setInterval(async () => {
    if (!shouldPing()) {
      console.log(`[SelfPing] 💤 Night hours — skipping ping to save free hours`);
      return;
    }
    try {
      const { default: https } = await import("https");
      const { default: http  } = await import("http");
      const client = pingUrl.startsWith("https") ? https : http;
      client.get(pingUrl, (res) => {
        console.log(`[SelfPing] ✅ Pinged — status ${res.statusCode}`);
      }).on("error", (err) => {
        console.warn(`[SelfPing] ⚠️ Ping failed: ${err.message}`);
      });
    } catch (err) {
      console.warn(`[SelfPing] ⚠️ Ping error: ${err.message}`);
    }
  }, 14 * 60 * 1000); // check every 14 minutes

  console.log(`[SelfPing] 🔁 Smart self-ping started (active 05:45–00:20 IST, sleep 00:20–05:45 IST)`);
}

// ── Startup missed-reset catch-up ────────────────────────────────────────────
// If the server was down at midnight (Render sleep), the cron never fired.
// On every startup, check if today's reset was missed and run it immediately.
async function checkMissedReset() {
  try {
    // Wait 10s for DB to be fully ready
    await new Promise(r => setTimeout(r, 10_000));

    const Status = (await import("../models/statusSchema.js")).default;
    const s = await Status.findOne().lean();
    if (!s) return;

    // Build today's date string in IST
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const y = nowIST.getFullYear();
    const m = String(nowIST.getMonth() + 1).padStart(2, "0");
    const d = String(nowIST.getDate()).padStart(2, "0");
    const todayIST = `${y}-${m}-${d}`;

    // Only run catch-up if it's past midnight (00:05+) and reset hasn't run today
    const hourIST = nowIST.getHours();
    const minIST  = nowIST.getMinutes();
    const minuteOfDay = hourIST * 60 + minIST;

    if (s.lastResetDate !== todayIST && minuteOfDay >= 5) {
      console.log(`[Startup] ⚠️  Missed midnight reset detected (lastResetDate=${s.lastResetDate}, today=${todayIST}) — running now...`);
      const { generateDailyReports } = await import("./scheduler.js");
      const { performDailyReset } = await import("../backend/services/scheduler/dailyResetService.js");
      await generateDailyReports();
      await performDailyReset();
      console.log("[Startup] ✅ Missed reset completed");
    } else {
      console.log(`[Startup] ✅ Reset already ran today (${s.lastResetDate})`);
    }
  } catch (err) {
    console.error("[Startup] ❌ Missed-reset check error:", err.message);
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
    // Keep Render free tier awake so cron jobs fire reliably
    startSelfPing();
    // Catch up on any reset that was missed while server was sleeping
    checkMissedReset();
  })
  .catch((err) => {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  });

export default app;
