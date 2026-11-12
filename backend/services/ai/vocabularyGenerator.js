/**
 * vocabularyGenerator.js
 * Generates natural English expressions and conversational phrases related to today's question/topic.
 * Expression count and CEFR level are configurable via Status.vocabWordCount / Status.vocabLevel.
 * Preserves backward-compatible function signatures and aliases.
 */

import fetch from "node-fetch";
import Status from "../../../models/statusSchema.js";
import { getTextKey, getTextModel, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";

// CEFR level descriptors for expression generation
const LEVEL_DESCRIPTORS = {
  A1: "beginner — simple, basic everyday conversational phrases and sentence starters (e.g. 'In my opinion...', 'I really like to...', 'For example...'). Clear, easy to use.",
  A2: "elementary — practical conversational expressions for daily talk (e.g. 'To be honest...', 'The reason why is...', 'As far as I know...', 'It reminds me of...')",
  B1: "intermediate — natural sentence starters, opinion phrases, and experience connectors (e.g. 'What I find interesting is...', 'When it comes to...', 'I tend to believe that...', 'It turned out to be...')",
  B2: "upper-intermediate — rich, fluent conversational expressions (e.g. 'From where I stand...', 'That being said...', 'I ran into a bit of a challenge with...', 'On top of that...', 'When all is said and done...')",
  C1: "advanced — nuanced, sophisticated idiomatic expressions and fluent discourse markers (e.g. 'To put it into perspective...', 'Strike a balance between...', 'It goes without saying that...', 'Against all odds...')",
  C2: "proficient — highly articulate, eloquent conversational idioms and rhetorical transitions (e.g. 'It is worth bearing in mind that...', 'A compelling case in point is...', 'By and large...')",
};

// Fallback curated English expressions dictionary categorized by theme
const FALLBACK_EXPRESSIONS = {
  "Learned Skills": [
    {
      expression: "When it comes to...",
      word: "When it comes to...",
      meaning: "Used to introduce or focus on a specific topic or skill",
      usage: "When highlighting a particular skill or area you are discussing",
      example: "When it comes to mastering new skills, daily consistency is key."
    },
    {
      expression: "I found it quite challenging to...",
      word: "I found it quite challenging to...",
      meaning: "Used to describe a difficulty or obstacle encountered",
      usage: "When sharing personal learning struggles and how you faced them",
      example: "I found it quite challenging to stay disciplined at first, but practice paid off."
    },
    {
      expression: "The main takeaway for me was...",
      word: "The main takeaway for me was...",
      meaning: "Used to express the most important lesson learned",
      usage: "When summarizing what an experience taught you",
      example: "The main takeaway for me was that hands-on practice beats theory."
    },
    {
      expression: "Over the course of time...",
      word: "Over the course of time...",
      meaning: "Used to describe gradual progress or development",
      usage: "When explaining how your skills improved steadily",
      example: "Over the course of time, my confidence in public speaking grew tremendously."
    },
    {
      expression: "It really made a difference when...",
      word: "It really made a difference when...",
      meaning: "Used to emphasize a crucial positive factor or change",
      usage: "When explaining what action led to noticeable improvement",
      example: "It really made a difference when I started recording myself every day."
    }
  ],
  "Career Advancement": [
    {
      expression: "From my perspective...",
      word: "From my perspective...",
      meaning: "Used to express your personal viewpoint or judgment",
      usage: "When sharing your opinion on workplace growth or leadership",
      example: "From my perspective, continuous learning is essential for career success."
    },
    {
      expression: "Take the initiative to...",
      word: "Take the initiative to...",
      meaning: "Used to describe taking proactive action before being asked",
      usage: "When explaining how someone demonstrated leadership or ambition",
      example: "She decided to take the initiative to lead the project presentation."
    },
    {
      expression: "Open up new opportunities",
      word: "Open up new opportunities",
      meaning: "Used to describe creating fresh possibilities or paths",
      usage: "When discussing the benefits of networking or gaining skills",
      example: "Building professional connections helped open up new opportunities for him."
    },
    {
      expression: "In the long run...",
      word: "In the long run...",
      meaning: "Used to describe the eventual outcome over a long period",
      usage: "When discussing future career goals and lasting rewards",
      example: "Putting in extra effort now will pay off in the long run."
    },
    {
      expression: "Strike a balance between...",
      word: "Strike a balance between...",
      meaning: "Used to describe managing two competing priorities evenly",
      usage: "When talking about work-life balance or competing priorities",
      example: "It is crucial to strike a balance between work ambition and personal well-being."
    }
  ],
  "Picture Description": [
    {
      expression: "What immediately catches my eye is...",
      word: "What immediately catches my eye is...",
      meaning: "Used to highlight the most noticeable visual element",
      usage: "When starting your observation with the focal point",
      example: "What immediately catches my eye is the vibrant energy of the crowd."
    },
    {
      expression: "In the foreground / background...",
      word: "In the foreground / background...",
      meaning: "Used to indicate the spatial position of objects or people",
      usage: "When structuring your visual description from front to back",
      example: "In the foreground, a group of friends is laughing together."
    },
    {
      expression: "Judging by their expressions...",
      word: "Judging by their expressions...",
      meaning: "Used to make an inference based on visible clues",
      usage: "When interpreting the emotions or mood of people in an image",
      example: "Judging by their expressions, they are thoroughly enjoying the moment."
    },
    {
      expression: "It gives off an impression of...",
      word: "It gives off an impression of...",
      meaning: "Used to convey the general vibe or atmosphere",
      usage: "When describing the mood, lighting, or feel of a scene",
      example: "The quiet street gives off an impression of peaceful serenity."
    },
    {
      expression: "Upon closer inspection...",
      word: "Upon closer inspection...",
      meaning: "Used to reveal a subtle detail noticed after a second look",
      usage: "When adding deeper detail to your description",
      example: "Upon closer inspection, you can see small handmade details in the decor."
    }
  ],
  "Story Summary": [
    {
      expression: "The story revolves around...",
      word: "The story revolves around...",
      meaning: "Used to introduce the central character, plot, or theme",
      usage: "When opening your summary of an audio narrative",
      example: "The story revolves around an unexpected encounter between two travelers."
    },
    {
      expression: "The turning point came when...",
      word: "The turning point came when...",
      meaning: "Used to describe the pivotal moment where events change",
      usage: "When transitioning from the buildup to the climax of the story",
      example: "The turning point came when the protagonist made a bold decision."
    },
    {
      expression: "What stood out to me most was...",
      word: "What stood out to me most was...",
      meaning: "Used to highlight the most memorable part or lesson",
      usage: "When discussing key highlights or character motives",
      example: "What stood out to me most was how honesty resolved the conflict."
    },
    {
      expression: "It turned out that...",
      word: "It turned out that...",
      meaning: "Used to reveal an unexpected result or truth",
      usage: "When explaining surprises or resolutions in the plot",
      example: "It turned out that the lost package was delivered to the wrong neighbor."
    },
    {
      expression: "When all is said and done...",
      word: "When all is said and done...",
      meaning: "Used to give a final concluding thought or moral",
      usage: "When concluding your summary with the takeaway",
      example: "When all is said and done, true friendship stood the test of time."
    }
  ],
  "General": [
    {
      expression: "What I find interesting is...",
      word: "What I find interesting is...",
      meaning: "Used to introduce an intriguing or noteworthy observation",
      usage: "When discussing a compelling angle of the speaking topic",
      example: "What I find interesting is how small daily habits create massive transformations."
    },
    {
      expression: "To be completely honest...",
      word: "To be completely honest...",
      meaning: "Used to share an honest, authentic thought or admission",
      usage: "When offering a candid, genuine personal reflection",
      example: "To be completely honest, I was nervous before delivering my first speech."
    },
    {
      expression: "The reason why I say this is...",
      word: "The reason why I say this is...",
      meaning: "Used to explain the reasoning behind your opinion",
      usage: "When supporting your statement with clear reasons or evidence",
      example: "The reason why I say this is because regular practice builds natural confidence."
    },
    {
      expression: "On top of that...",
      word: "On top of that...",
      meaning: "Used to add an extra supporting point or detail",
      usage: "When elaborating with additional facts or experiences",
      example: "On top of that, speaking in English daily expanded my vocabulary effortlessly."
    },
    {
      expression: "At the end of the day...",
      word: "At the end of the day...",
      meaning: "Used to emphasize the ultimate, most important conclusion",
      usage: "When summarizing your overall thought or takeaway",
      example: "At the end of the day, consistent effort matters more than perfection."
    }
  ]
};

function getFallbackExpressions(topic, count = 5) {
  const tLower = (topic || "").toLowerCase();
  let matchKey = "General";
  if (tLower.includes("picture") || tLower.includes("photo") || tLower.includes("image")) {
    matchKey = "Picture Description";
  } else if (tLower.includes("story") || tLower.includes("narrative") || tLower.includes("retell")) {
    matchKey = "Story Summary";
  } else if (tLower.includes("skill") || tLower.includes("learn") || tLower.includes("discipline")) {
    matchKey = "Learned Skills";
  } else if (tLower.includes("career") || tLower.includes("job") || tLower.includes("work") || tLower.includes("professional")) {
    matchKey = "Career Advancement";
  }

  let list = [...(FALLBACK_EXPRESSIONS[matchKey] || FALLBACK_EXPRESSIONS["General"])];
  if (list.length < count) {
    const all = Object.values(FALLBACK_EXPRESSIONS).flat();
    for (const item of all) {
      if (!list.some(existing => (existing.expression || existing.word).toLowerCase() === (item.expression || item.word).toLowerCase())) {
        list.push(item);
      }
      if (list.length >= count) break;
    }
  }
  return list.slice(0, count).map(item => ({
    expression: item.expression || item.word,
    word:       item.word || item.expression,
    meaning:    item.meaning,
    usage:      item.usage || "Used when speaking about this topic in natural conversation",
    example:    item.example,
  }));
}

/**
 * Generate English expressions for a given topic/question via Groq Llama/GPT.
 * @param {string} topic
 * @param {string} question
 * @param {number} count - how many expressions to generate
 * @param {string} level - CEFR level string e.g. "B2"
 * @returns {Array<{expression, word, meaning, usage, example}>|null}
 */
export async function generateVocabularyWords(topic, question, count = 5, level = "B2") {
  const levelDesc = LEVEL_DESCRIPTORS[level] || LEVEL_DESCRIPTORS["B2"];

  const prompt = `You are an expert English speaking coach specializing in conversational fluency and spontaneous sentence formation.

Today's speaking topic: "${topic || "General English"}"
Today's question/mission: "${question || "Talk about your daily life"}"

Generate exactly ${count} English expressions related to this speaking topic.
These should be natural conversational phrases and sentence starters that fluent English speakers commonly use in everyday conversations.

The expressions should include a mix of:
- Natural sentence starters and conversational openers (e.g. "What I find interesting is...", "To be completely honest...")
- Phrases for expressing opinions or perspectives (e.g. "From where I stand...", "The way I see it...")
- Expressions for explaining reasons or causes (e.g. "The reason why I say this is...", "This led to...")
- Phrases for adding information or transitions (e.g. "On top of that...", "Not only that, but...")
- Expressions for describing experiences, feelings, difficulties, or turning points
- Expressions for concluding or summarizing thoughts (e.g. "At the end of the day...", "When all is said and done...")

Avoid generic isolated single words (do NOT just generate words like "resilience" or "articulate").
Avoid overly formal or archaic idioms. Prioritize expressions fluent speakers use naturally in real conversation.
Target level: ${level} (${levelDesc}).

For each expression, provide:
- expression: The complete English phrase (use trailing "..." if it is a sentence starter or open-ended clause)
- meaning: A simple, clear explanation of its meaning (max 15 words)
- usage: When and in what conversational situation it should be used (max 20 words)
- example: One natural example sentence directly related to today's topic, demonstrating how to use the expression (max 25 words)

Return ONLY a valid JSON object in this format:
{
  "expressions": [
    {
      "expression": "What I find interesting is...",
      "meaning": "Used to introduce something that attracts your attention",
      "usage": "When discussing an interesting aspect of a subject",
      "example": "What I find interesting is how technology has changed the way we communicate."
    }
  ]
}`;

  let lastError = null;

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
            temperature: 0.5,
            max_tokens: 2200,
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
        const list = Array.isArray(parsed)
          ? parsed
          : (parsed.expressions || parsed.words || parsed.vocabulary || Object.values(parsed)[0]);

        if (!Array.isArray(list) || list.length === 0) {
          lastError = new Error("Invalid response structure");
          break;
        }

        const valid = list
          .filter(w => w && (w.expression || w.word) && w.meaning && w.example)
          .slice(0, count)
          .map(w => {
            const expr = String(w.expression || w.word).trim();
            return {
              expression: expr,
              word:       expr, // backward compatibility
              meaning:    String(w.meaning).trim(),
              usage:      String(w.usage || w.situation || w.context || "When speaking about this topic naturally").trim(),
              example:    String(w.example).trim(),
            };
          });

        if (valid.length < Math.min(2, count)) {
          lastError = new Error("Too few valid expressions returned");
          break;
        }

        return valid;
      }
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        console.warn(`[ExpressionGen] Attempt ${attempt} failed: ${err.message} — retrying…`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  console.error("[ExpressionGen] All AI attempts failed:", lastError?.message);
  console.log(`[ExpressionGen] 🛡️ Using high-quality curated expressions fallback for "${topic}"`);
  return getFallbackExpressions(topic, count);
}

// Alias for semantic clarity
export const generateExpressions = generateVocabularyWords;

/**
 * Generate and store today's expressions in Status.
 * Safe to call multiple times — skips if already generated.
 * Reads vocabWordCount and vocabLevel from Status for dynamic configuration.
 * Returns the expressions array.
 */
export async function ensureTodayVocabulary() {
  try {
    const status = await Status.findOne().lean();

    if (status?.isShadowingDay || status?.todayContentType === "shadowing_video") {
      return [];
    }

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
    const level = status?.vocabLevel || "B2";

    // Already have enough expressions for today
    if (status?.todayVocabulary && status.todayVocabulary.length >= wordCount) {
      const sliced = status.todayVocabulary.slice(0, wordCount);
      const first = sliced[0];
      if (first && (first.expression || first.usage)) {
        return sliced;
      }
    }

    const topic    = status?.todayTopic    || null;
    const question = status?.todayQuestion || null;

    if (!question && !topic) {
      console.log("[ExpressionGen] No question available yet — skipping expression generation");
      return [];
    }

    console.log(`[ExpressionGen] Generating ${wordCount} English expressions at ${level} level for topic: "${topic}"`);
    const expressions = await generateVocabularyWords(topic, question, wordCount, level);

    if (!expressions || expressions.length === 0) {
      console.warn("[ExpressionGen] Generation failed — using curated fallback");
      const fallback = getFallbackExpressions(topic, wordCount).slice(0, wordCount);
      await Status.updateOne({}, { $set: { todayVocabulary: fallback } }, { upsert: true });
      return fallback;
    }

    const finalExpressions = expressions.slice(0, wordCount);
    await Status.updateOne({}, { $set: { todayVocabulary: finalExpressions } }, { upsert: true });
    console.log(`[ExpressionGen] ✅ Stored ${finalExpressions.length} expressions (${level}): ${finalExpressions.map(e => e.expression || e.word).join(" | ")}`);

    return finalExpressions;
  } catch (err) {
    console.error("[ExpressionGen] ensureTodayVocabulary error:", err.message);
    return [];
  }
}

export const ensureTodayExpressions = ensureTodayVocabulary;

/**
 * Get today's English expressions.
 * If missing, triggers generation on-demand (lazy generation).
 */
export async function getTodayVocabulary() {
  return ensureTodayVocabulary();
}

export const getTodayExpressions = getTodayVocabulary;
