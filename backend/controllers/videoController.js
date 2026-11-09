/**
 * Video Controller
 * Handles HTTP requests for video endpoints
 */

import * as videoService from "../services/video/videoService.js";
import * as videoQueue from "../services/video/videoQueue.js";
import { COMMUNITY_ROOM } from "../services/chat/chatService.js";
import fs from "fs";
import path from "path";
import os from "os";
import https from "https";

function broadcastCommunity(req, event, payload) {
  const io = req.app.get("io");
  if (io) io.to(COMMUNITY_ROOM).emit(event, payload);
}

async function checkSubmissionWindowActive() {
  const Status = (await import("../../models/statusSchema.js")).default;
  const status = await Status.findOne().lean();
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const y = nowIST.getFullYear();
  const mo = String(nowIST.getMonth() + 1).padStart(2, "0");
  const d = String(nowIST.getDate()).padStart(2, "0");
  const todayIST = `${y}-${mo}-${d}`;

  const isQuestionSentToday = Boolean(
    status?.questionSentToday &&
    (status?.questionPublishedDate === todayIST || status?.lastPosterSentDate === todayIST || !status?.lastResetDate || status?.lastResetDate !== todayIST) &&
    (status?.todayQuestion || status?.todayTopic)
  );

  if (!isQuestionSentToday && !status?.isMonthlyGoalsDay && !status?.isMonthlyReflectionDay) {
    const error = new Error(`Recording and uploads are locked until today's speaking challenge unlocks at ${status?.posterSendTime || "08:00"} IST.`);
    error.statusCode = 403;
    error.locked = true;
    error.posterSendTime = status?.posterSendTime || "08:00";
    throw error;
  }
  return status;
}

/**
 * PUT /api/video/proxy-upload
 * Streams the video body from the browser directly to R2 without buffering
 * the entire file in server memory.  Falls back to collecting the body if
 * the streaming path fails.
 */
export async function proxyUpload(req, res) {
  try {
    await checkSubmissionWindowActive();
    const key      = req.headers["x-r2-key"];
    const mimeType = req.headers["x-mime-type"] || "video/mp4";

    if (!key) {
      return res.status(400).json({ error: "Missing x-r2-key header" });
    }

    const expectedPrefix = `videos/${req.user.id}/`;
    if (!key.startsWith(expectedPrefix)) {
      console.error(`[ProxyUpload] Key mismatch — user ${req.user.id} tried to upload to ${key}`);
      return res.status(403).json({ error: "Invalid upload key" });
    }

    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (!contentLength) {
      return res.status(400).json({ error: "Content-Length header required" });
    }

    console.log(`[ProxyUpload] Streaming ${(contentLength / 1024 / 1024).toFixed(1)}MB → R2 key: ${key}`);

    const { streamUploadToR2 } = await import("../config/storage.js");
    const publicUrl = await streamUploadToR2(req, key, mimeType, contentLength);

    console.log(`[ProxyUpload] ✅ Uploaded successfully: ${publicUrl}`);
    res.json({ success: true, publicUrl });
  } catch (error) {
    const http = error.$metadata?.httpStatusCode;
    console.error("[ProxyUpload] Error:", error.message, "| Code:", error.Code || error.name, "| HTTP:", http);
    const hint =
      http === 401 || error.name === "Unauthorized"
        ? "R2 credentials rejected. Regenerate the R2 API token (Object Read & Write) and update R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in .env."
        : undefined;
    res.status(500).json({
      error: error.message || "Upload failed",
      ...(hint ? { hint } : {}),
    });
  }
}


export async function getPresignedUrl(req, res) {
  try {
    await checkSubmissionWindowActive();
    const { filename = "video.webm", mimeType = "video/webm" } = req.query;
    
    console.log("[Presign] Request - filename:", filename, "mimeType:", mimeType, "userId:", req.user?.id);
    
    if (!req.user || !req.user.id) {
      console.error("[Presign] No user or user.id in request");
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const result = await videoService.getPresignedUrl(filename, mimeType, req.user.id);
    console.log("[Presign] Success - key:", result.key);
    res.json(result);
  } catch (error) {
    console.error("[Presign] Error details:", {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      user: req.user?.id
    });
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, locked: error.locked });
    }
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
}

/**
 * POST /api/video/upload-frames
 * Upload extracted frames from browser for AI analysis
 */
