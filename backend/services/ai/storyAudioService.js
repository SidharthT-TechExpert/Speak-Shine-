/**
 * storyAudioService.js
 *
 * Generates an MP3 audio file from story text using ElevenLabs TTS,
 * then uploads it to Cloudflare R2 under story-audio/ folder.
 *
 * Supports dynamic character voices (Rachel, Emily, Nicole, Josh, Sam, Adam, George)
 * and tailored acoustic parameters (stability, style) for authentic human expression.
 *
 * Uses the ElevenLabs key manager (min-heap rotation) so multiple keys
 * are cycled automatically on rate-limit / quota / transient errors.
 *
 * Environment variables:
 *   ELEVENLABS_API_KEYS  — comma-separated list of keys (preferred)
 *   ELEVENLABS_API_KEY   — single key (fallback / backwards-compat)
 */

import fetch from "node-fetch";
import { uploadBufferToR2 } from "../../config/storage.js";
import {
  getKey,
  markRateLimited,
  markInvalid,
  markTransientError,
  parseRetryAfter,
} from "./elevenLabsKeyManager.js";
import { findVoice, analyzeStoryVoice, STORY_VOICES } from "./storyVoiceAnalyzer.js";

// Fallback voice if none specified or matched
const DEFAULT_VOICE_ID = STORY_VOICES.adam.id;

const MAX_ATTEMPTS = 8; // try up to 8 key-switches before giving up

/**
 * Convert text to an MP3 Buffer using ElevenLabs TTS.
 * Rotates keys automatically on 429 / 401 / 403 / 5xx.
 *
 * @param {string} text - The script to read
 * @param {string} [voiceId] - ElevenLabs Voice ID
 * @param {object} [customVoiceSettings] - Stability, style, etc.
 */
async function textToMp3Buffer(text, voiceId = DEFAULT_VOICE_ID, customVoiceSettings = null) {
  let lastError = null;

  // Selected voice configuration
  const voiceMeta = findVoice(voiceId);
  const settings = {
    stability: customVoiceSettings?.stability ?? voiceMeta?.defaultSettings?.stability ?? 0.35,
    similarity_boost: customVoiceSettings?.similarity_boost ?? 0.75,
    style: customVoiceSettings?.style ?? voiceMeta?.defaultSettings?.style ?? 0.45,
    use_speaker_boost: true,
  };

  let targetVoiceId = voiceId || DEFAULT_VOICE_ID;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const apiKey = getKey();

    if (!apiKey) {
      throw new Error(
        "All ElevenLabs API keys are exhausted or on cooldown. " +
        "Add more keys via ELEVENLABS_API_KEYS or wait for cooldown to expire."
      );
    }

    let res;
    try {
      res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: settings,
        }),
      });
    } catch (networkErr) {
      // Network-level failure (DNS, timeout, etc.)
      console.warn(`[StoryAudio] Network error on attempt ${attempt + 1}:`, networkErr.message);
      markTransientError(apiKey);
      lastError = networkErr;
      continue;
    }

    // ── Success ──────────────────────────────────────────────────────────────
    if (res.ok) {
      return Buffer.from(await res.arrayBuffer());
    }

    // ── Handle error status codes ─────────────────────────────────────────────
    const errText = await res.text().catch(() => "");
    let detail = errText;
    try { detail = JSON.parse(errText)?.detail?.message || errText; } catch {}

    if (res.status === 429) {
      // Rate limited — use Retry-After header if present
      const retryAfter = parseRetryAfter(res.headers.get("Retry-After")) || 60;
      markRateLimited(apiKey, retryAfter);
      lastError = new Error(`Rate limited (429): ${detail}`);
      continue; // try next key
    }

    if (res.status === 402) {
      // Free users cannot use library voices via the API, or account quota reached
      console.warn(`[StoryAudio] ElevenLabs 402 error: ${detail}`);
      if (targetVoiceId !== DEFAULT_VOICE_ID) {
        console.warn(`[StoryAudio] Voice "${targetVoiceId}" is restricted on free tier. Automatically retrying with Adam (${DEFAULT_VOICE_ID})...`);
        targetVoiceId = DEFAULT_VOICE_ID;
        settings.stability = 0.42;
        settings.style = 0.35;
        continue; // Retry with Adam using the same key
      }
      // If Adam also fails with 402, this key's monthly free characters are exhausted
      markInvalid(apiKey);
      lastError = new Error(`ElevenLabs quota or tier limit (402): ${detail}`);
      continue; // Try next key in rotation
    }

    if (res.status === 401 || res.status === 403) {
      // Invalid key or quota exceeded
      markInvalid(apiKey);
      lastError = new Error(`Auth/quota error (${res.status}): ${detail}`);
      continue; // try next key
    }

    if (res.status >= 500) {
      // ElevenLabs server error — short cooldown then retry
      markTransientError(apiKey);
      lastError = new Error(`ElevenLabs server error (${res.status}): ${detail}`);
      continue;
    }

    // 4xx client errors other than 401/403/429 are not retryable
    throw new Error(`ElevenLabs API error ${res.status}: ${detail}`);
  }

  throw new Error(
    `ElevenLabs TTS failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastError?.message}`
  );
}

