/**
 * vocabularyGenerator.js
 * Generates vocabulary words related to today's question/topic.
 * Word count and CEFR level are configurable via Status.vocabWordCount / Status.vocabLevel.
 */

import fetch from "node-fetch";
import Status from "../../../models/statusSchema.js";
import { getTextKey, getTextModel, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";

// CEFR level descriptors for the prompt
const LEVEL_DESCRIPTORS = {
  A1: "absolute beginner — very simple everyday words (e.g. happy, walk, home). Not too easy though — must be useful for speaking practice.",
  A2: "elementary — simple but practical words used in daily conversations (e.g. suggest, nervous, improve)",
  B1: "intermediate — words learners know but may not actively use (e.g. confident, achieve, situation)",
  B2: "upper-intermediate — richer, more precise words (e.g. articulate, elaborate, perspective, convey)",
  C1: "advanced — sophisticated words used by fluent speakers (e.g. compelling, nuanced, resilient, inevitably)",
  C2: "proficient — complex academic or professional vocabulary (e.g. juxtaposition, pragmatic, eloquent)",
};

// Fallback curated vocabulary dictionary by category/theme
const FALLBACK_VOCABULARY = {
  "Learned Skills": [
    { word: "self-discipline", meaning: "the ability to control actions and stay focused on goals", example: "My self-discipline helped me practice the guitar daily without skipping lessons." },
    { word: "time management", meaning: "organizing tasks efficiently to use time wisely", example: "Good time management lets me balance work, study, and hobbies each week." },
    { word: "problem-solving", meaning: "finding effective solutions to challenges or obstacles", example: "Problem-solving skills I learned from DIY projects saved me money on repairs." },
    { word: "critical thinking", meaning: "analyzing information objectively to form reasoned judgments", example: "Critical thinking helped me evaluate online advice before trying it at home." },
    { word: "hands-on", meaning: "learning by doing rather than just theoretical study", example: "A hands-on approach taught me how to fix a leaky faucet quickly." },
  ],
  "Career Advancement": [
    { word: "ambition", meaning: "a strong desire to achieve success and reach high goals", example: "Her ambition drove her to take on leadership roles early in her career." },
    { word: "networking", meaning: "building professional relationships to create opportunities", example: "Networking at industry seminars helped him find valuable mentors." },
    { word: "mentorship", meaning: "guidance provided by an experienced professional", example: "Through mentorship, she learned how to navigate complex project hurdles." },
    { word: "initiative", meaning: "the power or opportunity to act independently before others", example: "Taking the initiative on new assignments earned him widespread respect." },
    { word: "adaptability", meaning: "the ability to adjust quickly to new conditions and tech", example: "Her adaptability made her an indispensable member of the expanding team." },
  ],
  "General": [
    { word: "articulate", meaning: "to express ideas clearly and fluently in speech", example: "She was able to articulate her viewpoint clearly during the discussion." },
    { word: "perspective", meaning: "a particular attitude toward or way of regarding something", example: "Traveling gave him a broader perspective on cultural diversity." },
    { word: "perseverance", meaning: "continued effort to do something despite difficulties", example: "Through perseverance, he mastered speaking English with high confidence." },
    { word: "collaborate", meaning: "to work jointly on an activity or project", example: "We collaborate with international teammates to complete our deliverables." },
    { word: "constructive", meaning: "serving a useful purpose and tending to build up", example: "Constructive feedback helped improve her daily pronunciation significantly." },
  ],
};

function getFallbackWords(topic, count = 5) {
  const match = Object.keys(FALLBACK_VOCABULARY).find(k => (topic || "").toLowerCase().includes(k.toLowerCase())) || "General";
  let list = [...(FALLBACK_VOCABULARY[match] || FALLBACK_VOCABULARY["General"])];
  if (list.length < count) {
    const all = Object.values(FALLBACK_VOCABULARY).flat();
    for (const item of all) {
      if (!list.some(existing => existing.word.toLowerCase() === item.word.toLowerCase())) {
        list.push(item);
      }
      if (list.length >= count) break;
    }
  }
  return list.slice(0, count);
}

/**
 * Generate vocabulary words for a given topic/question via Groq Llama/GPT.
 * @param {string} topic
 * @param {string} question
 * @param {number} count - how many words to generate
 * @param {string} level - CEFR level string e.g. "B2"
 * @returns {Array<{word, meaning, example}>|null}
 */
async function generateVocabularyWords(topic, question, count = 5, level = "B2") {
  const levelDesc = LEVEL_DESCRIPTORS[level] || LEVEL_DESCRIPTORS["B2"];

  const prompt = `You are an expert English vocabulary teacher.

Today's speaking topic: "${topic || "General English"}"
Today's question: "${question || "Talk about your daily life"}"

Generate exactly ${count} vocabulary words that:
- Are directly relevant to this topic/question
- Are at ${level} level (${levelDesc})
- Would naturally come up when answering this question
- Each word is a single word or common 2-word phrase

For each word provide:
- word: the vocabulary word (lowercase, max 2 words)
- meaning: a simple 1-line definition (max 15 words)
- example: a short, natural example sentence using the word (max 20 words)

Return ONLY a valid JSON object in this format:
{
  "words": [
    {"word": "elaborate", "meaning": "to explain something in more detail", "example": "Can you elaborate on your main point about communication?"}
  ]
}`;

  let lastError = null;

  // Try up to 2 times
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      while (true) {
        const apiKey = getTextKey();
        if (!apiKey) {
          lastError = new Error("No Groq API keys available");
          break;
        }

        const model = getTextModel();
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model || "openai/gpt-oss-120b",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.4,
            max_tokens: 2000, // generous token limit to accommodate reasoning tokens without truncation
            response_format: { type: "json_object" },
          }),
        });

        if (res.status === 429) {
          const errText = await res.text();
          markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
          continue;
        }

        if (!res.ok) {
          lastError = new Error(`Groq API error ${res.status}`);
          break;
        }

        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content?.trim();
        if (!raw) { lastError = new Error("Empty response"); break; }

        // Extract JSON object or array
        let jsonStr = raw;
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) {
          jsonStr = fence[1].trim();
        } else {
          const s = raw.indexOf("{");
          const e = raw.lastIndexOf("}");
          if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e + 1);
        }

        const parsed = JSON.parse(jsonStr);
        const list = Array.isArray(parsed) ? parsed : (parsed.words || parsed.vocabulary || Object.values(parsed)[0]);

        // Validate structure
        if (!Array.isArray(list) || list.length === 0) {
          lastError = new Error("Invalid response structure");
          break;
        }

        const valid = list
          .filter(w => w && w.word && w.meaning && w.example)
          .slice(0, count)
          .map(w => ({
            word:    String(w.word).trim().toLowerCase(),
            meaning: String(w.meaning).trim(),
            example: String(w.example).trim(),
          }));

        if (valid.length < Math.min(2, count)) {
          lastError = new Error("Too few valid words returned");
          break;
        }

        return valid;
      }
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        console.warn(`[VocabGen] Attempt ${attempt} failed: ${err.message} — retrying…`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  console.error("[VocabGen] All AI attempts failed:", lastError?.message);
  console.log(`[VocabGen] 🛡️ Using high-quality curated vocabulary fallback for "${topic}"`);
  return getFallbackWords(topic, count);
}

