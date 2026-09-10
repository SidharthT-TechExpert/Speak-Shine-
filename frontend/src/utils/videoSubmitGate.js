/**
 * Client-side submit gate — mirrors backend submitGate.js for instant feedback.
 */

export function getDurationLimits({ isMonthlyReflection, isWeeklyReflection, isMonthlyGoals, isStorySummary, isPictureDescription } = {}, settings = {}) {
  const maxSeconds = isMonthlyReflection
    ? (settings.durationMonthlyReflectionMax ?? 420)
    : isWeeklyReflection
    ? (settings.durationWeeklyMax ?? 420)
    : isMonthlyGoals
    ? (settings.durationMonthlyGoalsMax ?? 600)
    : isStorySummary
    ? (settings.durationStoryMax ?? 180)
    : isPictureDescription
    ? (settings.durationPictureMax ?? 180)
    : (settings.durationDefaultMax ?? 300);

  const fullScoreSeconds = isMonthlyReflection
    ? (settings.durationMonthlyReflectionFull ?? 420)
    : isWeeklyReflection
    ? (settings.durationWeeklyFull ?? 300)
    : isMonthlyGoals
    ? (settings.durationMonthlyGoalsFull ?? 420)
    : isStorySummary
    ? (settings.durationStoryFull ?? 180)
    : isPictureDescription
    ? (settings.durationPictureFull ?? 180)
    : (settings.durationDefaultFull ?? 300);

  const formatDurationLabel = (seconds) => {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(value / 60);
    const remainder = value % 60;
    if (remainder === 0) return `${minutes} min`;
    if (minutes === 0) return `${remainder} sec`;
    return `${minutes} min ${remainder} sec`;
  };
  const maxLabel = formatDurationLabel(maxSeconds);
  const fullScoreLabel = formatDurationLabel(fullScoreSeconds);
  return { minSeconds: 60, maxSeconds, fullScoreSeconds, minLabel: "1 min", maxLabel, fullScoreLabel };
}

function fmtDuration(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function evaluateSubmitGate({ durationSeconds, fileSizeBytes, frameCount, flags, canCompress = false, customLimits = null, settings = {} }) {
  const { minSeconds, maxSeconds, fullScoreSeconds, minLabel, maxLabel } = customLimits || getDurationLimits(flags, settings);
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
    const UPLOAD_MAX = 110 * 1024 * 1024;
    const HARD_MAX = 500 * 1024 * 1024;
    if (fileSizeBytes > HARD_MAX) {
      checks.push({ id: "size", label: "File size", status: "fail", message: `${mb} MB — too large (max 500 MB).` });
    } else if (fileSizeBytes > UPLOAD_MAX) {
      // Over the upload limit, but the client re-encodes it down before sending,
      // so this is a warning (non-blocking) rather than a hard failure.
      if (canCompress) {
        checks.push({ id: "size", label: "File size", status: "warn", message: `${mb} MB — will be compressed before upload.` });
      } else {
        checks.push({ id: "size", label: "File size", status: "fail", message: `${mb} MB — max 110 MB.` });
      }
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
  return { passed, readyToSubmit: passed, checks, limits: { minSeconds, maxSeconds, fullScoreSeconds } };
}
