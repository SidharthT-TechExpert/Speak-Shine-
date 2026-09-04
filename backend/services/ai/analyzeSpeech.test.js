import { describe, it, expect } from "vitest";
import {
  repairTruncatedJson,
  ensureScoreDefaults,
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
});
