/**
 * Server-side SVG poster generator — modern, high-definition Speak & Shine visual challenges.
 */

import Status from "../models/statusSchema.js";
import sharp from "sharp";

// ── Theme map ─────────────────────────────────────────────────────────────────
const THEMES = {
  "Daily Life":          { primary: "#4ade80", secondary: "#22c55e", glow: "34,197,94",   badgeBg: "rgba(34,197,94,0.18)" },
  "English Growth":      { primary: "#fbbf24", secondary: "#f59e0b", glow: "251,191,36",  badgeBg: "rgba(251,191,36,0.18)" },
  "Free Talk":           { primary: "#38bdf8", secondary: "#0284c7", glow: "56,189,248",  badgeBg: "rgba(56,189,248,0.18)" },
  "Fun Topic":           { primary: "#fb923c", secondary: "#ea580c", glow: "251,146,60",  badgeBg: "rgba(251,146,60,0.18)" },
  "Future Goals":        { primary: "#c084fc", secondary: "#9333ea", glow: "192,132,252", badgeBg: "rgba(192,132,252,0.18)" },
  "Opinion":             { primary: "#f472b6", secondary: "#db2777", glow: "244,114,182", badgeBg: "rgba(244,114,182,0.18)" },
  "Personal Experience": { primary: "#fb7185", secondary: "#e11d48", glow: "251,113,133", badgeBg: "rgba(251,113,133,0.18)" },
  "Picture Description": { primary: "#38bdf8", secondary: "#818cf8", glow: "99,102,241",   badgeBg: "rgba(99,102,241,0.18)" },
  "Story Summary":       { primary: "#a78bfa", secondary: "#7c3aed", glow: "167,139,250", badgeBg: "rgba(167,139,250,0.18)" },
  "Monthly Goals":       { primary: "#34d399", secondary: "#059669", glow: "52,211,153",  badgeBg: "rgba(52,211,153,0.18)" },
  "Monthly Reflection":  { primary: "#a78bfa", secondary: "#8b5cf6", glow: "167,139,250", badgeBg: "rgba(167,139,250,0.18)" },
  "default":             { primary: "#c084fc", secondary: "#9333ea", glow: "192,132,252", badgeBg: "rgba(192,132,252,0.18)" },
};

const KEYWORD_MAP = [
  { keywords: ["daily", "routine", "morning", "evening"],           theme: "Daily Life" },
  { keywords: ["english", "grammar", "language", "vocab", "speak"], theme: "English Growth" },
  { keywords: ["free", "talk", "chat", "casual"],                   theme: "Free Talk" },
  { keywords: ["fun", "funny", "humor", "joke"],                    theme: "Fun Topic" },
  { keywords: ["future", "ambition", "retire"],                     theme: "Future Goals" },
  { keywords: ["opinion", "think", "view", "perspective", "believe"], theme: "Opinion" },
  { keywords: ["personal", "experience", "story", "memory"],        theme: "Personal Experience" },
  { keywords: ["picture", "image", "photo", "describe"],            theme: "Picture Description" },
  { keywords: ["story", "listen", "audio"],                         theme: "Story Summary" },
  { keywords: ["monthly reflection", "reflection", "end of month"], theme: "Monthly Reflection" },
  { keywords: ["monthly goals", "monthly goal", "goal setting"],    theme: "Monthly Goals" },
];

function getTheme(category, contentType) {
  if (contentType === "picture_description") return THEMES["Picture Description"];
  if (contentType === "story_audio") return THEMES["Story Summary"];
  if (!category) return THEMES.default;
  const cat = category.toLowerCase().trim();
  const exactKey = Object.keys(THEMES).find(k => k.toLowerCase() === cat);
  if (exactKey) return THEMES[exactKey];
  const partialKey = Object.keys(THEMES).find(k =>
    k !== "default" && (cat.includes(k.toLowerCase()) || k.toLowerCase().includes(cat))
  );
  if (partialKey) return THEMES[partialKey];
  for (const { keywords, theme } of KEYWORD_MAP) {
    if (keywords.some(kw => cat.includes(kw))) return THEMES[theme];
  }
  return THEMES.default;
}

