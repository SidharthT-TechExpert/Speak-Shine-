/**
 * Server-side SVG poster generator — matches the WhatsApp poster format exactly.
 * No canvas/native deps required.
 */

import Status from "../models/statusSchema.js";

// ── Theme map ─────────────────────────────────────────────────────────────────
const THEMES = {
  "Daily Life":          { primary: "#4ade80", secondary: "#22c55e", glow: "34,197,94",   cardBorder: "#22c55e", badgeBg: "rgba(34,197,94,0.18)",   btnText: "#052e16" },
  "English Growth":      { primary: "#fbbf24", secondary: "#d97706", glow: "251,191,36",  cardBorder: "#d97706", badgeBg: "rgba(251,191,36,0.18)",  btnText: "#1c0f00" },
  "Free Talk":           { primary: "#38bdf8", secondary: "#0ea5e9", glow: "56,189,248",  cardBorder: "#0ea5e9", badgeBg: "rgba(56,189,248,0.18)",  btnText: "#020c1b" },
  "Fun Topic":           { primary: "#fb923c", secondary: "#ea580c", glow: "251,146,60",  cardBorder: "#ea580c", badgeBg: "rgba(251,146,60,0.18)",  btnText: "#150800" },
  "Future Goals":        { primary: "#c084fc", secondary: "#9333ea", glow: "192,132,252", cardBorder: "#9333ea", badgeBg: "rgba(192,132,252,0.18)", btnText: "#0e0118" },
  "Opinion":             { primary: "#f472b6", secondary: "#db2777", glow: "244,114,182", cardBorder: "#db2777", badgeBg: "rgba(244,114,182,0.18)", btnText: "#150010" },
  "Personal Experience": { primary: "#fb7185", secondary: "#e11d48", glow: "251,113,133", cardBorder: "#e11d48", badgeBg: "rgba(251,113,133,0.18)", btnText: "#150008" },
  "Travel":              { primary: "#38bdf8", secondary: "#0ea5e9", glow: "56,189,248",  cardBorder: "#0ea5e9", badgeBg: "rgba(56,189,248,0.18)",  btnText: "#020c1b" },
  "Technology":          { primary: "#a78bfa", secondary: "#7c3aed", glow: "167,139,250", cardBorder: "#7c3aed", badgeBg: "rgba(167,139,250,0.18)", btnText: "#0d0117" },
  "Food":                { primary: "#fb923c", secondary: "#ea580c", glow: "251,146,60",  cardBorder: "#ea580c", badgeBg: "rgba(251,146,60,0.18)",  btnText: "#150800" },
  "Health":              { primary: "#34d399", secondary: "#059669", glow: "52,211,153",  cardBorder: "#059669", badgeBg: "rgba(52,211,153,0.18)",  btnText: "#011208" },
  "Work":                { primary: "#60a5fa", secondary: "#2563eb", glow: "96,165,250",  cardBorder: "#2563eb", badgeBg: "rgba(96,165,250,0.18)",  btnText: "#020b1a" },
  "default":             { primary: "#c084fc", secondary: "#9333ea", glow: "192,132,252", cardBorder: "#9333ea", badgeBg: "rgba(192,132,252,0.18)", btnText: "#0e0118" },
};

const KEYWORD_MAP = [
  { keywords: ["daily", "routine", "morning", "evening"],           theme: "Daily Life" },
  { keywords: ["english", "grammar", "language", "vocab", "speak"], theme: "English Growth" },
  { keywords: ["free", "talk", "chat", "casual"],                   theme: "Free Talk" },
  { keywords: ["fun", "funny", "humor", "joke"],                    theme: "Fun Topic" },
  { keywords: ["future", "goal", "dream", "plan", "ambition", "retire", "retirement"], theme: "Future Goals" },
  { keywords: ["opinion", "think", "view", "perspective", "believe"], theme: "Opinion" },
  { keywords: ["personal", "experience", "story", "memory"],        theme: "Personal Experience" },
  { keywords: ["travel", "trip", "journey", "country"],             theme: "Travel" },
  { keywords: ["tech", "technology", "ai", "internet", "digital"],  theme: "Technology" },
  { keywords: ["food", "eat", "cook", "meal", "recipe"],            theme: "Food" },
  { keywords: ["health", "fitness", "exercise", "mental"],          theme: "Health" },
  { keywords: ["work", "job", "office", "profession"],              theme: "Work" },
];

