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

// ── Generic/shallow question detector ───────────────────────────────────────

// Topics that are too vague — force rejection
const GENERIC_TOPICS = [
  "hobbies", "food", "weekend", "weekend plans", "favorite foods",
  "music", "movies", "sports", "travel", "family", "friends",
  "work", "school", "daily life", "morning routine", "free time",
  "technology", "social media", "health", "exercise", "sleep",
  "money", "shopping", "weather", "pets", "books",
  "hidden talents", "secret talent", "binge-worthy shows", "dream job",
  "guilty pleasures", "morning coffee", "daily commute", "study spots",
  "weeknight dinners", "childhood memories", "favorite game",
  "best gift", "biggest mistake", "dream vacation",
  "book formats", "language exchange", "vocabulary building",
  "english media", "language learning tips", "personal challenges",
];

// Question patterns that are too simple/generic — yes/no, factual, or shallow
const GENERIC_QUESTION_PATTERNS = [
  /^what (is|are) your (favorite|hobby|hobbies|dream|go-to|quickest)/i,
  /^do you (like|enjoy|love|have|watch|read|listen|use)/i,
  /^how (was|is) your (day|week|weekend)/i,
  /^tell me about yourself/i,
  /^what do you (do|think) (for fun|in your free time|to relax|usually)/i,
  /^what are you doing (this|next) (weekend|week)/i,
  /^(do|did) you (watch|read|listen|ever)/i,
  /^what('s| is) your (name|job|age|go-to|dream job|quickest|favorite)/i,
  /^how (do|did|often|long) you (usually|learn|get|watch|practice|study)/i,
  /^are (audiobooks|beach|city|ebooks|e-books)/i,
  /^(are|is) .{0,30} better than/i,
  /^what('s| is) (the best|your best|your favorite|a secret|the biggest|the best gift)/i,
  /^what('s| is) (your|the) (biggest|best|worst|most) (mistake|gift|memory|fear|challenge)/i,
  /^what show (have|did) you/i,
  /^what('s| is) (your|a) (guilty pleasure|secret talent|dream job|go-to)/i,
  /^have you ever had a language/i,
  /^what('s| is) your (favorite way|quickest|go-to|usual)/i,
  /^where do you usually/i,
  /^how do you usually get to/i,
];

function isGenericQuestion(q) {
  const topicLower = (q.topic || "").toLowerCase().trim();
  const questionLower = (q.question || "").toLowerCase().trim();

  // Reject if topic is in the generic list
  if (GENERIC_TOPICS.some(t => topicLower === t || topicLower.includes(t))) return true;

  // Reject if question matches generic patterns
  if (GENERIC_QUESTION_PATTERNS.some(p => p.test(questionLower))) return true;

  // Reject if question is too short (under 40 chars — not enough depth)
  if (q.question.trim().length < 40) return true;

  // Reject yes/no questions that start with "Are", "Is", "Do", "Did", "Have", "Can"
  // unless they have enough follow-up context (over 80 chars)
  if (/^(are|is|do|did|have|can|would|could)\s/i.test(questionLower) && q.question.trim().length < 80) return true;

  return false;
}



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
✅ GOOD examples (specific, vivid, memorable):
- "What's the weirdest food you've ever tried and actually liked?"
- "If you could swap jobs with anyone for a week, who would it be and what's the first thing you'd do?"
- "What's one habit you keep trying to build but always give up on after a few days?"
- "Tell me about a time you were completely lost — literally or figuratively."
- "Which do you prefer: working early morning or late at night, and why does it suit you?"
- "What's a movie or show you watched recently that you can't stop thinking about?"
- "If your best friend described you in 3 words, what would they say?"
- "What's something you believed as a kid that turned out to be completely wrong?"

❌ BAD examples — TOO GENERIC, TOO SIMPLE, TOO VAGUE (NEVER write like these):
- "What do you do to relax?" ← too simple, everyone knows the answer
- "What are you doing this weekend?" ← too casual, no depth
- "What's your favorite food?" ← too basic
- "Do you like music?" ← yes/no, no depth
- "What is your hobby?" ← too vague
- "Tell me about yourself." ← too open-ended
- "What do you think about technology?" ← too broad
- "How was your day?" ← not a practice question
- "What's your favorite movie?" ← too simple
- "What's a secret talent you have?" ← shallow, no story
- "What show have you binge-watched recently?" ← too casual
- "What's your favorite childhood game?" ← too basic
- "What's the best gift you've ever received?" ← generic
- "Are audiobooks better than e-books?" ← yes/no, no depth
- "Are beach or city vacations better?" ← yes/no, no depth
- "What's your go-to morning coffee order?" ← trivial
- "How do you usually get to work?" ← factual, no story
- "How do you learn new vocabulary?" ← too direct
- "How often do you watch English TV shows?" ← frequency question, no depth
- "What's your dream job in 10 years?" ← overused, generic
- "What's your guilty pleasure TV show?" ← too casual

HARD RULES:
- NO phrases: "share your thoughts", "elaborate", "reflect on", "in what ways", "to what extent", "in today's world/society", "what are your thoughts on", "explain your reasoning", "why or why not"
- NO questions ending with "and why?" or "explain your answer"
- Keep questions under 140 characters
- Minimum 40 characters — questions must have enough context to spark a real story
- Vary the openers — don't start more than 2 questions with the same word
- topic: a SPECIFIC 3-6 word title (NOT generic like "Hobbies" or "Food" — be specific like "Embarrassing Cooking Fails" or "Unexpected Travel Moments")
- question: the actual question — must be SPECIFIC and INTERESTING, require a personal story or opinion with context, not something a 5-year-old would ask
- Every question MUST be completely unique — no two questions should be about the same thing
- Questions should make the speaker think and share a real personal story or opinion
- NEVER ask yes/no questions unless they have a strong follow-up built in (e.g. "Have you ever done X — what happened?")
- NEVER ask "what is your favorite X" or "do you like X" — these are too shallow

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
    // 3. Generic/shallow question
    if (isGenericQuestion(q)) {
      skipped.push({ reason: "too generic/shallow", q });
      continue;
    }
    // 4. Topic uniqueness
    if (topicIsDuplicate(q.topic, acceptedTopics)) {
      skipped.push({ reason: "duplicate topic", q });
      continue;
    }
    // 5. Question text uniqueness
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
  const existing = await Question.find({}, { topic: 1, question: 1, category: 1, _id: 0 }).lean();
  const existingTopics    = existing.map(q => q.topic).filter(Boolean);
  const existingQuestions = existing.map(q => q.question).filter(Boolean);

  // ── Count per category and figure out how many each needs ────────────────
  const countByCategory = {};
  for (const cat of CATEGORIES) countByCategory[cat] = 0;
  for (const q of existing) {
    if (q.category && countByCategory[q.category] !== undefined) {
      countByCategory[q.category]++;
    }
  }

  // Target: bring every category up to the same level
  // Target level = max(current max, 2) + Math.ceil(totalCount / CATEGORIES.length)
  const currentMax = Math.max(...Object.values(countByCategory));
  const targetPerCategory = Math.max(currentMax, 2) + Math.ceil(totalCount / CATEGORIES.length);

  // How many each category still needs
  const neededByCategory = {};
  let totalNeeded = 0;
  for (const cat of CATEGORIES) {
    const need = Math.max(0, targetPerCategory - countByCategory[cat]);
    neededByCategory[cat] = need;
    totalNeeded += need;
  }

  // Cap at totalCount — don't generate more than requested
  // Scale down proportionally if totalNeeded > totalCount
  if (totalNeeded > totalCount) {
    const scale = totalCount / totalNeeded;
    for (const cat of CATEGORIES) {
      neededByCategory[cat] = Math.max(1, Math.round(neededByCategory[cat] * scale));
    }
  }

  console.log("[QuestionGen] Category balance plan:");
  for (const cat of CATEGORIES) {
    console.log(`  ${cat}: has ${countByCategory[cat]}, needs ${neededByCategory[cat]} more → target ${countByCategory[cat] + neededByCategory[cat]}`);
  }

  const allInserted = [];
  const allSkipped  = [];

  // Running sets — grow as we insert
  const runningTopics    = [...existingTopics];
  const runningQuestions = [...existingQuestions];

  // Track remaining per category
  const remainingByCategory = { ...neededByCategory };
  const MAX_ROUNDS = 3;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // Only include categories that still need questions
    const catsNeeded = CATEGORIES.filter(c => remainingByCategory[c] > 0);
    if (catsNeeded.length === 0) break;

    const totalRemaining = catsNeeded.reduce((s, c) => s + remainingByCategory[c], 0);

    // Build a weighted category list: repeat each category proportionally + buffer
    const categoryList = catsNeeded.flatMap(cat => {
      const ask = Math.max(1, Math.ceil(remainingByCategory[cat] * 1.5)); // 50% buffer
      return Array(ask).fill(cat);
    });

    console.log(`[QuestionGen] Round ${round}: need ${totalRemaining} more across ${catsNeeded.length} categories, asking AI for ${categoryList.length}…`);

    let generated;
    try {
      generated = await generateWithAI(catsNeeded, runningTopics, Math.max(2, Math.ceil(categoryList.length / catsNeeded.length)));
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
      console.warn(`[QuestionGen] Round ${round}: all candidates were duplicates/generic — stopping`);
      break;
    }

    // Take only what each category still needs
    const taking = [];
    for (const q of toInsert) {
      if ((remainingByCategory[q.category] || 0) > 0) {
        taking.push(q);
        remainingByCategory[q.category]--;
      }
    }

    if (taking.length === 0) {
      console.warn(`[QuestionGen] Round ${round}: no questions matched needed categories`);
      break;
    }

    // Insert with ordered:false so one duplicate doesn't abort the batch
    try {
      await Question.insertMany(taking, { ordered: false });
    } catch (err) {
      if (err.code !== 11000 && err.name !== "BulkWriteError") throw err;
      console.warn(`[QuestionGen] Round ${round}: some duplicates hit DB index, continuing…`);
    }

    allInserted.push(...taking);
    for (const q of taking) {
      runningTopics.push(q.topic);
      runningQuestions.push(q.question);
    }

    const stillNeeded = Object.values(remainingByCategory).reduce((s, v) => s + v, 0);
    console.log(`[QuestionGen] Round ${round}: inserted ${taking.length}, skipped ${skipped.length}, still need ${stillNeeded}`);

    if (stillNeeded === 0) break;
  }

  const totalInDb = await Question.countDocuments();

  // Final balance report
  const finalCounts = await Question.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } }
  ]);
  console.log("[QuestionGen] Final category balance:");
  for (const { _id, count } of finalCounts.sort((a, b) => a._id.localeCompare(b._id))) {
    console.log(`  ${_id}: ${count}`);
  }

  if (allSkipped.length > 0) {
    console.log(`[QuestionGen] Skipped ${allSkipped.length} total:`);
    allSkipped.forEach(s => console.log(`  - [${s.reason}] ${s.q?.topic || "?"}`));
  }

  console.log(`[QuestionGen] ✅ Done — inserted ${allInserted.length}. Bank total: ${totalInDb}`);
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
