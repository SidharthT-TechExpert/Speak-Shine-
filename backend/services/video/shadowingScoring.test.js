import { describe, it, expect } from "vitest";
import { calculateCompositeScore } from "./submitGate.js";

describe("Shadowing Activity Scoring Model (40 Duration / 60 Delivery / 0 Growth / 0 Vocab)", () => {
  it("awards full 40 duration points when actual duration is >= 90% of target video duration", () => {
    const { score, breakdown } = calculateCompositeScore({
      durationSeconds: 72, // 72 / 80 = 90%
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
    expect(breakdown.isNinetyPercentMatch).toBe(true);
    expect(breakdown.maxGrowth).toBe(0);
    expect(breakdown.growth).toBe(0);
    expect(breakdown.maxVocabulary).toBe(0);
    expect(breakdown.vocabulary).toBe(0);
    expect(breakdown.maxCommunication).toBe(60);
    expect(breakdown.maxComm).toBe(60);
    expect(score).toBe(100);
  });

  it("calculates proportional effort score when duration is below 90%", () => {
    const { breakdown } = calculateCompositeScore({
      durationSeconds: 36, // 36 / 80 = 45% ratio. (45% / 90%) * 40 = 20 pts
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
    expect(breakdown.isNinetyPercentMatch).toBe(false);
    expect(breakdown.durationRatio).toBe(45);
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
});
