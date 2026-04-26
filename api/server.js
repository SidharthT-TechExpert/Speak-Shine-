import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "../db.js";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import dashboardRoutes from "./routes/dashboard.js";
import questionRoutes from "./routes/questions.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || process.env.API_PORT || 3001;
const isProd = process.env.NODE_ENV === "production";

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());

// ── API Routes ──────────────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ status: "ok", app: "Speak & Shine 🗣️" }));
app.use("/api/auth",      authRoutes);
app.use("/api/users",     userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/questions", questionRoutes);

// API 404 — must be before the React catch-all
app.use("/api", (_, res) => res.status(404).json({ error: "API route not found" }));

// ── Serve React in production ───────────────────────────────────────────────
if (isProd) {
  const distPath = path.join(__dirname, "../frontend/dist");
  app.use(express.static(distPath));
  // Express 5 compatible wildcard — serves React for all non-API routes
  app.get("/{*path}", (_, res) => res.sendFile(path.join(distPath, "index.html")));
}

// ── Start ───────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Speak & Shine API running on port ${PORT} [${isProd ? "production" : "development"}]`);
  });
});

export default app;
