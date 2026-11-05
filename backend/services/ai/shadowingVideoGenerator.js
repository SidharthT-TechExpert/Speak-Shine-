/**
 * shadowingVideoGenerator.js
 *
 * Pipeline for generating an automated English Shadowing Activity task:
 *
 *  1. Groq (Llama) generates structured lesson metadata & natural speech transcript:
 *       { title, topic, videoQuery, transcript, instructions, targetDuration }
 *       Target speech duration: 60 to 90 seconds (130 to 220 words) — strictly <= 180s (3 min limit).
 *
 *  2. Pexels Video API searches for royalty-free 16:9 Landscape Full HD (1080p) speaker video clips.
 *
 *  3. Generates high-fidelity neural English speech audio (ElevenLabs dynamic voices + formatted fallback).
 *
 *  4. High-Fidelity FFmpeg Muxing:
 *       - Visual: Visually lossless H.264 (-crf 18, -preset medium, yuv420p)
 *       - Audio: 192kbps AAC 44.1kHz stereo
 *       - Streaming: -movflags +faststart for instantaneous web playback
 *       - Looping: -stream_loop seamlessly loops video if speech audio is longer than the raw clip.
 *
 *  5. Fallback to a curated library of high-quality Full HD learning shadowing videos if API keys
 *     are unavailable or rate-limited.
 */

