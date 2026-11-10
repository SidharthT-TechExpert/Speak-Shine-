/**
 * storyFeedIngestionService.js
 *
 * Automated English Short Story Scraping & Audio Processing (Option A):
 * 1. Scrapes authentic public domain English short story / fable RSS feeds (LibriVox Aesop's Fables, Classic Fables).
 * 2. Downloads audio and transcribes with Groq Whisper Large v3 to obtain word & sentence timestamps.
 * 3. Strips introductory disclaimers and slices a coherent 1-2 minute (60s–120s) English story segment.
 * 4. Slices with FFmpeg and uploads high-fidelity MP3 to Cloudflare R2.
 * 5. Uses Groq LLM to automatically derive key summary points (summaryGuide), focus vocabulary, and the challenge question.
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
 * Parse duration string (HH:MM:SS or MM:SS or seconds) to total seconds
 */
export function parseDurationToSeconds(durationStr) {
  if (!durationStr) return null;
  const str = String(durationStr).replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);

  const parts = str.split(":").map(p => parseInt(p, 10));
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
 * Clean raw story title (strips narrator credits, author tags, volume headers)
 */
export function cleanStoryTitle(rawTitle) {
  if (!rawTitle) return "Classic English Short Story";
  let title = String(rawTitle).replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  // Strip "Fables 05 01 - ", "Episode 12 - ", etc.
  title = title.replace(/^(?:fables?\s*\d+\s*\d*\s*[-–:]\s*|episode\s*\d+\s*[-–:]\s*|\d+[\s.-]+)/i, "");
  // Strip "by Aesop..." or "(c. 620 BCE - 564)"
  title = title.replace(/\s*by\s+aesop.*$/i, "");
  title = title.replace(/\s*\([^)]*\)\s*$/g, "");
  return title.trim() || "Classic English Short Story";
}

/**
 * Extracts episodes from an RSS XML string using regex
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

    const durationMatch = itemXml.match(/<itunes:duration>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/itunes:duration>/i);
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
 * Fetch a fresh short story audio link from curated RSS feeds.
 * Targets stories that are ideally 50s - 150s (perfect for 60s - 120s slicing).
 */
export async function fetchAutomatedStoryFromRss() {
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

      // Filter for episodes close to the 1-2 minute mark (45s to 180s)
      const idealStories = episodes.filter(ep => ep.durationSec && ep.durationSec >= 45 && ep.durationSec <= 160);
      const candidates = idealStories.length > 0 ? idealStories : episodes.slice(0, 10);

      const selected = candidates[Math.floor(Math.random() * candidates.length)];
      console.log(`[StoryIngestion] ✅ Selected story episode: "${selected.title}" (~${selected.durationSec || "unknown"}s)`);

      return {
        success: true,
        sourceFeed: feed.name,
        category: feed.category,
        title: selected.title,
        audioUrl: selected.audioUrl,
        durationSec: selected.durationSec,
        description: selected.description
      };
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
    "-t", "300",
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
 * Detects whether a segment contains a standard LibriVox or intro/outro disclaimer
 */
function isDisclaimerSegment(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("librivox") ||
    lower.includes("public domain") ||
    lower.includes("volunteer") ||
    lower.includes("read by") ||
    lower.includes("recorded by") ||
    lower.includes("recording by") ||
    lower.includes("end of fable") ||
    lower.includes("end of chapter") ||
    lower.includes("this recording is in")
  );
}

/**
 * Find optimal 60s - 120s story segment, stripping disclaimers and snapping to sentence boundaries
 */
