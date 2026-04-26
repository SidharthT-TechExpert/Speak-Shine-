/**
 * Helpers shared between WhatsApp feedback and web video processor.
 */

import { getTextKey, markKeyExhausted, parseRetryAfter } from "./groqKeyManager.js";

/**
 * Synthesizes a unified overall comment from speech + visual results.
 * Extracted from feedback.js so web pipeline can use it without importing all of feedback.js.
 */
export async function synthesizeOverallComment(speechResult, visual) {
  const existing = speechResult.overallComment || "";

  const speechSummary = [
    `Fluency: ${speechResult.fluency}/10`,
    `Grammar: ${speechResult.grammar}/10`,
    `Confidence: ${speechResult.confidence}/10`,
    `Vocabulary: ${speechResult.vocabulary}/10`,
    speechResult._stats?.wpm ? `Pace: ${speechResult._stats.wpm} wpm` : null,
    speechResult._stats?.fillerTotal > 0 ? `Filler words: ${speechResult._stats.fillerTotal} total` : null,
    speechResult._stats?.cefrLevel ? `CEFR level: ${speechResult._stats.cefrLevel.level}` : null,
  ].filter(Boolean).join(", ");

  const visualSummary = visual ? [
    `Eye contact: ${visual.eyeContact}/10`,
    `Body language: ${visual.bodyLanguage}/10`,
    `Facial expression: ${visual.facialExpression}/10`,
    `Overall presence: ${visual.overallPresence}/10`,
  ].filter(Boolean).join(", ") : null;

  const prompt = `You are an encouraging English speaking coach. Write a 2-3 sentence overall comment for a student's video submission.

Speech analysis: ${speechSummary}
${visualSummary ? `Visual presence: ${visualSummary}` : "Visual analysis: not available"}
${(speechResult.strongPoints || []).slice(0, 2).join("; ") ? `Key strengths: ${(speechResult.strongPoints || []).slice(0, 2).join("; ")}` : ""}
${(speechResult.suggestions || [])[0] ? `Top improvement area: ${speechResult.suggestions[0]}` : ""}
${existing ? `Draft comment (improve this): ${existing}` : ""}

Rules:
- Mention BOTH speech quality AND visual presence if visual data is available
- Be specific — reference actual scores or observations
- End with one concrete actionable encouragement
- 2-3 sentences max, warm and motivating tone
- Return ONLY the comment text, no quotes, no labels`;

  try {
    while (true) {
      const apiKey = getTextKey();
      if (!apiKey) return existing;

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
      if (!res.ok) return existing;

      const data = await res.json();
      const comment = data?.choices?.[0]?.message?.content?.trim();
      return (comment && comment.length > 10) ? comment : existing;
    }
  } catch {
    return existing;
  }
}

/**
 * Parse formatted WhatsApp feedback text into structured data (fallback only).
 */
export function parseFeedbackToStructure(text) {
  const analysis = { stats: {} };
  const scorePatterns = {
    fluency:         /🗣️ \*Fluency:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    grammar:         /📚 \*Grammar:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    confidence:      /🔥 \*Confidence:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    vocabulary:      /🧠 \*Vocabulary:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    topicRelevance:  /🎯 \*On-topic:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    eyeContact:      /👁️ \*Eye Contact:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    bodyLanguage:    /🧍 \*Body Language:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    facialExpression:/😊 \*Expression:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    overallPresence: /✨ \*Presence:\*\s+[🟩⬜]+\s+(\d+)\/10/,
  };
  for (const [key, pattern] of Object.entries(scorePatterns)) {
    const m = text.match(pattern);
    if (m) analysis[key] = parseInt(m[1]);
  }
  const dur = text.match(/⏱️ \*Duration:\* ([\d:]+)/);
  if (dur) analysis.stats.duration = dur[1];
  const wpm = text.match(/📊 \*Pace:\* (\d+) wpm/);
  if (wpm) analysis.stats.wpm = parseInt(wpm[1]);
  const comment = text.match(/📝 (.+?)(?=\n━|$)/s);
  if (comment) analysis.overallComment = comment[1].trim();
  return analysis;
}
