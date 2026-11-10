import { describe, it, expect } from "vitest";
import {
  parseDurationToSeconds,
  cleanStoryTitle,
  cleanNarrativeTranscript,
  parseStoryRssXml,
  isIntroOrDisclaimerSegment,
  isOutroSegment,
  findOptimalStoryWindow,
  FALLBACK_STORIES
} from "./storyFeedIngestionService.js";

describe("storyFeedIngestionService - Option A Precision Slicing & Intro Trimming", () => {
  describe("parseDurationToSeconds", () => {
    it("parses HH:MM:SS format correctly even with CDATA and whitespace", () => {
      expect(parseDurationToSeconds("00:01:24")).toBe(84);
      expect(parseDurationToSeconds("01:00:00")).toBe(3600);
      expect(parseDurationToSeconds("\n    <![CDATA[00:01:41]]>\n  ")).toBe(101);
    });

    it("parses MM:SS format correctly", () => {
      expect(parseDurationToSeconds("01:15")).toBe(75);
      expect(parseDurationToSeconds("02:00")).toBe(120);
    });

    it("parses integer seconds string", () => {
      expect(parseDurationToSeconds("90")).toBe(90);
    });

    it("handles invalid or null inputs gracefully", () => {
      expect(parseDurationToSeconds(null)).toBeNull();
      expect(parseDurationToSeconds("")).toBeNull();
      expect(parseDurationToSeconds("invalid:time:format:extra")).toBeNull();
    });
  });

  describe("cleanStoryTitle", () => {
    it("strips volume prefixes, author suffixes, and narrator intro headers", () => {
      expect(cleanStoryTitle("Today's reading by Will McCoy. Aesop's Fables. The Trumpeter Taken Prisoner.")).toBe(
        "The Trumpeter Taken Prisoner"
      );
      expect(cleanStoryTitle("Fables 05 01 - The Cat and The Cock by Aesop (c. 620 BCE - 564)")).toBe(
        "The Cat and The Cock"
      );
      expect(cleanStoryTitle("Episode 12 - Hercules and The Waggoner by Aesop")).toBe(
        "Hercules and The Waggoner"
      );
      expect(cleanStoryTitle("The Bundle of Sticks (Aesop's Fables)")).toBe(
        "The Bundle of Sticks"
      );
    });

    it("handles null or empty titles", () => {
      expect(cleanStoryTitle(null)).toBe("Classic English Short Story");
      expect(cleanStoryTitle("")).toBe("Classic English Short Story");
    });
  });

  describe("cleanNarrativeTranscript", () => {
    it("removes narrator introduction and outro from transcript", () => {
      const rawText = "Today's reading by Will McCoy. Aesop's Fables. The Trumpeter Taken Prisoner. A trumpeter marched into battle in the van of the army, and put courage into his comrades by his warlike tunes. Being captured by the enemy, he begged for his life, and said, Do not put me to death, I have killed no one. Indeed, I have no weapons, but carry with me only my trumpet here. But his captors replied, That is only the more reason why we should take your life, for though you do not fight yourself, you stir up others to do so. End of The Trumpeter Taken Prisoner";
      const clean = cleanNarrativeTranscript(rawText, "The Trumpeter Taken Prisoner");

      expect(clean).not.toContain("Today's reading by");
      expect(clean).not.toContain("Aesop's Fables");
      expect(clean).not.toContain("End of The Trumpeter");
      expect(clean.startsWith("A trumpeter marched into battle")).toBe(true);
      expect(clean.endsWith("stir up others to do so.")).toBe(true);
    });

    it("removes LibriVox 21-second disclaimer and outro", () => {
      const rawText = "This is a LibriVox recording. All LibriVox recordings are in the public domain. For more information or to volunteer, please visit librivox.org. Recorded by Christine Deuer, Thonotosassa Florida. Aesop's Fables. The Cat and the Cock. A cat pounced on a cock and cast about for some good excuse for making a meal of him. The want of a good excuse never kept a villain from crime. End of The Cat and the Cock.";
      const clean = cleanNarrativeTranscript(rawText, "The Cat and the Cock");

      expect(clean).not.toContain("LibriVox");
      expect(clean).not.toContain("Christine Deuer");
      expect(clean).not.toContain("End of The Cat");
      expect(clean.startsWith("A cat pounced on a cock")).toBe(true);
      expect(clean.endsWith("never kept a villain from crime.")).toBe(true);
    });
  });

  describe("isIntroOrDisclaimerSegment & isOutroSegment", () => {
    it("detects intro and disclaimer phrases", () => {
      expect(isIntroOrDisclaimerSegment("This is a LibriVox recording.")).toBe(true);
      expect(isIntroOrDisclaimerSegment("Recorded by Christine Deuer, Florida.")).toBe(true);
      expect(isIntroOrDisclaimerSegment("Today's reading by Will McCoy.")).toBe(true);
      expect(isIntroOrDisclaimerSegment("Aesop's Fables.")).toBe(true);
      expect(isIntroOrDisclaimerSegment("The Cat and the Cock", "The Cat and the Cock")).toBe(true);
      expect(isIntroOrDisclaimerSegment("A cat pounced on a cock.")).toBe(false);
    });

    it("detects outro phrases", () => {
      expect(isOutroSegment("End of The Trumpeter Taken Prisoner")).toBe(true);
      expect(isOutroSegment("End of The Cat and the Cock.")).toBe(true);
      expect(isOutroSegment("Recorded by volunteer reader.")).toBe(true);
      expect(isOutroSegment("The want of a good excuse never kept a villain from crime.")).toBe(false);
    });
  });

  describe("parseStoryRssXml", () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Aesop's Fables</title>
    <item>
      <title><![CDATA[Fables 05 01 - The Fox and The Grapes by Aesop]]></title>
      <enclosure url="https://archive.org/download/sample/fox_grapes.mp3" length="123456" type="audio/mpeg" />
      <itunes:duration>
        <![CDATA[00:01:45]]>
      </itunes:duration>
      <description>A thirsty fox tries to reach high hanging grapes.</description>
    </item>
    <item>
      <title>Hercules and The Waggoner</title>
      <media:content url="https://archive.org/download/sample/hercules.mp3" type="audio/mpeg" />
      <itunes:duration>
        <![CDATA[00:01:41]]>
      </itunes:duration>
      <description>A cart gets stuck in the mud.</description>
    </item>
  </channel>
</rss>`;

    it("extracts episodes with audio URL, cleaned title, and parsed duration in seconds", () => {
      const items = parseStoryRssXml(sampleXml);
      expect(items.length).toBe(2);

      expect(items[0].title).toBe("The Fox and The Grapes");
      expect(items[0].audioUrl).toBe("https://archive.org/download/sample/fox_grapes.mp3");
      expect(items[0].durationSec).toBe(105);

      expect(items[1].title).toBe("Hercules and The Waggoner");
      expect(items[1].audioUrl).toBe("https://archive.org/download/sample/hercules.mp3");
      expect(items[1].durationSec).toBe(101);
    });
  });

  describe("findOptimalStoryWindow", () => {
    it("strips 21s LibriVox intro & outro, starting cleanly on the story", () => {
      const segments = [
        { start: 0.0, end: 2.5, text: "This is a LibriVox recording." },
        { start: 2.5, end: 6.0, text: "All LibriVox recordings are in the public domain." },
        { start: 6.0, end: 11.0, text: "For more information or to volunteer, please visit librivox.org." },
        { start: 11.0, end: 16.0, text: "Recorded by Christine Deuer, Thonotosassa Florida." },
        { start: 16.0, end: 18.0, text: "Aesop's Fables." },
        { start: 18.0, end: 21.0, text: "The Cat and the Cock." },
        { start: 21.0, end: 35.0, text: "A cat pounced on a cock and cast about for some good excuse for making a meal of him." },
        { start: 35.0, end: 50.0, text: "At last she said, You make a great nuisance of yourself at night by crowing." },
        { start: 50.0, end: 62.0, text: "The cock defended himself, but the cat said she was not going without dinner." },
        { start: 62.0, end: 67.5, text: "The want of a good excuse never kept a villain from crime." },
        { start: 67.5, end: 71.0, text: "End of The Cat and the Cock." }
      ];

      const window = findOptimalStoryWindow(segments, 90, "The Cat and the Cock");

      expect(window.startTime).toBeCloseTo(21.0, 0); // Intro cut!
      expect(window.endTime).toBeCloseTo(67.5, 0); // Outro cut!
      expect(window.duration).toBe(Math.round(67.5 - 21.0));
      expect(window.transcript).not.toContain("LibriVox");
      expect(window.transcript).not.toContain("End of The Cat");
      expect(window.transcript.startsWith("A cat pounced on a cock")).toBe(true);
    });
  });

  describe("FALLBACK_STORIES verification", () => {
    it("all fallback stories have durations between 75s and 95s and clean transcripts", () => {
      for (const fallback of FALLBACK_STORIES) {
        expect(fallback.duration).toBeGreaterThanOrEqual(75);
        expect(fallback.duration).toBeLessThanOrEqual(95);
        expect(fallback.summaryGuide.length).toBeGreaterThanOrEqual(3);
        expect(fallback.vocabulary.length).toBe(3);
        expect(fallback.storyTranscript).not.toContain("LibriVox");
        expect(fallback.storyTranscript).not.toContain("End of");
      }
    });
  });
});
