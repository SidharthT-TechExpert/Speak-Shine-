// Vocabulary upgrades
export const vocabUpgrades = {
  // Basic to better
  "very good": "excellent",
  "very bad": "terrible",
  "very big": "huge",
  "very small": "tiny",
  "very happy": "delighted",
  "very sad": "devastated",
  "very tired": "exhausted",
  "very angry": "furious",
  "very scared": "terrified",
  "very hungry": "starving",
  
  // Single words
  "good": "great",
  "bad": "poor",
  "nice": "pleasant",
  "big": "large",
  "small": "little",
  "happy": "joyful",
  "sad": "unhappy",
  "mad": "angry",
  "smart": "intelligent",
  "dumb": "unintelligent",
};

// Spoken English improvements
export const spokenImprovements = {
  "I am going now": "I'm leaving now",
  "I am coming": "I'm on my way",
  "I will do it": "I'll do it",
  "I have to go": "I've got to go",
  "I want to": "I'd like to",
  "Do you want": "Would you like",
  "I think that": "I think",
  "It is very": "It's really",
  "I am very": "I'm really",
};

export function suggestVocabUpgrade(text) {
  const suggestions = [];
  
  for (const [basic, better] of Object.entries(vocabUpgrades)) {
    const regex = new RegExp(`\\b${basic}\\b`, "gi");
    if (regex.test(text)) {
      suggestions.push({
        original: basic,
        upgrade: better,
        type: "vocabulary",
      });
    }
  }
  
  return suggestions;
}

export function suggestSpokenImprovement(text) {
  for (const [formal, casual] of Object.entries(spokenImprovements)) {
    if (text.toLowerCase().includes(formal.toLowerCase())) {
      return {
        found: true,
        formal,
        casual,
      };
    }
  }
  return { found: false };
}
