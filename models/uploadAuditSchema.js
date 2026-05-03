/**
 * uploadAuditSchema.js — Audit trail for video uploads
 * Tracks all upload attempts for security monitoring and abuse investigation
 */

import mongoose from "mongoose";

const uploadAuditSchema = new mongoose.Schema({
  // User information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  phone: {
    type: String,
    required: true,
    index: true,
  },
  
  // Upload details
  uploadType: {
    type: String,
    enum: ['direct', 'presigned'],
    required: true,
  },
  fileName: String,
  fileSize: Number, // bytes
  mimeType: String,
  
  // Video metadata (if validation succeeded)
  videoCodec: String,
  audioCodec: String,
  duration: Number, // seconds
  resolution: String, // e.g., "1920x1080"
  
  // Network information
  ipAddress: {
    type: String,
    required: true,
    index: true,
  },
  userAgent: String,
  
  // Status
  status: {
    type: String,
    enum: ['success', 'rejected', 'failed'],
    required: true,
    index: true,
  },
  rejectionReason: String, // Why upload was rejected
  errorMessage: String,    // Technical error details
  
  // Security flags
  securityFlags: [{
    type: String,
    enum: [
      'mime_mismatch',
      'magic_byte_fail',
      'codec_invalid',
      'virus_detected',
      'rate_limited',
      'suspicious_metadata',
      'file_too_large',
      'duration_invalid',
    ]
  }],
  
  // Related entities
  reportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "VideoReport",
  },
  r2Key: String,
  
  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    // index defined below via schema.index() with TTL — don't declare index: true here too
  },
}, {
  // Don't use { timestamps: true } — we have a manual 'timestamp' field above
  // that serves the same purpose and has a TTL index on it
});

// Index for querying recent uploads by user
uploadAuditSchema.index({ userId: 1, timestamp: -1 });

// Index for security monitoring (failed/rejected uploads)
uploadAuditSchema.index({ status: 1, timestamp: -1 });

// Index for IP-based abuse detection
uploadAuditSchema.index({ ipAddress: 1, timestamp: -1 });

// TTL index - auto-delete audit logs after 90 days
uploadAuditSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Static method: Log upload attempt
uploadAuditSchema.statics.logUpload = async function(data) {
  try {
    await this.create(data);
  } catch (err) {
    console.error('[UploadAudit] Failed to log:', err.message);
    // Don't throw - audit logging should never break the main flow
  }
};

// Static method: Get recent uploads by user
uploadAuditSchema.statics.getUserUploads = async function(userId, limit = 10) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('-userAgent -__v')
    .lean();
};

// Static method: Get suspicious activity
uploadAuditSchema.statics.getSuspiciousActivity = async function(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: since },
        status: { $in: ['rejected', 'failed'] }
      }
    },
    {
      $group: {
        _id: '$ipAddress',
        count: { $sum: 1 },
        users: { $addToSet: '$userId' },
        reasons: { $addToSet: '$rejectionReason' },
        flags: { $push: '$securityFlags' },
      }
    },
    {
      $match: { count: { $gte: 5 } } // 5+ failed attempts
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: 50
    }
  ]);
};

// Static method: Get upload stats
uploadAuditSchema.statics.getStats = async function(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    {
      $match: { timestamp: { $gte: since } }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalSize: { $sum: '$fileSize' },
      }
    }
  ]);
  
  const result = {
    success: 0,
    rejected: 0,
    failed: 0,
    totalSize: 0,
  };
  
  stats.forEach(s => {
    result[s._id] = s.count;
    result.totalSize += s.totalSize || 0;
  });
  
  return result;
};

const UploadAudit = mongoose.model("UploadAudit", uploadAuditSchema);
export default UploadAudit;
