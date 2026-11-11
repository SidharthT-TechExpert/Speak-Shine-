/**
 * Pre-submit validation for video upload / recording.
 * Used by API pre-check and confirm endpoints for consistent gating.
 */

export const GATE_FRAME_MIN = 8;
export const GATE_FRAME_IDEAL = 16;

/** @typedef {"pass"|"warn"|"fail"} GateStatus */

/**
 * @param {{ isMonthlyReflection?: boolean, isMonthlyGoals?: boolean, isStorySummary?: boolean, isPictureDescription?: boolean, isShadowing?: boolean, challengeType?: string }} flags
 */
export function getDurationLimits(flags = {}, settings = {}) {
  const isShadowing = Boolean(flags.isShadowing || flags.challengeType === "shadowing_video");
  const targetDur = Number(flags.targetVideoDuration || flags.videoDuration || settings.targetVideoDuration || settings.videoDuration || 0);

  const dynamicShadowFull = targetDur > 0
    ? Math.round(targetDur * 0.85)
    : Math.max(60, settings.durationShadowingFull ?? 180);

  const dynamicShadowMin = targetDur > 0
    ? Math.max(15, Math.min(30, Math.round(targetDur * 0.25)))
    : 20;

  const maxSeconds = flags.isMonthlyReflection
    ? (settings.durationMonthlyReflectionMax ?? 420)
    : flags.isWeeklyReflection
    ? (settings.durationWeeklyMax ?? 420)
    : flags.isMonthlyGoals
    ? (settings.durationMonthlyGoalsMax ?? 600)
    : flags.isStorySummary
    ? (settings.durationStoryMax ?? 180)
    : flags.isPictureDescription
    ? (settings.durationPictureMax ?? 180)
    : isShadowing
    ? Math.min(180, Math.max(180, settings.durationShadowingMax ?? 180))
    : (settings.durationDefaultMax ?? 300);

  const fullScoreSeconds = flags.isMonthlyReflection
    ? (settings.durationMonthlyReflectionFull ?? 420)
    : flags.isWeeklyReflection
    ? (settings.durationWeeklyFull ?? 300)
    : flags.isMonthlyGoals
    ? (settings.durationMonthlyGoalsFull ?? 420)
    : flags.isStorySummary
    ? (settings.durationStoryFull ?? 180)
    : flags.isPictureDescription
    ? (settings.durationPictureFull ?? 180)
    : isShadowing
    ? dynamicShadowFull
    : (settings.durationDefaultFull ?? 300);

  const minSeconds = isShadowing ? dynamicShadowMin : 60;
  const minLabel = formatMaxLabel(minSeconds);
  const fullScoreLabel = isShadowing && targetDur > 0
    ? `${formatMaxLabel(fullScoreSeconds)} (85% Match)`
    : formatMaxLabel(fullScoreSeconds);

  return {
    minSeconds,
    maxSeconds,
    fullScoreSeconds,
    minLabel,
    maxLabel: formatMaxLabel(maxSeconds),
    fullScoreLabel,
    targetVideoDuration: targetDur || null,
  };
}