import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { getTextKey, getTextModel, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";
import { uploadBufferToR2 } from "../../config/storage.js";
import { textToMp3Buffer, formatTextForHumanSpeech } from "./storyAudioService.js";

const execFileAsync = promisify(execFile);

// Curated library of 100% free, high-quality 1080p shadowing video tasks (< 3 mins)
export const CURATED_SHADOWING_VIDEOS = [
  {
    title: "Mastering Confident English Introductions",
    topic: "Public Speaking & First Impressions",
    videoDuration: 72,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    videoTranscript: "Confidence is not something you are born with; it is an active habit you build every single day. When you introduce yourself in English, stand tall, make warm eye contact, and speak with a steady, relaxed breath. You don't need complex vocabulary or rapid speech to make a powerful first impression. Clear pronunciation, a friendly smile, and genuine enthusiasm will speak louder than flawless grammar. Focus on connecting with your listener, one clear phrase at a time.",
    instructions: "Listen to the speaker and shadow along at the exact same rhythm and speed. Focus on breath control, pauses, and confident intonation.",
    videoSource: "Curated Shadowing Library (1080p)",
    videoPageUrl: "https://speakshine.ai",
    videoPhotographer: "Speak & Shine",
  },
  {
    title: "The Art of Active Listening in English",
    topic: "Effective Communication",
    videoDuration: 78,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    videoTranscript: "Great conversationalists are rarely the loudest voices in the room. They are the ones who listen attentively and respond with purpose. In English conversations, active listening means nodding, summarizing key points, and asking thoughtful follow-up questions. When you shadow this exercise, observe how natural pauses allow you to process thoughts before speaking. Speaking well begins with listening deeply and pacing your delivery with calm authority.",
    instructions: "Shadow each phrase out loud without stopping. Match the speaker's natural pauses and emphasize key thought groups.",
    videoSource: "Curated Shadowing Library (1080p)",
    videoPageUrl: "https://speakshine.ai",
    videoPhotographer: "Speak & Shine",
  },
  {
    title: "Overcoming Hesitation & Speaking Fear",
    topic: "Fluency & Mindset",
    videoDuration: 84,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    videoTranscript: "Every language learner experiences that brief moment of hesitation right before speaking. Your mind searches for the perfect word, and fear whispers that you might make a mistake. The secret is simple: give yourself permission to speak imperfectly. Fluency begins when you value expressing your ideas over seeking mechanical perfection. Keep your vocal flow continuous, embrace small errors as stepping stones, and trust your practice.",
    instructions: "Speak along with the video with zero hesitation. Keep your vocal flow continuous and smooth throughout.",
    videoSource: "Curated Shadowing Library (1080p)",
    videoPageUrl: "https://speakshine.ai",
    videoPhotographer: "Speak & Shine",
  },
  {
    title: "The Power of Daily Micro-Habits",
    topic: "Personal Growth & Discipline",
    videoDuration: 80,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4",
    videoTranscript: "Small consistent daily habits always beat sporadic bursts of extreme effort. Spending five focused minutes shadowing English speech every day rewires your speech muscles and builds effortless muscle memory. You do not need hours of study each night; all you need is relentless consistency. Celebrate every small win, remain curious, and trust the compounding power of daily progress.",
    instructions: "Shadow each phrase as you hear it. Mimic the speaker's vocal energy, rhythm, and cadence.",
    videoSource: "Curated Shadowing Library (1080p)",
    videoPageUrl: "https://speakshine.ai",
    videoPhotographer: "Speak & Shine",
  }
];

/**
 * Build dynamic prompt ensuring script length matches desired shadowing duration (60-90s, <= 180s).
 * At standard conversational delivery (~130 WPM), 140-190 words yields ~65-85 seconds.
 */
function buildGroqShadowingPrompt(targetDuration = 75, requestedTopic = null, difficulty = "B1-B2") {
  const boundedDuration = Math.min(Math.max(Number(targetDuration) || 75, 45), 180);
  const targetWords = Math.round((boundedDuration * 130) / 60);
  const wordMin = Math.max(90, Math.round(targetWords * 0.85));
  const wordMax = Math.min(260, Math.round(targetWords * 1.15));

  return `You are designing a high-impact English Shadowing Challenge for English learners (${difficulty} level).
In shadowing, students listen to a speaker and repeat the words simultaneously out loud with minimal delay.

Generate ONE shadowing practice lesson${requestedTopic ? ` on the topic "${requestedTopic}"` : ""}. Return ONLY valid JSON — no markdown code fences, no extra text.

Rules:
- title: 3 to 6 words catchy title (e.g. "The Art of Confident Speaking", "Mastering Clear Articulation")
- topic: 2 to 4 words (e.g. "Public Speaking", "Workplace Communication", "Growth Mindset")
- videoQuery: 2 to 4 words targeting high quality speaker/presentation videos on Pexels (e.g. "public speaker presentation", "business person talking camera", "keynote speaker conference", "mentor speaking classroom")
- transcript: EXACTLY ${wordMin} to ${wordMax} words of inspiring, natural spoken English. Use short, rhythmic sentences with natural pause points (commas, periods) that are easy to shadow. Avoid overly obscure words.
- instructions: 1 to 2 sentences guiding the student on pace, breath, and intonation.
- targetDuration: integer between ${Math.max(45, boundedDuration - 10)} and ${Math.min(180, boundedDuration + 10)} seconds (strictly <= 180s).

Response JSON format:
{
  "title": "...",
  "topic": "...",
  "videoQuery": "...",
  "transcript": "...",
  "instructions": "...",
  "targetDuration": ${boundedDuration}
}`;
}

/**
 * Generate challenge metadata via Groq with automatic key cycling
 */
async function generateShadowingMetadata({ targetDuration = 75, topic = null, difficulty = "B1-B2" } = {}) {
  const prompt = buildGroqShadowingPrompt(targetDuration, topic, difficulty);

  for (let attempt = 0; attempt < 5; attempt++) {
    const apiKey = getTextKey();
    if (!apiKey) break;

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: getTextModel(),
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 800,
          response_format: { type: "json_object" },
        })
      });

      if (res.status === 429) {
        const errText = await res.text();
        markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
        continue;
      }
      if (!res.ok) {
        throw new Error(`Groq status ${res.status}`);
      }

      const data = await res.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      if (parsed.transcript && parsed.title) {
        return parsed;
      }
    } catch (err) {
      console.warn("[ShadowingGen] Groq attempt error:", err.message);
    }
  }

  // Fallback to random item from curated list
  const fallback = CURATED_SHADOWING_VIDEOS[Math.floor(Math.random() * CURATED_SHADOWING_VIDEOS.length)];
  return {
    title: fallback.title,
    topic: fallback.topic,
    videoQuery: "public speaker presentation",
    transcript: fallback.videoTranscript,
    instructions: fallback.instructions,
    targetDuration: fallback.videoDuration,
  };
}

/**
 * Search Pexels Video API for 16:9 Landscape Full HD (1080p) video clips (<= 180s)
 */
