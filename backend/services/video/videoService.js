/**
 * Video Service
 * Business logic for video upload, validation, and management
 */

import VideoReport from "../../../models/videoReportSchema.js";
import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";
import UploadAudit from "../../../models/uploadAuditSchema.js";
import { uploadToR2, uploadBufferToR2, deleteFromR2, getR2Key, getPresignedUploadUrl, getPresignedDownloadUrl } from "../../config/storage.js";
import { enqueue, pushProgressById, recordSecurityEvent } from "./videoQueue.js";
import { getVideoDuration } from "../ai/videoProcessor.js";
import { scanFile } from "../ai/virusScanner.js";
import { validateVideoCodecs } from "../ai/videoValidator.js";
import { moderateVideo } from "../ai/contentModerator.js";
import { checkSecurityCache, saveSecurityCache } from "../ai/securityCache.js";
import { fileTypeFromFile } from "file-type";
import fs from "fs";
import path from "path";

// Security: Allowed video MIME types
const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime',
  'video/x-msvideo', 'video/mpeg', 'video/x-matroska', 'video/x-ms-wmv'
];

const MAX_ANALYSIS_MB = 110; // Railway RAM limit

/**
 * Sanitize filename to prevent path traversal
 */
function sanitizeFilename(filename) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
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
async function downloadAndEnqueue(reportId, videoUrl, phone, displayName, videoHash = null, frameKeys = null) {
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
        pushProgressById(reportId, { status: "processing", stage: "✅ Security checks passed (cached)" });
        
        // Skip to AI processing
        const report = await VideoReport.findById(reportId);
        const storedDuration = report?.videoDuration;
        
        // Still need to download for AI processing (unless we have browser frames)
        if (!browserFrames || browserFrames.length === 0) {
          pushProgressById(reportId, { status: "processing", stage: "⬇️ Downloading for analysis…" });
          const downloadStart = Date.now();
          const response = await fetch(videoUrl);
          if (!response.ok) throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
          const buffer = await response.arrayBuffer();
          fs.writeFileSync(tempPath, Buffer.from(buffer));
          console.log(`[VideoService] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB in ${Date.now() - downloadStart}ms`);
        } else {
          console.log(`[VideoService] ⚡ Skipping video download - using browser frames for visual analysis`);
        }
        
        pushProgressById(reportId, { status: "processing", stage: "⏳ Queuing for AI analysis…" });
        enqueue({
          reportId,
          videoPath: browserFrames && browserFrames.length > 0 ? videoUrl : tempPath, // Use URL if we have frames
          phone,
          displayName,
          knownDuration: storedDuration,
          browserFrames: browserFrames, // Pass frames to queue
        });
        return;
      }
    }

    // ── Step 1: Download with progress ───────────────────────────────────────
    pushProgressById(reportId, { status: "processing", stage: "⬇️ Downloading your video…" });
    console.log(`[VideoService] Downloading video for ${reportId}...`);

    const downloadStart = Date.now();
    const response = await fetch(videoUrl);
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
        moderateVideo(tempPath).then(modResult => {
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
      pushProgressById(reportId, { status: "processing", stage: "🔍 Running security checks…" });
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

    // ── Step 5: Hand off to AI queue ─────────────────────────────────────────
    pushProgressById(reportId, { status: "processing", stage: "⏳ Queuing for AI analysis…" });

    const report = await VideoReport.findById(reportId);
    const storedDuration = report?.videoDuration;

    enqueue({
      reportId,
      videoPath: tempPath,
      phone,
      displayName,
      knownDuration: storedDuration,
      browserFrames: browserFrames, // Pass frames to queue
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
    
    // Validate MIME type
    const baseType = mimeType.split(';')[0].trim();
    if (!ALLOWED_VIDEO_TYPES.includes(baseType)) {
      const error = new Error("Invalid file type. Only video files are allowed.");
      error.statusCode = 400;
      throw error;
    }
    
    const safeFilename = sanitizeFilename(filename);
    console.log("[VideoService] Safe filename:", safeFilename);
    
    const key = getR2Key(userId, safeFilename);
    console.log("[VideoService] Generated R2 key:", key);
    
    const uploadUrl = await getPresignedUploadUrl(key, mimeType);
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

  // Validate MIME type
  const baseType = mimeType.split(';')[0].trim();
  if (!ALLOWED_VIDEO_TYPES.includes(baseType)) {
    try { await deleteFromR2(key); } catch {}
    const error = new Error("Invalid file type. Only video files are allowed.");
    error.statusCode = 400;
    throw error;
  }

  const authId = user.id; // JWT contains auth._id as 'id'
  const phone = user.phone;
  const isWebm = baseType.includes("webm") || key.endsWith(".webm");
  const strippedPhone = phone.replace(/^(\+91|91)/, "");

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

  // Check file size
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
  const reportData = {
    userId,
    phone,
    videoFileName: path.basename(key),
    status: "processing",
    videoUrl: publicUrl,
    videoKey: key,
    isPublic: isPublic === true || isPublic === "true",
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

  console.log(`[VideoService] Report created: ${report._id} key=${key} webm=${isWebm} duration=${recordedDuration || 'unknown'} hash=${videoHash ? videoHash.substring(0, 12) + '...' : 'none'} frameKeys=${frames ? frames.length : 0}`);

  // Enqueue for processing (security scans run inside downloadAndEnqueue on the local file)
  // Pass frameKeys (R2 keys) - they will be downloaded and converted to base64 inside downloadAndEnqueue
  downloadAndEnqueue(report._id, publicUrl, strippedPhone, userDoc?.name || strippedPhone, videoHash, frames);

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

    // Validate MIME type
    const baseType = file.mimetype.split(';')[0].trim();
    if (!ALLOWED_VIDEO_TYPES.includes(baseType)) {
      securityFlags.push('mime_mismatch');
      await UploadAudit.logUpload({
        userId: authId, // Use authId for audit logs
        phone: user.phone,
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
      const error = new Error("Invalid file type. Only video files are allowed.");
      error.statusCode = 400;
      throw error;
    }

    videoPath = file.path;
    const authId = user.id; // JWT contains auth._id as 'id'
    const phone = user.phone;
    const strippedPhone = phone.replace(/^(\+91|91)/, "");

    console.log(`[VideoService] ${file.originalname} (${(file.size/1024/1024).toFixed(1)}MB) user=${phone}`);

    fs.mkdirSync(path.dirname(videoPath), { recursive: true });

    // Magic byte validation
    try {
      const fileType = await fileTypeFromFile(videoPath);
      if (!fileType || !fileType.mime.startsWith('video/')) {
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
    const isMonthlyReflection = status?.isMonthlyReflectionDay || false;
    const isMonthlyGoals = status?.isMonthlyGoalsDay || false;
    const isWeeklyReflection = status?.isWeeklyReflectionDay || false;
    
    const maxDuration = (isMonthlyReflection || isMonthlyGoals) 
      ? 605  // 10 minutes + 5 sec tolerance
      : isWeeklyReflection 
      ? 425  // 7 minutes + 5 sec tolerance
      : 305; // 5 minutes + 5 sec tolerance
    
    const maxMinutes = Math.floor((maxDuration - 5) / 60);
    
    if (duration > maxDuration) {
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
      const error = new Error(`Video is too long (${duration}s). Maximum is ${maxMinutes} minutes.`);
      error.statusCode = 400;
      throw error;
    }

    // Upload to R2
    try {
      videoKey = getR2Key(authId.toString(), file.originalname); // Use authId for R2 key
      videoUrl = await uploadToR2(videoPath, videoKey, file.mimetype);
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

    const report = await VideoReport.create({
      userId,
      phone,
      videoFileName: file.originalname,
      videoDuration: duration,
      status: "processing",
      videoUrl,
      videoKey,
      isPublic: isPublic === "true" || isPublic === true,
      uploaderName: userDoc?.name || phone,
    });

    console.log(`[VideoService] Report created: ${report._id}`);

    // Log successful upload
    await UploadAudit.logUpload({
      userId: authId, // Use authId for audit logs
      phone,
      uploadType: 'direct',
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
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
  
  if (report.userId.toString() !== user._id.toString()) {
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

  return {
    reportId: report._id,
    status: report.status,
    submittedAt: report.submittedAt,
    expiresAt: report.expiresAt,
    videoFileName: report.videoFileName,
    videoDuration: report.videoDuration,
    videoUrl: videoUrl || null,
    isPublic: report.isPublic || false,
    analysis: report.status === "completed" ? report.analysis : null,
    errorMessage: report.errorMessage,
  };
}

/**
 * Get community feed (public videos from last 24h)
 */
export async function getCommunityFeed(myPhone) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const feed = await VideoReport.find({
    status: "completed",
    isPublic: true,
    videoUrl: { $ne: null },
    submittedAt: { $gte: since },
    expiresAt: { $gt: new Date() },
  })
    .sort({ submittedAt: -1 })
    .limit(20)
    .select("uploaderName submittedAt videoDuration videoUrl analysis expiresAt likes dislikes comments")
    .lean();

  // Annotate each item with the caller's reaction
  const annotated = feed.map(item => ({
    ...item,
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
    // Don't expose raw like/dislike phone arrays to clients
    likes:    undefined,
    dislikes: undefined,
  }));

  return { feed: annotated };
}

/**
 * Toggle video visibility
 */
export async function toggleVideoVisibility(reportId, authId) {
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
  
  if (report.userId.toString() !== user._id.toString()) {
    const error = new Error("Access denied");
    error.statusCode = 403;
    throw error;
  }
  
  if (!report.videoUrl) {
    const error = new Error("No video stored for this report");
    error.statusCode = 400;
    throw error;
  }

  report.isPublic = !report.isPublic;
  await report.save();
  
  return { isPublic: report.isPublic };
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
    .select("-analysis.transcription");

  return { reports };
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
  
  if (report.userId.toString() !== user._id.toString()) {
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

  if (report.videoUrl) {
    console.log("[RetryVideoAnalysis] Re-enqueuing video:", report.videoUrl);
    // Pass the stored duration and frame keys for retry processing
    await downloadAndEnqueue(
      reportId, 
      report.videoUrl, 
      user.phone || user.userId || user._id, 
      user.name || "User",
      null, // videoHash - not available on retry
      report.frameKeys || null // Pass stored frame keys if available
    );
  }
  
  return { 
    success: true, 
    message: "Analysis restarted",
    reportId: reportId,
    status: "processing"
  };
}