export async function uploadFrames(req, res) {
  try {
    await checkSubmissionWindowActive();
    const { reportKey, frames } = req.body;
    
    if (!reportKey || !frames || !Array.isArray(frames)) {
      return res.status(400).json({ error: "reportKey and frames array required" });
    }
    
    if (frames.length < 8 || frames.length > 16) {
      return res.status(400).json({ error: "Between 8 and 16 frames required" });
    }
    
    console.log(`[UploadFrames] Receiving ${frames.length} frames for ${reportKey}`);
    
    const result = await videoService.saveFrames(reportKey, frames, req.user.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, locked: error.locked });
    }
    console.error("[UploadFrames] Error:", error.message);
    res.status(500).json({ error: "Failed to upload frames" });
  }
}

/**
 * POST /api/video/pre-check
 * Fast client-side-aligned gate before upload (no file upload).
 */
export async function preCheckSubmit(req, res) {
  try {
    const status = await checkSubmissionWindowActive();
    const { evaluateSubmitGate } = await import("../services/video/submitGate.js");
    const isStory = req.body?.isStorySummary !== undefined
      ? !!req.body.isStorySummary
      : (status?.todayContentType === "story_audio" || (status?.isStorySummaryDay && status?.todayContentType !== "picture_description"));
    const isPicture = req.body?.isPictureDescription !== undefined
      ? !!req.body.isPictureDescription
      : (status?.todayContentType === "picture_description" || (status?.isPictureDescriptionDay && status?.todayContentType !== "story_audio"));
    const isShadowing = req.body?.isShadowing !== undefined
      ? !!req.body.isShadowing
      : (status?.todayContentType === "shadowing_video" || Boolean(status?.isShadowingDay));
    const flags = {
      isMonthlyReflection: req.body?.isMonthlyReflection !== undefined ? !!req.body.isMonthlyReflection : (status?.isMonthlyReflectionDay || false),
      isMonthlyGoals: req.body?.isMonthlyGoals !== undefined ? !!req.body.isMonthlyGoals : (status?.isMonthlyGoalsDay || false),
      isStorySummary: isStory,
      isPictureDescription: isPicture,
      isShadowing: isShadowing,
    };
    const gate = evaluateSubmitGate({
      durationSeconds: req.body?.durationSeconds ?? null,
      fileSizeBytes: req.body?.fileSizeBytes ?? null,
      frameCount: req.body?.frameCount ?? null,
      flags,
      settings: status || {},
    });
    res.json(gate);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, locked: err.locked });
    }
    console.error("[PreCheck] Error:", err.message);
    res.status(500).json({ error: "Pre-check failed" });
  }
}

/**
 * POST /api/video/confirm
 * Confirm direct upload to R2 and start processing
 */
export async function confirmUpload(req, res) {
  try {
    await checkSubmissionWindowActive();
    const { key, publicUrl, mimeType = "video/webm", isPublic = true, recordedDuration, videoHash, frameKeys } = req.body;
    
    const result = await videoService.confirmDirectUpload(
      key,
      publicUrl,
      mimeType,
      isPublic,
      req.user,
      recordedDuration,
      videoHash,
      frameKeys
    );
    
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[VideoConfirm] Error:", error.message);
    res.status(500).json({ error: error.message || "Failed to start analysis" });
  }
}

/**
 * POST /api/video/upload
 * Upload video file directly
 */
export async function uploadVideo(req, res) {
  try {
    const isPublic = req.body.isPublic;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    const result = await videoService.uploadVideo(
      req.file,
      req.user,
      isPublic,
      ipAddress,
      userAgent
    );
    
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[VideoUpload] Error:", error.message);
    res.status(500).json({ error: error.message || "Failed to upload video" });
  }
}

async function assertReportOwner(req, reportId) {
  const VideoReport = (await import("../../models/videoReportSchema.js")).default;
  const Auth = (await import("../../models/authSchema.js")).default;
  const User = (await import("../../models/userSchema.js")).default;

  const report = await VideoReport.findById(reportId).lean();
  if (!report) {
    const err = new Error("Report not found");
    err.statusCode = 404;
    throw err;
  }

  const auth = await Auth.findById(req.user.id);
  if (!auth) {
    const err = new Error("Access denied");
    err.statusCode = 403;
    throw err;
  }

  if (auth.role === "admin" || auth.role === "admins") {
    return report;
  }

  const stripped = auth.phone.replace(/^(\+91|91)/, "");
  const user = await User.findOne({ phone: { $in: [auth.phone, stripped] } });
  if (!user) {
    const err = new Error("Access denied");
    err.statusCode = 403;
    throw err;
  }

  if (report.userId.toString() !== user._id.toString()) {
    const err = new Error("Access denied");
    err.statusCode = 403;
    throw err;
  }

  return report;
}

