import { createCanvas } from "canvas";
import fs from "fs";

// ── Category → theme mapping ──────────────────────────────────────────────
const THEMES = {
  // ── Your actual DB categories ──
  "Daily Life":         { primary: "#4ade80", secondary: "#22c55e", accent: "#bbf7d0", bg1: "#020617", bg2: "#0f172a", glow1: "rgba(34,197,94,0.15)",  glow2: "rgba(16,185,129,0.08)",  cardBg: "rgba(20,83,45,0.35)",   cardBorder: "#22c55e" },
  "English Growth":     { primary: "#fbbf24", secondary: "#d97706", accent: "#fde68a", bg1: "#120c00", bg2: "#1c1200", glow1: "rgba(251,191,36,0.15)", glow2: "rgba(217,119,6,0.08)",   cardBg: "rgba(120,53,15,0.35)",  cardBorder: "#d97706" },
  "Free Talk":          { primary: "#38bdf8", secondary: "#0ea5e9", accent: "#bae6fd", bg1: "#020c1b", bg2: "#0c1a2e", glow1: "rgba(56,189,248,0.15)", glow2: "rgba(14,165,233,0.08)",  cardBg: "rgba(7,89,133,0.35)",   cardBorder: "#0ea5e9" },
  "Fun Topic":          { primary: "#fb923c", secondary: "#ea580c", accent: "#fed7aa", bg1: "#150800", bg2: "#1c0f00", glow1: "rgba(251,146,60,0.15)", glow2: "rgba(234,88,12,0.08)",   cardBg: "rgba(124,45,18,0.35)",  cardBorder: "#ea580c" },
  "Future Goals":       { primary: "#c084fc", secondary: "#9333ea", accent: "#f3e8ff", bg1: "#0e0118", bg2: "#1a0530", glow1: "rgba(192,132,252,0.15)",glow2: "rgba(147,51,234,0.08)",  cardBg: "rgba(88,28,135,0.35)",  cardBorder: "#9333ea" },
  "Opinion":            { primary: "#f472b6", secondary: "#db2777", accent: "#fce7f3", bg1: "#150010", bg2: "#200018", glow1: "rgba(244,114,182,0.15)",glow2: "rgba(219,39,119,0.08)",  cardBg: "rgba(131,24,67,0.35)",  cardBorder: "#db2777" },
  "Personal Experience":{ primary: "#fb7185", secondary: "#e11d48", accent: "#ffe4e6", bg1: "#150008", bg2: "#200010", glow1: "rgba(251,113,133,0.15)",glow2: "rgba(225,29,72,0.08)",   cardBg: "rgba(136,19,55,0.35)",  cardBorder: "#e11d48" },

  // ── Extra common categories ──
  "Travel":             { primary: "#38bdf8", secondary: "#0ea5e9", accent: "#bae6fd", bg1: "#020c1b", bg2: "#0c1a2e", glow1: "rgba(56,189,248,0.15)", glow2: "rgba(14,165,233,0.08)",  cardBg: "rgba(7,89,133,0.35)",   cardBorder: "#0ea5e9" },
  "Technology":         { primary: "#a78bfa", secondary: "#7c3aed", accent: "#ddd6fe", bg1: "#0d0117", bg2: "#1a0533", glow1: "rgba(167,139,250,0.15)",glow2: "rgba(124,58,237,0.08)",  cardBg: "rgba(76,29,149,0.35)",  cardBorder: "#7c3aed" },
  "Food":               { primary: "#fb923c", secondary: "#ea580c", accent: "#fed7aa", bg1: "#150800", bg2: "#1c0f00", glow1: "rgba(251,146,60,0.15)", glow2: "rgba(234,88,12,0.08)",   cardBg: "rgba(124,45,18,0.35)",  cardBorder: "#ea580c" },
  "Health":             { primary: "#34d399", secondary: "#059669", accent: "#a7f3d0", bg1: "#011208", bg2: "#022c16", glow1: "rgba(52,211,153,0.15)", glow2: "rgba(5,150,105,0.08)",   cardBg: "rgba(6,78,59,0.35)",    cardBorder: "#059669" },
  "Work":               { primary: "#60a5fa", secondary: "#2563eb", accent: "#bfdbfe", bg1: "#020b1a", bg2: "#0a1628", glow1: "rgba(96,165,250,0.15)", glow2: "rgba(37,99,235,0.08)",   cardBg: "rgba(30,58,138,0.35)",  cardBorder: "#2563eb" },
  "default":            { primary: "#4ade80", secondary: "#22c55e", accent: "#bbf7d0", bg1: "#020617", bg2: "#0f172a", glow1: "rgba(34,197,94,0.15)",  glow2: "rgba(59,130,246,0.08)",  cardBg: "rgba(20,83,45,0.35)",   cardBorder: "#22c55e" },
};

