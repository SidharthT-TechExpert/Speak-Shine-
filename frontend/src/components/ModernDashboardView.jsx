import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts";
import NotificationBell from "./NotificationBell.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import Modal from "./Modal.jsx";
import gsap from "gsap";
import { getBadgeForStreak, getBadgeProgress, STREAK_BADGES } from "../utils/streakBadges.js";

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

// ── Drop Countdown Timer for 12 AM Reset Period (Counts down to posterSendTime, e.g. 08:00 AM IST) ──
function MissionDropCountdownTimer({ posterSendTime = "08:00" }) {
  const calc = () => {
    const now = new Date();
    const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const [h, m] = (posterSendTime || "08:00").split(":").map(Number);
    const target = new Date(nowIST);
    target.setHours(h, m, 0, 0);

    const diffSec = Math.floor((target - nowIST) / 1000);
    const isDue = diffSec <= 0;
    const absDiff = Math.max(0, diffSec);

    const hrs = String(Math.floor(absDiff / 3600)).padStart(2, "0");
    const mins = String(Math.floor((absDiff % 3600) / 60)).padStart(2, "0");
    const secs = String(absDiff % 60).padStart(2, "0");
    return { hrs, mins, secs, isDue, absDiff };
  };

  const [t, setT] = useState(calc);

  useEffect(() => {
    const interval = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(interval);
  }, [posterSendTime]);

  if (t.isDue) {
    return (
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.85rem",
        padding: "0.85rem 1.25rem",
        borderRadius: 14,
        background: "rgba(249, 115, 22, 0.12)",
        border: "1px solid rgba(249, 115, 22, 0.35)",
        margin: "1rem 0",
      }}>
        <span style={{ fontSize: "1.5rem" }}>⚡</span>
        <div>
          <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#f97316" }}>
            Mission Launching Shortly
          </div>
          <div style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
            The AI trainer is finalizing today's topic &amp; vocabulary. Please refresh momentarily!
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", margin: "1.1rem 0 1.25rem" }}>
      <div className="speakshine-timer-box" style={{
        background: "#141024",
        border: "1px solid rgba(249, 115, 22, 0.45)",
        boxShadow: "0 4px 20px rgba(249, 115, 22, 0.15)",
        borderRadius: 12,
        padding: "0.85rem 1.15rem",
        textAlign: "center",
        minWidth: 64,
      }}>
        <div className="speakshine-timer-val" style={{ fontSize: "2.1rem", fontWeight: 800, color: "#ffffff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {t.hrs}
        </div>
        <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginTop: "5px", letterSpacing: "0.09em" }}>
          HRS
        </div>
      </div>

      <span style={{ fontSize: "1.6rem", fontWeight: 800, color: "rgba(249, 115, 22, 0.7)", paddingBottom: "14px" }}>:</span>

      <div className="speakshine-timer-box" style={{
        background: "#141024",
        border: "1px solid rgba(249, 115, 22, 0.45)",
        boxShadow: "0 4px 20px rgba(249, 115, 22, 0.15)",
        borderRadius: 12,
        padding: "0.85rem 1.15rem",
        textAlign: "center",
        minWidth: 64,
      }}>
        <div className="speakshine-timer-val" style={{ fontSize: "2.1rem", fontWeight: 800, color: "#ffffff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {t.mins}
        </div>
        <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginTop: "5px", letterSpacing: "0.09em" }}>
          MINS
        </div>
      </div>

      <span style={{ fontSize: "1.6rem", fontWeight: 800, color: "rgba(249, 115, 22, 0.7)", paddingBottom: "14px" }}>:</span>

      <div className="speakshine-timer-box" style={{
        background: "#141024",
        border: "1px solid rgba(249, 115, 22, 0.45)",
        boxShadow: "0 4px 20px rgba(249, 115, 22, 0.15)",
        borderRadius: 12,
        padding: "0.85rem 1.15rem",
        textAlign: "center",
        minWidth: 64,
      }}>
        <div className="speakshine-timer-val" style={{ fontSize: "2.1rem", fontWeight: 800, color: "#ffffff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {t.secs}
        </div>
        <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", marginTop: "5px", letterSpacing: "0.09em" }}>
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
  posterSendTime: propPosterSendTime,
  badges = {},
  onOpenBadges,
  onOpenSettings,
  onOpenReport,
  onLogout,
}) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem("token");
      navigate("/login");
    }
  };

  // ── Tabs for Performance Center: "points", "history", "sessions" ────────────
  const [activeTab, setActiveTab] = useState("points");
  const [sessionPage, setSessionPage] = useState(1);
  const SESSION_PAGE_SIZE = 6;

  // ── Milestone Roadmap View Mode: "sprint" (active tier default) | "roadmap" (macro landmarks) ──
  const [roadmapViewMode, setRoadmapViewMode] = useState("sprint");

  // ── Audio Player & Waveform State ───────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(104); // Default 1:44 as in screenshot
  const audioRef = useRef(null);

  const targetPosterSendTime = today.posterSendTime || propPosterSendTime || "08:00";

  const formatDropTime = (timeStr) => {
    const [hh, mm] = (timeStr || "08:00").split(":");
    const h = parseInt(hh, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${displayH}:${mm || "00"} ${ampm} IST`;
  };

  // The daily speaking challenge is active only when published for today with valid content
  const isQuestionActive = Boolean(
    today?.questionSent && (today?.topic || today?.question || today?.prompt)
  );

  const storyPrompt = today.prompt || today.question || today.topic || "Maya ordered a book on pottery but received an antique wooden puzzle box instead. With no return address and a strange riddle carved on the base, she spent her Saturday trying to solve it rather than packing for her move.";
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
  const streak = profile.streak != null ? profile.streak : (myStreakEntry?.streak ?? (streakRecord?.currentStreak ?? (streakRecord?.streak ?? 2)));
  const totalPoints = Math.round(
    profile.totalPoints ?? profile.monthlyScore ?? (stats?.totalPoints || scores.reduce((sum, s) => sum + (s.points || s.total || 0), 0) || (streak * 10) || 160)
  );
  const freezeTokens = profile.streakFreeze ?? 0;

  // Determine if today's challenge/task has been submitted
  const nowISTDateStr = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toDateString();
  const isTodaySubmitted = Boolean(
    profile?.completedToday === true ||
    profile?.completed === true ||
    today?.submitted === true ||
    today?.isSubmitted === true ||
    (scores.length > 0 && scores.some(s => {
      const d = s.createdAt || s.date || s.submittedAt;
      if (!d) return false;
      const sISTDateStr = new Date(new Date(d).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toDateString();
      return sISTDateStr === nowISTDateStr;
    }))
  );

  // Find latest/today's score for today's points display
  const todayScoreObj = scores.slice().reverse().find(s => {
    const d = s.createdAt || s.date || s.submittedAt;
    if (!d) return false;
    const sISTDateStr = new Date(new Date(d).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toDateString();
    return sISTDateStr === nowISTDateStr;
  }) || scores[scores.length - 1];

  const todayPoints = todayScoreObj?.points != null
    ? Math.round(todayScoreObj.points)
    : (todayScoreObj?.total != null ? Math.round(todayScoreObj.total) : 85);

  // Dynamic milestone progress using official 20 streak badges
  const milestone = getBadgeProgress(streak);

  const displayName = user?.name || profile?.name || "Jane Doe";
  const avatarInitials = displayName.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase() || "JD";
  const isLoggedIn = Boolean(user && profile?.name !== "Preview User");

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
      navigate("/record#video-studio-container", { state: { file } });
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
    { rank: 1, medal: "🥇", name: "~Fayiz✨", streak: 120, pts: 684, time: "2h ago", isUser: false, initials: "FZ" },
    { rank: 2, medal: "🥈", name: "Shabeer😉", streak: 110, pts: 682, time: "3h ago", isUser: false, initials: "SH" },
    { rank: 3, medal: "🥉", name: "Abdul Fathah", streak: 65, pts: 617, time: "4h ago", isUser: false, initials: "AF" },
    { rank: 4, medal: "👉", name: `${displayName} (You)`, streak: profile?.streak != null ? profile.streak : 4, pts: Math.round(profile?.monthlyScore || 599), time: "Yesterday", isUser: true, initials: avatarInitials || "YOU" },
    { rank: 5, medal: "5", name: "Muhammed Nabhan", streak: 6, pts: 417, time: "Yesterday", isUser: false, initials: "MN" },
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

    // Separate active streak speakers (streak > 0) from 0-day speakers.
    // Active speakers should always appear above 0-day speakers.
    const getStreak = (item) => {
      if (item.streak != null) return Number(item.streak);
      if (item.title) {
        const match = item.title.match(/(\d+)\s*d/);
        if (match) return parseInt(match[1], 10);
      }
      if (isUserItem(item)) {
        return Number(profile?.streak ?? 0);
      }
      return 0;
    };

    itemsToDisplay.sort((a, b) => {
      const streakA = getStreak(a);
      const streakB = getStreak(b);
      const hasStreakA = streakA > 0;
      const hasStreakB = streakB > 0;

      // Active streak speakers always sort above 0-day speakers
      if (hasStreakA && !hasStreakB) return -1;
      if (!hasStreakA && hasStreakB) return 1;

      // When both are in the same streak tier (both active or both 0d):
      // Sort by monthlyScore descending, then by streak descending
      const scoreA = a.monthlyScore ?? a.points ?? 0;
      const scoreB = b.monthlyScore ?? b.points ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (streakB !== streakA) return streakB - streakA;
      return 0;
    });

    let activeRankCounter = 0;

    return itemsToDisplay.map((u, i) => {
      const isUser = isUserItem(u);
      const name = isUser ? (u.name?.includes("(You)") ? u.name : `${displayName} (You)`) : u.name;
      const streakDays = getStreak(u);
      const hasActiveStreak = streakDays > 0;

      let rankNum = null;
      let medal = "—";

      if (hasActiveStreak) {
        activeRankCounter += 1;
        rankNum = activeRankCounter;
        medal = rankNum === 1 ? "🥇" : rankNum === 2 ? "🥈" : rankNum === 3 ? "🥉" : isUser ? "👉" : String(rankNum);
      } else {
        rankNum = null;
        medal = "—";
      }

      const initials = isUser ? (avatarInitials || "YOU") : getInitials(name);

      const streakBadge = hasActiveStreak ? getBadgeForStreak(streakDays) : null;
      const badgeName = hasActiveStreak ? (streakBadge ? streakBadge.name : "Active Speaker") : "No rank";
      const badgeIcon = hasActiveStreak ? (streakBadge ? streakBadge.icon : "🌱") : "⚪";
      const title = `${badgeName} · ${streakDays}d`;

      const pts = Math.round(u.monthlyScore ?? u.points ?? (streakDays > 0 ? streakDays * 10 : 75));
      const weeklySubmissions = u.weeklySubmissions ?? (isUser ? (profile?.weeklySubmissions ?? 2) : 2);
      const isCompletedToday = Boolean(
        u.completed === true ||
        u.completedToday === true ||
        (u.lastScoreDate && new Date(u.lastScoreDate).toDateString() === new Date().toDateString() && u.completed !== false)
      );

      let time = u.time;
      if (!time) {
        if (isCompletedToday) time = "Today";
        else if (streakDays > 0) time = "Yesterday";
        else time = "Today";
      }

      return {
        id: u.userId || u._id || u.phone || `${name}-${i}`,
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
  const topicTitle = today.topic || today.question || (isQuestionActive ? "The Unexpected Delivery" : "Speaking Challenge");
  const titleParts = topicTitle.split(" ");
  const mainTitlePart = titleParts.length > 1 ? titleParts.slice(0, -1).join(" ") : titleParts[0];
  const italicTitlePart = titleParts.length > 1 ? titleParts[titleParts.length - 1] : "";

  return (
    <div className="speakshine-shell">
      {/* ── Logout confirmation modal ── */}
      {showLogoutModal && (
        <Modal
          type="danger"
          title="Log Out"
          message="Are you sure you want to log out?"
          confirmText="Log Out"
          cancelText="Stay"
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}

      {/* ── Audio element for playback (only rendered when challenge is active) ── */}
      {isQuestionActive && (
        <audio
          ref={audioRef}
          src={audioSrc}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleAudioEnded}
          preload="metadata"
        />
      )}

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
            {freezeTokens} <span style={{ fontSize: "1rem", color: "#7c7793", fontWeight: 500 }}>Available</span>
          </div>
          <div className="freeze-desc">
            Earn tokens by completing 7-day streak milestones.
          </div>
          {isLoggedIn && (
            <button
              type="button"
              onClick={handleLogout}
              className="freeze-link speakshine-sidebar-logout"
              title="Log Out"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
              <span>Log out</span>
            </button>
          )}
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
              {isTodaySubmitted
                ? "🎉 Today's speaking mission accomplished! Your streak is secured."
                : isQuestionActive
                ? "Here's your speaking mission for today."
                : `Daily reset complete · Next speaking challenge drops at ${formatDropTime(targetPosterSendTime)}`}
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
            {isLoggedIn && (
              <div
                className="speakshine-avatar disabled"
                title={`${displayName} (${user?.email || ""})`}
              >
                {avatarInitials}
              </div>
            )}
          </div>
        </header>

        {/* Canvas Body */}
        <main className="speakshine-canvas">
          {/* ── Section 1: Hero Section (Submitted Accomplishment OR Active Question OR 12 AM Reset Countdown Layout) ── */}
          {isTodaySubmitted ? (
            /* ── Section 1A: Daily Mission Accomplishment Hero Setup (Submitted Users) ── */
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.85fr) minmax(320px, 1fr)",
              gap: "1.25rem",
              marginBottom: "1.25rem",
            }}>
              {/* Left Accomplishment Card */}
              <div className="speakshine-hero-left-card" style={{
                background: "linear-gradient(145deg, #0d2818 0%, #081a10 50%, #0f172a 100%)",
                border: "1px solid rgba(74, 222, 128, 0.35)",
                boxShadow: "0 12px 40px rgba(16, 185, 129, 0.15)",
                borderRadius: 18,
                padding: "2rem",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                overflow: "hidden",
              }}>
                {/* Decorative background glow */}
                <div style={{
                  position: "absolute",
                  top: -80,
                  right: -80,
                  width: 260,
                  height: 260,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(34, 197, 94, 0.18) 0%, transparent 70%)",
                  pointerEvents: "none",
                }} />

                <div>
                  {/* Top Header: Mission Completed Pill + Verified Badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{
                        width: 9, height: 9, borderRadius: "50%",
                        background: "#4ade80", boxShadow: "0 0 12px #4ade80",
                      }} />
                      <span style={{ fontSize: "0.76rem", fontWeight: 800, letterSpacing: "0.08em", color: "#4ade80", textTransform: "uppercase" }}>
                        MISSION COMPLETE · SUBMISSION VERIFIED
                      </span>
                    </div>
                    <span style={{
                      background: "rgba(34, 197, 94, 0.15)",
                      border: "1px solid rgba(74, 222, 128, 0.4)",
                      borderRadius: 9999,
                      padding: "4px 12px",
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      color: "#86efac",
                      textTransform: "uppercase",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}>
                      <span>✓</span> TODAY'S TASK DONE
                    </span>
                  </div>

                  {/* Headline: Editorial serif */}
                  <h1 className="story-title-heading" style={{
                    fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
                    fontSize: "2.35rem",
                    fontWeight: 700,
                    lineHeight: 1.15,
                    margin: "0 0 0.65rem 0",
                    letterSpacing: "-0.02em",
                    color: "#ffffff",
                  }}>
                    Terrific Speaking, <span className="story-title-italic" style={{ color: "#86efac", fontStyle: "italic", fontWeight: 400 }}>{displayName.split(" ")[0]}! 🌟</span>
                  </h1>

                  {/* Motivational celebration text */}
                  <p style={{
                    fontSize: "0.94rem",
                    color: "#cbd5e1",
                    lineHeight: 1.6,
                    marginBottom: "1.5rem",
                    maxWidth: "680px",
                  }}>
                    You've successfully completed and submitted today's daily speaking challenge! Your recording was analyzed, attendance is marked, and your streak is locked in and protected until tomorrow.
                  </p>

                  {/* 4 Accomplishment Highlights Grid */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
                    gap: "0.75rem",
                    marginBottom: "1.5rem",
                  }}>
                    <div style={{
                      background: "rgba(0, 0, 0, 0.35)",
                      border: "1px solid rgba(74, 222, 128, 0.25)",
                      borderRadius: 12,
                      padding: "0.85rem 1rem",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "1.3rem", marginBottom: "0.25rem" }}>✅</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>Submitted</div>
                      <div style={{ fontSize: "0.64rem", fontWeight: 700, color: "#86efac", textTransform: "uppercase", marginTop: "3px" }}>Daily Task</div>
                    </div>

                    <div style={{
                      background: "rgba(0, 0, 0, 0.35)",
                      border: "1px solid rgba(249, 115, 22, 0.3)",
                      borderRadius: 12,
                      padding: "0.85rem 1rem",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "1.3rem", marginBottom: "0.25rem" }}>🔥</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>{streak} Days</div>
                      <div style={{ fontSize: "0.64rem", fontWeight: 700, color: "#fb923c", textTransform: "uppercase", marginTop: "3px" }}>Streak Safe</div>
                    </div>

                    <div style={{
                      background: "rgba(0, 0, 0, 0.35)",
                      border: "1px solid rgba(251, 191, 36, 0.3)",
                      borderRadius: 12,
                      padding: "0.85rem 1rem",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "1.3rem", marginBottom: "0.25rem" }}>⭐</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>+{todayPoints} pts</div>
                      <div style={{ fontSize: "0.64rem", fontWeight: 700, color: "#fcd34d", textTransform: "uppercase", marginTop: "3px" }}>Earned Today</div>
                    </div>

                    <div style={{
                      background: "rgba(0, 0, 0, 0.35)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: 12,
                      padding: "0.85rem 1rem",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "1.3rem", marginBottom: "0.25rem" }}>🏅</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>{milestone?.currentBadge?.name || "Speaker"}</div>
                      <div style={{ fontSize: "0.64rem", fontWeight: 700, color: "#c084fc", textTransform: "uppercase", marginTop: "3px" }}>Active Rank</div>
                    </div>
                  </div>

                  {/* Submission Context Preview (Topic + Vocab Used) */}
                  <div style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.07)",
                    borderRadius: 12,
                    padding: "1rem 1.25rem",
                    marginBottom: "1.5rem",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                      <div style={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" }}>
                        CHALLENGE TOPIC SUBMITTED
                      </div>
                      <span style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: 700 }}>✓ Scored by AI</span>
                    </div>
                    <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.65rem" }}>
                      "{topicTitle}"
                    </div>

                    {/* Target Vocab Pills */}
                    {vocabList && vocabList.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
                        <span style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginRight: "4px" }}>
                          VOCABULARY:
                        </span>
                        {vocabList.map((v, i) => (
                          <span
                            key={i}
                            style={{
                              background: "rgba(34, 197, 94, 0.12)",
                              border: "1px solid rgba(74, 222, 128, 0.3)",
                              borderRadius: 6,
                              padding: "2px 8px",
                              fontSize: "0.74rem",
                              fontWeight: 600,
                              color: "#86efac",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                            }}
                          >
                            <span>✓</span> {v.word}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.85rem", marginTop: "auto" }}>
                  <button
                    type="button"
                    onClick={() => navigate("/record#report-section")}
                    style={{
                      background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 12,
                      padding: "0.85rem 1.4rem",
                      fontWeight: 700,
                      fontSize: "0.92rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.55rem",
                      boxShadow: "0 4px 18px rgba(34, 197, 94, 0.35)",
                      transition: "transform 0.15s ease",
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                  >
                    <span>📊</span>
                    <span>View Speech Feedback &amp; Scorecard</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/community")}
                    className="speakshine-btn-secondary"
                    style={{
                      background: "#181427",
                      color: "#cbd5e1",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: 12,
                      padding: "0.85rem 1.25rem",
                      fontWeight: 600,
                      fontSize: "0.88rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span>👥</span>
                    <span>Community Feed</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("community-leaderboard-section");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }}
                    style={{
                      background: "transparent",
                      color: "#94a3b8",
                      border: "none",
                      padding: "0.85rem 1rem",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <span>🏆</span> Leaderboard Rank
                  </button>
                </div>
              </div>

              {/* Right: Streak Security & Daily Mission Status Card */}
              <div className="speakshine-hero-right-card" style={{
                background: "linear-gradient(145deg, #120e24 0%, #0d0918 100%)",
                border: "1px solid rgba(74, 222, 128, 0.25)",
                borderRadius: 18,
                padding: "1.75rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: "0 12px 40px rgba(0, 0, 0, 0.4)",
              }}>
                <div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#86efac", textTransform: "uppercase", marginBottom: "0.85rem" }}>
                    DAILY MISSION STATUS
                  </div>

                  {/* Luminous Streak Shield Box */}
                  <div style={{
                    background: "rgba(34, 197, 94, 0.08)",
                    border: "1px solid rgba(74, 222, 128, 0.3)",
                    borderRadius: 14,
                    padding: "1.1rem",
                    marginBottom: "1.25rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.85rem",
                  }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      background: "rgba(34, 197, 94, 0.18)",
                      border: "1px solid rgba(74, 222, 128, 0.5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.6rem",
                      flexShrink: 0,
                      boxShadow: "0 0 16px rgba(34, 197, 94, 0.25)",
                    }}>
                      🛡️
                    </div>
                    <div>
                      <div style={{ fontSize: "1rem", fontWeight: 800, color: "#ffffff", marginBottom: "2px" }}>
                        Streak Locked &amp; Protected!
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#86efac", lineHeight: 1.4 }}>
                        Your {streak}-day streak is 100% safe. No fine or streak loss will occur tonight.
                      </div>
                    </div>
                  </div>

                  {/* Countdown to Next Drop */}
                  <div style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: 12,
                    padding: "0.85rem 1rem",
                    marginBottom: "1.25rem",
                  }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.45rem" }}>
                      NEXT CHALLENGE CYCLE
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "#cbd5e1" }}>
                      Next speaking mission drops tomorrow at <strong style={{ color: "#ffffff" }}>{formatDropTime(targetPosterSendTime)} IST</strong>. Take today to rest your vocal cords!
                    </div>
                  </div>

                  {/* Checklist of Completed Requirements */}
                  <div style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: 12,
                    padding: "1rem",
                    marginBottom: "1.25rem",
                  }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                      TODAY'S VERIFIED CHECKLIST
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", fontSize: "0.82rem", color: "#e2e8f0" }}>
                        <span style={{ color: "#4ade80", fontWeight: 800 }}>✓</span>
                        <span>Speaking video recorded &amp; uploaded</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", fontSize: "0.82rem", color: "#e2e8f0" }}>
                        <span style={{ color: "#4ade80", fontWeight: 800 }}>✓</span>
                        <span>Target vocabulary integrated in speech</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", fontSize: "0.82rem", color: "#e2e8f0" }}>
                        <span style={{ color: "#4ade80", fontWeight: 800 }}>✓</span>
                        <span>Fluency, grammar &amp; vocabulary scored</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", fontSize: "0.82rem", color: "#e2e8f0" }}>
                        <span style={{ color: "#4ade80", fontWeight: 800 }}>✓</span>
                        <span>Streak preserved &amp; milestone points credited</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Optional Studio Practice Link */}
                <div style={{ marginTop: "auto" }}>
                  <button
                    type="button"
                    onClick={() => navigate("/record#video-studio-container")}
                    className="speakshine-btn-secondary"
                    style={{
                      width: "100%",
                      background: "#181427",
                      color: "#cbd5e1",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: 12,
                      padding: "0.75rem",
                      fontWeight: 600,
                      fontSize: "0.84rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.45rem",
                    }}
                  >
                    <span>🎙️</span>
                    <span>Practice Extra Take in Studio (Optional)</span>
                  </button>
                  <div style={{ fontSize: "0.7rem", color: "#64748b", textAlign: "center", marginTop: "6px" }}>
                    Extra takes won't overwrite your completed score.
                  </div>
                </div>
              </div>
            </div>
          ) : isQuestionActive ? (
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

              {/* Title with Premium Editorial Serif — Playfair Display */}
              <h1 className="story-title-heading" style={{
                fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
                fontSize: "2.4rem",
                fontWeight: 700,
                lineHeight: 1.15,
                margin: "0 0 0.75rem 0",
                letterSpacing: "-0.02em",
              }}>
                {mainTitlePart}{" "}
                {italicTitlePart && (
                  <span className="story-title-italic">
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
                  className="audio-play-btn"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
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
                        className={`audio-wave-bar ${isPassed ? "active" : ""}`}
                        onClick={() => seekWaveform(i)}
                        title={`Seek to ${fmtTime((i / WAVE_PATTERN.length) * duration)}`}
                        style={{
                          flex: 1,
                          height: `${height}px`,
                          borderRadius: 2,
                          transition: "background 0.15s ease",
                        }}
                      />
                    );
                  })}
                </div>

                <span className="audio-time-val" style={{ fontSize: "0.78rem", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmtTime(currentTime)} / {fmtTime(duration)}
                </span>
              </div>

              {/* Target Vocabulary Section (Matching Screenshot) */}
              <div style={{ marginTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <span style={{ fontSize: "1.05rem" }}>📚</span>
                    <span className="vocab-section-title">
                      TODAY'S VOCABULARY CHALLENGE
                    </span>
                  </div>
                  <div
                    className={`vocab-goal-pill ${plannedCount >= 3 ? "goal-met" : ""}`}
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 99,
                      transition: "all 0.15s ease",
                    }}
                  >
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
                        className={`vocab-card-pro ${isPlanned ? "planned" : ""}`}
                        style={{
                          borderRadius: 12,
                          padding: "0.85rem 1rem",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.2rem" }}>
                              <div className="vocab-num-badge">0{i + 1}</div>
                              <span className="vocab-word-title" style={{ fontWeight: 800, fontSize: "0.98rem" }}>
                                {v.word}
                              </span>
                              {v.meaning && (
                                <span className="vocab-meaning-text">
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
                              className={`vocab-plan-btn ${isPlanned ? "planned" : ""}`}
                              style={{
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

                <div className="vocab-footer-hint">
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
                  onClick={() => navigate("/record#video-studio-container")}
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
                  <span>Upload summary</span>
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
          ) : (
            /* ── Daily 12 AM Reset: Rearranged Mission Countdown & Readiness Hero ── */
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.85fr) minmax(320px, 1fr)",
              gap: "1.25rem",
              marginBottom: "1.25rem",
            }}>
              {/* Left: Countdown & Rest Card */}
              <div className="speakshine-hero-left-card" style={{
                background: "linear-gradient(145deg, #141026 0%, #0d0a18 100%)",
                border: "1px solid rgba(124, 111, 255, 0.25)",
                borderRadius: 18,
                padding: "2rem",
                position: "relative",
                boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}>
                <div>
                  {/* Top Status Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "#a78bfa", boxShadow: "0 0 10px #a78bfa",
                      }} />
                      <span style={{ fontSize: "0.74rem", fontWeight: 800, letterSpacing: "0.08em", color: "#a78bfa", textTransform: "uppercase" }}>
                        DAILY RESET COMPLETE
                      </span>
                    </div>
                    <span style={{
                      background: "rgba(249, 115, 22, 0.1)",
                      border: "1px solid rgba(249, 115, 22, 0.3)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      color: "#fb923c",
                      textTransform: "uppercase",
                    }}>
                      WINDOW OPENS AT {formatDropTime(targetPosterSendTime)}
                    </span>
                  </div>

                  {/* Title with Serif Font */}
                  <h1 className="story-title-heading" style={{
                    fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
                    fontSize: "2.35rem",
                    fontWeight: 700,
                    lineHeight: 1.15,
                    margin: "0 0 0.75rem 0",
                    letterSpacing: "-0.02em",
                    color: "#ffffff",
                  }}>
                    Today's Challenge <span className="story-title-italic" style={{ color: "#c084fc", fontStyle: "italic", fontWeight: 400 }}>Unlocks Soon</span>
                  </h1>

                  {/* Reset Description */}
                  <p style={{
                    fontSize: "0.92rem",
                    color: "#94a3b8",
                    lineHeight: 1.6,
                    marginBottom: "1.25rem",
                    maxWidth: "640px",
                  }}>
                    The daily 12:00 AM reset has finished. Yesterday's submission window has closed and all streaks have been updated. Take a break to rest your vocal cords — today's speaking mission drops in:
                  </p>

                  {/* High Precision Countdown Timer */}
                  <MissionDropCountdownTimer posterSendTime={targetPosterSendTime} />

                  {/* Streak Status Notice */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.07)",
                    borderRadius: 12,
                    padding: "0.85rem 1.15rem",
                    marginTop: "1.25rem",
                    fontSize: "0.86rem",
                  }}>
                    <span style={{ fontSize: "1.35rem" }}>{streak > 0 ? "🔥" : "✨"}</span>
                    <div>
                      <span style={{ color: streak > 0 ? "#fbbf24" : "#ffffff", fontWeight: 700 }}>
                        {streak > 0 ? `${streak}-Day Streak Active & Protected` : "Ready to Start Day 1!"}
                      </span>
                      <span style={{ color: "#94a3b8", marginLeft: "0.4rem" }}>
                        {streak > 0
                          ? "Your streak is preserved after midnight reset. Submit once the new mission unlocks to keep it alive."
                          : "Be ready when today's prompt unlocks to begin your speaking journey."}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick actions while waiting */}
                <div style={{
                  display: "flex",
                  gap: "0.75rem",
                  marginTop: "1.75rem",
                  flexWrap: "wrap",
                }}>
                  <button
                    type="button"
                    onClick={() => navigate("/record")}
                    style={{
                      background: "rgba(124, 111, 255, 0.12)",
                      border: "1px solid rgba(124, 111, 255, 0.3)",
                      color: "#c4b5fd",
                      borderRadius: 10,
                      padding: "0.65rem 1rem",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(124, 111, 255, 0.22)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(124, 111, 255, 0.12)"}
                  >
                    <span>📹</span>
                    <span>Review Past Video Feedback</span>
                  </button>

                  <button
                    type="button"
                    onClick={onOpenBadges}
                    style={{
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.09)",
                      color: "#e2e8f0",
                      borderRadius: 10,
                      padding: "0.65rem 1rem",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"}
                  >
                    <span>⭐</span>
                    <span>Badge Progress ({milestone.currentDays}/{milestone.targetDays}d)</span>
                  </button>
                </div>
              </div>

              {/* Right: Daily Protocol & Warm-Up Card */}
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
                  <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#716c85", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                    DAILY SPEAKING PROTOCOL
                  </div>

                  {/* Daily Rhythm Timeline */}
                  <div style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: 12,
                    padding: "0.85rem 1rem",
                    marginBottom: "1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.55rem",
                    fontSize: "0.78rem",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#4ade80" }}>
                      <span>🌙 12:00 AM Midnight</span>
                      <span style={{ fontWeight: 700, fontSize: "0.72rem", background: "rgba(74, 222, 128, 0.12)", padding: "2px 6px", borderRadius: 4 }}>Reset Done ✓</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fb923c" }}>
                      <span>🌅 {formatDropTime(targetPosterSendTime)}</span>
                      <span style={{ fontWeight: 700, fontSize: "0.72rem", background: "rgba(249, 115, 22, 0.12)", padding: "2px 6px", borderRadius: 4 }}>Upcoming ⏳</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#94a3b8" }}>
                      <span>⏰ 11:59 PM Midnight</span>
                      <span style={{ fontSize: "0.72rem" }}>Deadline</span>
                    </div>
                  </div>

                  {/* Rules to Remember */}
                  <div className="speakshine-rules-box" style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: 12,
                    padding: "1rem",
                    marginBottom: "1.25rem",
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

                  {/* Warm-Up Advice */}
                  <div style={{
                    borderLeft: "3px solid #7c6fff",
                    padding: "0.65rem 0.85rem",
                    background: "rgba(124, 111, 255, 0.05)",
                    borderRadius: "0 8px 8px 0",
                    fontSize: "0.78rem",
                    color: "#cbd5e1",
                    lineHeight: 1.45,
                  }}>
                    <div style={{ fontWeight: 700, color: "#a78bfa", marginBottom: "3px" }}>💡 Pre-Recording Warm-up</div>
                    Take a deep breath and articulate the 5 vowel sounds (A-E-I-O-U) clearly. Relaxed facial muscles lead to higher confidence scores!
                  </div>
                </div>

                {/* Studio Lock Notice */}
                <div style={{
                  marginTop: "1.5rem",
                  padding: "0.9rem",
                  borderRadius: 12,
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px dashed rgba(255, 255, 255, 0.1)",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "0.8rem", color: "#716c85", fontWeight: 600 }}>
                    🔒 Recording Studio &amp; Uploads unlock when today's mission goes live
                  </div>
                </div>
              </div>
            </div>
          )}

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

            {/* KPI 5: Dynamic Today's Points if submitted, else Total Points */}
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: "#6b6680", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                {isTodaySubmitted ? "TODAY'S POINTS" : "TOTAL POINTS"}
              </div>
              <div style={{
                fontSize: "1.35rem",
                fontWeight: 700,
                color: isTodaySubmitted ? "#4ade80" : "#fbbf24",
                letterSpacing: "-0.01em"
              }}>
                {isTodaySubmitted ? `${todayPoints} pts` : `${totalPoints} pts`}
              </div>
              <div style={{
                fontSize: "0.74rem",
                color: isTodaySubmitted ? "#4ade80" : "#94a3b8",
                marginTop: "2px",
                fontWeight: isTodaySubmitted ? 600 : 400
              }}>
                {isTodaySubmitted ? "✓ Challenge completed today" : "Pending today's submission"}
              </div>
            </div>
          </div>

          {/* ── Section 3: Universal Dynamic Milestone Roadmap Graph (Suitable for Any Range) ── */}
          {(() => {
            const currentBadge = milestone.currentBadge;
            const nextBadge = milestone.nextBadge;
            const currentDays = streak;
            const targetDays = nextBadge ? nextBadge.days : (currentBadge?.days || 7);
            const startDays = currentBadge ? currentBadge.days : 0;
            const remainingDays = Math.max(0, targetDays - currentDays);
            const overallPercent = targetDays > 0 ? Math.min(100, Math.max(0, Math.round((currentDays / targetDays) * 100))) : 100;
            const tierSpan = Math.max(1, targetDays - startDays);
            const tierProgress = Math.max(0, currentDays - startDays);
            const tierPercent = Math.min(100, Math.max(0, Math.round((tierProgress / tierSpan) * 100)));

            // ── Dynamic Node Generator for ANY Range ────────────────────────
            const nodes = [];

            // If targetDays <= 14, sprint starts at 1 so early milestones (e.g. 7d, 10d) always show a complete, rich track
            const sprintFromDay = targetDays <= 14 ? 1 : Math.max(1, startDays);

            if (roadmapViewMode === "sprint" && targetDays > sprintFromDay) {
              // SPRINT VIEW: Micro progression focusing on the active milestone sprint
              const span = targetDays - sprintFromDay;
              const sprintDays = [];
              if (span <= 12) {
                for (let d = sprintFromDay; d <= targetDays; d++) {
                  if (d > 0) sprintDays.push(d);
                }
              } else {
                // Step evenly through the active tier so it never looks crowded or empty
                const step = Math.max(1, Math.round(span / 7));
                const s = new Set([sprintFromDay, currentDays, targetDays].filter(d => d > 0));
                for (let d = sprintFromDay; d <= targetDays; d += step) {
                  if (d > 0) s.add(d);
                }
                sprintDays.push(...Array.from(s).sort((a, b) => a - b));
              }

              sprintDays.forEach(d => {
                const isCompleted = d < currentDays;
                const isCurrent = d === currentDays && currentDays > 0;
                const isTarget = d === targetDays;
                const badgeOnDay = STREAK_BADGES.find(b => b.days === d);
                nodes.push({
                  day: d,
                  isCompleted,
                  isCurrent,
                  isTarget,
                  badge: badgeOnDay || (d === startDays ? currentBadge : isTarget ? nextBadge : null),
                  label: isCurrent ? "Today" : isTarget ? "Goal" : d === currentDays + 1 ? "Next" : "",
                });
              });
            } else {
              // ROADMAP VIEW: Macro landmark progression suitable for any streak (1 to 730 days)
              if (targetDays <= 8) {
                // Small milestone range (e.g. 1 to 7): show all discrete days
                for (let d = 1; d <= targetDays; d++) {
                  const isCompleted = d < currentDays;
                  const isCurrent = d === currentDays && currentDays > 0;
                  const isTarget = d === targetDays;
                  const badgeOnDay = STREAK_BADGES.find(b => b.days === d);
                  nodes.push({
                    day: d,
                    isCompleted,
                    isCurrent,
                    isTarget,
                    badge: badgeOnDay,
                    label: isCurrent ? "Today" : isTarget ? "Goal" : d === currentDays + 1 ? "Next" : "",
                  });
                }
              } else {
                // Dynamic multi-stage checkpoint distribution for medium to large ranges:
                // 1. Landmark historical badges achieved in history
                const earnedBadges = STREAK_BADGES.filter(b => b.days < currentDays);
                const landmarkDays = [];
                if (earnedBadges.length <= 3) {
                  landmarkDays.push(...earnedBadges.map(b => b.days));
                } else {
                  // Pick first, middle, and latest earned landmark badges
                  landmarkDays.push(earnedBadges[0].days);
                  const midIdx = Math.floor(earnedBadges.length / 2);
                  landmarkDays.push(earnedBadges[midIdx].days);
                  landmarkDays.push(earnedBadges[earnedBadges.length - 1].days);
                }

                // 2. Upcoming stepping stone checkpoints between currentDays and targetDays (avoids large voids)
                const remaining = targetDays - currentDays;
                const upcomingSteps = [];
                if (remaining >= 8) {
                  const s1 = Math.round(currentDays + remaining * 0.35);
                  const s2 = Math.round(currentDays + remaining * 0.70);
                  upcomingSteps.push(s1, s2);
                } else if (remaining >= 4) {
                  const s1 = Math.round(currentDays + remaining * 0.50);
                  upcomingSteps.push(s1);
                }

                // Merge into sorted unique checkpoints
                const candidateSet = new Set([1, ...landmarkDays, currentDays, ...upcomingSteps, targetDays].filter(d => d > 0));
                const sortedDays = Array.from(candidateSet).sort((a, b) => a - b);

                sortedDays.forEach(d => {
                  const isCompleted = d < currentDays;
                  const isCurrent = d === currentDays && currentDays > 0;
                  const isTarget = d === targetDays;
                  const badgeOnDay = STREAK_BADGES.find(b => b.days === d);
                  const daysToNode = d - currentDays;
                  let label = "";
                  if (isCurrent) label = "Today";
                  else if (isTarget) label = "Goal";
                  else if (d === 1) label = "Start";
                  else if (isCompleted) label = "Earned";
                  else if (daysToNode > 0) label = `+${daysToNode}d`;

                  nodes.push({
                    day: d,
                    isCompleted,
                    isCurrent,
                    isTarget,
                    badge: badgeOnDay || (d === startDays ? currentBadge : isTarget ? nextBadge : null),
                    label,
                  });
                });
              }
            }

            // Mathematical position of the progress fill line
            const currentIndex = nodes.findIndex(n => n.isCurrent);
            const fillWidthPercent = nodes.length > 1 && currentIndex >= 0
              ? Math.min(100, Math.max(0, (currentIndex / (nodes.length - 1)) * 100))
              : (currentDays >= targetDays ? 100 : overallPercent);

            return (
              <div className="speakshine-card-box" style={{
                background: "linear-gradient(145deg, #0d0a1b 0%, #080612 100%)",
                border: "1px solid rgba(167, 139, 250, 0.14)",
                borderRadius: 18,
                padding: "1.35rem 1.6rem",
                marginBottom: "1.25rem",
                boxShadow: "0 10px 32px rgba(0, 0, 0, 0.45)",
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Subtle decorative background glow */}
                <div style={{
                  position: "absolute",
                  right: "-40px",
                  top: "-40px",
                  width: 220,
                  height: 220,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(249, 115, 22, 0.08) 0%, rgba(167, 139, 250, 0) 70%)",
                  pointerEvents: "none",
                }} />

                {/* ── Header: Title, Range Mode Switcher, & Badges Modal Link ── */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1.2rem",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      letterSpacing: "0.09em",
                      color: "#f59e0b",
                      background: "rgba(245, 158, 11, 0.12)",
                      border: "1px solid rgba(245, 158, 11, 0.28)",
                      borderRadius: 6,
                      padding: "3px 9px",
                      textTransform: "uppercase"
                    }}>
                      STREAK ROADMAP
                    </span>

                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffffff" }}>
                      Journey to {nextBadge ? `${nextBadge.icon} ${nextBadge.name}` : "🏆 Speech Legend"}
                    </span>
                  </div>

                  {/* Mode Switcher & View All Badges */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                    {targetDays > 3 && (
                      <div style={{
                        display: "inline-flex",
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: 8,
                        padding: 2,
                        gap: 2,
                      }}>
                        <button
                          type="button"
                          onClick={() => setRoadmapViewMode("sprint")}
                          style={{
                            border: "none",
                            borderRadius: 6,
                            padding: "3px 9px",
                            fontSize: "0.72rem",
                            fontWeight: roadmapViewMode === "sprint" ? 700 : 500,
                            background: roadmapViewMode === "sprint" ? "rgba(167, 139, 250, 0.2)" : "transparent",
                            color: roadmapViewMode === "sprint" ? "#c084fc" : "#94a3b8",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          ⚡ Active Sprint ({targetDays <= 14 ? `1–${targetDays}d` : (startDays > 0 ? `${startDays}–${targetDays}d` : `1–${targetDays}d`)})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoadmapViewMode("roadmap")}
                          style={{
                            border: "none",
                            borderRadius: 6,
                            padding: "3px 9px",
                            fontSize: "0.72rem",
                            fontWeight: roadmapViewMode === "roadmap" ? 700 : 500,
                            background: roadmapViewMode === "roadmap" ? "rgba(249, 115, 22, 0.2)" : "transparent",
                            color: roadmapViewMode === "roadmap" ? "#f97316" : "#94a3b8",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          🏆 Full Roadmap (1–{targetDays}d)
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={onOpenBadges}
                      style={{
                        background: "rgba(167, 139, 250, 0.08)",
                        border: "1px solid rgba(167, 139, 250, 0.25)",
                        borderRadius: 8,
                        padding: "0.35rem 0.85rem",
                        fontSize: "0.78rem",
                        color: "#c084fc",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = "rgba(167, 139, 250, 0.18)";
                        e.currentTarget.style.color = "#ffffff";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = "rgba(167, 139, 250, 0.08)";
                        e.currentTarget.style.color = "#c084fc";
                      }}
                    >
                      <span>View all 20 badges</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>

                {/* ── Milestone Cards: Current Tier vs Target Goal ── */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "0.85rem",
                  marginBottom: "1.4rem",
                }}>
                  {/* Card 1: Current Unlocked Tier */}
                  <div style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.07)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "rgba(74, 222, 128, 0.12)",
                      border: "1px solid rgba(74, 222, 128, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.35rem",
                      flexShrink: 0,
                    }}>
                      {currentBadge ? currentBadge.icon : "🌱"}
                    </div>
                    <div>
                      <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        CURRENT BADGE (UNLOCKED ✓)
                      </div>
                      <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "#ffffff", marginTop: "1px" }}>
                        {currentBadge ? currentBadge.name : "Starting Speaker"}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                        {currentBadge ? `${currentBadge.days}-Day streak achieved` : "Start speaking daily"}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Target Next Milestone */}
                  <div style={{
                    background: "rgba(249, 115, 22, 0.05)",
                    border: "1px solid rgba(249, 115, 22, 0.25)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "rgba(249, 115, 22, 0.15)",
                      border: "1px solid rgba(249, 115, 22, 0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.35rem",
                      flexShrink: 0,
                    }}>
                      {nextBadge ? nextBadge.icon : "🏆"}
                    </div>
                    <div>
                      <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        NEXT MILESTONE (TARGET)
                      </div>
                      <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "#ffffff", marginTop: "1px" }}>
                        {nextBadge ? nextBadge.name : "Max Tier Unlocked"}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#fdba74" }}>
                        {nextBadge ? `Requires ${nextBadge.days}-day streak · ${remainingDays} days left` : "All milestones unlocked"}
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Exact Streak Progress Status */}
                  <div style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.07)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "rgba(167, 139, 250, 0.12)",
                      border: "1px solid rgba(167, 139, 250, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.25rem",
                      flexShrink: 0,
                    }}>
                      ⚡
                    </div>
                    <div>
                      <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#c084fc", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        OVERALL PROGRESS
                      </div>
                      <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "#ffffff", marginTop: "1px" }}>
                        {currentDays} of {targetDays} Days ({overallPercent}%)
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                        {remainingDays > 0 ? `${remainingDays} more consecutive days needed` : "Milestone reached!"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Stepped Visual Roadmap Track (Dynamic for Any Range) ── */}
                <div style={{
                  position: "relative",
                  padding: "1.2rem 1.2rem 2.8rem",
                  background: "rgba(0, 0, 0, 0.25)",
                  borderRadius: 14,
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                  overflowX: "auto",
                }}>
                  <div style={{ minWidth: nodes.length <= 7 ? "auto" : 620, position: "relative" }}>
                    {/* Connecting Rail - positioned exactly through vertical center of nodes (top: 20px) */}
                    <div style={{
                      position: "absolute",
                      left: 20,
                      right: 20,
                      top: 20,
                      height: 6,
                      background: "rgba(255, 255, 255, 0.08)",
                      borderRadius: 99,
                      zIndex: 1,
                    }}>
                      {/* Active Fill Segment: Ends with pixel precision at the current active node */}
                      <div style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${fillWidthPercent}%`,
                        background: "linear-gradient(90deg, #10b981 0%, #f59e0b 60%, #f97316 100%)",
                        borderRadius: 99,
                        boxShadow: "0 0 12px rgba(249, 115, 22, 0.6)",
                        transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                      }} />
                    </div>

                    {/* Checkpoint Nodes */}
                    <div style={{
                      position: "relative",
                      zIndex: 2,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}>
                      {nodes.map((node, i) => {
                        const isDone = node.isCompleted;
                        const isCur = node.isCurrent;
                        const isTgt = node.isTarget;
                        const hasBadge = Boolean(node.badge);

                        return (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              position: "relative",
                              width: 60,
                              textAlign: "center",
                            }}
                            title={node.badge ? `${node.badge.icon} Day ${node.day}: ${node.badge.name}` : `Day ${node.day} Checkpoint`}
                          >
                            {/* Milestone Icon Pill (Floating above node) */}
                            <div style={{
                              height: 18,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginBottom: 2,
                            }}>
                              {hasBadge ? (
                                <span style={{
                                  fontSize: "0.75rem",
                                  filter: isDone || isCur ? "drop-shadow(0 0 4px rgba(255,255,255,0.4))" : "grayscale(0.8)",
                                }}>
                                  {node.badge.icon}
                                </span>
                              ) : node.day === 1 ? (
                                <span style={{ fontSize: "0.68rem" }}>🚩</span>
                              ) : (
                                <span style={{ fontSize: "0.64rem", opacity: 0.4 }}>📍</span>
                              )}
                            </div>

                            {/* Node Circle (Centered on the 20px line: 40px height centered at 20px) */}
                            <div style={{
                              width: isCur ? 40 : (isTgt ? 36 : 30),
                              height: isCur ? 40 : (isTgt ? 36 : 30),
                              borderRadius: "50%",
                              background: isCur
                                ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)"
                                : isDone
                                ? "#064e3b"
                                : isTgt
                                ? "#1c1436"
                                : "#120f21",
                              border: isCur
                                ? "3px solid #ffffff"
                                : isDone
                                ? "2px solid #22c55e"
                                : isTgt
                                ? "2px dashed #f59e0b"
                                : "2px solid rgba(255, 255, 255, 0.16)",
                              boxShadow: isCur
                                ? "0 0 20px rgba(249, 115, 22, 0.8), 0 0 0 4px rgba(249, 115, 22, 0.3)"
                                : isDone
                                ? "0 0 8px rgba(34, 197, 94, 0.4)"
                                : "none",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#ffffff",
                              fontSize: isCur ? "1.05rem" : (isDone ? "0.8rem" : "0.72rem"),
                              fontWeight: 800,
                              cursor: "default",
                              transition: "all 0.25s ease",
                              flexShrink: 0,
                            }}>
                              {isCur ? "🔥" : isDone ? "✓" : isTgt ? "🎯" : node.day}
                            </div>

                            {/* Day Number Label Below */}
                            <div style={{
                              marginTop: 6,
                              fontSize: isCur ? "0.78rem" : "0.72rem",
                              fontWeight: isCur ? 800 : 600,
                              color: isCur ? "#f97316" : isDone ? "#4ade80" : isTgt ? "#f59e0b" : "#716c85",
                              whiteSpace: "nowrap",
                            }}>
                              Day {node.day}
                            </div>

                            {/* Subtitle Status Tag */}
                            {node.label && (
                              <div style={{
                                marginTop: 2,
                                fontSize: "0.6rem",
                                fontWeight: 800,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: isCur ? "#f97316" : isTgt ? "#f59e0b" : isDone ? "#4ade80" : "#94a3b8",
                                background: isCur
                                  ? "rgba(249, 115, 22, 0.15)"
                                  : isTgt
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : isDone
                                  ? "rgba(34, 197, 94, 0.12)"
                                  : "transparent",
                                padding: isCur || isTgt || isDone ? "1px 5px" : "0",
                                borderRadius: 4,
                                whiteSpace: "nowrap",
                              }}>
                                {node.label}
                              </div>
                            )}

                            {/* Milestone Badge Name */}
                            {hasBadge && (
                              <div style={{
                                marginTop: 3,
                                fontSize: "0.62rem",
                                fontWeight: 700,
                                color: node.badge.color || "#cbd5e1",
                                maxWidth: 70,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }} title={node.badge.name}>
                                {node.badge.name}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* ── Footer Progress Summary Bar ── */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.76rem",
                  color: "#94a3b8",
                  paddingTop: "0.85rem",
                  marginTop: "0.85rem",
                  borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                  flexWrap: "wrap",
                  gap: "0.6rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <span style={{ color: "#f97316", fontWeight: 700 }}>🔥 {currentDays}-Day Active Streak</span>
                    <span>·</span>
                    <span style={{ color: "#cbd5e1" }}>
                      {remainingDays > 0
                        ? `Practice tomorrow to reach Day ${currentDays + 1} (${remainingDays} days to ${nextBadge?.name || "next badge"})`
                        : "🎉 Target unlocked! Claim your new badge"}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>Progress:</span>
                    <span style={{ color: "#ffffff", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {currentDays} / {targetDays} Days
                    </span>
                    <div style={{
                      width: 70,
                      height: 6,
                      background: "rgba(255, 255, 255, 0.08)",
                      borderRadius: 99,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${overallPercent}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #10b981, #f97316)",
                        borderRadius: 99,
                      }} />
                    </div>
                    <span style={{
                      color: "#f97316",
                      fontWeight: 800,
                      fontSize: "0.74rem",
                    }}>
                      {overallPercent}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

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
                <div className="perf-center-title" style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  PERFORMANCE CENTER
                </div>

                <div className="perf-tab-wrapper" style={{ display: "flex", gap: "0.35rem", padding: 4, borderRadius: 10 }}>
                  <button
                    type="button"
                    className={`perf-tab-btn${activeTab === "points" ? " active" : ""}`}
                    onClick={() => setActiveTab("points")}
                    style={{
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
                    className={`perf-tab-btn${activeTab === "history" ? " active" : ""}`}
                    onClick={() => setActiveTab("history")}
                    style={{
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
                    className={`perf-tab-btn${activeTab === "sessions" ? " active" : ""}`}
                    onClick={() => setActiveTab("sessions")}
                    style={{
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
              <div className="perf-center-subtitle" style={{ fontSize: "0.82rem", marginBottom: "1.25rem" }}>
                {activeTab === "points" && "Points Progression - Track your daily score and cumulative growth over time."}
                {activeTab === "history" && "Skill Breakdown - Fluency, Grammar, Confidence, and Vocabulary trends across all submissions."}
                {activeTab === "sessions" && "Submission Log - All completed speaking challenges with detailed rubric breakdown."}
              </div>

              {/* Metric Averages Row */}
              <div className="perf-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                <div className="perf-metric-card">
                  <div className="perf-metric-label" style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    FLUENCY
                  </div>
                  <div className="perf-metric-val" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
                    6.5 <span className="perf-metric-sub" style={{ fontSize: "0.78rem", fontWeight: 400 }}>avg</span>
                  </div>
                </div>

                <div className="perf-metric-card">
                  <div className="perf-metric-label" style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    GRAMMAR
                  </div>
                  <div className="perf-metric-val" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
                    5.2 <span className="perf-metric-sub" style={{ fontSize: "0.78rem", fontWeight: 400 }}>avg</span>
                  </div>
                </div>

                <div className="perf-metric-card">
                  <div className="perf-metric-label" style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    CONFIDENCE
                  </div>
                  <div className="perf-metric-val" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
                    6.6 <span className="perf-metric-sub" style={{ fontSize: "0.78rem", fontWeight: 400 }}>avg</span>
                  </div>
                </div>

                <div className="perf-metric-card">
                  <div className="perf-metric-label" style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                    VOCABULARY
                  </div>
                  <div className="perf-metric-val" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
                    5.6 <span className="perf-metric-sub" style={{ fontSize: "0.78rem", fontWeight: 400 }}>avg</span>
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

                  <div className="chart-footer-note" style={{ fontSize: "0.74rem", marginTop: "1rem" }}>
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

                  <div className="chart-legend-row" style={{ display: "flex", gap: "1.25rem", fontSize: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
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
                        <tr className="perf-session-header-row" style={{ textAlign: "left" }}>
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
                            className="perf-session-row"
                            style={{
                              cursor: "pointer",
                              transition: "background 0.15s ease",
                            }}
                          >
                            <td className="sub-text" style={{ padding: "0.75rem 0.5rem" }}>{s.session}</td>
                            <td style={{ padding: "0.75rem 0.5rem" }}>{s.date}</td>
                            <td className="sub-text" style={{ padding: "0.75rem 0.5rem" }}>{s.duration}</td>
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
                      <div className="leaderboard-header-title" style={{ fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
                      textDecoration: "none",
                      padding: "4px 10px",
                      borderRadius: 99,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = "translateX(2px)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = "translateX(0)";
                    }}
                  >
                    <span>{groupName}</span>
                    <span style={{ fontSize: "0.85rem" }}>↗</span>
                  </Link>
                </div>

                {/* Subheader Status Pill */}
                <div className="leaderboard-sub-pill" style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  fontSize: "0.7rem",
                  fontWeight: 600,
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
                    const isRank1 = u.rank === 1;
                    const isRank2 = u.rank === 2;
                    const isRank3 = u.rank === 3;
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
                        key={u.id || `${u.name}-${i}`}
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
                          <div
                            className="leaderboard-rank-num"
                            style={{
                              width: 24,
                              textAlign: "center",
                              fontSize: isRank1 || isRank2 || isRank3 ? "1.1rem" : "0.85rem",
                              fontWeight: 800,
                              flexShrink: 0,
                            }}
                          >
                            {u.medal}
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
                            <div
                              className="leaderboard-name"
                              style={{
                                fontSize: "0.88rem",
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              <span>{u.name}</span>
                              {isRank1 && <span title="Current #1 Leader">👑</span>}
                              {isUser && (
                                <span
                                  className="leaderboard-you-badge"
                                  style={{
                                    fontSize: "0.62rem",
                                    fontWeight: 800,
                                    padding: "1px 5px",
                                    borderRadius: 4,
                                    letterSpacing: "0.05em",
                                  }}
                                >
                                  YOU
                                </span>
                              )}
                            </div>
                            <div
                              className="leaderboard-subtitle"
                              style={{ fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                            >
                              <span>{u.title}</span>
                            </div>
                          </div>
                        </div>

                        {/* Points & Time with Status Icon */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div
                            className="leaderboard-pts-badge"
                            style={{
                              fontSize: "0.92rem",
                              fontWeight: 800,
                            }}
                          >
                            <span className="leaderboard-pts-num">{u.pts}</span>
                            <span className="leaderboard-pts-label" style={{ fontSize: "0.72rem", fontWeight: 600 }}>pts</span>
                          </div>
                          <div style={{
                            fontSize: "0.8rem",
                            marginTop: "2px",
                            lineHeight: 1,
                          }}>
                            <span title={u.isCompletedToday ? "Completed today" : "Pending submission"}>
                              {u.isCompletedToday ? "✅" : "⏳"}
                            </span>
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
                <div className="leaderboard-stat-grid" style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.6rem",
                  textAlign: "center",
                  paddingTop: "0.9rem",
                }}>
                  <div className="leaderboard-stat-card members-card" style={{
                    borderRadius: 10,
                    padding: "0.55rem 0.4rem",
                  }}>
                    <div className="leaderboard-stat-label">MEMBERS</div>
                    <div className="leaderboard-stat-val">{memberCount}</div>
                  </div>
                  <div className="leaderboard-stat-card submitted-card" style={{
                    borderRadius: 10,
                    padding: "0.55rem 0.4rem",
                  }}>
                    <div className="leaderboard-stat-label">SUBMITTED</div>
                    <div className="leaderboard-stat-val">{submittedCount}</div>
                  </div>
                  <div className="leaderboard-stat-card pending-card" style={{
                    borderRadius: 10,
                    padding: "0.55rem 0.4rem",
                  }}>
                    <div className="leaderboard-stat-label">PENDING</div>
                    <div className="leaderboard-stat-val">{pendingCount}</div>
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
