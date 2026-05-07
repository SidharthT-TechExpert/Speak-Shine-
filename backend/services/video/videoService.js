/**
 * Video Service
 * Business logic for video upload, validation, and management
 */

import VideoReport from "../../../models/videoReportSchema.js";
import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";
import UploadAudit from "../../../models/uploadAuditSchema.js";
import { uploadToR2, deleteFromR2, getR2Key, getPresignedUploadUrl, getPresignedDownloadUrl } from "../../config/storage.js";
import { enqueue, pushProgressById, recordSecurityEvent } from "./videoQueue.js";
import { getVideoDuration } from "../ai/videoProcessor.js";
import { scanFile } from "../ai/virusScanner.js";
import { validateVideoCodecs } from "../ai/videoValidator.js";
import { moderateVideo } from "../ai/contentModerator.js";
import { invalidateOnUpload } from "../cache/cacheService.js";
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
 * Download video from R2, run security checks, then enqueue for AI processing.
 * Runs asynchronously — caller does not await this.
 */
async function downloadAndEnqueue(reportId, videoUrl, phone, displayName) {
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

    // ── Step 1: Download ─────────────────────────────────────────────────────
    pushProgressById(reportId, { status: "processing", stage: "⬇️ Downloading your video…" });
    console.log(`[VideoService] Downloading video for ${reportId}...`);

    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Failed to download: ${response.status} ${response.statusText}`);

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(buffer));
    console.log(`[VideoService] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

    // ── Step 2: Virus scan ───────────────────────────────────────────────────
    if (process.env.ENABLE_VIRUS_SCAN === "true") {
      pushProgressById(reportId, { status: "processing", stage: "🔍 Scanning for viruses…" });
      const scanResult = await scanFile(tempPath);
      if (!scanResult.clean && !scanResult.skipped) {
        const msg = scanResult.threat
          ? `File rejected: malware detected (${scanResult.threat})`
          : "File rejected: virus scan failed";
        await fail(msg, "🦠 Virus / Malware");
        return;
      }
    }

    // ── Step 3: Codec validation ─────────────────────────────────────────────
    if (process.env.ENABLE_CODEC_VALIDATION === "true") {
      pushProgressById(reportId, { status: "processing", stage: "🎬 Validating video codec…" });
      const codecResult = await validateVideoCodecs(tempPath);
      if (!codecResult.valid) {
        await fail(codecResult.error || "Unsupported video codec", "🎬 Invalid Codec");
        return;
      }
    }

    // ── Step 4: Content moderation ───────────────────────────────────────────
    if (process.env.ENABLE_CONTENT_MODERATION === "true") {
      pushProgressById(reportId, { status: "processing", stage: "🛡️ Checking content safety…" });
      const modResult = await moderateVideo(tempPath);
      if (!modResult.approved && !modResult.skipped) {
        const reason = modResult.flags?.length
          ? `Inappropriate content detected: ${modResult.flags.join(", ")}`
          : "Content moderation rejected this video";
        await fail(reason, "🛡️ Content Violation");
        return;
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
    });

  } catch (err) {
    console.error(`[VideoService] downloadAndEnqueue failed for ${reportId}:`, err.message);
    await fail("Failed to prepare video for processing: " + err.message);
  }
}

/**
 * Get presigned upload URL for direct browser upload to R2
 */
export async function getPresignedUrl(filename, mimeType, userId) {
  // Validate MIME type
  const baseType = mimeType.split(';')[0].trim();
  if (!ALLOWED_VIDEO_TYPES.includes(baseType)) {
    const error = new Error("Invalid file type. Only video files are allowed.");
    error.statusCode = 400;
    throw error;
  }
  
  const safeFilename = sanitizeFilename(filename);
  const key = getR2Key(userId, safeFilename);
  const uploadUrl = await getPresignedUploadUrl(key, mimeType);
  const publicUrl = `${process.env.R2_PUBLIC_URL?.replace(/\/$/, "")}/${key}`;
  
  return { uploadUrl, key, publicUrl };
}

/**
 * Confirm direct upload to R2 and start processing
 */
export async function confirmDirectUpload(key, publicUrl, mimeType, isPublic, user, recordedDuration = null) {
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

  const report = await VideoReport.create(reportData);

  console.log(`[VideoService] Report created: ${report._id} key=${key} webm=${isWebm} duration=${recordedDuration || 'unknown'}`);

  // Invalidate dashboard cache for this user so they see updated completed status
  invalidateOnUpload(strippedPhone).catch(() => {});

  // Enqueue for processing (security scans run inside downloadAndEnqueue on the local file)
  downloadAndEnqueue(report._id, publicUrl, strippedPhone, userDoc?.name || strippedPhone);

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

    // Invalidate dashboard cache for this user
    invalidateOnUpload(strippedPhone).catch(() => {});

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
    // Pass the stored duration for retry processing
    await downloadAndEnqueue(reportId, report.videoUrl, user.phone || user.userId || user._id, user.name || "User");
  }
  
  return { 
    success: true, 
    message: "Analysis restarted",
    reportId: reportId,
    status: "processing"
  };
}
