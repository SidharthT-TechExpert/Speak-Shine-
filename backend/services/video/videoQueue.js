/**
 * Video Queue Service
 * Manages video processing queue with concurrent processing.
 * Processes up to MAX_CONCURRENT videos simultaneously to maximise throughput
 * while staying within the 512 MB RAM budget (≈16 MB per video with optimisations).
 */

import VideoReport from "../../../models/videoReportSchema.js";
import User from "../../../models/userSchema.js";
import { processWebVideo } from "../ai/videoProcessor.js";
import fs from "fs";

// ── Concurrency limit ────────────────────────────────────────────────────────
// Each video uses ~16 MB peak RAM with browser-frame optimisations.
// 512 MB total − 120 MB (Node/Redis/OS overhead) = 392 MB usable.
// 392 MB ÷ 16 MB = 24 slots; cap at 15 for a comfortable safety margin.
const MAX_CONCURRENT = parseInt(process.env.VIDEO_QUEUE_CONCURRENCY || "15", 10);

// ── Queue State ──────────────────────────────────────────────────────────────
const queue = [];                    // waiting jobs
const activeJobs = new Map();        // reportId → job  (currently processing)

// ── Stats ────────────────────────────────────────────────────────────────────
const stats = {
  totalProcessed: 0,
  totalFailed: 0,
  processingTimes: [],   // last 20 durations in ms
  errorsToday: [],       // [{ reportId, error, userName, phone, type, at }]
  securityEvents: [],    // scan/moderation rejections logged before enqueue
};

// ── SSE Clients: reportId → res ──────────────────────────────────────────────
const sseClients = new Map();

// ── Public helpers ───────────────────────────────────────────────────────────

/** Called from videoService before the job enters the queue (security stage). */
export function pushProgressById(reportId, data) {
  pushProgress(reportId, data);
}

/** Record a security rejection (virus / codec / content moderation). */
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

export function registerSseClient(reportId, res) {
  sseClients.set(String(reportId), res);
}

