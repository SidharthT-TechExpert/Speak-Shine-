/**
 * monitoring.js — Real-time system monitoring endpoint.
 * GET /api/monitoring — returns active users, queue stats, system metrics, errors.
 * Admin-only.
 */

import express from "express";
import os from "os";
import VideoReport from "../../models/videoReportSchema.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { getQueueStats } from "../videoQueue.js";

const router = express.Router();

// Track API response times (rolling window)
const responseTimes = [];
export function recordResponseTime(ms) {
  responseTimes.push(ms);
  if (responseTimes.length > 100) responseTimes.shift();
}

// Track active users via Socket.io (set from server.js)
let _onlineUsers = null;
export function setOnlineUsersRef(map) { _onlineUsers = map; }

// ── GET /api/monitoring ──────────────────────────────────────────────────────
router.get("/", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const now = Date.now();

    // System metrics
    const cpus = os.cpus();
    const cpuUsage = getCpuUsage(cpus);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);

    // Queue stats
    const queue = getQueueStats();

    // DB: videos processing/failed today
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const [processingCount, failedToday, completedToday] = await Promise.all([
      VideoReport.countDocuments({ status: "processing" }),
      VideoReport.countDocuments({ status: "failed", submittedAt: { $gte: todayStart } }),
      VideoReport.countDocuments({ status: "completed", submittedAt: { $gte: todayStart } }),
    ]);

    // Response time stats
    const avgResponseMs = responseTimes.length
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

    res.json({
      timestamp: new Date().toISOString(),
      activeUsers: _onlineUsers ? _onlineUsers.size : 0,
      system: {
        cpuPercent: cpuUsage,
        memUsedMB: Math.round(usedMem / 1024 / 1024),
        memTotalMB: Math.round(totalMem / 1024 / 1024),
        memPercent,
        uptimeHours: (os.uptime() / 3600).toFixed(1),
      },
      videos: {
        processing: processingCount,
        queued: queue.queueLength,
        completedToday,
        failedToday,
        activeJobId: queue.activeJobId,
      },
      queue: {
        ...queue,
        avgProcessingMin: queue.avgProcessingMin,
      },
      api: {
        avgResponseMs,
        sampleCount: responseTimes.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple CPU usage estimate from os.cpus() idle vs total ticks
function getCpuUsage(cpus) {
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  return Math.round(100 - (100 * totalIdle) / totalTick);
}

export default router;
