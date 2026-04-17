import { createCanvas } from "canvas";
import fs from "fs";

export default async function generatePoster(question) {
  const canvas = createCanvas(1080, 1080);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, 1080, 1080);

  // TITLE (Centered)
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Speak & Shine 🗣️", 540, 120);

  // Subtitle
  ctx.font = "32px Arial";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText("Daily Speaking Challenge", 540, 180);

  // Reset alignment for body text
  ctx.textAlign = "left";

  // Quote
  ctx.fillStyle = "#ffffff";
  ctx.font = "36px Arial";
  wrapText(ctx, `"${question.quote}"`, 100, 280, 880, 50);

  // Question
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 42px Arial";
  wrapText(ctx, `Q: ${question.question}`, 100, 550, 880, 55);

  // Footer
  ctx.fillStyle = "#ffffff";
  ctx.font = "32px Arial";
  ctx.textAlign = "center";
  ctx.fillText("📹 Send your 1-min speaking video", 540, 950);

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync("./daily.png", buffer);
}

// Wrap text function
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + " ";
    let testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