function formatMaxLabel(sec) {
  const seconds = Math.max(0, Math.round(Number(sec) || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `${minutes} min`;
  if (minutes === 0) return `${remainder} sec`;
  return `${minutes} min ${remainder} sec`;
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
 * @param {{ isMonthlyReflection?: boolean, isMonthlyGoals?: boolean, isStorySummary?: boolean, isPictureDescription?: boolean }} input.flags
 * @param {object} [input.settings] - database settings from Status document
 * @param {object} [input.customLimits] - pre-computed limits object
 * @param {object} [settings] - optional fallback settings object
 */
export function evaluateSubmitGate(input, settings = {}) {
  const effectiveSettings = input?.settings || settings || {};
  const limits = input?.customLimits || getDurationLimits(input?.flags || {}, effectiveSettings);
  const { minSeconds, maxSeconds, fullScoreSeconds, minLabel, maxLabel, fullScoreLabel } = limits;
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
        message: `File is ${mb} MB (maximum is 110 MB). Please record a shorter video.`,
      });
    } else {
      checks.push({
        id: "size",
        label: "File size",
        status: "pass",
        message: `${mb} MB — within limit.`,
      });
    }
  }

  const frames = input.frameCount;
  if (frames != null && typeof frames === "number") {
    if (frames < GATE_FRAME_MIN) {
      checks.push({
        id: "frames",
        label: "Frames extracted",
        status: "fail",
        message: `Only ${frames} frames extracted. Minimum is ${GATE_FRAME_MIN}.`,
      });
    } else if (frames < GATE_FRAME_IDEAL) {
      checks.push({
        id: "frames",
        label: "Frames extracted",
        status: "warn",
        message: `${frames} frames extracted (ideal is ${GATE_FRAME_IDEAL}+). Analysis may be less detailed.`,
      });
    } else {
      checks.push({
        id: "frames",
        label: "Frames extracted",
        status: "pass",
        message: `${frames} frames ready for AI analysis.`,
      });
    }
  }

  if (input.hasAudioTrack === false) {
    checks.push({
      id: "audio",
      label: "Audio track",
      status: "fail",
      message: "No audio detected. Please enable your microphone.",
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
 * Calculate the 100-point composite score for a video submission.
 *
 * Regular days (4 parts):
 *   Part 1 — Effective speaking time : (duration × speechRatio / maxDuration) × 33.33 → max 33.33
 *   Part 2 — Vocabulary used         : (wordsUsed / requiredWords) × 33.33             → max 33.33
 *   Part 3 — Topic relevance         : (topicRelevance / 10) × 16.67                 → max 16.67
 *   Part 4 — Communication           : (commAvg / 10) × 16.67                        → max 16.67
 *
 * Special days (weekly/monthly — no topicRelevance, 3 parts):
 *   Part 1 — Effective speaking time : same formula                                   → max 33.33
 *   Part 2 — Vocabulary used         : same formula                                   → max 33.33
 *   Part 3 — Communication           : (commAvg / 10) × 33.34                        → max 33.34
 *
 * speechRatio (0–100): % of video time the person was actually speaking (from Whisper).
 * A silent video gets ~0 pts on duration even if it's long.
 * If speechRatio is unavailable, falls back to wpm-based estimate.
 *
 * @param {object} params
 * @param {number}   params.durationSeconds     - actual video duration
 * @param {number}   params.maxDurationSeconds  - duration needed for full duration credit
 * @param {string[]} params.vocabularyUsed      - words from today's list found in transcript
 * @param {number}   params.totalVocabWords     - total words in today's list (shown)
 * @param {number}   params.requiredVocabWords  - minimum words required for full credit
 * @param {number|null} params.topicRelevance   - AI score 0–10, null on special days
 * @param {object}   params.analysis            - full analysis object for comm scores + speech stats
 * @returns {{ score: number, breakdown: object }}
 */
/**
 * Calculates a personal growth & improvement bonus (0–15 pts) based on the user's
 * recent communication scores vs today's communication score.
 *
 * @param {object} params
 * @param {number} params.currentCommScore - Today's communication average (0-10)
 * @param {Array}  params.history          - Recent submissions from user.feedbackScores
 * @returns {{ growthScore: number, baselineComm: number|null, growthDelta: number, isCalibration: boolean }}
 */
export function calculateGrowthScore({ currentCommScore = 5, history = [] }) {
  if (!Array.isArray(history) || history.length === 0) {
    // New user with no history: Calibration bonus (+8 pts out of 15)
    return {
      growthScore: 8,
      baselineComm: null,
      growthDelta: 0,
      isCalibration: true,
    };
  }

  const effectiveCurrentComm = typeof currentCommScore === "number" && !Number.isNaN(currentCommScore)
    ? Math.max(0, Math.min(10, currentCommScore))
    : 5;

  // Extract communication averages from valid historical entries
  const validScores = history
    .map(entry => {
      if (!entry) return null;
      const scores = [entry.fluency, entry.grammar, entry.confidence, entry.vocabulary]
        .filter(n => typeof n === "number" && !Number.isNaN(n))
        .map(n => {
          // Normalize legacy 0-100 scale, sum-based entries, or corrupted values:
          if (n > 40) return Math.min(10, n / 10);
          if (n > 10) return Math.min(10, n / 4);
          return Math.max(0, Math.min(10, n));
        });
      return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    })
    .filter(s => typeof s === "number" && !Number.isNaN(s));

  // If fewer than 2 valid historical submissions, still calibrating
  if (validScores.length < 2) {
    const singleBaseline = validScores.length === 1 ? Math.min(10, Math.max(0, Math.round(validScores[0] * 10) / 10)) : null;
    return {
      growthScore: 8,
      baselineComm: singleBaseline,
      growthDelta: 0,
      isCalibration: true,
    };
  }

  // Use the last 7 submissions to establish the rolling baseline
  const recentScores = validScores.slice(-7);
  const baseline = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
  const roundedBaseline = Math.min(10, Math.max(0, Math.round(baseline * 10) / 10));
  const delta = Math.round((effectiveCurrentComm - roundedBaseline) * 10) / 10;

  let growthScore = 0;
  if (delta >= 1.0) {
    growthScore = 15; // Breakthrough Growth (+1.0 or higher)
  } else if (delta >= 0.5) {
    growthScore = 12; // Strong Progress (+0.5 to +0.9)
  } else if (delta >= 0.2) {
    growthScore = 9;  // Steady Improvement (+0.2 to +0.4)
  } else if (delta >= -0.3) {
    // Maintained baseline (-0.3 to +0.1)
    // If user already maintains a high mastery baseline (>= 8.0), reward 10 pts
    growthScore = baseline >= 8.0 ? 10 : 6;
  } else if (delta >= -0.7) {
    growthScore = 3;  // Minor dip (-0.4 to -0.7)
  } else {
    growthScore = 0;  // Significant drop (< -0.7)
  }

  return {
    growthScore,
    baselineComm: roundedBaseline,
    growthDelta: delta,
    isCalibration: false,
  };
}

const SHADOWING_STOP_WORDS = new Set([
  "the", "and", "a", "an", "is", "in", "it", "its", "to", "of", "for", "on", "with", "as", "at", "by",
  "this", "that", "these", "those", "i", "you", "your", "we", "our", "they", "their", "them",
  "he", "his", "him", "she", "her", "hers", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "can", "may", "might", "must",
  "not", "no", "nor", "but", "or", "so", "yet", "if", "when", "what", "which", "who", "whom", "whose", "why", "how", "where", "while",
  "all", "any", "both", "each", "few", "more", "most", "other", "another", "some", "such", "than", "too", "very", "just",
  "into", "from", "about", "out", "up", "down", "over", "under", "again", "then", "once", "here", "there",
  "also", "because", "even", "well", "really", "only", "own", "same", "one", "two",
  "make", "made", "get", "got", "take", "took", "give", "gave", "say", "said", "tell", "told",
  "think", "thought", "know", "knew", "see", "saw", "want", "like", "look", "go", "going", "went", "come", "came",
  "time", "day", "way", "thing", "things", "good", "better", "best", "right", "new", "first", "people", "me", "my", "us",
  "much", "many", "feel", "try", "work", "life", "every",
]);

const META_SHADOWING_PATTERNS = [
  { re: /\bwhat is shadowing\b/i, weight: 2 },
  { re: /\badvantages?\b.*\bdisadvantages?\b/i, weight: 3 },
  { re: /\bdisadvantages?\b/i, weight: 2 },
  { re: /\badvantages? of (this|the|shadowing)\b/i, weight: 2 },
  { re: /\buses? of (this|the) (task|activity|shadowing)\b/i, weight: 2 },
  { re: /\bmeaning of (this|the) (task|activity|shadowing)\b/i, weight: 2 },
  { re: /\bthis (task|activity) is about\b/i, weight: 2 },
  { re: /\bshadowing is (a|an|one of|very|really|the)\b/i, weight: 2 },
  { re: /\bshadowing (technique|method|activity|practice|exercise) (is|helps|can|makes)\b/i, weight: 2 },
  { re: /\bshadowing makes me\b/i, weight: 2 },
  { re: /\bi believe shadowing\b/i, weight: 2 },
  { re: /\blearning english is\b/i, weight: 1 },
  { re: /\bmy aim is to speak\b/i, weight: 1 },
  { re: /\bachieve my communication goals\b/i, weight: 1 },
  { re: /\b(hi|hello) everyone\b.*\b(share|talk|discuss|explain|speak)\b/i, weight: 1 },
  { re: /\btoday i would like to (share|talk|speak|discuss|explain)\b/i, weight: 2 },
];

/**
 * Evaluates whether a student's spoken transcript actually shadowed the assigned
 * reference script, or whether they spoke unrelated content / talked about shadowing.
 */
/**
 * Canonical daily challenge type resolution from Status + optional saved report challengeType.
 * Ensures explicit todayContentType / challengeType always takes precedence over stale day flags.
 */
export function resolveDayContentFlags(status = null, challengeType = null) {
  if (challengeType === "story_summary") return { isStory: true, isPicture: false, isShadowing: false };
  if (challengeType === "picture_description") return { isStory: false, isPicture: true, isShadowing: false };
  if (challengeType === "shadowing_video") return { isStory: false, isPicture: false, isShadowing: true };
  if (challengeType === "normal") return { isStory: false, isPicture: false, isShadowing: false };

  const ct = status?.todayContentType || null;
  const hasExplicitSpecialType =
    ct === "story_audio" || ct === "picture_description" || ct === "shadowing_video";
  return {
    isStory: ct === "story_audio" || (!hasExplicitSpecialType && Boolean(status?.isStorySummaryDay)),
    isPicture: ct === "picture_description" || (!hasExplicitSpecialType && Boolean(status?.isPictureDescriptionDay)),
    isShadowing: ct === "shadowing_video" || (!hasExplicitSpecialType && Boolean(status?.isShadowingDay)),
  };
}

export function evaluateShadowingMatch(userTranscript, refTranscript = null) {
  const userStr = typeof userTranscript === "string" ? userTranscript.trim() : "";
  const refStr = typeof refTranscript === "string" ? refTranscript.trim() : "";

  if (userStr.length < 20) {
    return {
      isMatch: true,
      isStrongMatch: false,
      hasRefTranscript: refStr.length > 30,
      userContentPrecision: null,
      refContentCoverage: null,
      trigramHits: 0,
      contentBigramHits: 0,
      metaScore: 0,
      reason: null,
    };
  }

  const normalize = (t) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const cleanUser = normalize(userStr);
  const cleanRef = refStr ? normalize(refStr) : "";

  // Detect meta-commentary about shadowing/speaking tasks (excluding patterns present in reference script)
  let metaScore = 0;
  for (const { re, weight } of META_SHADOWING_PATTERNS) {
    if (re.test(cleanUser) && (!cleanRef || !re.test(cleanRef))) {
      metaScore += weight;
    }
  }

  if (refStr.length > 30) {
    const allWords = (t) => normalize(t).split(" ").filter(w => w.length >= 2);
    const contentTokens = (t) => normalize(t).split(" ").filter(w => w.length > 2 && !SHADOWING_STOP_WORDS.has(w));

    const refAll = allWords(refStr);
    const userAll = allWords(userStr);
    const refContent = contentTokens(refStr);
    const userContent = contentTokens(userStr);
    const refContentSet = new Set(refContent);
    const userContentSet = new Set(userContent);

    if (refContentSet.size >= 6 && userContent.length >= 6) {
      const matchedUserContent = userContent.filter(w => refContentSet.has(w)).length;
      const userContentPrecision = matchedUserContent / userContent.length;
      const uniqueMatchedRef = [...refContentSet].filter(w => userContentSet.has(w)).length;
      const refContentCoverage = uniqueMatchedRef / refContentSet.size;

      // Exact 3-word phrase shingles (must contain at least 1 meaningful content word)
      const refTrigrams = new Set();
      for (let i = 0; i <= refAll.length - 3; i++) {
        const w1 = refAll[i], w2 = refAll[i + 1], w3 = refAll[i + 2];
        if (!SHADOWING_STOP_WORDS.has(w1) || !SHADOWING_STOP_WORDS.has(w2) || !SHADOWING_STOP_WORDS.has(w3)) {
          refTrigrams.add(`${w1} ${w2} ${w3}`);
        }
      }
      const matchedTrigrams = new Set();
      for (let i = 0; i <= userAll.length - 3; i++) {
        const tri = `${userAll[i]} ${userAll[i + 1]} ${userAll[i + 2]}`;
        if (refTrigrams.has(tri)) matchedTrigrams.add(tri);
      }

      // Consecutive content-word pairs (tolerant to dropped glue words in STT)
      const refContentBigrams = new Set();
      for (let i = 0; i <= refContent.length - 2; i++) {
        refContentBigrams.add(`${refContent[i]} ${refContent[i + 1]}`);
      }
      const matchedContentBigrams = new Set();
      for (let i = 0; i <= userContent.length - 2; i++) {
        const bi = `${userContent[i]} ${userContent[i + 1]}`;
        if (refContentBigrams.has(bi)) matchedContentBigrams.add(bi);
      }

      const trigramHits = matchedTrigrams.size;
      const contentBigramHits = matchedContentBigrams.size;

      let isMatch = true;
      let reason = null;

      if (metaScore >= 3 && trigramHits < 3 && userContentPrecision < 0.30) {
        isMatch = false;
        reason = "Your speech did not match today's assigned shadowing reference script — you explained or discussed the shadowing activity instead of mirroring the native speaker's words aloud.";
      } else if (userContent.length >= 20) {
        const hasEnoughWords = userContentPrecision >= 0.20;
        const hasPhraseSequence = trigramHits >= 2 || contentBigramHits >= 3 || (userContentPrecision >= 0.30 && refContentCoverage >= 0.18);
        if (!hasEnoughWords || !hasPhraseSequence) {
          isMatch = false;
          reason = "Your speech did not match today's assigned shadowing reference script. Mirror the native speaker's words to earn full points.";
        }
      } else {
        if (userContentPrecision < 0.22 && trigramHits === 0 && contentBigramHits < 2) {
          isMatch = false;
          reason = "Your speech did not match today's assigned shadowing reference script. Mirror the native speaker's words to earn full points.";
        }
      }

      const isStrongMatch = isMatch && userContentPrecision >= 0.32 && (trigramHits >= 2 || contentBigramHits >= 3) && metaScore < 3;
      return {
        isMatch,
        isStrongMatch,
        hasRefTranscript: true,
        userContentPrecision: Math.round(userContentPrecision * 1000) / 1000,
        refContentCoverage: Math.round(refContentCoverage * 1000) / 1000,
        trigramHits,
        contentBigramHits,
        metaScore,
        reason,
      };
    }
  }

  // Fallback when reference transcript is absent (e.g. historical re-evaluation after daily reset)
  if (metaScore >= 2) {
    return {
      isMatch: false,
      isStrongMatch: false,
      hasRefTranscript: false,
      userContentPrecision: null,
      refContentCoverage: null,
      trigramHits: 0,
      contentBigramHits: 0,
      metaScore,
      reason: "Your speech did not match today's assigned shadowing reference script — you explained or discussed the shadowing activity instead of mirroring the native speaker's words aloud.",
    };
  }

  return {
    isMatch: true,
    isStrongMatch: false,
    hasRefTranscript: false,
    userContentPrecision: null,
    refContentCoverage: null,
    trigramHits: 0,
    contentBigramHits: 0,
    metaScore,
    reason: null,
  };
}

export function calculateCompositeScore({
  durationSeconds,
  maxDurationSeconds,
  vocabularyUsed = [],
  totalVocabWords = 5,
  requiredVocabWords = 3,
  topicRelevance = null,
  analysis = {},
  isPictureDescription = false,
  isStorySummary = false,
  isShadowing = false,
  targetVideoDuration = null,
  targetVideoTranscript = null,
  userHistory = [],
}) {
  const challengeType = analysis?.challengeType || null;
  const isStoryTask = Boolean(isStorySummary || challengeType === "story_summary");

  // ── Shadowing Video: Effort-proportional duration matching + Speech delivery ──
  // Duration Match (40 pts) | Delivery, Rhythm & Fluency (60 pts) | Personal Growth (0 pts) = 100
  // NO vocabulary requirement.
  const isShadowingTask = Boolean(isShadowing || challengeType === "shadowing_video");
  if (isShadowingTask) {
    const statsObj = analysis._stats || analysis.stats || {};
    const rawSpeechRatio = statsObj?.rhythm?.speechRatio;
    const wpm = statsObj?.wpm;
    const paceConsistency = statsObj?.rhythm?.paceConsistency;
    const pauseCount = Number(statsObj?.pauses) || 0;
    const fillerTotal = Number(statsObj?.fillerTotal) || 0;
    const wordCount = Number(statsObj?.wordCount) || Math.round((Number(wpm) || 0) * (Number(durationSeconds) || 0) / 60);

    // Target duration from the reference video (default 60s, max 180s)
    const targetDur = Math.max(20, Math.min(180, Number(targetVideoDuration) || Number(maxDurationSeconds) || 60));
    const actualDur = Math.max(0, Number(durationSeconds) || 0);

    // Parse audio volume if recorded in analysis / quality warning
    const volMatch = typeof analysis.qualityWarning === "string" ? analysis.qualityWarning.match(/(-?\d+(?:\.\d+)?)dB/i) : null;
    const detectedMeanVolume = (typeof analysis.meanVolume === "number" ? analysis.meanVolume : null)
      ?? (typeof statsObj.meanVolume === "number" ? statsObj.meanVolume : null)
      ?? (volMatch ? parseFloat(volMatch[1]) : null);

    // Audio is considered silent if:
    // 1. Explicitly marked silent
    // 2. Mean audio volume measured below -48dB (human speech does not exist below -48dB; -85.5dB is completely silent)
    // 3. Spoke fewer than 5 words on an attempt > 8 seconds
    // 4. Speech ratio <= 5% with fewer than 10 words
    const isSilentAttempt = Boolean(
      analysis.isSilent ||
      analysis.isSilentAttempt ||
      statsObj.isSilent ||
      (detectedMeanVolume !== null && detectedMeanVolume < -48) ||
      (wordCount < 5 && actualDur > 8) ||
      (typeof rawSpeechRatio === "number" && rawSpeechRatio <= 5 && wordCount < 10)
    );

    if (isSilentAttempt) {
      const volNotice = detectedMeanVolume !== null ? ` (${detectedMeanVolume.toFixed(1)}dB)` : "";
      return {
        score: 0,
        breakdown: {
          duration: 0,
          length: 0,
          communication: 0,
          comm: 0,
          vocabulary: 0,
          growth: 0,
          maxDuration: 40,
          maxLength: 40,
          maxCommunication: 60,
          maxComm: 60,
          maxVocabulary: 0,
          maxGrowth: 0,
          targetDurationSeconds: targetDur,
          targetActiveSpeechSeconds: targetDur,
          actualDurationSeconds: Math.round(actualDur),
          spokenDurationSeconds: 0,
          speechRatio: 0,
          durationRatio: 0,
          durationMatchRatio: 0,
          isEightyFivePercentMatch: false,
          isNinetyPercentMatch: false,
          isSilentAttempt: true,
          silenceWarning: `No audible speech detected${volNotice}. You must speak along with the audio to earn points.`,
          durationMessage: `No audible speech detected${volNotice}. Please ensure your microphone is enabled and shadow the speaker aloud.`,
          speechMultiplier: 0,
          growthDelta: null,
          baselineComm: null,
          isCalibration: false,
          isShadowing: true,
          isPictureDescription: false,
          isStorySummary: false,
          isSpecialDay: false,
        }
      };
    }

    // Check if student shadowed the assigned reference text or spoke unrelated text
    const refTranscript = targetVideoTranscript || analysis.targetVideoTranscript || analysis.referenceTranscript || null;
    const userTranscript = analysis.transcription || analysis.transcriptText || analysis.text || "";
    const effectiveTopicRel = typeof analysis.topicRelevance === "number" ? analysis.topicRelevance : topicRelevance;
    const shadowingCheck = evaluateShadowingMatch(userTranscript, refTranscript);
    const aiFlaggedOffTopic = analysis?.isOffTopic === true || (typeof effectiveTopicRel === "number" && effectiveTopicRel <= 3.5);
    const isOffTopic = !shadowingCheck.isMatch || (!shadowingCheck.isStrongMatch && aiFlaggedOffTopic);
    const offTopicWarning = isOffTopic
      ? (shadowingCheck.reason || analysis?.topicFeedback || "Your speech did not match today's assigned shadowing reference script. Mirror the native speaker's words to earn full points.")
      : null;

    // Exact amount of time the student actually spoke on this video
    // Spoken Seconds = Video Duration * (Speech Ratio / 100)
    const spokenSeconds = typeof rawSpeechRatio === "number" && rawSpeechRatio >= 0
      ? Math.round((actualDur * (rawSpeechRatio / 100)) * 10) / 10
      : actualDur;

    // Target active speech time from reference audio
    const targetActiveSpeechTime = targetDur;

    // 1. Duration / Effort Match (Max 40 points)
    // Rule:
    // - Actual spoken time (actualDur * speechRatio / 100) must be >= 85% of target active speech time => Full 40 pts.
    // - If below 85%: Proportional effort score: (spokenSeconds / (targetActiveSpeechTime * 0.85)) * 40.
    const spokenRatio = targetActiveSpeechTime > 0 ? spokenSeconds / targetActiveSpeechTime : 1.0;
    const isEightyFivePercent = spokenRatio >= 0.85;
    let durationScore = isEightyFivePercent
      ? 40
      : Math.max(0, Math.min(40, (spokenRatio / 0.85) * 40));

    // 2. Speech continuity multiplier (student must actually be speaking, not just silent recording)
    // In shadowing, students speak in natural phrases and pause with the native speaker.
    // A speech ratio between 35% and 75% is healthy and expected.
    let speechMult = 1.0;
    if (typeof rawSpeechRatio === "number" && rawSpeechRatio >= 0) {
      const r = rawSpeechRatio / 100;
      if (r >= 0.35) {
        speechMult = 1.0;
      } else if (r >= 0.20) {
        speechMult = 0.85 + ((r - 0.20) / (0.35 - 0.20)) * 0.15;
      } else {
        speechMult = Math.max(0.60, r / 0.20);
      }
    } else if (typeof wpm === "number" && wpm > 0) {
      speechMult = wpm >= 60 ? 1.0 : Math.max(0.75, wpm / 60);
    }

    // If target active speech match is >= 85%, student actively followed along for the full duration
    if (isEightyFivePercent) {
      speechMult = Math.max(0.85, speechMult);
    }

    const get = (field) => (typeof analysis[field] === "number" && !Number.isNaN(analysis[field]) ? analysis[field] : null);
    const fluency    = get("fluency") ?? 6.5;
    const grammar    = get("grammar") ?? 7.0;
    const confidence = get("confidence") ?? 6.5;

    const minutes = Math.max(actualDur / 60, 1 / 60);
    const pausesPerMinute = pauseCount / minutes;
    const pauseScore = pausesPerMinute <= 2 ? 10 : pausesPerMinute <= 4 ? 8.5 : pausesPerMinute <= 7 ? 7 : 5.5;

    // In shadowing, if target active speech was matched >= 85%, pace was locked to the reference video
    const paceScore = isEightyFivePercent
      ? (typeof wpm === "number" && wpm >= 60 ? 10 : 9)
      : typeof wpm !== "number" || wpm <= 0
        ? 6
        : wpm >= 80 && wpm <= 165 ? 10
        : wpm >= 60 && wpm <= 190 ? 8
        : 6;

    const rhythmPace = typeof paceConsistency === "number" && paceConsistency > 0 ? paceConsistency : (isEightyFivePercent ? 7.5 : fluency);

    // Delivery, Rhythm & Fluency: Max 60 points
    // 30 pts for Rhythm, Cadence, & Flow + 30 pts for Delivery, Intonation & Clarity
    let rhythmComponent = ((rhythmPace * 0.4 + pauseScore * 0.3 + paceScore * 0.3) / 10) * 30 * speechMult;
    let deliveryComponent = ((fluency * 0.4 + confidence * 0.3 + grammar * 0.3) / 10) * 30 * speechMult;

    // Fair baseline delivery floor for dedicated attempts:
    // If student matched >= 85% target active speech, ensure delivery score rewards their sustained practice
    if (isEightyFivePercent) {
      rhythmComponent = Math.max(18.0, rhythmComponent);
      deliveryComponent = Math.max(18.0, deliveryComponent);
    }
    let communicationScore = Math.min(60, Math.round((rhythmComponent + deliveryComponent) * 100) / 100);
    if (isOffTopic) {
      // Off-topic shadowing penalty: zero duration score and heavily penalized delivery
      durationScore = 0;
      communicationScore = Math.min(18, Math.round(communicationScore * 0.25 * 100) / 100);
    }

    // 3. Personal Growth: 0 points (Waived for shadowing activity)
    const growthScore = 0;

    let total100 = Math.round((durationScore + communicationScore) * 100) / 100;
    total100 = Math.min(100, Math.max(0, total100));

    const matchPercent = Math.round(spokenRatio * 100);
    const effectiveMatchPercent = isOffTopic ? 0 : matchPercent;
    const effectiveSpokenRatio = isOffTopic ? 0 : spokenRatio;
    const achievedTargetMatch = !isOffTopic && isEightyFivePercent;

    return {
      score: total100,
      breakdown: {
        duration:         Math.round(durationScore * 100) / 100,
        length:           Math.round(durationScore * 100) / 100,
        communication:    Math.round(communicationScore * 100) / 100,
        comm:             Math.round(communicationScore * 100) / 100,
        vocabulary:       0,
        growth:           0,
        maxDuration:      40,
        maxLength:        40,
        maxCommunication: 60,
        maxComm:          60,
        maxVocabulary:    0,
        maxGrowth:        0,
        targetDuration:        targetDur,
        targetDurationSeconds: targetDur,
        targetActiveSpeechSeconds: targetActiveSpeechTime,
        actualDurationSeconds: Math.round(actualDur),
        spokenDurationSeconds: Math.round(spokenSeconds),
        speechRatio:           typeof rawSpeechRatio === "number" ? Math.round(rawSpeechRatio) : null,
        durationRatio:         effectiveMatchPercent,
        durationMatchPercent:  effectiveMatchPercent,
        durationMatchRatio:    effectiveSpokenRatio,
        isEightyFivePercentMatch: achievedTargetMatch,
        isNinetyPercentMatch:  achievedTargetMatch,
        isOffTopic,
        offTopicReason: offTopicWarning,
        durationMessage: isOffTopic
          ? offTopicWarning
          : (achievedTargetMatch
            ? `Full duration credit awarded (${matchPercent}% active spoken time vs ${targetActiveSpeechTime}s target speech — >=85% target achieved).`
            : `Effort credit awarded (${Math.round(spokenSeconds)}s active spoken time vs ${targetActiveSpeechTime}s target speech — aim for >=85% for full duration points).`),
        speechMultiplier: Math.round(speechMult * 100),
        growthDelta:      null,
        baselineComm:     null,
        isCalibration:    false,
        isShadowing:      true,
        isPictureDescription: false,
        isStorySummary:   false,
        isSpecialDay:     false,
      }
    };
  }

  // ── Picture Description: five-category weighted formula ──────────────────
  // Communication 20 | Content & Relevance 25 |
  // Target Expressions 20 | Duration 20 | Personal Growth 15 = 100.
  if (isPictureDescription || challengeType === "picture_description") {
    const statsObj = analysis._stats || analysis.stats || {};
    const rawSpeechRatio = statsObj?.rhythm?.speechRatio;
    const wpm = statsObj?.wpm;
    const paceConsistency = statsObj?.rhythm?.paceConsistency;
    const fillerTotal = Number(statsObj?.fillerTotal) || 0;
    const pauseCount = Number(statsObj?.pauses) || 0;
    const wordCount = Number(statsObj?.wordCount) || Math.round((Number(wpm) || 0) * (Number(durationSeconds) || 0) / 60);

    const maxDur = maxDurationSeconds || 180;
    const minDur = 30;
    const reasonableDur = Math.min(maxDur, 60);
    const actualDur = Math.min(durationSeconds || 0, maxDur);
    const durationScore = actualDur >= reasonableDur
      ? 20
      : Math.max(0, (actualDur / reasonableDur) * 20);

    // Speech ratio multiplier for fluency & confidence
    let speechMult = 1;
    if (typeof rawSpeechRatio === "number" && rawSpeechRatio >= 0) {
      const r = rawSpeechRatio / 100;
      speechMult = r >= 0.85 ? 1.0 : r <= 0 ? 0 : Math.min(1, r / 0.85);
    } else if (typeof wpm === "number" && wpm > 0) {
      speechMult = Math.min(1, wpm / 100);
    }

    const get = (field) => (typeof analysis[field] === "number" && !Number.isNaN(analysis[field]) ? analysis[field] : null);

    const fluency       = get("fluency") ?? 5;
    const grammar       = get("grammar") ?? 5;
    const confidence    = get("confidence") ?? 5;
    const vocabulary    = get("vocabulary") ?? 5;
    const coherence     = get("coherence") ?? (typeof topicRelevance === "number" ? topicRelevance : 5);
    const contentRel    = typeof topicRelevance === "number" ? topicRelevance : 5;
    const rhythmScore = typeof paceConsistency === "number" ? paceConsistency : fluency;
    const minutes = Math.max((Number(durationSeconds) || 0) / 60, 1 / 60);
    const pausesPerMinute = pauseCount / minutes;
    const fillerRate = wordCount > 0 ? (fillerTotal / wordCount) * 100 : 0;
    const objectiveFlow = speechMult * 10;
    const pauseScore = pausesPerMinute <= 1 ? 10 : pausesPerMinute <= 3 ? 8 : pausesPerMinute <= 5 ? 6 : pausesPerMinute <= 8 ? 4 : 2;
    const fillerScore = fillerRate <= 1 ? 10 : fillerRate <= 3 ? 8 : fillerRate <= 6 ? 6 : fillerRate <= 10 ? 4 : 2;
    const paceScore = typeof wpm !== "number" || wpm <= 0
      ? 5
      : wpm >= 90 && wpm <= 170 ? 10
      : wpm >= 70 && wpm <= 190 ? 8
      : wpm >= 50 && wpm <= 220 ? 6
      : 4;
    const objectiveRhythm = (objectiveFlow * 0.45) + (paceScore * 0.2) + (pauseScore * 0.2) + (fillerScore * 0.15);
    const languageScore = (fluency * 0.4) + (confidence * 0.3) + (grammar * 0.2) + (rhythmScore * 0.1);

    // Communication: max 20 pts
    const communicationBase = objectiveRhythm * 0.8 + languageScore * 0.2;
    const communicationScore = (communicationBase / 10) * 20 * speechMult;

    // Expressions / Vocabulary: max 20 pts (scaled from 10)
    const configuredTotalWords = Number(totalVocabWords) || 0;
    const requiredTargetWords = Math.max(1, Math.min(
      Number(requiredVocabWords) || 1,
      configuredTotalWords || Number(requiredVocabWords) || 1,
    ));
    const usedTargetWords = Array.isArray(vocabularyUsed) ? vocabularyUsed.length : 0;
    const vocabularyScore = configuredTotalWords > 0
      ? Math.min(20, (usedTargetWords / requiredTargetWords) * 20)
      : (vocabulary / 10) * 20;

    // Check if off-topic:
    // A submission is off-topic ONLY if:
    // 1) The AI explicitly marked isOffTopic: true, OR
    // 2) AI isOffTopic was not explicitly false, AND contentRel is critically low (<= 1.5) with no target words used.
    // When the speaker matched target vocabulary from today's prompt or AI confirmed isOffTopic: false,
    // a brief or developing description is NOT off-topic (it is scored proportionally in Content & Relevance).
    const hasTargetVocab = usedTargetWords > 0;
    const isOffTopic = analysis?.isOffTopic === true || (
      analysis?.isOffTopic !== false &&
      !hasTargetVocab &&
      typeof contentRel === "number" &&
      contentRel <= 1.5
    );

    // Content & Relevance: max 25 pts (rebalanced from 35)
    const contentBase = isOffTopic
      ? (Math.min(contentRel, 2.5) * 0.85 + coherence * 0.15)
      : (coherence * 0.60 + contentRel * 0.40);
    let contentScore = (contentBase / 10) * 25;

    // Personal Growth: max 15 pts
    const currentComm = (fluency + grammar + confidence + vocabulary) / 4;
    const growthResult = calculateGrowthScore({
      currentCommScore: currentComm,
      history: userHistory,
    });
    let growthScore = growthResult.growthScore;
    let commScorePart = communicationScore;
    let durScorePart = durationScore;
    let vocabScorePart = vocabularyScore;

    let total100 = Math.round(
      (commScorePart + contentScore + vocabScorePart + durScorePart + growthScore) * 100
    ) / 100;

    // STRICT SECURITY GATE: Off-topic submissions cannot get high scores (>50)
    if (isOffTopic) {
      const cap = contentRel <= 2 ? 35 : 48;
      total100 = Math.min(cap, Math.round(total100 * 0.55 * 100) / 100);
    }
    total100 = Math.min(100, Math.max(0, total100));

    // CRITICAL: Guarantee mathematical consistency between total score and breakdown components.
    // The sum of breakdown components MUST ALWAYS exactly equal total100.
    const rawSum = Math.round((commScorePart + contentScore + vocabScorePart + durScorePart + growthScore) * 100) / 100;
    if (rawSum > 0 && Math.abs(total100 - rawSum) > 0.05) {
      const scale = total100 / rawSum;
      commScorePart  = Math.round(commScorePart  * scale * 100) / 100;
      contentScore   = Math.round(contentScore   * scale * 100) / 100;
      vocabScorePart = Math.round(vocabScorePart * scale * 100) / 100;
      durScorePart   = Math.round(durScorePart   * scale * 100) / 100;
      growthScore    = Math.round(growthScore    * scale * 100) / 100;

      const scaledSum = Math.round((commScorePart + contentScore + vocabScorePart + durScorePart + growthScore) * 100) / 100;
      const diff = Math.round((total100 - scaledSum) * 100) / 100;
      if (diff !== 0) {
        commScorePart = Math.round((commScorePart + diff) * 100) / 100;
      }
    }

    return {
      score: total100,
      breakdown: {
        communication:   Math.round(commScorePart  * 100) / 100,
        content:         Math.round(contentScore   * 100) / 100,
        vocabulary:      Math.round(vocabScorePart * 100) / 100,
        duration:        Math.round(durScorePart   * 100) / 100,
        growth:          Math.round(growthScore    * 100) / 100,
        maxGrowth:       15,
        growthDelta:     growthResult.growthDelta,
        baselineComm:    growthResult.baselineComm,
        isCalibration:   growthResult.isCalibration,
        maxCommunication: 20,
        maxContent:       25,
        maxVocabulary:    20,
        maxDuration:      20,
        speechMultiplier: Math.round(speechMult * 100),
        requiredVocabWords: requiredTargetWords,
        totalVocabWords:  configuredTotalWords,
        isOffTopic,
        offTopicReason:   isOffTopic ? "Submission is off-topic and does not describe today's assigned image." : null,
        isPictureDescription: true,
        isStorySummary: false,
        isSpecialDay: false,
      },
    };
  }

  // ── Derive effective topic relevance ─────────────────────────────────────
  let effectiveTopicRelevance = typeof topicRelevance === "number" && !Number.isNaN(topicRelevance)
    ? topicRelevance
    : (typeof analysis?.topicRelevance === "number" && !Number.isNaN(analysis.topicRelevance) ? analysis.topicRelevance : null);

  // If this is a Story Summary or Monthly Challenge task, it MUST have topic relevance scoring (never 0/null special day).
  // Fall back to coherence / communication averages if the raw analysis missed it.
  const isTargetedTask = isStoryTask || challengeType === "monthly_reflection" || challengeType === "monthly_goals";
  if (isTargetedTask && effectiveTopicRelevance == null) {
    const coherence = typeof analysis.coherence === "number" && !Number.isNaN(analysis.coherence) ? analysis.coherence : null;
    const commFallbacks = [analysis.fluency, analysis.vocabulary, analysis.confidence].filter(n => typeof n === "number" && !Number.isNaN(n));
    const fallbackScore = coherence ?? (commFallbacks.length ? (commFallbacks.reduce((a, b) => a + b, 0) / commFallbacks.length) : 7.0);
    effectiveTopicRelevance = Math.round(fallbackScore * 10) / 10;
  }

  const isSpecialDay = !isTargetedTask && effectiveTopicRelevance == null;

  // ── Part 1: Effective speaking time (max 30 pts) ───────────────────────────
  const statsObj = analysis._stats || analysis.stats || {};
  const rawSpeechRatio = statsObj?.rhythm?.speechRatio;
  const wpm = statsObj?.wpm;

  let speechMultiplier;
  if (typeof rawSpeechRatio === "number" && rawSpeechRatio >= 0) {
    const r = rawSpeechRatio / 100;
    speechMultiplier = r >= 0.85 ? 1.0
      : r <= 0     ? 0
      : Math.min(1, r / 0.85);
  } else if (typeof wpm === "number" && wpm > 0) {
    speechMultiplier = Math.min(1, wpm / 100);
  } else {
    speechMultiplier = 0;
  }

  const maxDur = maxDurationSeconds || (isStoryTask ? 180 : 300);
  const minDur = 60;
  const actualDur = Math.min(durationSeconds || 0, maxDur);
  const rangeScore = maxDur > minDur
    ? Math.max(0, (actualDur - minDur) / (maxDur - minDur))
    : 1;
  const maxLength = isStoryTask ? 20 : 30;
  const baseLengthScore = actualDur >= minDur
    ? (0.5 + 0.5 * rangeScore) * maxLength
    : (actualDur / minDur) * 0.5 * maxLength;

  let lengthScore = baseLengthScore * speechMultiplier;

  // ── Part 2: Vocabulary used (max 20 pts for story, 30 pts for normal) ──────
  const maxVocab = isStoryTask ? 20 : 30;
  const usedCount = Array.isArray(vocabularyUsed) ? vocabularyUsed.length : 0;
  const total = totalVocabWords > 0 ? totalVocabWords : 0;
  const required = requiredVocabWords > 0
    ? Math.min(requiredVocabWords, total || requiredVocabWords)
    : total;
  let vocabUsedScore;
  if (total === 0) {
    vocabUsedScore = maxVocab;
  } else if (usedCount === 0) {
    vocabUsedScore = 0;
  } else if (usedCount >= required) {
    vocabUsedScore = maxVocab;
  } else {
    const rangeScore = required > 1
      ? (usedCount - 1) / (required - 1)
      : 1;
    vocabUsedScore = (0.5 + 0.5 * rangeScore) * maxVocab;
  }

  // ── Part 3 & 4: Communication & Topic ─────────────────────────────────────
  const commFields = [
    analysis.fluency, analysis.grammar, analysis.confidence, analysis.vocabulary,
    analysis.eyeContact, analysis.bodyLanguage, analysis.facialExpression, analysis.overallPresence,
  ].filter(n => typeof n === "number" && !Number.isNaN(n));
  const commAvg = commFields.length
    ? commFields.reduce((a, b) => a + b, 0) / commFields.length
    : 5;

  // ── Part 5: Personal Growth Bonus (max 15 pts) ─────────────────────────────
  const growthResult = calculateGrowthScore({
    currentCommScore: commAvg,
    history: userHistory,
  });
  let growthScore = growthResult.growthScore;

  let topicScore = 0;
  let commScore = 0;
  const maxTopic = isStoryTask ? 25 : (isSpecialDay ? 0 : 15);
  const maxComm  = isStoryTask ? 20 : (isSpecialDay ? 25 : 10);

  if (isStoryTask) {
    // Story task Option 1: topic 25 pts, comm 20 pts
    topicScore = (Math.max(0, Math.min(10, effectiveTopicRelevance)) / 10) * 25;
    commScore  = (commAvg / 10) * 20;
  } else if (isSpecialDay) {
    // Special day (no topic): comm gets 25 pts
    commScore = (commAvg / 10) * 25;
  } else {
    // Normal task: topic 15 pts, comm 10 pts
    topicScore = (Math.max(0, Math.min(10, effectiveTopicRelevance)) / 10) * 15;
    commScore  = (commAvg / 10) * 10;
  }

  // Check if submission is off-topic or answering yesterday's / wrong question
  const hasTargetVocab = usedCount > 0;
  const isOffTopic = !isSpecialDay && (
    analysis?.isOffTopic === true || (
      analysis?.isOffTopic !== false &&
      !hasTargetVocab &&
      typeof effectiveTopicRelevance === "number" &&
      effectiveTopicRelevance <= 1.5
    )
  );

  let total100 = Math.round((lengthScore + vocabUsedScore + topicScore + commScore + growthScore) * 100) / 100;

  // STRICT SECURITY GATE: Off-topic submissions cannot get high scores (>50)
  if (isOffTopic) {
    const cap = (typeof effectiveTopicRelevance === "number" && effectiveTopicRelevance <= 2) ? 35 : 48;
    total100 = Math.min(cap, Math.round(total100 * 0.55 * 100) / 100);
  }
  total100 = Math.min(100, Math.max(0, total100));

  // CRITICAL: Guarantee mathematical consistency between total score and breakdown components.
  // The sum of breakdown components MUST ALWAYS exactly equal total100.
  const rawSum = Math.round((lengthScore + vocabUsedScore + topicScore + commScore + growthScore) * 100) / 100;
  if (rawSum > 0 && Math.abs(total100 - rawSum) > 0.05) {
    const scale = total100 / rawSum;
    lengthScore    = Math.round(lengthScore    * scale * 100) / 100;
    vocabUsedScore = Math.round(vocabUsedScore * scale * 100) / 100;
    topicScore     = Math.round(topicScore     * scale * 100) / 100;
    commScore      = Math.round(commScore      * scale * 100) / 100;
    growthScore    = Math.round(growthScore    * scale * 100) / 100;

    const scaledSum = Math.round((lengthScore + vocabUsedScore + topicScore + commScore + growthScore) * 100) / 100;
    const diff = Math.round((total100 - scaledSum) * 100) / 100;
    if (diff !== 0) {
      lengthScore = Math.round((lengthScore + diff) * 100) / 100;
    }
  }

  return {
    score: total100,
    breakdown: {
      length:          Math.round(lengthScore    * 100) / 100,
      vocabUsed:       Math.round(vocabUsedScore * 100) / 100,
      topic:           Math.round(topicScore     * 100) / 100,
      comm:            Math.round(commScore      * 100) / 100,
      growth:          Math.round(growthScore    * 100) / 100,
      maxGrowth:       15,
      growthDelta:     growthResult.growthDelta,
      baselineComm:    growthResult.baselineComm,
      isCalibration:   growthResult.isCalibration,
      speechRatio:     typeof rawSpeechRatio === "number" ? rawSpeechRatio : null,
      speechMultiplier: Math.round(speechMultiplier * 100), // 0–100 %
      fullScoreDurationSeconds: maxDur,
      requiredVocabWords: required,
      totalVocabWords: total,
      isOffTopic,
      offTopicReason: isOffTopic
        ? (isStoryTask
          ? "Submission is off-topic and does not summarize today's audio story."
          : "Submission is off-topic and does not answer today's question.")
        : null,
      isSpecialDay,
      isStorySummary:  isStoryTask,
      isPictureDescription: false,
      maxLength,
      maxVocab,
      maxTopic,
      maxComm,
    },
  };
}

/**
 * Extract root stem of an English word by removing common inflectional & derivational suffixes.
 */
function getWordStem(word) {
  let w = (word || "").trim().toLowerCase();
  if (w.length <= 3) return w;
  
  const suffixes = [
    "ational", "ization", "isation", "fulness", "ousness", "ability", "ibility",
    "ation", "ition", "ution", "ement", "iment", "ance", "ence", "able", "ible",
    "ment", "ness", "ship", "ical", "ally", "ized", "ised", "izes", "ises",
    "ting", "sing", "ning", "ring", "ling", "ping", "ming", "king", "ding",
    "ing", "ies", "ied", "ive", "ity", "ous", "ful", "less", "est", "ist",
    "ism", "ant", "ent", "ate", "ize", "ise", "ted", "sed", "ned", "red",
    "led", "ped", "med", "ked", "ded", "ed", "es", "ly", "er", "or", "al", "ic", "y", "s"
  ];
  
  for (const suf of suffixes) {
    if (w.endsWith(suf) && (w.length - suf.length) >= 3) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}

/**
 * Common English morphological variations / synonyms dictionary for vocabulary matching.
 */
const IRREGULAR_VOCAB_MAP = {
  resilience: ["resilient", "resiliently", "resilience"],
  resilient: ["resilience", "resiliently", "resilient"],
  perseverance: ["persevere", "persevered", "persevering", "perseverance"],
  persevere: ["perseverance", "persevered", "persevering", "persevere"],
  strategy: ["strategies", "strategic", "strategically", "strategy"],
  priority: ["priorities", "prioritize", "prioritizing", "prioritized", "priority"],
  fluent: ["fluency", "fluently", "fluent"],
  fluency: ["fluent", "fluently", "fluency"],
  confident: ["confidence", "confidently", "confident"],
  confidence: ["confident", "confidently", "confidence"],
  enthusiastic: ["enthusiasm", "enthusiastically", "enthusiastic"],
  enthusiasm: ["enthusiastic", "enthusiastically", "enthusiasm"],
  patient: ["patience", "patiently", "patient"],
  patience: ["patient", "patiently", "patience"],
  inspire: ["inspiration", "inspirational", "inspiring", "inspired", "inspire"],
  inspiration: ["inspire", "inspirational", "inspiring", "inspired", "inspiration"],
  innovative: ["innovation", "innovate", "innovating", "innovated", "innovative"],
  innovation: ["innovative", "innovate", "innovating", "innovated", "innovation"],
  collaborate: ["collaboration", "collaborative", "collaborated", "collaborating", "collaborate"],
  collaboration: ["collaborate", "collaborative", "collaborated", "collaborating", "collaboration"],
  articulate: ["articulation", "articulating", "articulated", "articulate"],
  articulation: ["articulate", "articulating", "articulated", "articulation"],
  achieve: ["achievement", "achievements", "achieved", "achieving", "achieve"],
  achievement: ["achieve", "achievements", "achieved", "achieving", "achievement"],
  dedicate: ["dedication", "dedicated", "dedicating", "dedicate"],
  dedication: ["dedicate", "dedicated", "dedicating", "dedication"],
  efficient: ["efficiency", "efficiently", "efficient"],
  efficiency: ["efficient", "efficiently", "efficiency"],
  adaptable: ["adaptability", "adaptation", "adapted", "adapting", "adapt"],
  adaptability: ["adaptable", "adaptation", "adapted", "adapting", "adapt"],
};

// Phonetic homophone variations Whisper commonly produces under low audio quality or noise
const PHONETIC_HOMOPHONE_MAP = {
  where: "(?:where|wear)",
  wear: "(?:where|wear)",
  there: "(?:there|their|they're)",
  their: "(?:there|their|they're)",
  to: "(?:to|too|two)",
  too: "(?:to|too|two)",
  two: "(?:to|too|two)",
  for: "(?:for|four)",
  four: "(?:for|four)",
  hear: "(?:hear|here)",
  here: "(?:hear|here)",
  by: "(?:by|buy|bye)",
  buy: "(?:by|buy|bye)",
  eye: "(?:eye|i)",
  see: "(?:see|sea)",
  know: "(?:know|no)",
  right: "(?:right|write)",
  whole: "(?:whole|hole)",
  peace: "(?:peace|piece)",
  weather: "(?:weather|whether)",
};

function levenshteinDist(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Normalizes contractions in English text to standard full form for flexible phrase matching.
 */
function normalizeContractions(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\bi'm\b/g, "i am")
    .replace(/\bit's\b/g, "it is")
    .replace(/\bthat's\b/g, "that is")
    .replace(/\bwhat's\b/g, "what is")
    .replace(/\bthere's\b/g, "there is")
    .replace(/\bi've\b/g, "i have")
    .replace(/\bwe've\b/g, "we have")
    .replace(/\byou've\b/g, "you have")
    .replace(/\bthey've\b/g, "they have")
    .replace(/\bdon't\b/g, "do not")
    .replace(/\bdoesn't\b/g, "does not")
    .replace(/\bdidn't\b/g, "did not")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bi'd\b/g, "i would")
    .replace(/\bi'll\b/g, "i will");
}

/**
 * Match vocabulary words or English expressions against a transcript with
 * morphological, multi-word, contraction, and phrase-aware tolerance.
 * Returns array of matched expression/word strings.
 *
 * @param {string}   transcript  - full spoken text
 * @param {Array<{word?: string, expression?: string}|string>} vocabWords - today's expressions/vocabulary list
 * @param {Object}   [extraAnalysis] - optional analysis object with vocabularyHighlights
 * @returns {string[]}
 */
export function matchVocabularyInTranscript(transcript, vocabWords, extraAnalysis = null) {
  if (!transcript || !Array.isArray(vocabWords) || vocabWords.length === 0) return [];

  const rawLower = transcript.toLowerCase();
  const cleanTranscript = rawLower.replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ");
  const cleanSpaced = cleanTranscript.replace(/-/g, " ");
  const normTranscript = normalizeContractions(cleanSpaced);
  const transcriptWords = cleanSpaced.split(/\s+/).filter((w) => w.length > 0);

  // Collect AI-detected strong vocabulary words if available
  const strongHighlights = Array.isArray(extraAnalysis?.vocabularyHighlights?.strong)
    ? extraAnalysis.vocabularyHighlights.strong.map((w) => String(w).toLowerCase().trim())
    : [];

  const matched = [];

  for (const item of vocabWords) {
    const rawTarget = typeof item === "string" ? item : (item?.expression || item?.word || item?.term || item?.name || "");
    const cleanWord = (rawTarget || "")
      .replace(/\.{2,}/g, "")
      .replace(/…/g, "")
      .replace(/[.,!?;:"'(){}\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!cleanWord) continue;

    const displayWord = typeof item === "string" ? item.trim() : (item?.expression || item?.word || cleanWord).trim();
    let isFound = false;

    // Check if AI strong highlights explicitly caught this word/expression
    if (strongHighlights.length > 0) {
      if (strongHighlights.some((h) => h === cleanWord || h.includes(cleanWord) || cleanWord.includes(h))) {
        isFound = true;
      }
    }

    if (!isFound) {
      // Expression / Multi-word phrase (e.g. "what i find interesting is", "time management", "self-discipline")
      if (cleanWord.includes(" ") || cleanWord.includes("-") || cleanWord.includes("/")) {
        // Split on "/" if phrase offers choices like "in the foreground / background"
        const phraseVariants = cleanWord.includes("/")
          ? cleanWord.split("/").map(p => p.trim()).filter(Boolean)
          : [cleanWord];

        for (const variant of phraseVariants) {
          if (isFound) break;
          const phraseSpaced = variant.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
          const phraseHyphen = variant.replace(/[\s_]/g, "-").trim();
          const normPhrase = normalizeContractions(phraseSpaced);

          if (
            cleanTranscript.includes(phraseSpaced) ||
            cleanTranscript.includes(phraseHyphen) ||
            cleanSpaced.includes(phraseSpaced) ||
            normTranscript.includes(normPhrase) ||
            rawLower.includes(phraseSpaced)
          ) {
            isFound = true;
            break;
          }

          // Regex matching with flexible whitespace, pauses, conversational fillers, and hesitation sounds
          // (e.g. "what I ... [really|um|uh] find interesting is")
          const phraseWords = phraseSpaced.split(/\s+/).filter(Boolean);
          if (phraseWords.length >= 2) {
            const fillerGroup = "(?:\\s+(?:really|personally|honestly|actually|just|also|quite|very|um|uh|er|like|you know|sort of|kind of))?";
            const regexParts = phraseWords.map((pw, pIdx) => {
              const pwClean = pw.toLowerCase();
              const homo = PHONETIC_HOMOPHONE_MAP[pwClean];
              const stem = getWordStem(pwClean);
              const stemPattern = homo || (stem && stem.length >= 3 ? `${stem}[a-z]*` : pwClean);
              return pIdx === 0 ? `\\b${stemPattern}` : `${fillerGroup}\\s+${stemPattern}`;
            });
            const fullRegex = new RegExp(`${regexParts.join("")}\\b`, "i");
            if (fullRegex.test(cleanSpaced) || fullRegex.test(normTranscript)) {
              isFound = true;
              break;
            }

            // For longer expressions (3+ words), check if the core sub-phrase (>= 3 words) was spoken
            if (phraseWords.length >= 3) {
              const headSub = phraseWords.slice(0, Math.max(3, phraseWords.length - 1)).join(" ");
              if (cleanSpaced.includes(headSub) || normTranscript.includes(normalizeContractions(headSub))) {
                isFound = true;
                break;
              }
              const tailSub = phraseWords.slice(1).join(" ");
              if (cleanSpaced.includes(tailSub) || normTranscript.includes(normalizeContractions(tailSub))) {
                isFound = true;
                break;
              }
            }
          }
        }
      } else {
        // Single word matching
        // 1. Direct whole-word regex match
        const escaped = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const directRegex = new RegExp(`\\b${escaped}\\b`, "i");
        if (directRegex.test(cleanSpaced) || directRegex.test(rawLower)) {
          isFound = true;
        }

        // 2. Stem / Morphological variant matching (e.g. collaborate -> collaborated, collaborating, collaboration)
        if (!isFound && cleanWord.length >= 4) {
          const stem = getWordStem(cleanWord);
          if (stem && stem.length >= 3) {
            const stemRegex = new RegExp(`\\b${stem}[a-z]{0,8}\\b`, "i");
            if (stemRegex.test(cleanSpaced)) {
              isFound = true;
            }
          }
        }

        // 3. Common English irregular variations table
        if (!isFound) {
          const variations = IRREGULAR_VOCAB_MAP[cleanWord] || [];
          for (const v of variations) {
            const vRegex = new RegExp(`\\b${v}\\b`, "i");
            if (vRegex.test(cleanSpaced)) {
              isFound = true;
              break;
            }
          }
        }

        // 4. Fuzzy speech-to-text typo tolerance (Levenshtein distance <= 1 for 5+ char stems/words)
        if (!isFound && cleanWord.length >= 5) {
          const targetStem = getWordStem(cleanWord);
          for (const tw of transcriptWords) {
            // Direct word typo check (e.g. "articualte" vs "articulate")
            if (Math.abs(tw.length - cleanWord.length) <= 1 && levenshteinDist(tw, cleanWord) <= 1) {
              isFound = true;
              break;
            }
            // Stem-level typo check (e.g. "colaboration" -> stem "colaborat" vs targetStem "collaborat")
            if (targetStem && targetStem.length >= 4) {
              const twStem = getWordStem(tw);
              if (twStem && Math.abs(twStem.length - targetStem.length) <= 1 && levenshteinDist(twStem, targetStem) <= 1) {
                isFound = true;
                break;
              }
            }
          }
        }
      }
    }

    if (isFound) {
      matched.push(displayWord);
    }
  }

  return matched;
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