// Keyword → theme key for fuzzy fallback
const KEYWORD_MAP = [
  { keywords: ["daily", "routine", "life", "morning", "evening", "day"],          theme: "Daily Life" },
  { keywords: ["english", "grammar", "language", "vocab", "speak", "growth"],     theme: "English Growth" },
  { keywords: ["free", "talk", "chat", "casual", "conversation"],                 theme: "Free Talk" },
  { keywords: ["fun", "funny", "humor", "joke", "entertain", "interesting"],      theme: "Fun Topic" },
  { keywords: ["future", "goal", "dream", "plan", "ambition", "career"],          theme: "Future Goals" },
  { keywords: ["opinion", "think", "view", "perspective", "believe", "feel"],     theme: "Opinion" },
  { keywords: ["personal", "experience", "story", "memory", "moment", "life"],    theme: "Personal Experience" },
  { keywords: ["travel", "trip", "journey", "country", "place", "visit"],         theme: "Travel" },
  { keywords: ["tech", "technology", "ai", "internet", "digital", "app"],         theme: "Technology" },
  { keywords: ["food", "eat", "cook", "meal", "recipe", "restaurant"],            theme: "Food" },
  { keywords: ["health", "fitness", "exercise", "mental", "wellness"],            theme: "Health" },
  { keywords: ["work", "job", "office", "profession", "business"],                theme: "Work" },
];

function getTheme(category) {
  if (!category) return THEMES.default;
  const cat = category.toLowerCase().trim();

  // 1. Exact match
  const exactKey = Object.keys(THEMES).find(k => k.toLowerCase() === cat);
  if (exactKey) return THEMES[exactKey];

  // 2. Partial match — theme key is contained in category or vice versa
  const partialKey = Object.keys(THEMES).find(k =>
    k !== "default" && (cat.includes(k.toLowerCase()) || k.toLowerCase().includes(cat))
  );
  if (partialKey) return THEMES[partialKey];

  // 3. Keyword match — check category against keyword lists
  for (const { keywords, theme } of KEYWORD_MAP) {
    if (keywords.some(kw => cat.includes(kw))) return THEMES[theme];
  }

  // 4. Fallback — generate a deterministic color from the category string
  //    so every unknown category still gets a unique non-green theme
  return generateDynamicTheme(category);
}

// Generates a unique theme for any unknown category using its name as a seed
function generateDynamicTheme(category) {
  // Hash the category string to a hue value 0-360
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) & 0xffffffff;
  }
  const hue = Math.abs(hash) % 360;

  const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
  const hsla = (h, s, l, a) => `hsla(${h},${s}%,${l}%,${a})`;

  return {
    primary:    hsl(hue, 80, 65),
    secondary:  hsl(hue, 75, 50),
    accent:     hsl(hue, 80, 90),
    bg1:        hsl(hue, 40, 4),
    bg2:        hsl(hue, 35, 8),
    glow1:      hsla(hue, 70, 55, 0.15),
    glow2:      hsla(hue, 60, 45, 0.08),
    cardBg:     hsla(hue, 60, 20, 0.35),
    cardBorder: hsl(hue, 70, 50),
  };
}

// ── Text measurement helpers ──────────────────────────────────────────────
function measureWrappedLines(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, cy);
  return cy; // return last y position
}