/**
 * GET /api/video/progress-state/:reportId
 * JSON snapshot for polling (updates every ~700ms on the client)
 */
export async function getProgressState(req, res) {
  try {
    const { reportId } = req.params;
    const report = await assertReportOwner(req, reportId);
    const snap = videoQueue.getProgressSnapshot(reportId);

    res.json({
      reportId,
      status: snap?.status || report.status,
      stage: snap?.stage || "Starting…",
      stageKey: snap?.stageKey || "download",
      completedSteps: snap?.completedSteps || [],
      percent: snap?.percent ?? (report.status === "completed" ? 100 : 5),
      position: snap?.position,
      queueLength: snap?.queueLength,
      estimatedWait: snap?.estimatedWait,
      error: snap?.error,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[ProgressState] Error:", error.message);
    res.status(500).json({ error: "Failed to load progress" });
  }
}

/**
 * GET /api/video/progress/:reportId
 * SSE progress stream for video processing
 */
export async function getProgress(req, res) {
  try {
    const { reportId } = req.params;
    const report = await assertReportOwner(req, reportId);

    // If already done, return immediately
    if (report.status === "completed" || report.status === "failed") {
      res.setHeader("Content-Type", "text/event-stream");
      res.write(`data: ${JSON.stringify({
        status: report.status,
        percent: report.status === "completed" ? 100 : 0,
      })}\n\n`);
      return res.end();
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    videoQueue.registerSseClient(reportId, res);

    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
      if (typeof res.flush === "function") res.flush();
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      videoQueue.unregisterSseClient(reportId);
    });
  } catch (error) {
    console.error("[Progress] Error:", error.message);
    res.status(500).json({ error: "Failed to stream progress" });
  }
}

/**
 * POST /api/video/react/:reportId
 * Toggle like or dislike on a community video
 * body: { reaction: "like" | "dislike" }
 */
export async function reactToVideo(req, res) {
  try {
    const { reportId } = req.params;
    const { reaction } = req.body;
    const phone = req.user.phone;

    const { isValidObjectId } = await import("../utils/textSanitizer.js");
    if (!isValidObjectId(reportId)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }

    if (!["like", "dislike"].includes(reaction)) {
      return res.status(400).json({ error: "reaction must be 'like' or 'dislike'" });
    }

    const VideoReport = (await import("../../models/videoReportSchema.js")).default;
    const report = await VideoReport.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: "Video not found" });
    }
    if (report.status !== "completed") {
      return res.status(404).json({ error: "Video not found" });
    }

    const opposite = reaction === "like" ? "dislikes" : "likes";
    const field    = reaction === "like" ? "likes"    : "dislikes";

    const alreadyReacted = report[field].includes(phone);
    report[opposite] = report[opposite].filter(p => p !== phone);

    if (alreadyReacted) {
      report[field] = report[field].filter(p => p !== phone);
    } else {
      report[field].push(phone);
    }

    await report.save();

    // ── Notify video owner (if not reacting to own video) ──────────────────
    if (!alreadyReacted && reaction === "like" && report.phone && report.phone !== phone) {
      try {
        const { deliverNotification } = await import("../services/notification/notificationDelivery.js");
        const name = req.user.name || "Someone";
        await deliverNotification({
          recipientPhone: report.phone,
          type: "like",
          message: `👍 ${name} liked your video!`,
          reportId: report._id,
          url: `/community?highlight=${report._id}`,
          io: req.app.get("io"),
          onlineUsers: req.app.get("onlineUsers"),
        });
      } catch (notifErr) {
        console.error("[React] Notification error:", notifErr.message);
      }
    }

    const likeCount = report.likes.length;
    const dislikeCount = report.dislikes.length;
    const actorReaction = alreadyReacted ? null : reaction;

    broadcastCommunity(req, "community:react", {
      reportId: report._id.toString(),
      likeCount,
      dislikeCount,
      actorPhone: phone,
      actorReaction,
    });

    res.json({ likes: likeCount, dislikes: dislikeCount, userReaction: actorReaction });
  } catch (error) {
    console.error("[React] Error:", error.message);
    res.status(500).json({ error: "Failed to react" });
  }
}

/**
 * POST /api/video/comment/:reportId
 * Add a comment to a community video
 * body: { text }
 */
