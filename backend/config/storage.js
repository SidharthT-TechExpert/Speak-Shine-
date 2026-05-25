/**
 * storage.js — Cloudflare R2 client (S3-compatible)
 * Exports uploadToR2, uploadBufferToR2, deleteFromR2, getR2Key,
 *         getPresignedUploadUrl, getPresignedDownloadUrl
 *
 * IMPORTANT: The S3 client is created lazily (on first use) so that
 * dotenv.config() in server.js has time to load .env before we read
 * process.env.  ES-module imports are hoisted, so top-level code here
 * runs BEFORE server.js body — reading env vars eagerly would pick up
 * stale / empty values.
 */

import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

// ── Lazy-initialised singleton ──────────────────────────────────────────────
let _r2 = null;
let _bucket = null;
let _publicUrl = null;

function getR2Client() {
  if (_r2) return _r2;

  const R2_ENDPOINT        = process.env.R2_ENDPOINT;
  const R2_ACCESS_KEY_ID   = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  _bucket    = process.env.R2_BUCKET_NAME || "speak-shine-videos";
  _publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

  const missing = [];
  if (!R2_ENDPOINT)          missing.push("R2_ENDPOINT");
  if (!R2_ACCESS_KEY_ID)     missing.push("R2_ACCESS_KEY_ID");
  if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!_bucket)              missing.push("R2_BUCKET_NAME");

  if (missing.length > 0) {
    throw new Error(
      `R2 storage is not configured. Missing: ${missing.join(", ")}. ` +
      "Set these environment variables and restart."
    );
  }

  console.log("[R2] Initialising S3 client:", {
    endpoint: R2_ENDPOINT,
    bucket: _bucket,
    accessKeyId: R2_ACCESS_KEY_ID.substring(0, 8) + "...",
    secretKeyLength: R2_SECRET_ACCESS_KEY.length,
  });

  _r2 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  // Strip x-amz-checksum-* headers before signing.
  // R2 doesn't support flexible checksums; leaving them causes SignatureDoesNotMatch.
  _r2.middlewareStack.add(
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

  console.log("[R2] S3 client ready");
  return _r2;
}

function getBucket()    { if (!_bucket)    getR2Client(); return _bucket; }
function getPublicUrl() { if (!_publicUrl && _publicUrl !== "") getR2Client(); return _publicUrl; }

// ── Public helpers ──────────────────────────────────────────────────────────

/**
 * Build a unique R2 object key for a video.
 * Format: videos/{userId}/{date}/{uuid}.{ext}
 */
export function getR2Key(userId, originalName) {
  const ext  = path.extname(originalName || ".webm") || ".webm";
  const date = new Date().toISOString().slice(0, 10);
  const uid  = Math.random().toString(36).slice(2, 10);
  return `videos/${userId}/${date}/${uid}${ext}`;
}

/**
 * Upload a local file to R2.
 * Uses PutObjectCommand (single PUT, up to 5 GB on R2).
 */
export async function uploadToR2(filePath, key, mimeType = "video/webm") {
  const body = fs.readFileSync(filePath);
  await getR2Client().send(new PutObjectCommand({
    Bucket:      getBucket(),
    Key:         key,
    Body:        body,
    ContentType: mimeType,
  }));
  return `${getPublicUrl()}/${key}`;
}

/**
 * Upload a Buffer directly to R2 (avoids writing to a temp file).
 */
export async function uploadBufferToR2(buffer, key, mimeType = "video/mp4") {
  await getR2Client().send(new PutObjectCommand({
    Bucket:      getBucket(),
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
  }));
  return `${getPublicUrl()}/${key}`;
}

/**
 * Delete an object from R2 by key.
 */
export async function deleteFromR2(key) {
  try {
    await getR2Client().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
    console.log(`[R2] Deleted: ${key}`);
  } catch (err) {
    console.log(`[R2] Delete failed (ignored): ${err.message}`);
  }
}

/**
 * Generate a presigned PUT URL so the browser can upload directly to R2.
 * The URL expires in 15 minutes.
 */
export async function getPresignedUploadUrl(key, mimeType = "video/webm") {
  try {
    console.log("[R2] Generating presigned URL - key:", key, "mimeType:", mimeType);

    const command = new PutObjectCommand({
      Bucket:      getBucket(),
      Key:         key,
      ContentType: mimeType,
    });

    const url = await getSignedUrl(getR2Client(), command, { expiresIn: 900 });
    console.log("[R2] Presigned URL generated successfully");
    return url;
  } catch (error) {
    console.error("[R2] Failed to generate presigned URL:", {
      message: error.message,
      code: error.code,
      name: error.name,
    });
    throw new Error(`Failed to generate upload URL: ${error.message}`);
  }
}

/**
 * Generate a presigned GET URL for downloading from R2.
 */
export async function getPresignedDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getSignedUrl(getR2Client(), command, { expiresIn });
}

// Expose client getter for modules that need direct access
export { getR2Client as r2Client };
export { getBucket as BUCKET };