export function unregisterSseClient(reportId) {
  sseClients.delete(String(reportId));
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function pushProgress(reportId, data) {
  const client = sseClients.get(String(reportId));
  if (client) client.write(`data: ${JSON.stringify(data)}\n\n`);
}

function closeSse(reportId) {
  const client = sseClients.get(String(reportId));
  if (client) {
    client.end();
    sseClients.delete(String(reportId));
  }
}

/** Broadcast updated queue positions to every waiting job. */
function broadcastQueuePositions() {
  queue.forEach((job, i) => {
    pushProgress(job.reportId, {
      status: "queued",
      position: i + 1,
      queueLength: queue.length,
      estimatedWait: estimateWait(i + 1),
    });
  });
}

// ── Enqueue ──────────────────────────────────────────────────────────────────

/**
 * Add a job to the queue and start processing immediately if a slot is free.
 * @param {object} job - { reportId, videoPath, phone, displayName, knownDuration, browserFrames }
 * @returns {{ position: number, estimatedWait: number }}
 */
export function enqueue(job) {
  queue.push({ ...job, addedAt: Date.now() });

  const position = queue.length;
  const estimatedWait = estimateWait(position);

  pushProgress(job.reportId, {
    status: "queued",
    position,
    queueLength: queue.length,
    estimatedWait,
  });

  // Kick off processing — will start immediately if a slot is free
  drainQueue();

  return { position, estimatedWait };
}

// ── Concurrent drain ─────────────────────────────────────────────────────────

/**
 * Start as many jobs as the concurrency limit allows.
 * Each job runs independently; when it finishes it calls drainQueue() again.
 */
function drainQueue() {
  while (queue.length > 0 && activeJobs.size < MAX_CONCURRENT) {
    const job = queue.shift();
    activeJobs.set(String(job.reportId), job);

    // Update positions for remaining waiters
    broadcastQueuePositions();

    // Fire-and-forget — errors are handled inside processJob
    processJob(job).finally(() => {
      activeJobs.delete(String(job.reportId));
      if (global.gc) global.gc(); // hint GC after each video
      drainQueue();               // fill the freed slot
    });
  }
}

// ── Process a single job ─────────────────────────────────────────────────────

async function processJob(job) {
  const { reportId, videoPath, phone, displayName, knownDuration, browserFrames } = job;
  const startTime = Date.now();

  console.log(
    `[Queue] ▶ Starting ${reportId}` +
    ` | active=${activeJobs.size}/${MAX_CONCURRENT}` +
    ` | waiting=${queue.length}` +
    (browserFrames ? " ⚡ browser-frames" : "")
  );

  // 10-minute hard timeout per job
  const processingTimeout = setTimeout(async () => {
    console.error(`[Queue] ⏱ TIMEOUT ${reportId}`);
    try {
      await VideoReport.findByIdAndUpdate(reportId, {
        status: "failed",
        errorMessage: "Processing timeout. Please try again.",
      });
      pushProgress(reportId, { status: "failed", error: "Processing timeout" });
      closeSse(reportId);
    } catch {}
    recordFinish(reportId, startTime, "timeout");
  }, 10 * 60 * 1000);

  try {
    const result = await processWebVideo(
      videoPath,
      displayName,
      async (stage) => {
        console.log(`[Queue] ${reportId}: ${stage}`);
        pushProgress(reportId, { status: "processing", stage });
      },
      knownDuration,
      browserFrames
    );

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
    console.log(`[Queue] ✓ Done ${reportId} in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    recordFinish(reportId, startTime, "success");

  } catch (err) {
    console.error(`[Queue] ✗ Failed ${reportId}:`, err.message);

    let userName = "Unknown";
    let userPhone = phone || "—";
    try {
      const userDoc = await User.findOne({
        phone: { $in: [phone, phone?.replace(/^(\+91|91)/, "")] },
      }).lean();
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
    if (stats.errorsToday.length > 50) stats.errorsToday.shift();

    recordFinish(reportId, startTime, "error");

  } finally {
    clearTimeout(processingTimeout);
    // Clean up local temp file (skip R2 URLs)
    if (videoPath && !videoPath.startsWith("http") && fs.existsSync(videoPath)) {
      try { fs.unlinkSync(videoPath); } catch {}
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyError(message = "") {
  const m = message.toLowerCase();
  if (m.includes("virus") || m.includes("malware") || m.includes("threat"))        return "🦠 Virus / Malware";
  if (m.includes("codec") || m.includes("unsupported"))                             return "🎬 Invalid Codec";
  if (m.includes("content") || m.includes("inappropriate") || m.includes("moderat")) return "🛡️ Content Violation";
  if (m.includes("timeout"))                                                         return "⏱️ Timeout";
  if (m.includes("transcri"))                                                        return "🎙️ Transcription";
  if (m.includes("speech") || m.includes("scoring"))                                return "🗣️ Speech Analysis";
  if (m.includes("download") || m.includes("fetch") || m.includes("network"))      return "🌐 Network";
  if (m.includes("too short") || m.includes("too long") || m.includes("duration")) return "⏱️ Duration";
  return "⚙️ Processing";
}

function recordFinish(reportId, startTime, outcome) {
  const elapsed = Date.now() - startTime;
  if (outcome === "success") {
    stats.totalProcessed++;
    stats.processingTimes.push(elapsed);
    if (stats.processingTimes.length > 20) stats.processingTimes.shift();
  }
}

// ── Retry (re-enqueue from R2 URL) ──────────────────────────────────────────

export async function enqueueRetry(reportId, videoUrl, phone, displayName) {
  const tempPath = `./tmp/retry-${reportId}-${Date.now()}.mp4`;

  try {
    console.log(`[Queue] Retrying ${reportId} — downloading from R2…`);

    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`R2 download failed: ${response.status} ${response.statusText}`);

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(buffer));
    console.log(`[Queue] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB to ${tempPath}`);

    const report = await VideoReport.findById(reportId);
    const storedDuration = report?.videoDuration;

    return enqueue({ reportId, videoPath: tempPath, phone, displayName, knownDuration: storedDuration });
  } catch (err) {
    console.error(`[Queue] Retry failed for ${reportId}:`, err.message);
    if (fs.existsSync(tempPath)) { try { fs.unlinkSync(tempPath); } catch {} }
    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: "Retry failed: " + err.message,
    });
    throw err;
  }
}

// ── Monitoring ───────────────────────────────────────────────────────────────

export function getQueueStats() {
  const avgMs = stats.processingTimes.length
    ? stats.processingTimes.reduce((a, b) => a + b, 0) / stats.processingTimes.length
    : null;

  // Drop entries from previous days
  const now = new Date();
  const isToday = (e) => {
    const d = new Date(e.at);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
  };
  stats.errorsToday   = stats.errorsToday.filter(isToday);
  stats.securityEvents = stats.securityEvents.filter(isToday);

  return {
    queueLength: queue.length,
    activeCount: activeJobs.size,
    maxConcurrent: MAX_CONCURRENT,
    // Legacy fields kept for monitoring dashboard compatibility
    isProcessing: activeJobs.size > 0,
    activeJobId: activeJobs.size > 0 ? [...activeJobs.keys()][0] : null,
    activeJobIds: [...activeJobs.keys()],
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
    : 150000; // default 2.5 min
  // With concurrency, effective wait = ceil(position / MAX_CONCURRENT) batches
  const batches = Math.ceil(position / MAX_CONCURRENT);
  return Math.ceil((avgMs * batches) / 60000); // minutes
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

      await VideoReport.findByIdAndUpdate(report._id, { $inc: { retryCount: 1 } });
      console.log(`[Queue] Re-enqueuing ${report._id} from R2 (attempt ${retries + 1}/3)…`);
      enqueueRetry(report._id, report.videoUrl, report.phone, report.uploaderName || report.phone)
        .catch(err => console.error(`[Queue] Recovery failed for ${report._id}:`, err.message));
    }
  } catch (err) {
    console.error("[Queue] Recovery error:", err.message);
  }
}
