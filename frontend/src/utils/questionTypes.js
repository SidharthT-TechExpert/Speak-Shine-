/**
 * Question Types & Dynamic Challenge UI Utilities
 * Supports: standard questions, multi-part questions, picture descriptions,
 * story summaries, monthly reflections, and monthly goals.
 */

import { getDurationLimits } from "./videoSubmitGate.js";

export const CATEGORY_THEMES = {
  "Daily Life":          { primary: "#4ade80", secondary: "#22c55e", badgeBg: "rgba(34,197,94,0.15)",   border: "rgba(74,222,128,0.3)",  gradient: "linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.03) 100%)" },
  "English Growth":      { primary: "#fbbf24", secondary: "#f59e0b", badgeBg: "rgba(251,191,36,0.15)",  border: "rgba(251,191,36,0.3)",  gradient: "linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(251,191,36,0.03) 100%)" },
  "Free Talk":           { primary: "#38bdf8", secondary: "#0284c7", badgeBg: "rgba(56,189,248,0.15)",  border: "rgba(56,189,248,0.3)",  gradient: "linear-gradient(135deg, rgba(56,189,248,0.15) 0%, rgba(56,189,248,0.03) 100%)" },
  "Fun Topic":           { primary: "#fb923c", secondary: "#ea580c", badgeBg: "rgba(251,146,60,0.15)",  border: "rgba(251,146,60,0.3)",  gradient: "linear-gradient(135deg, rgba(251,146,60,0.15) 0%, rgba(251,146,60,0.03) 100%)" },
  "Future Goals":        { primary: "#c084fc", secondary: "#9333ea", badgeBg: "rgba(192,132,252,0.15)", border: "rgba(192,132,252,0.3)", gradient: "linear-gradient(135deg, rgba(192,132,252,0.15) 0%, rgba(192,132,252,0.03) 100%)" },
  "Opinion":             { primary: "#f472b6", secondary: "#db2777", badgeBg: "rgba(244,114,182,0.15)", border: "rgba(244,114,182,0.3)", gradient: "linear-gradient(135deg, rgba(244,114,182,0.15) 0%, rgba(244,114,182,0.03) 100%)" },
  "Personal Experience": { primary: "#fb7185", secondary: "#e11d48", badgeBg: "rgba(251,113,133,0.15)", border: "rgba(251,113,133,0.3)", gradient: "linear-gradient(135deg, rgba(251,113,133,0.15) 0%, rgba(251,113,133,0.03) 100%)" },
  "Picture Description": { primary: "#38bdf8", secondary: "#818cf8", badgeBg: "rgba(56,189,248,0.15)",  border: "rgba(56,189,248,0.35)", gradient: "linear-gradient(135deg, rgba(56,189,248,0.15) 0%, rgba(99,102,241,0.05) 100%)" },
  "Story Summary":       { primary: "#a78bfa", secondary: "#7c3aed", badgeBg: "rgba(167,139,250,0.15)", border: "rgba(167,139,250,0.3)", gradient: "linear-gradient(135deg, rgba(167,139,250,0.15) 0%, rgba(124,111,255,0.05) 100%)" },
  "Shadowing Practice":  { primary: "#f472b6", secondary: "#c084fc", badgeBg: "rgba(244,114,182,0.15)", border: "rgba(244,114,182,0.35)", gradient: "linear-gradient(135deg, rgba(244,114,182,0.15) 0%, rgba(192,132,252,0.05) 100%)" },
  "Monthly Goals":       { primary: "#34d399", secondary: "#059669", badgeBg: "rgba(52,211,153,0.15)",  border: "rgba(52,211,153,0.3)",  gradient: "linear-gradient(135deg, rgba(52,211,153,0.15) 0%, rgba(5,150,105,0.05) 100%)" },
  "Monthly Reflection":  { primary: "#a78bfa", secondary: "#8b5cf6", badgeBg: "rgba(167,139,250,0.15)", border: "rgba(167,139,250,0.3)", gradient: "linear-gradient(135deg, rgba(167,139,250,0.15) 0%, rgba(139,92,246,0.05) 100%)" },
  "default":             { primary: "#c084fc", secondary: "#9333ea", badgeBg: "rgba(192,132,252,0.15)", border: "rgba(192,132,252,0.3)", gradient: "linear-gradient(135deg, rgba(192,132,252,0.15) 0%, rgba(147,51,234,0.05) 100%)" },
};

