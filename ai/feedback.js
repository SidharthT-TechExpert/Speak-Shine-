import { downloadVideo } from "./downloadVideo.js";
import { extractAudio } from "./extractAudio.js";
import { transcribe } from "./transcribe.js";
import { analyzeSpeech } from "./analyzeSpeech.js";
import { analyzeVideo } from "./analyzeVideo.js";
import {
  withTimeout,
  startStage,
  TRANSCRIBE_TIMEOUT_MS,
  SPEECH_TIMEOUT_MS,
  VISUAL_TIMEOUT_MS,
} from "./pipeline.js";
import { getTextKey, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";
import fs from "fs";

/**
 * Generates detailed AI feedback for a spoken English video submission.
 * Runs audio analysis (Groq Whisper + Llama) and visual analysis (Gemini Vision) in parallel.
 *
 * @param {object}      msg              - WhatsApp message object
 * @param {string}      user             - User JID (e.g. "919876543210@s.whatsapp.net")
 * @param {number}      durationSeconds  - Video duration in seconds
 * @param {string|null} questionTopic    - Today's speaking topic (optional, for relevance check)
 * @param {string|null} questionText     - Full question text (optional)
 * @param {object|null} sock             - Baileys socket (for media re-fetch)
 * @param {object}      [opts]
 * @param {Function}    [opts.onProgress]         - async (stage: string) => void
 * @param {number}      [opts.transcribeTimeout]  - default TRANSCRIBE_TIMEOUT_MS (60 000)
 * @param {number}      [opts.speechTimeout]      - default SPEECH_TIMEOUT_MS (45 000)
 * @param {number}      [opts.visualTimeout]      - default VISUAL_TIMEOUT_MS (45 000)
 */
export async function generateFeedback(
  msg,
  user,
  durationSeconds,
  questionTopic = null,
  questionText = null,
  sock = null,
  opts = {}
) {
  const {
    onProgress = () => {},
    transcribeTimeout = TRANSCRIBE_TIMEOUT_MS,
    speechTimeout = SPEECH_TIMEOUT_MS,
    visualTimeout = VISUAL_TIMEOUT_MS,
    displayName = null,
  } = opts;

  const pipelineStart = Date.now();
  const id = Date.now();
  let videoPath, audioPath, qualityWarning, meanVolume;

  try {
    // -----------------------------------------------------------------------
    // Stage 1: Download video
    // -----------------------------------------------------------------------
    const downloadStage = startStage("download");
    try {
      videoPath = await downloadVideo(msg, id, sock);
      downloadStage.end();
    } catch (err) {
      downloadStage.end(err);
      throw err;
    }

    await onProgress("Extracting audio…");

    // -----------------------------------------------------------------------
    // Stage 2: Extract audio
    // -----------------------------------------------------------------------
    const extractStage = startStage("extractAudio");
    try {
      const extracted = await extractAudio(videoPath, id);
      audioPath = extracted.audioPath;
      qualityWarning = extracted.qualityWarning;
      meanVolume = extracted.meanVolume ?? null;
      extractStage.end();
    } catch (err) {
      extractStage.end(err);
      throw err;
    }

    await onProgress("Analysing your video…");

    // -----------------------------------------------------------------------
    // Stage 3: Overlapped pipeline
    //
    // Visual analysis and transcription run in parallel (as before).
    // But now: as soon as transcription finishes, analyzeSpeech starts
    // immediately — it no longer waits for visual to complete.
    //
    // Timeline:
    //   extractAudio ──┬── transcribe ──── analyzeSpeech ──┐
    //                  └── analyzeVideo ───────────────────┴── format
    // -----------------------------------------------------------------------
    const parallelStage = startStage("parallel");

    // Visual runs fully in the background — result collected at the end
    const visualPromise = withTimeout(
      analyzeVideo(videoPath),
      visualTimeout,
      "visual"
    );

    // Transcription → speech analysis chained: speech starts the moment
    // transcription resolves, without waiting for visual
    let transcription = null;
    let speechResult = null;
    let transcriptionError = null;

    const speechChainPromise = withTimeout(
      transcribe(audioPath, { meanVolume }),
      transcribeTimeout,
      "transcription"
    ).then(async (t) => {
      transcription = t;

      if (!t.text || t.text.length < 10) return; // caught below

      const actualDuration = t.duration > 0 ? t.duration : durationSeconds;
      await onProgress("Scoring your speech…");

      const speechStage = startStage("analyzeSpeech");
      try {
        speechResult = await withTimeout(
          analyzeSpeech(
            t.text,
            actualDuration,
            t.words,
            questionTopic,
            questionText,
            t.pronunciationIssues || [],
            t.rhythm || null
          ),
          speechTimeout,
          "speech"
        );
        speechStage.end();
      } catch (err) {
        speechStage.end(err);
        throw err;
      }
    }).catch((err) => {
      transcriptionError = err;
    });

    // Wait for both chains to finish
    const [, visualSettled] = await Promise.all([
      speechChainPromise,
      visualPromise.then(v => ({ status: "fulfilled", value: v }))
                   .catch(e => ({ status: "rejected", reason: e })),
    ]);

    parallelStage.end();

    // Resolve visual result
    let visual = null;
    if (visualSettled.status === "fulfilled") {
      visual = visualSettled.value;
    } else {
      console.log("⚠️ Visual analysis error (non-fatal):", visualSettled.reason?.message ?? String(visualSettled.reason));
    }
    console.log("🎨 Visual analysis result:", visual ? JSON.stringify(visual).slice(0, 200) : "null/failed");

    // Handle transcription/speech failures
    if (transcriptionError) {
      console.log("[PIPELINE] transcription/speech FAIL elapsed=" + (Date.now() - pipelineStart), "error=" + (transcriptionError?.message ?? String(transcriptionError)));
      if (visual === null) {
        console.log("[PIPELINE] total failure elapsed=" + (Date.now() - pipelineStart));
        return "⚠️ _Sorry, we could not analyse your video. Please try resubmitting — if the problem persists, the service may be temporarily unavailable._";
      }
      return "⚠️ _The transcription service is currently unavailable. Please try resubmitting your video._";
    }

    if (!transcription || !transcription.text || transcription.text.length < 10) {
      return "⚠️ _Could not detect speech in the video._";
    }

    if (!speechResult) {
      return "⚠️ _The scoring service is currently unavailable. Please try resubmitting your video._";
    }

    // -----------------------------------------------------------------------
    // Stage 4: Synthesize overallComment from speech + visual
    // Now that both halves are done, generate one unified comment that
    // covers speech quality AND visual presence together.
    // -----------------------------------------------------------------------
    speechResult.overallComment = await synthesizeOverallComment(speechResult, visual);

    // -----------------------------------------------------------------------
    // Stage 5: Format combined feedback
    // -----------------------------------------------------------------------
    const formatted = formatFeedback(speechResult, visual, user, qualityWarning, displayName);

    console.log(
      "[PIPELINE] total DONE elapsed=" + (Date.now() - pipelineStart)
    );

    return formatted;
  } finally {
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
}

/**
 * Synthesizes a single overallComment from speech scores + visual scores.
 * Called after both pipelines complete so it can reference both halves.
 * Falls back to the existing speech-only comment if the API call fails.
 *
 * @param {object}      speechResult  - analyzeSpeech result
 * @param {object|null} visual        - analyzeVideo result, or null
 * @returns {Promise<string>}
 */
async function synthesizeOverallComment(speechResult, visual) {
  const existing = speechResult.overallComment || "";

  // Build a compact summary of all scores for the prompt
  const speechSummary = [
    `Fluency: ${speechResult.fluency}/10`,
    `Grammar: ${speechResult.grammar}/10`,
    `Confidence: ${speechResult.confidence}/10`,
    `Vocabulary: ${speechResult.vocabulary}/10`,
    speechResult._stats?.wpm ? `Pace: ${speechResult._stats.wpm} wpm` : null,
    speechResult._stats?.fillerTotal > 0 ? `Filler words: ${speechResult._stats.fillerTotal} total` : null,
    speechResult.topicRelevance != null ? `Topic relevance: ${speechResult.topicRelevance}/10` : null,
    speechResult._stats?.cefrLevel ? `CEFR level: ${speechResult._stats.cefrLevel.level}` : null,
  ].filter(Boolean).join(", ");

  const visualSummary = visual ? [
    `Eye contact: ${visual.eyeContact}/10`,
    `Body language: ${visual.bodyLanguage}/10`,
    `Facial expression: ${visual.facialExpression}/10`,
    `Overall presence: ${visual.overallPresence}/10`,
    visual.eyeContactNote ? `Eye contact note: ${visual.eyeContactNote}` : null,
    visual.bodyLanguageNote ? `Body language note: ${visual.bodyLanguageNote}` : null,
  ].filter(Boolean).join(", ") : null;

  const strongPoints = (speechResult.strongPoints || []).slice(0, 2).join("; ");
  const topSuggestion = (speechResult.suggestions || [])[0] || "";

  const prompt = `You are an encouraging English speaking coach. Write a 2-3 sentence overall comment for a student's video submission.

Speech analysis: ${speechSummary}
${visualSummary ? `Visual presence: ${visualSummary}` : "Visual analysis: not available"}
${strongPoints ? `Key strengths: ${strongPoints}` : ""}
${topSuggestion ? `Top improvement area: ${topSuggestion}` : ""}
${existing ? `Draft comment (improve this): ${existing}` : ""}

Rules:
- Mention BOTH speech quality AND visual presence if visual data is available
- Be specific — reference actual scores or observations, not generic praise
- End with one concrete actionable encouragement
- 2-3 sentences max, warm and motivating tone
- Return ONLY the comment text, no quotes, no labels`;

  try {
    while (true) {
      const apiKey = getTextKey();
      if (!apiKey) {
        console.log("[OverallComment] No API keys — using existing comment");
        return existing;
      }

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          max_tokens: 200,
        }),
      });

      if (res.status === 429) {
        const errText = await res.text();
        markKeyExhausted(apiKey, parseRetryAfter(errText) || undefined);
        continue;
      }

      if (!res.ok) {
        console.log("[OverallComment] API error — using existing comment");
        return existing;
      }

      const data = await res.json();
      const comment = data?.choices?.[0]?.message?.content?.trim();
      if (comment && comment.length > 10) {
        console.log("[OverallComment] synthesized:", comment.slice(0, 100));
        return comment;
      }
      return existing;
    }
  } catch (err) {
    console.log("[OverallComment] failed (using existing):", err.message);
    return existing;
  }
}

