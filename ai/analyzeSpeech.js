import fetch from "node-fetch";

// ---------------------------------------------------------------------------
// Filler word detection
//
// Two categories:
//   PURE_FILLERS  — words that are ALWAYS fillers (um, uh, er, etc.)
//   CONTEXT_FILLERS — words that are only fillers in specific positions
//                     (e.g. "like" as a discourse particle, not as a verb/preposition)
// ---------------------------------------------------------------------------

const PURE_FILLERS = [
  "um", "uh", "er", "uhh", "umm", "hmm",
];

// Context-sensitive fillers: only counted when they appear in filler positions.
// Each entry has a pattern that matches the filler usage but not the legitimate usage.
const CONTEXT_FILLER_PATTERNS = [
  // "like" as filler: preceded by comma/pause marker or followed by a clause
  // Matches: "it was, like, really" / "like I said" at sentence start / "and like he"
  // Does NOT match: "I like it" / "something like that" / "looks like"
  {
    name: "like",
    // filler "like" appears:
    // 1. after comma/and/but/so: ", like," or "and like " or "but like "
    // 2. at start of utterance: "like, " or "like I" (discourse opener)
    // 3. between words as hedge: "was like really" "is like so"
    regex: /(?:,\s*like\s*,|(?:^|[,.])\s*like\s*,|\band\s+like\b|\bbut\s+like\b|\bso\s+like\b|\bwas\s+like\b|\bis\s+like\b|\bwere\s+like\b|\bam\s+like\b|\bare\s+like\b|\bit'?s\s+like\b)/gi,
  },
  // "you know" — almost always a filler
  {
    name: "you know",
    regex: /\byou\s+know\b/gi,
  },
  // "i mean" — filler when used as a hedge/restart
  {
    name: "i mean",
    regex: /\bi\s+mean\b/gi,
  },
  // "basically" — filler when overused; count all occurrences
  {
    name: "basically",
    regex: /\bbasically\b/gi,
  },
  // "literally" — filler when used for emphasis (not literal meaning)
  // Hard to distinguish perfectly; count all as potential filler
  {
    name: "literally",
    regex: /\bliterally\b/gi,
  },
  // "kind of" / "sort of" — hedging fillers
  {
    name: "kind of",
    regex: /\bkind\s+of\b/gi,
  },
  {
    name: "sort of",
    regex: /\bsort\s+of\b/gi,
  },
  // "you see" — discourse filler
  {
    name: "you see",
    regex: /\byou\s+see\b/gi,
  },
  // "right" as filler: at end of clause or between clauses, not as adjective/direction
  // Matches: "right?" / ", right," / "right so" / "right okay"
  {
    name: "right",
    regex: /(?:\bright\s*\?|\bright\s*,|\bright\s+so\b|\bright\s+okay\b|\bright\s+and\b|,\s*right\b)/gi,
  },
  // "okay" as filler: sentence-initial or between clauses
  // Does NOT match "that's okay" / "I'm okay"
  {
    name: "okay",
    regex: /(?:^okay\b|,\s*okay\b|\bokay\s+so\b|\bokay\s+now\b|\bokay\s+let\b)/gim,
  },
  // "well" as filler: sentence-initial hedge
  // Does NOT match "well done" / "do well" / "as well"
  {
    name: "well",
    regex: /(?:^well\b|,\s*well\b|\bwell\s+I\b|\bwell\s+it\b|\bwell\s+the\b|\bwell\s+actually\b)/gim,
  },
  // "so" as filler: sentence-initial or after pause, not as conjunction meaning "therefore"
  // Only flag when repeated or at very start of utterance
  {
    name: "so",
    regex: /(?:^so\b|,\s*so\s*,)/gim,
  },
  // "actually" as filler: overused hedge
  {
    name: "actually",
    regex: /\bactually\b/gi,
  },
];

/**
 * Counts filler word occurrences in a transcript with context-awareness.
 * Pure fillers (um, uh) are always counted.
 * Context-sensitive fillers use position-aware patterns to avoid false positives.
 *
 * Returns an object like { um: 3, like: 2 }
 * Only includes fillers that appear 2+ times (single use may be legitimate).
 */
function detectFillerWords(text) {
  const lower = text.toLowerCase();
  const found = {};

  // Pure fillers — always count
  for (const filler of PURE_FILLERS) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      found[filler] = matches.length;
    }
  }

  // Context-sensitive fillers — use position-aware patterns
  for (const { name, regex } of CONTEXT_FILLER_PATTERNS) {
    // Reset lastIndex for global regexes
    regex.lastIndex = 0;
    const matches = lower.match(regex);
    const count = matches ? matches.length : 0;
    // Only flag if used 2+ times (once may be legitimate)
    if (count >= 2) {
      found[name] = count;
    }
  }

  return found;
}

/**
 * Calculates speaking pace in words per minute.
 * Uses actual spoken duration from Whisper timestamps.
 */
function calculatePace(text, durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) return null;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((wordCount / durationSeconds) * 60);
}

/**
 * Detects long pauses (>1.5s gaps between words) from word timestamps.
 */
function detectPauses(words, pauseThreshold = 1.5) {
  if (!words || words.length < 2) return [];
  const pauses = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= pauseThreshold) {
      pauses.push({
        after: words[i - 1].word.trim(),
        before: words[i].word.trim(),
        duration: Math.round(gap * 10) / 10,
      });
    }
  }
  return pauses;
}

/**
 * Analyzes the transcript using Groq Llama with a rich, detailed prompt.
 * Incorporates real audio stats from Whisper verbose_json.
 *
 * @param {string} transcript - Full spoken text
 * @param {number} durationSeconds - Actual spoken duration from Whisper
 * @param {object[]} words - Word-level timestamps from Whisper
 * @param {string|null} questionTopic - Today's daily question topic (optional)
 */
