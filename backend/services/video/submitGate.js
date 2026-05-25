/**
 * Pre-submit validation for video upload / recording.
 * Used by API pre-check and confirm endpoints for consistent gating.
 */

export const GATE_FRAME_MIN = 8;
export const GATE_FRAME_IDEAL = 16;

/** @typedef {"pass"|"warn"|"fail"} GateStatus */

/**
 * @param {{ isMonthlyReflection?: boolean, isMonthlyGoals?: boolean, isWeeklyReflection?: boolean }} flags
 */
export function getDurationLimits(flags = {}) {
  const maxSeconds = flags.isMonthlyReflection || flags.isMonthlyGoals
    ? 600
    : flags.isWeeklyReflection
      ? 420
      : 300;
  return { minSeconds: 60, maxSeconds, minLabel: "1 min", maxLabel: formatMaxLabel(maxSeconds) };
}

function formatMaxLabel(sec) {
  if (sec >= 600) return "10 min";
  if (sec >= 420) return "7 min";
  return "5 min";
}

function fmtDuration(sec) {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * @param {object} input
 * @param {number|null} input.durationSeconds
 * @param {number|null} input.fileSizeBytes
 * @param {number|null} input.frameCount
 * @param {boolean} input.hasAudioTrack - optional hint from client
 * @param {{ isMonthlyReflection?: boolean, isMonthlyGoals?: boolean, isWeeklyReflection?: boolean }} input.flags
 */
export function evaluateSubmitGate(input) {
  const { minSeconds, maxSeconds, minLabel, maxLabel } = getDurationLimits(input.flags || {});
  /** @type {{ id: string, label: string, status: GateStatus, message: string }[]} */
  const checks = [];

  const duration = typeof input.durationSeconds === "number" && input.durationSeconds > 0
    ? input.durationSeconds
    : null;

  if (duration == null) {
    checks.push({
      id: "duration",
      label: "Video length",
      status: "warn",
      message: "Could not read length — analysis may take longer.",
    });
  } else if (duration < minSeconds) {
    checks.push({
      id: "duration",
      label: "Video length",
      status: "fail",
      message: `Too short (${fmtDuration(duration)}). Minimum is ${minLabel}.`,
    });
  } else if (duration > maxSeconds + 5) {
    checks.push({
      id: "duration",
      label: "Video length",
      status: "fail",
      message: `Too long (${fmtDuration(duration)}). Maximum is ${maxLabel}.`,
    });
  } else {
    checks.push({
      id: "duration",
      label: "Video length",
      status: "pass",
      message: `${fmtDuration(duration)} — within ${minLabel}–${maxLabel}.`,
    });
  }

  const size = input.fileSizeBytes;
  const maxBytes = 110 * 1024 * 1024;
  if (size != null && size > 0) {
    const mb = (size / 1024 / 1024).toFixed(1);
    if (size > maxBytes) {
      checks.push({
        id: "size",
        label: "File size",
        status: "fail",
        message: `${mb} MB exceeds 110 MB limit.`,
      });
    } else if (size > 80 * 1024 * 1024) {
      checks.push({
        id: "size",
        label: "File size",
        status: "warn",
        message: `${mb} MB — large file; upload may be slow.`,
      });
    } else {
      checks.push({
        id: "size",
        label: "File size",
        status: "pass",
        message: `${mb} MB — OK.`,
      });
    }
  }

  const frames = input.frameCount;
  if (frames != null) {
    if (frames < GATE_FRAME_MIN) {
      checks.push({
        id: "frames",
        label: "Preview frames",
        status: "warn",
        message: `Only ${frames} frames captured — visual scores may be less accurate.`,
      });
    } else {
      checks.push({
        id: "frames",
        label: "Preview frames",
        status: "pass",
        message: `${frames} frames ready for AI (faster analysis).`,
      });
    }
  } else {
    checks.push({
      id: "frames",
      label: "Preview frames",
      status: "warn",
      message: "No browser frames — server will extract (slower).",
    });
  }

  // Estimated speaking time: assume ~40% of video is speech at 130 wpm minimum bar
  if (duration != null && duration >= minSeconds) {
    const minWords = Math.max(80, Math.round((duration / 60) * 50));
    checks.push({
      id: "speech",
      label: "Speaking content",
      status: "pass",
      message: `Aim for at least ~${minWords} words of clear speech on today's question.`,
    });
  }

  const failed = checks.some((c) => c.status === "fail");
  const passed = !failed;

  return {
    passed,
    readyToSubmit: passed,
    checks,
    limits: { minSeconds, maxSeconds, minLabel, maxLabel },
  };
}

/**
 * Build calibrated summary fields stored on analysis for consistent report UI.
 */
export function buildAnalysisSummary(analysis) {
  if (!analysis) return analysis;

  const nums = [
    analysis.fluency,
    analysis.grammar,
    analysis.confidence,
    analysis.vocabulary,
    analysis.topicRelevance,
    analysis.eyeContact,
    analysis.bodyLanguage,
    analysis.facialExpression,
    analysis.overallPresence,
  ].filter((n) => typeof n === "number" && !Number.isNaN(n));

  const overallScore = nums.length
    ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
    : null;

  let performanceTier = "developing";
  let performanceLabel = "Developing";
  if (overallScore != null) {
    if (overallScore >= 8) {
      performanceTier = "excellent";
      performanceLabel = "Excellent";
    } else if (overallScore >= 6.5) {
      performanceTier = "good";
      performanceLabel = "Good";
    } else if (overallScore < 5) {
      performanceTier = "needs_work";
      performanceLabel = "Needs practice";
    }
  }

  const speechAvg = [analysis.fluency, analysis.grammar, analysis.confidence, analysis.vocabulary]
    .filter((n) => typeof n === "number");
  const visualAvg = [analysis.eyeContact, analysis.bodyLanguage, analysis.facialExpression, analysis.overallPresence]
    .filter((n) => typeof n === "number");

  return {
    ...analysis,
    overallScore,
    performanceTier,
    performanceLabel,
    scoreBreakdown: {
      speech: speechAvg.length
        ? Math.round((speechAvg.reduce((a, b) => a + b, 0) / speechAvg.length) * 10) / 10
        : null,
      visual: visualAvg.length
        ? Math.round((visualAvg.reduce((a, b) => a + b, 0) / visualAvg.length) * 10) / 10
        : null,
      topic: typeof analysis.topicRelevance === "number" ? analysis.topicRelevance : null,
    },
  };
}
