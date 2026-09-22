/**
 * Cloudinary Storage Service
 * Handles uploading, optimizing, and deleting profile photos via Cloudinary.
 * Falls back gracefully to base64 data URIs if Cloudinary keys are not yet configured.
 */

import { v2 as cloudinary } from "cloudinary";

let isCloudinaryConfigured = false;

function initCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  if (cloudinaryUrl) {
    cloudinary.config({ url: cloudinaryUrl });
    isCloudinaryConfigured = true;
    console.log("[Cloudinary] Configured via CLOUDINARY_URL");
  } else if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    isCloudinaryConfigured = true;
    console.log(`[Cloudinary] Configured for cloud: ${cloudName}`);
  } else {
    isCloudinaryConfigured = false;
  }
}

// Initial initialization attempt
initCloudinary();

/**
 * Check if Cloudinary is active
 */
export function isConfigured() {
  if (!isCloudinaryConfigured) {
    // Re-check in case environment variables were loaded dynamically
    initCloudinary();
  }
  return isCloudinaryConfigured;
}

/**
 * Uploads an avatar image buffer to Cloudinary.
 * Resizes to 400x400 with face-detection auto-crop and WebP/auto format optimization.
 * 
 * @param {Buffer} buffer - Raw file buffer from Multer
 * @param {string} userId - User or Auth ID for folder tagging
 * @param {string} [mimetype="image/jpeg"] - Image MIME type
 * @returns {Promise<{ url: string, publicId?: string }>}
 */
export async function uploadAvatar(buffer, userId, mimetype = "image/jpeg") {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Invalid image data provided for upload");
  }

  if (isConfigured()) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "speak-shine/avatars",
          public_id: `avatar_${userId}_${Date.now()}`,
          transformation: [
            { width: 400, height: 400, crop: "fill", gravity: "face" },
            { quality: "auto", fetch_format: "auto" },
          ],
          resource_type: "image",
        },
        (error, result) => {
          if (error) {
            console.error("[Cloudinary] Upload failed:", error);
            reject(new Error(error.message || "Failed to upload avatar to Cloudinary"));
          } else {
            console.log(`[Cloudinary] ✅ Uploaded avatar successfully: ${result.secure_url}`);
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
            });
          }
        }
      );
      uploadStream.end(buffer);
    });
  }

  // Graceful fallback when Cloudinary is not yet configured in .env
  console.warn(
    "[Cloudinary] Credentials not configured in .env. Falling back to inline data URL for avatar. " +
    "Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to your .env file."
  );
  const base64 = buffer.toString("base64");
  const dataUri = `data:${mimetype};base64,${base64}`;
  return {
    url: dataUri,
    publicId: null,
  };
}

/**
 * Deletes an old avatar from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 */
export async function deleteAvatar(publicId) {
  if (!publicId || !isConfigured()) return;
  try {
    await cloudinary.uploader.destroy(publicId);
    console.log(`[Cloudinary] 🗑️ Deleted old avatar: ${publicId}`);
  } catch (err) {
    console.warn("[Cloudinary] Failed to delete avatar:", err.message);
  }
}