export async function analyzeSpeech(transcript, durationSeconds, words = [], questionTopic = null, questionText = null) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set in .env");

  // --- Compute real stats from Whisper data ---
  const fillerWords = detectFillerWords(transcript);
  const fillerTotal = Object.values(fillerWords).reduce((a, b) => a + b, 0);
  const wpm = calculatePace(transcript, durationSeconds);
  const pauses = detectPauses(words);
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;

  const mins = Math.floor(durationSeconds / 60);
  const secs = Math.round(durationSeconds % 60);
  const durationStr = `${mins}m ${secs}s`;

  // Format stats for the prompt
  const fillerSummary = Object.keys(fillerWords).length > 0
    ? Object.entries(fillerWords).map(([w, c]) => `"${w}" (${c}x)`).join(", ")
    : "none detected (speech was clean)";

  const pauseSummary = pauses.length > 0
    ? `${pauses.length} long pause(s) detected (>${1.5}s gaps)`
    : "no long pauses detected";

  const paceSummary = wpm
    ? `${wpm} words per minute (${wpm < 100 ? "slow" : wpm <= 150 ? "good" : "fast"})`
    : "unknown";

  const hasTopic = !!(questionTopic || questionText);
  const topicLine = hasTopic
    ? [
        questionTopic ? `Topic: "${questionTopic}"` : null,
        questionText  ? `Question asked: "${questionText}"` : null,
      ].filter(Boolean).join("\n- ")
    : "No specific topic provided.";

  const topicRelevanceGuide = hasTopic
    ? `- topicRelevance: how directly and thoroughly the speaker addressed the topic/question
    10 = entire speech is focused on the topic with specific details and examples
    8-9 = mostly on-topic with good coverage, minor tangents
    6-7 = partially on-topic, addresses the question but lacks depth or goes off-track
    4-5 = loosely related, mentions the topic briefly but mostly talks about something else
    2-3 = barely related, only 1-2 sentences touch the topic
    1 = completely off-topic, does not address the question at all
    IMPORTANT: Read the transcript carefully against the question. Give credit for any relevant content.`
    : `- topicRelevance: null (no topic was provided)`;

  const prompt = `You are an expert English speaking coach analyzing a student's spoken English video submission.

AUDIO STATS (measured objectively from the recording):
- Duration: ${durationStr}
- Word count: ${wordCount} words
- Speaking pace: ${paceSummary}
- Filler words: ${fillerSummary}
- Pauses: ${pauseSummary}

${hasTopic ? `TODAY'S SPEAKING TASK:
- ${topicLine}

IMPORTANT: The student was asked to speak about this specific topic. You MUST evaluate how well their transcript addresses it.` : "No specific topic was assigned."}

TRANSCRIPT:
${transcript.replace(/"/g, "'").replace(/\\/g, "")}

TASK: Analyze this spoken English and return ONLY a valid JSON object with this exact structure. No extra text, no markdown, no explanation — just the JSON:

{
  "fluency": <integer 1-10>,
  "grammar": <integer 1-10>,
  "confidence": <integer 1-10>,
  "vocabulary": <integer 1-10>,
  "grammarErrors": [
    { "original": "<exact phrase from transcript>", "correction": "<corrected version>", "rule": "<brief grammar rule>" }
  ],
  "strongPoints": ["<specific positive observation>"],
  "suggestions": ["<specific, actionable improvement tip>", "<tip 2>", "<tip 3>"],
  "topicRelevance": <integer 1-10 or null>,
  "vocabularyHighlights": {
    "strong": ["<good word/phrase they used>"],
    "weak": ["<basic word they could upgrade>"]
  },
  "overallComment": "<2-3 sentence personalized summary of their performance>"
}

SCORING GUIDE:
- fluency: flow of speech, natural rhythm, absence of excessive pauses/fillers
- grammar: correctness of tenses, articles, prepositions, sentence structure
- confidence: assertiveness, clarity, not trailing off
- vocabulary: range and appropriateness of words used
${topicRelevanceGuide}

RULES:
- grammarErrors: list up to 4 real mistakes found in the transcript with exact quotes
- suggestions: make them specific to THIS transcript, not generic advice
- strongPoints: find at least 1-2 genuine positives
- If filler words were detected, address them in suggestions
- If pace is too fast or slow, mention it
- Keep overallComment encouraging but honest
- IMPORTANT: All string values in the JSON must use only single quotes inside text, never double quotes`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq analysis failed: ${err}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content.trim();

  // Extract JSON — handle markdown code blocks and stray text
  let jsonStr = raw;

  // Strip markdown code fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    // Find the outermost { ... }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      jsonStr = raw.slice(start, end + 1);
    }
  }

  // Fix common Llama JSON issues:
  // 1. Unescaped double quotes inside string values → replace with single quotes
  // 2. Trailing commas before } or ]
  jsonStr = jsonStr
    .replace(/,\s*([}\]])/g, "$1")  // remove trailing commas
    .replace(/[\u0000-\u001F]/g, " "); // remove control characters

  let scores;
  try {
    scores = JSON.parse(jsonStr);
  } catch (parseErr) {
    // Last resort: try to extract just the numeric scores with regex
    console.error("JSON parse failed, raw response:", raw.slice(0, 500));
    throw new Error(`Failed to parse Llama response as JSON: ${parseErr.message}`);
  }

  return {
    ...scores,
    // Attach computed stats so feedback.js can use them
    _stats: {
      duration: durationStr,
      wpm,
      fillerWords,
      fillerTotal,
      pauses: pauses.length,
      wordCount,
    },
  };
}
