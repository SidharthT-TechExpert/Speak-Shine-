import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

/**
 * Transcribes audio using Groq Whisper verbose_json mode.
 * Returns rich data: full text, word-level timestamps, segments, and duration.
 */
export async function transcribe(audioPath) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set in .env");

  const form = new FormData();
  form.append("file", fs.createReadStream(audioPath), {
    filename: "audio.mp3",
    contentType: "audio/mpeg",
  });
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("language", "en");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq transcription failed: ${err}`);
  }

  const data = await res.json();

  // Extract word-level data if available
  const words = data.words || [];
  const segments = data.segments || [];
  const text = (data.text || "").trim();

  // Calculate actual spoken duration from word timestamps
  // Fall back to segment end times, then to data.duration
  let spokenDuration = data.duration || 0;
  if (words.length > 0) {
    const lastWord = words[words.length - 1];
    spokenDuration = lastWord.end || spokenDuration;
  } else if (segments.length > 0) {
    const lastSeg = segments[segments.length - 1];
    spokenDuration = lastSeg.end || spokenDuration;
  }

  return {
    text,
    words,      // [{ word, start, end }]
    segments,   // [{ text, start, end, avg_logprob, ... }]
    duration: spokenDuration,
  };
}
