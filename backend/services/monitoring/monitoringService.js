/**
 * Monitoring Service
 * Business logic for system monitoring
 */

import os from "os";
import VideoReport from "../../../models/videoReportSchema.js";
import { getQueueStats } from "../../../api/videoQueue.js";

// Track API response times (rolling window)
const responseTimes = [];

// Track active users via Socket.io (set from server.js)
let _onlineUsers = null;

/**
 * Record API response time
 */
export function recordResponseTime(ms) {
  responseTimes.push(ms);
  if (responseTimes.length > 100) responseTimes.shift();
}

/**
 * Set online users reference from Socket.io
 */
export function setOnlineUsersRef(map) {
  _onlineUsers = map;
}

/**
 * Get CPU usage percentage
 */
function getCpuUsage(cpus) {
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  return Math.round(100 - (100 * totalIdle) / totalTick);
}

/**
 * Get system metrics
 */
export async function getSystemMetrics() {
  const cpus = os.cpus();
  const cpuUsage = getCpuUsage(cpus);
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = Math.round((usedMem / totalMem) * 100);

  return {
    cpuPercent: cpuUsage,
    memUsedMB: Math.round(usedMem / 1024 / 1024),
    memTotalMB: Math.round(totalMem / 1024 / 1024),
    memPercent,
    uptimeHours: (os.uptime() / 3600).toFixed(1),
  };
}

/**
 * Get video processing stats
 */
export async function getVideoStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [processingCount, failedToday, completedToday] = await Promise.all([
    VideoReport.countDocuments({ status: "processing" }),
    VideoReport.countDocuments({ status: "failed", submittedAt: { $gte: todayStart } }),
    VideoReport.countDocuments({ status: "completed", submittedAt: { $gte: todayStart } }),
  ]);

  const queue = getQueueStats();

  return {
    processing: processingCount,
    queued: queue.queueLength,
    completedToday,
    failedToday,
    activeJobId: queue.activeJobId,
    activeCount: queue.activeCount ?? (queue.isProcessing ? 1 : 0),
    maxConcurrent: queue.maxConcurrent ?? 1,
  };
}

/**
 * Get API performance stats
 */
export function getApiStats() {
  const avgResponseMs = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null;

  return {
    avgResponseMs,
    sampleCount: responseTimes.length,
  };
}

/**
 * Get complete monitoring data
 */
export async function getMonitoringData() {
  const [system, videos] = await Promise.all([
    getSystemMetrics(),
    getVideoStats(),
  ]);

  const api = getApiStats();
  const queue = getQueueStats();

  return {
    timestamp: new Date().toISOString(),
    activeUsers: _onlineUsers ? _onlineUsers.size : 0,
    system,
    videos: {
      processing: videos.processing,
      queued: videos.queued,
      completedToday: videos.completedToday,
      failedToday: videos.failedToday,
      activeJobId: videos.activeJobId,
      activeCount: videos.activeCount,
      maxConcurrent: videos.maxConcurrent,
    },
    queue, // Top-level queue object for frontend compatibility
    api,
  };
}