/**
 * Formats the combined audio + visual analysis into a WhatsApp-friendly message.
 *
 * @param {object}      result  - analyzeSpeech result (with _stats)
 * @param {object|null} visual  - analyzeVideo result, or null if unavailable
 * @param {string}      user    - User JID
 * @returns {string}
 */
export function formatFeedback(result, visual, user, qualityWarning = null, displayName = null) {
  const username = displayName || user.split("@")[0].split(":")[0];
  const s = result._stats;

  // --- Header ---
  const submittedAt = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "numeric",
    month: "short",
  });
  let msg = `🎤 *Video Feedback for @${username}*\n🕐 _Submitted at ${submittedAt}_\n\n`;

  // --- Audio Stats ---
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `⏱️ *Duration:* ${s.duration}`;
  if (s.wpm) {
    const paceLabel =
      s.wpm < 100 ? "🐢 Slow" : s.wpm <= 150 ? "✅ Good" : "⚡ Fast";
    msg += `  |  📊 *Pace:* ${s.wpm} wpm ${paceLabel}`;
  }
  msg += `\n`;

  if (s.fillerTotal > 0) {
    const fillerList = Object.entries(s.fillerWords)
      .map(([w, c]) => `"${w}" ×${c}`)
      .join(", ");
    msg += `🗣️ *Filler words:* ${fillerList}\n`;
  }

  if (s.pauses > 0) {
    msg += `🔇 *Long pauses:* ${s.pauses} detected\n`;
  }

  // Rhythm stats
  if (s.rhythm) {
    const r = s.rhythm;
    if (r.speechRatio !== null) {
      const ratioLabel = r.speechRatio >= 75 ? "✅ Good" : r.speechRatio >= 55 ? "⚠️ Many pauses" : "❌ Too many silences";
      msg += `🎵 *Speech ratio:* ${r.speechRatio}% ${ratioLabel}\n`;
    }
    if (r.rushesAtStart) msg += `⚡ _Tends to rush at the start — slow down your opening._\n`;
    if (r.rushesAtEnd) msg += `⚡ _Speeds up toward the end — maintain steady pace throughout._\n`;
    if (r.paceConsistency !== null && r.paceConsistency <= 5) {
      msg += `📈 *Pace consistency:* ${scoreBar(r.paceConsistency)} ${r.paceConsistency}/10\n`;
    }
  }

  // Audio quality warning
  if (qualityWarning) {
    msg += `🔈 _${qualityWarning}_\n`;
  }

  // --- Speech Scores ---
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `🗣️ *Fluency:*    ${scoreBar(result.fluency)} ${result.fluency}/10\n`;
  msg += `📚 *Grammar:*    ${scoreBar(result.grammar)} ${result.grammar}/10\n`;
  msg += `🔥 *Confidence:* ${scoreBar(result.confidence)} ${result.confidence}/10\n`;
  msg += `🧠 *Vocabulary:* ${scoreBar(result.vocabulary)} ${result.vocabulary}/10\n`;

  // CEFR level
  if (s.cefrLevel) {
    msg += `🎓 *Level:* ${s.cefrLevel.level} — _${s.cefrLevel.description}_\n`;
  }

  if (result.topicRelevance != null) {
    msg += `🎯 *On-topic:*   ${scoreBar(result.topicRelevance)} ${result.topicRelevance}/10\n`;
    if (result.topicFeedback) {
      msg += `   💬 _${result.topicFeedback}_\n`;
    }
  }

  // Pronunciation note
  if (result.pronunciationNote) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🗣️ *Pronunciation:* _${result.pronunciationNote}_\n`;
  }

  // Rhythm note
  if (result.rhythmNote) {
    msg += `🎵 *Rhythm:* _${result.rhythmNote}_\n`;
  }

  // --- Visual Scores (only if analysis succeeded) ---
  if (visual) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `👁️ *Eye Contact:*  ${scoreBar(visual.eyeContact)} ${visual.eyeContact}/10\n`;
    msg += `🧍 *Body Language:* ${scoreBar(visual.bodyLanguage)} ${visual.bodyLanguage}/10\n`;
    msg += `😊 *Expression:*   ${scoreBar(visual.facialExpression)} ${visual.facialExpression}/10\n`;
    msg += `✨ *Presence:*     ${scoreBar(visual.overallPresence)} ${visual.overallPresence}/10\n`;
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

  // --- Visual Observations (detailed notes from Gemini) ---
  if (visual) {
    const hasNotes =
      visual.eyeContactNote || visual.bodyLanguageNote || visual.expressionNote;
    const hasStrengths =
      visual.visualStrengths && visual.visualStrengths.length > 0;

    if (hasNotes || hasStrengths) {
      msg += `━━━━━━━━━━━━━━━\n`;
      msg += `📹 *Visual Observations:*\n`;
      if (visual.eyeContactNote) msg += `  👁️ ${visual.eyeContactNote}\n`;
      if (visual.bodyLanguageNote) msg += `  🧍 ${visual.bodyLanguageNote}\n`;
      if (visual.expressionNote) msg += `  😊 ${visual.expressionNote}\n`;
      if (hasStrengths) {
        for (const str of visual.visualStrengths) {
          msg += `  ✅ ${str}\n`;
        }
      }
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

  // --- Speech Suggestions ---
  if (result.suggestions && result.suggestions.length > 0) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `💡 *Speaking Tips:*\n`;
    for (const tip of result.suggestions) {
      msg += `  • ${tip}\n`;
    }
  }

  // --- Visual Suggestions ---
  if (visual && visual.visualSuggestions && visual.visualSuggestions.length > 0) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎬 *Presentation Tips:*\n`;
    for (const tip of visual.visualSuggestions) {
      msg += `  • ${tip}\n`;
    }
  }

  // --- Overall Comment ---
  if (result.overallComment) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `📝 ${result.overallComment}`;
  }

  // --- Visual unavailability note (appended when visual is null) ---
  if (!visual) {
    msg += `\n\n_(Visual analysis was unavailable for this submission.)_`;
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
