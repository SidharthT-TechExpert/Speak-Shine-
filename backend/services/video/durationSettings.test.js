import { describe, it, expect } from "vitest";
import { getDurationLimits, evaluateSubmitGate, calculateCompositeScore } from "./submitGate.js";
import { getDurationLimits as getFrontendDurationLimits, evaluateSubmitGate as evaluateFrontendGate } from "../../../frontend/src/utils/videoSubmitGate.js";

describe("Dynamic Duration Settings & Gating", () => {
  describe("Admin Custom Settings in getDurationLimits", () => {
    it("uses default values when settings object is empty", () => {
      const storyLimits = getDurationLimits({ isStorySummary: true }, {});
      expect(storyLimits.maxSeconds).toBe(180);
      expect(storyLimits.fullScoreSeconds).toBe(180);
      expect(storyLimits.maxLabel).toBe("3 min");
      expect(storyLimits.fullScoreLabel).toBe("3 min");

      const defaultLimits = getDurationLimits({}, {});
      expect(defaultLimits.maxSeconds).toBe(300);
      expect(defaultLimits.fullScoreSeconds).toBe(300);
      expect(defaultLimits.maxLabel).toBe("5 min");

      const pictureLimits = getDurationLimits({ isPictureDescription: true }, {});
      expect(pictureLimits.maxSeconds).toBe(180);
      expect(pictureLimits.fullScoreSeconds).toBe(180);

      const reflectionLimits = getDurationLimits({ isMonthlyReflection: true }, {});
      expect(reflectionLimits.maxSeconds).toBe(420);
      expect(reflectionLimits.fullScoreSeconds).toBe(420);

      const goalsLimits = getDurationLimits({ isMonthlyGoals: true }, {});
      expect(goalsLimits.maxSeconds).toBe(600);
      expect(goalsLimits.fullScoreSeconds).toBe(420);
    });

    it("respects admin settings for Story Tasks (e.g. fullScore: 3 min, max: 5 min)", () => {
      const customSettings = {
        durationStoryMax: 300, // 5 min
        durationStoryFull: 180, // 3 min
      };
      const limits = getDurationLimits({ isStorySummary: true }, customSettings);
      expect(limits.maxSeconds).toBe(300);
      expect(limits.fullScoreSeconds).toBe(180);
      expect(limits.maxLabel).toBe("5 min");
      expect(limits.fullScoreLabel).toBe("3 min");
      expect(limits.minSeconds).toBe(60);
    });

    it("respects admin settings for Picture Description Tasks", () => {
      const customSettings = {
        durationPictureMax: 240, // 4 min
        durationPictureFull: 120, // 2 min
      };
      const limits = getDurationLimits({ isPictureDescription: true }, customSettings);
      expect(limits.maxSeconds).toBe(240);
      expect(limits.fullScoreSeconds).toBe(120);
      expect(limits.maxLabel).toBe("4 min");
      expect(limits.fullScoreLabel).toBe("2 min");
    });

    it("respects admin settings for Default Questions", () => {
      const customSettings = {
        durationDefaultMax: 600, // 10 min
        durationDefaultFull: 360, // 6 min
      };
      const limits = getDurationLimits({}, customSettings);
      expect(limits.maxSeconds).toBe(600);
      expect(limits.fullScoreSeconds).toBe(360);
      expect(limits.maxLabel).toBe("10 min");
      expect(limits.fullScoreLabel).toBe("6 min");
    });

    it("respects admin settings for Monthly Reflection & Goals", () => {
      const customSettings = {
        durationMonthlyReflectionMax: 600,
        durationMonthlyReflectionFull: 480,
        durationMonthlyGoalsMax: 900,
        durationMonthlyGoalsFull: 600,
      };
      const refLimits = getDurationLimits({ isMonthlyReflection: true }, customSettings);
      expect(refLimits.maxSeconds).toBe(600);
      expect(refLimits.fullScoreSeconds).toBe(480);

      const goalsLimits = getDurationLimits({ isMonthlyGoals: true }, customSettings);
      expect(goalsLimits.maxSeconds).toBe(900);
      expect(goalsLimits.fullScoreSeconds).toBe(600);
    });
  });

  describe("evaluateSubmitGate Validation with Custom Admin Settings", () => {
    const storyAdminSettings = {
      durationStoryMax: 300, // 5 min
      durationStoryFull: 180, // 3 min
    };

    it("allows a 5-minute (300s) video for Story Task when admin set max=5min", () => {
      const result = evaluateSubmitGate({
        durationSeconds: 300,
        fileSizeBytes: 25 * 1024 * 1024,
        flags: { isStorySummary: true },
        settings: storyAdminSettings,
      });

      expect(result.passed).toBe(true);
      const durationCheck = result.checks.find(c => c.id === "duration");
      expect(durationCheck.status).toBe("pass");
      expect(durationCheck.message).toContain("within 1 min–5 min");
    });

    it("allows a video within 5-second tolerance (305s)", () => {
      const result = evaluateSubmitGate({
        durationSeconds: 305,
        fileSizeBytes: 25 * 1024 * 1024,
        flags: { isStorySummary: true },
        settings: storyAdminSettings,
      });

      expect(result.passed).toBe(true);
    });

    it("rejects a video exceeding max duration tolerance (306s) with clear message", () => {
      const result = evaluateSubmitGate({
        durationSeconds: 306,
        fileSizeBytes: 25 * 1024 * 1024,
        flags: { isStorySummary: true },
        settings: storyAdminSettings,
      });

      expect(result.passed).toBe(false);
      const durationCheck = result.checks.find(c => c.id === "duration");
      expect(durationCheck.status).toBe("fail");
      expect(durationCheck.message).toBe("Too long (5:06). Maximum is 5 min.");
    });

    it("rejects a video shorter than minimum (55s)", () => {
      const result = evaluateSubmitGate({
        durationSeconds: 55,
        fileSizeBytes: 5 * 1024 * 1024,
        flags: { isStorySummary: true },
        settings: storyAdminSettings,
      });

      expect(result.passed).toBe(false);
      const durationCheck = result.checks.find(c => c.id === "duration");
      expect(durationCheck.status).toBe("fail");
      expect(durationCheck.message).toBe("Too short (0:55). Minimum is 1 min.");
    });

    it("accepts customLimits object directly", () => {
      const customLimits = {
        minSeconds: 60,
        maxSeconds: 480,
        fullScoreSeconds: 300,
        minLabel: "1 min",
        maxLabel: "8 min",
        fullScoreLabel: "5 min",
      };
      const result = evaluateSubmitGate({
        durationSeconds: 450,
        fileSizeBytes: 30 * 1024 * 1024,
        flags: {},
        customLimits,
      });

      expect(result.passed).toBe(true);
      expect(result.limits.maxSeconds).toBe(480);
      expect(result.limits.maxLabel).toBe("8 min");
    });
  });

  describe("Duration Score Calculation (Full Score vs Max Duration)", () => {
    it("gives full duration credit (33.33) to a 5-minute video when full score target is 3 min (180s)", () => {
      const result = calculateCompositeScore({
        durationSeconds: 300, // 5 min
        maxDurationSeconds: 180, // full score at 3 min
        vocabularyUsed: ["journey", "courage", "wisdom"],
        totalVocabWords: 5,
        requiredVocabWords: 3,
        topicRelevance: 9,
        analysis: {
          fluency: 8,
          grammar: 8,
          confidence: 8,
          vocabulary: 8,
          _stats: {
            wpm: 130,
            rhythm: { speechRatio: 90 }, // >85% speech ratio = full multiplier (1.0)
          },
        },
        isStorySummary: true,
      });

      expect(result.breakdown.length).toBeCloseTo(30, 2);
      expect(result.breakdown.maxLength).toBe(30);
      expect(result.score).toBeGreaterThan(75);
    });

    it("gives full duration credit (30) to exactly 180s video when full score target is 180s", () => {
      const result = calculateCompositeScore({
        durationSeconds: 180,
        maxDurationSeconds: 180,
        vocabularyUsed: ["journey", "courage", "wisdom"],
        totalVocabWords: 5,
        requiredVocabWords: 3,
        topicRelevance: 8,
        analysis: {
          fluency: 8, grammar: 8, confidence: 8, vocabulary: 8,
          _stats: { wpm: 120, rhythm: { speechRatio: 85 } },
        },
        isStorySummary: true,
      });

      expect(result.breakdown.length).toBeCloseTo(30, 2);
    });

    it("gives proportional duration credit (22.5) to a 120s video when full score target is 180s", () => {
      // min = 60s (50%), max = 180s (100%). At 120s, rangeScore = (120-60)/(180-60) = 0.5.
      // baseLengthScore = (0.5 + 0.5 * 0.5) * 30 = 0.75 * 30 = 22.5
      const result = calculateCompositeScore({
        durationSeconds: 120,
        maxDurationSeconds: 180,
        vocabularyUsed: ["journey", "courage", "wisdom"],
        totalVocabWords: 5,
        requiredVocabWords: 3,
        topicRelevance: 8,
        analysis: {
          fluency: 8, grammar: 8, confidence: 8, vocabulary: 8,
          _stats: { wpm: 120, rhythm: { speechRatio: 85 } },
        },
        isStorySummary: true,
      });

      expect(result.breakdown.length).toBeCloseTo(22.5, 1);
    });

    it("gives 50% duration credit (15.0) to minimum duration video (60s)", () => {
      const result = calculateCompositeScore({
        durationSeconds: 60,
        maxDurationSeconds: 180,
        vocabularyUsed: ["journey", "courage", "wisdom"],
        totalVocabWords: 5,
        requiredVocabWords: 3,
        topicRelevance: 8,
        analysis: {
          fluency: 8, grammar: 8, confidence: 8, vocabulary: 8,
          _stats: { wpm: 120, rhythm: { speechRatio: 85 } },
        },
        isStorySummary: true,
      });

      expect(result.breakdown.length).toBeCloseTo(15.0, 1);
    });

    it("gives 0 duration credit for silent videos even if duration is 300s", () => {
      const result = calculateCompositeScore({
        durationSeconds: 300,
        maxDurationSeconds: 180,
        vocabularyUsed: [],
        totalVocabWords: 5,
        requiredVocabWords: 3,
        topicRelevance: 0,
        analysis: {
          fluency: 0, grammar: 0, confidence: 0, vocabulary: 0,
          _stats: { wpm: 0, rhythm: { speechRatio: 0 } },
        },
        isStorySummary: true,
      });

      expect(result.breakdown.length).toBe(0);
    });
  });

  describe("Frontend Submit Gate Mirror Compatibility", () => {
    it("mirrors backend getDurationLimits with custom settings", () => {
      const settings = {
        durationStoryMax: 300,
        durationStoryFull: 180,
      };
      const frontendLimits = getFrontendDurationLimits({ isStorySummary: true }, settings);
      const backendLimits = getDurationLimits({ isStorySummary: true }, settings);

      expect(frontendLimits.maxSeconds).toBe(backendLimits.maxSeconds);
      expect(frontendLimits.fullScoreSeconds).toBe(backendLimits.fullScoreSeconds);
      expect(frontendLimits.maxLabel).toBe(backendLimits.maxLabel);
      expect(frontendLimits.fullScoreLabel).toBe(backendLimits.fullScoreLabel);
    });

    it("frontend evaluateSubmitGate passes 300s video with customLimits", () => {
      const customLimits = getFrontendDurationLimits({ isStorySummary: true }, {
        durationStoryMax: 300,
        durationStoryFull: 180,
      });
      const gate = evaluateFrontendGate({
        durationSeconds: 300,
        fileSizeBytes: 20 * 1024 * 1024,
        flags: { isStorySummary: true },
        customLimits,
      });

      expect(gate.passed).toBe(true);
    });
  });
});
