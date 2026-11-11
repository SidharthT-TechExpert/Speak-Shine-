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

  const storyQuestionText = [
    "Story Theme / Topic: Theater Pride",
    "Story transcript: A nobleman announced a public entertainment in the theater offering splendid prizes for any novelty. A popular clown imitated a squealing pig empty-handed while a countryman concealed a real pig beneath his cloak and squeezed it on stage until the crowd caught the trick.",
    "Expected key points / summary guide: A nobleman holds a talent show, a clever clown imitates a pig without props, and a rival countryman hides a real pig under his coat.",
  ].join("\n\n");

  it("flags story_summary meta-speech in analyzeSpeech fallback", async () => {
    const metaStory =
      "Hello everyone, today I want to explain what today's story summary activity is and the uses of summarizing stories. Story summary is a speaking task that has many advantages and disadvantages for building confidence and daily English fluency.";

    const result = await analyzeSpeech(
      metaStory,
      140,
      [],
      "Theater Pride",
      storyQuestionText,
      [],
      { speechRatio: 85, paceConsistency: 8 },
      "story_summary"
    );

    expect(result.isOffTopic).toBe(true);
    expect(result.topicRelevance).toBeLessThanOrEqual(2);
    expect(result.overallComment).not.toContain("good speaking effort");
    expect(result.overallComment).toContain("Off-topic submission");
  });

  it("flags completely unrelated stories in story_summary analyzeSpeech fallback", async () => {
    const unrelatedStory =
      "Astronauts aboard the international orbital telescope repaired solar panels, calibrated infrared mirrors, monitored battery voltage, and photographed distant spiral galaxies using automated robotics throughout their three-week scientific expedition across deep orbit.";

    const result = await analyzeSpeech(
      unrelatedStory,
      140,
      [],
      "Theater Pride",
      storyQuestionText,
      [],
      { speechRatio: 85, paceConsistency: 8 },
      "story_summary"
    );

    expect(result.isOffTopic).toBe(true);
    expect(result.topicRelevance).toBeLessThanOrEqual(2);
    expect(result.overallComment).toContain("Off-topic submission");
  });

  it("keeps genuine paraphrased story_summary valid in analyzeSpeech fallback", async () => {
    const validParaphrase =
      "In the assigned story, a nobleman arranged a theater show with prizes. A clown impressed the theater crowd by squealing like a pig empty-handed, and a countryman later cheated by hiding a real pig beneath his cloak.";

    const result = await analyzeSpeech(
      validParaphrase,
      140,
      [],
      "Theater Pride",
      storyQuestionText,
      [],
      { speechRatio: 85, paceConsistency: 8 },
      "story_summary"
    );

    expect(result.isOffTopic).toBe(false);
    expect(result.topicRelevance).toBe(7);
  });

  it("flags picture_description meta-speech in analyzeSpeech fallback and preserves genuine descriptions", async () => {
    const picContext = [
      "Image scene: busy street market with colorful fruit stalls",
      "Task instructions given to student: Describe what people and objects you see in the market photograph.",
    ].join("\n\n");

    const metaPic =
      "Today I would like to share with you what picture description is. Picture description is an English speaking exercise with several advantages and disadvantages for fluency and confidence.";

    const offTopic = await analyzeSpeech(
      metaPic,
      130,
      [],
      "Street Market Scene",
      picContext,
      [],
      { speechRatio: 85, paceConsistency: 8 },
      "picture_description"
    );

    expect(offTopic.isOffTopic).toBe(true);
    expect(offTopic.topicRelevance).toBeLessThanOrEqual(2);
    expect(offTopic.overallComment).toContain("Off-topic submission");

    const validPic =
      "In the foreground on the left, vendors are selling colorful mangoes and bananas under striped umbrellas while shoppers walk down the crowded street market in the background.";

    const onTopic = await analyzeSpeech(
      validPic,
      130,
      [],
      "Street Market Scene",
      picContext,
      [],
      { speechRatio: 85, paceConsistency: 8 },
      "picture_description"
    );

    expect(onTopic.isOffTopic).toBe(false);
    expect(onTopic.topicRelevance).toBe(7);
  });

  it("flags daily topic meta-speech when prompt is unrelated in analyzeSpeech fallback", async () => {
    const metaTopic =
      "This speaking activity helps learners improve communication and fluency. There are advantages and disadvantages of today's speaking task for vocabulary growth.";

    const result = await analyzeSpeech(
      metaTopic,
      180,
      [],
      "Childhood Memories",
      "Tell us about your favorite childhood summer vacation.",
      [],
      { speechRatio: 85, paceConsistency: 8 },
      "topic"
    );

    expect(result.isOffTopic).toBe(true);
    expect(result.topicRelevance).toBeLessThanOrEqual(2);
    expect(result.overallComment).toContain("Off-topic submission");
  });
});
