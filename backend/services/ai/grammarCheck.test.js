import { describe, it, expect } from "vitest";
import {
  filterGrammarErrors,
  isOnlyCapitalizationChange,
  isSttRepetitionFix,
} from "./grammarCheck.js";

describe("grammar STT filters", () => {
  it("detects capitalization-only changes", () => {
    expect(isOnlyCapitalizationChange("youtube", "YouTube")).toBe(true);
    expect(isOnlyCapitalizationChange("was very bad", "was very bad")).toBe(false);
  });

  it("detects STT repetition fixes", () => {
    expect(isSttRepetitionFix("i I", "I")).toBe(true);
    expect(isSttRepetitionFix("My last week is project plan", "My last week was a project plan")).toBe(false);
  });

  it("keeps real grammar mistakes", () => {
    const errors = filterGrammarErrors([
      { original: "youtube", correction: "YouTube", rule: "Capitalization" },
      { original: "i I", correction: "I", rule: "Word repetition" },
      { original: "My last week is project plan", correction: "My last week was a project plan", rule: "verb tense consistency" },
      { original: "I am very so bad", correction: "I was very bad", rule: "adverb placement and verb tense" },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0].original).toContain("last week");
  });
});
