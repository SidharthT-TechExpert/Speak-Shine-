/**
 * Video Processing Jobs
 * Background jobs for video processing tasks
 * 
 * Note: Current video queue logic is in backend/services/video/videoQueue.js
 * This file is for additional video-related background jobs
 */

import VideoReport from "../models/videoReportSchema.js";

/**
 * Job: Clean up failed video uploads
 * Runs every hour
 * Deletes video reports that have been in "failed" state for > 24 hours
 */
export async function cleanupFailedUploadsJob() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const result = await VideoReport.deleteMany({
      status: "failed",
      submittedAt: { $lt: oneDayAgo }
    });
    
    if (result.deletedCount > 0) {
      console.log(`[Job] Cleaned up ${result.deletedCount} failed video uploads`);
    }
    
    return { deletedCount: result.deletedCount };
  } catch (error) {
    console.error("[Job] Cleanup failed uploads error:", error);
    throw error;
  }
}

/**
 * Job: Archive old completed videos
 * Runs daily at 3:00 AM IST
 * Marks videos older than 90 days as archived
 */
export async function archiveOldVideosJob() {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    
    const result = await VideoReport.updateMany(
      {
        status: "completed",
        submittedAt: { $lt: ninetyDaysAgo },
        archived: { $ne: true }
      },
      {
        $set: { archived: true }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`[Job] Archived ${result.modifiedCount} old videos`);
    }
    
    return { archivedCount: result.modifiedCount };
  } catch (error) {
    console.error("[Job] Archive old videos error:", error);
    throw error;
  }
}

/**
 * Job: Generate video statistics
 * Runs daily at 1:00 AM IST
 * Calculates and caches video statistics for dashboard
 */
export async function generateVideoStatsJob() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
      totalVideos: await VideoReport.countDocuments(),
      completedToday: await VideoReport.countDocuments({
        status: "completed",
        submittedAt: { $gte: today }
      }),
      failedToday: await VideoReport.countDocuments({
        status: "failed",
        submittedAt: { $gte: today }
      }),
      processingNow: await VideoReport.countDocuments({
        status: "processing"
      }),
      avgProcessingTime: 0, // TODO: Calculate from completed videos
    };
    
    console.log("[Job] Generated video stats:", stats);
    
    // TODO: Cache stats in Redis for fast dashboard access
    
    return stats;
  } catch (error) {
    console.error("[Job] Generate video stats error:", error);
    throw error;
  }
}

/**
 * Job: Retry stuck videos
 * Runs every 30 minutes
 * Retries videos that have been in "processing" state for > 1 hour
 */
export async function retryStuckVideosJob() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const stuckVideos = await VideoReport.find({
      status: "processing",
      submittedAt: { $lt: oneHourAgo }
    });
    
    if (stuckVideos.length > 0) {
      console.log(`[Job] Found ${stuckVideos.length} stuck videos, marking for retry`);
      
      for (const video of stuckVideos) {
        video.status = "pending";
        video.error = "Processing timeout - retrying";
        await video.save();
      }
    }
    
    return { retriedCount: stuckVideos.length };
  } catch (error) {
    console.error("[Job] Retry stuck videos error:", error);
    throw error;
  }
}
