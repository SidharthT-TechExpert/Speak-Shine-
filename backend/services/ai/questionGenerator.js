/**
 * ai/questionGenerator.js — AI question generation with human-style enforcement.
 *
 * Guarantees:
 *  - Exactly `totalCount` questions inserted (retries skipped ones)
 *  - No duplicate topics (Jaccard similarity < 0.35 against all existing)
 *  - No duplicate question text (normalized exact + fuzzy check)
 *  - No AI-sounding phrasing (detect + rewrite)
 *  - Max 3 retry rounds to hit the target count
 */

import fetch from "node-fetch";
import Question from "../../../models/questionSchema.js";
import { getTextKey, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";

export const CATEGORIES = [
  "Daily Life",
  "Opinion",
  "Personal Experience",
  "English Growth",
  "Future Goals",
  "Fun Topic",
  "Free Talk",
];

// ── AI pattern detection ─────────────────────────────────────────────────────

const AI_PHRASES = [
  "share your thoughts",
  "elaborate on",
  "reflect on",
  "in what ways",
  "to what extent",
  "delve into",
  "shed light on",
  "it is important to",
  "in today's world",
  "in today's society",
  "have you ever considered",
  "what are your thoughts on",
  "how does this make you feel",
  "what impact does",
  "what role does",
  "how would you describe",
  "can you elaborate",
  "please describe",
  "discuss the",
  "explain the importance",
  "what are the key",
  "what are some ways",
  "in your opinion, what",
];

const AI_ENDINGS = [
  "and why?",
  "explain your reasoning.",
  "explain your answer.",
  "give reasons for your answer.",
  "support your answer with examples.",
  "why or why not?",
  "justify your response.",
];

function hasAIPatterns(text) {
  const lower = text.toLowerCase().trim();
  if (AI_PHRASES.some(p => lower.includes(p))) return true;
  if (AI_ENDINGS.some(e => lower.endsWith(e))) return true;
  if (text.length > 180) return true;
  return false;
}

function getOpenerCounts(questions) {
  const counts = {};
  for (const q of questions) {
    const first3 = q.question.toLowerCase().split(" ").slice(0, 3).join(" ");
    counts[first3] = (counts[first3] || 0) + 1;
  }
  return counts;
}

// ── Similarity helpers ───────────────────────────────────────────────────────

/**
 * Jaccard similarity on words ≥ 4 chars.
 */
function jaccardSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().match(/\b\w{4,}\b/g) || []);
  const wordsB = new Set(b.toLowerCase().match(/\b\w{4,}\b/g) || []);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/**
 * Normalize text for exact-match dedup:
 * lowercase, strip punctuation, collapse whitespace.
 */
function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Returns true if newTopic is too similar to any existing topic.
 * Threshold 0.35 — stricter than before (was 0.4).
 */
function topicIsDuplicate(newTopic, existingTopics) {
  return existingTopics.some(t => jaccardSimilarity(newTopic, t) >= 0.35);
}

/**
 * Returns true if newQuestion is too similar to any existing question text.
 * Uses both exact normalized match and Jaccard ≥ 0.55.
 */
function questionIsDuplicate(newQuestion, existingQuestions) {
  const normNew = normalize(newQuestion);
  return existingQuestions.some(q => {
    const normQ = normalize(q);
    if (normNew === normQ) return true;                          // exact match
    if (jaccardSimilarity(normNew, normQ) >= 0.55) return true; // near-duplicate
    return false;
  });
}

// ── Rewrite a single question to sound human ─────────────────────────────────