export function findOptimalStoryWindow(segments, minSeconds = 60, maxSeconds = 120) {
  if (!segments || segments.length === 0) {
    return {
      startTime: 0,
      endTime: 75,
      duration: 75,
      transcript: "Listen to the story and share a summary in your own words."
    };
  }

  // Filter out empty / pure noise segments
  const validSegments = segments.filter(s => s.text && s.text.trim().length > 2);

  // Find where the story actually begins (first segment after LibriVox/intro disclaimer)
  let startIndex = 0;
  for (let i = 0; i < Math.min(validSegments.length, 6); i++) {
    if (isDisclaimerSegment(validSegments[i].text)) {
      startIndex = i + 1;
    }
  }

  const storySegments = validSegments.slice(startIndex);
  if (storySegments.length === 0) {
    return {
      startTime: validSegments[0].start,
      endTime: validSegments[validSegments.length - 1].end,
      duration: Math.round(validSegments[validSegments.length - 1].end - validSegments[0].start),
      transcript: validSegments.map(s => s.text.trim()).join(" ")
    };
  }

  // Find continuous narrative window between minSeconds and maxSeconds (target ~75s to 95s)
  let bestWindow = null;
  let bestScore = -1;

  for (let i = 0; i < storySegments.length; i++) {
    const startSegment = storySegments[i];
    let candidateSegments = [];
    let currentDuration = 0;

    for (let j = i; j < storySegments.length; j++) {
      const seg = storySegments[j];
      const duration = seg.end - startSegment.start;

      if (duration > maxSeconds + 5) break;

      // Don't include outro disclaimers in the candidate
      if (isDisclaimerSegment(seg.text)) break;

      candidateSegments.push(seg);
      currentDuration = duration;

      if (currentDuration >= (minSeconds - 5) && currentDuration <= maxSeconds) {
        const fullText = candidateSegments.map(s => s.text.trim()).join(" ");
        const endsWithPunct = /[.!?]$/.test(candidateSegments[candidateSegments.length - 1].text.trim());
        const durationScore = 100 - Math.abs(currentDuration - 85);
        const score = durationScore + (endsWithPunct ? 25 : 0) + (candidateSegments.length >= 3 ? 10 : 0);

        if (score > bestScore) {
          bestScore = score;
          bestWindow = {
            startTime: Math.max(0, startSegment.start),
            endTime: seg.end,
            duration: Math.round(currentDuration),
            transcript: fullText
          };
        }
      }
    }
  }

  if (bestWindow) {
    return bestWindow;
  }

  // Fallback: take all non-disclaimer story segments capped at maxSeconds
  const cleanStory = storySegments.filter(s => !isDisclaimerSegment(s.text));
  const startTime = cleanStory.length > 0 ? cleanStory[0].start : 0;
  let endTime = startTime + 75;
  let transcript = "";

  if (cleanStory.length > 0) {
    const candidate = [];
    for (const seg of cleanStory) {
      if (seg.end - startTime > maxSeconds) break;
      candidate.push(seg);
      endTime = seg.end;
    }
    transcript = candidate.map(s => s.text.trim()).join(" ");
  }

  const duration = Math.max(Math.round(endTime - startTime), minSeconds);
  return {
    startTime,
    endTime,
    duration,
    transcript: transcript || "A wise fable about patience, honesty, and understanding the true value of actions."
  };
}

/**
 * Slice audio file with FFmpeg with volume normalization
 */
