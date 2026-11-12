import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getISTDateKey,
  getISTDayBounds,
  getISTParts,
  getISTStartOfDay,
  parseISTDateTime,
} from "../../utils/dateUtils.js";
import {
  matchVocabularyInTranscript,
  calculateCompositeScore,
} from "./submitGate.js";
import { normalizeVocabularyList } from "../../../models/videoReportSchema.js";
import { resolveVocabRequiredCount } from "../../../api/posterGenerator.js";

const mockUserUpdateMany = vi.fn();
const mockUserFind = vi.fn();
const mockUserUpdateOne = vi.fn();

vi.mock("../../../models/userSchema.js", () => ({
  default: {
    updateMany: (...args) => mockUserUpdateMany(...args),
    find: (...args) => mockUserFind(...args),
    updateOne: (...args) => mockUserUpdateOne(...args),
    bulkWrite: vi.fn(),
  },
}));

vi.mock("../../../models/statusSchema.js", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock("../../../models/streakRecordSchema.js", () => ({
  default: {
    findOne: vi.fn().mockResolvedValue({ streak: 99 }),
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
  },
}));

import { applyStreakUpdates } from "../scheduler/dailyResetService.js";

describe("IST dateUtils across UTC boundaries", () => {
  it("computes consistent IST parts and 24-hour day bounds regardless of host timezone", () => {
    // 2026-11-12T18:45:00Z == 2026-11-13 00:15 IST
    const instant = new Date("2026-11-12T18:45:00.000Z");
    const parts = getISTParts(instant);
    expect(parts.dateStr).toBe("2026-11-13");
    expect(parts.hours).toBe(0);
    expect(parts.minutes).toBe(15);
    expect(getISTDateKey(instant)).toBe("2026-11-13");

    const { start, endExclusive } = getISTDayBounds(instant);
    expect(endExclusive.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(parseISTDateTime("2026-11-13", "09:30").toISOString()).toBe("2026-11-13T04:00:00.000Z");
  });
});

describe("applyStreakUpdates catch-up guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mockUserUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("queries $nin [yesterdayIST, todayIST] and stamps lastStreakDate with yesterdayIST", async () => {
    const todayIST = getISTDateKey();
    const yesterdayIST = getISTDateKey(new Date(getISTStartOfDay().getTime() - 60_000));

    mockUserFind.mockReturnValue({
      lean: async () => [
        {
          _id: "u1",
          name: "Asha",
          streak: 6,
          freezeStreakProgress: 6,
          earnedBadges: [],
        },
        {
          _id: "u2",
          name: "Ravi",
          streak: 3,
          freezeStreakProgress: 3,
          earnedBadges: [],
        },
      ],
    });

    await applyStreakUpdates();

    // First find filters out both yesterdayIST and todayIST submitters
    expect(mockUserFind).toHaveBeenCalledWith({
      completed: true,
      lastStreakDate: { $nin: [yesterdayIST, todayIST] },
    });

    // Catch-up increment writes yesterdayIST so today's submission is NOT blocked
    expect(mockUserUpdateOne).toHaveBeenCalledWith(
      { _id: "u1", lastStreakDate: { $nin: [yesterdayIST, todayIST] } },
      { $inc: { streak: 1 }, $set: { lastStreakDate: yesterdayIST } }
    );
  });
});

describe("Scoring & Expression Matcher regression fixes", () => {
  it("matches contractions and mid-phrase ellipses without short-tail false positives", () => {
    const vocab = [
      { expression: "It's turned out that..." },
      { expression: "What I've noticed is..." },
      { expression: "What makes ... stand out" },
      { expression: "Get out of hand" },
    ];

    const positiveTranscript =
      "It's turned out that practice matters, and what I've noticed is that what makes our team really stand out is consistency.";
    const matched = matchVocabularyInTranscript(positiveTranscript, vocab);
    expect(matched).toContain("It's turned out that...");
    expect(matched).toContain("What I've noticed is...");
    expect(matched).toContain("What makes ... stand out");

    // 2-word tail ("of hand") should NOT trigger "Get out of hand" (4 words -> needs >= 3-word tail)
    const falsePositiveTranscript = "The notes on the left of hand were hard to read.";
    const falseMatched = matchVocabularyInTranscript(falsePositiveTranscript, [
      { expression: "out of hand" },
    ]);
    expect(falseMatched).not.toContain("out of hand");
  });

  it("awards full 20 vocab points on picture description days when no vocab words are configured", () => {
    const res = calculateCompositeScore({
      durationSeconds: 180,
      maxDurationSeconds: 180,
      vocabularyUsed: [],
      totalVocabWords: 0,
      requiredVocabWords: 0,
      topicRelevance: 8,
      isPictureDescription: true,
      challengeType: "picture_description",
      analysis: {
        fluency: 8,
        grammar: 8,
        confidence: 8,
        topicRelevance: 8,
        stats: { wpm: 120, rhythm: { speechRatio: 90 } },
      },
    });
    expect(res.breakdown.vocabulary).toBe(20);
  });
});

describe("Manual/Auto task schema normalization & vocab target helpers", () => {
  it("normalizes mixed expression objects, JSON strings, and duplicates into strings", () => {
    const out = normalizeVocabularyList([
      { expression: "From where I stand..." },
      "From where I stand...",
      { word: "bounce back", meaning: "recover" },
      "  ",
    ]);
    expect(out).toEqual(["From where I stand...", "bounce back"]);
  });

  it("resolves mode-specific vocab required counts correctly", () => {
    const status = {
      vocabRequiredCount: 3,
      vocabNormalRequiredCount: 4,
      vocabPictureRequiredCount: 2,
      vocabStoryRequiredCount: 1,
      todayContentType: "story_audio",
      isStorySummaryDay: true,
    };
    expect(resolveVocabRequiredCount(status)).toBe(1);
    expect(resolveVocabRequiredCount({ ...status, todayContentType: "shadowing_video", isShadowingDay: true })).toBe(0);
    expect(resolveVocabRequiredCount(status, { isPicture: true, isStory: false })).toBe(2);
    expect(resolveVocabRequiredCount(status, { isStory: false, isPicture: false, isShadowing: false })).toBe(4);
  });
});
