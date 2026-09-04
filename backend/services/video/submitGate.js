/**
 * Pre-submit validation for video upload / recording.
 * Used by API pre-check and confirm endpoints for consistent gating.
 */

export const GATE_FRAME_MIN = 8;
export const GATE_FRAME_IDEAL = 16;

/** @typedef {"pass"|"warn"|"fail"} GateStatus */

/**
 * @param {{ isMonthlyReflection?: boolean, isMonthlyGoals?: boolean, isStorySummary?: boolean, isPictureDescription?: boolean }} flags
 */
export function getDurationLimits(flags = {}, settings = {}) {
  const maxSeconds = flags.isMonthlyReflection
    ? (settings.durationMonthlyReflectionMax ?? 420)
    : flags.isMonthlyGoals
    ? (settings.durationMonthlyGoalsMax ?? 600)
    : flags.isStorySummary
    ? (settings.durationStoryMax ?? 180)
    : flags.isPictureDescription
    ? (settings.durationPictureMax ?? 180)
    : (settings.durationDefaultMax ?? 300);

  const fullScoreSeconds = flags.isMonthlyReflection
    ? (settings.durationMonthlyReflectionFull ?? 420)
    : flags.isMonthlyGoals
    ? (settings.durationMonthlyGoalsFull ?? 420)
    : flags.isStorySummary
    ? (settings.durationStoryFull ?? 180)
    : flags.isPictureDescription
    ? (settings.durationPictureFull ?? 180)
    : (settings.durationDefaultFull ?? 300);

  return {
    minSeconds: 60,
    maxSeconds,
    fullScoreSeconds,
    minLabel: "1 min",
    maxLabel: formatMaxLabel(maxSeconds),
    fullScoreLabel: formatMaxLabel(fullScoreSeconds),
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
  userHistory = [],
}) {
  const challengeType = analysis?.challengeType || null;
  const isStoryTask = Boolean(isStorySummary || challengeType === "story_summary");

  // ── Picture Description: five-category weighted formula ──────────────────
  // Communication 20 | Content & Relevance 35 |
  // Vocabulary 10 | Duration 20 | Personal Growth 15 = 100.
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
    // Content & Relevance: max 35 pts
    const contentBase        = coherence * 0.60 + contentRel * 0.40;
    const contentScore       = (contentBase / 10) * 35;

    // Vocabulary: max 10 pts
    const configuredTotalWords = Number(totalVocabWords) || 0;
    const requiredTargetWords = Math.max(1, Math.min(
      Number(requiredVocabWords) || 1,
      configuredTotalWords || Number(requiredVocabWords) || 1,
    ));
    const usedTargetWords = Array.isArray(vocabularyUsed) ? vocabularyUsed.length : 0;
    const vocabularyScore = configuredTotalWords > 0
      ? Math.min(10, (usedTargetWords / requiredTargetWords) * 10)
      : (vocabulary / 10) * 10;

    // Personal Growth: max 15 pts
    const currentComm = (fluency + grammar + confidence + vocabulary) / 4;
    const growthResult = calculateGrowthScore({
      currentCommScore: currentComm,
      history: userHistory,
    });
    const growthScore = growthResult.growthScore;

    const total100 = Math.min(100, Math.round(
      (communicationScore + contentScore + vocabularyScore + durationScore + growthScore) * 100
    ) / 100);

    return {
      score: total100,
      breakdown: {
        communication:   Math.round(communicationScore * 100) / 100,
        content:         Math.round(contentScore       * 100) / 100,
        vocabulary:      Math.round(vocabularyScore    * 100) / 100,
        duration:        Math.round(durationScore       * 100) / 100,
        growth:          Math.round(growthScore         * 100) / 100,
        maxGrowth:       15,
        growthDelta:     growthResult.growthDelta,
        baselineComm:    growthResult.baselineComm,
        isCalibration:   growthResult.isCalibration,
        maxCommunication: 20,
        maxContent:       35,
        maxVocabulary:    10,
        maxDuration:      20,
        speechMultiplier: Math.round(speechMult * 100),
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
  const baseLengthScore = actualDur >= minDur
    ? (0.5 + 0.5 * rangeScore) * 30
    : (actualDur / minDur) * 0.5 * 30;

  const lengthScore = baseLengthScore * speechMultiplier;

  // ── Part 2: Vocabulary used (max 30 pts) ──────────────────────────────────
  const usedCount = Array.isArray(vocabularyUsed) ? vocabularyUsed.length : 0;
  const total = totalVocabWords > 0 ? totalVocabWords : 0;
  const required = requiredVocabWords > 0
    ? Math.min(requiredVocabWords, total || requiredVocabWords)
    : total;
  let vocabUsedScore;
  if (total === 0) {
    vocabUsedScore = 30;
  } else if (usedCount === 0) {
    vocabUsedScore = 0;
  } else if (usedCount >= required) {
    vocabUsedScore = 30;
  } else {
    const rangeScore = required > 1
      ? (usedCount - 1) / (required - 1)
      : 1;
    vocabUsedScore = (0.5 + 0.5 * rangeScore) * 30;
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
  const growthScore = growthResult.growthScore;

  let topicScore = 0;
  let commScore = 0;
  const maxTopic = isSpecialDay ? 0 : 15;
  const maxComm  = isSpecialDay ? 25 : 10;

  if (isSpecialDay) {
    // Special day (no topic): comm gets 25 pts
    commScore = (commAvg / 10) * 25;
  } else {
    // Normal / Story task: topic 15 pts, comm 10 pts
    topicScore = (Math.max(0, Math.min(10, effectiveTopicRelevance)) / 10) * 15;
    commScore  = (commAvg / 10) * 10;
  }

  const total100 = Math.min(100, Math.round((lengthScore + vocabUsedScore + topicScore + commScore + growthScore) * 100) / 100);

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
      isSpecialDay,
      isStorySummary:  isStoryTask,
      isPictureDescription: false,
      maxLength:       30,
      maxVocab:        30,
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
 * Match vocabulary words against a transcript with morphological, multi-word,
 * hyphenation, and stem-aware tolerance.
 * Returns array of matched word strings.
 *
 * @param {string}   transcript  - full spoken text
 * @param {Array<{word: string}|string>} vocabWords - today's vocabulary list
 * @param {Object}   [extraAnalysis] - optional analysis object with vocabularyHighlights
 * @returns {string[]}
 */
export function matchVocabularyInTranscript(transcript, vocabWords, extraAnalysis = null) {
  if (!transcript || !Array.isArray(vocabWords) || vocabWords.length === 0) return [];

  const rawLower = transcript.toLowerCase();
  const cleanTranscript = rawLower.replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ");
  const cleanSpaced = cleanTranscript.replace(/-/g, " ");
  const transcriptWords = cleanSpaced.split(/\s+/).filter((w) => w.length > 0);

  // Collect AI-detected strong vocabulary words if available
  const strongHighlights = Array.isArray(extraAnalysis?.vocabularyHighlights?.strong)
    ? extraAnalysis.vocabularyHighlights.strong.map((w) => String(w).toLowerCase().trim())
    : [];

  const matched = [];

  for (const item of vocabWords) {
    const rawWord = typeof item === "string" ? item : (item?.word || item?.term || item?.name || "");
    const cleanWord = (rawWord || "").trim().toLowerCase();
    if (!cleanWord) continue;

    const displayWord = typeof item === "string" ? item.trim() : (item?.word || cleanWord).trim();
    let isFound = false;

    // Check if AI strong highlights explicitly caught this word
    if (strongHighlights.length > 0) {
      if (strongHighlights.some((h) => h === cleanWord || h.includes(cleanWord) || cleanWord.includes(h))) {
        isFound = true;
      }
    }

    if (!isFound) {
      // Multi-word phrase (e.g. "time management", "self-discipline", "problem solving")
      if (cleanWord.includes(" ") || cleanWord.includes("-")) {
        const phraseSpaced = cleanWord.replace(/[-_]/g, " ").replace(/\s+/g, " ");
        const phraseHyphen = cleanWord.replace(/[\s_]/g, "-");

        if (
          cleanTranscript.includes(phraseSpaced) ||
          cleanTranscript.includes(phraseHyphen) ||
          cleanSpaced.includes(phraseSpaced) ||
          rawLower.includes(cleanWord)
        ) {
          isFound = true;
        } else {
          // Check stem phrase: e.g. "problem solving" vs "problem solved" / "problem solver"
          const parts = phraseSpaced.split(" ");
          if (parts.length === 2) {
            const stem0 = getWordStem(parts[0]);
            const stem1 = getWordStem(parts[1]);
            const phraseRegex = new RegExp(`\\b${stem0}[a-z]*\\s+${stem1}[a-z]*\\b`, "i");
            if (phraseRegex.test(cleanSpaced)) {
              isFound = true;
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