const KEYWORD_MAP = [
  { keywords: ["daily", "routine", "morning", "evening", "habit"],     theme: "Daily Life" },
  { keywords: ["english", "grammar", "language", "vocab", "fluency"],  theme: "English Growth" },
  { keywords: ["free", "talk", "chat", "casual", "conversation"],     theme: "Free Talk" },
  { keywords: ["fun", "funny", "humor", "joke", "entertainment"],     theme: "Fun Topic" },
  { keywords: ["future", "ambition", "career", "dream"],              theme: "Future Goals" },
  { keywords: ["opinion", "think", "view", "perspective", "debate"],   theme: "Opinion" },
  { keywords: ["personal", "experience", "memory", "childhood"],      theme: "Personal Experience" },
  { keywords: ["picture", "image", "photo", "describe", "visual"],    theme: "Picture Description" },
  { keywords: ["story", "listen", "audio", "narrative", "retell"],    theme: "Story Summary" },
  { keywords: ["shadow", "shadowing", "mimic", "mimicry", "replicate"], theme: "Shadowing Practice" },
  { keywords: ["reflection", "end of month", "review"],               theme: "Monthly Reflection" },
  { keywords: ["monthly goal", "goal setting", "targets"],            theme: "Monthly Goals" },
];

export function getCategoryTheme(category, contentType) {
  if (contentType === "shadowing_video") return CATEGORY_THEMES["Shadowing Practice"];
  if (contentType === "picture_description") return CATEGORY_THEMES["Picture Description"];
  if (contentType === "story_audio") return CATEGORY_THEMES["Story Summary"];
  if (!category) return CATEGORY_THEMES.default;
  const cat = String(category).toLowerCase().trim();
  const exactKey = Object.keys(CATEGORY_THEMES).find(k => k.toLowerCase() === cat);
  if (exactKey) return CATEGORY_THEMES[exactKey];
  const partialKey = Object.keys(CATEGORY_THEMES).find(k =>
    k !== "default" && (cat.includes(k.toLowerCase()) || k.toLowerCase().includes(cat))
  );
  if (partialKey) return CATEGORY_THEMES[partialKey];
  for (const { keywords, theme } of KEYWORD_MAP) {
    if (keywords.some(kw => cat.includes(kw))) return CATEGORY_THEMES[theme];
  }
  return CATEGORY_THEMES.default;
}

function stripLeadingPrefix(str) {
  return String(str || "").replace(/^(?:\d+[\.\)]|[•\-\*])\s*/, "").replace(/^(?:\d+[\.\)]|[•\-\*])\s*/, "").trim();
}

/**
 * Parses raw question text into structured items.
 * Detects newlines, bullets, and numbered items like "1. ... 2. ... 3. ..."
 */
export function parseQuestionItems(rawText) {
  if (!rawText) return [];
  const text = String(rawText).trim();

  // 1. Explicit newlines
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (rawLines.length > 1) {
    return rawLines.map((line, idx) => {
      const match = line.match(/^(\d+)[\.\)]\s*(.*)$/);
      if (match) return { num: match[1], text: stripLeadingPrefix(match[2]) };
      const bulletMatch = line.match(/^[•\-\*]\s*(.*)$/);
      if (bulletMatch) return { num: String(idx + 1), text: stripLeadingPrefix(bulletMatch[1]) };
      return { num: String(idx + 1), text: stripLeadingPrefix(line) };
    });
  }

  // 2. Inline numbered items "1. ... 2. ... 3. ..."
  const numberedPattern = /(?:^|\s)(\d+)[\.\)]\s+/g;
  const matches = [...text.matchAll(numberedPattern)];
  if (matches.length > 1) {
    const items = [];
    for (let i = 0; i < matches.length; i++) {
      const num = matches[i][1];
      const startIndex = matches[i].index + matches[i][0].length;
      const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
      const itemText = stripLeadingPrefix(text.substring(startIndex, endIndex));
      if (itemText) items.push({ num, text: itemText });
    }
    if (items.length > 1) return items;
  }

  // 3. Single question prompt
  const cleanSingle = stripLeadingPrefix(text);
  return [{ num: null, text: cleanSingle || text }];
}

