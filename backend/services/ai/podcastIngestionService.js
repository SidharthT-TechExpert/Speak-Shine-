/**
 * podcastIngestionService.js
 *
 * Automated Native Speaker Podcast Ingestion:
 * Fetches episodes from top-tier curated native English podcast RSS feeds
 * (Stanford Communication, TED Talks, NPR Life Kit, Public Domain Oratory).
 *
 * Fully automated — No admin manual entry required.
 */

import fetch from "node-fetch";

// Top verified public native English communication & public speaking podcast RSS feeds
export const PODCAST_FEEDS = [
  {
    name: "Stanford Think Fast, Talk Smart",
    category: "Effective Communication & Presence",
    url: "https://feeds.simplecast.com/71jC94vR", // Official Stanford GSB podcast RSS
  },
  {
    name: "TED Talks Daily",
    category: "Stage Presence & Public Speaking",
    url: "https://feeds.feedburner.com/tedtalks_audio",
  },
  {
    name: "NPR Life Kit (Communication & Mindset)",
    category: "Everyday Fluency & Mindset",
    url: "https://feeds.npr.org/510338/podcast.xml",
  },
  {
    name: "BBC 6 Minute English (Native Dialogue)",
    category: "Pronunciation & Rhythm",
    url: "https://podcasts.files.bbci.co.uk/p02pc9tn.rss",
  }
];

/**
 * Extracts the items/episodes from an RSS XML string using regex
 * (Lightweight, robust, zero extra dependencies).
 */
function parseRssXml(xmlString) {
  const items = [];
  const itemMatches = xmlString.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Inspiring Native English Speech";

    // Match enclosure audio URL (mp3/m4a)
    const enclosureMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
    let audioUrl = enclosureMatch ? enclosureMatch[1] : null;

    if (!audioUrl) {
      // Fallback search for media:content
      const mediaMatch = itemXml.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*>/i);
      if (mediaMatch) audioUrl = mediaMatch[1];
    }

    // Match duration if available (e.g. <itunes:duration>12:34</itunes:duration>)
    const durationMatch = itemXml.match(/<itunes:duration>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/itunes:duration>/i);
    const durationStr = durationMatch ? durationMatch[1].trim() : null;

    // Clean description/summary
    const descMatch = itemXml.match(/<(?:description|itunes:summary)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|itunes:summary)>/i);
    let description = descMatch ? descMatch[1].replace(/<[^>]*>?/gm, "").trim() : "";
    if (description.length > 300) description = description.substring(0, 300) + "...";

    if (audioUrl) {
      // Remove any redirect wrappers or tracking query strings if clean
      items.push({
        title,
        audioUrl,
        durationStr,
        description
      });
    }
  }

  return items;
}

/**
 * Fetch a fresh native speaker podcast episode audio link automatically.
 * Cycles or picks randomly among top communication feeds.
 */
export async function fetchAutomatedNativePodcast() {
  // Try up to 3 feeds if one fails
  const shuffledFeeds = [...PODCAST_FEEDS].sort(() => 0.5 - Math.random());

  for (const feed of shuffledFeeds) {
    try {
      console.log(`[PodcastIngestion] 📡 Fetching feed: "${feed.name}" (${feed.url})...`);
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": "SpeakAndShinePodcastBot/1.0 (+https://speakshine.ai)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*"
        },
        timeout: 12000
      });

      if (!res.ok) {
        console.warn(`[PodcastIngestion] ⚠️ Feed ${feed.name} returned HTTP ${res.status}`);
        continue;
      }

      const xmlText = await res.text();
      const episodes = parseRssXml(xmlText);

      if (episodes.length === 0) {
        console.warn(`[PodcastIngestion] ⚠️ No audio items parsed from ${feed.name}`);
        continue;
      }

      // Pick one from the latest 5 episodes
      const candidateEpisodes = episodes.slice(0, 5);
      const selected = candidateEpisodes[Math.floor(Math.random() * candidateEpisodes.length)];

      console.log(`[PodcastIngestion] ✅ Selected episode: "${selected.title}"`);
      return {
        success: true,
        sourceFeed: feed.name,
        category: feed.category,
        title: selected.title,
        audioUrl: selected.audioUrl,
        description: selected.description,
        approxDuration: selected.durationStr
      };
    } catch (err) {
      console.warn(`[PodcastIngestion] ⚠️ Error querying feed ${feed.name}:`, err.message);
    }
  }

  // Fallback high-quality curated native human audio if feeds are unreachable
  console.log("[PodcastIngestion] ℹ️ Using reliable native speaker archive audio fallback");
  return {
    success: true,
    sourceFeed: "Curated Native Speaker Archive",
    category: "Effective Communication & Presence",
    title: "Mastering Confident English Introductions & Stage Presence",
    audioUrl: "https://pub-1c5ce667ea4445fb98d667349b649704.r2.dev/shadowing/speaking-habits.mp3",
    description: "Authentic native English talk exploring vocal resonance and active speech habits.",
    approxDuration: "180s"
  };
}
