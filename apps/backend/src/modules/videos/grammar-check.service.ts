import { Injectable, Logger } from '@nestjs/common';

const LANGUAGETOOL_URL = 'https://api.languagetool.org/v2/check';

const IGNORED_RULE_IDS = new Set([
  'UPPERCASE_SENTENCE_START',
  'PUNCTUATION',
  'EN_QUOTES',
  'COMMA_PARENTHESIS_WHITESPACE',
  'WHITESPACE_RULE',
  'SENTENCE_WHITESPACE',
  'DOUBLE_PUNCTUATION',
  'UNLIKELY_OPENING_PUNCTUATION',
  'WORD_CONTAINS_UNDERSCORE',
  'IT_S_ITS',
  'ITS_IT_S',
  'THEIR_THERE',
  'THERE_THEIR',
  'YOUR_YOU_RE',
  'YOU_RE_YOUR',
  'WHO_S_WHOSE',
  'WHOSE_WHO_S',
  'POSSESSIVE_APOSTROPHE',
  'CONTRACTION_APOSTROPHE',
  'CONFUSED_WORDS',
  'HOMOPHONES',
  'ENGLISH_WORD_REPEAT_RULE',
]);

const IGNORED_CATEGORIES = new Set([
  'TYPOGRAPHY',
  'PUNCTUATION',
  'CASING',
  'COMPOUNDING',
  'CONFUSED_WORDS',
]);

export interface GrammarErrorItem {
  original: string;
  correction: string;
  rule: string;
}

@Injectable()
export class GrammarCheckService {
  private readonly logger = new Logger(GrammarCheckService.name);

  async checkGrammar(transcription: string): Promise<GrammarErrorItem[]> {
    if (!transcription || transcription.trim().length === 0) {
      return [];
    }

    try {
      const params = new URLSearchParams();
      params.append('text', transcription);
      params.append('language', 'en-US');

      const response = await fetch(LANGUAGETOOL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!response.ok) {
        return [];
      }

      const data: any = await response.json();
      const matches = data.matches || [];

      const filteredErrors: GrammarErrorItem[] = [];

      for (const match of matches) {
        const ruleId = match.rule?.id || '';
        const categoryId = match.rule?.category?.id || '';

        if (IGNORED_RULE_IDS.has(ruleId) || IGNORED_CATEGORIES.has(categoryId)) {
          continue;
        }

        const original = transcription.substring(
          match.offset,
          match.offset + match.length,
        );
        const replacements = match.replacements || [];
        if (replacements.length === 0) continue;

        const bestCorrection = replacements[0].value;
        if (original.toLowerCase() === bestCorrection.toLowerCase()) {
          continue; // Ignore capitalization changes from speech
        }

        filteredErrors.push({
          original,
          correction: bestCorrection,
          rule: match.message || match.rule?.description || 'Grammatical consistency rule',
        });
      }

      return filteredErrors.slice(0, 5); // Return top 5 actionable errors
    } catch (err: any) {
      this.logger.warn(`LanguageTool grammar check fallback: ${err.message}`);
      return [];
    }
  }
}