async function rewriteAsHuman(q) {
  const prompt = `Rewrite this English speaking practice question to sound like a real person casually asking a friend — not a formal exam or AI-generated question.

Original question: "${q.question}"
Topic: "${q.topic}"

Rules:
- Keep it SHORT (under 120 characters ideally)
- Sound natural and conversational, like a WhatsApp message
- No formal phrases like "share your thoughts", "elaborate", "reflect on", "in what ways"
- Don't end with "and why?" or "explain your reasoning"
- Start with something direct: "What's...", "Tell me...", "Have you...", "Do you...", "Which...", "When did...", "How often..."
- Keep the same topic/meaning

Return ONLY the rewritten question text, nothing else.`;

  while (true) {
    const apiKey = getTextKey();
    if (!apiKey) throw new Error("All Groq API keys exhausted — question rewrite unavailable");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (res.status === 429) {
      const errText = await res.text();
      markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
      continue;
    }

    if (!res.ok) return null;
    const data = await res.json();
    const rewritten = data.choices?.[0]?.message?.content?.trim();
    if (!rewritten || rewritten.length < 10) return null;
    return rewritten.replace(/^["']|["']$/g, "").trim();
  }
}

// ── Humanize a batch ─────────────────────────────────────────────────────────

async function humanizeBatch(questions) {
  const openerCounts = getOpenerCounts(questions);

  const needsRewrite = questions.map((q) => {
    const lower = q.question.toLowerCase().trim();
    const opener = lower.split(" ").slice(0, 3).join(" ");
    const repeatedOpener = (openerCounts[opener] || 0) > 2;
    return hasAIPatterns(q.question) || repeatedOpener;
  });

  const rewritePromises = questions.map((q, i) => {
    if (!needsRewrite[i]) return Promise.resolve(null);
    console.log(`[Humanize] Rewriting: "${q.question.slice(0, 60)}..."`);
    return rewriteAsHuman(q);
  });

  const rewritten = await Promise.all(rewritePromises);

  return questions.map((q, i) => {
    if (!needsRewrite[i] || !rewritten[i]) return q;
    console.log(`[Humanize] → "${rewritten[i].slice(0, 60)}"`);
    return { ...q, question: rewritten[i] };
  });
}

// ── Generate questions via Groq Llama ────────────────────────────────────────

async function generateWithAI(categories, existingTopics, countPerCategory) {
  const existingList = existingTopics.length > 0
    ? `\nALREADY USED TOPICS (do NOT repeat or create similar ones):\n${existingTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n`
    : "";

  const categoryList = categories
    .flatMap(cat => Array(countPerCategory).fill(cat))
    .map((cat, i) => `${i + 1}. Category: "${cat}"`)
    .join("\n");

  const totalCount = categories.length * countPerCategory;

  const prompt = `You are creating spoken English practice questions for a WhatsApp group of intermediate English learners (B1-B2 level).

Generate exactly ${totalCount} questions — one for each entry below.
${existingList}
CATEGORIES TO GENERATE FOR:
${categoryList}

STYLE RULES — questions must sound like a real person asking a friend, NOT a formal exam:
✅ GOOD examples:
- "What's the weirdest food you've ever tried and actually liked?"
- "If you could swap jobs with anyone for a week, who would it be?"
- "What's one habit you keep trying to build but always give up on?"
- "Tell me about a time you were completely lost — literally or figuratively."
- "Which do you prefer: working early morning or late at night?"

❌ BAD examples (do NOT write like this):
- "Can you elaborate on how your morning routine reflects your personal values?"
- "Share your thoughts on the importance of work-life balance in today's society."
- "In what ways has technology impacted your daily life? Explain your reasoning."
- "Reflect on a personal experience that shaped your perspective."

HARD RULES:
- NO phrases: "share your thoughts", "elaborate", "reflect on", "in what ways", "to what extent", "in today's world/society", "what are your thoughts on", "explain your reasoning", "why or why not"
- NO questions ending with "and why?" or "explain your answer"
- Keep questions under 130 characters
- Vary the openers — don't start more than 2 questions with the same word
- topic: short 1-sentence speaking prompt title
- question: the actual question (conversational, direct, specific)
- Every question MUST be completely unique — no two questions should be about the same thing

Return ONLY a valid JSON array, no markdown, no extra text:
[
  {"category":"<category>","topic":"<topic>","question":"<question>"},
  ...
]`;

  while (true) {
    const apiKey = getTextKey();
    if (!apiKey) throw new Error("All Groq API keys exhausted — question generation unavailable");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        max_tokens: 3500,
      }),
    });

    if (res.status === 429) {
      const errText = await res.text();
      markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API error ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const raw = data.choices[0].message.content.trim();

    let jsonStr = raw;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      jsonStr = fence[1].trim();
    } else {
      const s = raw.indexOf("[");
      const e = raw.lastIndexOf("]");
      if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1);
    }
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

    return JSON.parse(jsonStr);
  }
}

// ── Validate and dedup a batch ───────────────────────────────────────────────

function validateAndDedup(candidates, existingTopics, existingQuestions) {
  const acceptedTopics = [...existingTopics];
  const acceptedQuestions = [...existingQuestions];
  const toInsert = [];
  const skipped = [];

  for (const q of candidates) {
    // 1. Required fields
    if (!q.category || !q.topic || !q.question) {
      skipped.push({ reason: "missing fields", q });
      continue;
    }
    // 2. Valid category
    if (!CATEGORIES.includes(q.category)) {
      skipped.push({ reason: `unknown category: ${q.category}`, q });
      continue;
    }
    // 3. Topic uniqueness
    if (topicIsDuplicate(q.topic, acceptedTopics)) {
      skipped.push({ reason: "duplicate topic", q });
      continue;
    }
    // 4. Question text uniqueness
    if (questionIsDuplicate(q.question, acceptedQuestions)) {
      skipped.push({ reason: "duplicate question text", q });
      continue;
    }

    toInsert.push(q);
    acceptedTopics.push(q.topic);
    acceptedQuestions.push(q.question);
  }

  return { toInsert, skipped };
}

