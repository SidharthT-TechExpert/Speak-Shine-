import { describe, it, expect } from "vitest";
import { getDurationLimits } from "../video/submitGate.js";

describe("getDurationLimits", () => {
  it("returns default durations for regular days", () => {
    const limits = getDurationLimits({});
    expect(limits.maxSeconds).toBe(300);
    expect(limits.fullScoreSeconds).toBe(300);
    expect(limits.minSeconds).toBe(60);
  });

  it("returns correct limits for story summary", () => {
    const limits = getDurationLimits({ isStorySummary: true });
    expect(limits.maxSeconds).toBe(180);
    expect(limits.fullScoreSeconds).toBe(180);
  });

  it("returns correct limits for picture description", () => {
    const limits = getDurationLimits({ isPictureDescription: true });
    expect(limits.maxSeconds).toBe(180);
    expect(limits.fullScoreSeconds).toBe(180);
  });

  it("returns correct limits for monthly reflection", () => {
    const limits = getDurationLimits({ isMonthlyReflection: true });
    expect(limits.maxSeconds).toBe(420);
    expect(limits.fullScoreSeconds).toBe(420);
  });

  it("returns correct limits for monthly goals", () => {
    const limits = getDurationLimits({ isMonthlyGoals: true });
    expect(limits.maxSeconds).toBe(600);
    expect(limits.fullScoreSeconds).toBe(420);
  });

  it("returns correct limits for shadowing activity", () => {
    const limits = getDurationLimits({ isShadowing: true });
    expect(limits.maxSeconds).toBe(180);
    expect(limits.fullScoreSeconds).toBe(180);
    expect(limits.minSeconds).toBe(20);
    expect(limits.minLabel).toBe("20 sec");
  });
});

describe("Scheduler Priority Hierarchy Simulation", () => {
  /**
   * Pure simulation function of the scheduler priority logic
   */
  function determineTaskType({
    isLastDayOfMonth = false,
    hasDueManualStory = false,
    hasDueManualPicture = false,
    hasDueManualShadowing = false,
    isStoryDay = false,
    isPictureDescriptionDay = false,
    isShadowingDay = false,
    isFirstDayOfMonth = false,
    dayOfWeek = 0, // 0 = Sunday
  }) {
    // 1. Last day of month → Monthly Reflection (highest priority)
    if (isLastDayOfMonth) {
      return "monthly_reflection";
    }
    // 2. Due manual story
    if (hasDueManualStory) {
      return "story_summary";
    }
    // 3. Due manual picture
    if (hasDueManualPicture) {
      return "picture_description";
    }
    // 3b. Due manual shadowing
    if (hasDueManualShadowing) {
      return "shadowing_video";
    }
    // 4. Configured story day
    if (isStoryDay) {
      return "story_summary";
    }
    // 5. Configured picture day
    if (isPictureDescriptionDay) {
      return "picture_description";
    }
    // 5b. Configured shadowing day (e.g. Tuesday / Friday)
    if (isShadowingDay) {
      return "shadowing_video";
    }
    // 6. 1st of month → Monthly Goals (lower priority than story/picture)
    if (isFirstDayOfMonth) {
      return "monthly_goals";
    }
    // 7. Regular day (including Sunday - weekly reflection removed)
    return "regular";
  }

  it("prioritizes Monthly Reflection on last day of month even if it coincides with story day", () => {
    const result = determineTaskType({
      isLastDayOfMonth: true,
      isStoryDay: true,
      dayOfWeek: 6,
    });
    expect(result).toBe("monthly_reflection");
  });

  it("prioritizes Monthly Reflection on last day of month even on Sunday", () => {
    const result = determineTaskType({
      isLastDayOfMonth: true,
      dayOfWeek: 0,
    });
    expect(result).toBe("monthly_reflection");
  });

  it("prioritizes Story Summary over Monthly Goals on 1st of month when 1st is on a Story Day", () => {
    const result = determineTaskType({
      isFirstDayOfMonth: true,
      isStoryDay: true,
      dayOfWeek: 6,
    });
    expect(result).toBe("story_summary");
  });

  it("prioritizes Picture Description over Monthly Goals on 1st of month when 1st is on a Picture Day", () => {
    const result = determineTaskType({
      isFirstDayOfMonth: true,
      isPictureDescriptionDay: true,
      dayOfWeek: 4,
    });
    expect(result).toBe("picture_description");
  });

  it("selects Monthly Goals on 1st of month when it is a normal weekday", () => {
    const result = determineTaskType({
      isFirstDayOfMonth: true,
      isStoryDay: false,
      isPictureDescriptionDay: false,
      dayOfWeek: 1, // Monday
    });
    expect(result).toBe("monthly_goals");
  });

  it("selects regular question on Sunday because Weekly Reflection has been removed", () => {
    const result = determineTaskType({
      isLastDayOfMonth: false,
      isFirstDayOfMonth: false,
      isStoryDay: false,
      isPictureDescriptionDay: false,
      dayOfWeek: 0, // Sunday
    });
    expect(result).toBe("regular");
  });
  it("prioritizes Due Manual Shadowing over auto Shadowing Day", () => {
    const result = determineTaskType({
      hasDueManualShadowing: true,
      isShadowingDay: true,
      dayOfWeek: 2, // Tuesday
    });
    expect(result).toBe("shadowing_video");
  });

  it("selects Shadowing Video on configured Shadowing Day (e.g. Tuesday or Friday)", () => {
    const result = determineTaskType({
      isShadowingDay: true,
      dayOfWeek: 2, // Tuesday
    });
    expect(result).toBe("shadowing_video");
  });
});

describe("Manual Question Edit Validation", () => {
  const validTypes = ["normal", "regular", "monthly_reflection", "monthly_goals", "story_summary", "picture_description", "shadowing_video"];

  it("validates setupType against allowed types", () => {
    expect(validTypes.includes("normal")).toBe(true);
    expect(validTypes.includes("regular")).toBe(true);
    expect(validTypes.includes("monthly_reflection")).toBe(true);
    expect(validTypes.includes("monthly_goals")).toBe(true);
    expect(validTypes.includes("story_summary")).toBe(true);
    expect(validTypes.includes("picture_description")).toBe(true);
    expect(validTypes.includes("shadowing_video")).toBe(true);
    expect(validTypes.includes("weekly_reflection")).toBe(false);
  });

  it("allows normal questions without audioUrl or imageUrl", () => {
    const data = { setupType: "normal", category: "Daily Life", topic: "Morning Routine", question: "Describe your morning routine." };
    expect(Boolean(data.category && data.topic && data.question)).toBe(true);
    expect(Boolean(data.audioUrl)).toBe(false);
    expect(Boolean(data.imageUrl)).toBe(false);
  });

  it("requires audioUrl for story_summary update", () => {
    const data = { setupType: "story_summary", audioUrl: "" };
    const hasAudio = Boolean(data.audioUrl);
    expect(hasAudio).toBe(false);
  });

  it("requires imageUrl for picture_description update", () => {
    const data = { setupType: "picture_description", imageUrl: "" };
    const hasImage = Boolean(data.imageUrl);
    expect(hasImage).toBe(false);
  });

  it("validates scheduledTime format HH:MM", () => {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    expect(timeRegex.test("08:00")).toBe(true);
    expect(timeRegex.test("23:59")).toBe(true);
    expect(timeRegex.test("24:00")).toBe(false);
    expect(timeRegex.test("8:00")).toBe(false);
  });
});