/**
 * Clean & resolve video URL with verified audio track
 */
export function getCleanVideoUrl(url) {
  if (!url) return "";
  const s = String(url);
  if (s.includes("3191572") || s.includes("ForBiggerFun") || s.includes("fluency-mindset")) return "/shadowing/fluency-mindset.mp4";
  if (s.includes("3195394") || s.includes("ForBiggerEscapes") || s.includes("active-listening")) return "/shadowing/active-listening.mp4";
  if (s.includes("3209828") || s.includes("ForBiggerBlazes") || s.includes("stage-presence")) return "/shadowing/stage-presence.mp4";
  if (s.includes("3196061") || s.includes("ForBiggerJoyBlazes") || s.includes("intentional-pauses")) return "/shadowing/intentional-pauses.mp4";
  if (s.includes("3205626") || s.includes("WeAreGoingOnBullrun") || s.includes("speaking-habits")) return "/shadowing/speaking-habits.mp4";
  if (s.includes("856973") || s.includes("charismatic-presence")) return "/shadowing/charismatic-presence.mp4";
  if (s.includes("commondatastorage.googleapis.com") || s.includes("gtv-videos-bucket")) return "/shadowing/stage-presence.mp4";
  return url;
}

/**
 * Clean & resolve shadowing speech audio URL
 */
export function getCleanAudioUrl(url) {
  if (!url) return "/shadowing/fluency-mindset.mp3";
  const s = String(url);
  if (s.includes("3191572") || s.includes("ForBiggerFun") || s.includes("fluency-mindset")) return "/shadowing/fluency-mindset.mp3";
  if (s.includes("3195394") || s.includes("ForBiggerEscapes") || s.includes("active-listening")) return "/shadowing/active-listening.mp3";
  if (s.includes("3209828") || s.includes("ForBiggerBlazes") || s.includes("stage-presence")) return "/shadowing/stage-presence.mp3";
  if (s.includes("3196061") || s.includes("ForBiggerJoyBlazes") || s.includes("intentional-pauses")) return "/shadowing/intentional-pauses.mp3";
  if (s.includes("3205626") || s.includes("WeAreGoingOnBullrun") || s.includes("speaking-habits")) return "/shadowing/speaking-habits.mp3";
  if (s.includes("856973") || s.includes("charismatic-presence")) return "/shadowing/charismatic-presence.mp3";
  if (s.endsWith(".mp4")) return s.replace(/\.mp4$/, ".mp3");
  return url;
}

/**
 * Detect question type from today object / status
 */
export function detectQuestionType(today = {}) {
  // 1. Explicit contentType takes absolute precedence
  if (today.contentType === "shadowing_video" || today.isShadowing || String(today.category || "").toLowerCase().includes("shadowing")) return "shadowing_video";
  if (today.contentType === "story_audio") return "story_audio";
  if (today.contentType === "picture_description") return "picture_description";
  if (today.contentType === "monthly_reflection") return "monthly_reflection";
  if (today.contentType === "monthly_goals") return "monthly_goals";

  // 2. Story Audio: has audioUrl and not videoUrl
  if (today.audioUrl && !today.videoUrl) return "story_audio";
  if (today.isStorySummary && !today.videoUrl) return "story_audio";
  if (String(today.category || "").toLowerCase().includes("story")) return "story_audio";

  // 3. Picture Description: has imageUrl and not audio/video
  if (today.imageUrl && !today.videoUrl && !today.audioUrl) return "picture_description";
  if (today.isPictureDescription && !today.videoUrl) return "picture_description";

  // 4. Shadowing Video: explicit videoUrl or shadowing flag with videoUrl
  if ((today.isShadowing || today.contentType === "shadowing_video") && today.videoUrl) {
    return "shadowing_video";
  }
  if (today.videoUrl && !today.audioUrl && !today.imageUrl) {
    return "shadowing_video";
  }

  // 5. Monthly Goals / Reflection
  if (today.isMonthlyGoals || String(today.category || "").toLowerCase().includes("monthly goal") || String(today.setupType || "").includes("goal")) {
    return "monthly_goals";
  }
  if (today.isMonthlyReflection || String(today.category || "").toLowerCase().includes("reflection") || String(today.setupType || "").includes("reflection")) {
    return "monthly_reflection";
  }

  return "standard_question";
}