function esc(str) {
  return String(str || "")
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapLines(text, maxChars) {
  const words = String(text || "").trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (test.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function stripLeadingPrefix(str) {
  return String(str || "").replace(/^(?:\d+[\.\)]|[•\-\*])\s*/, "").replace(/^(?:\d+[\.\)]|[•\-\*])\s*/, "").trim();
}

function parseQuestionItems(rawText) {
  if (!rawText) return [];
  const text = String(rawText).trim();
  
  // 1. Check if there are explicit newlines
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

  // 2. Check if single line has embedded numbered items e.g. "1. ... 2. ... 3. ..."
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

  // 3. Otherwise single question prompt
  const cleanSingle = stripLeadingPrefix(text);
  return [{ num: null, text: cleanSingle || text }];
}

/**
 * Generate an SVG poster that matches the Speak & Shine HD challenge design.
 */
export function generateSVGPoster({
  topic = "Speaking Practice",
  question = "",
  category = "General",
  contentType = "question",
  vocabulary = [],
  vocabRequiredCount = 3,
}) {
  const theme = getTheme(category || topic, contentType);
  const isMonthlyReflection = (category && category.toLowerCase().includes("reflection")) || (topic && topic.toLowerCase().includes("reflection"));
  const isMonthlyGoals = (category && category.toLowerCase().includes("goal")) || (topic && topic.toLowerCase().includes("goal setting"));

  const W = 900;
  const PAD = 48;
  const INNER = W - PAD * 2; // 804px
  const GAP = 20;

  // Header texts
  let badgeTitle = category || "General";
  let challengeTypeLabel = "DAILY SPEAKING CHALLENGE";
  let actionButtonLabel = "Send your 1-min speaking video →";
  let topicLabel = "TOPIC";
  let promptLabel = "? QUESTION";

  if (contentType === "picture_description") {
    badgeTitle = "Picture Description";
    challengeTypeLabel = "VISUAL FLUENCY CHALLENGE";
    actionButtonLabel = "Record your picture description →";
    topicLabel = "CHALLENGE THEME";
    promptLabel = "YOUR SPEAKING TASK";
  } else if (contentType === "story_audio") {
    badgeTitle = "Story Summary";
    challengeTypeLabel = "LISTENING & RETELLING CHALLENGE";
    actionButtonLabel = "Listen & submit your story summary →";
    topicLabel = "STORY TITLE";
    promptLabel = "SUMMARY ASSIGNMENT";
  } else if (isMonthlyReflection) {
    badgeTitle = "Monthly Reflection";
    challengeTypeLabel = "MONTHLY REFLECTION CHALLENGE";
    actionButtonLabel = "Record your reflection video →";
    topicLabel = "CHALLENGE TOPIC";
    promptLabel = "📋 REFLECTION QUESTIONS (Answer all in your video)";
  } else if (isMonthlyGoals) {
    badgeTitle = "Monthly Goal Setting";
    challengeTypeLabel = "MONTHLY GOALS CHALLENGE";
    actionButtonLabel = "Record your goals video →";
    topicLabel = "CHALLENGE TOPIC";
    promptLabel = "🎯 GOAL SETTING QUESTIONS (Answer all in your video)";
  }

  // 1. TOPIC Card
  const topicLines = wrapLines(`"${topic}"`, 42);
  const TOPIC_FONT = 26;
  const TOPIC_LINE_H = 36;
  const TOPIC_CARD_H = 46 + topicLines.length * TOPIC_LINE_H + 16;

  // 2. QUESTION Card
  const qItems = parseQuestionItems(question || "");
  const isMultiQuestion = qItems.length > 1;

  let Q_CARD_H = 0;
  let qContentSvg = "";

  if (isMultiQuestion) {
    const ITEM_FONT = qItems.length >= 6 ? 15.5 : 17;
    const ITEM_LINE_H = qItems.length >= 6 ? 21 : 24;
    const MAX_CHARS_PER_LINE = qItems.length >= 6 ? 64 : 58;
    const ITEM_GAP = 8;
    
    let totalItemsH = 0;
    const processedItems = qItems.map((item, idx) => {
      const lines = wrapLines(item.text, MAX_CHARS_PER_LINE);
      const itemH = Math.max(46, 20 + lines.length * ITEM_LINE_H + 6);
      totalItemsH += itemH;
      if (idx > 0) totalItemsH += ITEM_GAP;
      return { ...item, lines, itemH };
    });

    Q_CARD_H = 56 + totalItemsH + 18;

    let curItemY = 0;
    qContentSvg = processedItems.map((item, idx) => {
      const yOffset = curItemY;
      curItemY += item.itemH + ITEM_GAP;
      const numLabel = item.num || String(idx + 1);

      const circleCy = Math.floor(item.itemH / 2);
      const startY = Math.round((item.itemH - (item.lines.length - 1) * ITEM_LINE_H) / 2) + 5;

      return `
      <g transform="translate(16, ${50 + yOffset})">
        <!-- Sub-item card container -->
        <rect width="${INNER - 32}" height="${item.itemH}" rx="10"
          fill="rgba(255,255,255,0.035)" stroke="${theme.primary}" stroke-opacity="0.22" stroke-width="1"/>
        
        <!-- Number circle badge -->
        <g transform="translate(26, ${circleCy})">
          <circle cx="0" cy="0" r="13"
            fill="${theme.badgeBg || 'rgba(167,139,250,0.18)'}"
            stroke="${theme.primary}" stroke-width="1.2"/>
          <text x="0" y="4.5" text-anchor="middle"
            font-size="13" font-weight="800" fill="${theme.primary}"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(numLabel)}</text>
        </g>
        
        <!-- Question text lines -->
        ${item.lines.map((line, li) => `
          <text x="52" y="${startY + li * ITEM_LINE_H}"
            font-size="${ITEM_FONT}" fill="#f8fafc" font-weight="600"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(line)}</text>
        `).join("")}
      </g>`;
    }).join("\n");

  } else {
    // Single question prompt
    const singleText = qItems[0]?.text || question || "";
    const qLen = singleText.length;
    const Q_FONT = qLen > 140 ? 23 : qLen > 80 ? 25 : 27;
    const Q_LINE_H = Q_FONT + 13;
    const qLines = wrapLines(singleText, Q_FONT <= 23 ? 44 : 38);
    Q_CARD_H = 48 + qLines.length * Q_LINE_H + 20;

    qContentSvg = qLines.map((line, i) =>
      `<text x="28" y="${58 + i * Q_LINE_H}"
        font-size="${Q_FONT}" fill="#ffffff" font-weight="700"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(line)}</text>`
    ).join("\n    ");
  }

  // 3. VOCABULARY Card
  const hasVocab = Array.isArray(vocabulary) && vocabulary.length > 0;
  const wordsToRender = hasVocab ? vocabulary.slice(0, 5) : [];
  
  // Calculate vocabulary card height
  let vocabItemsH = 0;
  const vocabRenderData = wordsToRender.map(w => {
    const exLines = wrapLines(w.example ? `"${w.example}"` : "", 52);
    const itemH = 34 + exLines.length * 22 + 10;
    vocabItemsH += itemH + 10;
    return { ...w, exLines, itemH };
  });

  const VOCAB_CARD_H = hasVocab ? (50 + vocabItemsH + 34) : 0;

  // Header & Footer
  const HEADER_H = 175;
  const FOOTER_H = 90;

  // Total Height
  const H = HEADER_H + GAP + TOPIC_CARD_H + GAP + Q_CARD_H + (hasVocab ? GAP + VOCAB_CARD_H : 0) + GAP + FOOTER_H + 35;

  // Y Positions
  const topicY = HEADER_H + GAP;
  const qCardY = topicY + TOPIC_CARD_H + GAP;
  const vocabY = qCardY + Q_CARD_H + GAP;
  const footerY = (hasVocab ? vocabY + VOCAB_CARD_H : qCardY + Q_CARD_H) + GAP;

  // Topic Rows
  const topicRows = topicLines.map((line, i) =>
    `<text x="${PAD + 28}" y="${topicY + 54 + i * TOPIC_LINE_H}"
      font-size="${TOPIC_FONT}" fill="#f1f5f9" font-style="italic" font-weight="400"
      font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(line)}</text>`
  ).join("\n  ");

  // Vocabulary Items
  let vocabRows = "";
  if (hasVocab) {
    let curItemY = vocabY + 52;
    vocabRows = vocabRenderData.map(w => {
      const itemBox = `
      <g transform="translate(${PAD + 16}, ${curItemY})">
        <!-- Sub-item card background -->
        <rect width="${INNER - 32}" height="${w.itemH}" rx="10"
          fill="rgba(255,255,255,0.03)" stroke="rgba(124,111,255,0.18)" stroke-width="1"/>
        
        <!-- Word and definition -->
        <text x="16" y="24" font-size="17" font-weight="700" fill="#a78bfa"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(w.word)}</text>
        <text x="${16 + w.word.length * 10 + 12}" y="24" font-size="14" font-style="italic" fill="#94a3b8"
          font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">— ${esc(w.meaning)}</text>
        
        <!-- Example sentence -->
        ${w.exLines.map((exLine, li) =>
          `<text x="16" y="${46 + li * 20}" font-size="14" fill="#cbd5e1" font-style="italic"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(exLine)}</text>`
        ).join("\n        ")}
      </g>`;
      curItemY += w.itemH + 10;
      return itemBox;
    }).join("\n");
  }

  // Dynamic pill badge calculation
  const badgeWidth = Math.max(180, Math.min(360, badgeTitle.length * 11 + 40));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Background Gradient (Deep Navy Night) -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#070716"/>
      <stop offset="40%"  stop-color="#0b0e24"/>
      <stop offset="80%"  stop-color="#080918"/>
      <stop offset="100%" stop-color="#05050e"/>
    </linearGradient>

    <!-- Title Gradient (Bright Cyan to Theme Primary) -->
    <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#ffffff"/>
      <stop offset="45%"  stop-color="#e0f2fe"/>
      <stop offset="100%" stop-color="${theme.primary}"/>
    </linearGradient>

    <!-- Button Gradient -->
    <linearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="${theme.secondary || '#7c6fff'}"/>
      <stop offset="50%"  stop-color="${theme.primary || '#6366f1'}"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>

    <!-- Glow filters -->
    <filter id="titleGlow" x="-20%" y="-40%" width="140%" height="180%">
      <feGaussianBlur stdDeviation="7" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="btnGlow" x="-10%" y="-20%" width="120%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

  <!-- Background Atmospheric Radial Glows -->
  <circle cx="${W * 0.85}" cy="${H * 0.12}" r="260" fill="rgba(56, 189, 248, 0.08)" filter="url(#btnGlow)"/>
  <circle cx="${W * 0.12}" cy="${H * 0.65}" r="240" fill="rgba(124, 111, 255, 0.07)" filter="url(#btnGlow)"/>

  <!-- Top Border Accent -->
  <rect x="0" y="0" width="${W}" height="4" fill="url(#titleGrad)"/>

  <!-- ═══ HEADER ═══ -->
  <!-- ✦ Speak & Shine Title -->
  <text x="${W / 2}" y="70" text-anchor="middle"
    font-size="46" font-weight="900" letter-spacing="-0.5"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"
    fill="url(#titleGrad)" filter="url(#titleGlow)">✦ Speak &amp; Shine</text>

  <!-- Subtitle -->
  <text x="${W / 2}" y="98" text-anchor="middle"
    font-size="12" fill="#64748b" letter-spacing="4" font-weight="700"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(challengeTypeLabel)}</text>

  <!-- Category Badge Pill -->
  <g transform="translate(${W / 2}, 132)">
    <rect x="${-badgeWidth / 2}" y="-15" width="${badgeWidth}" height="30" rx="15"
      fill="${theme.badgeBg || 'rgba(56, 189, 248, 0.1)'}" stroke="${theme.primary}" stroke-opacity="0.4" stroke-width="1.2"/>
    <text x="0" y="5" text-anchor="middle"
      font-size="13" font-weight="600" fill="${theme.primary}" letter-spacing="0.5"
      font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(badgeTitle)}</text>
  </g>

  <!-- ═══ TOPIC CARD ═══ -->
  <rect x="${PAD}" y="${topicY}" width="${INNER}" height="${TOPIC_CARD_H}" rx="16"
    fill="rgba(14, 18, 38, 0.7)" stroke="rgba(56, 189, 248, 0.15)" stroke-width="1.2"/>
  <text x="${PAD + 28}" y="${topicY + 28}"
    font-size="11" fill="#64748b" font-weight="800" letter-spacing="1.5"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(topicLabel)}</text>
  ${topicRows}

  <!-- ═══ QUESTION CARD ═══ -->
  <g transform="translate(${PAD}, ${qCardY})">
    <rect x="0" y="0" width="${INNER}" height="${Q_CARD_H}" rx="16"
      fill="rgba(14, 18, 38, 0.85)" stroke="${theme.primary}" stroke-opacity="0.25" stroke-width="1.2"/>
    <text x="28" y="30"
      font-size="11" fill="${isMultiQuestion ? theme.primary : '#f43f5e'}" font-weight="800" letter-spacing="1.5"
      font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(promptLabel)}</text>
    ${qContentSvg}
  </g>

  <!-- ═══ VOCABULARY CHALLENGE CONTAINER CARD ═══ -->
  ${hasVocab ? `
  <rect x="${PAD}" y="${vocabY}" width="${INNER}" height="${VOCAB_CARD_H}" rx="16"
    fill="rgba(14, 16, 38, 0.7)" stroke="rgba(124, 111, 255, 0.3)" stroke-width="1.2"/>
  
  <text x="${PAD + 24}" y="${vocabY + 32}"
    font-size="12" fill="#818cf8" font-weight="800" letter-spacing="1.5"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">◆ TODAY&apos;S VOCABULARY CHALLENGE</text>
  
  ${vocabRows}

  <text x="${PAD + 24}" y="${vocabY + VOCAB_CARD_H - 18}"
    font-size="13" fill="#94a3b8" font-weight="500"
    font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">★ Use at least ${vocabRequiredCount} of today&apos;s ${wordsToRender.length} vocabulary words naturally in your speaking video!</text>
  ` : ''}

  <!-- ═══ FOOTER CTA BUTTON ═══ -->
  <g transform="translate(${W / 2}, ${footerY + 36})">
    <rect x="-240" y="-25" width="480" height="50" rx="25"
      fill="url(#btnGrad)" filter="url(#btnGlow)"/>
    <text x="0" y="7" text-anchor="middle"
      font-size="17" font-weight="800" fill="#040510" letter-spacing="0.3"
      font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${esc(actionButtonLabel)}</text>
  </g>

  <!-- Bottom Border Accent -->
  <rect x="0" y="${H - 4}" width="${W}" height="4" fill="url(#titleGrad)"/>
