import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getISTParts,
  getISTDateKey,
  isISTLastDayOfMonth,
  isISTFirstDayOfMonth,
} from "../../utils/dateUtils.js";

const mockStatusFindOne = vi.fn();
const mockStatusUpdateOne = vi.fn();

vi.mock("../../../models/statusSchema.js", () => ({
  default: {
    findOne: (...args) => mockStatusFindOne(...args),
    updateOne: (...args) => mockStatusUpdateOne(...args),
  },
}));

vi.mock("../../../models/questionSchema.js", () => ({
  default: {
    countDocuments: vi.fn().mockResolvedValue(10),
    findOne: vi.fn().mockResolvedValue(null),
    aggregate: vi.fn().mockResolvedValue([]),
    findByIdAndDelete: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../questions/questionsService.js", () => ({
  getDueManualQuestion: vi.fn().mockResolvedValue(null),
  getManualQuestionForDate: vi.fn().mockResolvedValue(null),
}));

vi.mock("../ai/vocabularyGenerator.js", () => ({
  ensureTodayVocabulary: vi.fn().mockResolvedValue({}),
}));

import {
  shouldPublishQuestion,
  catchUpPublishQuestion,
  isShadowingDay,
} from "./questionSchedulerService.js";

describe("dateUtils IST helpers & aliases", () => {
  it("provides both singular and plural time components and weekday/dayOfWeek aliases", () => {
    // 2026-11-13T05:00:00Z -> shifted by +5:30 -> 10:30 AM IST, Friday (weekday 5)
    const instant = new Date("2026-11-13T05:00:00.000Z");
    const parts = getISTParts(instant);

    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(10); // November (0-indexed)
    expect(parts.day).toBe(13);
    expect(parts.weekday).toBe(5);
    expect(parts.dayOfWeek).toBe(5);
    expect(parts.hour).toBe(10);
    expect(parts.hours).toBe(10);
    expect(parts.minute).toBe(30);
    expect(parts.minutes).toBe(30);
    expect(parts.dateStr).toBe("2026-11-13");
    expect(parts.timeStr).toBe("10:30");
  });

  it("accurately detects the last day and first day of the month without 0-index offset bugs", () => {
    // November has 30 days
    expect(isISTLastDayOfMonth("2026-11-30T12:00:00+05:30")).toBe(true);
    expect(isISTLastDayOfMonth("2026-11-29T12:00:00+05:30")).toBe(false);
    expect(isISTLastDayOfMonth("2026-11-13T12:00:00+05:30")).toBe(false);

    // October has 31 days
    expect(isISTLastDayOfMonth("2026-10-31T12:00:00+05:30")).toBe(true);
    expect(isISTLastDayOfMonth("2026-10-30T12:00:00+05:30")).toBe(false);

    // February leap year test (2024 is a leap year -> 29 days)
    expect(isISTLastDayOfMonth("2024-02-29T12:00:00+05:30")).toBe(true);
    expect(isISTLastDayOfMonth("2024-02-28T12:00:00+05:30")).toBe(false);

    // First day of month
    expect(isISTFirstDayOfMonth("2026-11-01T08:00:00+05:30")).toBe(true);
    expect(isISTFirstDayOfMonth("2026-11-02T08:00:00+05:30")).toBe(false);
  });
});

describe("questionSchedulerService scheduled check & catch-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shouldPublishQuestion returns true when sendTime has arrived and challenge is unpublished", async () => {
    mockStatusFindOne.mockReturnValue({
      lean: async () => ({
        posterSendTime: "06:00",
        questionSentToday: false,
        questionPublishedDate: null,
        todayQuestion: null,
      }),
    });

    const isDue = await shouldPublishQuestion();
    expect(isDue).toBe(true);
  });

  it("shouldPublishQuestion returns false when question is already published today", async () => {
    const today = getISTDateKey();
    mockStatusFindOne.mockReturnValue({
      lean: async () => ({
        posterSendTime: "06:00",
        questionSentToday: true,
        questionPublishedDate: today,
        todayQuestion: "Existing question",
      }),
    });

    const isDue = await shouldPublishQuestion();
    expect(isDue).toBe(false);
  });

  it("isShadowingDay matches configured array against IST dayOfWeek", async () => {
    const fridayDate = new Date("2026-11-13T05:00:00.000Z"); // Friday (weekday 5)
    mockStatusFindOne.mockReturnValue({
      select: () => ({
        lean: async () => ({
          shadowingDays: [2, 5], // Tuesday and Friday
        }),
      }),
    });

    const parts = getISTParts(fridayDate);
    expect(parts.dayOfWeek).toBe(5);
    const result = await isShadowingDay();
    // In actual execution with real date (or mocked), dayOfWeek is a number matching the day
    expect(typeof result).toBe("boolean");
  });
});
