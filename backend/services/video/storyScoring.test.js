import { describe, it, expect } from "vitest";
import { calculateCompositeScore } from "./submitGate.js";

describe("Story Task Composite Scoring", () => {
  it("should calculate 4-part composite score including topic relevance for Story Summary tasks", () => {
    const result = calculateCompositeScore({
      durationSeconds: 150,
      maxDurationSeconds: 180,
      vocabularyUsed: ["resilience", "strategy", "collaborate"],
      totalVocabWords: 5,
      requiredVocabWords: 3,
      topicRelevance: 8,
      analysis: {
        fluency: 8,
        grammar: 7,
        confidence: 8,
        vocabulary: 8,
        _stats: {
          wpm: 120,
          rhythm: { speechRatio: 85 },
        },
      },
      isStorySummary: true,
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.breakdown.isStorySummary).toBe(true);
    expect(result.breakdown.isSpecialDay).toBe(false);
    expect(result.breakdown.topic).toBeCloseTo((8 / 10) * 15, 1);
    expect(result.breakdown.maxTopic).toBe(15);
    expect(result.breakdown.maxComm).toBe(10);
    expect(result.breakdown.maxLength).toBe(30);
    expect(result.breakdown.maxVocab).toBe(30);
    expect(result.breakdown.maxGrowth).toBe(15);
  });

  it("should self-heal topic relevance if raw topicRelevance is null on a story summary task", () => {
    const result = calculateCompositeScore({
      durationSeconds: 160,
      maxDurationSeconds: 180,
      vocabularyUsed: ["courage", "journey"],
      totalVocabWords: 5,
      requiredVocabWords: 3,
      topicRelevance: null,
      analysis: {
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        coherence: 7.5,
        _stats: {
          wpm: 130,
          rhythm: { speechRatio: 90 },
        },
      },
      isStorySummary: true,
    });

    // Should NOT treat story summary as a special day with 0 topic score
    expect(result.breakdown.isSpecialDay).toBe(false);
    expect(result.breakdown.isStorySummary).toBe(true);
    expect(result.breakdown.topic).toBeGreaterThan(0);
    expect(result.breakdown.maxTopic).toBe(15);
  });

  it("should keep special days (monthly reflection) without topic as 3-part score", () => {
    const result = calculateCompositeScore({
      durationSeconds: 300,
      maxDurationSeconds: 420,
      vocabularyUsed: [],
      totalVocabWords: 0,
      requiredVocabWords: 0,
      topicRelevance: null,
      analysis: {
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        _stats: {
          wpm: 120,
          rhythm: { speechRatio: 85 },
        },
      },
      isStorySummary: false,
      isPictureDescription: false,
    });

    expect(result.breakdown.isSpecialDay).toBe(true);
    expect(result.breakdown.topic).toBe(0);
    expect(result.breakdown.maxTopic).toBe(0);
    expect(result.breakdown.maxComm).toBe(25);
    expect(result.breakdown.maxGrowth).toBe(15);
  });

  it("should calculate picture description with Option B 5-category score", () => {
    const result = calculateCompositeScore({
      durationSeconds: 60,
      maxDurationSeconds: 180,
      vocabularyUsed: ["mountain", "sunset"],
      totalVocabWords: 5,
      requiredVocabWords: 2,
      topicRelevance: 9,
      analysis: {
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        coherence: 8.5,
        _stats: {
          wpm: 120,
          rhythm: { speechRatio: 85, paceConsistency: 8 },
        },
      },
      isPictureDescription: true,
    });

    expect(result.breakdown.isPictureDescription).toBe(true);
    expect(result.breakdown.maxCommunication).toBe(20);
    expect(result.breakdown.maxContent).toBe(35);
    expect(result.breakdown.maxVocabulary).toBe(10);
    expect(result.breakdown.maxDuration).toBe(20);
    expect(result.breakdown.maxGrowth).toBe(15);
  });
});
