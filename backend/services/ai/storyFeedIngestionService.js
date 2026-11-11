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

// Curated verified public domain English short story RSS feeds (Aesop's Fables volumes 1 to 12)
export const STORY_FEEDS = [
  {
    name: "LibriVox Aesop's Fables (Vol 01)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/191",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 02)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/192",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 03)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/193",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 04)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/194",
  },
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
    name: "LibriVox Aesop's Fables (Vol 09)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/199",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 10)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/200",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 11)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/201",
  },
  {
    name: "LibriVox Aesop's Fables (Vol 12)",
    category: "Classic Moral Fables",
    url: "https://librivox.org/rss/202",
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
 * Ensures the transcript contains ONLY the authentic story itself.
 */
export function cleanNarrativeTranscript(text, title = "") {
  if (!text) return "";
  let clean = text.trim();

  // 1. Initial quick trim for trailing outro phrases that might lack end punctuation
  clean = clean.replace(/\s*end\s+of\s+.*$/i, "");
  clean = clean.replace(/\s*thank\s+you\s+for\s+listening.*$/i, "");
  clean = clean.replace(/\s*the\s+end\.?\s*$/i, "");

  // 2. Parse text into natural sentence units using punctuation (. ! ?)
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
  let matches = clean.match(sentenceRegex) || [clean];
  matches = matches.map(s => s.trim()).filter(Boolean);

  // 3. Advance start index past all intro / disclaimer / non-narrative / title sentences
  let startIdx = 0;
  let foundNarrative = false;
  for (let i = 0; i < Math.min(matches.length, 12); i++) {
    if (isNarrativeStorySentence(matches[i])) {
      startIdx = i;
      foundNarrative = true;
      break;
    }
  }

  if (!foundNarrative) {
    for (let i = 0; i < Math.min(matches.length, 8); i++) {
      if (isIntroOrDisclaimerSegment(matches[i], title)) {
        startIdx = i + 1;
      } else {
        startIdx = i;
        break;
      }
    }
  }

  // 4. Trim backwards past any outro / credit / non-narrative sentences
  let endIdx = matches.length - 1;
  for (let i = matches.length - 1; i >= Math.max(startIdx, matches.length - 6); i--) {
    if (isOutroSegment(matches[i], title)) {
      endIdx = i - 1;
    } else {
      break;
    }
  }

  if (startIdx <= endIdx) {
    return matches.slice(startIdx, endIdx + 1).join(" ").trim();
  }

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
 * strictly prioritizing episodes whose estimated net story length (raw duration minus intro/outro)
 * is CLOSEST to the admin's target duration, avoiding stories that are too small or too long.
 */
export async function fetchAutomatedStoryFromRss(targetDuration = 90) {
  const estimatedIntroOutro = 20;
  // A story must be preserved completely from beginning to moral, so the candidate's complete net duration
  // must match targetDuration closely (within ~15-18s)
  const minNetStorySec = Math.max(40, targetDuration - 15);
  const maxNetStorySec = targetDuration + 18;

  // Prioritize feeds by targetDuration:
  // For long targets (>=105s), volumes with longer fables (Vol 06, 07, 08, 01, 10) come first.
  const feedOrder = [...STORY_FEEDS].sort((a, b) => {
    if (targetDuration >= 105) {
      const longFeeds = ["Vol 06", "Vol 07", "Vol 08", "Vol 01", "Vol 03", "Vol 05", "Vol 09", "Vol 10"];
      const aIdx = longFeeds.findIndex(f => a.name.includes(f));
      const bIdx = longFeeds.findIndex(f => b.name.includes(f));
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
    }
    return 0.5 - Math.random();
  });

  const candidates = [];

  for (const feed of feedOrder) {
    try {
      console.log(`[StoryIngestion] 📡 Scanning story feed: "${feed.name}"...`);
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": "SpeakAndShineStoryBot/1.0 (+https://speakshine.ai)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*"
        },
        timeout: 9000
      });

      if (!res.ok) {
        console.warn(`[StoryIngestion] ⚠️ Feed ${feed.name} returned HTTP ${res.status}`);
        continue;
      }

      const xmlText = await res.text();
      const episodes = parseStoryRssXml(xmlText);
      if (episodes.length === 0) continue;

      for (const ep of episodes) {
        if (!ep.durationSec) continue;
        const estimatedStorySec = Math.max(30, ep.durationSec - estimatedIntroOutro);

        // Strict floor and ceiling: must never select a story that is far too small or overly long
        if (estimatedStorySec < minNetStorySec || estimatedStorySec > maxNetStorySec) continue;

        const diff = Math.abs(estimatedStorySec - targetDuration);
        candidates.push({
          ...ep,
          sourceFeed: feed.name,
          category: feed.category,
          estimatedStorySec,
          diff
        });
      }

      // If we found at least 2 candidates within ±15s of targetDuration, we have enough excellent matches!
      const closeMatches = candidates.filter(c => c.diff <= 15);
      if (closeMatches.length >= 2) break;
      if (candidates.length >= 6) break;
    } catch (feedErr) {
      console.warn(`[StoryIngestion] ⚠️ Feed scan failed for ${feed.name}:`, feedErr.message);
    }
  }

  if (candidates.length > 0) {
    // Sort by smallest difference to targetDuration
    candidates.sort((a, b) => a.diff - b.diff);

    // Pick from the top closest matches (within 10s of target, or top 3)
    const tightMatches = candidates.filter(c => c.diff <= 10);
    const pool = tightMatches.length > 0 ? tightMatches : candidates.slice(0, 3);
    const selected = pool[Math.floor(Math.random() * pool.length)];

    console.log(`[StoryIngestion] ✅ Selected story episode: "${selected.title}" from ${selected.sourceFeed} (Raw: ${selected.durationSec}s, Net story est: ~${selected.estimatedStorySec}s, Target: ${targetDuration}s, Diff: ${selected.diff}s)`);

    return {
      success: true,
      sourceFeed: selected.sourceFeed,
      category: selected.category,
      title: selected.title,
      audioUrl: selected.audioUrl,
      durationSec: selected.durationSec,
      description: selected.description
    };
  }

  // Graceful fallback if feeds are temporarily unreachable
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
  form.append("file", fs.readFileSync(audioFilePath), {
    filename: "audio.mp3",
    contentType: "audio/mpeg"
  });
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  form.append("prompt", "The following is an English spoken audio recording of a classic moral fable story.");
  form.append("temperature", "0.0");

  const buffer = form.getBuffer();
  const headers = {
    Authorization: `Bearer ${groqKey}`,
    ...form.getHeaders(),
    "Content-Length": String(buffer.length)
  };

  console.log(`[StorySlicer] 🎙️ Calling Groq Whisper Large v3 for audio transcription...`);
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers,
    body: buffer,
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
    compact.includes("libraryvox") ||
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
    compact.includes("gordonmckenzie") ||
    compact.includes("newfoundland") ||
    compact.includes("worcestershire") ||
    compact.endsWith("org") ||
    compact.endsWith("com") ||
    compact.includes("dotorg") ||
    compact.includes("dotcom") ||
    /^(?:john'?s|st\.?\s*john'?s)[,\s]+newfoundland/i.test(lower) ||
    /^worcestershire[,\s]+(?:uk|england)/i.test(lower) ||
    /^(?:today'?s\s+reading\s+by|read(?:ing)?\s+by|recorded\s+by)\b/i.test(lower) ||
    /^(?:the\s+fables\s+of\s+aesop|aesop'?s\s+fables)/i.test(lower) ||
    /^(?:[a-z]-)+[a-z]\.?$/i.test(lower) ||
    /^(?:chapter\s+\d+|fable\s+\d+|volume\s+\d+|section\s+\d+)/i.test(lower) ||
    /^(?:all\s+libr(?:i|ary)vox\s+recordings)/i.test(lower) ||
    /^(?:this\s+is\s+a\s+libr(?:i|ary)vox)/i.test(lower) ||
    /^(?:recorded\s+in\s+\d{4})/i.test(lower) ||
    /^(?:recorded\s+by)/i.test(lower)
  ) {
    return true;
  }

  // Isolated title repetition by reader right before story starts
  if (title) {
    const cleanT = cleanStoryTitle(title).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanT.length > 3) {
      if (compact === cleanT || (compact.length > 5 && cleanT.includes(compact)) || (cleanT.length > 5 && compact.includes(cleanT))) {
        return true;
      }
    }
  }

  // Standalone header/title check: If it's a short segment (<= 8 words) without any narrative action verb, it's a title/location header
  const words = lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 1 && words.length <= 8) {
    const hasVerb = /\b(?:went|was|were|had|lived|saw|decided|marched|pounced|met|shot|challenged|travelled|traveled|stole|began|loved|thought|said|asked|gathered|dropped|called|walked|found|set|came|stood|fled|took|became|flew|crept|leaped|jumped|cried|replied|answered|warned|noticed|heard|wished|hoped|swallowed|bitten|bit|caught|spoke|spake|roamed|wandered|carried|struck|chanced|ran|laid|crawled|swam)\b/i.test(lower);
    if (!hasVerb) {
      return true;
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
    compact.includes("libraryvox") ||
    compact.includes("aesopsfables") ||
    compact.includes("fablesofaesop")
  ) {
    return true;
  }

  // Isolated title repetition by reader at the very end
  if (title) {
    const cleanT = cleanStoryTitle(title).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanT.length > 3) {
      if (compact === cleanT || (compact.length > 5 && cleanT.includes(compact)) || (cleanT.length > 5 && compact.includes(cleanT))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Determines whether a sentence is a genuine story narrative sentence
 * (has storytelling verbs, narrative openers, and isn't a preamble, outro, or title header).
 */
export function isNarrativeStorySentence(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  if (isIntroOrDisclaimerSegment(lower)) return false;
  if (isOutroSegment(lower)) return false;

  const words = lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;

  const hasVerb = /\b(?:went|was|were|had|lived|saw|decided|marched|pounced|met|shot|challenged|travelled|traveled|stole|began|loved|thought|said|asked|gathered|dropped|called|walked|found|set|came|stood|fled|took|became|flew|crept|leaped|jumped|cried|replied|answered|warned|noticed|heard|wished|hoped|swallowed|bitten|bit|caught|spoke|spake|roamed|wandered|carried|struck|chanced|ran|laid|crawled|swam)\b/i.test(lower);

  const hasOpener = /^(?:once|one|a|an|the|there|two|three|in|long\s+ago|when|while|as|a\s+certain)\s+/i.test(lower);

  return hasVerb && (hasOpener || words.length >= 6);
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

    // Identify start sentence: advance forward past ALL intro, disclaimer, narrator credits,
    // and title header sentences until we reach the first genuine narrative story sentence!
    let startIndex = 0;
    let foundNarrativeStart = false;
    for (let i = 0; i < Math.min(sentences.length, 20); i++) {
      if (isNarrativeStorySentence(sentences[i].text)) {
        startIndex = i;
        foundNarrativeStart = true;
        break;
      }
    }

    // Fallback if no narrative opener matched: scan forward skipping any known intro segment
    if (!foundNarrativeStart) {
      for (let i = 0; i < Math.min(sentences.length, 12); i++) {
        if (isIntroOrDisclaimerSegment(sentences[i].text, title)) {
          startIndex = i + 1;
        } else {
          startIndex = i;
          break;
        }
      }
    }

    if (startIndex >= sentences.length) startIndex = 0;

    // Identify end sentence: strip backwards past any outro, credit, or trailing title sentence
    let endIndex = sentences.length - 1;
    for (let i = sentences.length - 1; i >= Math.max(startIndex, sentences.length - 8); i--) {
      if (isOutroSegment(sentences[i].text, title) || !isNarrativeStorySentence(sentences[i].text)) {
        if (isOutroSegment(sentences[i].text, title)) {
          endIndex = i - 1;
        } else {
          const wCount = sentences[i].text.split(/\s+/).length;
          if (wCount <= 5) {
            endIndex = i - 1;
          } else {
            break;
          }
        }
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

    // Stories must ALWAYS be preserved completely from the first sentence to the final moral/conclusion!
    // Never truncate a story mid-plot or mid-sentence.
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

  // 1. Identify start index: advance forward past ALL intro / disclaimer / reader preambles
  let startIndex = 0;
  let foundNarrativeSeg = false;
  for (let i = 0; i < Math.min(validSegments.length, 12); i++) {
    if (isNarrativeStorySentence(validSegments[i].text)) {
      startIndex = i;
      foundNarrativeSeg = true;
      break;
    }
  }

  if (!foundNarrativeSeg) {
    for (let i = 0; i < Math.min(validSegments.length, 8); i++) {
      if (isIntroOrDisclaimerSegment(validSegments[i].text, title)) {
        startIndex = i + 1;
      } else {
        startIndex = i;
        break;
      }
    }
  }

  // 2. Identify end index: trim backwards past any outro segments
  let endIndex = validSegments.length - 1;
  for (let i = validSegments.length - 1; i >= Math.max(startIndex, validSegments.length - 6); i--) {
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
    "-c:a", "libmp3lame",
    "-b:a", "192k",
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

    // Auto-generate authentic human studio voice audio via ElevenLabs
    let humanVoiceAudioUrl = finalAudioUrl;
    let voiceRecommendation = null;
    try {
      const { generateAndUploadStoryAudio } = await import("./storyAudioService.js");
      const { analyzeStoryVoice } = await import("./storyVoiceAnalyzer.js");
      voiceRecommendation = await analyzeStoryVoice(window.transcript);
      console.log(`[StorySlicer] 🎙️ Generating authentic human studio voice via ElevenLabs (${voiceRecommendation?.voiceName || "Adam"})...`);
      const ttsResult = await generateAndUploadStoryAudio(
        window.transcript,
        metadata.topic || cleanStoryTitle(storyItem.title),
        voiceRecommendation?.voiceId,
        voiceRecommendation?.voiceSettings
      );
      if (ttsResult && ttsResult.audioUrl) {
        humanVoiceAudioUrl = ttsResult.audioUrl;
        console.log(`[StorySlicer] ✅ Real human studio audio generated: ${humanVoiceAudioUrl}`);
      }
    } catch (ttsErr) {
      console.warn(`[StorySlicer] ℹ️ ElevenLabs studio voice generation skipped (${ttsErr.message}), using sliced native audio`);
    }

    return {
      success: true,
      topic: metadata.topic || cleanStoryTitle(storyItem.title),
      theme: metadata.theme,
      duration: window.duration,
      audioUrl: humanVoiceAudioUrl,
      nativeAudioUrl: finalAudioUrl,
      voiceRecommendation,
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
