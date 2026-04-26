/**
 * Server-side poster generator — no canvas/native deps required.
 * Generates an SVG-based poster as a data URI and stores it in DB with 14h TTL.
 */

import Status from "../models/statusSchema.js";

// ── Theme map (same categories as poster.js) ──────────────────────────────
const THEMES = {
  "Daily Life":          { primary: "#4ade80", secondary: "#22c55e", bg: "#020617", card: "#0f2a1a" },
  "English Growth":      { primary: "#fbbf24", secondary: "#d97706", bg: "#120c00", card: "#2a1a00" },
  "Free Talk":           { primary: "#38bdf8", secondary: "#0ea5e9", bg: "#020c1b", card: "#0a1f35" },
  "Fun Topic":           { primary: "#fb923c", secondary: "#ea580c", bg: "#150800", card: "#2a1200" },
  "Future Goals":        { primary: "#c084fc", secondary: "#9333ea", bg: "#0e0118", card: "#1e0535" },
  "Opinion":             { primary: "#f472b6", secondary: "#db2777", bg: "#150010", card: "#2a0020" },
  "Personal Experience": { primary: "#fb7185", secondary: "#e11d48", bg: "#150008", card: "#2a0015" },
  "Travel":              { primary: "#38bdf8", secondary: "#0ea5e9", bg: "#020c1b", card: "#0a1f35" },
  "Technology":          { primary: "#a78bfa", secondary: "#7c3aed", bg: "#0d0117", card: "#1a0535" },
  "Food":                { primary: "#fb923c", secondary: "#ea580c", bg: "#150800", card: "#2a1200" },
  "Health":              { primary: "#34d399", secondary: "#059669", bg: "#011208", card: "#022c16" },
  "Work":                { primary: "#60a5fa", secondary: "#2563eb", bg: "#020b1a", card: "#0a1628" },
  "default":             { primary: "#4ade80", secondary: "#22c55e", bg: "#020617", card: "#0f2a1a" },
};

const KEYWORD_MAP = [
  { keywords: ["daily", "routine", "life", "morning", "evening"], theme: "Daily Life" },
  { keywords: ["english", "grammar", "language", "vocab", "speak"], theme: "English Growth" },
  { keywords: ["free", "talk", "chat", "casual"], theme: "Free Talk" },
  { keywords: ["fun", "funny", "humor", "joke"], theme: "Fun Topic" },
  { keywords: ["future", "goal", "dream", "plan", "ambition"], theme: "Future Goals" },
  { keywords: ["opinion", "think", "view", "perspective", "believe"], theme: "Opinion" },
  { keywords: ["personal", "experience", "story", "memory"], theme: "Personal Experience" },
  { keywords: ["travel", "trip", "journey", "country"], theme: "Travel" },
  { keywords: ["tech", "technology", "ai", "internet", "digital"], theme: "Technology" },
  { keywords: ["food", "eat", "cook", "meal", "recipe"], theme: "Food" },
  { keywords: ["health", "fitness", "exercise", "mental"], theme: "Health" },
  { keywords: ["work", "job", "office", "profession"], theme: "Work" },
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
  // Deterministic color from category name
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) & 0xffffffff;
  const hue = Math.abs(hash) % 360;
  return {
    primary: `hsl(${hue},80%,65%)`,
    secondary: `hsl(${hue},75%,50%)`,
    bg: `hsl(${hue},40%,4%)`,
    card: `hsl(${hue},50%,10%)`,
  };
}

