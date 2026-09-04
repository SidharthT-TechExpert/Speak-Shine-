/**
 * Guest Controller
 * Provides realistic dummy preview data for unauthenticated visitors.
 * Data is generated once and cached for 24 hours so the same session
 * looks consistent to everyone visiting on the same day.
 */

import { getRedisClient, isRedisAvailable } from "../config/redis.js";

const DAILY_REGISTRATION_LIMIT = parseInt(process.env.MAX_DAILY_REGISTRATIONS || "30", 10);
const CACHE_KEY = "guest:preview:v2";
const CACHE_TTL = 24 * 60 * 60; // 24 hours

// ── Realistic dummy data generators ──────────────────────────────────────────

const MEMBERS = [
  { name: "Arjun M.",  initials: "A", color: "#7c6fff", topic: "Describe a challenging decision you made recently", duration: 187 },
  { name: "Priya K.",  initials: "P", color: "#4ade80", topic: "Talk about a mentor who influenced your life",      duration: 163 },
  { name: "Rahul S.",  initials: "R", color: "#fbbf24", topic: "What motivates you to wake up every morning?",      duration: 214 },
  { name: "Divya R.",  initials: "D", color: "#f472b6", topic: "Describe your dream career in three minutes",       duration: 195 },
  { name: "Kiran T.",  initials: "K", color: "#60a5fa", topic: "How do you handle pressure at work?",              duration: 178 },
  { name: "Sneha V.",  initials: "S", color: "#fb923c", topic: "Talk about a book that changed your perspective",   duration: 201 },
];

const TRANSCRIPTIONS = [
  "Good morning everyone. Today I want to talk about a very challenging decision I had to make last year. I was given a choice between two job offers — one was a safe, comfortable position close to home, and the other was a risky startup in a new city. I chose the startup because I believe that growth happens outside your comfort zone. It was not easy at first, but the experience taught me resilience and adaptability. I used the word resilience to describe how I bounced back from setbacks during this journey.",
  "Hello, I would like to speak about my mentor, Mr. Kumar, who was my college professor. He always told me that communication is the most powerful skill a person can develop. His guidance helped me become more articulate and confident in expressing my thoughts. He persevered through every challenge with a smile, and that inspired me deeply. I try to follow his example every single day in my personal and professional life.",
  "What motivates me every morning is the thought of becoming a better version of myself. I wake up with a clear goal — to improve at least one skill today. Whether it is public speaking, reading, or physical fitness, I am always looking to grow. I practice articulating my ideas clearly so that when I speak, people listen. Consistency and discipline are what drive me forward each and every day.",
  "My dream career is to become a business communication trainer who helps young professionals speak with confidence. I am deeply passionate about English speaking and personal development. I want to create a world where everyone, regardless of their background, can express themselves clearly and powerfully. Every day I work towards this goal by practicing my speaking skills and learning from the best communicators around me.",
  "Handling pressure at work requires resilience and a clear mind. I have developed a system where I prioritize tasks, focus on what I can control, and let go of what I cannot. When deadlines are tight, I break the work into smaller steps and tackle them one by one. I have also learned that asking for help is not a weakness — it is a sign of wisdom. My team always performs better when we communicate openly and honestly.",
  "The book that changed my perspective the most is 'The Power of Habit' by Charles Duhigg. It taught me that our daily habits shape our identity. After reading it, I started waking up one hour earlier every day to practice my English speaking skills. The perseverance required to maintain this habit has transformed not just my communication skills but my entire approach to life. I highly recommend this book to anyone wanting to grow.",
];

const GRAMMAR_ERRORS_POOL = [
  [
    { original: "I was given a choice between two job", correction: "I was given a choice between two jobs", rule: "Plural noun required after 'two'" },
    { original: "It was not easy at first", correction: "It was not easy at first,", rule: "Missing comma after introductory phrase" },
  ],
  [
    { original: "He always told me that communication is the most powerful skill a person can develop", correction: "He always told me that communication is the most powerful skill a person could develop", rule: "Conditional mood in reported speech" },
  ],
  [
    { original: "I wake up with a clear goal — to improve at least one skill today", correction: "I wake up with a clear goal — to improve at least one skill each day", rule: "Use 'each day' for habitual actions" },
  ],
  [],
  [
    { original: "I have also learned that asking for help is not a weakness", correction: "I have also learned that asking for help is not a sign of weakness", rule: "More idiomatic expression" },
  ],
  [
    { original: "The perseverance required to maintain this habit has transformed", correction: "The perseverance required to maintain this habit have transformed", rule: "Subject-verb agreement — 'perseverance' is singular" },
  ],
];