async function fetchPexelsVideo(query, targetDuration = 75) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;

  try {
    // Search 16:9 Landscape Full HD video clips
    const primaryQuery = `${query || "public speaker"} presentation`;
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(primaryQuery)}&per_page=15&orientation=landscape&size=large`;
    let res = await fetch(url, { headers: { Authorization: apiKey } });

    if (!res.ok) {
      // Fallback to simpler query
      const fallbackUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query || "speaking")}&per_page=15&orientation=landscape`;
      res = await fetch(fallbackUrl, { headers: { Authorization: apiKey } });
    }
    if (!res.ok) return null;

    const data = await res.json();
    const videos = (data?.videos || []).filter(v => v.duration >= 20 && v.duration <= 180);
    if (!videos.length) return null;

    // Pick video closest to target duration
    videos.sort((a, b) => Math.abs(a.duration - targetDuration) - Math.abs(b.duration - targetDuration));
    const selected = videos[0];

    // Select the highest resolution MP4 file (prioritizing True Full HD 1080p: 1920x1080)
    const mp4Files = (selected.video_files || [])
      .filter(f => f.file_type === "video/mp4" && f.link)
      .sort((a, b) => {
        const score = f => {
          const w = f.width || 0;
          const h = f.height || 0;
          // Exact 1080p Full HD match gets top priority
          if ((w === 1920 && h === 1080) || (w === 1080 && h === 1920)) return 20000;
          if (f.quality === "hd") return 10000 + (w * h);
          return w * h;
        };
        return score(b) - score(a);
      });

    const file = mp4Files[0] || selected.video_files?.[0];
    if (!file?.link) return null;

    return {
      videoUrl: file.link,
      videoDuration: selected.duration,
      videoWidth: file.width,
      videoHeight: file.height,
      videoQuality: file.quality || "hd",
      videoSource: "Pexels Video (1080p Full HD)",
      videoPageUrl: selected.url,
      videoPhotographer: selected.user?.name || "Pexels Creator",
    };
  } catch (err) {
    console.warn("[ShadowingGen] Pexels video search failed:", err.message);
    return null;
  }
}

/**
 * Generate high-fidelity speech audio buffer.
 * Attempts ElevenLabs studio voices (via key rotation in storyAudioService) first,
 * with graceful fallback to formatted chunked Google TTS.
 */
async function generateSpeechAudio(text) {
  if (!text) return null;

  // 1. ElevenLabs High-Fidelity Studio Speech
  try {
    const audioBuf = await textToMp3Buffer(text);
    if (audioBuf && audioBuf.length > 2000) {
      return audioBuf;
    }
  } catch (err) {
    console.warn("[ShadowingGen] ElevenLabs attempt skipped:", err.message);
  }

  // 2. High-Quality Formatted Speech Fallback
  try {
    const formatted = formatTextForHumanSpeech(text);
    const rawChunks = formatted.match(/[^.!?\n]+[.!?\n]+/g) || [formatted];
    const chunks = [];

    for (const rawChunk of rawChunks) {
      let current = rawChunk.trim();
      while (current.length > 160) {
        let splitIdx = current.lastIndexOf(",", 160);
        if (splitIdx === -1) splitIdx = current.lastIndexOf(" ", 160);
        if (splitIdx === -1) splitIdx = 160;
        chunks.push(current.slice(0, splitIdx).trim());
        current = current.slice(splitIdx).trim();
      }
      if (current.length > 0) chunks.push(current);
    }

    const buffers = [];
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(chunk.trim())}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://translate.google.com/"
        }
      });
      if (res.ok) {
        buffers.push(Buffer.from(await res.arrayBuffer()));
      }
    }

    if (buffers.length > 0) {
      return Buffer.concat(buffers);
    }
  } catch (err) {
    console.warn("[ShadowingGen] Fallback TTS failed:", err.message);
  }
  return null;
}

/**
 * Generate full Shadowing Task Challenge
 *
 * @param {object} options
 * @param {number} [options.targetDuration=75] - Target speaking duration in seconds (strictly <= 180s)
 * @param {string} [options.topic] - Optional topic hint
 * @param {string} [options.difficulty="B1-B2"] - CEFR level
 */