export const DEFAULT_MONTHLY_REFLECTION_QUESTIONS = [
  "How many reviews did you attend this month?",
  "How many reviews passed and how many failed? Why?",
  "What is your current growth and progress in the program?",
  "What did you do this month to improve your communication skills?",
];

export const DEFAULT_MONTHLY_GOALS_QUESTIONS = [
  "What is your main goal for this month in the program?",
  "What is your dream or target you are working toward right now?",
  "What specific steps will you take this month to improve your communication?",
  "What was your biggest challenge last month and how will you overcome it?",
];

export const CEFR_LEVEL_MAP = {
  A1: { label: "A1 Beginner", desc: "Basic everyday phrases", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", border: "rgba(56, 189, 248, 0.35)" },
  A2: { label: "A2 Elementary", desc: "Practical conversational phrases", color: "#34d399", bg: "rgba(52, 211, 153, 0.12)", border: "rgba(52, 211, 153, 0.35)" },
  B1: { label: "B1 Intermediate", desc: "Natural conversational expressions", color: "#fbbf24", bg: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.35)" },
  B2: { label: "B2 Upper-Intermediate", desc: "Fluent, rich expressions", color: "#c084fc", bg: "rgba(192, 132, 252, 0.12)", border: "rgba(192, 132, 252, 0.35)" },
  C1: { label: "C1 Advanced", desc: "Nuanced idiomatic expressions", color: "#f472b6", bg: "rgba(244, 114, 182, 0.12)", border: "rgba(244, 114, 182, 0.35)" },
  C2: { label: "C2 Proficient", desc: "Eloquent rhetorical expressions", color: "#fb7185", bg: "rgba(251, 113, 133, 0.12)", border: "rgba(251, 113, 133, 0.35)" },
};

export function getCefrInfo(level = "B2") {
  const norm = String(level || "B2").toUpperCase().trim();
  return CEFR_LEVEL_MAP[norm] || CEFR_LEVEL_MAP.B2;
}

/**
 * Returns configuration, button labels, rules, and badges for a given question type.
 */
export function getQuestionUIConfig(type, today = {}) {
  const theme = getCategoryTheme(today.category || today.topic, today.contentType);
  const reqCount = Number(today.vocabRequiredCount) || (type === "picture_description" ? 1 : (type === "story_audio" ? 1 : 3));
  const totalCount = Number(today.vocabWordCount) || (Array.isArray(today.vocabulary) && today.vocabulary.length > 0 ? today.vocabulary.length : 5);
  const vocabLevel = today.vocabLevel || "B2";
  const cefrInfo = getCefrInfo(vocabLevel);

  const limits = today?.durationLimits || getDurationLimits({
    isMonthlyReflection: type === "monthly_reflection" || Boolean(today?.isMonthlyReflection),
    isWeeklyReflection: Boolean(today?.isWeeklyReflection),
    isMonthlyGoals: type === "monthly_goals" || Boolean(today?.isMonthlyGoals),
    isStorySummary: type === "story_audio" || Boolean(today?.isStorySummary),
    isPictureDescription: type === "picture_description" || Boolean(today?.isPictureDescription),
    isShadowing: type === "shadowing_video" || Boolean(today?.isShadowing),
    targetVideoDuration: Number(today.videoDuration || today.todayVideoDuration || 0),
    videoDuration: Number(today.videoDuration || today.todayVideoDuration || 0),
  }, today?.durationSettings || {});

  switch (type) {
    case "shadowing_video":
      return {
        type,
        theme,
        reqCount: 0,
        totalCount: 0,
        vocabLevel: "None",
        cefrInfo: null,
        badgeLabel: today.category || "Shadowing Practice",
        badgeSubtext: "Speech Mimicry & Simultaneous Voice Practice",
        promptLabel: "🎙️ Shadowing Speech Mission",
        promptSubtitle: "Listen to the audio through earphones and speak simultaneously. Mirror the rhythm, speed, and pronunciation.",
        recordButtonLabel: "Start Shadowing & Record",
        uploadButtonLabel: "Upload Shadowing Recording",
        rules: [
          { text: "Listen through earphones and speak at the same time to shadow the speaker", highlight: true },
          { text: `Duration matching: ≥85% active spoken time awards full 40 duration points (max ${limits.maxLabel})` },
          { text: "Delivery, Rhythm & Fluency: 60 points (Rhythm 30 pts + Delivery 30 pts)" },
          { text: "Vocabulary and personal growth requirements are waived for this activity" },
        ],
        hasAudio: true,
        audioUrl: getCleanAudioUrl(today.audioUrl || today.videoUrl),
        hasImage: false,
        hasVideo: false,
        videoUrl: null,
        videoDuration: today.videoDuration || 60,
        videoTranscript: today.videoTranscript || today.question || "",
        videoTitle: today.videoTitle || today.topic || "",
        tip: "Shadowing Tip: Keep earphones on. Speak aloud at the exact same moment as the speaker to build natural muscle memory.",
      };

    case "picture_description":
      return {
        type,
        theme,
        reqCount,
        totalCount,
        vocabLevel,
        cefrInfo,
        badgeLabel: today.category || "Picture Description",
        badgeSubtext: "Visual Fluency Challenge",
        promptLabel: "👁️ Your Observation Task",
        promptSubtitle: "Take a breath, observe the details, and share what you see naturally.",
        recordButtonLabel: "Record picture description",
        uploadButtonLabel: "Upload description",
        rules: [
          { text: "Describe subjects, actions & atmosphere with natural expression", highlight: true },
          { text: `Minimum 60 seconds (${limits.fullScoreLabel} for full points, max ${limits.maxLabel})` },
          { text: `Weave in at least ${reqCount} target expression${reqCount > 1 ? "s" : ""} naturally (${vocabLevel})` },
        ],
        hasAudio: false,
        hasImage: Boolean(today.imageUrl),
        tip: "Describe what is happening in the foreground, background, emotions, and subtle colors.",
      };

    case "story_audio":
      return {
        type,
        theme,
        reqCount,
        totalCount,
        vocabLevel,
        cefrInfo,
        badgeLabel: today.category || "Story Summary",
        badgeSubtext: "Listening & Retelling Challenge",
        promptLabel: "🎧 Story Summary Task",
        promptSubtitle: "Listen to the story below, then retell it naturally in your own words.",
        recordButtonLabel: "Record story summary",
        uploadButtonLabel: "Upload summary",
        rules: [
          { text: "Listen to the complete audio story first to catch the main turning point", highlight: true },
          { text: `Minimum 60 seconds speaking (${limits.fullScoreLabel} for full points, max ${limits.maxLabel})` },
          { text: `Retell in your own words using at least ${reqCount} target expression${reqCount > 1 ? "s" : ""}` },
        ],
        hasAudio: Boolean(today.audioUrl),
        hasImage: false,
        tip: "Listen carefully for the beginning, the turning point, and the resolution of the story.",
      };

    case "monthly_reflection":
      return {
        type,
        theme,
        reqCount,
        totalCount,
        vocabLevel,
        cefrInfo,
        badgeLabel: "Monthly Reflection",
        badgeSubtext: "End of Month Progress Review",
        promptLabel: "📋 Reflection Questions",
        promptSubtitle: "Share your honest journey and celebrate your monthly speaking milestones.",
        recordButtonLabel: "Record reflection video",
        uploadButtonLabel: "Upload reflection",
        rules: [
          { text: "Reflect on your speaking progress and key takeaways", highlight: true },
          { text: `Speaking duration: 60s to ${limits.maxLabel} (${limits.fullScoreLabel} for full points)` },
          { text: "Speak freely from your personal learning experience" },
        ],
        hasAudio: false,
        hasImage: false,
        tip: "Be specific about reviews attended, lessons learned, and areas you improved most this month.",
      };

    case "monthly_goals":
      return {
        type,
        theme,
        reqCount,
        totalCount,
        vocabLevel,
        cefrInfo,
        badgeLabel: "Monthly Goal Setting",
        badgeSubtext: "New Month Target Setting",
        promptLabel: "🎯 Goal Setting Questions",
        promptSubtitle: "Map out your speaking aspirations and daily practice routines.",
        recordButtonLabel: "Record goals video",
        uploadButtonLabel: "Upload goals",
        rules: [
          { text: "Share your speaking goals for the upcoming month", highlight: true },
          { text: `Speaking duration: 60s to ${limits.maxLabel} (${limits.fullScoreLabel} for full points)` },
          { text: "Focus on consistent daily practice and vocabulary growth" },
        ],
        hasAudio: false,
        hasImage: false,
        tip: "Make your goals concrete: mention exact review targets, daily habits, and vocabulary goals.",
      };

    case "standard_question":
    default:
      return {
        type: "standard_question",
        theme,
        reqCount,
        totalCount,
        vocabLevel,
        cefrInfo,
        badgeLabel: today.category || "Daily Challenge",
        badgeSubtext: "Daily Speaking Mission",
        promptLabel: "💬 Today's Speaking Mission",
        promptSubtitle: "Speak freely and share your thoughts from the heart.",
        recordButtonLabel: "Record speaking video",
        uploadButtonLabel: "Upload video",
        rules: [
          { text: `Minimum 60 seconds continuous speaking (${limits.fullScoreLabel} for full points, max ${limits.maxLabel})`, highlight: true },
          { text: `Try integrating at least ${reqCount} of today's ${totalCount} target expressions (${vocabLevel})` },
          { text: "Form your own spontaneous sentences — no need to memorize examples" },
        ],
        hasAudio: Boolean(today.audioUrl),
        hasImage: false,
        tip: "Organize your response with an opening answer, a personal reason or example, and a takeaway.",
      };
  }
}

/**
 * Splits a transcript into proportional 3–6 second spoken phrases with word-weighted timestamps.
 */
export function buildTeleprompterCues(transcript, totalDuration = 60) {
  if (!transcript || typeof transcript !== "string") return [];
  const validDuration = Number(totalDuration) > 0 ? Number(totalDuration) : 60;

  // Split on sentence boundaries (. ! ?)
  const rawSentences = transcript
    .replace(/\r?\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  // Divide sentences longer than 13 words into natural ~4-6 second chunks
  const phrases = [];
  for (const s of rawSentences) {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > 13) {
      const clauses = s.split(/(?<=[,;:])\s+/).map(c => c.trim()).filter(Boolean);
      if (clauses.length > 1 && clauses.every(c => c.length > 0)) {
        phrases.push(...clauses);
      } else {
        const mid = Math.ceil(words.length / 2);
        phrases.push(words.slice(0, mid).join(" "));
        phrases.push(words.slice(mid).join(" "));
      }
    } else {
      phrases.push(s);
    }
  }

  const totalWords = phrases.reduce((sum, p) => sum + Math.max(1, p.split(/\s+/).length), 0);
  let accTime = 0;
  return phrases.map((text, idx) => {
    const wordCount = Math.max(1, text.split(/\s+/).length);
    const cueDur = (wordCount / totalWords) * validDuration;
    const start = accTime;
    const end = Math.min(validDuration, accTime + cueDur);
    accTime = end;
    return {
      id: idx,
      text,
      start,
      end,
      duration: cueDur,
      startFormatted: `${Math.floor(start / 60)}:${String(Math.floor(start % 60)).padStart(2, "0")}`,
      endFormatted: `${Math.floor(end / 60)}:${String(Math.floor(end % 60)).padStart(2, "0")}`,
    };
  });
}
