/**
 * Client-side submit gate — mirrors backend submitGate.js for instant feedback.
 */

export function getDurationLimits({ isMonthlyReflection, isMonthlyGoals, isWeeklyReflection } = {}) {
  const maxSeconds = isMonthlyReflection || isMonthlyGoals ? 600 : isWeeklyReflection ? 420 : 300;
  const maxLabel = maxSeconds >= 600 ? "10 min" : maxSeconds >= 420 ? "7 min" : "5 min";
  return { minSeconds: 60, maxSeconds, minLabel: "1 min", maxLabel };
}

function fmtDuration(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function evaluateSubmitGate({ durationSeconds, fileSizeBytes, frameCount, flags }) {
  const { minSeconds, maxSeconds, minLabel, maxLabel } = getDurationLimits(flags);
  const checks = [];
  const hasDuration = !!durationSeconds && durationSeconds > 0;

  if (!hasDuration) {
    checks.push({ id: "duration", label: "Video length", status: "warn", message: "Length unknown — wait for preview to load." });
  } else if (durationSeconds < minSeconds) {
    checks.push({ id: "duration", label: "Video length", status: "fail", message: `Too short (${fmtDuration(durationSeconds)}). Need at least ${minLabel}.` });
  } else if (durationSeconds > maxSeconds + 5) {
    checks.push({ id: "duration", label: "Video length", status: "fail", message: `Too long (${fmtDuration(durationSeconds)}). Max ${maxLabel}.` });
  } else {
    checks.push({ id: "duration", label: "Video length", status: "pass", message: `${fmtDuration(durationSeconds)} — OK (${minLabel}–${maxLabel}).` });
  }

  if (fileSizeBytes > 0) {
    const mb = (fileSizeBytes / 1024 / 1024).toFixed(1);
    if (fileSizeBytes > 110 * 1024 * 1024) {
      checks.push({ id: "size", label: "File size", status: "fail", message: `${mb} MB — max 110 MB.` });
    } else {
      checks.push({ id: "size", label: "File size", status: "pass", message: `${mb} MB — OK.` });
    }
  }

  if (frameCount != null) {
    checks.push({
      id: "frames",
      label: "AI frames",
      status: frameCount >= 8 ? "pass" : "warn",
      message: frameCount >= 8 ? `${frameCount} frames — fast analysis path.` : `Only ${frameCount} frames — may be slower.`,
    });
  }

  const failed = checks.some((c) => c.status === "fail");
  const passed = !failed && hasDuration;
  return { passed, readyToSubmit: passed, checks, limits: { minSeconds, maxSeconds } };
}