// Escape XML special chars for SVG
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Wrap text into lines given approximate char width
function wrapText(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Generate an SVG poster as a base64 data URI.
 */
export function generateSVGPoster({ topic, question, category }) {
  const theme = getTheme(category);

  const topicLines = wrapText(topic || "Speaking Practice", 52);
  const qLines = wrapText(question || "", 44);
  const qFontSize = (question || "").length > 120 ? 22 : (question || "").length > 80 ? 26 : 30;
  const qLineH = qFontSize + 10;

  const HEADER_H = 180;
  const TOPIC_H = 60 + topicLines.length * 44 + 30;
  const Q_H = 70 + qLines.length * qLineH + 40;
  const FOOTER_H = 100;
  const H = HEADER_H + TOPIC_H + Q_H + FOOTER_H + 60;
  const W = 800;

  // Build question text rows
  const qTextRows = qLines.map((line, i) =>
    `<text x="60" y="${i * qLineH}" font-size="${qFontSize}" fill="white" font-weight="bold" font-family="Arial, sans-serif">${esc(line)}</text>`
  ).join("\n    ");

  // Build topic text rows
  const topicTextRows = topicLines.map((line, i) =>
    `<text x="60" y="${i * 44}" font-size="26" fill="#cbd5e1" font-style="italic" font-family="Arial, sans-serif">${esc(line)}</text>`
  ).join("\n    ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${theme.bg}"/>
      <stop offset="100%" stop-color="${theme.card}"/>
    </linearGradient>
    <linearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="white"/>
      <stop offset="100%" stop-color="${theme.primary}"/>
    </linearGradient>
    <linearGradient id="btnGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.secondary}"/>
      <stop offset="100%" stop-color="${theme.primary}"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="${W}" height="4" fill="url(#titleGrad)"/>

  <!-- Title -->
  <text x="${W / 2}" y="80" text-anchor="middle" font-size="58" font-weight="bold"
    font-family="Arial, sans-serif" fill="url(#titleGrad)" filter="url(#glow)">Speak &amp; Shine</text>

  <!-- Subtitle -->
  <text x="${W / 2}" y="118" text-anchor="middle" font-size="18" fill="#64748b"
    font-family="Arial, sans-serif" letter-spacing="3">DAILY SPEAKING CHALLENGE</text>

  <!-- Divider -->
  <line x1="150" y1="132" x2="${W - 150}" y2="132" stroke="${theme.primary}" stroke-opacity="0.4" stroke-width="1"/>

  <!-- Category badge -->
  <rect x="${W / 2 - 120}" y="144" width="240" height="36" rx="18"
    fill="${theme.primary}" fill-opacity="0.15" stroke="${theme.primary}" stroke-width="1.5"/>
  <text x="${W / 2}" y="167" text-anchor="middle" font-size="15" font-weight="bold"
    fill="${theme.primary}" font-family="Arial, sans-serif">✦ ${esc(category || "General")}</text>

  <!-- Topic card -->
  <rect x="40" y="${HEADER_H}" width="${W - 80}" height="${TOPIC_H}" rx="16"
    fill="rgba(15,23,42,0.7)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
  <text x="60" y="${HEADER_H + 32}" font-size="13" fill="#64748b" font-weight="bold"
    letter-spacing="3" font-family="Arial, sans-serif">TOPIC</text>
  <g transform="translate(0, ${HEADER_H + 52})">
    ${topicTextRows}
  </g>

  <!-- Question card -->
  <rect x="40" y="${HEADER_H + TOPIC_H + 16}" width="${W - 80}" height="${Q_H}" rx="16"
    fill="${theme.card}" fill-opacity="0.8" stroke="${theme.primary}" stroke-width="2"/>
  <!-- Left accent bar -->
  <rect x="40" y="${HEADER_H + TOPIC_H + 36}" width="5" height="${Q_H - 40}" rx="3" fill="${theme.primary}"/>
  <text x="60" y="${HEADER_H + TOPIC_H + 52}" font-size="15" fill="${theme.primary}" font-weight="bold"
    font-family="Arial, sans-serif">❓  QUESTION</text>
  <g transform="translate(0, ${HEADER_H + TOPIC_H + 72})">
    ${qTextRows}
  </g>

  <!-- Footer button -->
  <rect x="${W / 2 - 240}" y="${HEADER_H + TOPIC_H + Q_H + 28}" width="480" height="52" rx="26"
    fill="url(#btnGrad)"/>
  <text x="${W / 2}" y="${HEADER_H + TOPIC_H + Q_H + 60}" text-anchor="middle"
    font-size="18" font-weight="bold" fill="#052e16" font-family="Arial, sans-serif">
    🎥  Send your 1-min speaking video!
  </text>

  <!-- Bottom accent bar -->
  <rect x="0" y="${H - 4}" width="${W}" height="4" fill="url(#titleGrad)"/>
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
    console.log("[Poster] Generating SVG poster for today's question...");
    const posterDataUri = generateSVGPoster({
      topic: status.todayTopic || "Speaking Practice",
      question: status.todayQuestion,
      category: status.todayTopic || null,
    });

    const expiresAt = new Date(Date.now() + 14 * 60 * 60 * 1000); // 14 hours
    await Status.updateOne(
      {},
      { $set: { todayPosterImage: posterDataUri, posterExpiresAt: expiresAt } }
    );
    console.log("[Poster] SVG poster saved to DB (expires in 14h)");

    return { ...status, todayPosterImage: posterDataUri, posterExpiresAt: expiresAt };
  } catch (err) {
    console.error("[Poster] Generation failed:", err.message);
    return status;
  }
}
