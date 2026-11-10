/**
 * storyFeedIngestionService.js
 *
 * Automated English Short Story Scraping & Precision Audio Slicing (Option A):
 * 1. Scrapes authentic public domain English short story / fable RSS feeds (LibriVox Aesop's Fables).
 * 2. Matches the admin-configured target duration (derived from admin settings storyWordCount or explicit target).
 * 3. Transcribes with Groq Whisper Large v3 to obtain word & sentence timestamps.
 * 4. Strips narrator introductory preambles (e.g. "This is a LibriVox recording...", "Today's reading by...")
 *    and outro credits ("End of The Trumpeter...", "Recorded by...").
 * 5. Slices strictly from the first sentence of the story to the final moral sentence with FFmpeg.
 * 6. Normalizes loudness and saves locally to frontend/public/story-audio/ and Cloudflare R2.
 * 7. Automatically extracts key summary points (summaryGuide) with LLM.
 */

import fs from "fs";
import path from "path";
import os from "os";
import fetch from "node-fetch";
import FormData from "form-data";
import { execFile } from "child_process";
import { promisify } from "util";
import { getTextKey, getTextModel, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";
import { uploadBufferToR2 } from "../../config/storage.js";

const execFileAsync = promisify(execFile);

// Curated verified public domain English short story RSS feeds (Aesop's Fables volumes 3 to 10)
export const STORY_FEEDS = [
  {
    name: "LibriVox Aesop's Fables (Vol 05)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/195",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 06)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/196",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 07)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/197",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 08)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/198",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 04)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/194",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 03)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/193",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 09)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/199",
  }
];

/**
 * Parse duration string (HH:MM:SS, MM:SS, or seconds with CDATA/whitespace) to total seconds
 */
export function parseDurationToSeconds(durationStr) {
  if (!durationStr) return null;
  const str = String(durationStr)
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);

  const parts = str.split(":").map(p => parseInt(p.trim(), 10));
  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}

/**
 * Clean raw story title (strips narrator credits, volume headers, episode tags)
 */
export function cleanStoryTitle(rawTitle) {
  if (!rawTitle) return "Classic English Short Story";
  let title = String(rawTitle).replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  
  // Strip "Today's reading by ...", "Recorded by ...", etc.
  title = title.replace(/^(?:today's\s+reading\s+by|read(?:ing)?\s+by|recorded\s+by)\s+[^.]+\.?\s*/i, "");
  // Strip "Aesop's Fables." or "Fables of Aesop."
  title = title.replace(/^(?:aesop's\s+fables|fables\s+of\s+aesop)\.?\s*/i, "");
  // Strip "Fables 05 01 - ", "Episode 12 - ", etc.
  title = title.replace(/^(?:fables?\s*\d+\s*\d*\s*[-–:]\s*|episode\s*\d+\s*[-–:]\s*|\d+[\s.-]+)/i, "");
  // Strip "by Aesop..." or "(c. 620 BCE - 564)"
  title = title.replace(/\s*by\s+aesop.*$/i, "");
  title = title.replace(/\s*\([^)]*\)\s*$/g, "");
  // Strip trailing punctuation
  title = title.replace(/[.\s–-]+$/, "");
  return title.trim() || "Classic English Short Story";
}

/**
 * Clean transcript of any introductory narrator preamble or outro text.
 * Ensures the transcript contains ONLY the story itself.
 */
export function cleanNarrativeTranscript(text, title = "") {
  if (!text) return "";
  let clean = text.trim();

  // Strip leading LibriVox / narrator introductory preambles and website spellings
  clean = clean.replace(
    /^(?:this\s+is\s+a\s+librivox\s+recording[\s\S]*?(?:librivox\.org\.?|dunkelberg\.com\.?|[a-z]-[a-z]-[a-z][^.]*\.?)|today's\s+reading\s+by\s+[^.]+\.?|read(?:ing)?\s+by\s+[^.]+\.?|recorded\s+by\s+[^.]+\.?(?:,\s*florida|,\s*texas)?\.?|fables\s+of\s+aesop\.?|aesop's\s+fables\.?)\s*/gi,
    ""
  );

  clean = clean.replace(
    /^(?:recorded\s+by\s+[^.]+\.?,?\s*(?:florida|texas|usa)?\.?\s*|dunkelberg(?:\.com)?\.?\s*|[a-z](?:-[a-z])+\.?\s*|aesop's\s+fables\.?\s*)+/gi,
    ""
  );

  // Strip standalone title announcement at start if present
  if (title) {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const titleRegex = new RegExp(`^${escapedTitle}\\.?\\s*`, "i");
    clean = clean.replace(titleRegex, "");
  }

  // Strip trailing outro ("End of...", "Recorded by...", "Thank you for listening")
  clean = clean.replace(/\s*end\s+of\s+.*$/i, "");
  clean = clean.replace(/\s*recorded\s+by\s+.*$/i, "");
  clean = clean.replace(/\s*read\s+by\s+.*$/i, "");
  clean = clean.replace(/\s*thank\s+you\s+for\s+listening.*$/i, "");
  clean = clean.replace(/\s*the\s+end\.?\s*$/i.test(clean) ? /\s*the\s+end\.?\s*$/i : /^$/, "");

  return clean.trim();
}

/**
 * Extracts episodes from an RSS XML string using robust regex
 */
export function parseStoryRssXml(xmlString) {
  const items = [];
  const itemMatches = xmlString.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].trim() : "Classic Tale";
    const title = cleanStoryTitle(rawTitle);

    // Audio enclosure match (mp3 / m4a)
    const enclosureMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
    let audioUrl = enclosureMatch ? enclosureMatch[1].trim() : null;

    if (!audioUrl) {
      const mediaMatch = itemXml.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*>/i);
      if (mediaMatch) audioUrl = mediaMatch[1].trim();
    }

    // Flexible itunes:duration match allowing newlines and CDATA
    const durationMatch = itemXml.match(/<itunes:duration>[\s\S]*?(?:<!\[CDATA\[)?\s*(\d{1,2}:\d{2}(?::\d{2})?|\d+)\s*(?:\]\]>)?[\s\S]*?<\/itunes:duration>/i);
    const durationStr = durationMatch ? durationMatch[1].trim() : null;
    const durationSec = parseDurationToSeconds(durationStr);

    const descMatch = itemXml.match(/<(?:description|itunes:summary)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|itunes:summary)>/i);
    let description = descMatch ? descMatch[1].replace(/<[^>]*>?/gm, "").trim() : "";
    if (description.length > 300) description = description.substring(0, 300) + "...";

    if (audioUrl) {
      items.push({
        title,
        rawTitle,
        audioUrl,
        durationStr,
        durationSec,
        description
      });
    }
  }

  return items;
}

