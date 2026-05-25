/**
 * storage.js — Cloudflare R2 client (S3-compatible)
 * Exports uploadToR2, deleteFromR2, getR2Key, getPresignedUploadUrl
 */

import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

// Validate R2 configuration but don't crash - just warn
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET_NAME || "speak-shine-videos";
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

let r2ConfigValid = true;
const missingVars = [];

if (!R2_ENDPOINT) missingVars.push("R2_ENDPOINT");
if (!R2_ACCESS_KEY_ID) missingVars.push("R2_ACCESS_KEY_ID");
if (!R2_SECRET_ACCESS_KEY) missingVars.push("R2_SECRET_ACCESS_KEY");
if (!BUCKET) missingVars.push("R2_BUCKET_NAME");

if (missingVars.length > 0) {
  console.error("[R2] ⚠️  WARNING: Missing R2 configuration:", missingVars.join(", "));
  console.error("[R2] Video upload functionality will not work until these are set.");
  r2ConfigValid = false;
} else {
  console.log("[R2] ✅ Configuration loaded:", {
    endpoint: R2_ENDPOINT,
    bucket: BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID?.substring(0, 8) + "...",
    secretKeyLength: R2_SECRET_ACCESS_KEY?.length
  });
}

// Create S3 client only if config is valid
let r2 = null;
if (r2ConfigValid) {
  try {
    r2 = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    // Strip x-amz-checksum-* headers before signing.
    // R2 doesn't support flexible checksums; leaving them causes SignatureDoesNotMatch.
    r2.middlewareStack.add(
      (next) => async (args) => {
        if (args.request && args.request.headers) {
          for (const h of Object.keys(args.request.headers)) {
            if (h.startsWith("x-amz-checksum-")) {
              delete args.request.headers[h];
            }
          }
        }
        return next(args);
      },
      { step: "build", name: "r2StripChecksumHeaders", priority: "low" }
    );

    console.log("[R2] ✅ S3 client initialized successfully");
  } catch (error) {
    console.error("[R2] ❌ Failed to initialize S3 client:", error.message);
    r2ConfigValid = false;
  }
}

/**
 * Check if R2 is properly configured
 */
function ensureR2Configured() {
  if (!r2ConfigValid || !r2) {
    throw new Error("R2 storage is not configured. Please set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME environment variables.");
  }
}

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
 * Upload a local file to R2.
 * Uses PutObjectCommand (single PUT, up to 5 GB on R2) instead of multipart
 * to avoid checksum / signing issues with Cloudflare R2.
 *
 * @param {string} filePath   — local temp file path
 * @param {string} key        — R2 object key (from getR2Key)
 * @param {string} mimeType   — e.g. "video/webm"
 * @returns {Promise<string>} — public URL
 */
export async function uploadToR2(filePath, key, mimeType = "video/webm") {
  ensureR2Configured();

  const body = fs.readFileSync(filePath);
  await r2.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        body,
    ContentType: mimeType,
  }));
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Upload a Buffer directly to R2 (avoids writing to a temp file).
 *
 * @param {Buffer} buffer
 * @param {string} key
 * @param {string} mimeType
 * @returns {Promise<string>} — public URL
 */
export async function uploadBufferToR2(buffer, key, mimeType = "video/mp4") {
  ensureR2Configured();

  await r2.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
  }));
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Delete an object from R2 by key.
 * Silently ignores errors (object may already be expired/deleted).
 *
 * @param {string} key — R2 object key
 */
export async function deleteFromR2(key) {
  ensureR2Configured();
  
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
  ensureR2Configured();
  
  try {
    console.log("[R2] Generating presigned URL - key:", key, "mimeType:", mimeType);
    
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key:    key,
    });
    
    const url = await getSignedUrl(r2, command, { expiresIn: 900 });
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
  ensureR2Configured();
  
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn });
}

// Re-export the shared r2 client for modules that need direct access
export { r2 as r2Client, BUCKET };