/**
 * Generate and store today's vocabulary words in Status.
 * Safe to call multiple times — skips if already generated.
 * Reads vocabWordCount and vocabLevel from Status for dynamic configuration.
 * Returns the vocabulary array.
 */
export async function ensureTodayVocabulary() {
  try {
    const status = await Status.findOne().lean();

    // Read dynamic settings (admin-configurable)
    const isStory = status?.todayContentType === "story_audio"
      || (status?.isStorySummaryDay && status?.todayContentType !== "picture_description");
    const isPicture = status?.todayContentType === "picture_description"
      || (status?.isPictureDescriptionDay && status?.todayContentType !== "story_audio");
    const wordCount = Math.max(1, Math.min(10,
      isPicture ? (status?.vocabPictureWordCount ?? status?.vocabWordCount ?? 5)
      : isStory ? (status?.vocabStoryWordCount ?? status?.vocabWordCount ?? 5)
      : (status?.vocabNormalWordCount ?? status?.vocabWordCount ?? 5)
    ));
    const level     = status?.vocabLevel || "B2";

    // Already have enough words for today — return them sliced to configured wordCount
    if (status?.todayVocabulary && status.todayVocabulary.length >= wordCount) {
      return status.todayVocabulary.slice(0, wordCount);
    }

    // Need a question to generate words from
    const topic    = status?.todayTopic    || null;
    const question = status?.todayQuestion || null;

    if (!question && !topic) {
      console.log("[VocabGen] No question available yet — skipping vocabulary generation");
      return [];
    }

    console.log(`[VocabGen] Generating ${wordCount} vocabulary words at ${level} level for topic: "${topic}"`);
    const words = await generateVocabularyWords(topic, question, wordCount, level);

    if (!words || words.length === 0) {
      console.warn("[VocabGen] Generation failed — using curated fallback");
      const fallback = getFallbackWords(topic, wordCount);
      await Status.updateOne({}, { $set: { todayVocabulary: fallback } }, { upsert: true });
      return fallback;
    }

    // Store in Status
    await Status.updateOne({}, { $set: { todayVocabulary: words } }, { upsert: true });
    console.log(`[VocabGen] ✅ Stored ${words.length} words (${level}): ${words.map(w => w.word).join(", ")}`);

    return words;
  } catch (err) {
    console.error("[VocabGen] ensureTodayVocabulary error:", err.message);
    return [];
  }
}

/**
 * Get today's vocabulary words.
 * If missing, triggers generation on-demand (lazy generation).
 */
export async function getTodayVocabulary() {
  return ensureTodayVocabulary();
}
