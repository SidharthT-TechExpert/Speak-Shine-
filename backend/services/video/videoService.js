/**
 * Video Service
 * Business logic for video upload, validation, and management
 */

import VideoReport from "../../../models/videoReportSchema.js";
import User from "../../../models/userSchema.js";
import { serializeStreakBadges } from "../../utils/streakBadges.js";
import Status from "../../../models/statusSchema.js";
import UploadAudit from "../../../models/uploadAuditSchema.js";
import mongoose from "mongoose";
import { uploadToR2, uploadBufferToR2, deleteFromR2, getR2Key, getPresignedUploadUrl, getPresignedDownloadUrl } from "../../config/storage.js";
import { enqueue, pushProgressById, pushPipelineStep, recordSecurityEvent, trackReportPhone } from "./videoQueue.js";
import { getVideoDuration } from "../ai/videoProcessor.js";
import { scanFile } from "../ai/virusScanner.js";
import { validateVideoCodecs } from "../ai/videoValidator.js";
import { moderateVideo } from "../ai/contentModerator.js";
import { calculateCompositeScore, matchVocabularyInTranscript, getDurationLimits, evaluateSubmitGate } from "./submitGate.js";
import { checkSecurityCache, saveSecurityCache } from "../ai/securityCache.js";
import { fileTypeFromBuffer, fileTypeFromFile } from "file-type";
import fs from "fs";
import path from "path";

// Security: Allowed video MIME types
const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime',
  'video/x-msvideo', 'video/mpeg', 'video/x-matroska', 'video/x-ms-wmv'
];

const VIDEO_EXTENSIONS_BY_MIME = {
  "video/mp4": [".mp4", ".m4v"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov", ".qt"],
  "video/x-msvideo": [".avi"],
  "video/mpeg": [".mpeg", ".mpg"],
  "video/x-matroska": [".mkv"],
  "video/x-ms-wmv": [".wmv"],
};

const MIME_BY_EXTENSION = Object.entries(VIDEO_EXTENSIONS_BY_MIME).reduce((acc, [mime, exts]) => {
  for (const ext of exts) acc[ext] = mime;
  return acc;
}, {});

const MAX_ANALYSIS_MB = 200; // Increased limit for larger videos (Railway has enough RAM)

function isActiveStoryTask(status) {
  return status?.todayContentType === "story_audio"
    || (status?.isStorySummaryDay && status?.todayContentType !== "picture_description");
}

function isActivePictureTask(status) {
  return status?.todayContentType === "picture_description"
    || (status?.isPictureDescriptionDay && status?.todayContentType !== "story_audio");
}

/**
 * Sanitize filename to prevent path traversal
 */
function sanitizeFilename(filename) {
  const base = path.basename(String(filename || "video.webm")).replace(/\s+/g, "_");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  // Extract extension BEFORE slicing so it's never truncated mid-dot
  const ext = path.extname(cleaned);                          // e.g. ".mp4"
  const stem = path.basename(cleaned, ext).slice(0, 100);    // cap stem at 100 chars
  const result = stem ? `${stem}${ext}` : cleaned.slice(0, 104);
  return result && result !== "." && result !== ".." ? result : "video.webm";
}

function getBaseMimeType(mimeType) {
  return String(mimeType || "").split(";")[0].trim().toLowerCase();
}

function validateVideoNameAndMime(filename, mimeType) {
  const baseType = getBaseMimeType(mimeType);
  if (!ALLOWED_VIDEO_TYPES.includes(baseType)) {
    const error = new Error("Invalid file type. Only supported video files are allowed.");
    error.statusCode = 400;
    throw error;
  }

  const safeFilename = sanitizeFilename(filename);
  let ext = path.extname(safeFilename).toLowerCase();

  if (ext && !MIME_BY_EXTENSION[ext]) {
    const error = new Error("Invalid video file extension.");
    error.statusCode = 400;
    throw error;
  }

  if (!ext) {
    ext = VIDEO_EXTENSIONS_BY_MIME[baseType]?.[0] || ".webm";
  }

  const expectedMime = MIME_BY_EXTENSION[ext];
  if (expectedMime && expectedMime !== baseType) {
    const error = new Error("Video extension does not match the selected video type.");
    error.statusCode = 400;
    throw error;
  }

  const stem = path.basename(safeFilename, path.extname(safeFilename)).replace(/\.+/g, "_") || "video";
  return {
    baseType,
    extension: ext,
    safeFilename: `${stem}${ext}`,
  };
}

function assertOwnedVideoKey(key, userId) {
  const expectedPrefix = `videos/${userId}/`;
  const validKeyPattern = new RegExp(`^videos/${String(userId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\d{4}-\\d{2}-\\d{2}/[a-z0-9]{8}\\.[a-z0-9]+$`);
  if (!key?.startsWith(expectedPrefix) || !validKeyPattern.test(key)) {
    const error = new Error("Invalid upload key");
    error.statusCode = 403;
    throw error;
  }
}

function isDetectedVideoCompatible(declaredMime, detectedMime) {
  if (!detectedMime || !detectedMime.startsWith("video/")) return false;
  if (declaredMime === detectedMime) return true;

  // Some MP4-family files are reported as QuickTime/MP4 depending on container metadata.
  const mp4Family = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);
  if (mp4Family.has(declaredMime) && mp4Family.has(detectedMime)) return true;

  return false;
}

async function sniffRemoteVideo(publicUrl, declaredMime) {
  const response = await fetch(publicUrl, {
    headers: { Range: "bytes=0-8191" },
  });

  if (!response.ok && response.status !== 206) {
    const error = new Error("Could not inspect uploaded video file.");
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !isDetectedVideoCompatible(declaredMime, detected.mime)) {
    const error = new Error("Invalid video file. File content does not match the selected video type.");
    error.statusCode = 400;
    throw error;
  }

  return detected;
}

/**
 * Download frames from R2 and convert to base64
 */
