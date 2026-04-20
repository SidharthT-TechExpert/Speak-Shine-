import { downloadVideo } from "./downloadVideo.js";
import { extractAudio } from "./extractAudio.js";
import { transcribe } from "./transcribe.js";
import { analyzeSpeech } from "./analyzeSpeech.js";
import fs from "fs";

/**
 * Generates detailed AI feedback for a spoken English video submission.
 *
 * @param {object} msg - WhatsApp message object
 * @param {string} user - User JID (e.g. "919876543210@s.whatsapp.net")
 * @param {number} durationSeconds - Video duration in seconds
 * @param {string|null} questionTopic - Today's speaking topic (optional, for relevance check)
 */
export async function generateFeedback(msg, user, durationSeconds, questionTopic = null) {
  const id = Date.now();
  let videoPath, audioPath;

  try {
    // 1. Download video
    videoPath = await downloadVideo(msg, id);

    // 2. Extract audio
    audioPath = await extractAudio(videoPath, id);

    // 3. Transcribe with verbose_json (word timestamps + duration)
    const transcription = await transcribe(audioPath);

    if (!transcription.text || transcription.text.length < 10) {
      return "⚠️ _Could not detect speech in the video._";
    }

    // Use Whisper's actual spoken duration if available, fall back to video duration
    const actualDuration = transcription.duration > 0
      ? transcription.duration
      : durationSeconds;

    // 4. Analyze with rich prompt + real stats
    const result = await analyzeSpeech(
      transcription.text,
      actualDuration,
      transcription.words,
      questionTopic
    );

    // 5. Format the feedback message
    return formatFeedback(result, user);

  } finally {
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
}

/**
 * Formats the analysis result into a WhatsApp-friendly message.
 */
function formatFeedback(result, user) {
  const username = user.split("@")[0];
  const s = result._stats;

  // --- Header ---
  let msg = `🎤 *Video Feedback for @${username}*\n\n`;

  // --- Audio Stats ---
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `⏱️ *Duration:* ${s.duration}`;
  if (s.wpm) {
    const paceLabel = s.wpm < 100 ? "🐢 Slow" : s.wpm <= 150 ? "✅ Good" : "⚡ Fast";
    msg += `  |  📊 *Pace:* ${s.wpm} wpm ${paceLabel}`;
  }
  msg += `\n`;

  // Filler words line
  if (s.fillerTotal > 0) {
    const fillerList = Object.entries(s.fillerWords)
      .map(([w, c]) => `"${w}" ×${c}`)
      .join(", ");
    msg += `🗣️ *Filler words:* ${fillerList}\n`;
  }

  // Pauses line
  if (s.pauses > 0) {
    msg += `🔇 *Long pauses:* ${s.pauses} detected\n`;
  }

  // --- Scores ---
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `🗣️ *Fluency:*    ${scoreBar(result.fluency)} ${result.fluency}/10\n`;
  msg += `📚 *Grammar:*    ${scoreBar(result.grammar)} ${result.grammar}/10\n`;
  msg += `🔥 *Confidence:* ${scoreBar(result.confidence)} ${result.confidence}/10\n`;
  msg += `🧠 *Vocabulary:* ${scoreBar(result.vocabulary)} ${result.vocabulary}/10\n`;

  if (result.topicRelevance != null) {
    msg += `🎯 *On-topic:*   ${scoreBar(result.topicRelevance)} ${result.topicRelevance}/10\n`;
  }

  // --- Grammar Errors ---
  if (result.grammarErrors && result.grammarErrors.length > 0) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `❌ *Grammar Issues:*\n`;
    for (const e of result.grammarErrors) {
      msg += `  • _"${e.original}"_ → *"${e.correction}"*\n`;
      if (e.rule) msg += `    _(${e.rule})_\n`;
    }
  }

  // --- Strong Points ---
  if (result.strongPoints && result.strongPoints.length > 0) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `✅ *What you did well:*\n`;
    for (const point of result.strongPoints) {
      msg += `  • ${point}\n`;
    }
  }

  // --- Vocabulary Highlights ---
  const voc = result.vocabularyHighlights;
  if (voc) {
    if (voc.strong && voc.strong.length > 0) {
      msg += `━━━━━━━━━━━━━━━\n`;
      msg += `💎 *Good vocabulary used:* ${voc.strong.join(", ")}\n`;
    }
    if (voc.weak && voc.weak.length > 0) {
      msg += `📖 *Words to upgrade:* ${voc.weak.join(", ")}\n`;
    }
  }

  // --- Suggestions ---
  if (result.suggestions && result.suggestions.length > 0) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `💡 *Suggestions:*\n`;
    for (const tip of result.suggestions) {
      msg += `  • ${tip}\n`;
    }
  }

  // --- Overall Comment ---
  if (result.overallComment) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `📝 ${result.overallComment}`;
  }

  return msg;
}

/**
 * Returns a simple visual score bar using emoji blocks.
 * e.g. score 7 → "🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜"
 */
function scoreBar(score) {
  const filled = Math.round(score);
  const empty = 10 - filled;
  return "🟩".repeat(filled) + "⬜".repeat(empty);
}
