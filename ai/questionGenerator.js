/**
 * ai/questionGenerator.js — AI question generation logic (reusable module).
 * Used by both generateQuestions.js (CLI) and the /genq bot command.
 */

import fetch from "node-fetch";
import Question from "../models/questionSchema.js";

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
// Similarity check — Jaccard word overlap to catch near-duplicate topics
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
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set in .env");

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

REQUIREMENTS:
- Each question must be fresh, engaging, and different from the already-used topics above
- topic: a 1-sentence description of what the student should talk about (used as the speaking prompt title)
- question: a specific follow-up question to guide their answer (1 sentence)
- Keep language at B1-B2 level — clear, natural, not too academic
- Vary the style: some personal, some opinion-based, some hypothetical, some reflective
- Do NOT repeat or closely paraphrase any already-used topic

Return ONLY a valid JSON array, no markdown, no extra text:
[
  {"category":"<category>","topic":"<topic sentence>","question":"<question sentence>"},
  ...
]`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.85,
      max_tokens: 3000,
    }),
  });

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

// ---------------------------------------------------------------------------
// Main export — generates and inserts questions, returns a summary object
// ---------------------------------------------------------------------------

/**
 * Generates AI questions and inserts them into MongoDB.
 *
 * @param {number} totalCount - Total questions to generate (should be multiple of 7)
 * @returns {Promise<{ inserted: object[], skipped: object[], totalInDb: number }>}
 */
export async function generateAndInsertQuestions(totalCount = 7) {
  const countPerCategory = Math.ceil(totalCount / CATEGORIES.length);

  // Fetch existing topics for no-repeat check
  const existing = await Question.find({}, { topic: 1, _id: 0 }).lean();
  const existingTopics = existing.map(q => q.topic).filter(Boolean);

  // Generate
  const generated = await generateWithAI(CATEGORIES, existingTopics, countPerCategory);

  // Validate and filter duplicates
  const allTopics = [...existingTopics];
  const toInsert = [];
  const skipped = [];

  for (const q of generated) {
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