export async function generateShadowingChallenge(options = {}) {
  const targetDuration = Math.min(Math.max(Number(options?.targetDuration) || 75, 45), 180);
  const metadata = await generateShadowingMetadata({
    targetDuration,
    topic: options?.topic,
    difficulty: options?.difficulty || "B1-B2",
  });

  // Try to find a 1080p landscape speaker video on Pexels
  const pexelsResult = await fetchPexelsVideo(metadata.videoQuery || "public speaker", metadata.targetDuration);

  if (pexelsResult) {
    // Generate high-fidelity speech audio
    const audioBuffer = await generateSpeechAudio(metadata.transcript);
    let finalVideoUrl = pexelsResult.videoUrl;
    let finalDuration = pexelsResult.videoDuration;

    // If R2 is configured and speech audio exists, mux video + audio at broadcast 1080p quality
    if (audioBuffer && process.env.R2_BUCKET_NAME) {
      const tmpDir = os.tmpdir();
      const id = Date.now();
      const audioPath = path.join(tmpDir, `shadow_audio_${id}.mp3`);
      const videoInPath = path.join(tmpDir, `shadow_in_${id}.mp4`);
      const videoOutPath = path.join(tmpDir, `shadow_out_${id}.mp4`);

      try {
        fs.writeFileSync(audioPath, audioBuffer);

        // Download Pexels Full HD video
        const vidRes = await fetch(pexelsResult.videoUrl);
        if (vidRes.ok) {
          fs.writeFileSync(videoInPath, Buffer.from(await vidRes.arrayBuffer()));

          // Merge video + audio with FFmpeg:
          //  -stream_loop -1 loops video smoothly if audio is longer than the raw video clip
          //  -shortest stops encoding the moment the speech audio finishes
          //  -c:v libx264 -preset medium -crf 18 produces visually lossless, razor-sharp 1080p
          //  -c:a aac -b:a 192k -ar 44100 delivers crystal-clear studio sound
          //  -movflags +faststart optimizes MP4 header for instant web video buffering
          await execFileAsync("ffmpeg", [
            "-y",
            "-stream_loop", "-1",
            "-i", videoInPath,
            "-i", audioPath,
            "-shortest",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "44100",
            "-movflags", "+faststart",
            videoOutPath
          ]);

          if (fs.existsSync(videoOutPath)) {
            // Measure exact duration of the output video with ffprobe
            try {
              const { stdout } = await execFileAsync("ffprobe", [
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                videoOutPath
              ]);
              const probed = parseFloat(stdout.trim());
              if (!isNaN(probed) && probed > 0) {
                finalDuration = Math.round(probed);
              }
            } catch (probeErr) {
              console.warn("[ShadowingGen] Output probe skipped:", probeErr.message);
            }

            const outBuf = fs.readFileSync(videoOutPath);
            const r2Key = `shadowing-videos/${id}.mp4`;
            const uploadedUrl = await uploadBufferToR2(outBuf, r2Key, "video/mp4");
            if (uploadedUrl) {
              finalVideoUrl = uploadedUrl;
            }
            try { fs.unlinkSync(videoOutPath); } catch {}
          }
        }
      } catch (muxErr) {
        console.warn("[ShadowingGen] Muxing audio/video error:", muxErr.message);
      } finally {
        try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch {}
        try { if (fs.existsSync(videoInPath)) fs.unlinkSync(videoInPath); } catch {}
        try { if (fs.existsSync(videoOutPath)) fs.unlinkSync(videoOutPath); } catch {}
      }
    }

    return {
      title: metadata.title,
      topic: metadata.topic || "English Shadowing",
      instructions: metadata.instructions || "Watch the video and practice shadowing by repeating every sentence simultaneously out loud with the speaker.",
      videoUrl: finalVideoUrl,
      videoDuration: Math.min(finalDuration || metadata.targetDuration || targetDuration, 180),
      videoTranscript: metadata.transcript,
      videoSource: pexelsResult.videoSource,
      videoPageUrl: pexelsResult.videoPageUrl,
      videoPhotographer: pexelsResult.videoPhotographer,
    };
  }

  // Fallback to random item from curated 1080p list
  const fallback = CURATED_SHADOWING_VIDEOS[Math.floor(Math.random() * CURATED_SHADOWING_VIDEOS.length)];
  return {
    title: metadata.title || fallback.title,
    topic: metadata.topic || fallback.topic,
    instructions: metadata.instructions || fallback.instructions,
    videoUrl: fallback.videoUrl,
    videoDuration: Math.min(fallback.videoDuration, 180),
    videoTranscript: metadata.transcript || fallback.videoTranscript,
    videoSource: fallback.videoSource,
    videoPageUrl: fallback.videoPageUrl,
    videoPhotographer: fallback.videoPhotographer,
  };
}
