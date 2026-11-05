import { describe, it, expect } from "vitest";
import { calculateCompositeScore } from "./submitGate.js";

describe("Shadowing Activity Scoring Model (40 Duration / 60 Delivery / 0 Growth / 0 Vocab)", () => {
  it("awards full 40 duration points when actual spoken time is >= 85% of target active speech duration", () => {
    const { score, breakdown } = calculateCompositeScore({
      durationSeconds: 80,
      targetVideoDuration: 80,
      isShadowing: true,
      analysis: {
        fluency: 10,
        confidence: 10,
        grammar: 10,
        stats: {
          wpm: 120,
          pauses: 2,
          rhythm: { speechRatio: 90, paceConsistency: 10 },
        },
      },
    });

    expect(breakdown.maxDuration).toBe(40);
    expect(breakdown.maxLength).toBe(40);
    expect(breakdown.duration).toBe(40);
    expect(breakdown.isEightyFivePercentMatch).toBe(true);
    expect(breakdown.spokenDurationSeconds).toBe(72); // 80s * 90% = 72s (>= 85% of 80s = 68s)
    expect(breakdown.maxGrowth).toBe(0);
    expect(breakdown.growth).toBe(0);
    expect(breakdown.maxVocabulary).toBe(0);
    expect(breakdown.vocabulary).toBe(0);
    expect(breakdown.maxCommunication).toBe(60);
    expect(breakdown.maxComm).toBe(60);
    expect(score).toBe(100);
  });

  it("calculates proportional effort score when actual spoken time is below 85%", () => {
    // Target 80s, 85% threshold is 68s.
    // actualDur = 40s, speechRatio = 85% => spokenSeconds = 34s.
    // 34 / 68 * 40 = 20 pts.
    const { breakdown } = calculateCompositeScore({
      durationSeconds: 40,
      targetVideoDuration: 80,
      isShadowing: true,
      analysis: {
        fluency: 7,
        confidence: 7,
        grammar: 7,
        stats: {
          wpm: 110,
          pauses: 4,
          rhythm: { speechRatio: 85, paceConsistency: 7 },
        },
      },
    });

    expect(breakdown.duration).toBe(20);
    expect(breakdown.isEightyFivePercentMatch).toBe(false);
    expect(breakdown.spokenDurationSeconds).toBe(34);
    expect(breakdown.maxDuration).toBe(40);
    expect(breakdown.growth).toBe(0);
  });

  it("scales Delivery, Rhythm & Fluency out of 60 points", () => {
    const { breakdown } = calculateCompositeScore({
      durationSeconds: 80,
      targetVideoDuration: 80,
      isShadowing: true,
      analysis: {
        fluency: 8,
        confidence: 8,
        grammar: 8,
        stats: {
          wpm: 125,
          pauses: 2,
          rhythm: { speechRatio: 90, paceConsistency: 8 },
        },
      },
    });

    expect(breakdown.maxCommunication).toBe(60);
    expect(breakdown.maxComm).toBe(60);
    expect(breakdown.communication).toBeGreaterThan(45);
    expect(breakdown.communication).toBeLessThanOrEqual(60);
    expect(breakdown.growth).toBe(0);
    expect(breakdown.vocabulary).toBe(0);
  });

  it("evaluates exact spoken time = video duration * speech ratio (e.g. 111s at 70% speech ratio)", () => {
    const { score, breakdown } = calculateCompositeScore({
      durationSeconds: 111,
      targetVideoDuration: 85,
      isShadowing: true,
      analysis: {
        fluency: 7.0,
        confidence: 7.0,
        grammar: 7.5,
        stats: {
          wpm: 95,
          pauses: 2,
          rhythm: { speechRatio: 70, paceConsistency: 8.0 },
        },
      },
    });

    // 111s * 70% = 77.7s spoken >= 85% of 85s (72.25s) => Full 40 pts
    expect(breakdown.duration).toBe(40);
    expect(breakdown.isEightyFivePercentMatch).toBe(true);
    expect(breakdown.spokenDurationSeconds).toBe(78);
    expect(breakdown.communication).toBeGreaterThanOrEqual(45);
    expect(score).toBeGreaterThanOrEqual(85);
  });
});
