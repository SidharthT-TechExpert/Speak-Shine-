import { createCanvas } from "canvas";
import { mkdirSync, writeFileSync } from "fs";

mkdirSync("public/icons", { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const s = size / 512; // scale factor

  // ── Background ──────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  bgGrad.addColorStop(0, "#0d0d1a");
  bgGrad.addColorStop(1, "#1a1a2e");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // ── Head silhouette (side profile facing right) ──────────────
  // Positioned slightly left of center
  const cx = size * 0.42;
  const cy = size * 0.48;

  // Head gradient: white → light purple
  const headGrad = ctx.createRadialGradient(
    cx - size * 0.05, cy - size * 0.08, size * 0.02,
    cx, cy, size * 0.32
  );
  headGrad.addColorStop(0, "#ffffff");
  headGrad.addColorStop(0.5, "#e8e0ff");
  headGrad.addColorStop(1, "#b8a8ff");

  ctx.fillStyle = headGrad;
  ctx.beginPath();

  // Draw a side-profile head shape
  const hw = size * 0.28; // head width
  const hh = size * 0.35; // head height
  const hx = cx - hw * 0.5;
  const hy = cy - hh * 0.55;

  // Top of head (rounded)
  ctx.moveTo(hx + hw * 0.3, hy);
  ctx.bezierCurveTo(
    hx + hw * 0.3, hy - hh * 0.05,
    hx + hw, hy - hh * 0.05,
    hx + hw, hy + hh * 0.2
  );
  // Back of head
  ctx.bezierCurveTo(
    hx + hw * 1.05, hy + hh * 0.5,
    hx + hw * 0.95, hy + hh * 0.85,
    hx + hw * 0.6, hy + hh * 0.95
  );
  // Neck
  ctx.lineTo(hx + hw * 0.6, hy + hh * 1.1);
  ctx.lineTo(hx + hw * 0.15, hy + hh * 1.1);
  ctx.lineTo(hx + hw * 0.15, hy + hh * 0.95);
  // Chin / jaw
  ctx.bezierCurveTo(
    hx - hw * 0.05, hy + hh * 0.85,
    hx - hw * 0.1, hy + hh * 0.65,
    hx + hw * 0.05, hy + hh * 0.5
  );
  // Nose bump
  ctx.bezierCurveTo(
    hx - hw * 0.05, hy + hh * 0.35,
    hx - hw * 0.12, hy + hh * 0.28,
    hx - hw * 0.05, hy + hh * 0.18
  );
  ctx.bezierCurveTo(
    hx + hw * 0.02, hy + hh * 0.08,
    hx + hw * 0.15, hy + hh * 0.02,
    hx + hw * 0.3, hy
  );
  ctx.closePath();
  ctx.fill();

  // ── Sound waves (3 arcs from mouth area) ────────────────────
  const mouthX = hx - hw * 0.02;  // mouth position (front of face)
  const mouthY = cy + size * 0.06;

  const waveColors = ["rgba(180,160,255,0.9)", "rgba(160,130,255,0.65)", "rgba(140,110,255,0.4)"];
  const waveRadii = [size * 0.09, size * 0.16, size * 0.23];
  const lineW = [size * 0.028, size * 0.024, size * 0.02];

  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(mouthX, mouthY, waveRadii[i], -Math.PI * 0.38, Math.PI * 0.38);
    ctx.strokeStyle = waveColors[i];
    ctx.lineWidth = lineW[i];
    ctx.lineCap = "round";
    ctx.stroke();
  }

  return canvas;
}

for (const size of sizes) {
  const canvas = drawIcon(size);
  const buffer = canvas.toBuffer("image/png");
  writeFileSync(`public/icons/icon-${size}.png`, buffer);
  console.log(`✅ icon-${size}.png  (${(buffer.length/1024).toFixed(1)} KB)`);
}

console.log("\n🎉 All icons generated with speaking-head design!");
