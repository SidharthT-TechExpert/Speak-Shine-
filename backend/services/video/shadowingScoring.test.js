import { describe, it, expect } from "vitest";
import { calculateCompositeScore, evaluateShadowingMatch, resolveDayContentFlags } from "./submitGate.js";

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

  it("awards 0 points and sets isSilentAttempt: true when video audio is completely silent (-85.5 dB)", () => {
    const { score, breakdown } = calculateCompositeScore({
      durationSeconds: 126,
      targetVideoDuration: 85,
      isShadowing: true,
      analysis: {
        fluency: 6.5,
        confidence: 6.5,
        grammar: 7.0,
        qualityWarning: "Audio is quiet (-85.5dB). For best clarity, record in a quieter environment and speak closer to your microphone.",
        stats: {
          wpm: 45,
          pauses: 4,
          rhythm: { speechRatio: 32 },
        },
      },
    });

    expect(score).toBe(0);
    expect(breakdown.duration).toBe(0);
    expect(breakdown.communication).toBe(0);
    expect(breakdown.isSilentAttempt).toBe(true);
    expect(breakdown.silenceWarning).toContain("No audible speech detected (-85.5dB)");
  });

  it("awards 0 points when isSilent is explicitly flagged or wordCount < 5", () => {
    const { score, breakdown } = calculateCompositeScore({
      durationSeconds: 60,
      targetVideoDuration: 60,
      isShadowing: true,
      analysis: {
        isSilent: true,
        stats: {
          wordCount: 0,
          wpm: 0,
        },
      },
    });

    expect(score).toBe(0);
    expect(breakdown.duration).toBe(0);
    expect(breakdown.communication).toBe(0);
    expect(breakdown.isSilentAttempt).toBe(true);
  });

  it("penalizes and flags isOffTopic: true when spoken transcript does not match the reference shadowing transcript", () => {
    const referenceTranscript = "Today we are discussing personal growth, emotional resilience, and how consistent daily practice transforms public speaking and confidence.";
    const unrelatedTranscript = "I love eating chocolate ice cream and pizza on Friday evenings while watching cartoons with my friends.";

    const { score, breakdown } = calculateCompositeScore({
      durationSeconds: 60,
      targetVideoDuration: 60,
      targetVideoTranscript: referenceTranscript,
      isShadowing: true,
      analysis: {
        transcription: unrelatedTranscript,
        fluency: 8,
        confidence: 8,
        grammar: 8,
        stats: {
          wordCount: 16,
          wpm: 120,
          pauses: 1,
          rhythm: { speechRatio: 85, paceConsistency: 8 },
        },
      },
    });

    expect(breakdown.isOffTopic).toBe(true);
    expect(breakdown.duration).toBe(0); // Zero duration match for wrong speech
    expect(breakdown.communication).toBeLessThanOrEqual(20);
    expect(score).toBeLessThanOrEqual(20);
    expect(breakdown.offTopicReason).toContain("Your speech did not match today's assigned shadowing reference script");
  });

  it("flags isOffTopic and denies duration points when student explains what shadowing is instead of mirroring Dr. Ayesha script (even under fallback scores)", () => {
    const drAyeshaScript =
      "Well, my story is she came and sat next to me. And the first conversation was about the fact that our two amazing grandparents had passed away from Alzheimer and dementia. And from a year later we were married after many really unusual dates in a situation like that. And then we came back and from the very first day we started studying lifestyle medicine together.";
    const studentMetaSpeech =
      "Hi everyone, today I would like to share with you a speech practice. What I find interesting in native speakers is communication naturally and confidently. When I listen to native speakers, I try to observe their pronunciation, tone, and pronunciation. The power of speech and sentences sharing is one of the best techniques in my English speaking skills because it helps me understand the natural language. However, I believe regular listening and speaking practice can help me overcome these difficulties. This reason why I see this is that shadowing makes me in the several skills at the same time. I listen carefully to the speaker repeating sentence and voice trying to make pronunciation right. On top of that I try to proper my own voice and compare it to the original speaker. This helps me identify my mistakes and understand what I need to improve. I believe shadowing is a powerful technique that can help me achieve my communication goals. My aim is to speak English naturally and confidently and without hesitations.";

    const { score, breakdown } = calculateCompositeScore({
      durationSeconds: 167,
      targetVideoDuration: 85,
      targetVideoTranscript: drAyeshaScript,
      isShadowing: true,
      topicRelevance: 7,
      analysis: {
        transcription: studentMetaSpeech,
        fluency: 7,
        grammar: 7,
        confidence: 6,
        topicRelevance: 7,
        isOffTopic: false,
        stats: {
          wordCount: 332,
          wpm: 120,
          pauses: 5,
          rhythm: { speechRatio: 90, paceConsistency: 8 },
        },
      },
    });

    expect(breakdown.isOffTopic).toBe(true);
    expect(breakdown.duration).toBe(0);
    expect(breakdown.durationMatchPercent).toBe(0);
    expect(breakdown.durationRatio).toBe(0);
    expect(breakdown.isEightyFivePercentMatch).toBe(false);
    expect(breakdown.communication).toBeLessThanOrEqual(20);
    expect(score).toBeLessThanOrEqual(20);
    expect(breakdown.durationMessage).toBe(breakdown.offTopicReason);
    expect(breakdown.offTopicReason).toContain("Your speech did not match today's assigned shadowing reference script");
  });

  it("flags meta-commentary about shadowing even when reference script mentions speaking/shadowing OR when targetVideoTranscript is absent", () => {
    const speakingPracticeScript =
      "Welcome to morning fluency warm-up. Breathe calmly, drop your shoulders, and focus on crisp consonant endings as we pace through each short announcement from the studio.";
    const metaExplanation =
      "Today I would like to explain what shadowing is and its advantages and disadvantages. Shadowing is a great language learning technique that helps us improve pronunciation, listening, and confidence by comparing our voice with a native speaker.";

    const withScript = calculateCompositeScore({
      durationSeconds: 90,
      targetVideoDuration: 85,
      targetVideoTranscript: speakingPracticeScript,
      isShadowing: true,
      analysis: {
        transcription: metaExplanation,
        fluency: 8,
        confidence: 8,
        grammar: 8,
        stats: { wpm: 125, pauses: 1, rhythm: { speechRatio: 85, paceConsistency: 8 } },
      },
    });
    expect(withScript.breakdown.isOffTopic).toBe(true);
    expect(withScript.breakdown.duration).toBe(0);
    expect(withScript.score).toBeLessThanOrEqual(20);

    const withoutScript = calculateCompositeScore({
      durationSeconds: 90,
      targetVideoDuration: 85,
      targetVideoTranscript: null,
      isShadowing: true,
      analysis: {
        transcription: metaExplanation,
        fluency: 8,
        confidence: 8,
        grammar: 8,
        stats: { wpm: 125, pauses: 1, rhythm: { speechRatio: 85, paceConsistency: 8 } },
      },
    });
    expect(withoutScript.breakdown.isOffTopic).toBe(true);
    expect(withoutScript.breakdown.duration).toBe(0);
    expect(withoutScript.score).toBeLessThanOrEqual(20);
    expect(withoutScript.breakdown.offTopicReason).toContain("Your speech did not match today's assigned shadowing reference script");
  });

  it("accepts genuine shadowing with minor STT variations and awards full score", () => {
    const drAyeshaScript =
      "Well, my story is she came and sat next to me. And the first conversation was about the fact that our two amazing grandparents had passed away from Alzheimer and dementia. A year later we were married after many unusual dates.";
    const studentActualShadowing =
      "Well my story is she came and sat next to me and the first conversation was about the fact our two amazing grandparents passed away from Alzheimer's and dementia and year later we were married after many unusual dates";

    const match = evaluateShadowingMatch(studentActualShadowing, drAyeshaScript);
    expect(match.isMatch).toBe(true);
    expect(match.isStrongMatch).toBe(true);

    const { score, breakdown } = calculateCompositeScore({
      durationSeconds: 85,
      targetVideoDuration: 85,
      targetVideoTranscript: drAyeshaScript,
      isShadowing: true,
      analysis: {
        transcription: studentActualShadowing,
        fluency: 9,
        confidence: 9,
        grammar: 9,
        stats: { wordCount: 40, wpm: 120, pauses: 1, rhythm: { speechRatio: 90, paceConsistency: 9 } },
      },
    });

    expect(breakdown.isOffTopic).toBe(false);
    expect(breakdown.duration).toBe(40);
    expect(breakdown.isEightyFivePercentMatch).toBe(true);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("resolveDayContentFlags prioritizes explicit todayContentType and stored challengeType over stale flags", () => {
    const shadowWithStale = resolveDayContentFlags({
      todayContentType: "shadowing_video",
      isStorySummaryDay: true,
      isPictureDescriptionDay: true,
      isShadowingDay: false,
    });
    expect(shadowWithStale).toEqual({ isStory: false, isPicture: false, isShadowing: true });

    const historicalNormal = resolveDayContentFlags({
      todayContentType: "shadowing_video",
      isShadowingDay: true,
    }, "normal");
    expect(historicalNormal).toEqual({ isStory: false, isPicture: false, isShadowing: false });
  });
});
