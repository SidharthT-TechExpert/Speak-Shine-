import { describe, it, expect } from "vitest";
import { calculateCompositeScore } from "./submitGate.js";

describe("Scoring Consistency: Breakdown sum must match composite score", () => {
  it("Picture Description: User with target words recognized is not falsely marked off-topic and breakdown matches score (Fayiz's exact case)", () => {
    // Exact parameters from Fayiz's submission:
    // Recognized words: bustling, interact
    // Duration: 123s (max target 180s, min reasonable 60s -> duration is 20/20)
    // communication: 18.2, content: ~7.5, vocabulary: 10, duration: 20, growth: 6
    const result = calculateCompositeScore({
      durationSeconds: 123,
      maxDurationSeconds: 180,
      vocabularyUsed: ["bustling", "interact"],
      totalVocabWords: 2,
      requiredVocabWords: 2,
      topicRelevance: 2.0,
      analysis: {
        fluency: 6,
        grammar: 4,
        confidence: 6,
        vocabulary: 5,
        coherence: 3,
        topicRelevance: 2.0,
        isOffTopic: false,
        stats: {
          rhythm: { speechRatio: 90, paceConsistency: 8.5 },
          wpm: 120,
          fillerTotal: 2,
          pauses: 2,
          wordCount: 240,
        },
      },
      isPictureDescription: true,
      userHistory: [
        { fluency: 6, grammar: 4, confidence: 6, vocabulary: 5 },
        { fluency: 7, grammar: 4, confidence: 7, vocabulary: 5 },
      ],
    });

    const bd = result.breakdown;
    expect(bd.isOffTopic).toBe(false);
    expect(bd.duration).toBe(20);
    expect(bd.vocabulary).toBe(10);

    const breakdownSum = Math.round(
      (bd.communication + bd.content + bd.vocabulary + bd.duration + bd.growth) * 100
    ) / 100;

    // Mathematical consistency: score must match the sum of its parts
    expect(result.score).toBe(breakdownSum);
    expect(Math.abs(result.score - breakdownSum)).toBeLessThan(0.01);
    expect(result.score).toBeGreaterThan(50); // Not crushed to 34
  });

  it("Picture Description: When genuinely off-topic, breakdown components are scaled so their sum strictly equals score", () => {
    const result = calculateCompositeScore({
      durationSeconds: 180,
      maxDurationSeconds: 180,
      vocabularyUsed: [],
      totalVocabWords: 3,
      requiredVocabWords: 2,
      topicRelevance: 1.0,
      analysis: {
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        coherence: 1,
        topicRelevance: 1.0,
        isOffTopic: true,
        stats: {
          rhythm: { speechRatio: 90, paceConsistency: 8 },
          wpm: 120,
          fillerTotal: 0,
          pauses: 1,
          wordCount: 300,
        },
      },
      isPictureDescription: true,
      userHistory: [{ fluency: 7, grammar: 7, confidence: 7, vocabulary: 7 }],
    });

    const bd = result.breakdown;
    expect(bd.isOffTopic).toBe(true);
    expect(result.score).toBeLessThanOrEqual(35); // Strict security gate applied

    const breakdownSum = Math.round(
      (bd.communication + bd.content + bd.vocabulary + bd.duration + bd.growth) * 100
    ) / 100;

    // Mathematical consistency: score must strictly equal the sum of breakdown parts
    expect(result.score).toBe(breakdownSum);
    expect(Math.abs(result.score - breakdownSum)).toBeLessThan(0.01);
  });

  it("Normal Challenge: When genuinely off-topic, breakdown components are scaled so their sum strictly equals score", () => {
    const result = calculateCompositeScore({
      durationSeconds: 180,
      maxDurationSeconds: 180,
      vocabularyUsed: [],
      totalVocabWords: 5,
      requiredVocabWords: 3,
      topicRelevance: 1.0,
      analysis: {
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        isOffTopic: true,
        stats: {
          rhythm: { speechRatio: 90 },
          wpm: 120,
        },
      },
      isPictureDescription: false,
      userHistory: [{ fluency: 7, grammar: 7, confidence: 7, vocabulary: 7 }],
    });

    const bd = result.breakdown;
    expect(bd.isOffTopic).toBe(true);
    expect(result.score).toBeLessThanOrEqual(35);

    const breakdownSum = Math.round(
      (bd.length + bd.vocabUsed + bd.topic + bd.comm + bd.growth) * 100
    ) / 100;

    expect(result.score).toBe(breakdownSum);
    expect(Math.abs(result.score - breakdownSum)).toBeLessThan(0.01);
  });
});
