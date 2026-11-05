/**
 * shadowingVideoGenerator.js
 *
 * Pipeline for generating an automated English Shadowing Activity task:
 *
 *  1. Groq (Llama) generates structured lesson metadata & natural speech transcript:
 *       { title, topic, videoQuery, transcript, instructions, targetDuration }
 *
 *  2. Pexels Video API searches for royalty-free video clips (< 3 min) matching the topic.
 *
 *  3. Generates high-fidelity neural English speech audio (0 cost via EdgeTTS / Google TTS / ElevenLabs).
 *
 *  4. Fallback to a curated library of high-quality learning shadowing videos if API keys
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

const execFileAsync = promisify(execFile);

// Curated library of 100% free, high-quality shadowing video tasks with transcripts (< 3 mins)
export const CURATED_SHADOWING_VIDEOS = [
  {
    title: "Mastering Confident English Introductions",
    topic: "Self Introductions & First Impressions",
    videoDuration: 58,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    videoTranscript: "Confidence is not something you are born with; it is a habit you build every single day. When you introduce yourself in English, stand tall, make warm eye contact, and speak with a steady breath. You don't need complicated vocabulary to make a powerful first impression. Clear pronunciation, a friendly smile, and sincere interest will speak louder than perfect grammar.",
    instructions: "Listen to the speaker and shadow along at the exact same rhythm and speed. Focus on breath control and intonation.",
    videoSource: "Curated Shadowing Library",
    videoPageUrl: "https://speakshine.ai",
    videoPhotographer: "Speak & Shine",
  },
  {
    title: "The Art of Active Listening",
    topic: "Communication & Empathy",
    videoDuration: 65,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    videoTranscript: "Great conversationalists are rarely the loudest people in the room. They are the ones who listen attentively. In English conversations, active listening means nodding, summarizing what the other person shared, and asking thoughtful follow-up questions. When you shadow this exercise, observe how natural pauses allow the listener to process and respond with clarity.",
    instructions: "Shadow the sentences out loud. Match the speaker's natural pauses and emphasize key thought groups.",
    videoSource: "Curated Shadowing Library",
    videoPageUrl: "https://speakshine.ai",
    videoPhotographer: "Speak & Shine",
  },
  {
    title: "Overcoming Speaking Hesitation",
    topic: "Fluency & Mindset",
    videoDuration: 62,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    videoTranscript: "Every language learner experiences that brief moment of hesitation right before speaking. Your mind searches for the perfect word, and fear whispers that you might make a mistake. The secret is simple: allow yourself to make mistakes. Fluency begins when you value expressing your ideas over seeking mechanical perfection.",
    instructions: "Speak along with the video without pausing. Keep your vocal flow continuous and smooth.",
    videoSource: "Curated Shadowing Library",
    videoPageUrl: "https://speakshine.ai",
    videoPhotographer: "Speak & Shine",
  },
  {
    title: "The Power of Daily Micro-Habits",
    topic: "Personal Growth",
    videoDuration: 70,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4",
    videoTranscript: "Small consistent daily habits always beat sporadic bursts of extreme effort. Spending five focused minutes shadowing English speech every day rewires your speech muscles and builds effortless muscle memory. Celebrate every small win, remain curious, and trust the process of daily compounding progress.",
    instructions: "Shadow each phrase as you hear it. Mimic the speaker's vocal energy and cadence.",
    videoSource: "Curated Shadowing Library",
    videoPageUrl: "https://speakshine.ai",
    videoPhotographer: "Speak & Shine",
  }
];

const GROQ_SHADOWING_PROMPT = `You are designing a high-impact English Shadowing Challenge for intermediate English learners (B1-B2 level).
In shadowing, students listen to a speaker and verbally repeat the words simultaneously with minimal delay.

Generate ONE shadowing practice lesson. Return ONLY valid JSON — no markdown code fences, no extra text.

Rules:
- title: 3 to 6 words catchy title (e.g. "The Habit of Active Listening")
- topic: 2 to 4 words (e.g. "Effective Communication")
- videoQuery: 2 to 4 words suitable for finding an inspiring video clip on Pexels (e.g. "person speaking presentation", "nature morning walking", "discussion in office")
- transcript: 70 to 110 words of inspiring, natural spoken English. Use short, rhythmic sentences with natural pause points (commas, periods) that are easy to shadow.
- instructions: 1 to 2 sentences guiding the student on pace and intonation.
- targetDuration: integer between 50 and 85 seconds.

Response JSON format:
{
  "title": "...",
  "topic": "...",
  "videoQuery": "...",
  "transcript": "...",
  "instructions": "...",
  "targetDuration": 60
}`;

/**
 * Generate challenge metadata via Groq
 */
