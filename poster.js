import { createCanvas } from "canvas";
import fs from "fs";

export default async function generatePoster(question) {
  const canvas = createCanvas(1080, 1080);
  const ctx = canvas.getContext("2d");

  // ===== Base Layer: Rich Dark Slate =====
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, 1080, 1080);

  // ===== Lighting: Layered Mesh Gradients =====
  // Top-left emerald glow
  drawGlow(ctx, 0, 0, 800, "rgba(16, 185, 129, 0.15)");
  // Center-right sapphire glow
  drawGlow(ctx, 1080, 540, 700, "rgba(59, 130, 246, 0.1)");
  // Bottom-center teal glow
  drawGlow(ctx, 540, 1080, 600, "rgba(20, 184, 166, 0.12)");

  // ===== Header Section =====
  ctx.textAlign = "center";

  // Day Badge (e.g., "DAY 12")
  drawRoundedRect(ctx, 480, 60, 120, 40, 12, "rgba(34, 197, 94, 0.2)");
  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 22px Helvetica, sans-serif";
  ctx.fillText("DAY 01", 540, 88);

  // Title with Shadow and Gradient
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 15;
  const titleGrad = ctx.createLinearGradient(0, 120, 0, 190);
  titleGrad.addColorStop(0, "#FFFFFF");
  titleGrad.addColorStop(1, "#94a3b8");
  ctx.fillStyle = titleGrad;
  ctx.font = "bold 90px Helvetica, sans-serif";
  ctx.fillText("Speak & Shine", 540, 180);
  ctx.shadowBlur = 0;

  // ===== Quote Section (Floating Glass) =====
  // Shadow for depth
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 20;
  drawCard(ctx, 90, 260, 900, 240, 40, "rgba(255, 255, 255, 0.03)", "rgba(255, 255, 255, 0.08)");
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Quote Icon
  ctx.fillStyle = "rgba(74, 222, 128, 0.4)";
  ctx.font = "bold 120px Georgia, serif";
  ctx.fillText("“", 150, 360);

  ctx.textAlign = "left";
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "italic 42px Helvetica, sans-serif";
  wrapText(ctx, question.quote, 160, 350, 780, 58);

  // ===== Main Question Section =====
  // Darker container to make text pop
  drawCard(ctx, 90, 540, 900, 340, 40, "rgba(15, 23, 42, 0.8)", "rgba(34, 197, 94, 0.5)");

  // Animated Accent Line (Left side of question)
  ctx.fillStyle = "#22c55e";
  ctx.roundRect(130, 610, 6, 180, 3);
  ctx.fill();

  ctx.fillStyle = "#4ade80";
  ctx.font = "bold 24px Helvetica, sans-serif";
  ctx.fillText("TODAY'S CHALLENGE", 160, 610);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px Helvetica, sans-serif";
  wrapText(ctx, question.question, 160, 690, 750, 72);

  // ===== Footer (Social/CTA) =====
  ctx.textAlign = "center";

  // Instruction line
  ctx.fillStyle = "#64748b";
  ctx.font = "500 28px Helvetica, sans-serif";
  ctx.fillText("REPLY WITH YOUR RECORDING", 540, 970);

  // High-Contrast Button
  const btnGrad = ctx.createLinearGradient(340, 0, 740, 0);
  btnGrad.addColorStop(0, "#22c55e");
  btnGrad.addColorStop(1, "#10b981");

  drawRoundedRect(ctx, 340, 1000, 400, 60, 30, btnGrad);
  ctx.fillStyle = "#022c22";
  ctx.font = "bold 26px Helvetica, sans-serif";
  ctx.fillText("JOIN THE CHALLENGE", 540, 1038);

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync("./daily.png", buffer);
}

// --- Helpers ---

function drawCard(ctx, x, y, width, height, radius, bgColor, borderColor) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawGlow(ctx, x, y, radius, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.globalCompositeOperation = "screen"; // Blends glows naturally
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over"; // Reset
}

function drawRoundedRect(ctx, x, y, width, height, radius, color) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    if (ctx.measureText(testLine).width > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}