import fetch from "node-fetch";

// Common filler words to detect
const FILLER_WORDS = [
  "um", "uh", "like", "you know", "basically", "literally",
  "actually", "so", "right", "okay", "well", "i mean",
  "kind of", "sort of", "you see",
];

/**
 * Counts filler word occurrences in a transcript.
 * Returns an object like { um: 3, like: 2 }
 */
function detectFillerWords(text) {
  const lower = text.toLowerCase();
  const found = {};

  for (const filler of FILLER_WORDS) {
    // Match whole word/phrase occurrences
    const regex = new RegExp(`\\b${filler.replace(" ", "\\s+")}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      found[filler] = matches.length;
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
export async function analyzeSpeech(transcript, durationSeconds, words = [], questionTopic = null) {
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
    : "none detected";

  const pauseSummary = pauses.length > 0
    ? `${pauses.length} long pause(s) detected (>${1.5}s gaps)`
    : "no long pauses detected";

  const paceSummary = wpm
    ? `${wpm} words per minute (${wpm < 100 ? "slow" : wpm <= 150 ? "good" : "fast"})`
    : "unknown";

  const topicLine = questionTopic
    ? `Today's speaking topic: "${questionTopic}"`
    : "No specific topic provided.";

  const prompt = `You are an expert English speaking coach analyzing a student's spoken English video submission.

AUDIO STATS (measured objectively from the recording):
- Duration: ${durationStr}
- Word count: ${wordCount} words
- Speaking pace: ${paceSummary}
- Filler words: ${fillerSummary}
- Pauses: ${pauseSummary}
- ${topicLine}

TRANSCRIPT:
"${transcript}"

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
  "topicRelevance": <integer 1-10 — how well they addressed the topic, or null if no topic>,
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

RULES:
- grammarErrors: list up to 4 real mistakes found in the transcript with exact quotes
- suggestions: make them specific to THIS transcript, not generic advice
- strongPoints: find at least 1-2 genuine positives
- If filler words were detected, address them in suggestions
- If pace is too fast or slow, mention it
- Keep overallComment encouraging but honest`;

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
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq analysis failed: ${err}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content.trim();

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in Llama response");

  const scores = JSON.parse(jsonMatch[0]);

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
