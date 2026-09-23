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
            // gravity: "auto" uses AI saliency detection to center on the person even in mirror selfies
            { width: 400, height: 400, crop: "fill", gravity: "auto" },
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
    "[Cloudinary] Credentials not configured in .env. Using Groq AI Vision + Sharp smart subject crop for local avatar display."
  );

  try {
    const { default: sharp } = await import("sharp");
    const baseSharp = sharp(buffer).rotate();
    const meta = await baseSharp.metadata();

    let cropRegion = null;
    const subjectCoords = await detectSubjectWithGroqVision(buffer, mimetype);

    if (subjectCoords && meta.width && meta.height) {
      console.log("[Avatar Processing] 🤖 Groq AI Vision subject bounds detected:", subjectCoords);
      const subjTop = (subjectCoords.ymin / 100) * meta.height;
      const subjBottom = (subjectCoords.ymax / 100) * meta.height;
      const subjLeft = (subjectCoords.xmin / 100) * meta.width;
      const subjRight = (subjectCoords.xmax / 100) * meta.width;

      const subjH = Math.max(30, subjBottom - subjTop);
      const subjW = Math.max(30, subjRight - subjLeft);
      const cx = (subjLeft + subjRight) / 2;
      const cy = (subjTop + subjBottom) / 2;

      // Calculate square crop size to fit subject cleanly with modest margin
      let cropSize = Math.round(Math.max(subjH * 1.15, subjW * 1.15));
      cropSize = Math.min(cropSize, meta.width, meta.height);

      // Center crop square around the subject's center position
      let cropTop = Math.round(cy - (cropSize / 2));
      let cropLeft = Math.round(cx - (cropSize / 2));

      // Clamp coordinates cleanly within image boundaries
      cropLeft = Math.max(0, Math.min(meta.width - cropSize, cropLeft));
      cropTop = Math.max(0, Math.min(meta.height - cropSize, cropTop));

      const width = Math.min(meta.width - cropLeft, cropSize);
      const height = Math.min(meta.height - cropTop, cropSize);

      if (width > 40 && height > 40) {
        cropRegion = { left: cropLeft, top: cropTop, width, height };
      }
    }

    let pipeline = sharp(buffer).rotate();
    if (cropRegion) {
      console.log(`[Avatar Processing] 🎯 Smart subject-centered crop [left:${cropRegion.left}, top:${cropRegion.top}, size:${cropRegion.width}x${cropRegion.height}]`);
      pipeline = pipeline.extract(cropRegion).resize(400, 400);
    } else {
      console.log("[Avatar Processing] 🔍 Saliency attention crop for avatar...");
      // Attention strategy automatically finds person/saliency center regardless of wall padding
      pipeline = pipeline.resize(400, 400, {
        fit: "cover",
        position: sharp.strategy.attention,
      });
    }

    const processedBuffer = await pipeline.webp({ quality: 82 }).toBuffer();
    const base64 = processedBuffer.toString("base64");
    const dataUri = `data:image/webp;base64,${base64}`;
    return {
      url: dataUri,
      publicId: null,
    };
  } catch (err) {
    console.warn("[Avatar Processing] sharp smart crop fallback error:", err.message);
    const base64 = buffer.toString("base64");
    const dataUri = `data:${mimetype};base64,${base64}`;
    return {
      url: dataUri,
      publicId: null,
    };
  }
}

/**
 * Detect main subject / person bounding box using Groq AI Vision model
 * Detects humans even in mirror selfies, hidden faces, or off-center compositions.
 * Returns normalized coordinates { ymin, xmin, ymax, xmax } (0..100) or null if unavailable/failed
 */
async function detectSubjectWithGroqVision(buffer, mimetype = "image/jpeg") {
  try {
    const { getVisionModel, getVisionKey, markKeyExhausted, parseRetryAfter } = await import("../ai/groqKeyManager.js");
    const { default: fetch } = await import("node-fetch");

    const apiKey = getVisionKey();
    if (!apiKey) {
      console.log("[Avatar Groq Vision] No vision API key available — using sharp attention saliency crop");
      return null;
    }

    const base64 = buffer.toString("base64");
    const prompt = `You are an AI photo composition assistant framing a social media profile avatar.
Locate the main person or subject in this photo (including mirror selfies, phone-covered faces, or portraits).
Return a JSON object with integer percentage coordinates (0 to 100) enclosing the main person's head, hair, shoulders, and upper body:
{"ymin": integer, "xmin": integer, "ymax": integer, "xmax": integer}

Rules:
1. Locate top of head/hair (ymin) and bottom of shoulders/torso (ymax).
2. Return ONLY strict JSON with no explanation or backticks.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getVisionModel(),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 120,
      }),
    });

    if (res.status === 429) {
      const txt = await res.text();
      const wait = parseRetryAfter(txt) || 5000;
      markKeyExhausted(apiKey, wait);
      console.warn("[Avatar Groq Vision] 429 rate limit hit — using sharp attention saliency crop");
      return null;
    }

    if (!res.ok) return null;

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (
      typeof parsed.ymin === "number" &&
      typeof parsed.xmin === "number" &&
      typeof parsed.ymax === "number" &&
      typeof parsed.xmax === "number" &&
      parsed.xmax > parsed.xmin &&
      parsed.ymax > parsed.ymin
    ) {
      return parsed;
    }
  } catch (err) {
    console.warn("[Avatar Groq Vision] Vision call error:", err.message);
  }
  return null;
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
