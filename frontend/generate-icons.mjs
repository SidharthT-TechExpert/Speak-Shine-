/**
 * generate-icons.mjs
 * Generates all PWA icon sizes using canvas.
 * Draws the Speak & Shine logo: purple 3D head (side profile) + glowing cyan sparkles.
 *
 * Run: node generate-icons.mjs   (from inside frontend/)
 */

import { createCanvas } from "canvas";
import { mkdirSync, writeFileSync } from "fs";

mkdirSync("public/icons", { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const s = size / 512;

  // ── Background: deep navy ────────────────────────────────────────────────
  ctx.fillStyle = "#0b1120";
  ctx.fillRect(0, 0, size, size);

  // Subtle radial glow behind head
  const bgGlow = ctx.createRadialGradient(size * 0.42, size * 0.48, 0, size * 0.42, size * 0.48, size * 0.55);
  bgGlow.addColorStop(0, "rgba(80,40,160,0.18)");
  bgGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, size, size);

  // ── Purple 3D head (side profile, facing right) ──────────────────────────
  const cx = size * 0.40;
  const cy = size * 0.50;
  const hw = size * 0.30;
  const hh = size * 0.38;
  const hx = cx - hw * 0.45;
  const hy = cy - hh * 0.58;

  // 3D shading: main fill
  const headGrad = ctx.createRadialGradient(
    hx + hw * 0.55, hy + hh * 0.28, size * 0.01,
    hx + hw * 0.45, hy + hh * 0.45, hw * 1.1
  );
  headGrad.addColorStop(0,   "#9b6fd4");
  headGrad.addColorStop(0.4, "#7c3fbf");
  headGrad.addColorStop(0.75,"#5c2a9a");
  headGrad.addColorStop(1,   "#3a1870");

  ctx.fillStyle = headGrad;
  ctx.beginPath();

  // Top of head
  ctx.moveTo(hx + hw * 0.32, hy);
  ctx.bezierCurveTo(
    hx + hw * 0.32, hy - hh * 0.04,
    hx + hw * 1.02, hy - hh * 0.04,
    hx + hw * 1.02, hy + hh * 0.22
  );
  // Back of head (rounded)
  ctx.bezierCurveTo(
    hx + hw * 1.08, hy + hh * 0.52,
    hx + hw * 0.98, hy + hh * 0.88,
    hx + hw * 0.62, hy + hh * 0.98
  );
  // Neck
  ctx.lineTo(hx + hw * 0.62, hy + hh * 1.14);
  ctx.lineTo(hx + hw * 0.18, hy + hh * 1.14);
  ctx.lineTo(hx + hw * 0.18, hy + hh * 0.98);
  // Chin / jaw
  ctx.bezierCurveTo(
    hx - hw * 0.04, hy + hh * 0.88,
    hx - hw * 0.10, hy + hh * 0.68,
    hx + hw * 0.06, hy + hh * 0.52
  );
  // Lips area (slight bump)
  ctx.bezierCurveTo(
    hx - hw * 0.06, hy + hh * 0.44,
    hx - hw * 0.08, hy + hh * 0.38,
    hx - hw * 0.02, hy + hh * 0.32
  );
  // Nose bump
  ctx.bezierCurveTo(
    hx - hw * 0.10, hy + hh * 0.24,
    hx - hw * 0.14, hy + hh * 0.18,
    hx - hw * 0.06, hy + hh * 0.10
  );
  // Forehead back to top
  ctx.bezierCurveTo(
    hx + hw * 0.04, hy + hh * 0.04,
    hx + hw * 0.18, hy,
    hx + hw * 0.32, hy
  );
  ctx.closePath();
  ctx.fill();

  // Highlight: bright left-top rim light
  const rimGrad = ctx.createLinearGradient(hx + hw * 0.3, hy, hx + hw * 0.9, hy + hh * 0.4);
  rimGrad.addColorStop(0, "rgba(200,170,255,0.55)");
  rimGrad.addColorStop(1, "rgba(200,170,255,0)");
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.moveTo(hx + hw * 0.32, hy);
  ctx.bezierCurveTo(hx + hw * 0.32, hy - hh * 0.04, hx + hw * 1.02, hy - hh * 0.04, hx + hw * 1.02, hy + hh * 0.22);
  ctx.bezierCurveTo(hx + hw * 0.85, hy + hh * 0.10, hx + hw * 0.65, hy + hh * 0.04, hx + hw * 0.32, hy);
  ctx.closePath();
  ctx.fill();

  // ── Mouth opening (dark oval) ────────────────────────────────────────────
  const mouthX = hx - hw * 0.01;
  const mouthY = cy + size * 0.055;
  ctx.fillStyle = "rgba(20,8,45,0.85)";
  ctx.beginPath();
  ctx.ellipse(mouthX, mouthY, size * 0.028, size * 0.016, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // ── Glowing cyan sparkles emanating from mouth ───────────────────────────
  const sparkOriginX = mouthX + size * 0.025;
  const sparkOriginY = mouthY - size * 0.005;

  // Glow cloud behind sparkles
  const glowCloud = ctx.createRadialGradient(
    sparkOriginX + size * 0.10, sparkOriginY,
    0,
    sparkOriginX + size * 0.10, sparkOriginY,
    size * 0.18
  );
  glowCloud.addColorStop(0,   "rgba(0,230,210,0.28)");
  glowCloud.addColorStop(0.5, "rgba(0,200,180,0.12)");
  glowCloud.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = glowCloud;
  ctx.fillRect(sparkOriginX - size * 0.02, sparkOriginY - size * 0.18, size * 0.30, size * 0.36);

  // Draw sparkle star at (x, y, size)
  function drawSparkle(x, y, r, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;

    // 4-point star
    const inner = r * 0.28;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const radius = i % 2 === 0 ? r : inner;
      const px = Math.cos(angle - Math.PI / 2) * radius;
      const py = Math.sin(angle - Math.PI / 2) * radius;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();

    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    sg.addColorStop(0, "#ffffff");
    sg.addColorStop(0.3, "#7fffef");
    sg.addColorStop(1, "#00d4c0");
    ctx.fillStyle = sg;
    ctx.fill();

    // Glow
    ctx.shadowColor = "#00e8d0";
    ctx.shadowBlur = r * 2.5;
    ctx.fill();

    ctx.restore();
  }

  // Swirl path from mouth outward
  const sp = size;
  // Main large sparkle
  drawSparkle(sparkOriginX + sp * 0.14, sparkOriginY - sp * 0.02, sp * 0.055, 1.0);
  // Medium sparkles
  drawSparkle(sparkOriginX + sp * 0.08, sparkOriginY - sp * 0.06, sp * 0.032, 0.9);
  drawSparkle(sparkOriginX + sp * 0.20, sparkOriginY + sp * 0.04, sp * 0.028, 0.85);
  drawSparkle(sparkOriginX + sp * 0.18, sparkOriginY - sp * 0.09, sp * 0.022, 0.8);
  // Small sparkles scattered
  drawSparkle(sparkOriginX + sp * 0.04, sparkOriginY - sp * 0.03, sp * 0.016, 0.75);
  drawSparkle(sparkOriginX + sp * 0.11, sparkOriginY + sp * 0.07, sp * 0.014, 0.7);
  drawSparkle(sparkOriginX + sp * 0.24, sparkOriginY - sp * 0.04, sp * 0.013, 0.65);
  drawSparkle(sparkOriginX + sp * 0.06, sparkOriginY + sp * 0.05, sp * 0.011, 0.6);
  drawSparkle(sparkOriginX + sp * 0.16, sparkOriginY - sp * 0.13, sp * 0.010, 0.55);
  // Tiny dots
  drawSparkle(sparkOriginX + sp * 0.27, sparkOriginY + sp * 0.02, sp * 0.008, 0.5);
  drawSparkle(sparkOriginX + sp * 0.22, sparkOriginY - sp * 0.11, sp * 0.007, 0.45);

  // Swirl connector line from mouth to sparkles
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#00e8d0";
  ctx.lineWidth = sp * 0.012;
  ctx.lineCap = "round";
  ctx.shadowColor = "#00e8d0";
  ctx.shadowBlur = sp * 0.025;
  ctx.beginPath();
  ctx.moveTo(sparkOriginX, sparkOriginY);
  ctx.bezierCurveTo(
    sparkOriginX + sp * 0.04, sparkOriginY - sp * 0.02,
    sparkOriginX + sp * 0.08, sparkOriginY - sp * 0.05,
    sparkOriginX + sp * 0.14, sparkOriginY - sp * 0.02
  );
  ctx.stroke();
  ctx.restore();

  return canvas;
}

for (const size of sizes) {
  const canvas = drawIcon(size);
  const buffer = canvas.toBuffer("image/png");
  writeFileSync(`public/icons/icon-${size}.png`, buffer);
  console.log(`✅ icon-${size}.png  (${(buffer.length / 1024).toFixed(1)} KB)`);
}

console.log("\n🎉 All icons generated — purple head + cyan sparkles logo!");
