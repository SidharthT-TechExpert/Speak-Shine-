import { analyzeGrammar, formatCorrections, analyzeWithOpenAI } from "./analyzer.js";
import { detectTenseIssues, quickTenseCheck } from "./tense.js";
import { suggestVocabUpgrade, suggestSpokenImprovement } from "./vocab.js";
import { shouldAnalyze, isEnglish } from "./detector.js";

export async function processMessage(text, settings, openaiKey = null) {
  // Check if should analyze
  if (!shouldAnalyze(text)) {
    return null;
  }
  
  // Check if English
  if (!isEnglish(text)) {
    return null;
  }
  
  const result = {
    original: text,
    corrected: null,
    tips: [],
    vocabSuggestions: [],
    spokenSuggestion: null,
    tenseIssues: [],
  };
  
  // Try OpenAI first if available
  if (openaiKey) {
    const aiResult = await analyzeWithOpenAI(text, openaiKey);
    if (aiResult) {
      return parseOpenAIResponse(aiResult, text);
    }
  }
  
  // Fallback to LanguageTool + custom checks
  if (settings.grammarEnabled) {
    const matches = await analyzeGrammar(text);
    const corrections = formatCorrections(text, matches);
    
    if (corrections) {
      result.corrected = corrections.corrected;
      result.tips = corrections.tips;
    }
  }
  
  // Tense check
  if (settings.tenseEnabled) {
    const quickCheck = quickTenseCheck(text);
    if (quickCheck.found) {
      result.corrected = result.corrected || text;
      result.corrected = result.corrected.replace(
        new RegExp(quickCheck.wrong, "gi"),
        quickCheck.correct
      );
      result.tenseIssues.push({
        message: `Tense correction: "${quickCheck.wrong}" → "${quickCheck.correct}"`,
      });
    } else {
      const tenseIssues = detectTenseIssues(text);
      if (tenseIssues.length > 0) {
        result.tenseIssues = tenseIssues;
      }
    }
  }
  
  // Vocab suggestions
  if (settings.vocabEnabled) {
    const vocabSuggestions = suggestVocabUpgrade(text);
    if (vocabSuggestions.length > 0) {
      result.vocabSuggestions = vocabSuggestions.slice(0, 2);
    }
    
    const spokenSuggestion = suggestSpokenImprovement(text);
    if (spokenSuggestion.found) {
      result.spokenSuggestion = spokenSuggestion;
    }
  }
  
  // If no corrections found, return null
  if (!result.corrected && 
      result.tenseIssues.length === 0 && 
      result.vocabSuggestions.length === 0 && 
      !result.spokenSuggestion) {
    return null;
  }
  
  return result;
}

function parseOpenAIResponse(response, original) {
  const parts = response.split("|");
  
  return {
    original,
    corrected: parts[1]?.replace("Corrected:", "").trim() || null,
    tips: [parts[2]?.replace("Tip:", "").trim() || "Keep practicing!"],
    vocabSuggestions: [],
    spokenSuggestion: null,
    tenseIssues: [],
  };
}

export function formatResponse(result, username) {
  let msg = `✍️ *English Suggestion for @${username}*\n\n`;
  
  if (result.corrected && result.corrected !== result.original) {
    msg += `❌ *Original:*\n${result.original}\n\n`;
    msg += `✅ *Corrected:*\n${result.corrected}\n\n`;
  }
  
  if (result.tenseIssues.length > 0) {
    msg += `⏰ *Tense:*\n`;
    result.tenseIssues.forEach(issue => {
      msg += `• ${issue.message}\n`;
    });
    msg += `\n`;
  }
  
  if (result.vocabSuggestions.length > 0) {
    msg += `📚 *Better Words:*\n`;
    result.vocabSuggestions.forEach(s => {
      msg += `• "${s.original}" → "${s.upgrade}"\n`;
    });
    msg += `\n`;
  }
  
  if (result.spokenSuggestion) {
    msg += `🗣️ *Spoken English:*\n`;
    msg += `"${result.spokenSuggestion.formal}" → "${result.spokenSuggestion.casual}"\n\n`;
  }
  
  if (result.tips.length > 0) {
    msg += `💡 *Tip:* ${result.tips[0]}\n\n`;
  }
  
  msg += `🔥 _Keep improving! You're doing great!_`;
  
  return msg;
}
