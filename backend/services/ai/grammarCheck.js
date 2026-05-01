import fetch from "node-fetch";

const LANGUAGETOOL_URL = "https://api.languagetool.org/v2/check";

// Rules to ignore — these fire too often on spoken/informal English and produce noise
const IGNORED_RULE_IDS = [
  "UPPERCASE_SENTENCE_START",   // transcripts have no capitalisation
  "PUNCTUATION",                 // transcripts have no punctuation
  "EN_QUOTES",                   // not relevant for speech
  "COMMA_PARENTHESIS_WHITESPACE",
  "WHITESPACE_RULE",
  "SENTENCE_WHITESPACE",
  "DOUBLE_PUNCTUATION",
  "UNLIKELY_OPENING_PUNCTUATION",
  "WORD_CONTAINS_UNDERSCORE",
];

// Category IDs to ignore (too noisy for spoken English)
const IGNORED_CATEGORIES = [
  "TYPOGRAPHY",
  "PUNCTUATION",
  "CASING",
];

/**
 * Checks a transcript against LanguageTool's free public API.
 * Returns an array of grammar issues with original text, suggestion, and rule description.
 * Deduplicates against errors already found by the AI to avoid showing the same mistake twice.
 *
 * @param {string} transcript
 * @param {Array<{original: string, correction: string, rule: string}>} aiErrors - errors already found by Llama
 * @returns {Promise<Array<{original: string, correction: string, rule: string}>>}
 */
export async function checkGrammar(transcript, aiErrors = []) {
  try {
    const params = new URLSearchParams({
      text: transcript,
      language: "en-US",
      disabledRules: IGNORED_RULE_IDS.join(","),
      disabledCategories: IGNORED_CATEGORIES.join(","),
    });

    const res = await fetch(LANGUAGETOOL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      timeout: 8000, // 8s max — never block the pipeline waiting for LT
    });

    if (!res.ok) {
      console.log(`⚠️ LanguageTool HTTP ${res.status} — skipping grammar cross-check`);
      return [];
    }

    const data = await res.json();
    const matches = data.matches || [];

    // Build a set of already-known originals (lowercased) to avoid duplicates
    const knownOriginals = new Set(
      aiErrors.map((e) => e.original?.toLowerCase().trim()).filter(Boolean)
    );

    const results = [];

    for (const match of matches) {
      // Skip if no replacements suggested
      if (!match.replacements || match.replacements.length === 0) continue;

      const original = transcript.slice(match.offset, match.offset + match.length).trim();
      if (!original) continue;

      // Skip if AI already caught this
      if (knownOriginals.has(original.toLowerCase())) continue;

      // Skip very short matches (single letters, punctuation artifacts)
      if (original.length < 3) continue;

      const correction = match.replacements[0].value;
      const rule = match.shortMessage || match.message || match.rule?.description || "";

      results.push({ original, correction, rule: rule.slice(0, 80) });

      // Cap at 3 additional errors from LanguageTool
      if (results.length >= 3) break;
    }

    return results;
  } catch (err) {
    // LanguageTool is optional — never let it crash the pipeline
    console.log("⚠️ LanguageTool check failed (non-fatal):", err.message);
    return [];
  }
}
