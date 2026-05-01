import fetch from "node-fetch";
import { checkGrammar } from "./grammarCheck.js";
import { getTextKey, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";

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
/**
 * Fixes unescaped double quotes inside JSON string values.
 * Walks the string char-by-char tracking structural vs content quotes.
 * e.g. "correction": "foo" or "bar"  →  "correction": "foo' or 'bar"
 */
function fixUnescapedQuotes(str) {
  let result = "";
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (ch === "\\") {
      // escaped character — pass through as-is
      result += ch + (str[i + 1] || "");
      i += 2;
      continue;
    }
    if (ch === '"') {
      if (!inString) {
        // Opening quote of a JSON string
        inString = true;
        result += ch;
      } else {
        // Could be closing quote or an unescaped quote inside the value.
        // Peek ahead: if followed by structural chars (:,}]) with optional whitespace → it's closing
        const rest = str.slice(i + 1).trimStart();
        if (rest === "" || /^[,\}\]:]/.test(rest)) {
          inString = false;
          result += ch;
        } else {
          // Unescaped quote inside a string value — replace with single quote
          result += "'";
        }
      }
      i++;
      continue;
    }
    result += ch;
    i++;
  }
  return result;
}

const MAX_TRANSCRIPT_CHARS = 3000;

/**
 * Splits a transcript into two halves at a word boundary near the midpoint.
 */
function splitTranscript(text) {
  const mid = Math.floor(text.length / 2);
  // Walk back from midpoint to find a space
  let splitAt = mid;
  while (splitAt > 0 && text[splitAt] !== " ") splitAt--;
  if (splitAt === 0) splitAt = mid; // fallback: hard split
  return [text.slice(0, splitAt).trim(), text.slice(splitAt).trim()];
}

/**
 * Merges two Llama score objects from split-transcript analysis into one.
 * Numeric scores are averaged; arrays are deduped and combined; strings pick the better half.
 */
function mergeScores(a, b) {
  const avg = (x, y) => {
    const nx = typeof x === "number" ? x : null;
    const ny = typeof y === "number" ? y : null;
    if (nx === null && ny === null) return null;
    if (nx === null) return ny;
    if (ny === null) return nx;
    return Math.round((nx + ny) / 2);
  };

  const dedup = (...arrays) => [...new Set(arrays.flat().filter(Boolean))];

  // For topic relevance: average only if both non-null
  const topicRelevance = avg(a.topicRelevance, b.topicRelevance);

  // For topicFeedback: combine both observations
  const topicFeedback = [a.topicFeedback, b.topicFeedback]
    .filter(Boolean)
    .join(" ")
    .trim() || null;

  // CEFR: pick the higher level (more conservative = better for the student)
  const cefrOrder = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const cefrA = cefrOrder.indexOf(a.cefrLevel ?? "");
  const cefrB = cefrOrder.indexOf(b.cefrLevel ?? "");
  const cefrLevel = cefrA >= cefrB ? a.cefrLevel : b.cefrLevel;

  // Grammar errors: merge and dedup by original text, cap at 6
  const seenOriginals = new Set();
  const grammarErrors = [...(a.grammarErrors ?? []), ...(b.grammarErrors ?? [])]
    .filter(e => {
      const key = e.original?.toLowerCase().trim();
      if (!key || seenOriginals.has(key)) return false;
      seenOriginals.add(key);
      return true;
    })
    .slice(0, 6);

  return {
    fluency:    avg(a.fluency,    b.fluency),
    grammar:    avg(a.grammar,    b.grammar),
    confidence: avg(a.confidence, b.confidence),
    vocabulary: avg(a.vocabulary, b.vocabulary),
    grammarErrors,
    strongPoints: dedup(a.strongPoints, b.strongPoints).slice(0, 4),
    suggestions:  dedup(a.suggestions,  b.suggestions).slice(0, 4),
    topicRelevance,
    topicFeedback,
    pronunciationNote: a.pronunciationNote || b.pronunciationNote || null,
    rhythmNote:        a.rhythmNote        || b.rhythmNote        || null,
    cefrLevel,
    vocabularyHighlights: {
      strong: dedup(a.vocabularyHighlights?.strong, b.vocabularyHighlights?.strong).slice(0, 4),
      weak:   dedup(a.vocabularyHighlights?.weak,   b.vocabularyHighlights?.weak).slice(0, 4),
    },
    overallComment: [a.overallComment, b.overallComment].filter(Boolean).join(" ").trim(),
  };
}

