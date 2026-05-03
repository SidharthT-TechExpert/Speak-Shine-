/**
 * videoQueue.js — Simple in-memory video processing queue.
 * Processes videos one at a time (FIFO). Emits SSE progress updates.
 * Tracks stats for the monitoring dashboard.
 */

import VideoReport from "../models/videoReportSchema.js";
import User from "../models/userSchema.js";
import { processWebVideo } from "../backend/services/ai/videoProcessor.js";
import fs from "fs";

// ── Queue state ──────────────────────────────────────────────────────────────
const queue = [];           // [{ reportId, videoPath, phone, displayName, addedAt }]
let activeJob = null;       // currently processing job
let isProcessing = false;

// ── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  totalProcessed: 0,
  totalFailed: 0,
  processingTimes: [],      // last 20 durations in ms
  errorsToday: [],          // [{ reportId, error, userName, phone, type, at }]
  securityEvents: [],       // [{ reportId, error, userName, phone, type, at }] — scan/moderation rejections
};

// ── SSE clients: reportId → res ──────────────────────────────────────────────
const sseClients = new Map();

export function registerSseClient(reportId, res) {
  sseClients.set(String(reportId), res);
}

export function unregisterSseClient(reportId) {
  sseClients.delete(String(reportId));
}

function pushProgress(reportId, data) {
  const client = sseClients.get(String(reportId));
  if (client) client.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Push progress update by reportId (called from videoService pre-processing)
 */
export function pushProgressById(reportId, data) {
  pushProgress(reportId, data);
}

/**
 * Record a security rejection event (virus, codec, content moderation)
 */
export function recordSecurityEvent({ reportId, error, userName, phone, type }) {
  stats.securityEvents.push({
    reportId: String(reportId),
    error,
    userName: userName || "Unknown",
    phone: phone || "—",
    type: type || "🔒 Security",
    at: new Date(),
  });
  if (stats.securityEvents.length > 50) stats.securityEvents.shift();
}

function closeSse(reportId) {
  const client = sseClients.get(String(reportId));
  if (client) { client.end(); sseClients.delete(String(reportId)); }
}

// ── Enqueue ──────────────────────────────────────────────────────────────────
export function enqueue(job) {
  // job: { reportId, videoPath, phone, displayName }
  queue.push({ ...job, addedAt: Date.now() });
  const position = queue.length;
  const estimatedWait = estimateWait(position);

  // Notify user of their queue position
  pushProgress(job.reportId, {
    status: "queued",
    position,
    queueLength: queue.length,
    estimatedWait,
  });

  if (!isProcessing) processNext();
  return { position, estimatedWait };
}

// ── Process next job ─────────────────────────────────────────────────────────
async function processNext() {
  if (isProcessing || queue.length === 0) return;

  isProcessing = true;
  activeJob = queue.shift();

  // Notify all remaining jobs of updated positions
  queue.forEach((job, i) => {
    pushProgress(job.reportId, {
      status: "queued",
      position: i + 1,
      queueLength: queue.length,
      estimatedWait: estimateWait(i + 1),
    });
  });

  const { reportId, videoPath, phone, displayName } = activeJob;
  const startTime = Date.now();

  // 10-minute hard timeout
  const processingTimeout = setTimeout(async () => {
    console.error(`[Queue] ${reportId} TIMEOUT`);
    try {
      await VideoReport.findByIdAndUpdate(reportId, {
        status: "failed",
        errorMessage: "Processing timeout. Please try again.",
      });
      pushProgress(reportId, { status: "failed", error: "Processing timeout" });
      closeSse(reportId);
    } catch {}
    finishJob(reportId, startTime, "timeout");
  }, 10 * 60 * 1000);

  try {
    console.log(`[Queue] Processing ${reportId} (queue remaining: ${queue.length})`);

    const result = await processWebVideo(videoPath, displayName, async (stage) => {
      console.log(`[Queue] ${reportId}: ${stage}`);
      pushProgress(reportId, { status: "processing", stage });
    });

    await VideoReport.findByIdAndUpdate(reportId, {
      status: "completed",
      analysis: result.analysis,
    });

    const { fluency, grammar, confidence, vocabulary } = result.analysis;
    if (fluency != null || grammar != null) {
      await User.findOneAndUpdate(
        { phone },
        {
          $push: {
            feedbackScores: {
              $each: [{ fluency, grammar, confidence, vocabulary, date: new Date() }],
              $slice: -30,
            },
          },
        }
      );
    }

    pushProgress(reportId, { status: "completed" });
    closeSse(reportId);
    console.log(`[Queue] ${reportId} completed`);
    finishJob(reportId, startTime, "success");

  } catch (err) {
    console.error(`[Queue] ${reportId} failed:`, err.message);

    // Fetch user info for the error log
    let userName = "Unknown";
    let userPhone = phone || "—";
    try {
      const User = (await import("../models/userSchema.js")).default;
      const userDoc = await User.findOne({ phone: { $in: [phone, phone?.replace(/^(\+91|91)/, "")] } }).lean();
      if (userDoc) userName = userDoc.name || userDoc.userId || phone;
    } catch {}

    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: err.message || "Analysis failed",
    });

    pushProgress(reportId, { status: "failed", error: err.message });
    closeSse(reportId);

    stats.totalFailed++;
    stats.errorsToday.push({
      reportId: String(reportId),
      error: err.message,
      userName,
      phone: userPhone,
      type: classifyError(err.message),
      at: new Date(),
    });
    // Keep only last 50 errors
    if (stats.errorsToday.length > 50) stats.errorsToday.shift();

    finishJob(reportId, startTime, "error");

  } finally {
    clearTimeout(processingTimeout);
    // Only unlink if it's a local file path (not an R2 URL)
    if (videoPath && !videoPath.startsWith("http") && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    // Hint to GC to free memory after heavy video processing
    if (global.gc) global.gc();
  }
}