/**
 * Generate TTS audio for a story and upload to R2.
 * Automatically analyzes story character and adapts voice if voiceId is not specified.
 *
 * @param {string} storyText - The story text to convert to audio
 * @param {string} [topic]   - Used to build the R2 filename slug
 * @param {string} [voiceId] - Optional specific ElevenLabs voice ID or key
 * @param {object} [voiceSettings] - Optional custom stability/style
 * @param {object} [characterHint] - Optional metadata from story generation
 * @returns {Promise<{ audioUrl: string, voiceUsed: object }>} Public URL and voice metadata
 */
export async function generateAndUploadStoryAudio(
  storyText,
  topic = "story",
  voiceId = null,
  voiceSettings = null,
  characterHint = null
) {
  if (!storyText || storyText.trim().length < 10) {
    throw new Error("Story text is too short to generate audio");
  }

  // Determine which voice to use
  let selectedVoiceId = voiceId;
  let selectedSettings = voiceSettings;
  let voiceProfile = null;

  if (selectedVoiceId) {
    voiceProfile = findVoice(selectedVoiceId);
    if (voiceProfile) selectedVoiceId = voiceProfile.id;
  } else {
    // Automatically analyze character and select the most adaptable voice
    console.log(`[StoryAudio] Analyzing story to pick optimal character voice…`);
    const analysis = await analyzeStoryVoice(storyText, characterHint);
    selectedVoiceId = analysis.voiceId;
    selectedSettings = selectedSettings || analysis.voiceSettings;
    voiceProfile = analysis;
    console.log(`[StoryAudio] 🎭 Matched voice: ${analysis.voiceName} (${analysis.vibe}) for character "${analysis.characterName}" — ${analysis.reason}`);
  }

  const voiceName = voiceProfile?.name || voiceProfile?.voiceName || "Adam";
  console.log(`[StoryAudio] Generating TTS for "${topic}" using voice: ${voiceName} (${storyText.length} chars)…`);

  const mp3Buffer = await textToMp3Buffer(storyText, selectedVoiceId, selectedSettings);
  console.log(`[StoryAudio] TTS done — ${(mp3Buffer.length / 1024).toFixed(1)} KB. Uploading to R2…`);

  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const key = `story-audio/${slug}-${Date.now()}.mp3`;

  const publicUrl = await uploadBufferToR2(mp3Buffer, key, "audio/mpeg");
  console.log(`[StoryAudio] Uploaded: ${publicUrl}`);

  return {
    audioUrl: publicUrl,
    voiceUsed: {
      id: selectedVoiceId,
      name: voiceName,
      character: voiceProfile?.characterName || characterHint?.name || null,
      mood: voiceProfile?.mood || null,
      vibe: voiceProfile?.vibe || null,
      reason: voiceProfile?.reason || null,
    },
  };
}
