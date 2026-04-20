// Tense detection and correction patterns
const tensePatterns = {
  // Future indicators
  future: /\b(tomorrow|next week|next month|next year|later|soon|will|gonna|going to)\b/i,
  
  // Past indicators
  past: /\b(yesterday|last week|last month|last year|ago|earlier|previously|was|were)\b/i,
  
  // Present continuous indicators
  presentContinuous: /\b(now|currently|at the moment|right now)\b/i,
};

export function detectTenseIssues(text) {
  const issues = [];
  
  // Check for future time with present tense
  if (tensePatterns.future.test(text)) {
    // Check if using present tense verbs
    const presentVerbs = /\b(go|come|do|make|get|see|know|think|take|give)\b/i;
    if (presentVerbs.test(text) && !/\b(will|going to|gonna)\b/i.test(text)) {
      issues.push({
        type: "tense",
        message: "Use future tense (will/going to) for future actions",
        suggestion: "Add 'will' or 'going to' before the verb",
      });
    }
  }
  
  // Check for past time with present tense
  if (tensePatterns.past.test(text)) {
    const presentVerbs = /\b(am|is|are|go|come|do|make|get)\b/i;
    if (presentVerbs.test(text) && !/\b(was|were|went|came|did|made|got)\b/i.test(text)) {
      issues.push({
        type: "tense",
        message: "Use past tense for past actions",
        suggestion: "Change verb to past tense form",
      });
    }
  }
  
  // Check for present continuous indicators
  if (tensePatterns.presentContinuous.test(text)) {
    if (!/\b(am|is|are)\s+\w+ing\b/i.test(text)) {
      issues.push({
        type: "tense",
        message: "Use present continuous (am/is/are + verb-ing) for current actions",
        suggestion: "Use 'am/is/are + verb-ing' form",
      });
    }
  }
  
  return issues;
}

// Common tense corrections
export const tenseCorrections = {
  "I go tomorrow": "I will go tomorrow",
  "I go yesterday": "I went yesterday",
  "Yesterday I am": "Yesterday I was",
  "Tomorrow I am": "Tomorrow I will be",
  "I am go": "I am going",
  "He don't": "He doesn't",
  "She don't": "She doesn't",
  "I was go": "I went",
  "I will went": "I will go",
};

export function quickTenseCheck(text) {
  for (const [wrong, correct] of Object.entries(tenseCorrections)) {
    if (text.toLowerCase().includes(wrong.toLowerCase())) {
      return {
        found: true,
        wrong,
        correct,
      };
    }
  }
  return { found: false };
}