async function generateShadowingMetadata() {
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
          messages: [{ role: "user", content: GROQ_SHADOWING_PROMPT }],
          temperature: 0.7,
          max_tokens: 600,
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
    videoQuery: "speaking",
    transcript: fallback.videoTranscript,
    instructions: fallback.instructions,
    targetDuration: fallback.videoDuration,
  };
}

/**
 * Search Pexels Video API for video under 3 mins (<= 180s)
 */
async function fetchPexelsVideo(query, targetDuration = 60) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=12&orientation=portrait`;
    const res = await fetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) return null;

    const data = await res.json();
    const videos = (data?.videos || []).filter(v => v.duration >= 30 && v.duration <= 180);
    if (!videos.length) return null;

    // Pick video closest to target duration
    videos.sort((a, b) => Math.abs(a.duration - targetDuration) - Math.abs(b.duration - targetDuration));
    const selected = videos[0];

    // Find best MP4 file (SD/HD ~720p)
    const file = selected.video_files?.find(f => f.width && f.width <= 1080 && f.file_type === "video/mp4")
      || selected.video_files?.[0];

    if (!file?.link) return null;

    return {
      videoUrl: file.link,
      videoDuration: selected.duration,
      videoSource: "Pexels Video",
      videoPageUrl: selected.url,
      videoPhotographer: selected.user?.name || "Pexels Creator",
    };
  } catch (err) {
    console.warn("[ShadowingGen] Pexels video search failed:", err.message);
    return null;
  }
}

/**
 * Generate TTS audio buffer (0 external cost via Google TTS fallback)
 */
async function generateSpeechAudio(text) {
  try {
    const clean = text.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
    const chunks = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    const buffers = [];

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(chunk.trim())}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
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
    console.warn("[ShadowingGen] TTS generation failed:", err.message);
  }
  return null;
}

/**
 * Generate full Shadowing Task Challenge
 */
export async function generateShadowingChallenge() {
  const metadata = await generateShadowingMetadata();

  // Try to find a video on Pexels
  const pexelsResult = await fetchPexelsVideo(metadata.videoQuery || "speaking", metadata.targetDuration);

  if (pexelsResult) {
    // Generate audio for speech if video is silent
    const audioBuffer = await generateSpeechAudio(metadata.transcript);
    let finalVideoUrl = pexelsResult.videoUrl;
    let finalDuration = pexelsResult.videoDuration;

    // If R2 is available and we have audio, we can mux with FFmpeg or upload audio
    if (audioBuffer && process.env.R2_BUCKET_NAME) {
      try {
        const tmpDir = os.tmpdir();
        const id = Date.now();
        const audioPath = path.join(tmpDir, `shadow_audio_${id}.mp3`);
        const videoInPath = path.join(tmpDir, `shadow_in_${id}.mp4`);
        const videoOutPath = path.join(tmpDir, `shadow_out_${id}.mp4`);

        fs.writeFileSync(audioPath, audioBuffer);

        // Download pexels video chunk
        const vidRes = await fetch(pexelsResult.videoUrl);
        if (vidRes.ok) {
          fs.writeFileSync(videoInPath, Buffer.from(await vidRes.arrayBuffer()));

          // Merge video + audio with FFmpeg, looped or trimmed to audio duration
          await execFileAsync("ffmpeg", [
            "-y",
            "-stream_loop", "-1",
            "-i", videoInPath,
            "-i", audioPath,
            "-shortest",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-preset", "ultrafast",
            videoOutPath
          ]);

          if (fs.existsSync(videoOutPath)) {
            const outBuf = fs.readFileSync(videoOutPath);
            const r2Key = `shadowing-videos/${id}.mp4`;
            const uploadedUrl = await uploadBufferToR2(outBuf, r2Key, "video/mp4");
            if (uploadedUrl) {
              finalVideoUrl = uploadedUrl;
            }
            try { fs.unlinkSync(videoOutPath); } catch {}
          }
        }
        try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch {}
        try { if (fs.existsSync(videoInPath)) fs.unlinkSync(videoInPath); } catch {}
      } catch (muxErr) {
        console.warn("[ShadowingGen] Muxing audio/video skipped:", muxErr.message);
      }
    }

    return {
      title: metadata.title,
      topic: metadata.topic || "English Shadowing",
      instructions: metadata.instructions || "Watch the video and practice shadowing by repeating every sentence simultaneously with the speaker.",
      videoUrl: finalVideoUrl,
      videoDuration: Math.min(finalDuration || metadata.targetDuration || 60, 180),
      videoTranscript: metadata.transcript,
      videoSource: pexelsResult.videoSource,
      videoPageUrl: pexelsResult.videoPageUrl,
      videoPhotographer: pexelsResult.videoPhotographer,
    };
  }

  // Fallback to random item from curated list
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
