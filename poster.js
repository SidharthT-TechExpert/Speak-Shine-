import { createCanvas } from "canvas";
import fs from "fs";

export default async function generatePoster(question) {
  const canvas = createCanvas(1080, 1080);
  const ctx = canvas.getContext("2d");

  // ===== Background =====
  const bg = ctx.createLinearGradient(0, 0, 0, 1080);
  bg.addColorStop(0, "#020617");
  bg.addColorStop(1, "#0f172a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1080);

  // ===== Ambient Glow =====
  drawGlow(ctx, 800, 100, 600, "rgba(34, 197, 94, 0.12)");
  drawGlow(ctx, 100, 900, 500, "rgba(59, 130, 246, 0.08)");

  // ===== Title =====
  ctx.textAlign = "center";
  ctx.shadowBlur = 20;
  ctx.shadowColor = "rgba(34, 197, 94, 0.4)";

  const titleGrad = ctx.createLinearGradient(400, 0, 680, 0);
  titleGrad.addColorStop(0, "#ffffff");
  titleGrad.addColorStop(1, "#4ade80");
  ctx.fillStyle = titleGrad;
  ctx.font = "bold 78px Arial";
  ctx.fillText("Speak & Shine", 540, 130);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 30px Arial";
  ctx.fillText("DAILY SPEAKING CHALLENGE", 540, 185);

  // ===== Category Badge =====
  drawRoundedRect(ctx, 390, 215, 300, 52, 26, "rgba(34,197,94,0.2)");
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(390, 215, 300, 52, 26);
  ctx.stroke();
  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 24px Arial";
  ctx.fillText(`📂 ${question.category || "General"}`, 540, 249);

  // ===== Topic Card =====
  drawCard(ctx, 80, 295, 920, 200, 28, "rgba(30,41,59,0.6)", "rgba(255,255,255,0.08)");
  ctx.textAlign = "left";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 24px Arial";
  ctx.fillText("TOPIC", 130, 345);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "italic 38px Arial";
  wrapText(ctx, `"${question.topic}"`, 130, 400, 820, 50);

  // ===== Question Card =====
  drawCard(ctx, 80, 530, 920, 320, 28, "rgba(20,83,45,0.3)", "#22c55e");
  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 26px Arial";
  ctx.fillText("❓ QUESTION", 130, 590);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px Arial";
  wrapText(ctx, question.question, 130, 660, 820, 60);

  // ===== Footer =====
  drawRoundedRect(ctx, 220, 910, 640, 76, 38, "#22c55e");
  ctx.textAlign = "center";
  ctx.fillStyle = "#052e16";
  ctx.font = "bold 30px Arial";
  ctx.fillText("🎥 Send your 1-min speaking video!", 540, 956);

  fs.writeFileSync("./daily.png", canvas.toBuffer("image/png"));
}

function drawCard(ctx, x, y, w, h, r, bg, border) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawGlow(ctx, x, y, radius, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawRoundedRect(ctx, x, y, w, h, r, color) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + " ";
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}
