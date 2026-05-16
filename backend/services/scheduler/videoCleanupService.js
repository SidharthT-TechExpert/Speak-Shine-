/**
 * Video Cleanup Service
 * Business logic for cleaning expired videos from R2 storage
 */

import VideoReport from "../../../models/videoReportSchema.js";
import { deleteFromR2 } from "../../../backend/config/storage.js";

/**
 * Clean expired videos from R2 storage
 * Finds videos that have expired or are expiring soon and deletes them
 */
export async function cleanExpiredVideos() {
  try {
    // Find reports expiring in the next hour OR already expired, that still have a video key
    const cutoff = new Date(Date.now() + 60 * 60 * 1000); // now + 1hr buffer
    
    const toClean = await VideoReport.find({
      expiresAt: { $lt: cutoff },
      videoKey: { $ne: null },
    }).select("_id videoKey").lean();

    if (toClean.length === 0) {
      return {
        cleaned: 0,
        message: "No expired videos to clean"
      };
    }

    console.log(`[VideoCleanup] Cleaning ${toClean.length} expired/expiring video(s) from R2…`);

    const cleaned = [];
    const failed = [];

    for (const report of toClean) {
      try {
        await deleteFromR2(report.videoKey);
        await VideoReport.updateOne(
          { _id: report._id },
          { $set: { videoKey: null, videoUrl: null } }
        );
        cleaned.push(report._id);
      } catch (err) {
        console.error(`[VideoCleanup] Failed to clean ${report.videoKey}:`, err.message);
        failed.push({
          reportId: report._id,
          videoKey: report.videoKey,
          error: err.message
        });
      }
    }

    console.log(`[VideoCleanup] ✅ Cleaned ${cleaned.length} video(s)`);
    
    if (failed.length > 0) {
      console.log(`[VideoCleanup] ⚠️ Failed to clean ${failed.length} video(s)`);
    }

    return {
      cleaned: cleaned.length,
      failed: failed.length,
      cleanedIds: cleaned,
      failedItems: failed
    };
  } catch (err) {
    console.error("[VideoCleanup] Video cleanup error:", err.message);
    throw err;
  }
}

/**
 * Get count of videos pending cleanup
 */
export async function getPendingCleanupCount() {
  try {
    const cutoff = new Date(Date.now() + 60 * 60 * 1000);
    
    const count = await VideoReport.countDocuments({
      expiresAt: { $lt: cutoff },
      videoKey: { $ne: null },
    });

    return { count };
  } catch (err) {
    console.error("[VideoCleanup] Get pending count error:", err);
    throw err;
  }
}

/**
 * Clean videos older than specified days
 * Useful for manual cleanup or maintenance
 */
export async function cleanVideosOlderThan(days) {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const toClean = await VideoReport.find({
      submittedAt: { $lt: cutoffDate },
      videoKey: { $ne: null },
    }).select("_id videoKey submittedAt").lean();

    if (toClean.length === 0) {
      return {
        cleaned: 0,
        message: `No videos older than ${days} days found`
      };
    }

    console.log(`[VideoCleanup] Cleaning ${toClean.length} video(s) older than ${days} days…`);

    const cleaned = [];
    const failed = [];

    for (const report of toClean) {
      try {
        await deleteFromR2(report.videoKey);
        await VideoReport.updateOne(
          { _id: report._id },
          { $set: { videoKey: null, videoUrl: null } }
        );
        cleaned.push(report._id);
      } catch (err) {
        failed.push({
          reportId: report._id,
          videoKey: report.videoKey,
          error: err.message
        });
      }
    }

    console.log(`[VideoCleanup] ✅ Cleaned ${cleaned.length} old video(s)`);

    return {
      cleaned: cleaned.length,
      failed: failed.length,
      cleanedIds: cleaned,
      failedItems: failed
    };
  } catch (err) {
    console.error("[VideoCleanup] Clean old videos error:", err);
    throw err;
  }
}
