import { describe, it, expect } from "vitest";
import { ensureStoryTitleHeader } from "./storyGenerator.js";

describe("ensureStoryTitleHeader", () => {
  it("should prepend 'Today's Speak and Shine story is [Topic].' if not already present", () => {
    const topic = "The Forgotten Presentation";
    const rawStory = "Rohan had prepared his slides for days...";
    const result = ensureStoryTitleHeader(topic, rawStory);

    expect(result).toBe("Today's Speak and Shine story is The Forgotten Presentation.\n\nRohan had prepared his slides for days...");
  });

  it("should not double-prepend if header is already present", () => {
    const topic = "The Forgotten Presentation";
    const existingStory = "Today's Speak and Shine story is The Forgotten Presentation.\n\nRohan had prepared his slides for days...";
    const result = ensureStoryTitleHeader(topic, existingStory);

    expect(result).toBe(existingStory);
  });

  it("should handles apostrophe variations (curly or straight)", () => {
    const topic = "The Unexpected Opportunity";
    const existingStory = "Today’s Speak and Shine story is The Unexpected Opportunity.\n\nAisha was waiting at a bus stop...";
    const result = ensureStoryTitleHeader(topic, existingStory);

    expect(result).toBe(existingStory);
  });
});