async function sliceAudioFile(inputPath, startTime, endTime, outputPath) {
  const duration = Math.max(1, endTime - startTime);
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss", String(startTime),
    "-t", String(duration),
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
    const prompt = `Analyze this English short story (about 1-2 minutes long) for an English speaking practice task where students listen and record a 1-minute summary video.

Story Transcript:
"""
${transcript}
"""

Raw Title: "${rawTitle}"

Respond ONLY with a valid JSON object with these exact keys:
{
  "topic": "Clean, attractive story title (e.g. 'The Boy Who Cried Wolf')",
  "theme": "Theme or moral (e.g. 'Honesty and Trust')",
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
              topic: parsed.topic.trim(),
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
 * Verified fallback public domain English stories (1 to 2 minutes)
 */
export const FALLBACK_STORIES = [
  {
    topic: "The Man and The Wooden Image",
    theme: "Self-Reliance & Resourcefulness",
    duration: 65,
    audioUrl: "https://archive.org/download/aesop_fables_volume_five_librivox/fables_05_01_aesop_64kb.mp3",
    storyTranscript: "A poor man had a wooden image of a sacred deity, to which he prayed daily for prosperity. Yet, despite all his devotion, he grew steadily poorer and fell into severe hardship. In bitter frustration, he seized the image by its legs and struck its head forcefully against the stone wall. To his great astonishment, the hollow head cracked open, and a hidden hoard of glittering gold coins tumbled across the floor. Gathering up the treasure, the man smiled wryly and remarked: 'What a strange idol you are! While I honored you with prayer, you offered me nothing; but once I broke you, you granted me riches beyond my dreams.'",
    summaryGuide: [
      "1. A struggling poor man prayed daily to a wooden image for wealth, but remained poor.",
      "2. In despair, he struck the statue against the wall, shattering its head.",
      "3. Hidden gold coins poured out from inside the broken image.",
      "4. Moral: Waiting passively rarely brings answers; decisive action often reveals unexpected opportunities."
    ],
    vocabulary: [
      { word: "prosperity", definition: "The state of being successful, flourishing, or having good fortune." },
      { word: "frustration", definition: "A feeling of dissatisfaction or anger resulting from unresolved problems." },
      { word: "resourcefulness", definition: "The ability to overcome difficulties with creative thinking." }
    ],
    question: "Listen to the 1-minute story and record a video summary in your own words. Explain the man's dilemma, what happened to the statue, and the lesson learned."
  },
  {
    topic: "Hercules and The Waggoner",
    theme: "Effort Before Expectation",
    duration: 85,
    audioUrl: "https://archive.org/download/aesop_fables_volume_five_librivox/fables_05_02_aesop_64kb.mp3",
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
    audioUrl: "https://archive.org/download/aesop_fables_volume_five_librivox/fables_05_05_aesop_64kb.mp3",
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
  }
];

/**
 * Downloads, slices, transcribes, and extracts metadata for a story episode.
 */
export async function processStoryAudioIntoChallenge(storyItem, options = {}) {
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

    console.log(`[StorySlicer] 🎯 Finding optimal 60s–120s story narrative window...`);
    const window = findOptimalStoryWindow(transcription.segments, 60, 120);

    console.log(`[StorySlicer] ✂️ Slicing clean story audio (${window.duration}s)...`);
    await sliceAudioFile(rawFile, window.startTime, window.endTime, slicedFile);

    // Upload sliced MP3 to Cloudflare R2
    const audioBuffer = await fs.promises.readFile(slicedFile);
    const r2Key = `story-audio/scraped-${Date.now()}.mp3`;

    console.log(`[StorySlicer] ☁️ Uploading sliced story to Cloudflare R2 (${r2Key})...`);
    let finalAudioUrl = "";
    try {
      const uploadRes = await uploadBufferToR2(audioBuffer, r2Key, "audio/mpeg");
      finalAudioUrl = uploadRes.url || (process.env.R2_PUBLIC_URL ? `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${r2Key}` : "");
    } catch (r2Err) {
      console.warn(`[StorySlicer] ⚠️ R2 upload notice:`, r2Err.message);
      finalAudioUrl = storyItem.audioUrl;
    }

    if (!finalAudioUrl) {
      finalAudioUrl = process.env.R2_PUBLIC_URL ? `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${r2Key}` : storyItem.audioUrl;
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
 * Main entry point: Generates a 1-2 minute English story challenge from RSS.
 * Automatically falls back to curated public domain stories if offline.
 */
export async function generateScrapedStoryChallenge(options = {}) {
  try {
    console.log("[StoryFeed] 📻 Starting automated RSS story scraping & slicing (1–2 min)...");
    const storyItem = await fetchAutomatedStoryFromRss();
    if (storyItem && storyItem.audioUrl) {
      const challenge = await processStoryAudioIntoChallenge(storyItem, options);
      if (challenge && challenge.audioUrl && challenge.storyTranscript) {
        console.log(`[StoryFeed] ✅ Successfully scraped & sliced story: "${challenge.topic}" (${challenge.duration}s)`);
        return challenge;
      }
    }
  } catch (err) {
    console.warn("[StoryFeed] ⚠️ Automated RSS story scraping failed, using curated fallback story:", err.message);
  }

  // Fallback to verified 1-2 minute public domain English stories
  const fallback = FALLBACK_STORIES[Math.floor(Math.random() * FALLBACK_STORIES.length)];
  return {
    success: true,
    ...fallback,
    sourceFeed: "Curated Classic English Fables Library"
  };
}