function getTheme(category) {
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Wrap text into lines given max chars per line
function wrapLines(text, maxChars) {
  const words = String(text || "").split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (test.length > maxChars && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Generate an SVG poster that matches the WhatsApp poster format.
 * Returns a base64 data URI: data:image/svg+xml;base64,...
 */
export function generateSVGPoster({ topic, question, category }) {
  const theme = getTheme(category || topic);

  const W = 600;
  const PAD = 32;
  const INNER = W - PAD * 2;

  // Topic lines — italic, elegant styling
  const topicLines = wrapLines(`"${topic || "Speaking Practice"}"`, 45);
  const TOPIC_LINE_H = 36;
  const TOPIC_CARD_H = 50 + topicLines.length * TOPIC_LINE_H + 28;

  // Question lines — bold large, optimized for readability
  const qLen = (question || "").length;
  const Q_FONT = qLen > 140 ? 24 : qLen > 100 ? 28 : qLen > 70 ? 32 : qLen > 40 ? 36 : 40;
  const Q_LINE_H = Q_FONT + 14;
  const qLines = wrapLines(question || "", Math.floor(INNER / (Q_FONT * 0.52)));
  const Q_CARD_H = 60 + qLines.length * Q_LINE_H + 32;

  // Layout - WhatsApp poster proportions
  const HEADER_H = 220;
  const GAP = 20;
  const FOOTER_H = 100;
  const H = HEADER_H + GAP + TOPIC_CARD_H + GAP + Q_CARD_H + GAP + FOOTER_H + 24;

  // Y positions
  const topicY = HEADER_H + GAP;
  const qCardY = topicY + TOPIC_CARD_H + GAP;
  const footerY = qCardY + Q_CARD_H + GAP;

  // Build topic text rows - elegant italic styling
  const topicRows = topicLines.map((line, i) =>
    `<text x="${PAD + 24}" y="${topicY + 50 + i * TOPIC_LINE_H}"
      font-size="24" fill="#e2d9f3" font-style="italic" font-weight="300"
      font-family="'Georgia', 'Times New Roman', serif">${esc(line)}</text>`
  ).join("\n  ");

  // Build question text rows - bold and prominent
  const qRows = qLines.map((line, i) =>
    `<text x="${PAD + 24}" y="${qCardY + 60 + i * Q_LINE_H}"
      font-size="${Q_FONT}" fill="#ffffff" font-weight="bold"
      font-family="'Arial Black', 'Arial', 'Helvetica', sans-serif">${esc(line)}</text>`
  ).join("\n  ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Dark purple gradient background (exact WhatsApp poster style) -->
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#1a0b2e"/>
      <stop offset="30%"  stop-color="#16213e"/>
      <stop offset="70%"  stop-color="#0f0f23"/>
      <stop offset="100%" stop-color="#0a0612"/>
    </linearGradient>
    <!-- Title gradient: bright white to theme -->
    <linearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#ffffff"/>
      <stop offset="50%"  stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="${theme.primary}"/>
    </linearGradient>
    <!-- Footer button gradient -->
    <linearGradient id="btnGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${theme.primary}"/>
      <stop offset="100%" stop-color="${theme.secondary}"/>
    </linearGradient>
    <!-- Enhanced glow for title -->
    <filter id="titleGlow" x="-30%" y="-60%" width="160%" height="220%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <!-- Card glow effect -->
    <filter id="cardGlow" x="-8%" y="-8%" width="116%" height="116%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background with exact WhatsApp poster gradient -->
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

  <!-- Atmospheric purple glows -->
  <ellipse cx="${W * 0.85}" cy="${H * 0.12}" rx="220" ry="180"
    fill="rgba(${theme.glow},0.15)" opacity="0.8"/>
  <ellipse cx="${W * 0.15}" cy="${H * 0.8}" rx="180" ry="140"
    fill="rgba(${theme.glow},0.1)" opacity="0.6"/>

  <!-- Top accent border -->
  <rect x="0" y="0" width="${W}" height="4" fill="url(#titleGrad)" opacity="0.8"/>

  <!-- ═══ HEADER SECTION ═══ -->
  <!-- Main title - large and bold -->
  <text x="${W / 2}" y="88" text-anchor="middle"
    font-size="64" font-weight="900" letter-spacing="-2"
    font-family="'Arial Black', 'Helvetica', sans-serif"
    fill="url(#titleGrad)" filter="url(#titleGlow)">Speak &amp; Shine</text>

  <!-- Subtitle with spacing -->
  <text x="${W / 2}" y="118" text-anchor="middle"
    font-size="13" fill="#9ca3af" letter-spacing="5" font-weight="500"
    font-family="'Arial', 'Helvetica', sans-serif">DAILY SPEAKING CHALLENGE</text>

  <!-- Elegant divider line -->
  <line x1="${W * 0.25}" y1="138" x2="${W * 0.75}" y2="138"
    stroke="${theme.primary}" stroke-opacity="0.4" stroke-width="2"/>

  <!-- Category badge - pill style -->
  <rect x="${W / 2 - 120}" y="155" width="240" height="42" rx="21"
    fill="rgba(${theme.glow},0.15)" stroke="${theme.primary}" stroke-width="2"/>
  <text x="${W / 2}" y="181" text-anchor="middle"
    font-size="16" font-weight="bold" fill="${theme.primary}"
    font-family="'Arial', 'Helvetica', sans-serif">✦ ${esc(category || "General")}</text>

  <!-- ═══ TOPIC CARD ═══ -->
  <rect x="${PAD}" y="${topicY}" width="${INNER}" height="${TOPIC_CARD_H}" rx="16"
    fill="rgba(15,10,35,0.8)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <!-- Left accent -->
  <rect x="${PAD}" y="${topicY + 16}" width="5" height="${TOPIC_CARD_H - 32}" rx="2.5"
    fill="${theme.primary}" opacity="0.7"/>
  <!-- TOPIC label -->
  <text x="${PAD + 24}" y="${topicY + 32}"
    font-size="12" fill="#64748b" font-weight="bold" letter-spacing="2"
    font-family="'Arial', 'Helvetica', sans-serif">TOPIC</text>
  ${topicRows}

  <!-- ═══ QUESTION CARD ═══ -->
  <!-- Outer glow -->
  <rect x="${PAD - 3}" y="${qCardY - 3}" width="${INNER + 6}" height="${Q_CARD_H + 6}" rx="19"
    fill="none" stroke="${theme.cardBorder}" stroke-opacity="0.4" stroke-width="6"
    filter="url(#cardGlow)"/>
  <!-- Main card -->
  <rect x="${PAD}" y="${qCardY}" width="${INNER}" height="${Q_CARD_H}" rx="16"
    fill="rgba(25,15,50,0.9)" stroke="${theme.cardBorder}" stroke-width="2.5"/>
  <!-- Left accent bar -->
  <rect x="${PAD}" y="${qCardY + 16}" width="5" height="${Q_CARD_H - 32}" rx="2.5"
    fill="${theme.primary}"/>
  <!-- QUESTION label -->
  <text x="${PAD + 24}" y="${qCardY + 36}"
    font-size="14" fill="${theme.primary}" font-weight="bold" letter-spacing="1"
    font-family="'Arial', 'Helvetica', sans-serif">❓ QUESTION</text>
  ${qRows}

  <!-- ═══ FOOTER BUTTON ═══ -->
  <!-- Pill-shaped button -->
  <rect x="${W / 2 - 200}" y="${footerY + 18}" width="400" height="56" rx="28"
    fill="url(#btnGrad)" filter="url(#cardGlow)"/>
  <!-- Button highlight -->
  <rect x="${W / 2 - 200}" y="${footerY + 18}" width="400" height="28" rx="28"
    fill="rgba(255,255,255,0.15)"/>
  <text x="${W / 2}" y="${footerY + 52}" text-anchor="middle"
    font-size="18" font-weight="bold" fill="#0a0612"
    font-family="'Arial Black', 'Helvetica', sans-serif">🎥 Send your 1-min speaking video!</text>

  <!-- Bottom accent border -->
  <rect x="0" y="${H - 4}" width="${W}" height="4" fill="url(#titleGrad)" opacity="0.8"/>
</svg>`;

  const b64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}

/**
 * Ensure a poster exists in DB for today's question.
 * Generates and saves one with 14h TTL if missing or expired.
 */
export async function ensurePoster(status) {
  if (!status || !status.todayQuestion) return status;

  // Clear expired poster
  const isExpired = status.posterExpiresAt && new Date() > new Date(status.posterExpiresAt);
  if (isExpired) {
    await Status.updateOne({}, { $set: { todayPosterImage: null, posterExpiresAt: null } });
    status = { ...status, todayPosterImage: null, posterExpiresAt: null };
  }

  if (status.todayPosterImage) return status; // already fresh

  try {
    console.log("[Poster] Generating SVG poster...");
    const posterDataUri = generateSVGPoster({
      topic:    status.todayTopic    || "Speaking Practice",
      question: status.todayQuestion,
      category: status.todayCategory || "General",
    });

    const expiresAt = new Date(Date.now() + 14 * 60 * 60 * 1000); // 14 hours
    await Status.updateOne(
      {},
      { $set: { todayPosterImage: posterDataUri, posterExpiresAt: expiresAt } }
    );
    console.log("[Poster] Saved to DB (expires in 14h)");
    return { ...status, todayPosterImage: posterDataUri, posterExpiresAt: expiresAt };
  } catch (err) {
    console.error("[Poster] Generation failed:", err.message);
    return status;
  }
}
