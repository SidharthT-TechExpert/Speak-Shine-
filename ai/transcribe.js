import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

// Segments with avg_logprob below this threshold are likely hallucinated — exclude them
const SEGMENT_CONFIDENCE_THRESHOLD = -0.8;

// Words with probability below this are likely mispronounced or unclear
const WORD_CLARITY_THRESHOLD = 0.4;

/**
 * Transcribes audio using Groq Whisper verbose_json mode.
 * Returns rich data: filtered text, word-level timestamps, segments,
 * duration, pronunciation issues, and rhythm stats.
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

  const allWords = data.words || [];
  const allSegments = data.segments || [];

  // -------------------------------------------------------------------------
  // 1. Segment-level confidence filtering
  //    Remove segments that Whisper is very uncertain about (hallucinations).
  //    Keep all segments if none pass the threshold (safety fallback).
  // -------------------------------------------------------------------------
  const confidentSegments = allSegments.filter(
    (seg) => (seg.avg_logprob ?? 0) >= SEGMENT_CONFIDENCE_THRESHOLD
  );
  const filteredSegments = confidentSegments.length > 0 ? confidentSegments : allSegments;

  // Build a set of time ranges from confident segments
  const confidentRanges = filteredSegments.map((s) => ({ start: s.start, end: s.end }));

  // Filter words to only those within confident segment ranges
  const filteredWords = allWords.filter((w) =>
    confidentRanges.some((r) => w.start >= r.start - 0.1 && w.end <= r.end + 0.1)
  );

  const words = filteredWords.length > 0 ? filteredWords : allWords;

  // Rebuild clean transcript from confident segments
  const text = filteredSegments.length > 0
    ? filteredSegments.map((s) => s.text.trim()).join(" ").trim()
    : (data.text || "").trim();

  // -------------------------------------------------------------------------
  // 2. Pronunciation scoring — find words Whisper was uncertain about
  //    These are words the model had low confidence transcribing, which
  //    usually means they were unclear, mispronounced, or heavily accented.
  // -------------------------------------------------------------------------
  const unclearWords = words
    .filter((w) => {
      const prob = w.probability ?? w.avg_logprob ?? null;
      return prob !== null && prob < WORD_CLARITY_THRESHOLD;
    })
    .map((w) => w.word.trim().toLowerCase().replace(/[^a-z']/g, ""))
    .filter((w) => w.length > 2); // skip very short words

  // Deduplicate
  const pronunciationIssues = [...new Set(unclearWords)].slice(0, 8);

  // -------------------------------------------------------------------------
  // 6. Speaking rhythm analysis from word timestamps
  // -------------------------------------------------------------------------
  const rhythm = analyzeRhythm(words);

  // Calculate actual spoken duration from word timestamps
  let spokenDuration = data.duration || 0;
  if (words.length > 0) {
    const lastWord = words[words.length - 1];
    spokenDuration = lastWord.end || spokenDuration;
  } else if (filteredSegments.length > 0) {
    const lastSeg = filteredSegments[filteredSegments.length - 1];
    spokenDuration = lastSeg.end || spokenDuration;
  }

  const droppedSegments = allSegments.length - filteredSegments.length;
  if (droppedSegments > 0) {
    console.log(`🔍 Whisper confidence filter: dropped ${droppedSegments}/${allSegments.length} low-confidence segments`);
  }
  if (pronunciationIssues.length > 0) {
    console.log(`🗣️ Pronunciation issues detected: ${pronunciationIssues.join(", ")}`);
  }

  return {
    text,
    words,
    segments: filteredSegments,
    duration: spokenDuration,
    pronunciationIssues,  // words that were unclear/mispronounced
    rhythm,               // speaking rhythm stats
  };
}

/**
 * Analyzes speaking rhythm from word-level timestamps.
 * Returns structured stats about pace consistency, rush patterns, and silence ratio.
 *
 * @param {Array<{word: string, start: number, end: number}>} words
 * @returns {object}
 */
function analyzeRhythm(words) {
  if (!words || words.length < 3) {
    return { speechRatio: null, longestPause: null, rushesAtStart: false, rushesAtEnd: false, paceConsistency: null };
  }

  const totalDuration = words[words.length - 1].end - words[0].start;
  if (totalDuration <= 0) return { speechRatio: null, longestPause: null, rushesAtStart: false, rushesAtEnd: false, paceConsistency: null };

  // Total time actually speaking (sum of word durations)
  const speakingTime = words.reduce((sum, w) => sum + (w.end - w.start), 0);
  const speechRatio = Math.round((speakingTime / totalDuration) * 100); // % of time speaking

  // Find the longest pause
  let longestPause = 0;
  let longestPauseAfter = "";
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > longestPause) {
      longestPause = gap;
      longestPauseAfter = words[i - 1].word.trim();
    }
  }

  // Detect rushing: compare WPM in first 20% vs last 20% of speech
  const cutoff = Math.floor(words.length * 0.2);
  const startWords = words.slice(0, Math.max(cutoff, 3));
  const endWords = words.slice(Math.max(words.length - cutoff, words.length - 3));

  const startDuration = startWords[startWords.length - 1].end - startWords[0].start;
  const endDuration = endWords[endWords.length - 1].end - endWords[0].start;

  const startWpm = startDuration > 0 ? (startWords.length / startDuration) * 60 : 0;
  const endWpm = endDuration > 0 ? (endWords.length / endDuration) * 60 : 0;

  const rushesAtStart = startWpm > 180 && startWpm > endWpm * 1.3;
  const rushesAtEnd = endWpm > 180 && endWpm > startWpm * 1.3;

  // Pace consistency: measure WPM variance across 5-second sliding windows.
  // More meaningful than inter-word gap stdDev — captures speed changes a listener notices.
  let paceConsistency = null;
  if (words.length >= 10) {
    const windowSec = 5;
    const windowWpms = [];
    let winStart = words[0].start;
    const totalEnd = words[words.length - 1].end;

    while (winStart + windowSec <= totalEnd + 0.5) {
      const winEnd = winStart + windowSec;
      const winWords = words.filter(w => w.start >= winStart && w.end <= winEnd);
      if (winWords.length >= 2) {
        const actualDur = winWords[winWords.length - 1].end - winWords[0].start;
        if (actualDur > 0) windowWpms.push((winWords.length / actualDur) * 60);
      }
      winStart += 2.5; // 50% overlap for smoother measurement
    }

    if (windowWpms.length >= 3) {
      const mean = windowWpms.reduce((a, b) => a + b, 0) / windowWpms.length;
      const variance = windowWpms.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / windowWpms.length;
      const stdDev = Math.sqrt(variance);
      // Calibrated scale based on WPM stdDev across windows:
      //   < 15 wpm variation  → 9-10 (very consistent, professional)
      //   15-30 wpm variation → 7-8  (good, natural variation)
      //   30-50 wpm variation → 5-6  (noticeable inconsistency)
      //   50-70 wpm variation → 3-4  (significant speed changes)
      //   > 70 wpm variation  → 1-2  (very erratic)
      paceConsistency = Math.max(1, Math.min(10, Math.round(10 - stdDev / 8)));
    }
  }

  return {
    speechRatio,                                          // % of time actually speaking
    longestPause: Math.round(longestPause * 10) / 10,    // seconds
    longestPauseAfter,                                    // word before the longest pause
    rushesAtStart,                                        // speaks too fast at beginning
    rushesAtEnd,                                          // speeds up toward the end
    paceConsistency,                                      // 1-10 score
  };
}
