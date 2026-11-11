import { describe, it, expect, vi } from "vitest";
vi.mock("./groqKeyManager.js", () => ({
  getTextKey: () => null,
  getTextModel: () => "llama-3.3-70b-versatile",
  markKeyExhausted: () => {},
  parseRetryAfter: () => null,
}));
vi.mock("./grammarCheck.js", () => ({
  checkGrammar: async () => [],
  filterGrammarErrors: (e) => e || [],
}));
import {
  repairTruncatedJson,
  ensureScoreDefaults,
  analyzeSpeech,
} from "./analyzeSpeech.js";

describe("analyzeSpeech JSON repair and fallback", () => {
  it("parses valid JSON without modification", () => {
    const valid = JSON.stringify({
      fluency: 8,
      grammar: 7,
      confidence: 9,
      vocabulary: 8,
      overallComment: "Great job!",
    });
    const parsed = repairTruncatedJson(valid);
    expect(parsed).toEqual({
      fluency: 8,
      grammar: 7,
      confidence: 9,
      vocabulary: 8,
      overallComment: "Great job!",
    });
  });

  it("extracts and parses JSON wrapped in markdown fences", () => {
    const fenced = "```json\n{\"fluency\": 8, \"grammar\": 7}\n```";
    const parsed = repairTruncatedJson(fenced);
    expect(parsed).toEqual({ fluency: 8, grammar: 7 });
  });

  it("salvages JSON truncated mid-string (the exact bug from user screenshot)", () => {
    // Cut off mid-string without closing quote or closing brace
    const truncated = '{"fluency": 8, "grammar": 7, "suggestions": ["Speak louder"], "overallComment": "You did great and your pace was';
    const parsed = repairTruncatedJson(truncated);
    expect(parsed).not.toBeNull();
    expect(parsed.fluency).toBe(8);
    expect(parsed.grammar).toBe(7);
    expect(parsed.suggestions).toEqual(["Speak louder"]);
    expect(parsed.overallComment).toContain("You did great");
  });

  it("salvages JSON truncated mid-array", () => {
    const truncated = '{"fluency": 8, "strongPoints": ["Good tone", "Clear';
    const parsed = repairTruncatedJson(truncated);
    expect(parsed).not.toBeNull();
    expect(parsed.fluency).toBe(8);
    expect(parsed.strongPoints).toEqual(["Good tone"]);
  });

  it("salvages JSON truncated with a trailing colon or incomplete key", () => {
    const truncated = '{"fluency": 8, "grammar": 7, "overallComment": ';
    const parsed = repairTruncatedJson(truncated);
    expect(parsed).not.toBeNull();
    expect(parsed.fluency).toBe(8);
    expect(parsed.grammar).toBe(7);
  });

  it("salvages JSON truncated with a trailing comma", () => {
    const truncated = '{"fluency": 8, "grammar": 7,';
    const parsed = repairTruncatedJson(truncated);
    expect(parsed).not.toBeNull();
    expect(parsed.fluency).toBe(8);
    expect(parsed.grammar).toBe(7);
  });

  it("fills missing fields with fallback defaults using ensureScoreDefaults", () => {
    const fallback = {
      fluency: 6,
      grammar: 6,
      confidence: 6,
      vocabulary: 6,
      coherence: 6,
      grammarErrors: [],
      strongPoints: ["Effort"],
      suggestions: ["Practice"],
      topicRelevance: null,
      topicFeedback: null,
      pronunciationNote: null,
      rhythmNote: null,
      cefrLevel: "B1",
      vocabularyHighlights: { strong: [], weak: [] },
      overallComment: "Baseline comment",
    };

    const partial = {
      fluency: 9,
      grammar: 8,
      suggestions: ["Custom suggestion"],
    };

    const merged = ensureScoreDefaults(partial, fallback);
    expect(merged.fluency).toBe(9);
    expect(merged.grammar).toBe(8);
    expect(merged.confidence).toBe(6);
    expect(merged.suggestions).toEqual(["Custom suggestion"]);
    expect(merged.strongPoints).toEqual(["Effort"]);
    expect(merged.overallComment).toBe("Baseline comment");
    expect(merged.cefrLevel).toBe("B1");
  });

  it("flags off-topic shadowing in analyzeSpeech fallback when student explains shadowing instead of repeating script", async () => {
    const questionText = [
      "Video Topic: Brain health with Dr Ayesha",
      "Original Spoken Transcript: Well, my story is she came and sat next to me. And the first conversation was about the fact that our two amazing grandparents had passed away from Alzheimer and dementia.",
      "Target Reference Duration: 85 seconds",
    ].join("\n\n");

    const metaSpeech =
      "Hi everyone, today I would like to share with you a speech practice. Shadowing is one of the best techniques in English speaking skills because it helps us improve pronunciation and confidence. Today I want to explain its uses, advantages, and disadvantages.";

    const result = await analyzeSpeech(
      metaSpeech,
      167,
      [],
      "Brain health with Dr Ayesha",
      questionText,
      [],
      { speechRatio: 90, paceConsistency: 8 },
      "shadowing_video"
    );

    expect(result.isOffTopic).toBe(true);
    expect(result.topicRelevance).toBeLessThanOrEqual(2);
    expect(result.topicFeedback).toContain("Your speech did not match today's assigned shadowing reference script");
    expect(result.overallComment).not.toContain("good speaking effort");
    expect(result.overallComment).toContain("Off-topic submission");
  });

  it("keeps shadowing valid in analyzeSpeech fallback when student genuinely repeats the reference script", async () => {
    const questionText = [
      "Video Topic: Brain health with Dr Ayesha",
      "Original Spoken Transcript: Well, my story is she came and sat next to me. And the first conversation was about the fact that our two amazing grandparents had passed away from Alzheimer and dementia.",
      "Target Reference Duration: 85 seconds",
    ].join("\n\n");

    const genuineSpeech =
      "Well my story is she came and sat next to me and the first conversation was about the fact that our two amazing grandparents passed away from Alzheimer and dementia";

    const result = await analyzeSpeech(
      genuineSpeech,
      80,
      [],
      "Brain health with Dr Ayesha",
      questionText,
      [],
      { speechRatio: 90, paceConsistency: 8 },
      "shadowing_video"
    );

    expect(result.isOffTopic).toBe(false);
    expect(result.topicRelevance).toBe(7);
  });
});