/**
 * Fetch a short story audio link from curated RSS feeds,
 * prioritizing episodes whose estimated net story length (raw duration minus intro)
 * is CLOSEST to the admin's target duration.
 */
export async function fetchAutomatedStoryFromRss(targetDuration = 90) {
  const shuffledFeeds = [...STORY_FEEDS].sort(() => 0.5 - Math.random());

  for (const feed of shuffledFeeds) {
    try {
      console.log(`[StoryIngestion] 📡 Fetching story feed: "${feed.name}" (${feed.url})...`);
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": "SpeakAndShineStoryBot/1.0 (+https://speakshine.ai)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*"
        },
        timeout: 12000
      });

      if (!res.ok) {
        console.warn(`[StoryIngestion] ⚠️ Feed ${feed.name} returned HTTP ${res.status}`);
        continue;
      }

      const xmlText = await res.text();
      const episodes = parseStoryRssXml(xmlText);

      if (episodes.length === 0) {
        console.warn(`[StoryIngestion] ⚠️ No story audio items found in ${feed.name}`);
        continue;
      }

      // Filter and score episodes based on how close their net story length is to targetDuration.
      // Net story length = raw duration minus ~18s intro/outro. Minimum net story must be at least 55 seconds (or targetDuration - 20s).
      const minStorySec = Math.max(55, Math.min(65, targetDuration - 20));
      const episodesWithDuration = episodes.filter(ep => ep.durationSec && (ep.durationSec - 18) >= minStorySec);

      if (episodesWithDuration.length > 0) {
        // Sort by closeness to targetDuration (estimated net story = raw - 18s)
        const scoredEpisodes = episodesWithDuration.map(ep => {
          const estimatedStorySec = Math.max(45, ep.durationSec - 18);
          const diff = Math.abs(estimatedStorySec - targetDuration);
          return { ...ep, estimatedStorySec, diff };
        });

        // Pick from episodes within ±25s of targetDuration, or the top 5 closest
        const closeMatches = scoredEpisodes.filter(ep => ep.diff <= 25);
        const candidates = closeMatches.length > 0
          ? closeMatches
          : scoredEpisodes.sort((a, b) => a.diff - b.diff).slice(0, 5);

        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        console.log(`[StoryIngestion] ✅ Selected story episode: "${selected.title}" (Raw: ${selected.durationSec}s, Net story est: ~${selected.estimatedStorySec}s, Target: ${targetDuration}s)`);

        return {
          success: true,
          sourceFeed: feed.name,
          category: feed.category,
          title: selected.title,
          audioUrl: selected.audioUrl,
          durationSec: selected.durationSec,
          description: selected.description
        };
      }
    } catch (feedErr) {
      console.warn(`[StoryIngestion] ⚠️ Feed fetch failed for ${feed.name}:`, feedErr.message);
    }
  }

  throw new Error("Unable to fetch stories from RSS feeds at this time.");
}