async function downloadFramesFromR2(frameKeys) {
  if (!frameKeys || frameKeys.length === 0) return null;

  console.log(`[VideoService] Downloading ${frameKeys.length} frames from R2 (parallel)...`);
  const start = Date.now();

  const results = await Promise.allSettled(
    frameKeys.map(async (key) => {
      const url = `${process.env.R2_PUBLIC_URL?.replace(/\/$/, "")}/${key}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    })
  );

  const frames = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`[VideoService] ✅ Downloaded ${frames.length}/${frameKeys.length} frames in ${Date.now() - start}ms${failed ? ` (${failed} failed)` : ''}`);
  return frames.length > 0 ? frames : null;
}

/**
 * Download video from R2, run security checks, then enqueue for AI processing.
 * Runs asynchronously — caller does not await this.
 */
async function downloadAndEnqueue(reportId, videoUrl, phone, displayName, videoHash = null, frameKeys = null, videoKey = null) {
  const tempPath = `./tmp/uploads/confirm-${reportId}-${Date.now()}.mp4`;

  const fail = async (message, eventType = null) => {
    if (fs.existsSync(tempPath)) { try { fs.unlinkSync(tempPath); } catch {} }
    await VideoReport.findByIdAndUpdate(reportId, { status: "failed", errorMessage: message });
    pushProgressById(reportId, { status: "failed", error: message });
    if (eventType) {
      // Look up user name for the security event log
      let userName = displayName || "Unknown";
      try {
        const userDoc = await User.findOne({ phone: { $in: [phone, phone?.replace(/^(\+91|91)/, "")] } }).lean();
        if (userDoc?.name) userName = userDoc.name;
      } catch {}
      recordSecurityEvent({ reportId, error: message, userName, phone, type: eventType });
    }
  };

  try {
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });

    // Download frames from R2 if provided
    let browserFrames = null;
    if (frameKeys && frameKeys.length > 0) {
      browserFrames = await downloadFramesFromR2(frameKeys);
    }

    // ── Step 0: Check cache if hash provided ─────────────────────────────────
    if (videoHash) {
      const cached = await checkSecurityCache(videoHash);
      if (cached && cached.passed) {
        console.log(`[VideoService] ⚡ Security checks SKIPPED (cached) for ${reportId}`);
        pushPipelineStep(reportId, "virus", "Security checks passed (cached)");
        pushPipelineStep(reportId, "codec", "Codec validation skipped (cached)");
        pushPipelineStep(reportId, "moderation", "Content check skipped (cached)");
        
        // Skip to AI processing
        const report = await VideoReport.findById(reportId);
        const storedDuration = report?.videoDuration;
        
        // Still need to download for AI processing (unless we have browser frames)
        if (!browserFrames || browserFrames.length === 0) {
          pushPipelineStep(reportId, "download", "Downloading for analysis…");
          const downloadStart = Date.now();
          // Use a fresh presigned URL so we can fetch from a private R2 bucket
          const fetchUrl = videoKey
            ? await getPresignedDownloadUrl(videoKey, 300)
            : videoUrl;
          const response = await fetch(fetchUrl);
          if (!response.ok) throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
          const buffer = await response.arrayBuffer();
          fs.writeFileSync(tempPath, Buffer.from(buffer));
          console.log(`[VideoService] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB in ${Date.now() - downloadStart}ms`);
        } else {
          console.log(`[VideoService] ⚡ Skipping video download - using browser frames for visual analysis`);
        }
        
        pushPipelineStep(reportId, "queue", "Queued for AI analysis…");
        if (browserFrames?.length >= 8 && fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch {}
        }
        enqueue({
          reportId,
          videoPath: browserFrames?.length >= 8 ? videoUrl : tempPath,
          phone,
          displayName,
          knownDuration: storedDuration,
          browserFrames: browserFrames,
        });
        return;
      }
    }

    // ── Step 1: Download with progress ───────────────────────────────────────
    pushPipelineStep(reportId, "download", "Downloading your video…");
    console.log(`[VideoService] Downloading video for ${reportId}...`);

    const downloadStart = Date.now();
    // Use a fresh presigned URL so we can fetch from a private R2 bucket
    const fetchUrl = videoKey
      ? await getPresignedDownloadUrl(videoKey, 300)
      : videoUrl;
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`Failed to download: ${response.status} ${response.statusText}`);

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(buffer));
    const downloadTime = Date.now() - downloadStart;
    console.log(`[VideoService] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB in ${downloadTime}ms`);

    // ── Step 2-4: Run security checks in parallel ────────────────────────────
    const securityChecks = [];
    const checksRun = {};
    
    // Virus scan (if enabled)
    if (process.env.ENABLE_VIRUS_SCAN === "true") {
      securityChecks.push(
        scanFile(tempPath).then(scanResult => {
          checksRun.virusScan = scanResult.clean || scanResult.skipped;
          if (!scanResult.clean && !scanResult.skipped) {
            const msg = scanResult.threat
              ? `File rejected: malware detected (${scanResult.threat})`
              : "File rejected: virus scan failed";
            return { failed: true, message: msg, type: "🦠 Virus / Malware" };
          }
          return { failed: false };
        })
      );
    }

    // Codec validation (if enabled)
    if (process.env.ENABLE_CODEC_VALIDATION === "true") {
      securityChecks.push(
        validateVideoCodecs(tempPath).then(codecResult => {
          checksRun.codecValid = codecResult.valid;
          if (!codecResult.valid) {
            return { 
              failed: true, 
              message: codecResult.error || "Unsupported video codec", 
              type: "🎬 Invalid Codec" 
            };
          }
          return { failed: false };
        })
      );
    }

    // Content moderation (if enabled)
    if (process.env.ENABLE_CONTENT_MODERATION === "true") {
      securityChecks.push(
        moderateVideo(tempPath, browserFrames).then(modResult => {
          checksRun.contentSafe = modResult.approved || modResult.skipped;
          if (!modResult.approved && !modResult.skipped) {
            const reason = modResult.flags?.length
              ? `Inappropriate content detected: ${modResult.flags.join(", ")}`
              : "Content moderation rejected this video";
            return { failed: true, message: reason, type: "🛡️ Content Violation" };
          }
          return { failed: false };
        })
      );
    }

    // Run all security checks in parallel
    if (securityChecks.length > 0) {
      pushPipelineStep(reportId, "virus", "Running virus scan…");
      if (process.env.ENABLE_CODEC_VALIDATION === "true") {
        pushPipelineStep(reportId, "codec", "Validating video codec…");
      }
      if (process.env.ENABLE_CONTENT_MODERATION === "true") {
        pushPipelineStep(reportId, "moderation", "Running content safety check…");
      }
      const results = await Promise.all(securityChecks);
      
      // Check if any failed
      const failure = results.find(r => r.failed);
      if (failure) {
        await fail(failure.message, failure.type);
        return;
      }
      
      // Cache successful result if hash provided
      if (videoHash) {
        await saveSecurityCache(videoHash, {
          passed: true,
          checks: checksRun,
        });
      }
    }

    if (securityChecks.length === 0) {
      pushPipelineStep(reportId, "virus", "Virus scan skipped");
      pushPipelineStep(reportId, "codec", "Codec check skipped");
      pushPipelineStep(reportId, "moderation", "Content check skipped");
    } else {
      pushPipelineStep(reportId, "moderation", "Security checks passed");
    }

    // ── Step 5: Hand off to AI queue ─────────────────────────────────────────
    pushPipelineStep(reportId, "queue", "Queued for AI analysis…");

    const report = await VideoReport.findById(reportId);
    const storedDuration = report?.videoDuration;

    // With browser frames, stream audio from R2 URL — skip keeping large temp file on disk
    const useRemotePath = browserFrames && browserFrames.length >= 8;
    const queueVideoPath = useRemotePath ? videoUrl : tempPath;
    if (useRemotePath && fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
      console.log(`[VideoService] ⚡ Using R2 URL + ${browserFrames.length} frames (temp file removed)`);
    }

    enqueue({
      reportId,
      videoPath: queueVideoPath,
      phone,
      displayName,
      knownDuration: storedDuration,
      browserFrames: browserFrames,
    });

  } catch (err) {
    console.error(`[VideoService] downloadAndEnqueue failed for ${reportId}:`, err.message);
    await fail("Failed to prepare video for processing: " + err.message);
  }
}

/**
 * Save browser-extracted frames for AI analysis
 */
export async function saveFrames(reportKey, framesBase64, authId) {
  try {
    const timestamp = Date.now();
    console.log(`[SaveFrames] Saving ${framesBase64.length} frames for ${reportKey} (parallel)`);

    // Validate all frames first (fast, synchronous)
    const uploads = framesBase64.map((b64, i) => {
      const buffer = Buffer.from(b64, 'base64');
      if (buffer.length > 500 * 1024) {
        const error = new Error(`Frame ${i} exceeds 500KB limit`);
        error.statusCode = 400;
        throw error;
      }
      const frameKey = `frames/${reportKey.replace(/\.[^.]+$/, '')}_${timestamp}_frame${i}.jpg`;
      return { buffer, frameKey, index: i };
    });

    // Upload all frames in parallel
    const frameKeys = await Promise.all(
      uploads.map(async ({ buffer, frameKey, index }) => {
        await uploadToR2Buffer(buffer, frameKey, 'image/jpeg');
        return frameKey;
      })
    );

    console.log(`[SaveFrames] ✅ All ${frameKeys.length} frames saved (parallel)`);
    return { success: true, frameKeys, totalFrames: frameKeys.length };
  } catch (err) {
    console.error('[SaveFrames] Error:', err.message);
    throw err;
  }
}

/**
 * Upload buffer to R2 (helper for frame upload)
 * Uses the shared r2 client from storage.js which has checksum-stripping middleware.
 */
async function uploadToR2Buffer(buffer, key, mimeType) {
  return uploadBufferToR2(buffer, key, mimeType);
}

/**
 * Get presigned upload URL for direct browser upload to R2
 */
export async function getPresignedUrl(filename, mimeType, userId) {
  try {
    console.log("[VideoService] getPresignedUrl - filename:", filename, "mimeType:", mimeType, "userId:", userId);

    const { baseType, safeFilename } = validateVideoNameAndMime(filename, mimeType);
    console.log("[VideoService] Safe filename:", safeFilename, "baseType:", baseType);
    
    const key = getR2Key(userId, safeFilename);
    console.log("[VideoService] Generated R2 key:", key);
    
    const uploadUrl = await getPresignedUploadUrl(key, baseType);
    console.log("[VideoService] Generated presigned URL (length):", uploadUrl?.length);
    
    const publicUrl = `${process.env.R2_PUBLIC_URL?.replace(/\/$/, "")}/${key}`;
    console.log("[VideoService] Public URL:", publicUrl);
    
    return { uploadUrl, key, publicUrl };
  } catch (error) {
    console.error("[VideoService] getPresignedUrl error:", error.message, error.stack);
    throw error;
  }
}

/**
 * Confirm direct upload to R2 and start processing
 */
export async function confirmDirectUpload(key, publicUrl, mimeType, isPublic, user, recordedDuration = null, videoHash = null, frames = null) {
  if (!key || !publicUrl) {
    const error = new Error("key and publicUrl are required");
    error.statusCode = 400;
    throw error;
  }

  const authId = user.id; // JWT contains auth._id as 'id'
  const phone = user.phone;
  const strippedPhone = phone.replace(/^(\+91|91)/, "");

  let baseType;
  try {
    assertOwnedVideoKey(key, authId);
    const validated = validateVideoNameAndMime(path.basename(key), mimeType);
    baseType = validated.baseType;
  } catch (validationErr) {
    try { await deleteFromR2(key); } catch {}
    throw validationErr;
  }

  const isWebm = baseType.includes("webm") || key.endsWith(".webm");

  // Validate publicUrl is from our R2 bucket (prevent SSRF)
  const r2Endpoint = process.env.R2_ENDPOINT || "";
  const r2PublicUrl = process.env.R2_PUBLIC_URL || "";
  const allowedR2Hosts = [
    new URL(r2Endpoint).hostname,
    new URL(r2PublicUrl).hostname,
  ].filter(Boolean);

  let parsedPublicUrl;
  try {
    parsedPublicUrl = new URL(publicUrl);
  } catch {
    const error = new Error("Invalid upload URL");
    error.statusCode = 400;
    throw error;
  }

  if (!allowedR2Hosts.some(h => parsedPublicUrl.hostname.endsWith(h))) {
    console.error(`[ConfirmUpload] SSRF attempt blocked — URL hostname: ${parsedPublicUrl.hostname}`);
    const error = new Error("Invalid upload URL");
    error.statusCode = 400;
    throw error;
  }

  const decodedUrlPath = decodeURIComponent(parsedPublicUrl.pathname.replace(/^\/+/, ""));
  if (!decodedUrlPath.endsWith(key)) {
    console.error(`[ConfirmUpload] URL/key mismatch blocked — urlPath=${decodedUrlPath} key=${key}`);
    try { await deleteFromR2(key); } catch {}
    const error = new Error("Upload URL does not match the upload key");
    error.statusCode = 400;
    throw error;
  }

  // Renamed-file protection: inspect the uploaded object's magic bytes before
  // creating a report, so a script/image renamed to .webm/.mp4 is rejected.
  try {
    const detected = await sniffRemoteVideo(publicUrl, baseType);
    console.log(`[ConfirmUpload] Magic bytes OK — declared=${baseType}, detected=${detected.mime}`);
  } catch (sniffErr) {
    try { await deleteFromR2(key); } catch {}
    throw sniffErr;
  }

  // Submit gate (duration + size) before creating report
  try {
    const { evaluateSubmitGate } = await import("./submitGate.js");
    let contentLength = 0;
    try {
      const headRes = await fetch(publicUrl, { method: "HEAD" });
      contentLength = parseInt(headRes.headers.get("content-length") || "0", 10);
    } catch { /* non-fatal */ }

    // Derive duration limits from question type (server-side, not client-trusted)
    const status = await Status.findOne().lean();
    const gateFlags = {
      isMonthlyReflection: status?.isMonthlyReflectionDay || false,
      isMonthlyGoals: status?.isMonthlyGoalsDay || false,
      isStorySummary: isActiveStoryTask(status),
      isPictureDescription: isActivePictureTask(status),
    };

    const gate = evaluateSubmitGate({
      durationSeconds: recordedDuration ?? null,
      fileSizeBytes: contentLength > 0 ? contentLength : null,
      frameCount: Array.isArray(frames) ? frames.length : null,
      flags: gateFlags,
      settings: status || {},
    });
    if (!gate.passed) {
      try { await deleteFromR2(key); } catch {}
      const failCheck = gate.checks.find((c) => c.status === "fail");
      const error = new Error(failCheck?.message || "Video does not meet submission requirements.");
      error.statusCode = 400;
      throw error;
    }
  } catch (gateErr) {
    if (gateErr.statusCode) throw gateErr;
    console.warn("[ConfirmUpload] Gate check skipped:", gateErr.message);
  }

  // Check file size (redundant safety)
  try {
    const headRes = await fetch(publicUrl, { method: "HEAD" });
    const contentLength = parseInt(headRes.headers.get("content-length") || "0", 10);
    const fileMB = contentLength / 1024 / 1024;
    
    if (contentLength > 0 && fileMB > MAX_ANALYSIS_MB) {
      try { await deleteFromR2(key); } catch {}
      const error = new Error(
        `Video file is too large for analysis (${fileMB.toFixed(0)}MB). Maximum is ${MAX_ANALYSIS_MB}MB. Please record a shorter or lower-quality video.`
      );
      error.statusCode = 400;
      throw error;
    }
  } catch (headErr) {
    console.warn("[VideoService] Could not check file size:", headErr.message);
  }

  // Find user by phone (reports should link to User._id, not Auth._id)
  const userDoc = await User.findOne({ phone: { $in: [phone, strippedPhone] } });
  
  if (!userDoc) {
    console.error("[ConfirmUpload] User not found by phone:", phone, "stripped:", strippedPhone);
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  const userId = userDoc._id; // Use actual User._id for the report

  // Mark user as submitted
  await User.findOneAndUpdate(
    { phone: { $in: [phone, strippedPhone] } },
    { completed: true }
  );

  // Create report with recorded duration if provided
  const reportStatus = await Status.findOne().lean();
  const reportGateFlags = {
    isMonthlyReflection: reportStatus?.isMonthlyReflectionDay || false,
    isMonthlyGoals: reportStatus?.isMonthlyGoalsDay || false,
    isStorySummary: isActiveStoryTask(reportStatus),
    isPictureDescription: isActivePictureTask(reportStatus),
  };
  const allowPrivateVideos = reportStatus?.allowPrivateVideos ?? true;
  const reportData = {
      userId,
      phone,
      videoFileName: path.basename(key),
      challengeType: reportGateFlags.isMonthlyReflection ? "monthly_reflection"
        : reportGateFlags.isPictureDescription ? "picture_description"
        : reportGateFlags.isStorySummary ? "story_summary"
        : reportGateFlags.isMonthlyGoals ? "monthly_goals"
        : "topic",
      status: "processing",
    videoUrl: publicUrl,
    videoKey: key,
    // Never trust the client with visibility. Admins can force all new videos public.
    isPublic: !allowPrivateVideos || (isPublic === true || isPublic === "true"),
    uploaderName: userDoc?.name || phone,
  };

  // If we have the recorded duration from frontend, store it
  if (recordedDuration && typeof recordedDuration === 'number' && recordedDuration > 0) {
    reportData.videoDuration = recordedDuration;
    console.log(`[VideoService] Using recorded duration from frontend: ${recordedDuration}s`);
  }

  // Store frame keys so the cleanup job can delete them from R2 after 24h
  if (frames && Array.isArray(frames) && frames.length > 0) {
    reportData.frameKeys = frames;
  }

  const report = await VideoReport.create(reportData);
  trackReportPhone(report._id, strippedPhone);

  console.log(`[VideoService] Report created: ${report._id} key=${key} webm=${isWebm} duration=${recordedDuration || 'unknown'} hash=${videoHash ? videoHash.substring(0, 12) + '...' : 'none'} frameKeys=${frames ? frames.length : 0}`);

  pushPipelineStep(report._id, "download", "Preparing your video…");

  // Enqueue for processing (security scans run inside downloadAndEnqueue on the local file)
  // Pass frameKeys (R2 keys) - they will be downloaded and converted to base64 inside downloadAndEnqueue
  downloadAndEnqueue(report._id, publicUrl, strippedPhone, userDoc?.name || strippedPhone, videoHash, frames, key);

  return {
    success: true,
    reportId: report._id,
    message: isWebm ? "Video uploaded. Transcoding for best quality, then analysing…" : "Processing now…",
    queuePosition: 1,
    estimatedWait: isWebm ? 3 : 1,
  };
}

/**
 * Upload video file directly
 */
export async function uploadVideo(file, user, isPublic, ipAddress, userAgent) {
  let videoPath = null;
  let videoKey = null;
  let videoUrl = null;
  const securityFlags = [];

  try {
    if (!file) {
      const error = new Error("No video file uploaded");
      error.statusCode = 400;
      throw error;
    }

    const authId = user.id; // JWT contains auth._id as 'id'
    const phone = user.phone;
    const strippedPhone = phone.replace(/^(\+91|91)/, "");
    let safeFilename;
    let baseType;

    try {
      const validated = validateVideoNameAndMime(file.originalname, file.mimetype);
      safeFilename = validated.safeFilename;
      baseType = validated.baseType;
    } catch (validationErr) {
      securityFlags.push('mime_mismatch');
      await UploadAudit.logUpload({
        userId: authId, // Use authId for audit logs
        phone,
        uploadType: 'direct',
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        ipAddress,
        userAgent,
        status: 'rejected',
        rejectionReason: 'Invalid MIME type',
        securityFlags,
      });
      
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw validationErr;
    }

    videoPath = file.path;

    console.log(`[VideoService] ${safeFilename} (${(file.size/1024/1024).toFixed(1)}MB) user=${phone}`);

    fs.mkdirSync(path.dirname(videoPath), { recursive: true });

    // Magic byte validation
    try {
      const fileType = await fileTypeFromFile(videoPath);
      if (!fileType || !isDetectedVideoCompatible(baseType, fileType.mime)) {
        securityFlags.push('magic_byte_fail');
        await UploadAudit.logUpload({
          userId: authId, phone, uploadType: 'direct',
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          ipAddress, userAgent,
          status: 'rejected',
          rejectionReason: 'Magic byte validation failed',
          securityFlags,
        });
        
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        const error = new Error("Invalid video file. File content does not match video format.");
        error.statusCode = 400;
        throw error;
      }
    } catch (magicErr) {
      console.error("[VideoService] Magic byte validation failed:", magicErr);
      securityFlags.push('magic_byte_fail');
      await UploadAudit.logUpload({
        userId: authId, phone, uploadType: 'direct',
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        ipAddress, userAgent,
        status: 'failed',
        errorMessage: magicErr.message,
        securityFlags,
      });
      
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      const error = new Error("Could not validate video file.");
      error.statusCode = 400;
      throw error;
    }

    // Virus scan (if enabled)
    if (process.env.ENABLE_VIRUS_SCAN === "true") {
      const scanResult = await scanFile(videoPath);
      if (!scanResult.clean && !scanResult.skipped) {
        securityFlags.push("virus_detected");
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        const error = new Error(scanResult.threat
          ? `File rejected: malware detected (${scanResult.threat})`
          : "File rejected: virus scan failed");
        error.statusCode = 400;
        throw error;
      }
    }

    // Codec validation (if enabled)
    if (process.env.ENABLE_CODEC_VALIDATION === "true") {
      const codecResult = await validateVideoCodecs(videoPath);
      if (!codecResult.valid) {
        securityFlags.push("codec_invalid");
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        const error = new Error(codecResult.error || "Unsupported video codec");
        error.statusCode = 400;
        throw error;
      }
    }

    // Check duration
    let duration;
    try {
      duration = await getVideoDuration(videoPath);
      console.log(`[VideoService] Duration: ${duration}s`);
    } catch (err) {      await UploadAudit.logUpload({
        userId: authId, phone, uploadType: 'direct',
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        ipAddress, userAgent,
        status: 'failed',
        errorMessage: err.message,
        securityFlags,
      });
      
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      throw err;
    }

    if (duration < 60) {
      securityFlags.push('duration_invalid');
      await UploadAudit.logUpload({
        userId: authId, phone, uploadType: 'direct',
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        duration,
        ipAddress, userAgent,
        status: 'rejected',
        rejectionReason: `Video too short: ${duration}s`,
        securityFlags,
      });
      
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      const error = new Error(`Video is too short (${duration}s). Minimum is 1 minute.`);
      error.statusCode = 400;
      throw error;
    }
    
    // Dynamic duration limits based on question type
    const status = await Status.findOne().lean();
    const gateFlags = {
      isMonthlyReflection: status?.isMonthlyReflectionDay || false,
      isMonthlyGoals: status?.isMonthlyGoalsDay || false,
      isStorySummary: isActiveStoryTask(status),
      isPictureDescription: isActivePictureTask(status),
    };
    
    const { minSeconds, maxSeconds, minLabel, maxLabel } = getDurationLimits(gateFlags, status || {});
    const maxDurationWithTolerance = maxSeconds + 5;
    
    if (duration > maxDurationWithTolerance) {
      securityFlags.push('duration_invalid');
      await UploadAudit.logUpload({
        userId: authId, phone, uploadType: 'direct',
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        duration,
        ipAddress, userAgent,
        status: 'rejected',
        rejectionReason: `Video too long: ${duration}s`,
        securityFlags,
      });
      
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      const error = new Error(`Video is too long (${duration}s). Maximum is ${maxLabel}.`);
      error.statusCode = 400;
      throw error;
    }

    // Upload to R2
    try {
      videoKey = getR2Key(authId.toString(), safeFilename); // Use authId for R2 key
      videoUrl = await uploadToR2(videoPath, videoKey, baseType);
      console.log(`[VideoService] Video saved: ${videoUrl}`);
    } catch (r2Err) {
      console.error(`[VideoService] R2 upload failed:`, r2Err);
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      throw new Error("Failed to save video. Please try again.");
    }

    // Find user by phone (reports should link to User._id, not Auth._id)
    const userDoc = await User.findOne({ phone: { $in: [phone, strippedPhone] } });
    
    if (!userDoc) {
      console.error("[UploadVideo] User not found by phone:", phone, "stripped:", strippedPhone);
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      if (videoKey) {
        try { await deleteFromR2(videoKey); } catch {}
      }
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }
    
    const userId = userDoc._id; // Use actual User._id for the report

    await User.findOneAndUpdate(
      { phone: { $in: [phone, strippedPhone] } },
      {
        completed: true,
        ...(user.name ? { $set: { name: user.name } } : {}),
      }
    );

    const allowPrivateVideos = (await Status.findOne().lean())?.allowPrivateVideos ?? true;
    const report = await VideoReport.create({
      userId,
      phone,
      videoFileName: safeFilename,
      challengeType: isMonthlyReflection ? "monthly_reflection"
        : isPictureDescription ? "picture_description"
        : isStorySummary ? "story_summary"
        : isMonthlyGoals ? "monthly_goals"
        : "topic",
      videoDuration: duration,
      status: "processing",
      videoUrl,
      videoKey,
      // Never trust the client with visibility. Admins can force all new videos public.
      isPublic: !allowPrivateVideos || (isPublic === "true" || isPublic === true),
      uploaderName: userDoc?.name || phone,
    });

    console.log(`[VideoService] Report created: ${report._id}`);
    trackReportPhone(report._id, strippedPhone);
    pushPipelineStep(report._id, "download", "Preparing your video…");

    // Log successful upload
    await UploadAudit.logUpload({
      userId: authId, // Use authId for audit logs
      phone,
      uploadType: 'direct',
      fileName: safeFilename,
      fileSize: file.size,
      mimeType: baseType,
      duration,
      videoCodec: 'unknown',
      audioCodec: 'unknown',
      ipAddress,
      userAgent,
      status: 'success',
      reportId: report._id,
      r2Key: videoKey,
      securityFlags,
    });

    // Enqueue for processing
    const { position, estimatedWait } = enqueue({
      reportId: report._id,
      videoPath,
      phone,
      displayName: userDoc?.name || phone,
    });

    return {
      success: true,
      reportId: report._id,
      message: position === 1
        ? "Video uploaded. Processing now…"
        : `Video uploaded. You are #${position} in queue.`,
      queuePosition: position,
      estimatedWait,
    };

  } catch (err) {
    // Clean up
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (videoKey) {
      try { await deleteFromR2(videoKey); } catch {}
    }
    throw err;
  }
}

/**
 * Get video report
 */
export async function getVideoReport(reportId, authId) {
  const report = await VideoReport.findById(reportId);
  
  if (!report) {
    const error = new Error("Report not found or expired");
    error.statusCode = 404;
    throw error;
  }
  
  // Import Auth model to find the auth record
  const Auth = (await import("../../../models/authSchema.js")).default;
  
  // Find the auth record by ID (JWT contains auth._id as 'id')
  const auth = await Auth.findById(authId);
  if (!auth) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  // Find the user by phone to get the actual User._id
  const stripped = auth.phone.replace(/^(\+91|91)/, "");
  const user = await User.findOne({ phone: { $in: [auth.phone, stripped] } });
  
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  if (report.userId.toString() !== user._id.toString() && !["admin", "admins"].includes(auth.role)) {
    const error = new Error("Access denied");
    error.statusCode = 403;
    throw error;
  }

  // For private videos, generate short-lived signed URL
  let videoUrl = report.videoUrl;
  if (!report.isPublic && report.videoKey) {
    try {
      videoUrl = await getPresignedDownloadUrl(report.videoKey, 3600); // 1 hour
    } catch (err) {
      console.error("[VideoService] Failed to generate signed URL:", err);
    }
  }

  const { analysis: reportAnalysis, challengeType } = await prepareReportAnalysis(report);

  return {
    reportId: report._id,
    status: report.status,
    submittedAt: report.submittedAt,
    expiresAt: report.expiresAt,
    videoFileName: report.videoFileName,
    videoDuration: report.videoDuration,
    challengeType,
    videoUrl: videoUrl || null,
    isPublic: report.isPublic || false,
    analysis: reportAnalysis,
    errorMessage: report.errorMessage,
  };
}

/**
 * Keep every report surface on the same task type and composite breakdown.
 * In particular, older picture-task reports may not have persisted these
 * fields inside `analysis`, even though the report endpoint can reconstruct
 * them for the Video Analysis page.
 */
async function prepareReportAnalysis(report) {
  let analysis = report.status === "completed" ? report.analysis : null;
  let challengeType = report.challengeType || analysis?.challengeType || null;

  // Compatibility for reports created before challengeType/picture breakdown
  // fields were persisted. Do not change the stored score; only hydrate the
  // display payload exactly as the individual report endpoint does.
  const status = analysis ? await Status.findOne().lean() : null;
  const user = (analysis && report.phone) ? await User.findOne({ phone: report.phone }).lean() : null;
  const userHistory = user?.feedbackScores || [];
  const isPicTask = challengeType === "picture_description" || status?.isPictureDescriptionDay;
  const isStoryTask = challengeType === "story_summary" || status?.isStorySummaryDay || status?.todayContentType === "story_audio";

  if (!challengeType && analysis) {
    if (isPicTask) {
      challengeType = "picture_description";
    } else if (isStoryTask) {
      challengeType = "story_summary";
    }
  }

  if (analysis && isPicTask && (!analysis.scoreBreakdown || !analysis.scoreBreakdown.isPictureDescription)) {
    const source = analysis.toObject ? analysis.toObject() : { ...analysis };
    const { breakdown } = calculateCompositeScore({
      durationSeconds: report.videoDuration || 0,
      maxDurationSeconds: status?.durationPictureFull ?? 180,
      vocabularyUsed: source.vocabularyUsed || [],
      totalVocabWords: status?.todayVocabulary?.length || status?.vocabWordCount || 5,
      requiredVocabWords: Math.min(status?.vocabRequiredCount ?? 3, status?.todayVocabulary?.length || status?.vocabWordCount || 5),
      topicRelevance: source.topicRelevance ?? null,
      analysis: source,
      isPictureDescription: true,
      userHistory,
    });
    analysis = { ...source, scoreBreakdown: breakdown };
  }

  // Self-heal story summary tasks if they were missing topic relevance or marked as special day
  if (analysis && isStoryTask && (analysis.scoreBreakdown?.isSpecialDay || analysis.topicRelevance == null || analysis.scoreBreakdown?.maxTopic === 0)) {
    const source = analysis.toObject ? analysis.toObject() : { ...analysis };
    const todayVocab = status?.todayVocabulary || [];
    const configuredWordCount = status?.vocabStoryWordCount ?? status?.vocabWordCount ?? 5;
    const configuredRequiredCount = status?.vocabStoryRequiredCount ?? status?.vocabRequiredCount ?? 3;
    const effectiveTotalWords = todayVocab.length > 0 ? todayVocab.length : configuredWordCount;
    const effectiveRequiredWords = Math.min(configuredRequiredCount, effectiveTotalWords);

    const { score, breakdown } = calculateCompositeScore({
      durationSeconds: report.videoDuration || 0,
      maxDurationSeconds: status?.durationStoryFull ?? 180,
      vocabularyUsed: source.vocabularyUsed || [],
      totalVocabWords: effectiveTotalWords,
      requiredVocabWords: effectiveRequiredWords,
      topicRelevance: source.topicRelevance ?? null,
      analysis: source,
      isStorySummary: true,
      userHistory,
    });

    source.compositeScore = score;
    source.scoreBreakdown = {
      ...breakdown,
      maxLength: 30,
      maxVocab: 30,
      maxTopic: 15,
      maxComm: 10,
      maxGrowth: 15,
    };
    if (source.topicRelevance == null) {
      source.topicRelevance = typeof breakdown.topic === "number" ? Math.round((breakdown.topic / 15) * 10 * 10) / 10 : 7.0;
    }

    // Persist self-healed story score
    VideoReport.findByIdAndUpdate(report._id, {
      $set: {
        "analysis.compositeScore": score,
        "analysis.scoreBreakdown": source.scoreBreakdown,
        "analysis.topicRelevance": source.topicRelevance,
        challengeType: "story_summary",
        "analysis.challengeType": "story_summary",
      }
    }).catch(err => console.warn("[VideoService] Failed to persist self-healed story score:", err.message));

    analysis = source;
  }

  // Self-heal vocabulary matching if transcript exists and today's vocabulary has words
  if (analysis && analysis.transcription && status?.todayVocabulary?.length > 0) {
    const todayVocab = status.todayVocabulary || [];
    const rechecked = matchVocabularyInTranscript(analysis.transcription, todayVocab, analysis);
    const existingCount = Array.isArray(analysis.vocabularyUsed) ? analysis.vocabularyUsed.length : 0;
    
    if (rechecked.length > existingCount) {
      const source = analysis.toObject ? analysis.toObject() : { ...analysis };
      source.vocabularyUsed = rechecked;
      
      const isPic = challengeType === "picture_description" || status?.isPictureDescriptionDay;
      const isStory = challengeType === "story_summary" || status?.isStorySummaryDay || status?.todayContentType === "story_audio";
      const configuredWordCount = isPic
        ? (status?.vocabPictureWordCount ?? status?.vocabWordCount ?? 5)
        : isStory
        ? (status?.vocabStoryWordCount ?? status?.vocabWordCount ?? 5)
        : (status?.vocabNormalWordCount ?? status?.vocabWordCount ?? 5);
      const configuredRequiredCount = isPic
        ? (status?.vocabPictureRequiredCount ?? status?.vocabRequiredCount ?? 3)
        : isStory
        ? (status?.vocabStoryRequiredCount ?? status?.vocabRequiredCount ?? 3)
        : (status?.vocabNormalRequiredCount ?? status?.vocabRequiredCount ?? 3);
      const effectiveTotalWords = todayVocab.length > 0 ? todayVocab.length : configuredWordCount;
      const effectiveRequiredWords = Math.min(configuredRequiredCount, effectiveTotalWords);

      const scoreGateFlags = {
        isPictureDescription: isPic || false,
        isStorySummary: isStory || false,
        isMonthlyReflection: status?.isMonthlyReflectionDay || false,
        isMonthlyGoals: status?.isMonthlyGoalsDay || false,
      };
      const { fullScoreSeconds } = getDurationLimits(scoreGateFlags, status || {});

      const { score, breakdown } = calculateCompositeScore({
        durationSeconds: report.videoDuration || 0,
        maxDurationSeconds: fullScoreSeconds,
        vocabularyUsed: rechecked,
        totalVocabWords: effectiveTotalWords,
        requiredVocabWords: effectiveRequiredWords,
        topicRelevance: source.topicRelevance ?? null,
        analysis: source,
        isPictureDescription: isPic || false,
        isStorySummary: isStory || false,
        userHistory,
      });

      source.compositeScore = score;
      source.scoreBreakdown = isPic ? {
        ...breakdown,
        maxCommunication: 20,
        maxContent: 35,
        maxVocabulary: 10,
        maxDuration: 20,
        maxGrowth: 15,
      } : {
        ...breakdown,
        maxLength: 30,
        maxVocab: 30,
        maxTopic: breakdown.isSpecialDay ? 0 : 15,
        maxComm: breakdown.isSpecialDay ? 25 : 10,
        maxGrowth: 15,
      };

      // Persist the corrected analysis in database asynchronously
      VideoReport.findByIdAndUpdate(report._id, {
        $set: {
          "analysis.vocabularyUsed": rechecked,
          "analysis.compositeScore": score,
          "analysis.scoreBreakdown": source.scoreBreakdown,
        }
      }).catch(err => console.warn("[VideoService] Failed to persist self-healed vocab score:", err.message));

      analysis = source;
    }
  }

  // The community endpoint receives a lean report and must expose the same
  // task type through the nested object consumed by DetailedReport.
  if (analysis && challengeType && !analysis.challengeType) {
    analysis = { ...(analysis.toObject ? analysis.toObject() : analysis), challengeType };
  }

  return { analysis, challengeType };
}

/**
 * Get community feed (public videos from last 24h)
 */
export async function getCommunityFeed(authIdOrPhone, myRole = "user") {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const Auth = (await import("../../../models/authSchema.js")).default;
  
  let authPhone = null;
  let userDoc = null;

  if (mongoose.isValidObjectId(authIdOrPhone)) {
    const authDoc = await Auth.findById(authIdOrPhone).select("phone").lean();
    userDoc = await User.findById(authIdOrPhone).select("_id phone").lean();
    authPhone = authDoc?.phone || userDoc?.phone || null;
  }

  const myPhone = authPhone || (typeof authIdOrPhone === "string" ? authIdOrPhone : null);
  const linkedUser = userDoc || (myPhone
    ? await User.findOne({ phone: { $in: [myPhone, myPhone?.replace(/^(\+91|91)/, "")] } }).select("_id").lean()
    : null);

  const phoneCandidates = [...new Set([
    myPhone,
    myPhone?.replace(/^\+91/, ""),
    myPhone?.replace(/^91/, ""),
  ].filter(Boolean))];

  // MINIMAL PRIVATE VIDEO RULE:
  // - Admins / Trainers: see ALL videos (public + private)
  // - Regular Users: see PUBLIC videos ({ isPublic: true }) + THEIR OWN private videos
  const isAdmin = myRole === "admin" || myRole === "admins" || myRole === "trainer";
  const visibilityFilter = isAdmin
    ? {}
    : {
        $or: [
          { isPublic: true },
          ...(linkedUser?._id ? [{ userId: linkedUser._id }] : []),
          ...(phoneCandidates.length > 0 ? [{ phone: { $in: phoneCandidates } }] : []),
        ],
      };

  const feed = await VideoReport.find({
    status: "completed",
    videoUrl: { $ne: null },
    submittedAt: { $gte: since },
    expiresAt: { $gt: new Date() },
    ...visibilityFilter,
  })
    .sort({ submittedAt: -1 })
    .limit(20)
    .select("userId uploaderName submittedAt videoDuration videoUrl videoKey phone challengeType analysis status expiresAt likes dislikes comments isPublic")
    .lean();

  const feedUserIds = feed.map(item => item.userId).filter(Boolean);
  const feedPhones = feed.map(item => item.phone).filter(Boolean);
  const feedUsers = await User.find({
    $or: [
      ...(feedUserIds.length ? [{ _id: { $in: feedUserIds } }] : []),
      ...(feedPhones.length ? [{ phone: { $in: feedPhones } }] : []),
    ],
  }).select("name phone streak earnedBadges").lean();
  const userById = new Map(feedUsers.map(user => [String(user._id), user]));
  const userByPhone = new Map(feedUsers.filter(user => user.phone).map(user => [user.phone, user]));

  // Private objects are not readable through the public CDN URL. Generate a
  // short-lived URL for every private item the query allowed through.
  const annotated = await Promise.all(feed.map(async item => {
    const feedUser = userById.get(String(item.userId)) || userByPhone.get(item.phone) || {};
    let videoUrl = item.videoUrl;
    if (!item.isPublic && item.videoKey) {
      try {
        videoUrl = await getPresignedDownloadUrl(item.videoKey, 3600);
      } catch (err) {
        console.error("[VideoService] Failed to generate community signed URL:", err);
      }
    }

    return {
      _id: item._id,
      uploaderName: item.uploaderName,
      ...serializeStreakBadges(feedUser),
      submittedAt: item.submittedAt,
      videoDuration: item.videoDuration,
      videoUrl,
      challengeType: item.challengeType || item.analysis?.challengeType || null,
      analysis: (await prepareReportAnalysis(item)).analysis,
      expiresAt: item.expiresAt,
      likeCount:    item.likes?.length    || 0,
      dislikeCount: item.dislikes?.length || 0,
      userReaction: item.likes?.includes(myPhone)
        ? "like"
        : item.dislikes?.includes(myPhone)
        ? "dislike"
        : null,
      // Strip phone numbers from comments for privacy
      comments: (item.comments || []).map(c => ({
        _id:       c._id,
        name:      c.name,
        role:      c.role,
        text:      c.text,
        createdAt: c.createdAt,
        isOwn:     c.phone === myPhone,
      })),
      isPublic: item.isPublic ?? true,
    };
  }));

  return { feed: annotated };
}

/**
 * Toggle video visibility
 */
export async function toggleVideoVisibility(reportId, authId) {
  const VISIBILITY_TOGGLE_COOLDOWN_MS = 10 * 1000;
  const report = await VideoReport.findById(reportId);
  
  if (!report) {
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }
  
  // Import Auth model to find the auth record
  const Auth = (await import("../../../models/authSchema.js")).default;
  
  // Find the auth record by ID (JWT contains auth._id as 'id')
  const auth = await Auth.findById(authId);
  if (!auth) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  // Find the user by phone to get the actual User._id
  const stripped = auth.phone.replace(/^(\+91|91)/, "");
  const user = await User.findOne({ phone: { $in: [auth.phone, stripped] } });
  
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  if (report.userId.toString() !== user._id.toString() && !["admin", "admins"].includes(auth.role)) {
    const error = new Error("Access denied");
    error.statusCode = 403;
    throw error;
  }
  
  if (!report.videoUrl) {
    const error = new Error("No video stored for this report");
    error.statusCode = 400;
    throw error;
  }

  // If admin has disabled private videos, force public
  const statusDoc = await Status.findOne().lean();
  const nextIsPublic = !report.isPublic;
  if (!(statusDoc?.allowPrivateVideos ?? true) && !nextIsPublic) {
    const error = new Error("Private videos are currently disabled by the admin");
    error.statusCode = 403;
    throw error;
  }

  const cooldownCutoff = new Date(Date.now() - VISIBILITY_TOGGLE_COOLDOWN_MS);
  // Match the current value as well as the cooldown window. This makes two
  // simultaneous requests race safely: only one can flip this report.
  const updated = await VideoReport.findOneAndUpdate(
    {
      _id: report._id,
      isPublic: report.isPublic,
      $or: [
        { visibilityChangedAt: null },
        { visibilityChangedAt: { $exists: false } },
        { visibilityChangedAt: { $lte: cooldownCutoff } },
      ],
    },
    {
      $set: {
        isPublic: nextIsPublic,
        visibilityChangedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!updated) {
    const error = new Error("Please wait a few seconds before changing visibility again");
    error.statusCode = 429;
    error.retryAfterSeconds = Math.ceil(VISIBILITY_TOGGLE_COOLDOWN_MS / 1000);
    throw error;
  }
  
  return { isPublic: updated.isPublic };
}

/**
 * Get user's reports
 */
export async function getUserReports(authId) {
  // Import Auth model to find the auth record
  const Auth = (await import("../../../models/authSchema.js")).default;
  
  // Find the auth record by ID (JWT contains auth._id as 'id')
  const auth = await Auth.findById(authId);
  if (!auth) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  // Find the user by phone to get the actual User._id
  const stripped = auth.phone.replace(/^(\+91|91)/, "");
  const user = await User.findOne({ phone: { $in: [auth.phone, stripped] } });
  
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const reports = await VideoReport.find({
    userId: user._id, // Use actual User._id
    expiresAt: { $gt: new Date() },
  })
    .sort({ submittedAt: -1 })
    .limit(10)
    .select("-analysis.transcription")
    .lean();

  // R2 objects are private in production. The stored videoUrl is the public
  // CDN URL used for public videos, so it cannot be used for a private report.
  // Return the same short-lived signed URL used by the report-detail and
  // community-feed endpoints. Without this, the owner sees the report but
  // the browser receives a 401/403 when it tries to play the video.
  const annotatedReports = await Promise.all(reports.map(async (report) => {
    let videoUrl = report.videoUrl;
    if (!report.isPublic && report.videoKey) {
      try {
        videoUrl = await getPresignedDownloadUrl(report.videoKey, 3600);
      } catch (err) {
        console.error(`[VideoService] Failed to generate report signed URL for ${report._id}:`, err.message);
        videoUrl = null;
      }
    }

    return { ...report, videoUrl };
  }));

  return { reports: annotatedReports };
}

/**
 * Delete video report
 */
export async function deleteVideoReport(reportId, authId) {
  const report = await VideoReport.findById(reportId);
  
  if (!report) {
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }
  
  // Import Auth model to find the auth record
  const Auth = (await import("../../../models/authSchema.js")).default;
  
  // Find the auth record by ID (JWT contains auth._id as 'id')
  const auth = await Auth.findById(authId);
  if (!auth) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  // Find the user by phone to get the actual User._id
  const stripped = auth.phone.replace(/^(\+91|91)/, "");
  const user = await User.findOne({ phone: { $in: [auth.phone, stripped] } });
  
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  if (report.userId.toString() !== user._id.toString() && !["admin", "admins"].includes(auth.role)) {
    const error = new Error("Access denied");
    error.statusCode = 403;
    throw error;
  }

  // Delete from R2
  if (report.videoKey) {
    try {
      await deleteFromR2(report.videoKey);
    } catch (err) {
      console.error("[VideoService] Failed to delete from R2:", err);
    }
  }

  // Delete report
  await VideoReport.findByIdAndDelete(reportId);

  // Delete all notifications related to this video
  try {
    const Notification = (await import("../../../models/notificationSchema.js")).default;
    await Notification.deleteMany({ reportId: report._id });
  } catch (err) {
    console.error("[VideoService] Failed to delete notifications:", err.message);
  }
  
  return { success: true, message: "Video deleted successfully" };
}

/**
 * Retry failed video analysis
 */
export async function retryVideoAnalysis(reportId, authId) {
  console.log("[RetryVideoAnalysis] Starting - reportId:", reportId, "authId:", authId);
  
  const report = await VideoReport.findById(reportId);
  
  if (!report) {
    console.error("[RetryVideoAnalysis] Report not found:", reportId);
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }
  
  console.log("[RetryVideoAnalysis] Report found - userId:", report.userId, "requestAuthId:", authId);
  
  // Import Auth model to find the auth record
  const Auth = (await import("../../../models/authSchema.js")).default;
  
  // Find the auth record by ID (JWT contains auth._id as 'id')
  console.log("[RetryVideoAnalysis] Looking up auth record by ID:", authId);
  const auth = await Auth.findById(authId);
  if (!auth) {
    console.error("[RetryVideoAnalysis] Auth record not found by ID:", authId);
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  console.log("[RetryVideoAnalysis] Auth found - phone:", auth.phone, "name:", auth.name);
  
  // Find the user by phone (reports are linked by phone/userId, not authId)
  const stripped = auth.phone.replace(/^(\+91|91)/, "");
  const user = await User.findOne({ phone: { $in: [auth.phone, stripped] } });
  
  if (!user) {
    console.error("[RetryVideoAnalysis] User not found by phone:", auth.phone, "stripped:", stripped);
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  console.log("[RetryVideoAnalysis] User found:", user.name, "userId:", user._id);
  
  // Check if this user owns the report
  if (report.userId.toString() !== user._id.toString()) {
    console.error("[RetryVideoAnalysis] Access denied - report.userId:", report.userId, "user._id:", user._id);
    const error = new Error("Access denied");
    error.statusCode = 403;
    throw error;
  }

  if (report.status !== "failed") {
    console.error("[RetryVideoAnalysis] Invalid status:", report.status);
    const error = new Error("Can only retry failed analyses");
    error.statusCode = 400;
    throw error;
  }

  // Reset report status and clear error
  report.status = "processing";
  report.errorMessage = null;
  report.analysis = {};
  await report.save();

  const retryPhone = user.phone || report.phone;
  trackReportPhone(reportId, retryPhone);
  pushPipelineStep(reportId, "download", "Restarting analysis…");

  if (report.videoUrl) {
    console.log("[RetryVideoAnalysis] Re-enqueuing video:", report.videoUrl);
    // Pass the stored duration and frame keys for retry processing
    await downloadAndEnqueue(
      reportId, 
      report.videoUrl, 
      user.phone || user.userId || user._id, 
      user.name || "User",
      null, // videoHash - not available on retry
      report.frameKeys || null, // Pass stored frame keys if available
      report.videoKey || null   // Pass videoKey so presigned URL can be generated
    );
  }
  
  return { 
    success: true, 
    message: "Analysis restarted",
    reportId: reportId,
    status: "processing"
  };
}

/**
 * Re-evaluate a report's vocabulary matching and composite score using the latest intelligent rules.
 */
export async function reEvaluateReport(reportId, userId, userRole = "user") {
  const report = await VideoReport.findById(reportId);
  if (!report) {
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }

  // Allow report owner or privileged admin/trainer
  const isOwner = String(report.userId) === String(userId) || (report.phone && report.phone === userId);
  const isPrivileged = userRole === "admin" || userRole === "trainer" || userRole === "superadmin";
  if (!isOwner && !isPrivileged) {
    const error = new Error("Not authorized to re-evaluate this report");
    error.statusCode = 403;
    throw error;
  }

  if (report.status !== "completed" || !report.analysis) {
    const error = new Error("Report is not completed yet");
    error.statusCode = 400;
    throw error;
  }

  const status = await Status.findOne().lean();
  const todayVocab = status?.todayVocabulary || [];
  const transcript = report.analysis?.transcription || "";

  // 1. Re-match vocabulary with intelligent matcher
  const matchedWords = matchVocabularyInTranscript(transcript, todayVocab, report.analysis);

  // 2. Re-calculate composite score and score breakdown
  const challengeType = report.challengeType || report.analysis?.challengeType || (
    status?.isMonthlyReflectionDay ? "monthly_reflection"
    : status?.isPictureDescriptionDay ? "picture_description"
    : status?.isStorySummaryDay ? "story_summary"
    : status?.isMonthlyGoalsDay ? "monthly_goals"
    : "topic"
  );

  const isPic = challengeType === "picture_description" || status?.isPictureDescriptionDay;
  const isStory = challengeType === "story_summary" || status?.isStorySummaryDay || status?.todayContentType === "story_audio";
  const configuredWordCount = isPic
    ? (status?.vocabPictureWordCount ?? status?.vocabWordCount ?? 5)
    : isStory
    ? (status?.vocabStoryWordCount ?? status?.vocabWordCount ?? 5)
    : (status?.vocabNormalWordCount ?? status?.vocabWordCount ?? 5);
  const configuredRequiredCount = isPic
    ? (status?.vocabPictureRequiredCount ?? status?.vocabRequiredCount ?? 3)
    : isStory
    ? (status?.vocabStoryRequiredCount ?? status?.vocabRequiredCount ?? 3)
    : (status?.vocabNormalRequiredCount ?? status?.vocabRequiredCount ?? 3);
  const effectiveTotalWords = todayVocab.length > 0 ? todayVocab.length : configuredWordCount;
  const effectiveRequiredWords = Math.min(configuredRequiredCount, effectiveTotalWords);

  const scoreGateFlags = {
    isPictureDescription: isPic || false,
    isStorySummary: isStory || false,
    isMonthlyReflection: status?.isMonthlyReflectionDay || false,
    isMonthlyGoals: status?.isMonthlyGoalsDay || false,
  };
  const { fullScoreSeconds } = getDurationLimits(scoreGateFlags, status || {});

  const user = report.phone ? await User.findOne({ phone: report.phone }).lean() : null;

  const { score, breakdown } = calculateCompositeScore({
    durationSeconds: report.videoDuration || 0,
    maxDurationSeconds: fullScoreSeconds,
    vocabularyUsed: matchedWords,
    totalVocabWords: effectiveTotalWords,
    requiredVocabWords: effectiveRequiredWords,
    topicRelevance: report.analysis.topicRelevance ?? null,
    analysis: report.analysis,
    isPictureDescription: isPic || false,
    isStorySummary: isStory || false,
    userHistory: user?.feedbackScores || [],
  });

  if (isStory && report.analysis.topicRelevance == null) {
    report.analysis.topicRelevance = typeof breakdown.topic === "number" ? Math.round((breakdown.topic / 15) * 10 * 10) / 10 : 7.0;
  }

  const updatedBreakdown = isPic ? {
    ...breakdown,
    maxCommunication: 20,
    maxContent: 35,
    maxVocabulary: 10,
    maxDuration: 20,
    maxGrowth: 15,
  } : {
    ...breakdown,
    maxLength: 30,
    maxVocab: 30,
    maxTopic: breakdown.isSpecialDay ? 0 : 15,
    maxComm: breakdown.isSpecialDay ? 25 : 10,
    maxGrowth: 15,
  };

  const requiredCount = Math.min(configuredRequiredCount, todayVocab.length || 1);
  const vocabularyScore = todayVocab.length > 0
    ? Math.round((Math.min(matchedWords.length, requiredCount) / requiredCount) * 10 * 10) / 10
    : report.analysis.vocabularyScore ?? null;

  report.analysis.vocabularyUsed = matchedWords;
  report.analysis.vocabularyScore = vocabularyScore;
  report.analysis.compositeScore = score;
  report.analysis.scoreBreakdown = updatedBreakdown;
  report.markModified("analysis");
  await report.save();

  // Also update user's feedbackScores latest entry points if phone exists
  if (report.phone) {
    try {
      await User.findOneAndUpdate(
        { phone: report.phone, "feedbackScores.date": { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        { $set: { "feedbackScores.$.points": score } }
      );
    } catch {}
  }

  const { analysis: reportAnalysis } = await prepareReportAnalysis(report);

  return {
    success: true,
    message: `Score re-evaluated! Recognized ${matchedWords.length} vocabulary word${matchedWords.length === 1 ? '' : 's'}.`,
    matchedWords,
    score,
    analysis: reportAnalysis,
  };
}