/**
 * Classify error message into a category for the monitoring panel
 */
function classifyError(message = "") {
  const m = message.toLowerCase();
  if (m.includes("virus") || m.includes("malware") || m.includes("threat"))   return "🦠 Virus / Malware";
  if (m.includes("codec") || m.includes("unsupported"))                        return "🎬 Invalid Codec";
  if (m.includes("content") || m.includes("inappropriate") || m.includes("moderat")) return "🛡️ Content Violation";
  if (m.includes("timeout"))                                                   return "⏱️ Timeout";
  if (m.includes("transcri"))                                                  return "🎙️ Transcription";
  if (m.includes("speech") || m.includes("scoring"))                          return "🗣️ Speech Analysis";
  if (m.includes("download") || m.includes("fetch") || m.includes("network")) return "🌐 Network";
  if (m.includes("too short") || m.includes("too long") || m.includes("duration")) return "⏱️ Duration";
  return "⚙️ Processing";
}

function finishJob(reportId, startTime, outcome) {
  const elapsed = Date.now() - startTime;
  if (outcome === "success") {
    stats.totalProcessed++;
    stats.processingTimes.push(elapsed);
    if (stats.processingTimes.length > 20) stats.processingTimes.shift();
  }
  activeJob = null;
  isProcessing = false;
  processNext();
}

// ── Retry (re-enqueue from R2 URL) ──────────────────────────────────────────
export async function enqueueRetry(reportId, videoUrl, phone, displayName) {
  const tempPath = `./tmp/retry-${reportId}-${Date.now()}.mp4`;

  try {
    console.log(`[Queue] Retrying ${reportId} - downloading from R2: ${videoUrl}`);
    
    // Download video from R2 to temp file
    // ffprobe cannot read from HTTPS URLs directly in Railway environment
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video from R2: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(buffer));
    
    console.log(`[Queue] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB to ${tempPath}`);
    
    return enqueue({ 
      reportId, 
      videoPath: tempPath,  // Use local temp file
      phone, 
      displayName
    });
  } catch (err) {
    console.error(`[Queue] Retry failed for ${reportId}:`, err.message);
    
    // Clean up temp file on error
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
    
    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: "Retry failed: " + err.message,
    });
    throw err;
  }
}

// ── Monitoring helpers ───────────────────────────────────────────────────────
export function getQueueStats() {
  const avgMs = stats.processingTimes.length
    ? stats.processingTimes.reduce((a, b) => a + b, 0) / stats.processingTimes.length
    : null;

  // Reset errorsToday at midnight (simple check)
  const now = new Date();
  stats.errorsToday = stats.errorsToday.filter(e => {
    const d = new Date(e.at);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
  });
  stats.securityEvents = stats.securityEvents.filter(e => {
    const d = new Date(e.at);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
  });

  return {
    queueLength: queue.length,
    isProcessing,
    activeJobId: activeJob?.reportId || null,
    totalProcessed: stats.totalProcessed,
    totalFailed: stats.totalFailed,
    avgProcessingMs: avgMs ? Math.round(avgMs) : null,
    avgProcessingMin: avgMs ? (avgMs / 60000).toFixed(1) : null,
    errorsToday: stats.errorsToday.length + stats.securityEvents.length,
    recentErrors: [
      ...stats.errorsToday,
      ...stats.securityEvents,
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10),
  };
}

export function estimateWait(position) {
  const avgMs = stats.processingTimes.length
    ? stats.processingTimes.reduce((a, b) => a + b, 0) / stats.processingTimes.length
    : 150000; // default 2.5 min estimate
  const totalMs = avgMs * position;
  return Math.ceil(totalMs / 60000); // minutes
}

// ── Startup recovery ─────────────────────────────────────────────────────────
export async function recoverStuckJobs() {
  try {
    const stuck = await VideoReport.find({ status: "processing" }).lean();
    if (stuck.length === 0) {
      console.log("[Queue] No stuck jobs to recover");
      return;
    }

    console.log(`[Queue] Recovering ${stuck.length} stuck job(s) from previous session…`);

    for (const report of stuck) {
      const retries = report.retryCount || 0;

      // Give up after 3 attempts — this job is causing crashes
      if (retries >= 3) {
        await VideoReport.findByIdAndUpdate(report._id, {
          status: "failed",
          errorMessage: "Processing failed after 3 attempts. The video may be too large or corrupted. Please re-upload.",
        });
        console.log(`[Queue] ${report._id} — exceeded max retries (${retries}), marked failed`);
        continue;
      }

      if (!report.videoUrl || !report.videoKey) {
        await VideoReport.findByIdAndUpdate(report._id, {
          status: "failed",
          errorMessage: "Server restarted before processing could complete. Please re-upload.",
        });
        console.log(`[Queue] ${report._id} — no R2 video, marked failed`);
        continue;
      }

      // Increment retry count before re-enqueuing
      await VideoReport.findByIdAndUpdate(report._id, { $inc: { retryCount: 1 } });

      console.log(`[Queue] Re-enqueuing ${report._id} from R2 (attempt ${retries + 1}/3)…`);
      enqueueRetry(report._id, report.videoUrl, report.phone, report.uploaderName || report.phone)
        .catch(err => console.error(`[Queue] Recovery failed for ${report._id}:`, err.message));
    }
  } catch (err) {
    console.error("[Queue] Recovery error:", err.message);
  }
}