</svg>`;

  const b64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}

/**
 * Ensure a poster exists in DB for today's question.
 * If the WhatsApp bot already stored one, use it as-is.
 * Only generate a new one if there's genuinely no poster stored.
 */
export async function ensurePoster(status) {
  if (!status || !status.todayQuestion) return status;

  // ── If poster exists and not expired, use it directly ──────────────────
  if (status.todayPosterImage) {
    const isExpired = status.posterExpiresAt && new Date() > new Date(status.posterExpiresAt);
    if (!isExpired) return status; // ✅ use bot's poster as-is

    // Expired — clear it so we regenerate below
    await Status.updateOne({}, { $set: { todayPosterImage: null, posterExpiresAt: null } });
    status = { ...status, todayPosterImage: null, posterExpiresAt: null };
  }

  // ── No poster stored — generate one (fallback only) ────────────────────
  try {
    const isPicture = status.isPictureDescriptionDay || status.todayContentType === "picture_description";
    const isStory = status.isStorySummaryDay || status.todayContentType === "story_audio";
    const vocabRequiredCount = isPicture
      ? (status.vocabPictureRequiredCount ?? 1)
      : isStory
      ? (status.vocabStoryRequiredCount ?? 3)
      : (status.vocabNormalRequiredCount ?? 3);

    console.log("[Poster] No poster in DB — generating fallback SVG...");
    const posterDataUri = generateSVGPoster({
      topic:              status.todayTopic    || "Speaking Practice",
      question:           status.todayQuestion || "",
      category:           status.todayCategory || "General",
      contentType:        status.todayContentType || "question",
      vocabulary:         status.todayVocabulary || [],
      vocabRequiredCount: vocabRequiredCount,
    });

    const expiresAt = new Date(Date.now() + 14 * 60 * 60 * 1000); // 14 hours
    await Status.updateOne(
      {},
      { $set: { todayPosterImage: posterDataUri, posterExpiresAt: expiresAt } }
    );
    console.log("[Poster] Fallback poster saved to DB");
    return { ...status, todayPosterImage: posterDataUri, posterExpiresAt: expiresAt };
  } catch (err) {
    console.error("[Poster] Generation failed:", err.message);
    return status;
  }
}

/**
 * Generate a high-resolution PNG poster buffer for sending to WhatsApp.
 * Returns a Buffer containing PNG image data.
 */
export async function generatePNGPosterBuffer(options = {}) {
  const svgDataUri = generateSVGPoster({
    topic:              options.topic || "Speaking Practice",
    question:           options.question || "",
    category:           options.category || "General",
    contentType:        options.contentType || "question",
    vocabulary:         options.vocabulary || [],
    vocabRequiredCount: options.vocabRequiredCount || 3,
  });

  const base64 = svgDataUri.replace("data:image/svg+xml;base64,", "");
  const svgBuffer = Buffer.from(base64, "base64");

  // Render SVG to crisp PNG buffer at standard 1.5x density
  const pngBuffer = await sharp(svgBuffer, { density: 150 })
    .png({ quality: 95 })
    .toBuffer();

  return pngBuffer;
}
