import { describe, it, expect } from "vitest";
import {
  parseDurationToSeconds,
  cleanStoryTitle,
  parseStoryRssXml,
  findOptimalStoryWindow,
  generateScrapedStoryChallenge,
  FALLBACK_STORIES
} from "./storyFeedIngestionService.js";

describe("storyFeedIngestionService - Option A Ingestion & Processing", () => {
  describe("parseDurationToSeconds", () => {
    it("parses HH:MM:SS format correctly", () => {
      expect(parseDurationToSeconds("00:01:24")).toBe(84);
      expect(parseDurationToSeconds("01:00:00")).toBe(3600);
      expect(parseDurationToSeconds("<![CDATA[00:02:15]]>")).toBe(135);
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
    it("strips volume prefixes and author suffixes", () => {
      expect(cleanStoryTitle("Fables 05 01 - The Man and The Image by Aesop (c. 620 BCE - 564)")).toBe(
        "The Man and The Image"
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

  describe("parseStoryRssXml", () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Aesop's Fables</title>
    <item>
      <title><![CDATA[Fables 05 01 - The Fox and The Grapes by Aesop]]></title>
      <enclosure url="https://archive.org/download/sample/fox_grapes.mp3" length="123456" type="audio/mpeg" />
      <itunes:duration><![CDATA[00:01:12]]></itunes:duration>
      <description>A thirsty fox tries to reach high hanging grapes.</description>
    </item>
    <item>
      <title>Hercules and The Waggoner</title>
      <media:content url="https://archive.org/download/sample/hercules.mp3" type="audio/mpeg" />
      <itunes:duration>01:25</itunes:duration>
      <description>A cart gets stuck in the mud.</description>
    </item>
  </channel>
</rss>`;

    it("extracts episodes with audio URL, cleaned title, and duration in seconds", () => {
      const items = parseStoryRssXml(sampleXml);
      expect(items.length).toBe(2);

      expect(items[0].title).toBe("The Fox and The Grapes");
      expect(items[0].audioUrl).toBe("https://archive.org/download/sample/fox_grapes.mp3");
      expect(items[0].durationSec).toBe(72);
      expect(items[0].description).toContain("thirsty fox");

      expect(items[1].title).toBe("Hercules and The Waggoner");
      expect(items[1].audioUrl).toBe("https://archive.org/download/sample/hercules.mp3");
      expect(items[1].durationSec).toBe(85);
    });
  });

  describe("findOptimalStoryWindow", () => {
    it("strips LibriVox disclaimers and selects a 60s-120s window", () => {
      const segments = [
        { start: 0, end: 5.5, text: "This is a LibriVox recording." },
        { start: 5.5, end: 12.0, text: "All LibriVox recordings are in the public domain. For more info visit LibriVox.org." },
        { start: 12.0, end: 16.0, text: "Fables of Aesop. The Boy Who Cried Wolf." },
        { start: 16.0, end: 35.0, text: "A young shepherd boy tended his sheep near a dark forest on the hillside." },
        { start: 35.0, end: 60.0, text: "Bored one afternoon, he shouted at the top of his lungs, Wolf! Wolf! The wolf is chasing the sheep!" },
        { start: 60.0, end: 88.0, text: "The villagers came running to help him, only to find him laughing at their concern." },
        { start: 88.0, end: 104.0, text: "Later, a real wolf emerged from the forest, but when he cried out, nobody came to his aid." },
        { start: 104.0, end: 112.0, text: "End of fable. Recorded by volunteer reader." }
      ];

      const window = findOptimalStoryWindow(segments, 60, 120);

      expect(window.startTime).toBeGreaterThanOrEqual(12.0); // Disclaimers stripped
      expect(window.duration).toBeGreaterThanOrEqual(60);
      expect(window.duration).toBeLessThanOrEqual(120);
      expect(window.transcript).not.toContain("This is a LibriVox recording");
      expect(window.transcript).toContain("A young shepherd boy");
    });
  });

  describe("generateScrapedStoryChallenge fallback resilience", () => {
    it("returns complete, valid challenge structure from fallback pool", () => {
      const fallback = FALLBACK_STORIES[0];
      expect(fallback.topic).toBeDefined();
      expect(fallback.audioUrl).toMatch(/^https?:\/\//);
      expect(fallback.duration).toBeGreaterThanOrEqual(60);
      expect(fallback.duration).toBeLessThanOrEqual(120);
      expect(typeof fallback.storyTranscript).toBe("string");
      expect(fallback.storyTranscript.length).toBeGreaterThan(50);
      expect(Array.isArray(fallback.summaryGuide)).toBe(true);
      expect(fallback.summaryGuide.length).toBeGreaterThanOrEqual(3);
      expect(typeof fallback.question).toBe("string");
    });

    it("verified fallback stories all adhere to the 60-120s duration range", () => {
      for (const fallback of FALLBACK_STORIES) {
        expect(fallback.duration).toBeGreaterThanOrEqual(60);
        expect(fallback.duration).toBeLessThanOrEqual(120);
        expect(fallback.summaryGuide.length).toBeGreaterThanOrEqual(3);
        expect(fallback.vocabulary.length).toBe(3);
      }
    });
  });
});