export async function analyzeSpeech(transcript, durationSeconds, words = [], questionTopic = null, questionText = null, pronunciationIssues = [], rhythm = null) {

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

  // Stat-based score anchors — give the LLM concrete starting points
  // so scores are grounded in measured data, not just impression.
  const fluencyAnchor = (() => {
    let score = 7; // baseline
    if (fillerTotal > 10) score -= 2;
    else if (fillerTotal > 5) score -= 1;
    if (pauses.length > 5) score -= 1;
    else if (pauses.length === 0) score += 1;
    if (wpm && (wpm < 80 || wpm > 180)) score -= 1;
    if (rhythm?.paceConsistency !== null && rhythm?.paceConsistency < 5) score -= 1;
    return Math.max(1, Math.min(10, score));
  })();

  const confidenceAnchor = (() => {
    let score = 7;
    if (fillerTotal > 8) score -= 1;
    if (pauses.length > 4) score -= 1;
    if (wpm && wpm < 90) score -= 1; // very slow = hesitant
    if (rhythm?.speechRatio !== null && rhythm.speechRatio < 55) score -= 1; // too much silence
    return Math.max(1, Math.min(10, score));
  })();

  const hasTopic = !!(questionTopic || questionText);

  // Pronunciation summary for prompt
  const pronunciationSummary = pronunciationIssues.length > 0
    ? `Possibly unclear words (low Whisper confidence): ${pronunciationIssues.map(w => `"${w}"`).join(", ")}`
    : "No pronunciation issues detected";

  // Rhythm summary for prompt
  let rhythmSummary = "";
  if (rhythm) {
    const parts = [];
    if (rhythm.speechRatio !== null) parts.push(`${rhythm.speechRatio}% of time speaking (rest is silence/pauses)`);
    if (rhythm.longestPause > 2) parts.push(`longest pause: ${rhythm.longestPause}s after "${rhythm.longestPauseAfter}"`);
    if (rhythm.rushesAtStart) parts.push("rushes at the start of speech");
    if (rhythm.rushesAtEnd) parts.push("speeds up toward the end");
    if (rhythm.paceConsistency !== null) parts.push(`pace consistency: ${rhythm.paceConsistency}/10`);
    rhythmSummary = parts.length > 0 ? parts.join(", ") : "normal rhythm";
  }  const topicLine = hasTopic
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
    IMPORTANT: Read the transcript carefully against the question. Give credit for any relevant content.
- topicFeedback: 1-2 sentences explaining specifically what the student covered from the topic and what key points were missing. Be specific — mention actual content from their speech.`
    : `- topicRelevance: null (no topic was provided)
- topicFeedback: null`;

  // ---------------------------------------------------------------------------
  // Build prompt for a given transcript chunk (used for both single + split mode)
  // ---------------------------------------------------------------------------
  const buildPrompt = (transcriptChunk, partLabel = null) => {
    const partNote = partLabel ? `\nNOTE: This is ${partLabel} of the full transcript. Score accordingly.\n` : "";
    return `You are an expert English speaking coach analyzing a student's spoken English video submission.

AUDIO STATS (measured objectively from the recording):
- Duration: ${durationStr}
- Word count: ${wordCount} words
- Speaking pace: ${paceSummary}
- Filler words: ${fillerSummary}
- Pauses: ${pauseSummary}
- Pronunciation clarity: ${pronunciationSummary}
- Speaking rhythm: ${rhythmSummary || "not available"}
${partNote}
${hasTopic ? `TODAY'S SPEAKING TASK:
- ${topicLine}

IMPORTANT: The student was asked to speak about this specific topic. You MUST evaluate how well their transcript addresses it.` : "No specific topic was assigned."}

TRANSCRIPT:
${transcriptChunk.replace(/"/g, "'").replace(/\\/g, "")}

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
  "topicFeedback": "<1-2 sentences explaining what they covered well and what was missing from the topic, or null if no topic>",
  "pronunciationNote": "<1 sentence about pronunciation clarity, or null if no issues detected>",
  "rhythmNote": "<1 sentence about speaking rhythm and pace consistency, or null if rhythm data unavailable>",
  "cefrLevel": "<estimated CEFR level: A1/A2/B1/B2/C1/C2>",
  "vocabularyHighlights": {
    "strong": ["<good word/phrase they used>"],
    "weak": ["<basic word they could upgrade>"]
  },
  "overallComment": "<2-3 sentence personalized summary of their performance>"
}

SCORING GUIDE:
- fluency: flow of speech, natural rhythm, absence of excessive pauses/fillers
  → Stat-based anchor: ${fluencyAnchor}/10 (adjust ±1-2 based on transcript quality)
- grammar: correctness of tenses, articles, prepositions, sentence structure
- confidence: assertiveness, clarity, not trailing off
  → Stat-based anchor: ${confidenceAnchor}/10 (adjust ±1-2 based on transcript tone)
- vocabulary: range and appropriateness of words used
- cefrLevel: assess the OVERALL spoken English level using ALL of these signals together:
    VOCABULARY: word range, precision, idioms, collocations
    GRAMMAR: tense variety, clause complexity, passive/conditional use, article/preposition accuracy
    SENTENCE STRUCTURE: simple vs compound vs complex sentences, subordination, discourse connectors
    CEFR RUBRIC:
      A1 — very basic words only (go, have, like, good), present tense only, 3-5 word sentences
      A2 — simple everyday vocabulary, mostly present/past simple, short sentences, frequent errors
      B1 — common vocabulary with some variety, can use past/future/present perfect, some complex sentences but errors remain, can express opinions simply
      B2 — good range of vocabulary, uses a variety of tenses accurately, compound-complex sentences, some idiomatic language, minor errors
      C1 — wide vocabulary including less common words, flexible grammar, sophisticated sentence structures, rare errors, natural discourse markers
      C2 — near-native vocabulary precision, full grammatical range, nuanced expression, virtually no errors
    IMPORTANT: Base this on the TRANSCRIPT content, not just word count. A short transcript with complex grammar can be B2. A long transcript with only simple words is A2.
- pronunciationNote: comment on the unclear words listed above if any; otherwise note clean pronunciation
- rhythmNote: comment on the rhythm stats above — mention if they rush, have good flow, or inconsistent pace
${topicRelevanceGuide}

RULES:
- grammarErrors: list up to 4 real mistakes found in the transcript with exact quotes
- suggestions: make them specific to THIS transcript, not generic advice
- strongPoints: find at least 1-2 genuine positives
- If filler words were detected, address them in suggestions
- If pace is too fast or slow, mention it
- Keep overallComment encouraging but honest
- IMPORTANT: All string values in the JSON must use only single quotes inside text, never double quotes. For grammar corrections with alternatives, use "X or Y" format without inner quotes.`;
  };

  // ---------------------------------------------------------------------------
  // Helper: send one prompt to Llama and parse the JSON response
  // ---------------------------------------------------------------------------
  const llamaCall = async (prompt) => {
    while (true) {
      const apiKey = getTextKey();
      if (!apiKey) throw new Error("All Groq API keys exhausted — speech analysis unavailable");

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 2000,
        }),
      });

      if (res.status === 429) {
        const errText = await res.text();
        markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
        continue;
      }

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Groq analysis failed: ${err}`);
      }

      const data = await res.json();
      const raw = data.choices[0].message.content.trim();

      let jsonStr = raw;
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      } else {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) jsonStr = raw.slice(start, end + 1);
      }

      jsonStr = jsonStr
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u0000-\u001F]/g, " ");
      jsonStr = fixUnescapedQuotes(jsonStr);

      try {
        return JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error("JSON parse failed, raw response:", raw.slice(0, 500));
        // Attempt to salvage a truncated response by closing open structures
        try {
          // Count open braces/brackets to close them
          let fixed = jsonStr;
          const openBraces = (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length;
          const openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
          // Remove trailing incomplete property (cut at last complete comma or opening)
          fixed = fixed.replace(/,\s*"[^"]*"\s*:\s*[^,}\]]*$/, '');
          fixed = fixed.replace(/,\s*\{[^}]*$/, '');
          for (let i = 0; i < openBrackets; i++) fixed += ']';
          for (let i = 0; i < openBraces; i++) fixed += '}';
          fixed = fixed.replace(/,\s*([}\]])/g, '$1');
          const recovered = JSON.parse(fixed);
          console.log('[Speech] Recovered partial JSON response');
          return recovered;
        } catch (_) {
          throw new Error(`Failed to parse Llama response as JSON: ${parseErr.message}`);
        }
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Run Llama (single or split) + LanguageTool in parallel
  // ---------------------------------------------------------------------------
  let scores;
  if (transcript.length <= MAX_TRANSCRIPT_CHARS) {
    // Short transcript — single call
    console.log(`[Speech] transcript ${transcript.length} chars — single Llama call`);
    const [result, ltErrors] = await Promise.all([
      llamaCall(buildPrompt(transcript)),
      checkGrammar(transcript),
    ]);
    scores = result;
    scores.grammarErrors = mergeGrammarErrors(scores.grammarErrors || [], ltErrors);
  } else {
    // Long transcript — split into 2 halves, fire both in parallel
    const [half1, half2] = splitTranscript(transcript);
    console.log(`[Speech] transcript ${transcript.length} chars — split Llama calls (${half1.length} + ${half2.length} chars)`);
    const [result1, result2, ltErrors] = await Promise.all([
      llamaCall(buildPrompt(half1, "the first half")),
      llamaCall(buildPrompt(half2, "the second half")),
      checkGrammar(transcript),
    ]);
    scores = mergeScores(result1, result2);
    scores.grammarErrors = mergeGrammarErrors(scores.grammarErrors || [], ltErrors);
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
      pronunciationIssues,
      rhythm,
      // Use LLM-assessed CEFR level — more accurate than word-list lookup
      cefrLevel: scores.cefrLevel
        ? { level: scores.cefrLevel, description: cefrDescriptions[scores.cefrLevel] ?? "" }
        : null,
    },
  };
}

/**
 * Human-readable descriptions for each CEFR level shown in the report.
 */
const cefrDescriptions = {
  A1: "beginner — basic words and phrases only",
  A2: "elementary — simple everyday vocabulary",
  B1: "intermediate — can express opinions on familiar topics",
  B2: "upper-intermediate — good range, handles complex topics",
  C1: "advanced — wide vocabulary, flexible grammar",
  C2: "proficient — near-native precision and fluency",
};

/**
 * Merges AI-detected grammar errors with LanguageTool errors.
 * AI errors take priority; LT errors are appended if not already covered.
 * Total capped at 6 errors.
 */
function mergeGrammarErrors(aiErrors, ltErrors) {
  const seen = new Set(
    aiErrors.map((e) => e.original?.toLowerCase().trim()).filter(Boolean)
  );
  const merged = [...aiErrors];
  for (const e of ltErrors) {
    if (!seen.has(e.original?.toLowerCase().trim())) {
      merged.push(e);
      seen.add(e.original?.toLowerCase().trim());
    }
    if (merged.length >= 6) break;
  }
  return merged;
}