/**
 * Download audio sample to local temp directory with byte cap
 */
async function downloadAudioSample(url, destinationPath, maxBytes = 25 * 1024 * 1024) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SpeakAndShineAudioBot/1.0"
    },
    timeout: 35000
  });

  if (!res.ok) {
    throw new Error(`Failed to download audio from ${url}: HTTP ${res.status}`);
  }

  const fileStream = fs.createWriteStream(destinationPath);
  let totalBytes = 0;

  await new Promise((resolve, reject) => {
    res.body.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        res.body.destroy();
        resolve();
      }
    });

    res.body.pipe(fileStream);
    res.body.on("end", resolve);
    res.body.on("error", reject);
    fileStream.on("error", reject);
    fileStream.on("finish", resolve);
  });

  return destinationPath;
}

/**
 * Convert audio to 16kHz mono MP3 for fast Whisper transcription
 */
async function prepareAudioForWhisper(inputPath, outputPath) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-t", "360",
    "-vn",
    "-ar", "16000",
    "-ac", "1",
    "-b:a", "48k",
    outputPath
  ]);
  return outputPath;
}

/**
 * Transcribe audio using Groq Whisper Large v3
 */
async function transcribeAudioWithWhisper(audioFilePath) {
  const groqKey = getTextKey();
  if (!groqKey) {
    throw new Error("No available GROQ_API_KEY for Whisper transcription");
  }

  const form = new FormData();
  form.append("file", fs.createReadStream(audioFilePath));
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  form.append("prompt", "The following is an English spoken audio recording of a classic moral fable story.");
  form.append("temperature", "0.0");

  console.log(`[StorySlicer] 🎙️ Calling Groq Whisper Large v3 for audio transcription...`);
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      ...form.getHeaders()
    },
    body: form,
    timeout: 45000
  });

  if (response.status === 429) {
    const retryAfter = parseRetryAfter(response);
    markKeyExhausted(groqKey, retryAfter);
    throw new Error("Groq Whisper rate limit reached");
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq Whisper transcription failed (${response.status}): ${errText}`);
  }

  return await response.json();
}

/**
 * Detects whether a segment or sentence contains intro, disclaimer, narrator, or ad text.
 */
export function isIntroOrDisclaimerSegment(text, title = "") {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const compact = lower.replace(/[^a-z0-9]/g, "");

  // Known disclaimer, narrator preamble, sponsor, ad keywords
  if (
    compact.includes("librivox") ||
    compact.includes("publicdomain") ||
    compact.includes("volunteer") ||
    compact.includes("recordedby") ||
    compact.includes("recordingby") ||
    compact.includes("readby") ||
    compact.includes("readingby") ||
    compact.includes("todaysreading") ||
    compact.includes("formoreinformation") ||
    compact.includes("pleasevisit") ||
    compact.includes("fablesofaesop") ||
    compact.includes("aesopsfables") ||
    compact.includes("sponsor") ||
    compact.includes("sponsored") ||
    compact.includes("advertisement") ||
    compact.includes("broughttoyou") ||
    compact.includes("patreon") ||
    compact.includes("promocode") ||
    compact.includes("subscribe") ||
    compact.includes("dunkelberg") ||
    compact.includes("willmccoy") ||
    compact.endsWith("org") ||
    compact.endsWith("com") ||
    compact.includes("dotorg") ||
    compact.includes("dotcom") ||
    /^(?:[a-z]-)+[a-z]\.?$/i.test(lower) ||
    /^(?:chapter\s+\d+|fable\s+\d+|volume\s+\d+|section\s+\d+)/i.test(lower)
  ) {
    return true;
  }

  // Isolated title repetition by reader right before story starts
  if (title) {
    const cleanT = title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanT.length > 3) {
      if (compact === cleanT || (compact.length > 5 && cleanT.includes(compact)) || (cleanT.length > 5 && compact.includes(cleanT))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detects whether a segment contains an outro or ending credit
 */
export function isOutroSegment(text, title = "") {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const compact = lower.replace(/[^a-z0-9]/g, "");

  if (
    /^\s*end\s+of\b/i.test(lower) ||
    /\brecorded\s+by\b/i.test(lower) ||
    /\bread\s+by\b/i.test(lower) ||
    /\breading\s+by\b/i.test(lower) ||
    /thank\s+you\s+for\s+listening/i.test(lower) ||
    /^\s*the\s+end\.?\s*$/i.test(lower) ||
    compact.includes("librivox") ||
    compact.includes("aesopsfables") ||
    compact.includes("fablesofaesop")
  ) {
    return true;
  }

  // Isolated title repetition by reader at the very end
  if (title) {
    const cleanT = title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanT.length > 3) {
      if (compact === cleanT || (compact.length > 5 && cleanT.includes(compact)) || (cleanT.length > 5 && compact.includes(cleanT))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Group raw Whisper words into natural sentence units using punctuation (. ! ?)
 * or long audio pauses (>=0.85s gap between words).
 */
export function groupWordsIntoSentences(words) {
  if (!words || words.length === 0) return [];
  const sentences = [];
  let curWords = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    curWords.push(w);

    const hasPunct = /[.!?]$/.test(w.word.trim());
    const nextW = words[i + 1];
    const isPause = nextW && (nextW.start - w.end) >= 0.85;

    if (hasPunct || isPause || i === words.length - 1) {
      const sentenceText = curWords.map(item => item.word).join(" ").trim();
      sentences.push({
        text: sentenceText,
        start: curWords[0].start,
        end: curWords[curWords.length - 1].end,
        duration: curWords[curWords.length - 1].end - curWords[0].start,
        words: [...curWords]
      });
      curWords = [];
    }
  }

  return sentences;
}

/**
 * Find optimal story segment:
 * 1. Strictly strips narrator introduction preambles, ads, LibriVox disclaimers, and title repeats.
 * 2. Uses word-level timestamps when available for millisecond-level precision.
 * 3. Matches the target duration set by the admin (targetDuration).
 * 4. Snaps cleanly to complete sentence boundaries.
 */
export function findOptimalStoryWindow(transcriptionOrSegments, targetDuration = 90, title = "") {
  let words = [];
  let segments = [];

  if (Array.isArray(transcriptionOrSegments)) {
    segments = transcriptionOrSegments;
  } else if (transcriptionOrSegments && typeof transcriptionOrSegments === "object") {
    words = transcriptionOrSegments.words || [];
    segments = transcriptionOrSegments.segments || [];
  }

  // 1. If words are available, use sentence grouping with exact word timestamps
  if (words.length > 0) {
    const sentences = groupWordsIntoSentences(words);

    // Identify start sentence: advance past all intro / disclaimer / sponsor / title sentences
    let startIndex = 0;
    for (let i = 0; i < Math.min(sentences.length, 12); i++) {
      if (isIntroOrDisclaimerSegment(sentences[i].text, title)) {
        startIndex = i + 1;
      } else {
        if (i >= startIndex) {
          startIndex = i;
          break;
        }
      }
    }

    if (startIndex >= sentences.length) startIndex = 0;

    // Identify end sentence: strip backwards past any outro / credit sentence
    let endIndex = sentences.length - 1;
    for (let i = sentences.length - 1; i >= Math.max(0, sentences.length - 6); i--) {
      if (isOutroSegment(sentences[i].text, title)) {
        endIndex = i - 1;
      } else {
        break;
      }
    }

    if (endIndex < startIndex) {
      endIndex = sentences.length - 1;
    }

    const storySentences = sentences.slice(startIndex, endIndex + 1);
    if (storySentences.length === 0) {
      const firstW = words[0];
      const lastW = words[words.length - 1];
      return {
        startTime: firstW.start,
        endTime: lastW.end,
        duration: Math.round(lastW.end - firstW.start),
        transcript: cleanNarrativeTranscript(words.map(w => w.word).join(" "), title)
      };
    }

    const fullStart = storySentences[0].start;
    const fullEnd = storySentences[storySentences.length - 1].end;
    const fullDuration = Math.round(fullEnd - fullStart);
    const fullTranscript = cleanNarrativeTranscript(storySentences.map(s => s.text).join(" ").trim(), title);

    // If complete narrative is within targetDuration + 20s, keep full story!
    if (fullDuration <= (targetDuration + 20)) {
      return {
        startTime: fullStart,
        endTime: fullEnd,
        duration: fullDuration,
        transcript: fullTranscript
      };
    }

    // Otherwise find the continuous sentence window closest to targetDuration
    let bestWindow = null;
    let bestDiff = Infinity;

    for (let i = 0; i < storySentences.length; i++) {
      for (let j = i; j < storySentences.length; j++) {
        const winDuration = Math.round(storySentences[j].end - storySentences[i].start);
        const diff = Math.abs(winDuration - targetDuration);

        if (diff < bestDiff && winDuration >= (targetDuration - 25) && winDuration <= (targetDuration + 30)) {
          bestDiff = diff;
          bestWindow = {
            startTime: storySentences[i].start,
            endTime: storySentences[j].end,
            duration: winDuration,
            transcript: cleanNarrativeTranscript(storySentences.slice(i, j + 1).map(s => s.text).join(" ").trim(), title)
          };
        }
      }
    }

    if (bestWindow) {
      return bestWindow;
    }

    return {
      startTime: fullStart,
      endTime: fullEnd,
      duration: fullDuration,
      transcript: fullTranscript
    };
  }

  // Fallback to segment-based windowing if words are absent
  if (!segments || segments.length === 0) {
    return {
      startTime: 0,
      endTime: targetDuration,
      duration: targetDuration,
      transcript: "Listen to the story and share a summary in your own words."
    };
  }

  const validSegments = segments.filter(s => s.text && s.text.trim().length > 1);

  // 1. Identify start index: advance past all intro / disclaimer / reader preamble segments
  let startIndex = 0;
  for (let i = 0; i < Math.min(validSegments.length, 8); i++) {
    if (isIntroOrDisclaimerSegment(validSegments[i].text, title)) {
      startIndex = i + 1;
    } else {
      // Check if this segment looks like actual story narrative
      if (/(?:a|an|the|once|one|two|there|long|when|in|a certain)\s+/i.test(validSegments[i].text)) {
        break;
      }
    }
  }

  // 2. Identify end index: trim backwards past any outro segments
  let endIndex = validSegments.length - 1;
  for (let i = validSegments.length - 1; i >= Math.max(0, validSegments.length - 4); i--) {
    if (isOutroSegment(validSegments[i].text, title)) {
      endIndex = i - 1;
    } else {
      break;
    }
  }

  // Ensure valid range
  if (startIndex > endIndex) {
    startIndex = 0;
    endIndex = validSegments.length - 1;
  }

  const storySegments = validSegments.slice(startIndex, endIndex + 1);
  if (storySegments.length === 0) {
    return {
      startTime: validSegments[0].start,
      endTime: validSegments[validSegments.length - 1].end,
      duration: Math.round(validSegments[validSegments.length - 1].end - validSegments[0].start),
      transcript: cleanNarrativeTranscript(validSegments.map(s => s.text.trim()).join(" "), title)
    };
  }

  const fullStoryDuration = Math.round(storySegments[storySegments.length - 1].end - storySegments[0].start);

  // If the complete narrative is within ±25s of targetDuration, use the entire complete story!
  if (fullStoryDuration <= (targetDuration + 20)) {
    const rawText = storySegments.map(s => s.text.trim()).join(" ");
    return {
      startTime: Math.max(0, storySegments[0].start),
      endTime: storySegments[storySegments.length - 1].end,
      duration: fullStoryDuration,
      transcript: cleanNarrativeTranscript(rawText, title)
    };
  }

  // If the story is longer (e.g. 2-4 minutes), find the continuous narrative window closest to targetDuration
  let bestWindow = null;
  let bestDiff = Infinity;

  for (let i = 0; i < storySegments.length; i++) {
    const startSegment = storySegments[i];
    let candidateSegments = [];

    for (let j = i; j < storySegments.length; j++) {
      const seg = storySegments[j];
      const duration = Math.round(seg.end - startSegment.start);

      candidateSegments.push(seg);

      if (duration >= (targetDuration - 20)) {
        const diff = Math.abs(duration - targetDuration);
        const endsWithPunct = /[.!?]$/.test(seg.text.trim());
        const adjustedDiff = diff - (endsWithPunct ? 5 : 0);

        if (adjustedDiff < bestDiff) {
          bestDiff = adjustedDiff;
          const rawText = candidateSegments.map(s => s.text.trim()).join(" ");
          bestWindow = {
            startTime: Math.max(0, startSegment.start),
            endTime: seg.end,
            duration: duration,
            transcript: cleanNarrativeTranscript(rawText, title)
          };
        }
      }

      if (duration > (targetDuration + 25)) break;
    }
  }

  if (bestWindow) {
    return bestWindow;
  }

  // Final fallback
  const rawText = storySegments.map(s => s.text.trim()).join(" ");
  return {
    startTime: Math.max(0, storySegments[0].start),
    endTime: storySegments[storySegments.length - 1].end,
    duration: fullStoryDuration,
    transcript: cleanNarrativeTranscript(rawText, title)
  };
}

/**
 * Slice audio file with FFmpeg with volume normalization
 */
async function sliceAudioFile(inputPath, startTime, endTime, outputPath) {
  const duration = Math.max(1, endTime - startTime);
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss", String(Number(startTime).toFixed(2)),
    "-to", String(Number(endTime).toFixed(2)),
    "-i", inputPath,
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:a", "libmp3lame",
    "-b:a", "96k",
    "-ar", "44100",
    outputPath
  ]);
  return outputPath;
}

/**
 * Extract story metadata, key summary points, and focus vocabulary with LLM
 */
export async function extractStoryMetadataWithLLM(transcript, rawTitle = "") {
  const apiKey = getTextKey();
  if (apiKey) {
    const prompt = `Analyze this English short story narrative for an English speaking practice task where students listen and record a summary video.

Story Transcript:
"""
${transcript}
"""

Raw Title: "${rawTitle}"

Respond ONLY with a valid JSON object with these exact keys:
{
  "topic": "Clean, attractive story title (e.g. 'Hercules and The Waggoner')",
  "theme": "Theme or moral (e.g. 'Effort and Self-Reliance')",
  "summaryGuide": [
    "1. Key introduction of character(s) and initial situation.",
    "2. The central action, turning point, or dilemma.",
    "3. The outcome and moral / life lesson learned."
  ],
  "vocabulary": [
    { "word": "word1", "definition": "simple clear definition" },
    { "word": "word2", "definition": "simple clear definition" },
    { "word": "word3", "definition": "simple clear definition" }
  ],
  "question": "Listen to this short story and record a 1-minute video summary in your own words. Explain what happened, how the characters reacted, and the lesson learned."
}`;

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
          temperature: 0.6,
          max_tokens: 1500,
          response_format: { type: "json_object" }
        }),
        timeout: 25000
      });

      if (res.ok) {
        const data = await res.json();
        const rawContent = data.choices?.[0]?.message?.content?.trim();
        if (rawContent) {
          const parsed = JSON.parse(rawContent);
          if (parsed.topic && Array.isArray(parsed.summaryGuide)) {
            return {
              topic: cleanStoryTitle(parsed.topic.trim()),
              theme: parsed.theme || "Life Lessons",
              summaryGuide: parsed.summaryGuide.map(p => String(p).trim()),
              vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [],
              question: parsed.question || "Listen to this short story and record a 1-minute video summary in your own words. Explain what happened and the lesson learned."
            };
          }
        }
      }
    } catch (llmErr) {
      console.warn("[StoryIngestion] LLM extraction warning:", llmErr.message);
    }
  }

  // Graceful rule-based fallback if LLM is unavailable
  const cleanTitle = cleanStoryTitle(rawTitle);
  const sentences = transcript.split(/(?<=[.!?])\s+/).filter(Boolean);
  const intro = sentences[0] || "The story opens with the main characters and setting.";
  const climax = sentences[Math.floor(sentences.length / 2)] || "A sudden challenge tests the characters' intentions.";
  const conclusion = sentences[sentences.length - 1] || "The story ends with a clear outcome and moral.";

  return {
    topic: cleanTitle,
    theme: "Wisdom & Moral Fables",
    summaryGuide: [
      `1. Beginning: ${intro}`,
      `2. Climax / Action: ${climax}`,
      `3. Resolution & Lesson: ${conclusion}`
    ],
    vocabulary: [
      { word: "narrative", definition: "A spoken or written account of connected events; a story." },
      { word: "dilemma", definition: "A situation requiring a difficult choice between alternatives." },
      { word: "resolution", definition: "The conclusion or solution to the main conflict of a story." }
    ],
    question: "Listen to this 1-minute story and record a short video summary in your own words. Explain what happened, how the situation unfolded, and the takeaway."
  };
}

/**
 * Verified fallback public domain English stories (75s - 95s)
 */
export const FALLBACK_STORIES = [
  {
    topic: "Hercules and The Waggoner",
    theme: "Effort Before Expectation",
    duration: 85,
    audioUrl: "/story-audio/hercules-and-the-waggoner.mp3",
    storyTranscript: "A carter was driving his heavy wagon along a muddy country lane after a stormy night. The wheels sank deep into the mire, and the horses could pull no further. Instead of putting his own shoulder to the wheel, the waggoner dropped to his knees in the mud and began praying loudly to Hercules, begging the mighty hero to descend and lift his wagon free. Suddenly, Hercules appeared in the clouds and called out sternly: 'Lazy fellow! Put your shoulder to the wheel, urge on your bullocks, and push with all your strength. Never pray to the gods for help until you have first done everything within your own power!'",
    summaryGuide: [
      "1. A waggoner's heavy cart got trapped deep in mud on a country road.",
      "2. Instead of trying to push it out, the driver kneeled and prayed loudly to Hercules for rescue.",
      "3. Hercules appeared and admonished him to put his own shoulder to the wheel first.",
      "4. Moral: Heaven helps those who help themselves; always exert your best effort before asking for aid."
    ],
    vocabulary: [
      { word: "mire", definition: "A stretch of swampy, boggy, or deeply muddy ground." },
      { word: "admonish", definition: "To warn or reprimand someone firmly." },
      { word: "diligence", definition: "Careful and persistent work or effort." }
    ],
    question: "Listen to this short fable and record a 1-minute video summary in your own words. Explain the waggoner's reaction, Hercules' advice, and the moral of the story."
  },
  {
    topic: "The Bundle of Sticks",
    theme: "Strength in Unity",
    duration: 78,
    audioUrl: "/story-audio/the-bundle-of-sticks.mp3",
    storyTranscript: "An old father had several sons who were continually quarreling among themselves. No matter how much he urged them to live in harmony, his words went unheeded. One day, he called them together and presented a tightly bound bundle of sticks. 'I will give a silver coin to whichever of you can break this bundle in two,' the father promised. Each son tried with all his might, straining their arms, but the bundle would not yield. The father then untied the cord and handed them the sticks one by one. Effortlessly, each son snapped the single sticks across their knees. The father smiled and said: 'Behold the power of unity! As long as you remain united, no enemy can overcome you; but when you divide, you will be broken as easily as these sticks.'",
    summaryGuide: [
      "1. An aging father grew worried about his constantly quarreling sons.",
      "2. He challenged them to break a tightly bound bundle of sticks, which none could snap.",
      "3. When the bundle was untied, each individual stick was snapped with ease.",
      "4. Moral: Unity is strength; divided we fall, but together we remain unbreakable."
    ],
    vocabulary: [
      { word: "quarrel", definition: "An angry argument or disagreement between people." },
      { word: "harmony", definition: "Agreement, peaceful coexistence, and cooperation." },
      { word: "unbreakable", definition: "Impossible to break, shatter, or defeat." }
    ],
    question: "Listen to this classic fable and record a 1-minute video summary. Explain the demonstration the father gave to his sons and the enduring message of unity."
  },
  {
    topic: "The Farmer and His Sons",
    theme: "The Value of Honest Labor",
    duration: 92,
    audioUrl: "/story-audio/the-farmer-and-his-sons.mp3",
    storyTranscript: "A hardworking farmer, being on the point of death and wishing to impart wisdom to his sons, called them to his bedside. 'My boys,' he whispered, 'a great treasure lies hidden for you in the vineyard.' The sons eagerly begged him to tell them the exact spot, but the old man died before saying another word. As soon as the burial was over, the sons seized their spades and hoes and dug up every square inch of the vineyard grounds. They found no buried gold or silver, but the soil had been loosened so thoroughly that that autumn the vines produced an extraordinary, bountiful vintage of grapes. The harvest sold for a fortune, and the sons realized that the hidden treasure their wise father had spoken of was the enduring reward of honest labor.",
    summaryGuide: [
      "1. An aging farmer told his sons that a great treasure was buried in the family vineyard.",
      "2. The sons dug through every inch of the land searching for hidden gold, finding none.",
      "3. The deep turning of the soil caused the vineyard to yield an unprecedented harvest of grapes.",
      "4. Moral: Honest industry and dedication are the truest and most lasting treasure."
    ],
    vocabulary: [
      { word: "vineyard", definition: "A plantation of grapevines, typically producing wine grapes." },
      { word: "bountiful", definition: "Large in quantity; abundant and generous." },
      { word: "industry", definition: "Hard work, diligence, and energetic effort." }
    ],
    question: "Listen to this story and record a 1-minute video summary in your own words. Explain what the sons searched for, what they actually discovered, and the father's true lesson."
  }
];

/**
 * Downloads, slices, transcribes, and extracts metadata for a story episode.
 */
export async function processStoryAudioIntoChallenge(storyItem, options = {}) {
  const targetDuration = Number(options.targetDuration) || 90;
  const tmpDir = os.tmpdir();
  const rawFile = path.join(tmpDir, `story-raw-${Date.now()}.mp3`);
  const whisperFile = path.join(tmpDir, `story-whisper-${Date.now()}.mp3`);
  const slicedFile = path.join(tmpDir, `story-sliced-${Date.now()}.mp3`);

  try {
    console.log(`[StorySlicer] 📥 Downloading audio from: ${storyItem.audioUrl}`);
    await downloadAudioSample(storyItem.audioUrl, rawFile);

    console.log(`[StorySlicer] 🔄 Preparing audio sample for Whisper...`);
    await prepareAudioForWhisper(rawFile, whisperFile);

    console.log(`[StorySlicer] 🧠 Transcribing with Whisper Large v3...`);
    const transcription = await transcribeAudioWithWhisper(whisperFile);

    console.log(`[StorySlicer] 🎯 Finding story window near target duration (${targetDuration}s)...`);
    const window = findOptimalStoryWindow(transcription, targetDuration, storyItem.title);

    console.log(`[StorySlicer] ✂️ Slicing clean narrative audio (${window.duration}s from ${window.startTime.toFixed(1)}s to ${window.endTime.toFixed(1)}s)...`);
    await sliceAudioFile(rawFile, window.startTime, window.endTime, slicedFile);

    // Save locally to frontend/public/story-audio/ so it's guaranteed playable in dev & prod
    const publicAudioDir = path.join(process.cwd(), "frontend/public/story-audio");
    if (!fs.existsSync(publicAudioDir)) {
      fs.mkdirSync(publicAudioDir, { recursive: true });
    }
    const localFileName = `story-${Date.now()}.mp3`;
    const localFilePath = path.join(publicAudioDir, localFileName);
    await fs.promises.copyFile(slicedFile, localFilePath);

    let finalAudioUrl = `/story-audio/${localFileName}`;

    // Also upload sliced MP3 to Cloudflare R2 if configured
    try {
      const audioBuffer = await fs.promises.readFile(slicedFile);
      const r2Key = `story-audio/scraped-${Date.now()}.mp3`;
      console.log(`[StorySlicer] ☁️ Uploading sliced story to Cloudflare R2 (${r2Key})...`);
      const uploadRes = await uploadBufferToR2(audioBuffer, r2Key, "audio/mpeg");
      if (uploadRes && uploadRes.url) {
        finalAudioUrl = uploadRes.url;
      } else if (process.env.R2_PUBLIC_URL) {
        finalAudioUrl = `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${r2Key}`;
      }
    } catch (r2Err) {
      console.warn(`[StorySlicer] ℹ️ R2 upload skipped (${r2Err.message}), serving sliced audio via local URL: ${finalAudioUrl}`);
    }

    console.log(`[StorySlicer] 🤖 Generating summary guide and metadata with LLM...`);
    const metadata = await extractStoryMetadataWithLLM(window.transcript, storyItem.title);

    return {
      success: true,
      topic: metadata.topic || cleanStoryTitle(storyItem.title),
      theme: metadata.theme,
      duration: window.duration,
      audioUrl: finalAudioUrl,
      storyTranscript: window.transcript,
      summaryGuide: metadata.summaryGuide,
      question: metadata.question,
      vocabulary: metadata.vocabulary,
      sourceFeed: storyItem.sourceFeed || "Curated English Short Stories RSS"
    };
  } finally {
    [rawFile, whisperFile, slicedFile].forEach((f) => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (_) {}
      }
    });
  }
}

/**
 * Main entry point: Generates a story challenge matching target duration from RSS.
 * Automatically falls back to verified public domain stories if offline.
 */
export async function generateScrapedStoryChallenge(options = {}) {
  const targetDuration = Number(options.targetDuration) || 90;
  try {
    console.log(`[StoryFeed] 📻 Starting automated RSS story scraping & slicing (Target: ~${targetDuration}s)...`);
    const storyItem = await fetchAutomatedStoryFromRss(targetDuration);
    if (storyItem && storyItem.audioUrl) {
      const challenge = await processStoryAudioIntoChallenge(storyItem, { targetDuration });
      if (challenge && challenge.audioUrl && challenge.storyTranscript) {
        console.log(`[StoryFeed] ✅ Successfully scraped & sliced story: "${challenge.topic}" (${challenge.duration}s, target: ${targetDuration}s)`);
        return challenge;
      }
    }
  } catch (err) {
    console.warn("[StoryFeed] ⚠️ Automated RSS story scraping failed, using curated fallback story:", err.message);
  }

  // Fallback to verified public domain English stories closest to targetDuration
  const sorted = [...FALLBACK_STORIES].sort((a, b) => Math.abs(a.duration - targetDuration) - Math.abs(b.duration - targetDuration));
  const fallback = sorted[0] || FALLBACK_STORIES[0];
  return {
    success: true,
    ...fallback,
    sourceFeed: "Curated Classic English Fables Library"
  };
}
