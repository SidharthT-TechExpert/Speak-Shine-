import { describe, it, expect } from "vitest";
import {
  filterGrammarErrors,
  isOnlyCapitalizationChange,
  isSttRepetitionFix,
  isSpokenHomophoneOrPunctuationNoise,
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

  it("detects spoken homophones and apostrophe-only changes", () => {
    expect(isSpokenHomophoneOrPunctuationNoise("it's", "its")).toBe(true);
    expect(isSpokenHomophoneOrPunctuationNoise("its", "it's")).toBe(true);
    expect(isSpokenHomophoneOrPunctuationNoise("they're", "their")).toBe(true);
    expect(isSpokenHomophoneOrPunctuationNoise("there", "their")).toBe(true);
    expect(isSpokenHomophoneOrPunctuationNoise("you're", "your")).toBe(true);
    expect(isSpokenHomophoneOrPunctuationNoise("calm", "calms")).toBe(false);
    expect(isSpokenHomophoneOrPunctuationNoise("hearing", "hear")).toBe(false);
  });

  it("keeps real grammar mistakes and rejects STT homophone/apostrophe noise", () => {
    const errors = filterGrammarErrors([
      { original: "youtube", correction: "YouTube", rule: "Capitalization" },
      { original: "i I", correction: "I", rule: "Word repetition" },
      { original: "it's", correction: "its", rule: "Did you mean 'its' (possessive pronoun) instead of 'it's'?" },
      { original: "they're", correction: "their", rule: "Confused word" },
      { original: "the everyone", correction: "the", rule: "Using a determiner and a pronoun together is incorrect." },
      { original: "i not hearing lot of english song", correction: "I do not hear many English songs", rule: "verb form, article usage" },
      { original: "calm", correction: "calms", rule: "Possible agreement error" },
      { original: "My last week is project plan", correction: "My last week was a project plan", rule: "verb tense consistency" },
    ]);
    expect(errors).toHaveLength(3);
    expect(errors[0].original).toBe("i not hearing lot of english song");
    expect(errors[1].original).toBe("calm");
    expect(errors[2].original).toBe("My last week is project plan");
  });
});
