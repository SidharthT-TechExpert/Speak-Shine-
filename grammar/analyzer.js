import fetch from "node-fetch";

// Analyze grammar using LanguageTool API (free, no API key needed)
export async function analyzeGrammar(text) {
  try {
    const response = await fetch("https://api.languagetool.org/v2/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        text: text,
        language: "en-US",
        enabledOnly: "false",
      }),
    });

    const data = await response.json();
    return data.matches || [];
  } catch (error) {
    console.log("❌ Grammar API error:", error.message);
    return [];
  }
}

// Analyze using OpenAI (if API key available)
export async function analyzeWithOpenAI(text, apiKey) {
  if (!apiKey) return null;
  
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a friendly English teacher. Analyze the sentence for grammar, spelling, tense, and provide a corrected version with a brief tip. Be encouraging and positive. Format: Original: [text] | Corrected: [text] | Tip: [tip]"
          },
          {
            role: "user",
            content: text
          }
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.log("❌ OpenAI error:", error.message);
    return null;
  }
}

// Format corrections into friendly message
export function formatCorrections(original, matches) {
  if (!matches || matches.length === 0) {
    return null; // No corrections needed
  }

  // Apply corrections
  let corrected = original;
  const corrections = [];
  const tips = [];

  // Sort by offset descending to apply from end to start
  matches.sort((a, b) => b.offset - a.offset);

  for (const match of matches) {
    if (match.replacements && match.replacements.length > 0) {
      const replacement = match.replacements[0].value;
      corrected = 
        corrected.substring(0, match.offset) +
        replacement +
        corrected.substring(match.offset + match.length);
      
      corrections.push({
        type: match.rule.category.name,
        message: match.message,
      });
    }
  }

  // If no actual changes, return null
  if (corrected === original) return null;

  // Get unique tips
  const uniqueTips = [...new Set(matches.map(m => m.message))].slice(0, 2);

  return {
    original,
    corrected,
    corrections,
    tips: uniqueTips,
  };
}