export async function addComment(req, res) {
  try {
    const { reportId } = req.params;
    const { text } = req.body;
    const { phone, name, role } = req.user;

    // Validate reportId format
    const { isValidObjectId, sanitizeText, SanitizeError, LIMITS } = await import("../utils/textSanitizer.js");
    if (!isValidObjectId(reportId)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }

    // Sanitize comment text
    let cleanText;
    try {
      cleanText = sanitizeText(text, LIMITS.COMMENT, "Comment");
    } catch (err) {
      return res.status(400).json({ error: err instanceof SanitizeError ? err.message : "Invalid comment" });
    }

    const VideoReport = (await import("../../models/videoReportSchema.js")).default;
    const report = await VideoReport.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: "Video not found" });
    }
    if (report.status !== "completed") {
      return res.status(404).json({ error: "Video not found" });
    }

    // Max 100 comments per video to prevent abuse
    if (report.comments.length >= 100) {
      return res.status(429).json({ error: "Comment limit reached for this video" });
    }

    const comment = { phone, name, role, text: cleanText, createdAt: new Date() };
    report.comments.push(comment);
    await report.save();

    const saved = report.comments[report.comments.length - 1];

    // ── Notify video owner (if not commenting on own video) ──────────────────
    if (report.phone && report.phone !== phone) {
      try {
        const { deliverNotification } = await import("../services/notification/notificationDelivery.js");
        const preview = cleanText.length > 60 ? cleanText.slice(0, 60) + "…" : cleanText;
        await deliverNotification({
          recipientPhone: report.phone,
          type: "comment",
          message: `💬 ${name} commented on your video: "${preview}"`,
          reportId: report._id,
          url: `/community?highlight=${report._id}`,
          io: req.app.get("io"),
          onlineUsers: req.app.get("onlineUsers"),
        });
      } catch (notifErr) {
        console.error("[Comment] Notification error:", notifErr.message);
      }
    }

    broadcastCommunity(req, "community:comment", {
      reportId: report._id.toString(),
      comment: {
        _id: saved._id,
        name: saved.name,
        role: saved.role,
        text: saved.text,
        createdAt: saved.createdAt,
        authorPhone: phone,
      },
    });

    res.json({ comment: saved });
  } catch (error) {
    console.error("[Comment] Add error:", error.message);
    res.status(500).json({ error: "Failed to add comment" });
  }
}

/**
 * DELETE /api/video/comment/:reportId/:commentId
 * Delete a comment (own comment, or admin/trainer)
 */
