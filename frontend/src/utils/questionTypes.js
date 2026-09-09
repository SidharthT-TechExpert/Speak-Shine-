/**
 * Question Types & Dynamic Challenge UI Utilities
 * Supports: standard questions, multi-part questions, picture descriptions,
 * story summaries, monthly reflections, and monthly goals.
 */

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
  { keywords: ["reflection", "end of month", "review"],               theme: "Monthly Reflection" },
  { keywords: ["monthly goal", "goal setting", "targets"],            theme: "Monthly Goals" },
];

export function getCategoryTheme(category, contentType) {
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
      if (match) return { num: match[1], text: match[2].trim() };
      const bulletMatch = line.match(/^[•\-\*]\s*(.*)$/);
      if (bulletMatch) return { num: String(idx + 1), text: bulletMatch[1].trim() };
      return { num: String(idx + 1), text: line };
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
      const itemText = text.substring(startIndex, endIndex).trim();
      if (itemText) items.push({ num, text: itemText });
    }
    if (items.length > 1) return items;
  }

  // 3. Single question prompt
  const cleanSingle = text.replace(/^1[\.\)]\s*/, "").trim() || text;
  return [{ num: null, text: cleanSingle }];
}

/**
 * Detect question type from today object / status
 */
export function detectQuestionType(today = {}) {
  if (today.isPictureDescription || today.contentType === "picture_description" || (today.imageUrl && !today.audioUrl)) {
    return "picture_description";
  }
  if (today.isMonthlyGoals || String(today.category || "").toLowerCase().includes("monthly goal") || String(today.setupType || "").includes("goal")) {
    return "monthly_goals";
  }
  if (today.isMonthlyReflection || String(today.category || "").toLowerCase().includes("reflection") || String(today.setupType || "").includes("reflection")) {
    return "monthly_reflection";
  }
  if (today.isStorySummary || today.contentType === "story_audio" || String(today.category || "").toLowerCase().includes("story")) {
    return "story_audio";
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
  A1: { label: "A1 Beginner", desc: "Basic words", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)", border: "rgba(56, 189, 248, 0.35)" },
  A2: { label: "A2 Elementary", desc: "Practical words", color: "#34d399", bg: "rgba(52, 211, 153, 0.12)", border: "rgba(52, 211, 153, 0.35)" },
  B1: { label: "B1 Intermediate", desc: "Conversational words", color: "#fbbf24", bg: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.35)" },
  B2: { label: "B2 Upper-Intermediate", desc: "Rich, professional words", color: "#c084fc", bg: "rgba(192, 132, 252, 0.12)", border: "rgba(192, 132, 252, 0.35)" },
  C1: { label: "C1 Advanced", desc: "Fluent expressions", color: "#f472b6", bg: "rgba(244, 114, 182, 0.12)", border: "rgba(244, 114, 182, 0.35)" },
  C2: { label: "C2 Proficient", desc: "Complex vocabulary", color: "#fb7185", bg: "rgba(251, 113, 133, 0.12)", border: "rgba(251, 113, 133, 0.35)" },
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

  switch (type) {
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
        promptLabel: "👁️ YOUR OBSERVATION TASK",
        promptSubtitle: "Look closely at the image details, mood, and actions.",
        recordButtonLabel: "Record picture description",
        uploadButtonLabel: "Upload description",
        rules: [
          { text: "Describe subjects, actions & setting", highlight: true },
          { text: "Aim for 45–90 seconds of fluent speaking" },
          { text: `Use at least ${reqCount} target vocabulary word${reqCount > 1 ? "s" : ""} (${vocabLevel})` },
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
        promptLabel: "🎧 STORY SUMMARY TASK",
        promptSubtitle: "Listen to the story below, then retell it in your own words.",
        recordButtonLabel: "Record story summary",
        uploadButtonLabel: "Upload summary",
        rules: [
          { text: "Listen to the complete audio story first", highlight: true },
          { text: `Retell in your own words using at least ${reqCount} target word${reqCount > 1 ? "s" : ""}` },
          { text: "Minimum 60 seconds speaking (max 3 mins)" },
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
        promptLabel: "📋 REFLECTION QUESTIONS",
        promptSubtitle: "Address all questions below in your reflection video.",
        recordButtonLabel: "Record reflection video",
        uploadButtonLabel: "Upload reflection",
        rules: [
          { text: "Answer all reflection questions thoroughly", highlight: true },
          { text: "Speaking duration: 3 to 7 minutes" },
          { text: "Provide honest self-assessment of your progress" },
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
        promptLabel: "🎯 GOAL SETTING QUESTIONS",
        promptSubtitle: "Answer each question to map out your monthly speaking roadmap.",
        recordButtonLabel: "Record goals video",
        uploadButtonLabel: "Upload goals",
        rules: [
          { text: "Cover all 4 goal-setting questions", highlight: true },
          { text: "Speaking duration: 3 to 10 minutes" },
          { text: "Define concrete habits and practice routines" },
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
        promptLabel: "💬 TODAY'S QUESTION",
        promptSubtitle: "Speak naturally and address the prompt below.",
        recordButtonLabel: "Record speaking video",
        uploadButtonLabel: "Upload video",
        rules: [
          { text: "Minimum 60 seconds continuous speaking", highlight: true },
          { text: `Use at least ${reqCount} of today's ${totalCount} target words (${vocabLevel} level)` },
          { text: "No script reading — speak naturally" },
        ],
        hasAudio: Boolean(today.audioUrl),
        hasImage: false,
        tip: "Organize your response with an opening answer, a personal reason or example, and a takeaway.",
      };
  }
}