const STRONG_POINTS_POOL = [
  ["Excellent vocabulary usage — used 'resilience' and 'adaptability' naturally", "Clear narrative structure with beginning, middle, and end", "Confident tone throughout the response", "Good use of personal anecdote to illustrate the point"],
  ["Strong emotional connection to the topic", "Well-articulated sentences with good rhythm", "Appropriate pace — not too fast, not too slow", "Natural use of transitional phrases like 'on the other hand'"],
  ["Outstanding energy and enthusiasm in delivery", "Clear pronunciation of all key words", "Good eye contact maintained throughout", "Effective use of pauses for emphasis"],
  ["Excellent topic coverage — addressed all aspects of the question", "Passionate delivery that engaged the listener", "Good sentence variety — short and long sentences mixed well", "Strong conclusion that tied back to the main theme"],
  ["Very professional tone and vocabulary", "Practical examples made the response relatable", "Good handling of a complex topic", "Clear and confident voice throughout"],
  ["Impressive vocabulary — used 'perseverance' contextually and correctly", "Excellent structure — introduction, body, and conclusion clearly defined", "Strong personal story that resonated emotionally", "Very natural and fluent delivery with minimal hesitation"],
];

const SUGGESTIONS_POOL = [
  ["Work on reducing filler words like 'um' and 'uh'", "Try to vary your sentence structure more", "Practice using more advanced vocabulary words daily"],
  ["Increase speaking duration to fill the full time limit", "Practice pausing after key points for emphasis", "Add more specific examples to support your ideas"],
  ["Work on projecting your voice more confidently", "Reduce repetition of certain phrases", "Try to maintain consistent energy throughout the response"],
  ["Focus on smoother transitions between ideas", "Practice using more varied vocabulary synonyms", "Work on eye contact and facial expression"],
  ["Slow down slightly during complex sentences", "Add more variety to sentence openings", "Practice using conditional sentences more naturally"],
  ["Increase the depth of your examples with more detail", "Work on pronunciation of multi-syllable words", "Try incorporating more rhetorical questions to engage listeners"],
];

