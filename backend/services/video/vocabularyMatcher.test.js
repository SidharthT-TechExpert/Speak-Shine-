import { describe, it, expect } from "vitest";
import { matchVocabularyInTranscript } from "./submitGate.js";

describe("matchVocabularyInTranscript", () => {
  const sampleVocab = [
    { word: "collaborate", meaning: "work together" },
    { word: "resilience", meaning: "ability to recover" },
    { word: "self-discipline", meaning: "control over actions" },
    { word: "strategy", meaning: "plan of action" },
    { word: "articulate", meaning: "speak clearly" },
    { word: "time management", meaning: "manage time" },
  ];

  it("should match exact words", () => {
    const transcript = "We must collaborate and articulate our strategy clearly.";
    const matches = matchVocabularyInTranscript(transcript, sampleVocab);
    expect(matches).toContain("collaborate");
    expect(matches).toContain("articulate");
    expect(matches).toContain("strategy");
    expect(matches.length).toBe(3);
  });

  it("should match verb tenses and gerunds (-ed, -ing, -s)", () => {
    const transcript = "Yesterday we collaborated with the team and were articulating several new ideas.";
    const matches = matchVocabularyInTranscript(transcript, sampleVocab);
    expect(matches).toContain("collaborate");
    expect(matches).toContain("articulate");
  });

  it("should match irregular word variants (resilient <-> resilience, strategies <-> strategy)", () => {
    const transcript = "She has a very resilient mindset and used different strategies to succeed.";
    const matches = matchVocabularyInTranscript(transcript, sampleVocab);
    expect(matches).toContain("resilience");
    expect(matches).toContain("strategy");
  });

  it("should match hyphenated vs spaced multi-word phrases", () => {
    const transcript = "His self discipline and good time-management helped him pass.";
    const matches = matchVocabularyInTranscript(transcript, sampleVocab);
    expect(matches).toContain("self-discipline");
    expect(matches).toContain("time management");
  });

  it("should support array of plain strings as well as objects", () => {
    const stringVocab = ["innovative", "persevere", "adaptability"];
    const transcript = "They created an innovation and persevered through hardship.";
    const matches = matchVocabularyInTranscript(transcript, stringVocab);
    expect(matches).toContain("innovative");
    expect(matches).toContain("persevere");
  });

  it("should tolerate minor speech-to-text slips (Levenshtein distance <= 1)", () => {
    const transcript = "We showed great colaboration and reached our goal.";
    const matches = matchVocabularyInTranscript(transcript, sampleVocab);
    expect(matches).toContain("collaborate");
  });

  it("should match English conversational expressions with trailing ellipsis and punctuation", () => {
    const expressions = [
      { expression: "What I find interesting is...", meaning: "Introduce something interesting" },
      { expression: "To be completely honest...", meaning: "Share candid opinion" },
      { expression: "On top of that...", meaning: "Add extra point" },
      { expression: "At the end of the day...", meaning: "Concluding thought" },
    ];
    const transcript = "What I find interesting is that technology connects us all. To be completely honest, I used to struggle with speaking, but on top of that, daily practice made a difference. At the end of the day, consistency wins.";
    const matches = matchVocabularyInTranscript(transcript, expressions);
    expect(matches).toContain("What I find interesting is...");
    expect(matches).toContain("To be completely honest...");
    expect(matches).toContain("On top of that...");
    expect(matches).toContain("At the end of the day...");
    expect(matches.length).toBe(4);
  });

  it("should match expressions with contractions and conversational fillers", () => {
    const expressions = [
      { expression: "What I find interesting is...", meaning: "Introduce something interesting" },
      { expression: "It turned out that...", meaning: "Reveal result" },
    ];
    const transcript = "What I really find interesting is how much we learn each day, and it's turned out that small habits matter most.";
    const matches = matchVocabularyInTranscript(transcript, expressions);
    expect(matches).toContain("What I find interesting is...");
    expect(matches).toContain("It turned out that...");
  });

  it("should match expressions spoken with long pauses and hesitation fillers (um, uh)", () => {
    const expressions = [
      { expression: "From where I stand, I think...", meaning: "Personal viewpoint" },
      { expression: "What I find interesting is...", meaning: "Introduce something interesting" },
    ];
    // Long pauses indicated by ellipses/commas and hesitation sounds
    const transcript = "Well... from where... um... I stand... uh... I think we made the right choice. Also, what I... like... find interesting is the result.";
    const matches = matchVocabularyInTranscript(transcript, expressions);
    expect(matches).toContain("From where I stand, I think...");
    expect(matches).toContain("What I find interesting is...");
    expect(matches.length).toBe(2);
  });

  it("should tolerate phonetic Whisper homophone slips due to audio quality (wear vs where, to vs too)", () => {
    const expressions = [
      { expression: "From where I stand, I think...", meaning: "Personal viewpoint" },
    ];
    // Whisper transcribed 'where' as 'wear' due to acoustic ambiguity/background noise
    const transcript = "From wear I stand, I think the solution is straightforward.";
    const matches = matchVocabularyInTranscript(transcript, expressions);
    expect(matches).toContain("From where I stand, I think...");
  });
});
