# WhatsApp English Grammar Assistant

## Overview
Automatically analyzes English messages in your WhatsApp group and provides friendly grammar corrections, tense fixes, and vocabulary suggestions.

## Features

### ✍️ Grammar Correction
- Spelling mistakes
- Punctuation errors
- Sentence structure
- Article usage (a, an, the)
- Prepositions
- Subject-verb agreement

### ⏰ Tense Correction
- Detects and corrects all tenses
- Examples:
  - "I go tomorrow" → "I will go tomorrow"
  - "Yesterday I am busy" → "Yesterday I was busy"

### 📚 Vocabulary Upgrade
- Suggests better words
- "very good" → "excellent"
- "very big" → "huge"

### 🗣️ Spoken English
- Converts formal to casual
- "I am going now" → "I'm leaving now"

## Commands

### Admin Commands
```
/grammar on          - Enable grammar assistant
/grammar off         - Disable grammar assistant
/grammar status      - Check current settings
/tense on           - Enable tense checking
/tense off          - Disable tense checking
/vocab on           - Enable vocabulary suggestions
/vocab off          - Disable vocabulary suggestions
```

### User Commands
```
/mystats            - View your English improvement stats
/toplearners        - See top 5 learners in the group
```

## How It Works

1. **Message Detection**: Bot listens to all text messages
2. **Smart Filtering**: Ignores commands, emojis, URLs, short messages
3. **English Detection**: Only analyzes English text (60%+ English)
4. **Cooldown**: Same user gets feedback once every 2 minutes
5. **Friendly Response**: Encouraging, positive tone

## Configuration

Add to your `.env` file:
```
OPENAI_API_KEY=your_key_here  # Optional, for better AI analysis
```

If no OpenAI key, uses free LanguageTool API.

## Examples

**User sends:**
```
I go tomorrow for shopping
```

**Bot replies:**
```
✍️ English Suggestion for @user

❌ Original:
I go tomorrow for shopping

✅ Corrected:
I will go tomorrow for shopping

⏰ Tense:
• Use future tense (will/going to) for future actions

💡 Tip: Use 'will' or 'going to' before the verb

🔥 Keep improving! You're doing great!
```

## Smart Ignore Rules

Bot ignores:
- Commands starting with `/`
- Emoji-only messages
- One-word messages
- URLs and links
- Messages shorter than 10 characters
- Non-English text
- Media messages

## User Stats Tracking

Tracks for each user:
- Total corrections received
- Grammar improvement score
- Streak days
- Common mistakes
- Last correction date

## Future Features (Ready to Add)

- Voice note grammar feedback
- Pronunciation scoring
- IELTS speaking tips
- Daily challenge sentences
- Word of the day
- AI conversation partner
- Malayalam to English translation
- Manglish to proper English converter
- Resume/interview English help

## API Usage

### Free Tier (LanguageTool)
- No API key needed
- Unlimited requests
- Good for basic grammar

### Paid Tier (OpenAI)
- Better AI analysis
- More natural suggestions
- ~$0.002 per message
- Add `OPENAI_API_KEY` to `.env`

## Database Schema

### GrammarSettings
```javascript
{
  groupId: String,
  grammarEnabled: Boolean,
  tenseEnabled: Boolean,
  vocabEnabled: Boolean,
  cooldownMinutes: Number
}
```

### UserStats
```javascript
{
  userId: String,
  groupId: String,
  totalCorrections: Number,
  grammarScore: Number,
  streakDays: Number,
  commonMistakes: [String],
  lastMessageTime: Date
}
```

## Performance

- Fast response (<2 seconds)
- Low API cost (free or ~$0.002/message)
- Scalable to large groups
- Cooldown prevents spam

## Maintenance

All grammar logic is modular:
- `grammar/analyzer.js` - API calls
- `grammar/tense.js` - Tense detection
- `grammar/vocab.js` - Vocabulary suggestions
- `grammar/detector.js` - Message filtering
- `grammar/processor.js` - Main logic
- `grammar/cooldown.js` - Cooldown management

Easy to extend and maintain!