// ── Drawing primitives ────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r, fillStyle, strokeStyle = null, lineWidth = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
  if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function glow(ctx, x, y, radius, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function decorativeDots(ctx, color, count, seed) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    // deterministic pseudo-random positions
    const x = ((seed * 137 + i * 293) % 1080);
    const y = ((seed * 251 + i * 179) % 1080);
    const r = 1.5 + (i % 3);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function cornerAccent(ctx, x, y, size, color, flip = false) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  const sx = flip ? x + size : x;
  const ex = flip ? x : x + size;
  ctx.beginPath();
  ctx.moveTo(sx, y);
  ctx.lineTo(x + (flip ? size : 0), y);
  ctx.lineTo(x + (flip ? size : 0), y + size);
  ctx.stroke();
}

// ── Main export ───────────────────────────────────────────────────────────
export default async function generatePoster(question) {
  const theme = getTheme(question.category);

  const PAD = 80;       // horizontal padding
  const W = 1080;
  const INNER_W = W - PAD * 2;

  // ── Measure question text to determine canvas height ──────────────────
  // Use a temp canvas to measure
  const tmpCanvas = createCanvas(W, 100);
  const tmpCtx = tmpCanvas.getContext("2d");

  // Topic lines
  tmpCtx.font = "italic 38px Arial";
  const topicLines = measureWrappedLines(tmpCtx, `"${question.topic}"`, INNER_W - 100);

  // Question lines — font size adapts to length
  const qLen = (question.question || "").length;
  const qFontSize = qLen > 160 ? 36 : qLen > 100 ? 42 : qLen > 60 ? 48 : 54;
  const qLineH = qFontSize + 14;
  tmpCtx.font = `bold ${qFontSize}px Arial`;
  const qLines = measureWrappedLines(tmpCtx, question.question, INNER_W - 100);

  // Layout constants
  const HEADER_H   = 260;                          // title + subtitle + badge
  const TOPIC_H    = 80 + topicLines.length * 52 + 40;  // label + lines + padding
  const Q_H        = 80 + qLines.length * qLineH + 50;  // label + lines + padding
  const GAP        = 28;
  const FOOTER_H   = 120;
  const CANVAS_H   = HEADER_H + GAP + TOPIC_H + GAP + Q_H + GAP + FOOTER_H + 40;

  const canvas = createCanvas(W, CANVAS_H);
  const ctx = canvas.getContext("2d");

  // ── Background ────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, CANVAS_H);
  bg.addColorStop(0, theme.bg1);
  bg.addColorStop(0.5, theme.bg2);
  bg.addColorStop(1, theme.bg1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, CANVAS_H);

  // Subtle grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
  }
  for (let y = 0; y < CANVAS_H; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Ambient glows
  glow(ctx, W * 0.75, CANVAS_H * 0.15, 500, theme.glow1);
  glow(ctx, W * 0.2,  CANVAS_H * 0.8,  400, theme.glow2);
  glow(ctx, W * 0.5,  CANVAS_H * 0.5,  300, "rgba(255,255,255,0.02)");

  // Decorative dots
  decorativeDots(ctx, `${theme.primary}22`, 18, 42);

  // ── Header ────────────────────────────────────────────────────────────
  // Top accent line
  const accentLine = ctx.createLinearGradient(0, 0, W, 0);
  accentLine.addColorStop(0, "transparent");
  accentLine.addColorStop(0.3, theme.primary);
  accentLine.addColorStop(0.7, theme.secondary);
  accentLine.addColorStop(1, "transparent");
  ctx.fillStyle = accentLine;
  ctx.fillRect(0, 0, W, 4);

  ctx.textAlign = "center";

  // Title "Speak & Shine"
  ctx.shadowBlur = 30;
  ctx.shadowColor = `${theme.primary}88`;
  const titleGrad = ctx.createLinearGradient(300, 0, 780, 0);
  titleGrad.addColorStop(0, "#ffffff");
  titleGrad.addColorStop(0.6, theme.accent);
  titleGrad.addColorStop(1, theme.primary);
  ctx.fillStyle = titleGrad;
  ctx.font = "bold 82px Arial";
  ctx.fillText("Speak & Shine", W / 2, 110);
  ctx.shadowBlur = 0;

  // Subtitle
  ctx.fillStyle = "#64748b";
  ctx.font = "600 28px Arial";
  ctx.fillText("DAILY SPEAKING CHALLENGE", W / 2, 158);

  // Divider line under subtitle
  const divGrad = ctx.createLinearGradient(200, 0, 880, 0);
  divGrad.addColorStop(0, "transparent");
  divGrad.addColorStop(0.5, `${theme.primary}66`);
  divGrad.addColorStop(1, "transparent");
  ctx.fillStyle = divGrad;
  ctx.fillRect(200, 172, 680, 1);

  // Category badge
  const badgeW = 280, badgeH = 48, badgeX = (W - badgeW) / 2, badgeY = 190;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 24, `${theme.primary}22`, theme.primary, 1.5);
  ctx.fillStyle = theme.primary;
  ctx.font = "bold 22px Arial";
  ctx.fillText(`✦ ${question.category || "General"}`, W / 2, badgeY + 31);

  // ── Topic Card ────────────────────────────────────────────────────────
  const topicY = HEADER_H + GAP;
  roundRect(ctx, PAD, topicY, INNER_W, TOPIC_H, 24, "rgba(15,23,42,0.7)", "rgba(255,255,255,0.1)", 1.5);

  // Corner accents on topic card
  cornerAccent(ctx, PAD + 16, topicY + 16, 20, `${theme.primary}88`);
  cornerAccent(ctx, PAD + INNER_W - 36, topicY + 16, 20, `${theme.primary}88`, true);

  ctx.textAlign = "left";
  ctx.fillStyle = "#64748b";
  ctx.font = "bold 20px Arial";
  ctx.letterSpacing = "3px";
  ctx.fillText("TOPIC", PAD + 40, topicY + 44);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#cbd5e1";
  ctx.font = `italic 38px Arial`;
  drawWrappedText(ctx, `"${question.topic}"`, PAD + 40, topicY + 88, INNER_W - 80, 52);

  // ── Question Card ─────────────────────────────────────────────────────
  const qCardY = topicY + TOPIC_H + GAP;

  // Outer glow effect for question card
  glow(ctx, W / 2, qCardY + Q_H / 2, 350, `${theme.primary}18`);

  roundRect(ctx, PAD, qCardY, INNER_W, Q_H, 24, theme.cardBg, theme.cardBorder, 2);

  // Left accent bar
  roundRect(ctx, PAD, qCardY + 20, 5, Q_H - 40, 3, theme.primary);

  // Question label
  ctx.fillStyle = theme.primary;
  ctx.font = "bold 22px Arial";
  ctx.fillText("❓  QUESTION", PAD + 40, qCardY + 48);

  // Question text
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${qFontSize}px Arial`;
  ctx.shadowBlur = 8;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  drawWrappedText(ctx, question.question, PAD + 40, qCardY + 48 + qLineH + 10, INNER_W - 80, qLineH);
  ctx.shadowBlur = 0;

  // ── Footer ────────────────────────────────────────────────────────────
  const footerY = qCardY + Q_H + GAP;

  // Footer pill button
  const pillW = 580, pillH = 64, pillX = (W - pillW) / 2, pillY = footerY + 16;
  const pillGrad = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
  pillGrad.addColorStop(0, theme.secondary);
  pillGrad.addColorStop(1, theme.primary);
  roundRect(ctx, pillX, pillY, pillW, pillH, 32, pillGrad);

  // Pill shine
  const shine = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
  shine.addColorStop(0, "rgba(255,255,255,0.2)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  roundRect(ctx, pillX, pillY, pillW, pillH / 2, 32, shine);

  ctx.textAlign = "center";
  ctx.fillStyle = "#052e16";
  ctx.font = "bold 28px Arial";
  ctx.fillText("🎥  Send your 1-min speaking video!", W / 2, pillY + 41);

  // Bottom accent line
  const bottomLine = ctx.createLinearGradient(0, 0, W, 0);
  bottomLine.addColorStop(0, "transparent");
  bottomLine.addColorStop(0.3, theme.secondary);
  bottomLine.addColorStop(0.7, theme.primary);
  bottomLine.addColorStop(1, "transparent");
  ctx.fillStyle = bottomLine;
  ctx.fillRect(0, CANVAS_H - 4, W, 4);

  fs.writeFileSync("./daily.png", canvas.toBuffer("image/png"));

  // Return base64 so caller can store it in DB
  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}
