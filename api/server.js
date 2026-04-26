import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { connectDB } from "../db.js";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import dashboardRoutes from "./routes/dashboard.js";
import questionRoutes from "./routes/questions.js";
import videoAnalysisRoutes from "./routes/videoAnalysis.js";

dotenv.config();

// Handle uncaught errors
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
const PORT = process.env.PORT || process.env.API_PORT || 3001;
const isProd = process.env.NODE_ENV === "production";

// Ensure tmp/uploads directory exists for video uploads
const uploadDir = path.join(__dirname, "../tmp/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📁 Created tmp/uploads directory");
}

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));

// ── API Routes ──────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ status: "ok", app: "Speak & Shine 🗣️" }));
app.use("/api/auth",      authRoutes);
app.use("/api/users",     userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/video",     videoAnalysisRoutes);

// API 404 — must be before the React catch-all
app.use("/api", (_, res) => res.status(404).json({ error: "API route not found" }));

// ── Serve React in production ───────────────────────────────────────────────
if (isProd) {
  const distPath = path.join(__dirname, "../frontend/dist");
  
  if (fs.existsSync(distPath)) {
    console.log("📦 Serving frontend from:", distPath);
    app.use(express.static(distPath));
    // Serve React for all non-API routes
    app.get("*", (_, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.warn("⚠️ Frontend dist not found at:", distPath);
    console.warn("⚠️ API-only mode — frontend will not be served");
  }
}

// ── Start ───────────────────────────────────────────────────────────────────
connectDB()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Speak & Shine API running on port ${PORT} [${isProd ? "production" : "development"}]`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  });

export default app;
