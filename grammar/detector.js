// Detect if message should be analyzed
export function shouldAnalyze(text) {
  if (!text || text.trim().length === 0) return false;
  
  // Ignore commands
  if (text.trim().startsWith("/")) return false;
  
  // Ignore emoji-only messages
  const emojiRegex = /^[\p{Emoji}\s]+$/u;
  if (emojiRegex.test(text)) return false;
  
  // Ignore one-word messages
  if (text.trim().split(/\s+/).length === 1) return false;
  
  // Ignore URLs
  if (/(https?:\/\/|www\.)/i.test(text)) return false;
  
  // Ignore very short messages
  if (text.trim().length < 10) return false;
  
  // Check if contains English letters
  const englishRegex = /[a-zA-Z]/;
  if (!englishRegex.test(text)) return false;
  
  // Check if mostly English (at least 60% English characters)
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  if (englishChars / totalChars < 0.6) return false;
  
  return true;
}

// Detect language
export function isEnglish(text) {
  const englishWords = /\b(the|is|are|was|were|have|has|had|do|does|did|will|would|can|could|should|may|might|must|shall|to|of|and|a|an|in|on|at|for|with|from|by|about|as|into|through|during|before|after|above|below|between|under|over)\b/gi;
  const matches = text.match(englishWords);
  return matches && matches.length >= 2;
}
