import { describe, it, expect } from "vitest";
import { calculateGrowthScore, calculateCompositeScore } from "./submitGate.js";

describe("Personal Growth & Improvement Scoring (Option B)", () => {
  describe("calculateGrowthScore unit tests", () => {
    it("awards calibration bonus (8 pts) to new users with empty history", () => {
      const result = calculateGrowthScore({
        currentCommScore: 5.5,
        history: [],
      });

      expect(result.growthScore).toBe(8);
      expect(result.isCalibration).toBe(true);
      expect(result.baselineComm).toBeNull();
      expect(result.growthDelta).toBe(0);
    });

    it("awards calibration bonus (8 pts) to users with only 1 prior submission", () => {
      const history = [
        { fluency: 5, grammar: 5, confidence: 5, vocabulary: 5 },
      ];
      const result = calculateGrowthScore({
        currentCommScore: 6.0,
        history,
      });

      expect(result.growthScore).toBe(8);
      expect(result.isCalibration).toBe(true);
      expect(result.baselineComm).toBe(5.0);
    });

    it("awards breakthrough growth bonus (15 pts) for delta >= +1.0", () => {
      // Baseline average: 4.5
      const history = [
        { fluency: 4, grammar: 4, confidence: 5, vocabulary: 5 }, // 4.5
        { fluency: 5, grammar: 4, confidence: 4, vocabulary: 5 }, // 4.5
        { fluency: 4, grammar: 5, confidence: 5, vocabulary: 4 }, // 4.5
      ];
      // Today: 6.0 (+1.5 delta)
      const result = calculateGrowthScore({
        currentCommScore: 6.0,
        history,
      });

      expect(result.growthScore).toBe(15);
      expect(result.isCalibration).toBe(false);
      expect(result.baselineComm).toBeCloseTo(4.5, 1);
      expect(result.growthDelta).toBeCloseTo(1.5, 1);
    });

    it("awards strong progress bonus (12 pts) for +0.5 <= delta < +1.0", () => {
      const history = [
        { fluency: 5, grammar: 5, confidence: 5, vocabulary: 5 },
        { fluency: 5, grammar: 5, confidence: 5, vocabulary: 5 },
      ];
      // Today: 5.6 (+0.6 delta)
      const result = calculateGrowthScore({
        currentCommScore: 5.6,
        history,
      });

      expect(result.growthScore).toBe(12);
      expect(result.growthDelta).toBeCloseTo(0.6, 1);
    });

    it("awards steady improvement bonus (9 pts) for +0.2 <= delta < +0.5", () => {
      const history = [
        { fluency: 6, grammar: 6, confidence: 6, vocabulary: 6 },
        { fluency: 6, grammar: 6, confidence: 6, vocabulary: 6 },
      ];
      // Today: 6.3 (+0.3 delta)
      const result = calculateGrowthScore({
        currentCommScore: 6.3,
        history,
      });

      expect(result.growthScore).toBe(9);
      expect(result.growthDelta).toBeCloseTo(0.3, 1);
    });

    it("awards standard baseline maintenance (6 pts) for normal speakers staying near baseline", () => {
      const history = [
        { fluency: 6, grammar: 6, confidence: 6, vocabulary: 6 },
        { fluency: 6, grammar: 6, confidence: 6, vocabulary: 6 },
      ];
      // Today: 6.0 (0.0 delta)
      const result = calculateGrowthScore({
        currentCommScore: 6.0,
        history,
      });

      expect(result.growthScore).toBe(6);
      expect(result.growthDelta).toBeCloseTo(0.0, 1);
    });

    it("awards mastery maintenance (10 pts) for elite speakers maintaining >= 8.0 baseline", () => {
      const history = [
        { fluency: 8.5, grammar: 8.5, confidence: 8.5, vocabulary: 8.5 },
        { fluency: 8.5, grammar: 8.5, confidence: 8.5, vocabulary: 8.5 },
      ];
      // Today: 8.5 (0.0 delta)
      const result = calculateGrowthScore({
        currentCommScore: 8.5,
        history,
      });

      expect(result.growthScore).toBe(10);
      expect(result.growthDelta).toBeCloseTo(0.0, 1);
    });

    it("awards minor dip bonus (3 pts) for -0.7 <= delta < -0.3", () => {
      const history = [
        { fluency: 6, grammar: 6, confidence: 6, vocabulary: 6 },
        { fluency: 6, grammar: 6, confidence: 6, vocabulary: 6 },
      ];
      // Today: 5.5 (-0.5 delta)
      const result = calculateGrowthScore({
        currentCommScore: 5.5,
        history,
      });

      expect(result.growthScore).toBe(3);
      expect(result.growthDelta).toBeCloseTo(-0.5, 1);
    });

    it("awards 0 growth pts for severe drop below baseline (delta < -0.7)", () => {
      const history = [
        { fluency: 7, grammar: 7, confidence: 7, vocabulary: 7 },
        { fluency: 7, grammar: 7, confidence: 7, vocabulary: 7 },
      ];
      // Today: 5.5 (-1.5 delta)
      const result = calculateGrowthScore({
        currentCommScore: 5.5,
        history,
      });

      expect(result.growthScore).toBe(0);
      expect(result.growthDelta).toBeCloseTo(-1.5, 1);
    });
  });

  describe("Integration in calculateCompositeScore", () => {
    it("allows an improving beginner to achieve a top-tier score", () => {
      // Beginner who started at 4.5, recorded full duration (180s), used all vocab words, stayed on topic, and improved to 6.0
      const beginnerHistory = [
        { fluency: 4.5, grammar: 4.5, confidence: 4.5, vocabulary: 4.5 },
        { fluency: 4.5, grammar: 4.5, confidence: 4.5, vocabulary: 4.5 },
      ];

      const result = calculateCompositeScore({
        durationSeconds: 180,
        maxDurationSeconds: 180,
        vocabularyUsed: ["resilience", "strategy", "collaborate"],
        totalVocabWords: 5,
        requiredVocabWords: 3,
        topicRelevance: 8,
        analysis: {
          fluency: 6,
          grammar: 6,
          confidence: 6,
          vocabulary: 6,
          _stats: {
            wpm: 120,
            rhythm: { speechRatio: 90 },
          },
        },
        userHistory: beginnerHistory,
      });

      // Breakdown:
      // Length: 30
      // Vocab: 30
      // Topic: 12 (8/10 * 15)
      // Comm: 6 (6/10 * 10)
      // Growth: 15 (improved +1.5 above 4.5 baseline)
      // Total = 30 + 30 + 12 + 6 + 15 = 93!
      expect(result.breakdown.length).toBe(30);
      expect(result.breakdown.vocabUsed).toBe(30);
      expect(result.breakdown.topic).toBe(12);
      expect(result.breakdown.comm).toBe(6);
      expect(result.breakdown.growth).toBe(15);
      expect(result.score).toBe(93);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("ensures total score is capped at 100", () => {
      const eliteHistory = [
        { fluency: 9, grammar: 9, confidence: 9, vocabulary: 9 },
        { fluency: 9, grammar: 9, confidence: 9, vocabulary: 9 },
      ];

      const result = calculateCompositeScore({
        durationSeconds: 300,
        maxDurationSeconds: 180,
        vocabularyUsed: ["w1", "w2", "w3", "w4", "w5"],
        totalVocabWords: 5,
        requiredVocabWords: 3,
        topicRelevance: 10,
        analysis: {
          fluency: 10,
          grammar: 10,
          confidence: 10,
          vocabulary: 10,
          _stats: {
            wpm: 140,
            rhythm: { speechRatio: 95 },
          },
        },
        userHistory: eliteHistory,
      });

      expect(result.score).toBe(100);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});
