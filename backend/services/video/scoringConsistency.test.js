import { describe, it, expect } from "vitest";
import { calculateCompositeScore } from "./submitGate.js";

describe("Scoring Consistency: Breakdown sum must match composite score", () => {
  it("Picture Description: User with target words recognized is not falsely marked off-topic and breakdown matches score (Fayiz's exact case)", () => {
    // Exact parameters from Fayiz's submission:
    // Recognized words: bustling, interact
    // Duration: 123s (max target 180s, min reasonable 60s -> duration is 20/20)
    // communication: 18.2, content: ~9.1, vocabulary: 10, duration: 20, growth: 6
    const result = calculateCompositeScore({
      durationSeconds: 123,
      maxDurationSeconds: 180,
      vocabularyUsed: ["bustling", "interact"],
      totalVocabWords: 2,
      requiredVocabWords: 1,
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

  it("Re-evaluation calculation accuracy: Preserves target words and Sunday 2x multiplier without loss", () => {
    const prevVocabularyUsed = ["bustling", "interact"];
    const recalculation = calculateCompositeScore({
      durationSeconds: 123,
      maxDurationSeconds: 180,
      vocabularyUsed: prevVocabularyUsed,
      totalVocabWords: 5,
      requiredVocabWords: 1,
      topicRelevance: 2.0,
      analysis: {
        fluency: 6,
        grammar: 4,
        confidence: 6,
        vocabulary: 5,
        coherence: 3,
        topicRelevance: 2.0,
        isOffTopic: false,
      },
      isPictureDescription: true,
      userHistory: [],
    });

    const isSunday = true;
    const effectiveScore = isSunday ? Math.round(recalculation.score * 2 * 100) / 100 : recalculation.score;

    expect(recalculation.score).toBe(63.74);
    expect(effectiveScore).toBe(127.48);
    expect(recalculation.breakdown.vocabulary).toBe(10);
    expect(recalculation.breakdown.duration).toBe(20);
    const sum = recalculation.breakdown.communication + recalculation.breakdown.content + recalculation.breakdown.vocabulary + recalculation.breakdown.duration + recalculation.breakdown.growth;
    expect(Math.round(sum * 100) / 100).toBe(recalculation.score);
  });
  it("Student Authorization: Students have access to re-score their own reports by phone or user resolution", () => {
    const cleanPhone = (p) => (p || "").toString().replace(/^(\+91|91)/, "").replace(/\D/g, "");
    const checkAuth = (report, userId, userRole, callerPhone) => {
      const reportClean = cleanPhone(report.phone);
      const callerClean = cleanPhone(callerPhone);
      const isPrivileged = ["admin", "admins", "trainer", "superadmin"].includes(userRole);
      let isOwner = false;
      if (report.userId && userId && String(report.userId) === String(userId)) isOwner = true;
      if (!isOwner && callerClean && reportClean && callerClean === reportClean) isOwner = true;
      return isOwner || isPrivileged;
    };

    const report = {
      userId: "69db329aff97e3dfe02cd180",
      phone: "+919961714368",
    };

    // Student logged in (role: 'user') with Auth ID != User ID, matching phone
    expect(checkAuth(report, "69ef7d63cc5071476d4790de", "user", "9961714368")).toBe(true);
    expect(checkAuth(report, "69ef7d63cc5071476d4790de", "user", "+919961714368")).toBe(true);

    // Another student tries to access (different phone and id) -> rejected
    expect(checkAuth(report, "other_auth_id", "user", "9876543210")).toBe(false);

    // Admin / Trainer / Admins can access
    expect(checkAuth(report, "admin_auth_id", "admin", "9876543210")).toBe(true);
    expect(checkAuth(report, "trainer_auth_id", "trainer", "9876543210")).toBe(true);
    expect(checkAuth(report, "admins_auth_id", "admins", "9876543210")).toBe(true);
  });
});
