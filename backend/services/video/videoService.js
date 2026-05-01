/**
 * Video Service
 * Business logic for video upload, validation, and management
 */

import VideoReport from "../../../models/videoReportSchema.js";
import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";
import UploadAudit from "../../../models/uploadAuditSchema.js";
import { uploadToR2, deleteFromR2, getR2Key, getPresignedUploadUrl, getPresignedDownloadUrl } from "../../config/storage.js";
import { enqueue } from "./videoQueue.js";
import { getVideoDuration } from "../ai/videoProcessor.js";
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
 * Download video from R2 and enqueue for processing
 */
async function downloadAndEnqueue(reportId, videoUrl, phone, displayName) {
  const tempPath = `./tmp/uploads/confirm-${reportId}-${Date.now()}.mp4`;
  
  try {
    console.log(`[VideoService] Downloading video for ${reportId}...`);
    
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempPath, Buffer.from(buffer));
    
    console.log(`[VideoService] Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`);
    
    enqueue({
      reportId,
      videoPath: tempPath,
      phone,
      displayName,
    });
  } catch (err) {
    console.error(`[VideoService] Download failed for ${reportId}:`, err.message);
    
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    
    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: "Failed to download video for processing: " + err.message,
    });
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
export async function confirmDirectUpload(key, publicUrl, mimeType, isPublic, user) {
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

  const userId = user.id;
  const phone = user.phone;
  const isWebm = baseType.includes("webm") || key.endsWith(".webm");
  const strippedPhone = phone.replace(/^(\+91|91)/, "");

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

  // Find user
  const userDoc = await User.findOne({ phone: { $in: [phone, strippedPhone] } });

  // Mark user as submitted
  await User.findOneAndUpdate(
    { phone: { $in: [phone, strippedPhone] } },
    { completed: true }
  );

  // Create report
  const report = await VideoReport.create({
    userId,
    phone,
    videoFileName: path.basename(key),
    status: "processing",
    videoUrl: publicUrl,
    videoKey: key,
    isPublic: isPublic === true || isPublic === "true",
    uploaderName: userDoc?.name || phone,
  });

  console.log(`[VideoService] Report created: ${report._id} key=${key} webm=${isWebm}`);

  // Enqueue for processing
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
        userId: user.id,
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
    const userId = user.id;
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
          userId, phone, uploadType: 'direct',
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
        userId, phone, uploadType: 'direct',
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

    // Check duration
    let duration;
    try {
      duration = await getVideoDuration(videoPath);
      console.log(`[VideoService] Duration: ${duration}s`);
    } catch (err) {
      await UploadAudit.logUpload({
        userId, phone, uploadType: 'direct',
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
        userId, phone, uploadType: 'direct',
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
        userId, phone, uploadType: 'direct',
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
      videoKey = getR2Key(userId.toString(), file.originalname);
      videoUrl = await uploadToR2(videoPath, videoKey, file.mimetype);
      console.log(`[VideoService] Video saved: ${videoUrl}`);
    } catch (r2Err) {
      console.error(`[VideoService] R2 upload failed:`, r2Err);
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      throw new Error("Failed to save video. Please try again.");
    }

    // Create report
    const userDoc = await User.findOne({ phone: { $in: [phone, strippedPhone] } });

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
      userId,
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
export async function getVideoReport(reportId, userId) {
  const report = await VideoReport.findById(reportId);
  
  if (!report) {
    const error = new Error("Report not found or expired");
    error.statusCode = 404;
    throw error;
  }
  
  if (report.userId.toString() !== userId) {
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
export async function getCommunityFeed() {
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
    .select("uploaderName submittedAt videoDuration videoUrl analysis expiresAt")
    .lean();

  return { feed };
}

/**
 * Toggle video visibility
 */
export async function toggleVideoVisibility(reportId, userId) {
  const report = await VideoReport.findById(reportId);
  
  if (!report) {
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }
  
  if (report.userId.toString() !== userId) {
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
export async function getUserReports(userId) {
  const reports = await VideoReport.find({
    userId,
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
export async function deleteVideoReport(reportId, userId) {
  const report = await VideoReport.findById(reportId);
  
  if (!report) {
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }
  
  if (report.userId.toString() !== userId) {
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
