/**
 * storyVoiceAnalyzer.js
 *
 * Analyzes story text (or character metadata) to identify:
 *  - Protagonist identity (name, gender, age group)
 *  - Story emotional tone & mood (upbeat, reflective, humorous, suspenseful)
 *  - Optimal ElevenLabs voice matching the character
 *  - Tailored acoustic delivery parameters (stability, style) for human inflection
 */

import fetch from "node-fetch";
import { getTextKey, getTextModel, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";

// Curated library of pre-made ElevenLabs voices available across free and paid tiers
export const STORY_VOICES = {
  rachel: {
    key: "rachel",
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    gender: "female",
    age: "young_adult",
    vibe: "Warm & Conversational",
    description: "Natural, relatable, young female voice. Feels like a close friend telling a personal story.",
    defaultSettings: { stability: 0.34, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true },
  },
  emily: {
    key: "emily",
    id: "LcfcDJNUP1GQjkzn1xUU",
    name: "Emily",
    gender: "female",
    age: "young_adult",
    vibe: "Energetic & Bright",
    description: "Upbeat, lively, cheerful young female voice. Great for fast-paced, humorous, or social stories.",
    defaultSettings: { stability: 0.30, similarity_boost: 0.75, style: 0.50, use_speaker_boost: true },
  },
  nicole: {
    key: "nicole",
    id: "piTKgcLEGmPE4e6mEKli",
    name: "Nicole",
    gender: "female",
    age: "adult",
    vibe: "Gentle Storyteller",
    description: "Thoughtful, gentle, intimate storytelling voice. Ideal for reflective, heartfelt, or calming narratives.",
    defaultSettings: { stability: 0.40, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
  },
  josh: {
    key: "josh",
    id: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    gender: "male",
    age: "young_adult",
    vibe: "Casual & Relatable",
    description: "Young adult male, friendly, easygoing, and down-to-earth.",
    defaultSettings: { stability: 0.35, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true },
  },
  sam: {
    key: "sam",
    id: "yoZ06aMxZJJ28mfd3POQ",
    name: "Sam",
    gender: "male",
    age: "young_adult",
    vibe: "Dynamic & Expressive",
    description: "Expressive, confident male voice with natural dynamic range and conversational energy.",
    defaultSettings: { stability: 0.32, similarity_boost: 0.75, style: 0.50, use_speaker_boost: true },
  },
  adam: {
    key: "adam",
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    gender: "male",
    age: "adult",
    vibe: "Deep Narrator",
    description: "Classic deep narrative voice. Grounded, articulate, and authoritative.",
    defaultSettings: { stability: 0.42, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
  },
  george: {
    key: "george",
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    gender: "male",
    age: "adult",
    vibe: "Warm British Storyteller",
    description: "Warm, captivating, articulate storyteller. Great for thoughtful life lessons and travel adventures.",
    defaultSettings: { stability: 0.38, similarity_boost: 0.75, style: 0.40, use_speaker_boost: true },
  },
};

/**
 * Returns a list of all voices suitable for display in UI dropdowns.
 */
export function getAvailableVoices() {
  return Object.values(STORY_VOICES).map(v => ({
    key: v.key,
    id: v.id,
    name: v.name,
    gender: v.gender,
    age: v.age,
    vibe: v.vibe,
    description: v.description,
  }));
}

/**
 * Find voice details by ID or Key.
 */
export function findVoice(identifier) {
  if (!identifier) return null;
  if (STORY_VOICES[identifier]) return STORY_VOICES[identifier];
  return Object.values(STORY_VOICES).find(v => v.id === identifier) || null;
}

/**
 * Fallback heuristic matching when Groq is unavailable or fails.
 */
function heuristicMatch(storyText = "", characterHint = null) {
  const text = (storyText + " " + JSON.stringify(characterHint || {})).toLowerCase();

  const femalePronouns = (text.match(/\b(she|her|hers|woman|girl)\b/g) || []).length;
  const malePronouns = (text.match(/\b(he|him|his|man|boy)\b/g) || []).length;

  const isFemale = characterHint?.pronoun === "she" || femalePronouns > malePronouns;

  // Emotional tone heuristic
  const energeticWords = ["excited", "laughed", "hurried", "ran", "suddenly", "crazy", "rush"];
  const isEnergetic = energeticWords.some(w => text.includes(w));

  const reflectiveWords = ["realized", "quiet", "thought", "remembered", "calm", "gently", "learned"];
  const isReflective = reflectiveWords.some(w => text.includes(w));

  let voiceKey = isFemale ? "rachel" : "josh";
  if (isFemale) {
    if (isEnergetic) voiceKey = "emily";
    else if (isReflective) voiceKey = "nicole";
  } else {
    if (isEnergetic) voiceKey = "sam";
    else if (isReflective) voiceKey = "george";
  }

  const voice = STORY_VOICES[voiceKey];
  return {
    characterName: characterHint?.name || (isFemale ? "Female Protagonist" : "Male Protagonist"),
    gender: isFemale ? "female" : "male",
    persona: characterHint?.type || (isFemale ? "Young female protagonist" : "Young male protagonist"),
    mood: isEnergetic ? "Upbeat & energetic" : isReflective ? "Reflective & thoughtful" : "Conversational & relatable",
    voiceKey: voice.key,
    voiceId: voice.id,
    voiceName: voice.name,
    vibe: voice.vibe,
    reason: `Matched ${voice.name} (${voice.vibe}) based on ${isFemale ? "female" : "male"} character context and story pacing.`,
    voiceSettings: { ...voice.defaultSettings },
  };
}

/**
 * Uses Groq to deeply analyze a story's character, mood, and optimal voice delivery.
 * @param {string} storyText - The complete story text
 * @param {object} [characterHint] - Optional hints from story generator { name, type, pronoun }
 * @returns {Promise<object>} Voice recommendation object
 */
export async function analyzeStoryVoice(storyText, characterHint = null) {
  if (!storyText || storyText.trim().length < 20) {
    return heuristicMatch(storyText, characterHint);
  }

  const voiceOptions = Object.values(STORY_VOICES).map(
    v => `- "${v.key}": ${v.name} (${v.gender}, ${v.vibe}) — ${v.description}`
  ).join("\n");

  const prompt = `You are a professional audio drama director and speech casting director.
Analyze this short English listening story and identify the best voice and acoustic style to give it an authentic, human feel:

STORY:
"""
${storyText.slice(0, 1800)}
"""
${characterHint ? `\nKNOWN CHARACTER CONTEXT: ${JSON.stringify(characterHint)}` : ""}

AVAILABLE VOICES:
${voiceOptions}

Determine:
1. characterName: Name of the central character or narrator
2. gender: "female" or "male"
3. persona: A short 3-6 word description of who they are (e.g., "20-year-old college student", "25-year-old software trainee")
4. mood: The overall emotional tone of the story (e.g. "Warm & conversational", "Relieved & humorous", "Thoughtful & reflective", "Upbeat & excited")
5. selectedVoiceKey: Pick the SINGLE best voice key from the available list: rachel, emily, nicole, josh, sam, adam, george
6. reason: 1 concise sentence explaining why this voice creates the most natural, human listening experience for this character and story.
7. stability: A number between 0.28 and 0.45. (Use lower ~0.30 for emotional, funny, or dramatic stories to add natural human pitch swings; use higher ~0.42 for calm/steady stories).
8. style: A number between 0.35 and 0.55. (Higher ~0.50 for lively conversational storytelling; ~0.35 for subtle calm narration).

Return ONLY valid JSON matching this schema:
{
  "characterName": "...",
  "gender": "female" or "male",
  "persona": "...",
  "mood": "...",
  "selectedVoiceKey": "rachel" | "emily" | "nicole" | "josh" | "sam" | "adam" | "george",
  "reason": "...",
  "stability": 0.34,
  "style": 0.45
}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getTextKey();
    if (!apiKey) break;

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: getTextModel(),
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 600,
          response_format: { type: "json_object" },
        }),
      });

      if (res.status === 429) {
        const errText = await res.text();
        markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
        continue;
      }

      if (!res.ok) continue;

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content?.trim();
      if (!raw) continue;

      let jsonStr = raw;
      const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) jsonStr = fence[1].trim();

      const parsed = JSON.parse(jsonStr);
      const voiceKey = (parsed.selectedVoiceKey || "").toLowerCase();
      const matchedVoice = STORY_VOICES[voiceKey] || heuristicMatch(storyText, characterHint);

      const stability = typeof parsed.stability === "number" && parsed.stability >= 0.25 && parsed.stability <= 0.6
        ? parsed.stability
        : (matchedVoice.defaultSettings?.stability ?? 0.35);

      const style = typeof parsed.style === "number" && parsed.style >= 0.2 && parsed.style <= 0.7
        ? parsed.style
        : (matchedVoice.defaultSettings?.style ?? 0.45);

      return {
        characterName: parsed.characterName || characterHint?.name || matchedVoice.name,
        gender: parsed.gender || matchedVoice.gender,
        persona: parsed.persona || characterHint?.type || matchedVoice.description,
        mood: parsed.mood || "Conversational & engaging",
        voiceKey: matchedVoice.key,
        voiceId: matchedVoice.id,
        voiceName: matchedVoice.name,
        vibe: matchedVoice.vibe,
        reason: parsed.reason || `Best suited for ${parsed.characterName || "the character"} based on tone and style.`,
        voiceSettings: {
          stability,
          similarity_boost: 0.75,
          style,
          use_speaker_boost: true,
        },
      };
    } catch (err) {
      console.warn("[StoryVoiceAnalyzer] Attempt failed:", err.message);
    }
  }

  // Fallback to heuristic
  return heuristicMatch(storyText, characterHint);
}