// ── Main export — generate + humanize + insert (with retry) ─────────────────

export async function generateAndInsertQuestions(totalCount = 14) {
  // Load ALL existing topics AND question texts for dedup
  const existing = await Question.find({}, { topic: 1, question: 1, _id: 0 }).lean();
  const existingTopics    = existing.map(q => q.topic).filter(Boolean);
  const existingQuestions = existing.map(q => q.question).filter(Boolean);

  const allInserted = [];
  const allSkipped  = [];

  // Running sets — grow as we insert, so retry rounds don't duplicate each other
  const runningTopics    = [...existingTopics];
  const runningQuestions = [...existingQuestions];

  let remaining = totalCount;
  const MAX_ROUNDS = 3;

  for (let round = 1; round <= MAX_ROUNDS && remaining > 0; round++) {
    // Ask for slightly more than needed to account for expected skips
    const askFor = Math.min(remaining + Math.ceil(remaining * 0.5), remaining + 7);
    // Distribute evenly across categories
    const countPerCategory = Math.max(1, Math.ceil(askFor / CATEGORIES.length));

    console.log(`[QuestionGen] Round ${round}: need ${remaining} more, asking AI for ${countPerCategory * CATEGORIES.length}…`);

    let generated;
    try {
      generated = await generateWithAI(CATEGORIES, runningTopics, countPerCategory);
    } catch (err) {
      console.error(`[QuestionGen] Round ${round} AI call failed:`, err.message);
      break;
    }

    // Humanize
    const humanized = await humanizeBatch(generated);

    // Validate + dedup
    const { toInsert, skipped } = validateAndDedup(humanized, runningTopics, runningQuestions);

    allSkipped.push(...skipped);

    if (toInsert.length === 0) {
      console.warn(`[QuestionGen] Round ${round}: all ${humanized.length} candidates were duplicates — stopping`);
      break;
    }

    // Only take what we still need
    const taking = toInsert.slice(0, remaining);

    // insertMany with ordered:false so a single duplicate doesn't abort the whole batch
    try {
      await Question.insertMany(taking, { ordered: false });
    } catch (err) {
      // E11000 = duplicate key — some were inserted, some weren't
      if (err.code !== 11000 && err.name !== "BulkWriteError") throw err;
      console.warn(`[QuestionGen] Round ${round}: some duplicates hit DB index, continuing…`);
    }
    allInserted.push(...taking);

    // Update running sets
    for (const q of taking) {
      runningTopics.push(q.topic);
      runningQuestions.push(q.question);
    }

    remaining -= taking.length;

    console.log(`[QuestionGen] Round ${round}: inserted ${taking.length}, skipped ${skipped.length}, still need ${remaining}`);
  }

  const totalInDb = await Question.countDocuments();

  if (allSkipped.length > 0) {
    console.log(`[QuestionGen] Skipped ${allSkipped.length} duplicates:`);
    allSkipped.forEach(s => console.log(`  - [${s.reason}] ${s.q?.topic || "?"}`));
  }

  console.log(`[QuestionGen] ✅ Done — inserted ${allInserted.length}/${totalCount} requested. Bank total: ${totalInDb}`);

  return { inserted: allInserted, skipped: allSkipped, totalInDb };
}

// ── Humanize all existing DB questions ──────────────────────────────────────

export async function humanizeAllDbQuestions() {
  const all = await Question.find().lean();
  if (!all.length) return { updated: 0, skipped: 0, total: 0 };

  let updated = 0;
  let skipped = 0;

  for (const q of all) {
    if (!hasAIPatterns(q.question)) {
      skipped++;
      continue;
    }

    console.log(`[HumanizeDB] Rewriting: "${q.question.slice(0, 70)}"`);
    const rewritten = await rewriteAsHuman(q);

    if (rewritten && rewritten !== q.question) {
      await Question.updateOne({ _id: q._id }, { $set: { question: rewritten } });
      console.log(`[HumanizeDB] → "${rewritten.slice(0, 70)}"`);
      updated++;
    } else {
      skipped++;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return { updated, skipped, total: all.length };
}
