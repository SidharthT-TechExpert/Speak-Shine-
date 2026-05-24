/**
 * storage.js — Cloudflare R2 client (S3-compatible)
 * Exports uploadToR2, deleteFromR2, getR2Key, getPresignedUploadUrl
 */

import { S3Client, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

// Validate R2 configuration on startup
if (!process.env.R2_ENDPOINT) {
  console.error("[R2] FATAL: R2_ENDPOINT is not set");
  throw new Error("R2_ENDPOINT environment variable is required");
}
if (!process.env.R2_ACCESS_KEY_ID) {
  console.error("[R2] FATAL: R2_ACCESS_KEY_ID is not set");
  throw new Error("R2_ACCESS_KEY_ID environment variable is required");
}
if (!process.env.R2_SECRET_ACCESS_KEY) {
  console.error("[R2] FATAL: R2_SECRET_ACCESS_KEY is not set");
  throw new Error("R2_SECRET_ACCESS_KEY environment variable is required");
}
if (!process.env.R2_BUCKET_NAME) {
  console.error("[R2] FATAL: R2_BUCKET_NAME is not set");
  throw new Error("R2_BUCKET_NAME environment variable is required");
}

console.log("[R2] Configuration loaded:", {
  endpoint: process.env.R2_ENDPOINT,
  bucket: process.env.R2_BUCKET_NAME,
  accessKeyId: process.env.R2_ACCESS_KEY_ID?.substring(0, 8) + "...",
  secretKeyLength: process.env.R2_SECRET_ACCESS_KEY?.length
});

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || "speak-shine-videos";
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

/**
 * Build a unique R2 object key for a video.
 * Format: videos/{userId}/{date}/{uuid}.{ext}
 */
export function getR2Key(userId, originalName) {
  const ext  = path.extname(originalName || ".webm") || ".webm";
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const uid  = Math.random().toString(36).slice(2, 10);
  return `videos/${userId}/${date}/${uid}${ext}`;
}

/**
 * Upload a local file to R2 using multipart upload.
 * Returns the public URL of the uploaded object.
 *
 * @param {string} filePath   — local temp file path
 * @param {string} key        — R2 object key (from getR2Key)
 * @param {string} mimeType   — e.g. "video/webm"
 * @returns {Promise<string>} — public URL
 */
export async function uploadToR2(filePath, key, mimeType = "video/webm") {
  const fileStream = fs.createReadStream(filePath);

  const upload = new Upload({
    client: r2,
    params: {
      Bucket:      BUCKET,
      Key:         key,
      Body:        fileStream,
      ContentType: mimeType,
    },
    queueSize: 4,       // parallel parts
    partSize:  10 * 1024 * 1024, // 10MB parts
  });

  await upload.done();
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Delete an object from R2 by key.
 * Silently ignores errors (object may already be expired/deleted).
 *
 * @param {string} key — R2 object key
 */
export async function deleteFromR2(key) {
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    console.log(`[R2] Deleted: ${key}`);
  } catch (err) {
    console.log(`[R2] Delete failed (ignored): ${err.message}`);
  }
}

/**
 * Generate a presigned PUT URL so the browser can upload directly to R2.
 * The URL expires in 15 minutes.
 *
 * @param {string} key      — R2 object key (from getR2Key)
 * @param {string} mimeType — e.g. "video/webm"
 * @returns {Promise<string>} — presigned PUT URL
 */
export async function getPresignedUploadUrl(key, mimeType = "video/webm") {
  try {
    console.log("[R2] Generating presigned URL - key:", key, "mimeType:", mimeType);
    
    const command = new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      ContentType: mimeType,
    });
    
    const url = await getSignedUrl(r2, command, { expiresIn: 900 }); // 15 min
    console.log("[R2] Presigned URL generated successfully");
    return url;
  } catch (error) {
    console.error("[R2] Failed to generate presigned URL:", {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack
    });
    throw new Error(`Failed to generate upload URL: ${error.message}`);
  }
}

/**
 * Generate a presigned GET URL so the browser can download from R2 with authentication.
 * Used for private videos to prevent unauthorized access.
 * The URL expires after the specified time.
 *
 * @param {string} key        — R2 object key
 * @param {number} expiresIn  — expiration time in seconds (default: 1 hour)
 * @returns {Promise<string>} — presigned GET URL
 */
export async function getPresignedDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn });
}