function seededRandom(seed) {
  // Simple deterministic random based on date + index
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildDemoReport(memberIdx, seed) {
  const m = MEMBERS[memberIdx];
  const r = (offset = 0) => seededRandom(seed + memberIdx * 17 + offset);

  const fluency    = +(6.0 + r(1) * 3.5).toFixed(1);
  const grammar    = +(5.8 + r(2) * 3.8).toFixed(1);
  const confidence = +(6.2 + r(3) * 3.0).toFixed(1);
  const vocabulary = +(6.0 + r(4) * 3.5).toFixed(1);
  const overall    = +((fluency + grammar + confidence + vocabulary) / 4).toFixed(1);
  const topicRelevance = +(7.0 + r(5) * 2.5).toFixed(1);
  const eyeContact = +(6.5 + r(6) * 2.5).toFixed(1);
  const bodyLanguage = +(6.0 + r(7) * 3.0).toFixed(1);
  const wpm = Math.round(110 + r(8) * 50);

  // Score breakdown (composite out of 100 - Option B)
  const bdLength   = +(18 + r(9) * 12).toFixed(1);
  const bdVocab    = +(18 + r(10) * 12).toFixed(1);
  const bdTopic    = +(9 + r(11) * 6).toFixed(1);
  const bdComm     = +(6 + r(12) * 4).toFixed(1);
  const bdGrowth   = +(8 + r(13) * 6).toFixed(1);
  const composite  = Math.min(100, Math.round(bdLength + bdVocab + bdTopic + bdComm + bdGrowth));

  return {
    _id: `demo-${memberIdx}-${seed}`,
    isDemo: true,
    uploaderName: m.name,
    uploaderInitials: m.initials,
    uploaderColor: m.color,
    submittedAt: new Date(Date.now() - memberIdx * 3.5 * 3600000).toISOString(),
    videoDuration: m.duration,
    likeCount: Math.round(8 + r(13) * 15),
    dislikeCount: Math.round(r(14) * 2),
    comments: [],
    analysis: {
      fluency:      Math.min(10, fluency),
      grammar:      Math.min(10, grammar),
      confidence:   Math.min(10, confidence),
      vocabulary:   Math.min(10, vocabulary),
      overallScore: Math.min(10, overall),
      topicRelevance: Math.min(10, topicRelevance),
      topicFeedback: "Response stays on topic with good depth and personal examples.",
      eyeContact:   Math.min(10, eyeContact),
      bodyLanguage: Math.min(10, bodyLanguage),
      facialExpression: +(6.5 + r(15) * 2.5).toFixed(1),
      overallPresence: +(6.8 + r(16) * 2.2).toFixed(1),
      transcription: TRANSCRIPTIONS[memberIdx],
      overallComment: STRONG_POINTS_POOL[memberIdx][0],
      strongPoints: STRONG_POINTS_POOL[memberIdx],
      suggestions: SUGGESTIONS_POOL[memberIdx],
      grammarErrors: GRAMMAR_ERRORS_POOL[memberIdx],
      pronunciationNote: "Pronunciation is clear and understandable. Work on stressing the correct syllables in multi-syllable words.",
      rhythmNote: `Speaking pace is ${wpm < 120 ? "slightly slow" : wpm > 155 ? "slightly fast" : "well-balanced"} at ${wpm} words per minute.`,
      vocabularyHighlights: {
        strong: ["resilience", "articulate", "perseverance", "adaptability"].slice(0, 2 + memberIdx % 3),
        weak:   ["very", "really", "basically"].slice(0, 1 + memberIdx % 2),
      },
      eyeContactNote: "Good eye contact maintained. Try to look directly into the camera lens for more impact.",
      bodyLanguageNote: "Natural and relaxed posture. Minimal unnecessary gestures.",
      expressionNote: "Expressive face that reflects genuine emotions. Great for audience engagement.",
      visualStrengths: ["Confident posture", "Natural gestures", "Good lighting and framing"],
      visualSuggestions: ["Move slightly closer to the camera", "Try to smile more naturally at key points"],
      qualityWarning: null,
      compositeScore: Math.min(100, composite),
      scoreBreakdown: {
        length: bdLength, maxLength: 30,
        vocabUsed: bdVocab, maxVocab: 30,
        topic: bdTopic, maxTopic: 15,
        comm: bdComm, maxComm: 10,
        growth: bdGrowth, maxGrowth: 15,
        growthDelta: +(bdGrowth >= 12 ? 0.8 : bdGrowth >= 9 ? 0.3 : 0).toFixed(1),
        baselineComm: +(overall - 0.4).toFixed(1),
        isSpecialDay: false,
      },
      stats: {
        duration: `${Math.floor(m.duration / 60)}:${String(m.duration % 60).padStart(2, "0")}`,
        wpm,
        fillerTotal: Math.round(r(17) * 4),
        fillerWords: r(17) > 0.5 ? { um: Math.round(r(18) * 3) } : {},
        pauses: Math.round(r(19) * 3),
        cefrLevel: { level: ["B2", "C1"][Math.round(r(20))], description: "Upper intermediate to advanced" },
        rhythm: { speechRatio: Math.round(72 + r(21) * 20) },
      },
    },
  };
}

function buildGuestPreviewData() {
  // Use today's date as seed so data is consistent all day
  const today = new Date();
  const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

  const feedbackScores = Array.from({ length: 10 }, (_, i) => {
    const s = (n, off) => +(Math.min(10, Math.max(1, (5.5 + i * 0.22) + (seededRandom(daySeed + n + off) - 0.5) * 1.2)).toFixed(1));
    return {
      fluency:    s(1, i), grammar:    s(2, i),
      confidence: s(3, i), vocabulary: s(4, i),
      submittedAt: new Date(Date.now() - (9 - i) * 86400000).toISOString(),
    };
  });

  const communityFeed = MEMBERS.map((_, idx) => buildDemoReport(idx, daySeed));

  return {
    isGuest: true,
    profile: {
      name: "Preview User",
      streak: 7,
      weeklySubmissions: 4,
      monthlySubmissions: 18,
      completed: false,
      fine: 0,
      streakFreeze: 1,
      monthlyScore: 142,
      feedbackScores,
    },
    today: {
      question: "Tell us about a skill you are learning and why it excites you.",
      topic: "Personal Growth",
      category: "Self-Development",
      questionSent: true,
      isMonthlyReflection: false,
      isMonthlyGoals: false,
      vocabulary: [
        { word: "Resilience",   meaning: "The ability to recover quickly from setbacks",  example: "Her resilience helped her bounce back after every failure." },
        { word: "Perseverance", meaning: "Continued effort despite difficulty",            example: "With perseverance, he finally mastered public speaking." },
        { word: "Articulate",   meaning: "Able to express thoughts clearly",              example: "She was articulate and confident during the presentation." },
        { word: "Proficiency",  meaning: "A high degree of skill or competence",          example: "He reached proficiency in English after years of practice." },
        { word: "Ambition",     meaning: "A strong desire to achieve something",          example: "Her ambition drove her to learn a new skill every year." },
      ],
      vocabWordCount: 5,
      vocabRequiredCount: 3,
      durationLimits: {
        minSeconds: 60,
        maxSeconds: 300,
        fullScoreSeconds: 300,
        minLabel: "1 min",
        maxLabel: "5 min",
        fullScoreLabel: "5 min",
      },
    },
    stats: { total: 87, completed: 23, pending: 64, totalFreeze: 12 },
    topStreak: [
      { name: "Arjun M.",  streak: 42, completed: true,  weeklySubmissions: 5, monthlyScore: 210 },
      { name: "Priya K.",  streak: 38, completed: true,  weeklySubmissions: 5, monthlyScore: 195 },
      { name: "Rahul S.",  streak: 31, completed: false, weeklySubmissions: 4, monthlyScore: 157 },
      { name: "Divya R.",  streak: 27, completed: true,  weeklySubmissions: 5, monthlyScore: 143 },
      { name: "Kiran T.",  streak: 19, completed: false, weeklySubmissions: 3, monthlyScore:  98 },
    ],
    myStreakEntry: null,
    streakRecord: { name: "Arjun M.", streak: 87, achievedAt: new Date(Date.now() - 30 * 86400000).toISOString() },
    showReport: false,
    posterSendTime: "08:00",
    communityFeed,
  };
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function getCachedPreview() {
  if (!isRedisAvailable()) return null;
  try {
    const raw = await getRedisClient().get(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function setCachedPreview(data) {
  if (!isRedisAvailable()) return;
  try {
    await getRedisClient().set(CACHE_KEY, JSON.stringify(data), "EX", CACHE_TTL);
  } catch {}
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/guest/preview
 * Returns realistic dummy preview data, cached for 24 hours.
 */
export async function getGuestPreview(req, res) {
  try {
    let data = await getCachedPreview();
    if (!data) {
      data = buildGuestPreviewData();
      await setCachedPreview(data);
    }
    res.set("Cache-Control", "public, max-age=3600");
    res.json(data);
  } catch (err) {
    console.error("[Guest] Preview error:", err.message);
    // Fallback — generate fresh without cache
    res.json(buildGuestPreviewData());
  }
}

/**
 * POST /api/guest/visit  — track a guest visit (expires in 24h)
 */
export async function trackGuestVisit(req, res) {
  try {
    const ip = req.ip || "unknown";
    const { referrer, device } = req.body || {};
    if (isRedisAvailable()) {
      const key = `guest:visit:${ip}:${Date.now()}`;
      await getRedisClient().set(key, JSON.stringify({ ip, referrer, device, visitedAt: new Date().toISOString() }), "EX", CACHE_TTL);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
}

/**
 * GET /api/guest/slots  — how many registration slots are left today
 */
export async function getRegistrationSlots(req, res) {
  try {
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const midnightIST = new Date(nowIST);
    midnightIST.setHours(0, 0, 0, 0);

    const PendingRegistration = (await import("../../models/pendingRegistrationSchema.js")).default;
    const todayRegistrations = await PendingRegistration.countDocuments({ createdAt: { $gte: midnightIST } });
    const slotsLeft = Math.max(0, DAILY_REGISTRATION_LIMIT - todayRegistrations);

    res.json({
      slotsLeft,
      totalSlots: DAILY_REGISTRATION_LIMIT,
      percentFull: Math.round((todayRegistrations / DAILY_REGISTRATION_LIMIT) * 100),
      isFull: slotsLeft === 0,
    });
  } catch (err) {
    console.error("[Guest] Slots error:", err.message);
    res.json({ slotsLeft: DAILY_REGISTRATION_LIMIT, totalSlots: DAILY_REGISTRATION_LIMIT, percentFull: 0, isFull: false });
  }
}
