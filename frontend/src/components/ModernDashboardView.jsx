import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts";
import NotificationBell from "./NotificationBell.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import gsap from "gsap";

// ── Waveform bar patterns for realistic speech audio visualization ───────────
const WAVE_PATTERN = [
  14, 20, 16, 26, 22, 14, 18, 24, 12, 22, 28, 18, 24, 16, 20,
  28, 22, 18, 26, 20, 14, 18, 24, 16, 22, 26, 18, 14
];

// ── Isolated Countdown Timer (Prevents entire dashboard from re-rendering every second) ──
function MidnightCountdownTimer() {
  const calc = () => {
    const now = new Date();
    const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const midnight = new Date(nowIST);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);

    const diffSec = Math.max(0, Math.floor((midnight - nowIST) / 1000));
    const hrs = String(Math.floor(diffSec / 3600)).padStart(2, "0");
    const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, "0");
    const secs = String(diffSec % 60).padStart(2, "0");
    return { hrs, mins, secs };
  };

  const [t, setT] = useState(calc);

  useEffect(() => {
    const interval = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.75rem" }}>
      <div className="speakshine-timer-box" style={{
        background: "#161024",
        border: "1px solid rgba(249, 115, 22, 0.35)",
        borderRadius: 10,
        padding: "0.65rem 0.85rem",
        textAlign: "center",
        minWidth: 54,
      }}>
        <div className="speakshine-timer-val" style={{ fontSize: "1.85rem", fontWeight: 800, color: "#ffffff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {t.hrs}
        </div>
        <div style={{ fontSize: "0.6rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginTop: "4px", letterSpacing: "0.08em" }}>
          HRS
        </div>
      </div>

      <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "rgba(249, 115, 22, 0.6)", paddingBottom: "12px" }}>:</span>

      <div className="speakshine-timer-box" style={{
        background: "#161024",
        border: "1px solid rgba(249, 115, 22, 0.35)",
        borderRadius: 10,
        padding: "0.65rem 0.85rem",
        textAlign: "center",
        minWidth: 54,
      }}>
        <div className="speakshine-timer-val" style={{ fontSize: "1.85rem", fontWeight: 800, color: "#ffffff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {t.mins}
        </div>
        <div style={{ fontSize: "0.6rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginTop: "4px", letterSpacing: "0.08em" }}>
          MINS
        </div>
      </div>

      <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "rgba(249, 115, 22, 0.6)", paddingBottom: "12px" }}>:</span>

      <div className="speakshine-timer-box" style={{
        background: "#161024",
        border: "1px solid rgba(249, 115, 22, 0.35)",
        borderRadius: 10,
        padding: "0.65rem 0.85rem",
        textAlign: "center",
        minWidth: 54,
      }}>
        <div className="speakshine-timer-val" style={{ fontSize: "1.85rem", fontWeight: 800, color: "#ffffff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {t.secs}
        </div>
        <div style={{ fontSize: "0.6rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginTop: "4px", letterSpacing: "0.08em" }}>
          SECS
        </div>
      </div>
    </div>
  );
}

export default function ModernDashboardView({
  user,
  profile = {},
  today = {},
  scores = [],
  leaderboard = [],
  stats = {},
  streakRecord = null,
  myStreakEntry = null,
  badges = {},
  onOpenBadges,
  onOpenSettings,
  onOpenReport,
  onLogout,
}) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // ── Tabs for Performance Center: "points", "history", "sessions" ────────────
  const [activeTab, setActiveTab] = useState("points");
  const [sessionPage, setSessionPage] = useState(1);
  const SESSION_PAGE_SIZE = 6;

  // ── Audio Player & Waveform State ───────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(104); // Default 1:44 as in screenshot
  const audioRef = useRef(null);

  const storyPrompt = today.prompt || today.question || "Maya ordered a book on pottery but received an antique wooden puzzle box instead. With no return address and a strange riddle carved on the base, she spent her Saturday trying to solve it rather than packing for her move.";
  const audioSrc = today.audioUrl || "https://pub-1c5ce667ea4445fb98d667349b649704.r2.dev/story-audio/wrong-delivery-surprise-1788843000000.mp3";

  // Speech synthesis fallback so audio ALWAYS works
  const playVoiceFallback = () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(storyPrompt);
    utt.rate = 0.96;
    utt.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const prefVoice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha")));
    if (prefVoice) utt.voice = prefVoice;

    utt.onstart = () => {
      setIsPlaying(true);
      setCurrentTime(0);
    };
    utt.onend = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    utt.onerror = () => {
      setIsPlaying(false);
    };

    window.speechSynthesis.speak(utt);
  };

  const togglePlay = () => {
    if (isPlaying) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
    } else {
      if (audioRef.current && audioRef.current.src) {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(err => {
          console.warn("[Audio] Falling back to Web Speech API:", err);
          playVoiceFallback();
        });
      } else {
        playVoiceFallback();
      }
    }
  };

  // Keep waveform moving when speaking via SpeechSynthesis
  useEffect(() => {
    let interval;
    if (isPlaying && (!audioRef.current || audioRef.current.paused)) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 0.5;
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    if (audioRef.current.duration && !isNaN(audioRef.current.duration)) {
      setDuration(Math.round(audioRef.current.duration));
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const seekWaveform = (index) => {
    const targetTime = (index / WAVE_PATTERN.length) * (duration || 104);
    if (audioRef.current && !isNaN(audioRef.current.duration)) {
      audioRef.current.currentTime = targetTime;
    }
    setCurrentTime(targetTime);
  };

  const fmtTime = (sec) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const activeWaveIndex = Math.floor((progressPercent / 100) * WAVE_PATTERN.length);

  // ── Target Vocabulary Planning (LocalStorage with 16h TTL) ──────────────────
  const VOCAB_STORAGE_KEY = "speakshine_planned_vocab_v1";
  const SIXTEEN_HOURS_MS = 16 * 60 * 60 * 1000;

  const defaultVocabulary = [
    { word: "Inevitable", meaning: "Certain to happen; unavoidable", example: "With regular practice, rapid improvement in speaking fluency is inevitable.", bonus: "+10 pts" },
    { word: "Serendipity", meaning: "Finding valuable things not sought", example: "The serendipity of meeting her at the wrong delivery turned into a lasting friendship.", bonus: "+15 pts" },
    { word: "Reluctant", meaning: "Unwilling and hesitant", example: "He was reluctant to speak at first, but gained confidence quickly.", bonus: "+10 pts" },
  ];

  const vocabList = (today.vocabulary && today.vocabulary.length > 0)
    ? today.vocabulary.slice(0, 3).map((v, i) => {
        let word = "";
        let meaning = "";
        let example = "";
        if (typeof v === "string") {
          const parts = v.split(/\s*[-—:]\s*/);
          word = parts[0]?.trim() || defaultVocabulary[i]?.word;
          meaning = parts[1]?.trim() || defaultVocabulary[i]?.meaning;
          if (parts.length >= 3) {
            example = parts.slice(2).join(" — ").trim();
          }
        } else if (v && typeof v === "object") {
          word = v.word || v.Word || v.term || defaultVocabulary[i]?.word;
          meaning = v.meaning || v.Meaning || v.definition || defaultVocabulary[i]?.meaning;
          example = v.example || v.Example || v.sentence || v.sampleSentence || "";
        }

        if (!example) {
          const wLower = (word || "").toLowerCase();
          const defaults = {
            miscommunication: "The miscommunication caused the package to be delivered to the wrong address.",
            serendipity: "The serendipity of meeting her at the wrong delivery turned into a lasting friendship.",
            reconcile: "They reconciled after the mix-up, and their friendship grew stronger.",
            inevitable: "With regular practice, rapid improvement in speaking fluency is inevitable.",
            reluctant: "He was reluctant to speak at first, but gained confidence quickly.",
            articulate: "She was able to articulate her ideas clearly during the presentation.",
            perseverance: "Through perseverance and daily speaking drills, he mastered clear pronunciation.",
            cohesion: "Using linking words gave great cohesion to her story summary.",
          };
          example = defaults[wLower] || defaultVocabulary[i]?.example || (word ? `The speaker used "${word}" clearly in the story summary.` : "");
        }

        return {
          word,
          meaning,
          example,
          bonus: i === 1 ? "+15 pts" : "+10 pts",
        };
      })
    : defaultVocabulary;

  const [plannedWords, setPlannedWords] = useState(() => {
    try {
      const saved = localStorage.getItem(VOCAB_STORAGE_KEY);
      if (!saved) return { 0: true }; // Default word 0 marked as planned as in screenshot 1
      const parsed = JSON.parse(saved);
      if (Date.now() - (parsed.timestamp || 0) > SIXTEEN_HOURS_MS) {
        localStorage.removeItem(VOCAB_STORAGE_KEY);
        return { 0: true };
      }
      return parsed.planned || { 0: true };
    } catch {
      return { 0: true };
    }
  });

  const togglePlanned = (idx) => {
    setPlannedWords(prev => {
      const next = { ...prev, [idx]: !prev[idx] };
      try {
        localStorage.setItem(VOCAB_STORAGE_KEY, JSON.stringify({
          planned: next,
          timestamp: Date.now(),
        }));
      } catch {}
      return next;
    });
  };

  const plannedCount = Object.values(plannedWords).filter(Boolean).length;
  const plannedBonusPts = plannedCount * 10 + (plannedWords[1] ? 5 : 0);

  // ── Vocabulary Pronunciation Audio Handler ──────────────────────────────────
  const [speakingVocabIndex, setSpeakingVocabIndex] = useState(null);
  const vocabAudioRef = useRef(null);

  const handleSpeakVocab = (rawWord, rawMeaning, rawExample, idx) => {
    if (!rawWord) return;
    const wordClean = (rawWord || "").trim();
    const meaningClean = (rawMeaning || "").trim();
    const exampleClean = (rawExample || "").trim();

    let textToSpeak = wordClean;
    if (meaningClean) {
      textToSpeak += `. ${meaningClean}`;
    }
    if (exampleClean) {
      textToSpeak += `. For example: ${exampleClean}`;
    }

    setSpeakingVocabIndex(idx);

    if (vocabAudioRef.current) {
      vocabAudioRef.current.pause();
      vocabAudioRef.current = null;
    }

    const safetyTimer = setTimeout(() => {
      setSpeakingVocabIndex(prev => prev === idx ? null : prev);
    }, Math.max(5000, Math.min(25000, textToSpeak.length * 90)));

    const audioUrl = `/api/video/tts?text=${encodeURIComponent(textToSpeak)}`;
    const audio = new Audio(audioUrl);
    vocabAudioRef.current = audio;

    audio.onended = () => {
      clearTimeout(safetyTimer);
      setSpeakingVocabIndex(null);
    };

    const fallbackTTS = () => {
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = 0.90;
          utterance.lang = 'en-US';
          const voices = window.speechSynthesis.getVoices();
          const pref = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google")));
          if (pref) utterance.voice = pref;
          utterance.onend = () => {
            clearTimeout(safetyTimer);
            setSpeakingVocabIndex(null);
          };
          utterance.onerror = () => {
            clearTimeout(safetyTimer);
            setSpeakingVocabIndex(null);
          };
          window.speechSynthesis.speak(utterance);
          return;
        } catch {}
      }
      clearTimeout(safetyTimer);
      setSpeakingVocabIndex(null);
    };

    audio.onerror = fallbackTTS;
    audio.play().catch(fallbackTTS);
  };


  // ── User Data Aggregations ──────────────────────────────────────────────────
  const streak = profile.streak ?? 2;
  const totalPoints = Math.round(profile.monthlyScore ?? 160);
  const freezeTokens = profile.streakFreeze ?? 0;
  const displayName = user?.name || profile?.name || "Jane Doe";
  const avatarInitials = displayName.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase() || "JD";

  const getGreeting = () => {
    const h = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
  };

  // ── File Upload Handler ─────────────────────────────────────────────────────
  const handleFileUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      navigate("/record", { state: { file } });
    }
  };

  // ── Historical Scores Dataset (Matching Screenshots 3 & 4) ──────────────────
  const chartPointsData = Array.from({ length: 25 }, (_, i) => {
    const sessionNum = `#${i + 1}`;
    // Curve matching Screenshot 3
    const curve = [72, 78, 75, 82, 85, 84, 88, 86, 89, 90, 88, 87, 89, 85, 75, 74, 82, 86, 88, 85, 82, 84, 86, 88, 92];
    const scoreVal = scores[i]?.total || curve[i % curve.length];
    return { session: sessionNum, pts: scoreVal };
  });

  const chartHistoryData = Array.from({ length: 25 }, (_, i) => {
    const sessionNum = `#${i + 1}`;
    const s = scores[i] || {};
    // Matches Screenshot 4
    const fl = s.fluency ?? +(5.5 + Math.sin(i * 0.5) * 1.5 + (i * 0.05)).toFixed(1);
    const gr = s.grammar ?? +(4.5 + Math.cos(i * 0.6) * 1.2 + (i * 0.04)).toFixed(1);
    const cf = s.confidence ?? +(5.8 + Math.sin(i * 0.4) * 1.4 + (i * 0.05)).toFixed(1);
    const vb = s.vocabulary ?? +(5.0 + Math.cos(i * 0.5) * 1.3 + (i * 0.04)).toFixed(1);
    return {
      session: sessionNum,
      fluency: Math.min(10, Math.max(2, fl)),
      grammar: Math.min(10, Math.max(2, gr)),
      confidence: Math.min(10, Math.max(2, cf)),
      vocabulary: Math.min(10, Math.max(2, vb)),
    };
  });

  // Table Sessions Data (Matching Screenshot 5)
  const defaultSessions = [
    { session: "#30", date: "7 Sep 2026", duration: "3m 53s", fluency: 7, grammar: 7, confidence: 7, vocabulary: 7 },
    { session: "#29", date: "6 Sep 2026", duration: "2m 58s", fluency: 7, grammar: 7, confidence: 7, vocabulary: 7 },
    { session: "#28", date: "5 Sep 2026", duration: "3m 47s", fluency: 6, grammar: 4, confidence: 5, vocabulary: 5 },
    { session: "#27", date: "4 Sep 2026", duration: "3m 48s", fluency: 6, grammar: 7, confidence: 6, vocabulary: 7 },
    { session: "#26", date: "3 Sep 2026", duration: "2m 48s", fluency: 7, grammar: 4, confidence: 6, vocabulary: 5 },
    { session: "#25", date: "2 Sep 2026", duration: "4m 02s", fluency: 8, grammar: 6, confidence: 7, vocabulary: 6 },
    { session: "#24", date: "1 Sep 2026", duration: "3m 15s", fluency: 7, grammar: 6, confidence: 6, vocabulary: 6 },
    { session: "#23", date: "31 Aug 2026", duration: "2m 50s", fluency: 6, grammar: 5, confidence: 6, vocabulary: 5 },
  ];

  const sessionsList = (scores && scores.length > 0)
    ? scores.map((s, idx) => ({
        session: `#${scores.length - idx}`,
        date: s.submittedAt ? new Date(s.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : `${idx + 1} Sep 2026`,
        duration: s.duration ? `${Math.floor(s.duration / 60)}m ${String(s.duration % 60).padStart(2, "0")}s` : "3m 15s",
        fluency: s.fluency ? Math.round(s.fluency) : 7,
        grammar: s.grammar ? Math.round(s.grammar) : 6,
        confidence: s.confidence ? Math.round(s.confidence) : 7,
        vocabulary: s.vocabulary ? Math.round(s.vocabulary) : 6,
      }))
    : defaultSessions;

  const totalPages = Math.ceil(sessionsList.length / SESSION_PAGE_SIZE);
  const pagedSessions = sessionsList.slice((sessionPage - 1) * SESSION_PAGE_SIZE, sessionPage * SESSION_PAGE_SIZE);

  const getScoreColor = (val) => {
    if (val >= 7) return "#4ade80"; // green
    if (val >= 5) return "#fbbf24"; // yellow
    return "#f87171"; // red
  };

  const getInitials = (name) => {
    if (!name) return "U";
    const clean = name.replace(/\(You\)/i, "").replace(/[^a-zA-Z0-9\s]/g, "").trim();
    if (!clean) return name.slice(0, 2).toUpperCase() || "U";
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  };

  const groupName = user?.group || profile?.group || "Group 1";
  const memberCount = stats?.total ?? (leaderboard?.length || 7);
  const submittedCount = stats?.completed ?? 0;
  const pendingCount = stats?.pending ?? Math.max(0, memberCount - submittedCount);

  // All-time record details
  const recordHolder = streakRecord?.name || (leaderboard?.[0]?.name) || "~Fayiz✨";
  const recordDate = streakRecord?.achievedAt
    ? new Date(streakRecord.achievedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Sep 7";
  const recordScore = streakRecord?.streak || streakRecord?.score || (leaderboard?.[0]?.streak || 120);
  const recordUnit = streakRecord?.score ? "pts" : (streakRecord?.streak ? "d" : "pts");

  const defaultLeaderboard = useMemo(() => [
    { rank: 1, medal: "🥇", name: "~Fayiz✨", title: "Communication Titan · 120d", pts: 684, time: "2h ago", isUser: false, initials: "FZ" },
    { rank: 2, medal: "🥈", name: "Shabeer😉", title: "Speech Legend · 110d", pts: 682, time: "3h ago", isUser: false, initials: "SH" },
    { rank: 3, medal: "🥉", name: "Abdul Fathah", title: "Elite Communicator · 65d", pts: 617, time: "4h ago", isUser: false, initials: "AF" },
    { rank: 4, medal: "👉", name: `${displayName} (You)`, title: `${profile?.streak || 4}d streak`, pts: Math.round(profile?.monthlyScore || 599), time: "Yesterday", isUser: true, initials: avatarInitials || "YOU" },
    { rank: 5, medal: "5", name: "Muhammed Nabhan", title: "Momentum Builder · 6d", pts: 417, time: "Yesterday", isUser: false, initials: "MN" },
  ], [displayName, profile?.streak, profile?.monthlyScore, avatarInitials]);

  const currentLeaderboard = useMemo(() => {
    const hasRealLeaderboard = Array.isArray(leaderboard) && leaderboard.length > 0;
    const rawList = hasRealLeaderboard ? leaderboard : defaultLeaderboard;

    const isUserItem = (item) => {
      if (!item) return false;
      if (item.isCurrentUser || item.isUser) return true;
      const cleanItemName = (item.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const cleanUserName = (displayName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanItemName && cleanUserName && (cleanItemName === cleanUserName || cleanItemName.includes(cleanUserName) || cleanUserName.includes(cleanItemName))) {
        return true;
      }
      if (user?.phone && item.phone) {
        const p1 = String(user.phone).replace(/^(\+91|91)/, "");
        const p2 = String(item.phone).replace(/^(\+91|91)/, "");
        if (p1 === p2) return true;
      }
      return false;
    };

    let itemsToDisplay = [...rawList];
    const hasUser = itemsToDisplay.some(isUserItem);

    if (!hasUser && myStreakEntry) {
      itemsToDisplay.push({ ...myStreakEntry, isCurrentUser: true });
    } else if (!hasUser && user && hasRealLeaderboard) {
      itemsToDisplay.push({
        rank: itemsToDisplay.length + 1,
        name: `${displayName} (You)`,
        streak: profile?.streak || 0,
        monthlyScore: profile?.monthlyScore || 0,
        completed: profile?.completed || false,
        isCurrentUser: true,
      });
    }

    // Sort so ranked entries stay in numerical podium order
    itemsToDisplay.sort((a, b) => {
      if (a.rank != null && b.rank != null) return a.rank - b.rank;
      return (b.monthlyScore || 0) - (a.monthlyScore || 0);
    });

    return itemsToDisplay.map((u, i) => {
      const isUser = isUserItem(u);
      const name = isUser ? (u.name?.includes("(You)") ? u.name : `${displayName} (You)`) : u.name;
      const rankNum = u.rank || (i + 1);
      const medal = rankNum === 1 ? "🥇" : rankNum === 2 ? "🥈" : rankNum === 3 ? "🥉" : isUser ? "👉" : String(rankNum);
      const initials = isUser ? (avatarInitials || "YOU") : getInitials(name);

      const streakDays = u.streak ?? (isUser ? (profile?.streak || 0) : 0);
      let badgeName = "Active Speaker";
      let badgeIcon = "🎤";
      if (streakDays >= 100) { badgeName = "Communication Titan"; badgeIcon = "💬"; }
      else if (streakDays >= 60) { badgeName = "Elite Communicator"; badgeIcon = "🚀"; }
      else if (streakDays >= 30) { badgeName = "Speech Legend"; badgeIcon = "👑"; }
      else if (streakDays >= 14) { badgeName = "Master Speaker"; badgeIcon = "🌟"; }
      else if (streakDays >= 7) { badgeName = "Rising Star"; badgeIcon = "⚡"; }
      else if (streakDays >= 3) { badgeName = "First Steps"; badgeIcon = "🌱"; }
      else if (streakDays >= 1) { badgeName = "Momentum Builder"; badgeIcon = "🔥"; }

      let title = u.badge || `${badgeName} · ${streakDays}d`;

      const pts = Math.round(u.monthlyScore ?? u.points ?? (streakDays > 0 ? streakDays * 10 : 75));
      const weeklySubmissions = u.weeklySubmissions ?? (isUser ? (profile?.weeklySubmissions ?? 2) : 2);
      const isCompletedToday = Boolean(
        u.completed === true ||
        u.completedToday === true ||
        (u.lastScoreDate && new Date(u.lastScoreDate).toDateString() === new Date().toDateString() && u.completed !== false)
      );

      let time = isCompletedToday ? "Today" : "Pending";

      return {
        rank: rankNum,
        medal,
        name,
        initials,
        title,
        badgeName,
        badgeIcon,
        streakDays,
        pts,
        weeklySubmissions,
        isCompletedToday,
        time,
        isUser,
      };
    });
  }, [leaderboard, defaultLeaderboard, displayName, avatarInitials, user, profile, myStreakEntry]);

  const leaderboardRef = useRef(null);
  const animatedOnceRef = useRef(false);

  useEffect(() => {
    if (!leaderboardRef.current || animatedOnceRef.current) return;
    const rows = leaderboardRef.current.querySelectorAll(".leaderboard-row");
    if (rows && rows.length > 0) {
      animatedOnceRef.current = true;
      gsap.fromTo(
        rows,
        { opacity: 0, x: 16, scale: 0.98 },
        { opacity: 1, x: 0, scale: 1, stagger: 0.05, duration: 0.45, ease: "power2.out" }
      );
    }
  }, [currentLeaderboard]);

  // Title formatting: split into white serif and soft purple italic serif
  const topicTitle = today.topic || "The Unexpected Delivery";
  const titleParts = topicTitle.split(" ");
  const mainTitlePart = titleParts.length > 1 ? titleParts.slice(0, -1).join(" ") : titleParts[0];
  const italicTitlePart = titleParts.length > 1 ? titleParts[titleParts.length - 1] : "";

  return (
    <div className="speakshine-shell">
      {/* ── Audio element for playback ── */}
      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
        preload="metadata"
      />

      {/* ── Left Sidebar Navigation (Screenshot 1) ── */}
      <aside className="speakshine-sidebar">
        {/* Brand Header with Gold Star Logo */}
        <Link to="/dashboard" className="speakshine-sidebar-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L14.7 9.3L22 12L14.7 14.7L12 22L9.3 14.7L2 12L9.3 9.3L12 2Z"
              fill="url(#goldStarGrad)"
            />
            <defs>
              <linearGradient id="goldStarGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fbbf24" />
                <stop offset="1" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
          </svg>
          <span className="brand-logo-text">Speak &amp; Shine</span>
        </Link>

        {/* Navigation Items */}
        <nav className="speakshine-sidebar-nav">
          <Link to="/dashboard" className="speakshine-nav-item active">
            <span className="nav-icon">⏱</span>
            <span>Dashboard</span>
          </Link>
          <Link to="/record" className="speakshine-nav-item">
            <span className="nav-icon">📹</span>
            <span>Video analysis</span>
          </Link>
          <Link to="/community" className="speakshine-nav-item">
            <span className="nav-icon">👥</span>
            <span>Community</span>
          </Link>
          <Link to="/live/rooms" className="speakshine-nav-item">
            <span className="nav-icon">📡</span>
            <span>Live rooms</span>
          </Link>
          <Link to="/payment-history" className="speakshine-nav-item">
            <span className="nav-icon">💳</span>
            <span>Payments</span>
          </Link>
        </nav>

        {/* Freeze Tokens Bottom Box (Screenshot 1) */}
        <div className="speakshine-freeze-box">
          <div className="freeze-title">FREEZE TOKENS</div>
          <div className="freeze-val">
            {freezeTokens} <span style={{ fontSize: "1rem", color: "#7c7793", fontWeight: 500 }}>/ 2 Available</span>
          </div>
          <div className="freeze-desc">
            Earn tokens by completing 7-day streak milestones.
          </div>
          <div
            onClick={() => onOpenSettings ? onOpenSettings() : navigate("/payment")}
            className="freeze-link"
          >
            Account settings ↗
          </div>
        </div>
      </aside>

      {/* ── Main Content Canvas ── */}
      <div className="speakshine-main">
        {/* Top Header Bar (Screenshot 1) */}
        <header className="speakshine-topbar">
          <div className="speakshine-topbar-left">
            <span className="speakshine-topbar-greeting">
              Good {getGreeting()}, {displayName} 👋
            </span>
            <span className="speakshine-topbar-subtitle">
              Here's your speaking mission for today.
            </span>
          </div>

          <div className="speakshine-topbar-right">
            <div className="speakshine-pill streak">
              <span>🔥</span>
              <span>{streak} Day streak</span>
            </div>
            <div className="speakshine-pill points">
              <span style={{ color: "#fbbf24" }}>⭐</span>
              <span>{totalPoints} Points</span>
            </div>
            <ThemeToggle compact />
            <NotificationBell token={localStorage.getItem("token")} />
            <div
              className="speakshine-avatar"
              title={`${displayName} (${user?.email || ""})`}
              onClick={() => onOpenSettings ? onOpenSettings() : (onLogout ? onLogout() : navigate("/payment"))}
            >
              {avatarInitials}
            </div>
          </div>
        </header>

        {/* Canvas Body */}
        <main className="speakshine-canvas">
          {/* ── Section 1: Hero 2-Column Grid (Screenshot 1) ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.85fr) minmax(320px, 1fr)",
            gap: "1.25rem",
            marginBottom: "1.25rem",
          }}>
            {/* Left Challenge Card */}
            <div className="speakshine-hero-left-card" style={{
              background: "linear-gradient(145deg, #141026 0%, #0d0a18 100%)",
              border: "1px solid rgba(124, 111, 255, 0.25)",
              borderRadius: 18,
              padding: "1.75rem 2rem",
              position: "relative",
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
            }}>
              {/* Header: Live dot + Category pill */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#22c55e", boxShadow: "0 0 10px #22c55e",
                  }} />
                  <span style={{ fontSize: "0.74rem", fontWeight: 800, letterSpacing: "0.08em", color: "#22c55e", textTransform: "uppercase" }}>
                    LIVE NOW
                  </span>
                </div>
                <span style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  color: "#cbd5e1",
                  textTransform: "uppercase",
                }}>
                  {today.category || "STORY SUMMARY"}
                </span>
              </div>

              {/* Title with Editorial Serif Styling */}
              <h1 style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "2.35rem",
                fontWeight: 400,
                color: "#ffffff",
                lineHeight: 1.15,
                margin: "0 0 0.75rem 0",
                letterSpacing: "-0.01em",
              }}>
                {mainTitlePart}{" "}
                {italicTitlePart && (
                  <span style={{ fontStyle: "italic", color: "#c4b5fd" }}>
                    {italicTitlePart}
                  </span>
                )}
              </h1>

              {/* Synopsis / Story description */}
              <p style={{
                fontSize: "0.9rem",
                color: "#94a3b8",
                lineHeight: 1.55,
                marginBottom: "1.35rem",
                maxWidth: "680px",
              }}>
                {storyPrompt}
              </p>

              {/* Waveform Audio Player ("LISTEN FIRST") */}
              <div className="speakshine-audio-bar" style={{
                background: "rgba(10, 8, 18, 0.65)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: 12,
                padding: "0.75rem 1.1rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                marginBottom: "1.75rem",
              }}>
                <button
                  type="button"
                  onClick={togglePlay}
                  title={isPlaying ? "Pause audio" : "Play audio"}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: "#ffffff",
                    border: "none",
                    color: "#18122c",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(255,255,255,0.25)",
                    flexShrink: 0,
                    transition: "transform 0.15s ease",
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                >
                  {isPlaying ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: "2px" }}>
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </button>

                {/* Waveform Bars (Clickable Scrubbing) */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1, height: "32px", cursor: "pointer" }}>
                  {WAVE_PATTERN.map((height, i) => {
                    const isPassed = i <= activeWaveIndex;
                    return (
                      <div
                        key={i}
                        onClick={() => seekWaveform(i)}
                        title={`Seek to ${fmtTime((i / WAVE_PATTERN.length) * duration)}`}
                        style={{
                          flex: 1,
                          height: `${height}px`,
                          borderRadius: 2,
                          background: isPassed ? "#a78bfa" : "rgba(255, 255, 255, 0.12)",
                          transition: "background 0.15s ease",
                        }}
                      />
                    );
                  })}
                </div>

                <span style={{ fontSize: "0.78rem", color: "#7c7793", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmtTime(currentTime)} / {fmtTime(duration)}
                </span>
              </div>

              {/* Target Vocabulary Section (Matching Screenshot) */}
              <div style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <span style={{ fontSize: "1.05rem" }}>📚</span>
                    <span style={{ fontSize: "0.74rem", fontWeight: 800, letterSpacing: "0.08em", color: "#8b85a3", textTransform: "uppercase" }}>
                      TODAY'S VOCABULARY CHALLENGE
                    </span>
                  </div>
                  <div style={{
                    fontSize: "0.72rem", fontWeight: 700,
                    background: plannedCount >= 3 ? "rgba(74, 222, 128, 0.15)" : "rgba(124, 111, 255, 0.15)",
                    border: `1px solid ${plannedCount >= 3 ? "rgba(74, 222, 128, 0.4)" : "rgba(124, 111, 255, 0.3)"}`,
                    color: plannedCount >= 3 ? "#4ade80" : "#c4b5fd",
                    padding: "2px 8px", borderRadius: 99,
                  }}>
                    🎯 Goal: {plannedCount} / {Math.min(3, vocabList.length)} words (+30 pts)
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {vocabList.map((v, i) => {
                    const isPlanned = !!plannedWords[i];
                    const isSpeaking = speakingVocabIndex === i;
                    return (
                      <div
                        key={i}
                        className="vocab-card-pro"
                        style={{
                          background: isPlanned ? "rgba(34, 197, 94, 0.08)" : "rgba(255, 255, 255, 0.03)",
                          border: isPlanned ? "1px solid rgba(34, 197, 94, 0.35)" : "1px solid rgba(124, 111, 255, 0.16)",
                          borderRadius: 12,
                          padding: "0.85rem 1rem",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.2rem" }}>
                              <div className="vocab-num-badge">0{i + 1}</div>
                              <span className="vocab-word-title" style={{ fontWeight: 800, fontSize: "0.98rem", color: "#ffffff" }}>
                                {v.word}
                              </span>
                              {v.meaning && (
                                <span style={{ fontSize: "0.82rem", color: "#cbd5e1", fontWeight: 500, lineHeight: 1.4 }}>
                                  — {v.meaning}
                                </span>
                              )}
                            </div>

                            {v.example && (
                              <div className="vocab-example-bubble">
                                💬 <span style={{ fontStyle: "italic" }}>"{v.example}"</span>
                              </div>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexShrink: 0, marginTop: "2px" }}>
                            <button
                              type="button"
                              onClick={() => handleSpeakVocab(v.word, v.meaning, v.example, i)}
                              className="vocab-listen-btn"
                              title="Listen to full pronunciation and example sentence"
                              style={isSpeaking ? { background: "var(--primary, #7c6fff)", color: "#fff", transform: "scale(1.15)" } : {}}
                            >
                              {isSpeaking ? "🔊" : "🔈"}
                            </button>
                            <button
                              type="button"
                              onClick={() => togglePlanned(i)}
                              className="vocab-plan-btn"
                              style={{
                                background: isPlanned ? "rgba(74, 222, 128, 0.2)" : "rgba(255, 255, 255, 0.06)",
                                border: `1px solid ${isPlanned ? "rgba(74, 222, 128, 0.4)" : "rgba(255, 255, 255, 0.15)"}`,
                                color: isPlanned ? "#4ade80" : "#cbd5e1",
                                borderRadius: 8,
                                padding: "4px 8px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {isPlanned ? "✓ Planned" : "+ Plan to use"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: "0.75rem", fontSize: "0.74rem", color: "#8c87a2", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>✨</span>
                  <span>Speak naturally: past tense &amp; plurals are automatically recognized!</span>
                </div>
              </div>
            </div>

            {/* Right Action & Countdown Card (Screenshot 1) */}
            <div className="speakshine-hero-right-card" style={{
              background: "#0d0a18",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: 18,
              padding: "1.75rem",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#716c85", textTransform: "uppercase", marginBottom: "0.65rem" }}>
                  WINDOW CLOSES AT MIDNIGHT
                </div>

                {/* 3 Digital Countdown Timer Boxes (Screenshot 1) */}
                <MidnightCountdownTimer />

                {/* Streak Warning */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  fontSize: "0.8rem",
                  color: "#f87171",
                  fontWeight: 600,
                  marginBottom: "1.35rem",
                }}>
                  <span>⚠️</span>
                  <span>{streak > 0 ? `${streak}-day streak at risk! Submit before midnight to keep it alive.` : "Submit before midnight to start streak"}</span>
                </div>

                {/* Rules to Remember (Screenshot 1) */}
                <div className="speakshine-rules-box" style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: 12,
                  padding: "1rem",
                  marginBottom: "1.5rem",
                }}>
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#8b85a3", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                    RULES TO REMEMBER
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                    <div className="speakshine-rules-item" style={{ display: "flex", alignItems: "center", gap: "0.65rem", fontSize: "0.82rem", color: "#e2e8f0" }}>
                      <span style={{ color: "#22c55e", fontWeight: 800 }}>✓</span>
                      <span>Minimum 60 seconds speaking</span>
                    </div>
                    <div className="speakshine-rules-item" style={{ display: "flex", alignItems: "center", gap: "0.65rem", fontSize: "0.82rem", color: "#e2e8f0" }}>
                      <span style={{ color: "#22c55e", fontWeight: 800 }}>✓</span>
                      <span>Use at least 2 target words</span>
                    </div>
                    <div className="speakshine-rules-item" style={{ display: "flex", alignItems: "center", gap: "0.65rem", fontSize: "0.82rem", color: "#e2e8f0" }}>
                      <span style={{ color: "#22c55e", fontWeight: 800 }}>✓</span>
                      <span>No script reading - speak naturally</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Record & Upload */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", marginTop: "auto" }}>
                <button
                  type="button"
                  onClick={() => navigate("/record")}
                  style={{
                    width: "100%",
                    background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 12,
                    padding: "0.9rem",
                    fontWeight: 700,
                    fontSize: "0.92rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    boxShadow: "0 4px 20px rgba(249, 115, 22, 0.4)",
                    transition: "transform 0.15s ease",
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                >
                  <span style={{ fontSize: "1.1rem" }}>🎥</span>
                  <span>Record summary</span>
                </button>

                <button
                  type="button"
                  onClick={handleFileUploadClick}
                  className="speakshine-btn-secondary"
                  style={{
                    width: "100%",
                    background: "#181427",
                    color: "#cbd5e1",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 12,
                    padding: "0.8rem",
                    fontWeight: 600,
                    fontSize: "0.88rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#221c37"}
                  onMouseLeave={e => e.currentTarget.style.background = "#181427"}
                >
                  <span>📁</span>
                  <span>Upload a file</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,audio/*"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </div>

          {/* ── Section 2: 5 KPI Metrics Row (Screenshot 2) ── */}
          <div className="speakshine-kpi-bar" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "1rem",
            padding: "1.25rem 1.5rem",
            background: "#090712",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            borderRadius: 14,
            marginBottom: "1.25rem",
          }}>
            {/* KPI 1 */}
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#6b6680", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                CURRENT STREAK
              </div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em" }}>
                {streak} Days
              </div>
              <div style={{ fontSize: "0.74rem", color: "#f97316", fontWeight: 600, marginTop: "2px", display: "flex", alignItems: "center", gap: "3px" }}>
                <span>🔥</span>
                <span>+1 from yesterday</span>
              </div>
            </div>

            {/* KPI 2 */}
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#6b6680", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                TOTAL SESSIONS
              </div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em" }}>
                {scores.length || 2} Completed
              </div>
              <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginTop: "2px" }}>
                Top 40% of cohort
              </div>
            </div>

            {/* KPI 3 */}
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#6b6680", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                SPEAK TIME
              </div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em" }}>
                4m 32s
              </div>
              <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginTop: "2px" }}>
                Avg 2m 16s / session
              </div>
            </div>

            {/* KPI 4 */}
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#6b6680", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                THIS WEEK
              </div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.01em" }}>
                2/7 Days
              </div>
              <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginTop: "2px" }}>
                Active on Mon, Tue
              </div>
            </div>

            {/* KPI 5 */}
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#6b6680", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                LAST SESSION
              </div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#4ade80", letterSpacing: "-0.01em" }}>
                80/100
              </div>
              <div style={{ fontSize: "0.74rem", color: "#4ade80", marginTop: "2px" }}>
                +6 vs first session
              </div>
            </div>
          </div>

          {/* ── Section 3: Badge Milestone Banner (Screenshot 2) ── */}
          <div className="speakshine-card-box" style={{
            background: "#0d0a18",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            borderRadius: 14,
            padding: "1rem 1.5rem",
            marginBottom: "1.25rem",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#716c85", textTransform: "uppercase" }}>
                  BADGE MILESTONE
                </span>
                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fbbf24", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <span>🏅</span>
                  <span>Bronze Speaker</span>
                </span>
                <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                  · Keep a 3-day streak to earn Silver Speaker
                </span>
              </div>

              <div
                onClick={onOpenBadges}
                style={{ fontSize: "0.78rem", color: "#a78bfa", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                View all badges →
              </div>
            </div>

            {/* Glowing Horizontal Progress Bar */}
            <div style={{ position: "relative", height: 8, background: "rgba(255, 255, 255, 0.06)", borderRadius: 99, overflow: "hidden", marginBottom: "0.45rem" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0, width: "66%",
                background: "linear-gradient(90deg, #f59e0b, #fbbf24)",
                borderRadius: 99,
                boxShadow: "0 0 12px rgba(251, 191, 36, 0.4)",
              }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "#716c85" }}>
              <span>1 day remaining</span>
              <span>2 of 3 days</span>
            </div>
          </div>

          {/* ── Section 4: Performance Analytics & Leaderboard (Screenshots 3, 4, 5) ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.85fr) minmax(320px, 1fr)",
            gap: "1.25rem",
            alignItems: "start",
          }}>
            {/* Left Column: Performance Center with 3 Tabs */}
            <div className="speakshine-card-box" style={{
              background: "#0d0a18",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: 18,
              padding: "1.5rem",
            }}>
              {/* Header with Title & Tabs */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#716c85", textTransform: "uppercase" }}>
                  PERFORMANCE CENTER
                </div>

                <div style={{ display: "flex", gap: "0.35rem", background: "rgba(255, 255, 255, 0.03)", padding: 4, borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab("points")}
                    style={{
                      background: activeTab === "points" ? "#26203a" : "transparent",
                      color: activeTab === "points" ? "#ffffff" : "#7c7793",
                      border: "none",
                      borderRadius: 8,
                      padding: "0.4rem 0.9rem",
                      fontSize: "0.82rem",
                      fontWeight: activeTab === "points" ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Points
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("history")}
                    style={{
                      background: activeTab === "history" ? "#26203a" : "transparent",
                      color: activeTab === "history" ? "#ffffff" : "#7c7793",
                      border: "none",
                      borderRadius: 8,
                      padding: "0.4rem 0.9rem",
                      fontSize: "0.82rem",
                      fontWeight: activeTab === "history" ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Score history
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("sessions")}
                    style={{
                      background: activeTab === "sessions" ? "#26203a" : "transparent",
                      color: activeTab === "sessions" ? "#ffffff" : "#7c7793",
                      border: "none",
                      borderRadius: 8,
                      padding: "0.4rem 0.9rem",
                      fontSize: "0.82rem",
                      fontWeight: activeTab === "sessions" ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Sessions ({sessionsList.length})
                  </button>
                </div>
              </div>

              {/* Dynamic Subtitle per Tab */}
              <div style={{ fontSize: "0.82rem", color: "#8b85a3", marginBottom: "1.25rem" }}>
                {activeTab === "points" && "Points Progression - Track your daily score and cumulative growth over time."}
                {activeTab === "history" && "Skill Breakdown - Fluency, Grammar, Confidence, and Vocabulary trends across all submissions."}
                {activeTab === "sessions" && "Submission Log - All completed speaking challenges with detailed rubric breakdown."}
              </div>

              {/* Metric Averages Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                <div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#716c85", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    FLUENCY
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#ffffff" }}>
                    6.5 <span style={{ fontSize: "0.78rem", color: "#716c85", fontWeight: 400 }}>avg</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#716c85", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    GRAMMAR
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#ffffff" }}>
                    5.2 <span style={{ fontSize: "0.78rem", color: "#716c85", fontWeight: 400 }}>avg</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#716c85", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    CONFIDENCE
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#ffffff" }}>
                    6.6 <span style={{ fontSize: "0.78rem", color: "#716c85", fontWeight: 400 }}>avg</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#716c85", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    VOCABULARY
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#ffffff" }}>
                    5.6 <span style={{ fontSize: "0.78rem", color: "#716c85", fontWeight: 400 }}>avg</span>
                  </div>
                </div>
              </div>

              {/* Tab 1: Points Area Chart (Screenshot 3) */}
              {activeTab === "points" && (
                <div>
                  <div style={{ width: "100%", height: 230 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartPointsData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="purpleWaveGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                        <XAxis
                          dataKey="session"
                          stroke="#524d68"
                          fontSize={11}
                          tickLine={false}
                          interval={1}
                        />
                        <YAxis
                          stroke="#524d68"
                          fontSize={11}
                          domain={[0, 100]}
                          ticks={[0, 25, 50, 75, 100]}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div style={{ background: "#161226", border: "1px solid rgba(167, 139, 250, 0.4)", borderRadius: 8, padding: "6px 12px", fontSize: "0.8rem", color: "#fff" }}>
                                  <div>Session {label}</div>
                                  <div style={{ color: "#a78bfa", fontWeight: 700 }}>Score: {payload[0].value} pts</div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="pts"
                          stroke="#c084fc"
                          strokeWidth={2.5}
                          fill="url(#purpleWaveGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ fontSize: "0.74rem", color: "#716c85", marginTop: "1rem" }}>
                    <span style={{ color: "#c084fc" }}>●</span> Daily points, last 25 sessions · Average 85 · Best 94 · Sunday bonuses excluded
                  </div>
                </div>
              )}

              {/* Tab 2: Score History Multi-Line Chart (Screenshot 4) */}
              {activeTab === "history" && (
                <div>
                  <div style={{ width: "100%", height: 230 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartHistoryData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="session" stroke="#524d68" fontSize={11} tickLine={false} interval={1} />
                        <YAxis stroke="#524d68" fontSize={11} domain={[3, 10]} ticks={[3, 4, 5, 6, 7, 8, 9, 10]} tickLine={false} axisLine={false} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div style={{ background: "#141026", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 12px", fontSize: "0.78rem", minWidth: 140 }}>
                                  <div style={{ fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{label}</div>
                                  <div style={{ color: "#a78bfa" }}>■ Fluency: {payload.find(p => p.dataKey === "fluency")?.value}</div>
                                  <div style={{ color: "#4ade80" }}>■ Grammar: {payload.find(p => p.dataKey === "grammar")?.value}</div>
                                  <div style={{ color: "#fbbf24" }}>■ Confidence: {payload.find(p => p.dataKey === "confidence")?.value}</div>
                                  <div style={{ color: "#ff6b9d" }}>■ Vocabulary: {payload.find(p => p.dataKey === "vocabulary")?.value}</div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line type="monotone" dataKey="fluency" stroke="#a78bfa" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="grammar" stroke="#4ade80" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="confidence" stroke="#fbbf24" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="vocabulary" stroke="#ff6b9d" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ display: "flex", gap: "1.25rem", fontSize: "0.75rem", color: "#94a3b8", marginTop: "1rem", flexWrap: "wrap" }}>
                    <span><strong style={{ color: "#a78bfa" }}>●</strong> Fluency</span>
                    <span><strong style={{ color: "#4ade80" }}>●</strong> Grammar</span>
                    <span><strong style={{ color: "#fbbf24" }}>●</strong> Confidence</span>
                    <span><strong style={{ color: "#ff6b9d" }}>●</strong> Vocabulary</span>
                  </div>
                </div>
              )}

              {/* Tab 3: Sessions Paginated Table (Screenshot 5) */}
              {activeTab === "sessions" && (
                <div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)", color: "#716c85", textAlign: "left" }}>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase" }}>SESSION</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase" }}>DATE</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase" }}>RECORDED</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase" }}>FLUENCY</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase" }}>GRAMMAR</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase" }}>CONFIDENCE</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 700, fontSize: "0.68rem", textTransform: "uppercase" }}>VOCABULARY</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedSessions.map((s, idx) => (
                          <tr
                            key={idx}
                            onClick={() => onOpenReport && onOpenReport(s)}
                            style={{
                              borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                              color: "#e2e8f0",
                              cursor: "pointer",
                              transition: "background 0.15s ease",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <td style={{ padding: "0.75rem 0.5rem", color: "#94a3b8" }}>{s.session}</td>
                            <td style={{ padding: "0.75rem 0.5rem" }}>{s.date}</td>
                            <td style={{ padding: "0.75rem 0.5rem", color: "#94a3b8" }}>{s.duration}</td>
                            <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700, color: getScoreColor(s.fluency) }}>{s.fluency}/10</td>
                            <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700, color: getScoreColor(s.grammar) }}>{s.grammar}/10</td>
                            <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700, color: getScoreColor(s.confidence) }}>{s.confidence}/10</td>
                            <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700, color: getScoreColor(s.vocabulary) }}>{s.vocabulary}/10</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.4rem", marginTop: "1.25rem" }}>
                    <button
                      type="button"
                      disabled={sessionPage <= 1}
                      onClick={() => setSessionPage(p => Math.max(1, p - 1))}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        color: sessionPage <= 1 ? "#524d68" : "#94a3b8",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: "0.75rem",
                        cursor: sessionPage <= 1 ? "default" : "pointer",
                      }}
                    >
                      Prev
                    </button>

                    {Array.from({ length: Math.min(6, totalPages || 1) }, (_, i) => {
                      const pNum = i + 1;
                      const isActive = pNum === sessionPage;
                      return (
                        <button
                          key={pNum}
                          type="button"
                          onClick={() => setSessionPage(pNum)}
                          style={{
                            background: isActive ? "#ffffff" : "transparent",
                            color: isActive ? "#110e20" : "#94a3b8",
                            border: isActive ? "none" : "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: 6,
                            width: 28,
                            height: 28,
                            fontSize: "0.75rem",
                            fontWeight: isActive ? 800 : 500,
                            cursor: "pointer",
                          }}
                        >
                          {pNum}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      disabled={sessionPage >= totalPages}
                      onClick={() => setSessionPage(p => Math.min(totalPages, p + 1))}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        color: sessionPage >= totalPages ? "#524d68" : "#94a3b8",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: "0.75rem",
                        cursor: sessionPage >= totalPages ? "default" : "pointer",
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Leaderboard & Community Card (Screenshot 5) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Leaderboard Box */}
              <div
                ref={leaderboardRef}
                className="speakshine-card-box speakshine-leaderboard-box"
                style={{
                  background: "#0d0a18",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 20,
                  padding: "1.5rem",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: "0 12px 36px rgba(0, 0, 0, 0.5)",
                }}
              >
                {/* Header with Trophy Emblem & Cohort Switcher */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: "linear-gradient(135deg, rgba(251, 191, 36, 0.25), rgba(245, 158, 11, 0.1))",
                      border: "1px solid rgba(251, 191, 36, 0.4)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.95rem",
                      boxShadow: "0 2px 10px rgba(245, 158, 11, 0.2)",
                    }}>
                      🏆
                    </div>
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.08em", color: "#ffffff", textTransform: "uppercase" }}>
                        TODAY'S LEADERBOARD
                      </div>
                    </div>
                  </div>
                  <Link
                    to="/community"
                    className="leaderboard-group-btn"
                    style={{
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      color: "#c4b5fd",
                      textDecoration: "none",
                      background: "rgba(124, 111, 255, 0.12)",
                      border: "1px solid rgba(124, 111, 255, 0.28)",
                      padding: "4px 10px",
                      borderRadius: 99,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "rgba(124, 111, 255, 0.22)";
                      e.currentTarget.style.transform = "translateX(2px)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "rgba(124, 111, 255, 0.12)";
                      e.currentTarget.style.transform = "translateX(0)";
                    }}
                  >
                    <span>{groupName}</span>
                    <span style={{ fontSize: "0.85rem" }}>↗</span>
                  </Link>
                </div>

                {/* Subheader Status Pill */}
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: "#94a3b8",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  padding: "3px 9px",
                  borderRadius: 99,
                  marginBottom: "1.2rem",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                  <span>{groupName.toUpperCase()} · {memberCount} MEMBERS · {submittedCount} SUBMITTED · {pendingCount} PENDING</span>
                </div>

                {/* Ranked Peer Rows (Scrollable Container) */}
                <div
                  className="leaderboard-scroll-container"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.55rem",
                    marginBottom: currentLeaderboard.length > 5 ? "0.6rem" : "1.25rem",
                    maxHeight: "330px",
                    overflowY: "auto",
                    paddingRight: "4px",
                    scrollBehavior: "smooth",
                  }}
                >
                  {currentLeaderboard.map((u, i) => {
                    const isRank1 = i === 0;
                    const isRank2 = i === 1;
                    const isRank3 = i === 2;
                    const isUser = u.isUser;

                    const rowClass = isUser
                      ? "leaderboard-row user-row"
                      : isRank1
                      ? "leaderboard-row rank-1"
                      : isRank2
                      ? "leaderboard-row rank-2"
                      : isRank3
                      ? "leaderboard-row rank-3"
                      : "leaderboard-row standard-row";

                    const avatarBg = isRank1
                      ? "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)"
                      : isRank2
                      ? "linear-gradient(135deg, #cbd5e1 0%, #64748b 100%)"
                      : isRank3
                      ? "linear-gradient(135deg, #f97316 0%, #b45309 100%)"
                      : isUser
                      ? "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)"
                      : "linear-gradient(135deg, #334155 0%, #1e293b 100%)";

                    const avatarColor = isRank1 ? "#000000" : "#ffffff";
                    const avatarBorder = isRank1
                      ? "2px solid #fde68a"
                      : isRank2
                      ? "2px solid #e2e8f0"
                      : isRank3
                      ? "2px solid #fed7aa"
                      : isUser
                      ? "2px solid #c084fc"
                      : "1px solid rgba(255, 255, 255, 0.12)";

                    return (
                      <div
                        key={u.rank}
                        className={rowClass}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: isUser ? "0.8rem 0.95rem" : "0.7rem 0.85rem",
                          borderRadius: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                          {/* Rank / Medal Emblem */}
                          <div style={{
                            width: 24,
                            textAlign: "center",
                            fontSize: isRank1 || isRank2 || isRank3 ? "1.1rem" : "0.85rem",
                            fontWeight: 800,
                            color: isUser ? "#c084fc" : "#8b85a3",
                            flexShrink: 0,
                          }}>
                            {isRank1 ? "🥇" : isRank2 ? "🥈" : isRank3 ? "🥉" : isUser ? "👉" : u.rank}
                          </div>

                          {/* Avatar Circle */}
                          <div
                            className="leaderboard-avatar"
                            style={{
                              background: avatarBg,
                              color: avatarColor,
                              border: avatarBorder,
                              boxShadow: isRank1
                                ? "0 0 10px rgba(251, 191, 36, 0.4)"
                                : isUser
                                ? "0 0 12px rgba(168, 85, 247, 0.4)"
                                : "none",
                            }}
                          >
                            {u.initials || "S"}
                          </div>

                          {/* Name & Title */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: "0.88rem",
                              fontWeight: 700,
                              color: isUser ? "#ffffff" : isRank1 ? "#fef08a" : "#f1f0f5",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}>
                              <span>{u.name}</span>
                              {isRank1 && <span title="Current #1 Leader">👑</span>}
                              {isUser && (
                                <span style={{
                                  fontSize: "0.62rem",
                                  fontWeight: 800,
                                  background: "rgba(168, 85, 247, 0.3)",
                                  color: "#d8b4fe",
                                  border: "1px solid rgba(168, 85, 247, 0.5)",
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  letterSpacing: "0.05em",
                                }}>
                                  YOU
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#8e8a9f", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <span>{u.title}</span>
                            </div>
                          </div>
                        </div>

                        {/* Points & Submission Status (Pending or Completed) */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div
                            className="leaderboard-pts-badge"
                            style={{
                              color: isRank1 ? "#fbbf24" : isUser ? "#c084fc" : "#ffffff",
                              fontSize: "0.92rem",
                              fontWeight: 800,
                            }}
                          >
                            <span>{u.pts}</span>
                            <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#8e8a9f" }}>pts</span>
                          </div>
                          <div style={{
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            marginTop: "2px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            color: u.isCompletedToday ? "#4ade80" : "#fca5a5",
                          }}>
                            <span>{u.isCompletedToday ? "✅" : "⏳"}</span>
                            <span>{u.isCompletedToday ? "Completed" : "Pending"}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Scroll for more members button / indicator (Screenshot request) */}
                {currentLeaderboard.length > 5 && (
                  <div
                    className="leaderboard-scroll-hint"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.45rem",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: "#c4b5fd",
                      background: "rgba(124, 111, 255, 0.08)",
                      border: "1px dashed rgba(124, 111, 255, 0.3)",
                      borderRadius: 10,
                      padding: "6px 12px",
                      marginBottom: "1.1rem",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      userSelect: "none",
                    }}
                    onClick={() => {
                      const el = leaderboardRef.current?.querySelector(".leaderboard-scroll-container");
                      if (el) el.scrollBy({ top: 140, behavior: "smooth" });
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "rgba(124, 111, 255, 0.18)";
                      e.currentTarget.style.borderColor = "rgba(124, 111, 255, 0.55)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "rgba(124, 111, 255, 0.08)";
                      e.currentTarget.style.borderColor = "rgba(124, 111, 255, 0.3)";
                    }}
                    title="Click to scroll and see more group members"
                  >
                    <span>📜 Scroll for more members ({currentLeaderboard.length} members)</span>
                    <span style={{ fontSize: "0.85rem" }}>↓</span>
                  </div>
                )}

                {/* All-Time Record Callout */}
                <div
                  className="all-time-record-box"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.95rem 1.15rem",
                    borderRadius: 14,
                    background: "linear-gradient(135deg, rgba(28, 20, 14, 0.95) 0%, rgba(18, 14, 28, 0.95) 100%)",
                    border: "1px solid rgba(251, 191, 36, 0.28)",
                    boxShadow: "0 6px 20px rgba(245, 158, 11, 0.08)",
                    marginBottom: "1.1rem",
                    position: "relative",
                    overflow: "hidden",
                    transition: "transform 0.2s ease, border-color 0.2s ease",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.borderColor = "rgba(251, 191, 36, 0.5)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.borderColor = "rgba(251, 191, 36, 0.28)";
                  }}
                >
                  <div style={{
                    position: "absolute", top: 0, right: 0, bottom: 0, width: "35%",
                    background: "radial-gradient(ellipse at center, rgba(251, 191, 36, 0.12) 0%, transparent 70%)",
                    pointerEvents: "none",
                  }} />

                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: "0.4rem",
                      fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em",
                      color: "#fbbf24", textTransform: "uppercase", marginBottom: "3px",
                    }}>
                      <span>⭐</span>
                      <span>ALL-TIME GROUP RECORD</span>
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#f1f0f5", fontWeight: 600 }}>
                      {recordHolder} · <span style={{ color: "#94a3b8", fontWeight: 500 }}>{recordDate}</span>
                    </div>
                  </div>

                  <div style={{
                    position: "relative", zIndex: 1,
                    display: "flex", alignItems: "baseline", gap: "3px",
                  }}>
                    <span style={{
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: "2.35rem",
                      fontWeight: 800,
                      background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      lineHeight: 1,
                      filter: "drop-shadow(0 2px 8px rgba(245, 158, 11, 0.35))",
                    }}>
                      {recordScore}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#fbbf24" }}>{recordUnit === "d" ? "streak" : "pts"}</span>
                  </div>
                </div>

                {/* Group Member Stats: 3 Micro-Cards */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.6rem",
                  textAlign: "center",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  paddingTop: "0.9rem",
                }}>
                  <div style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: 10,
                    padding: "0.55rem 0.4rem",
                  }}>
                    <div style={{ color: "#716c85", fontSize: "0.63rem", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.06em" }}>MEMBERS</div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#ffffff", marginTop: "2px" }}>{memberCount}</div>
                  </div>
                  <div style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: 10,
                    padding: "0.55rem 0.4rem",
                  }}>
                    <div style={{ color: "#716c85", fontSize: "0.63rem", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.06em" }}>SUBMITTED</div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#ffffff", marginTop: "2px" }}>{submittedCount}</div>
                  </div>
                  <div style={{
                    background: "rgba(239, 68, 68, 0.06)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: 10,
                    padding: "0.55rem 0.4rem",
                  }}>
                    <div style={{ color: "#fca5a5", fontSize: "0.63rem", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.06em" }}>PENDING</div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#f87171", marginTop: "2px" }}>{pendingCount}</div>
                  </div>
                </div>
              </div>


            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