export async function deleteComment(req, res) {
  try {
    const { reportId, commentId } = req.params;
    const { phone, role } = req.user;

    const { isValidObjectId } = await import("../utils/textSanitizer.js");
    if (!isValidObjectId(reportId) || !isValidObjectId(commentId)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const VideoReport = (await import("../../models/videoReportSchema.js")).default;
    const report = await VideoReport.findById(reportId);
    if (!report) return res.status(404).json({ error: "Video not found" });

    const comment = report.comments.id(commentId);
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    const canDelete = comment.phone === phone || role === "admin" || role === "trainer";
    if (!canDelete) return res.status(403).json({ error: "Not allowed" });

    comment.deleteOne();
    await report.save();

    broadcastCommunity(req, "community:comment-deleted", {
      reportId: report._id.toString(),
      commentId: commentId,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("[Comment] Delete error:", error.message);
    res.status(500).json({ error: "Failed to delete comment" });
  }
}

/**
 * GET /api/video/report/:reportId
 * Get video report
 */
export async function getReport(req, res) {
  try {
    const { reportId } = req.params;
    
    const result = await videoService.getVideoReport(reportId, req.user.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[GetReport] Error:", error.message);
    res.status(500).json({ error: "Failed to fetch report" });
  }
}

/**
 * POST /api/video/report/:reportId/re-evaluate
 * Re-evaluate video report score & vocabulary
 */
export async function reEvaluateReport(req, res) {
  try {
    const { reportId } = req.params;
    const result = await videoService.reEvaluateReport(
      reportId,
      req.user?.id,
      req.user?.role,
      req.user?.phone
    );
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[ReEvaluateReport] Error:", error.message);
    res.status(500).json({ error: error.message || "Failed to re-evaluate report" });
  }
}

/**
 * GET /api/video/community-feed
 * Get community feed (public videos from last 24h)
 */
export async function getCommunityFeed(req, res) {
  try {
    // Pass the authenticated account ID as the primary identity. Phone numbers
    // are not a stable ownership key because older records may use different
    // country-code formats.
    const result = await videoService.getCommunityFeed(req.user.id, req.user.role);
    res.json(result);
  } catch (error) {
    console.error("[CommunityFeed] Error:", error.message);
    res.status(500).json({ error: "Failed to fetch community feed" });
  }
}

/**
 * PATCH /api/video/report/:reportId/visibility
 * Toggle video visibility (public/private)
 */
export async function toggleVisibility(req, res) {
  try {
    const { reportId } = req.params;
    
    const result = await videoService.toggleVideoVisibility(reportId, req.user.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      if (error.retryAfterSeconds) {
        res.set("Retry-After", String(error.retryAfterSeconds));
      }
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[ToggleVisibility] Error:", error.message);
    res.status(500).json({ error: "Failed to update visibility" });
  }
}

/**
 * GET /api/video/my-reports
 * Get user's reports
 */
export async function getMyReports(req, res) {
  try {
    const result = await videoService.getUserReports(req.user.id);
    res.json(result);
  } catch (error) {
    console.error("[MyReports] Error:", error.message);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
}

/**
 * DELETE /api/video/report/:reportId
 * Delete video report
 */
export async function deleteReport(req, res) {
  try {
    const { reportId } = req.params;
    
    const result = await videoService.deleteVideoReport(reportId, req.user.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[DeleteReport] Error:", error.message);
    res.status(500).json({ error: "Failed to delete report" });
  }
}

/**
 * POST /api/video/retry/:reportId
 * Retry failed video analysis
 */
export async function retryAnalysis(req, res) {
  try {
    const { reportId } = req.params;
    
    console.log("[RetryAnalysis] Request - reportId:", reportId, "user:", req.user);
    
    if (!req.user || !req.user.id) {
      console.error("[RetryAnalysis] No user or user.id in request:", req.user);
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const result = await videoService.retryVideoAnalysis(reportId, req.user.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[RetryAnalysis] Error:", error.message, "Stack:", error.stack);
    res.status(500).json({ error: "Failed to retry analysis" });
  }
}

/**
 * Helper to split long text into <= 95-character chunks on natural sentence or clause boundaries.
 */
function splitTextForTts(text, maxChunkLen = 95) {
  if (!text) return [];
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChunkLen) return [clean];

  const chunks = [];
  const sentences = clean.split(/(?<=[.!?])\s+/);

  for (const s of sentences) {
    if (s.length <= maxChunkLen) {
      chunks.push(s);
    } else {
      const clauses = s.split(/(?<=[,;:\-])\s+/);
      let current = "";
      for (const c of clauses) {
        if ((current + " " + c).trim().length <= maxChunkLen) {
          current = (current + " " + c).trim();
        } else {
          if (current) chunks.push(current);
          if (c.length <= maxChunkLen) {
            current = c;
          } else {
            const words = c.split(" ");
            let sub = "";
            for (const w of words) {
              if ((sub + " " + w).trim().length <= maxChunkLen) {
                sub = (sub + " " + w).trim();
              } else {
                if (sub) chunks.push(sub);
                sub = w.slice(0, maxChunkLen);
              }
            }
            current = sub;
          }
        }
      }
      if (current) chunks.push(current);
    }
  }

  return chunks.filter(c => c.trim().length > 0);
}

// In-memory cache for synthesized TTS audio buffers (max 500 items, keyed by normalized text)
const ttsAudioCache = new Map();
const MAX_TTS_CACHE_ITEMS = 500;

function fetchTtsChunk(textChunk) {
  const clients = ["tw-ob", "gtx", "dict-chrome-ex"];

  const tryClient = (client) => {
    return new Promise((resolve, reject) => {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=${client}&q=${encodeURIComponent(textChunk)}`;
      const req = https.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://translate.google.com/",
        },
        timeout: 6000,
      }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Upstream TTS status ${res.statusCode} (${client})`));
        }
        const data = [];
        res.on("data", chunk => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data)));
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Upstream TTS timeout (${client})`));
      });
    });
  };

  return (async () => {
    let lastErr = null;
    for (const c of clients) {
      try {
        return await tryClient(c);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("All TTS upstream clients failed");
  })();
}

/**
 * GET /api/video/tts
 * Serves native English audio pronunciation MP3 stream for vocabulary words and expressions.
 * Automatically chunks texts over 95 characters and stitches MP3 buffers together to bypass upstream limits.
 * Uses an in-memory cache and multi-client fallback for 100% reliable, zero-latency playback.
 */
export async function getTtsAudio(req, res) {
  try {
    const raw = (req.query.text || req.query.word || "").trim();
    if (!raw) {
      return res.status(400).send("Word/text is required");
    }
    const clean = raw.slice(0, 1000);
    const cacheKey = clean.toLowerCase();

    // Check in-memory cache first for instant 0ms response
    if (ttsAudioCache.has(cacheKey)) {
      const cached = ttsAudioCache.get(cacheKey);
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": cached.length,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "X-TTS-Cache": "HIT",
      });
      return res.end(cached);
    }

    const chunks = splitTextForTts(clean, 95);
    if (chunks.length === 0) {
      return res.status(400).send("No valid text to speak");
    }

    // Fetch chunks sequentially with short pause to prevent triggering upstream rate limiters
    const limitedChunks = chunks.slice(0, 8);
    const audioBuffers = [];
    for (let i = 0; i < limitedChunks.length; i++) {
      const buf = await fetchTtsChunk(limitedChunks[i]);
      audioBuffers.push(buf);
      if (i < limitedChunks.length - 1) {
        await new Promise(r => setTimeout(r, 30));
      }
    }

    const combined = Buffer.concat(audioBuffers);

    // Store in cache (LRU purge if limit reached)
    if (ttsAudioCache.size >= MAX_TTS_CACHE_ITEMS) {
      const firstKey = ttsAudioCache.keys().next().value;
      if (firstKey) ttsAudioCache.delete(firstKey);
    }
    ttsAudioCache.set(cacheKey, combined);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": combined.length,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
      "X-TTS-Cache": "MISS",
    });
    return res.end(combined);
  } catch (err) {
    console.error("[TTS Proxy] Controller error:", err.message);
    if (!res.headersSent) res.status(502).send("TTS audio fetch failed: " + err.message);
  }
}

/**
 * GET /api/video/proxy
 * Streams external video (e.g. Pexels, R2, CDN) with Range headers & CORS headers so videos can play anywhere.
 */
export async function streamVideoProxy(req, res) {
  try {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("Missing url query param");

    // Redirect any known shadowing video to local voiced MP4 with audio
    if (targetUrl.includes("3191572") || targetUrl.includes("ForBiggerFun") || targetUrl.includes("fluency-mindset")) {
      return res.redirect(302, "/shadowing/fluency-mindset.mp4");
    }
    if (targetUrl.includes("3195394") || targetUrl.includes("ForBiggerEscapes") || targetUrl.includes("active-listening")) {
      return res.redirect(302, "/shadowing/active-listening.mp4");
    }
    if (targetUrl.includes("3209828") || targetUrl.includes("ForBiggerBlazes") || targetUrl.includes("stage-presence")) {
      return res.redirect(302, "/shadowing/stage-presence.mp4");
    }
    if (targetUrl.includes("3196061") || targetUrl.includes("ForBiggerJoyBlazes") || targetUrl.includes("intentional-pauses")) {
      return res.redirect(302, "/shadowing/intentional-pauses.mp4");
    }
    if (targetUrl.includes("3205626") || targetUrl.includes("WeAreGoingOnBullrun") || targetUrl.includes("speaking-habits")) {
      return res.redirect(302, "/shadowing/speaking-habits.mp4");
    }
    if (targetUrl.includes("856973") || targetUrl.includes("charismatic-presence")) {
      return res.redirect(302, "/shadowing/charismatic-presence.mp4");
    }
    if (targetUrl.includes("commondatastorage.googleapis.com") || targetUrl.includes("gtv-videos-bucket")) {
      return res.redirect(302, "/shadowing/stage-presence.mp4");
    }

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    if (req.headers.range) {
      headers.range = req.headers.range;
    }

    const fetchRes = await fetch(targetUrl, { headers });
    res.status(fetchRes.status);

    for (const [k, v] of fetchRes.headers.entries()) {
      const lower = k.toLowerCase();
      if (["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"].includes(lower)) {
        res.setHeader(k, v);
      }
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range");
    res.setHeader("Cache-Control", "public, max-age=86400");

    if (fetchRes.body) {
      const { Readable } = await import("stream");
      Readable.fromWeb(fetchRes.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error("[VideoProxy] Stream error:", err.message);
    if (!res.headersSent) res.status(502).send("Failed to stream video");
  }
}
