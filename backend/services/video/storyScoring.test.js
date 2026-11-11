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
    expect(result.breakdown.topic).toBeCloseTo((8 / 10) * 25, 1);
    expect(result.breakdown.maxTopic).toBe(25);
    expect(result.breakdown.maxComm).toBe(20);
    expect(result.breakdown.maxLength).toBe(20);
    expect(result.breakdown.maxVocab).toBe(20);
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
    expect(result.breakdown.maxTopic).toBe(25);
    expect(result.breakdown.maxComm).toBe(20);
    expect(result.breakdown.maxLength).toBe(20);
    expect(result.breakdown.maxVocab).toBe(20);
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
    expect(result.breakdown.maxContent).toBe(25);
    expect(result.breakdown.maxVocabulary).toBe(20);
    expect(result.breakdown.maxDuration).toBe(20);
    expect(result.breakdown.maxGrowth).toBe(15);
  });

  const sampleStoryTranscript =
    "A nobleman announced a public entertainment in the theater offering splendid prizes for any novelty. A popular clown imitated a squealing pig empty-handed while a countryman concealed a real pig beneath his cloak and squeezed it during the performance until the audience discovered the trick.";
  const sampleStoryGuide =
    "Key points: A nobleman hosts a theater contest, a clown impresses the crowd by mimicking a pig, and a jealous countryman cheats by hiding a real pig on stage.";

  it("rejects story_summary meta-speech and preserves 20/20/25/20/15 weights", () => {
    const metaTranscript =
      "Hi everyone, today I would like to share what the story summary activity is and the uses of this story summary task. Summarizing stories is one of the best speaking exercises because it has many advantages and disadvantages for improving communication skills, vocabulary, and daily fluency in English.";

    const result = calculateCompositeScore({
      durationSeconds: 150,
      maxDurationSeconds: 180,
      vocabularyUsed: [],
      totalVocabWords: 5,
      requiredVocabWords: 3,
      topicRelevance: 8,
      challengeType: "story_summary",
      isStorySummary: true,
      targetStoryTranscript: sampleStoryTranscript,
      targetSummaryGuide: sampleStoryGuide,
      analysis: {
        transcription: metaTranscript,
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        coherence: 8,
        _stats: { wpm: 120, rhythm: { speechRatio: 85, paceConsistency: 8 } },
      },
    });

    expect(result.breakdown.isOffTopic).toBe(true);
    expect(result.score).toBeLessThanOrEqual(35);
    expect(result.breakdown.maxLength).toBe(20);
    expect(result.breakdown.maxVocab).toBe(20);
    expect(result.breakdown.maxTopic).toBe(25);
    expect(result.breakdown.maxComm).toBe(20);
    expect(result.breakdown.maxGrowth).toBe(15);
    const sum =
      result.breakdown.length +
      result.breakdown.vocabUsed +
      result.breakdown.topic +
      result.breakdown.comm +
      result.breakdown.growth;
    expect(Math.abs(sum - result.score)).toBeLessThanOrEqual(0.2);
  });

  it("rejects completely unrelated stories in story_summary mode", () => {
    const unrelatedTranscript =
      "Astronauts aboard the international orbital telescope repaired solar panels, calibrated infrared mirrors, monitored battery voltage, and photographed distant spiral galaxies using automated robotics throughout their three-week scientific expedition across deep orbit.";

    const result = calculateCompositeScore({
      durationSeconds: 150,
      maxDurationSeconds: 180,
      vocabularyUsed: [],
      totalVocabWords: 5,
      requiredVocabWords: 3,
      topicRelevance: 7,
      challengeType: "story_summary",
      isStorySummary: true,
      targetStoryTranscript: sampleStoryTranscript,
      targetSummaryGuide: sampleStoryGuide,
      analysis: {
        transcription: unrelatedTranscript,
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        coherence: 8,
        _stats: { wpm: 120, rhythm: { speechRatio: 85, paceConsistency: 8 } },
      },
    });

    expect(result.breakdown.isOffTopic).toBe(true);
    expect(result.score).toBeLessThanOrEqual(35);
  });

  it("allows valid paraphrased story_summary responses and keeps 20/20/25/20/15 weights", () => {
    const validParaphrase =
      "In today's story, a nobleman organized a theater contest with prizes for performers. A famous clown pretended to imitate a pig and earned loud applause, so a jealous countryman brought a real pig hidden under his cloak onto the stage and pinched it.";

    const result = calculateCompositeScore({
      durationSeconds: 150,
      maxDurationSeconds: 180,
      vocabularyUsed: ["imitate", "applause", "concealed"],
      totalVocabWords: 5,
      requiredVocabWords: 3,
      topicRelevance: 8.5,
      challengeType: "story_summary",
      isStorySummary: true,
      targetStoryTranscript: sampleStoryTranscript,
      targetSummaryGuide: sampleStoryGuide,
      analysis: {
        transcription: validParaphrase,
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        coherence: 8,
        _stats: { wpm: 120, rhythm: { speechRatio: 85, paceConsistency: 8 } },
      },
    });

    expect(result.breakdown.isOffTopic).toBe(false);
    expect(result.score).toBeGreaterThan(60);
    expect(result.breakdown.maxLength).toBe(20);
    expect(result.breakdown.maxVocab).toBe(20);
    expect(result.breakdown.maxTopic).toBe(25);
    expect(result.breakdown.maxComm).toBe(20);
    expect(result.breakdown.maxGrowth).toBe(15);
  });

  it("rejects picture_description meta-speech and preserves 20/25/20/20/15 weights", () => {
    const metaPic =
      "Today I would like to explain what picture description is and the uses of this picture description activity. Picture description helps learners understand advantages and disadvantages of daily speaking practice and fluency.";

    const result = calculateCompositeScore({
      durationSeconds: 150,
      maxDurationSeconds: 180,
      vocabularyUsed: [],
      totalVocabWords: 5,
      requiredVocabWords: 2,
      topicRelevance: 8,
      challengeType: "picture_description",
      isPictureDescription: true,
      targetImageScene: "sunny city park fountain bench children",
      targetQuestion: "Describe what you see happening in the park image.",
      analysis: {
        transcription: metaPic,
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        coherence: 8,
        _stats: { wpm: 120, rhythm: { speechRatio: 85, paceConsistency: 8 } },
      },
    });

    expect(result.breakdown.isOffTopic).toBe(true);
    expect(result.score).toBeLessThanOrEqual(35);
    expect(result.breakdown.maxCommunication).toBe(20);
    expect(result.breakdown.maxContent).toBe(25);
    expect(result.breakdown.maxVocabulary).toBe(20);
    expect(result.breakdown.maxDuration).toBe(20);
    expect(result.breakdown.maxGrowth).toBe(15);
    const sum =
      result.breakdown.communication +
      result.breakdown.content +
      result.breakdown.vocabulary +
      result.breakdown.duration +
      result.breakdown.growth;
    expect(Math.abs(sum - result.score)).toBeLessThanOrEqual(0.2);
  });

  it("keeps genuine picture_description submissions valid", () => {
    const genuinePic =
      "In the foreground on the left side of the picture, two children wearing bright jackets are playing beside a wooden bench under tall green trees while pedestrians walk past the fountain in the background.";

    const result = calculateCompositeScore({
      durationSeconds: 150,
      maxDurationSeconds: 180,
      vocabularyUsed: ["foreground", "pedestrians"],
      totalVocabWords: 5,
      requiredVocabWords: 2,
      topicRelevance: 9,
      challengeType: "picture_description",
      isPictureDescription: true,
      targetImageScene: "sunny city park fountain bench children",
      targetQuestion: "Describe what you see happening in the park image.",
      analysis: {
        transcription: genuinePic,
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        coherence: 8,
        _stats: { wpm: 120, rhythm: { speechRatio: 85, paceConsistency: 8 } },
      },
    });

    expect(result.breakdown.isOffTopic).toBe(false);
    expect(result.score).toBeGreaterThan(60);
  });

  it("rejects meta-speech on unrelated daily topics while allowing English-learning prompts", () => {
    const metaTopic =
      "Today I will talk about what today's speaking activity is and how daily speaking practice helps us. There are many advantages and disadvantages of this speaking task for our confidence and grammar.";

    const offTopicResult = calculateCompositeScore({
      durationSeconds: 200,
      maxDurationSeconds: 300,
      vocabularyUsed: [],
      totalVocabWords: 5,
      requiredVocabWords: 3,
      topicRelevance: 8,
      challengeType: "topic",
      targetQuestion: "Share your favorite childhood festival memory.",
      analysis: {
        transcription: metaTopic,
        questionTopic: "Childhood Festivals",
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        coherence: 8,
        _stats: { wpm: 120, rhythm: { speechRatio: 85, paceConsistency: 8 } },
      },
    });

    expect(offTopicResult.breakdown.isOffTopic).toBe(true);
    expect(offTopicResult.score).toBeLessThanOrEqual(35);
    expect(offTopicResult.breakdown.maxLength).toBe(30);
    expect(offTopicResult.breakdown.maxVocab).toBe(30);
    expect(offTopicResult.breakdown.maxTopic).toBe(15);

    const englishPromptResult = calculateCompositeScore({
      durationSeconds: 200,
      maxDurationSeconds: 300,
      vocabularyUsed: [],
      totalVocabWords: 5,
      requiredVocabWords: 3,
      topicRelevance: 8,
      challengeType: "topic",
      targetQuestion: "How does daily English speaking practice improve your confidence?",
      analysis: {
        transcription: metaTopic,
        questionTopic: "English Speaking Practice",
        fluency: 8,
        grammar: 8,
        confidence: 8,
        vocabulary: 8,
        coherence: 8,
        _stats: { wpm: 120, rhythm: { speechRatio: 85, paceConsistency: 8 } },
      },
    });

    expect(englishPromptResult.breakdown.isOffTopic).toBe(false);
    expect(englishPromptResult.score).toBeGreaterThan(50);
  });
});
