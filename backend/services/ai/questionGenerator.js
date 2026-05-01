/**
 * ai/questionGenerator.js — AI question generation with human-style enforcement.
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

// ---------------------------------------------------------------------------
// AI pattern detection
// ---------------------------------------------------------------------------

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

const AI_OPENERS = [
  "can you describe",
  "could you describe",
  "would you say",
  "do you think that",
  "what do you think about",
  "how do you feel about",
  "what are your thoughts",
  "in your opinion",
  "do you believe that",
];

/**
 * Returns true if the question text has AI-generated patterns.
 */
function hasAIPatterns(text) {
  const lower = text.toLowerCase().trim();

  if (AI_PHRASES.some(p => lower.includes(p))) return true;
  if (AI_ENDINGS.some(e => lower.endsWith(e))) return true;
  if (text.length > 180) return true; // AI over-explains

  return false;
}

/**
 * Checks opener diversity across a batch.
 * Returns a map of opener → count.
 */
function getOpenerCounts(questions) {
  const counts = {};
  for (const q of questions) {
    const first3 = q.question.toLowerCase().split(" ").slice(0, 3).join(" ");
    counts[first3] = (counts[first3] || 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Rewrite a single question to sound human
// ---------------------------------------------------------------------------
async function rewriteAsHuman(q, retryCount = 0) {
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
      continue; // try next key
    }

    if (!res.ok) return null;
    const data = await res.json();
    const rewritten = data.choices?.[0]?.message?.content?.trim();
    if (!rewritten || rewritten.length < 10) return null;

    // Strip surrounding quotes if LLM added them
    return rewritten.replace(/^["']|["']$/g, "").trim();
  }
}

// ---------------------------------------------------------------------------
// Humanize a batch — detect + rewrite flagged questions
// ---------------------------------------------------------------------------
async function humanizeBatch(questions) {
  const openerCounts = getOpenerCounts(questions);

  // Identify which questions need rewriting up-front
  const needsRewrite = questions.map((q) => {
    const lower = q.question.toLowerCase().trim();
    const opener = lower.split(" ").slice(0, 3).join(" ");
    const repeatedOpener = (openerCounts[opener] || 0) > 2;
    return hasAIPatterns(q.question) || repeatedOpener;
  });

  // Fire all rewrites in parallel
  const rewritePromises = questions.map((q, i) => {
    if (!needsRewrite[i]) return Promise.resolve(null);
    console.log(`[Humanize] Rewriting: "${q.question.slice(0, 60)}..."`);
    return rewriteAsHuman(q);
  });

  const rewritten = await Promise.all(rewritePromises);

  // Build results and log outcomes
  const results = questions.map((q, i) => {
    if (!needsRewrite[i] || !rewritten[i]) return q;
    console.log(`[Humanize] → "${rewritten[i].slice(0, 60)}"`);
    return { ...q, question: rewritten[i] };
  });

  return results;
}

// ---------------------------------------------------------------------------
// Similarity check
// ---------------------------------------------------------------------------
function topicSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().match(/\b\w{4,}\b/g) || []);
  const wordsB = new Set(b.toLowerCase().match(/\b\w{4,}\b/g) || []);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

function isTooSimilar(newTopic, existingTopics, threshold = 0.4) {
  return existingTopics.some(t => topicSimilarity(newTopic, t) >= threshold);
}

// ---------------------------------------------------------------------------
// Generate questions via Groq Llama
// ---------------------------------------------------------------------------
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
        max_tokens: 3000,
      }),
    });

    if (res.status === 429) {
      const errText = await res.text();
      markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
      continue; // try next key
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

// ---------------------------------------------------------------------------
// Main export — generate + humanize + insert
// ---------------------------------------------------------------------------
export async function generateAndInsertQuestions(totalCount = 7) {
  const countPerCategory = Math.ceil(totalCount / CATEGORIES.length);

  const existing = await Question.find({}, { topic: 1, _id: 0 }).lean();
  const existingTopics = existing.map(q => q.topic).filter(Boolean);

  // Generate
  const generated = await generateWithAI(CATEGORIES, existingTopics, countPerCategory);

  // Humanize — detect AI patterns and rewrite
  const humanized = await humanizeBatch(generated);

  // Validate and dedup
  const allTopics = [...existingTopics];
  const toInsert = [];
  const skipped = [];

  for (const q of humanized) {
    if (!q.category || !q.topic || !q.question) {
      skipped.push({ reason: "missing fields", q });
      continue;
    }
    if (!CATEGORIES.includes(q.category)) {
      skipped.push({ reason: `unknown category: ${q.category}`, q });
      continue;
    }
    if (isTooSimilar(q.topic, allTopics)) {
      skipped.push({ reason: "too similar to existing topic", q });
      continue;
    }
    toInsert.push(q);
    allTopics.push(q.topic);
  }

  if (toInsert.length > 0) {
    await Question.insertMany(toInsert);
  }

  const totalInDb = await Question.countDocuments();
  return { inserted: toInsert, skipped, totalInDb };
}

// ---------------------------------------------------------------------------
// Humanize all existing DB questions — called by /humanizedb command
// ---------------------------------------------------------------------------
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

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  return { updated, skipped, total: all.length };
}
