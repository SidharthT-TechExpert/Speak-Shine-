import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import ModernDashboardView from "../components/ModernDashboardView.jsx";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import GuestBanner from "../components/GuestBanner.jsx";
import StreakBadge from "../components/StreakBadge.jsx";
import { useGsapEntrance, AnimatedNumber } from "../hooks/useGsapStagger.jsx";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Area, AreaChart,
} from "recharts";
import { STREAK_BADGES } from "../utils/streakBadges.js";

const MOTIVATIONAL = [
  "Every great speaker started exactly where you are. 🌟",
  "Your voice has the power to inspire. Use it today! 💪",
  "Consistency beats perfection. Show up every day. 🔥",
  "The best time to practice was yesterday. The second best is now. ⚡",
  "Fluency is built one video at a time. You've got this! 🎯",
  "Champions don't wait for the perfect moment — they create it. 🏆",
  "Your streak is your superpower. Keep it alive! 🚀",
  "Speak with confidence. The world is ready to listen. 🌍",
];

const CELEBRATION_MESSAGES = [
  "You're unstoppable! Another day, another victory! 🏆",
  "Consistency is your superpower! Keep shining! ✨",
  "You showed up today — that's what champions do! 💪",
  "Your dedication is inspiring! Tomorrow awaits! 🌟",
  "Another brick in your success story! Well done! 🎯",
  "You're building something amazing, one day at a time! 🚀",
  "Excellence is a habit, and you're mastering it! 💎",
  "Your commitment today shapes your fluency tomorrow! 🔥",
];

const SCORES = { fluency: "#7c6fff", grammar: "#4ade80", confidence: "#fbbf24", vocabulary: "#ff6b9d" };

function QuestionCountdown({ posterSendTime, name, streak }) {
  const [remaining, setRemaining] = useState(null);
  const [quote] = useState(() => MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)]);
  const timerRef = useRef(null);

  const calcRemaining = () => {
    const now = new Date();
    // Convert current time to IST
    const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const [h, m] = (posterSendTime || "08:00").split(":").map(Number);

    const target = new Date(nowIST);
    target.setHours(h, m, 0, 0);

    // If scheduled time already passed today, target tomorrow
    if (nowIST >= target) target.setDate(target.getDate() + 1);

    const diffMs = target - nowIST;
    const totalSec = Math.floor(diffMs / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return { hrs, mins, secs, totalSec };
  };

  useEffect(() => {
    setRemaining(calcRemaining());
    timerRef.current = setInterval(() => setRemaining(calcRemaining()), 1000);
    return () => clearInterval(timerRef.current);
  }, [posterSendTime]);

  const pad = n => String(n).padStart(2, "0");
  const [hh, mm] = (posterSendTime || "08:00").split(":");
  const h = parseInt(hh), ampm = h >= 12 ? "PM" : "AM";
  const displayTime = `${h > 12 ? h - 12 : h || 12}:${mm} ${ampm} IST`;

  return (
    <div style={{
      background: "linear-gradient(135deg, #1a1a2e 0%, #0f0f23 60%, #16162a 100%)",
      border: "1px solid rgba(124,111,255,0.25)",
      borderRadius: 16,
      padding: "1.75rem 1.5rem",
      marginBottom: "1rem",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Glow orb */}
      <div style={{
        position: "absolute", top: -40, right: -40,
        width: 160, height: 160, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(124,111,255,0.18) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Greeting */}
      <div style={{ fontSize: "0.8rem", color: "#8888aa", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
        Good {getGreeting()} {name ? `, ${name.split(" ")[0]}` : ""}! 👋
      </div>

      {/* Main message */}
      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.25rem" }}>
        Today's question drops at <span style={{ color: "#7c6fff" }}>{displayTime}</span>
      </div>
      <div style={{ fontSize: "0.85rem", color: "#8888aa", marginBottom: "1.5rem" }}>
        Get ready to speak your best today!
      </div>

      {/* Countdown */}
      {remaining && (
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {[
            { val: pad(remaining.hrs), label: "Hours" },
            { val: pad(remaining.mins), label: "Minutes" },
            { val: pad(remaining.secs), label: "Seconds" },
          ].map(({ val, label }) => (
            <div key={label} style={{
              flex: 1, background: "rgba(124,111,255,0.12)", border: "1px solid rgba(124,111,255,0.25)",
              borderRadius: 12, padding: "0.85rem 0.5rem", textAlign: "center",
            }}>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "#7c6fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{val}</div>
              <div style={{ fontSize: "0.68rem", color: "#8888aa", marginTop: "0.3rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Streak reminder */}
      {streak > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)",
          borderRadius: 10, padding: "0.6rem 0.85rem", marginBottom: "1rem",
          fontSize: "0.85rem",
        }}>
          <span style={{ fontSize: "1.2rem" }}>🔥</span>
          <span style={{ color: "#f97316", fontWeight: 600 }}>{streak}-day streak!</span>
          <span style={{ color: "#8888aa" }}>Don't break it — submit when the question arrives.</span>
        </div>
      )}

      {/* Motivational quote */}
      <div style={{
        borderLeft: "3px solid rgba(124,111,255,0.5)",
        paddingLeft: "0.85rem",
        color: "#8888aa",
        fontSize: "0.85rem",
        fontStyle: "italic",
        lineHeight: 1.5,
      }}>
        "{quote}"
      </div>
    </div>
  );
}

function SubmitNudge({ name, streak, navigate, specialDay }) {
  const [remaining, setRemaining] = useState(null);
  const timerRef = useRef(null);

  const calcRemaining = () => {
    const now = new Date();
    const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

    const midnight = new Date(nowIST);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);

    const diffMs = midnight - nowIST;
    const totalSec = Math.floor(diffMs / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return { hrs, mins, secs, totalSec };
  };

  useEffect(() => {
    setRemaining(calcRemaining());
    timerRef.current = setInterval(() => setRemaining(calcRemaining()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const pad = n => String(n).padStart(2, "0");
  const urgency = remaining && remaining.hrs < 3 ? "high" : remaining && remaining.hrs < 8 ? "medium" : "low";
  const timeLabel = remaining ? `${remaining.hrs}h ${pad(remaining.mins)}m ${pad(remaining.secs)}s` : "--";

  return (
    <div className={`urgency-countdown-banner urgency-${urgency}`}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
          <span className={`urgency-pill urgency-pill-${urgency}`}>
            {urgency === "high" ? "⚠️ Urgent" : urgency === "medium" ? "⏰ Due Tonight" : "📌 Pending"}
          </span>
          <span className="urgency-time-label">
            ⏰ {timeLabel} until midnight
          </span>
        </div>
        <div className="urgency-subtext">
          {specialDay === "goals" ? (
            <span>🎯 <strong style={{ color: "var(--success)" }}>Monthly Goal Setting:</strong> Speak your goals before midnight!</span>
          ) : specialDay === "reflection" ? (
            <span>🌟 <strong style={{ color: "var(--primary)" }}>Monthly Reflection:</strong> Submit your monthly reflection before midnight!</span>
          ) : streak > 0 ? (
            <span>🔥 <strong style={{ color: "var(--warning)" }}>{streak}-day streak at risk!</strong> Submit your video before midnight to keep it alive.</span>
          ) : (
            <span>Today's challenge is live! Record and submit your video before midnight.</span>
          )}
        </div>
      </div>

      <button
        onClick={() => navigate('/record#video-studio-container')}
        className={`urgency-record-btn urgency-record-btn-${urgency}`}
      >
        🎥 Record Now
      </button>
    </div>
  );
}

function BadgeCelebration({ badge, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 9000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!badge) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${badge.name} badge achieved`} style={{
      position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1.5rem", background: "rgba(6, 7, 20, 0.94)", backdropFilter: "blur(12px)",
    }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {Array.from({ length: 22 }, (_, i) => <span key={i} style={{
          position: "absolute", left: `${(i * 47) % 100}%`, top: "-10%", width: 8, height: 18,
          borderRadius: 3, background: ["#facc15", "#4ade80", "#60a5fa", "#f472b6", "#a78bfa"][i % 5],
          transform: `rotate(${i * 31}deg)`, animation: `badge-confetti ${3 + (i % 4) * 0.45}s linear ${i * 0.08}s infinite`,
        }} />)}
      </div>
      <div style={{
        position: "relative", width: "min(100%, 480px)", textAlign: "center", padding: "2.75rem 1.5rem 2rem",
        borderRadius: 28, border: `1px solid ${badge.color}88`,
        background: `radial-gradient(circle at 50% 0%, ${badge.color}30, transparent 58%), var(--card)`,
        boxShadow: `0 0 70px ${badge.color}35`,
      }}>
        <div style={{ fontSize: "0.8rem", color: badge.color, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          Badge achieved!
        </div>
        <div style={{ fontSize: "6rem", lineHeight: 1.1, margin: "1rem 0", animation: "badge-pop 0.7s ease-out" }}>{badge.icon}</div>
        <h2 style={{ margin: 0, fontSize: "1.8rem", color: "var(--text)" }}>{badge.name}</h2>
        <div style={{ marginTop: "0.45rem", color: badge.color, fontWeight: 700 }}>{badge.tier} · {badge.days}-day streak</div>
        <p style={{ color: "var(--muted)", lineHeight: 1.6, margin: "1rem auto 1.5rem", maxWidth: 330 }}>
          Your consistency is paying off. Keep speaking and reach the next milestone!
        </p>
        <button className="btn-primary" onClick={onClose} style={{ minWidth: 150 }}>Keep shining ✨</button>
      </div>
    </div>
  );
}

function BadgeCatalogModal({ badges, earnedBadges, onClose }) {
  if (!badges?.length) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="All available badges" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem", background: "rgba(6, 7, 20, 0.8)", backdropFilter: "blur(8px)",
    }}>
      <div onClick={event => event.stopPropagation()} style={{
        width: "min(100%, 680px)", maxHeight: "min(85vh, 720px)", overflowY: "auto",
        padding: "1.25rem", borderRadius: 20, background: "var(--card)", border: "1px solid var(--border2)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <div className="section-title" style={{ marginBottom: "0.25rem" }}>🏅 All Streak Badges</div>
            <div style={{ color: "var(--muted)", fontSize: "0.75rem" }}>{earnedBadges?.length || 0} of {badges.length} unlocked</div>
          </div>
          <button onClick={onClose} aria-label="Close badges" style={{
            border: "1px solid var(--border2)", background: "var(--bg2)", color: "var(--muted)",
            borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: "1.1rem",
          }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: "0.55rem" }}>
          {badges.map(badge => {
            const unlocked = earnedBadges?.some(earned => earned.id === badge.id);
            return (
              <div key={badge.id} style={{
                padding: "0.7rem", borderRadius: 12, background: unlocked ? `${badge.color}0d` : "rgba(148,163,184,0.04)",
                border: `1px solid ${unlocked ? `${badge.color}45` : "var(--border)"}`,
              }}>
                <StreakBadge badge={badge} locked={!unlocked} />
                <div style={{ marginTop: "0.4rem", color: "var(--muted)", fontSize: "0.68rem" }}>{badge.days}-day streak</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CelebrationCard({ name, streak, navigate }) {
  const [quote] = useState(() => (Array.isArray(CELEBRATION_MESSAGES) && CELEBRATION_MESSAGES.length > 0)
    ? CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)]
    : "Great job completing today's challenge! Keep shining! ✨"
  );

  return (
    <div style={{
      background: "linear-gradient(160deg, #0a2e1a 0%, #0d3d22 60%, #0f4d2a 100%)",
      border: "1px solid rgba(74,222,128,0.35)",
      borderRadius: 20,
      padding: "1.75rem",
      marginBottom: "1.5rem",
      position: "relative",
      overflow: "hidden",
      boxShadow: "0 4px 40px rgba(74,222,128,0.12)",
    }}>
      {/* subtle glow blobs */}
      <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(74,222,128,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -40, left: -40, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,197,94,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
        <div>
          <div style={{ fontSize: "0.7rem", color: "rgba(74,222,128,0.8)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.4rem" }}>
            🎊 {name ? `Well done, ${name.split(" ")[0]}!` : "Well done!"}
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>
            Today's challenge<br />complete ✅
          </div>
        </div>
        <div style={{
          background: "rgba(74,222,128,0.15)",
          border: "1px solid rgba(74,222,128,0.4)",
          color: "#4ade80",
          padding: "0.35rem 0.85rem",
          borderRadius: 20,
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>✓ Submitted</div>
      </div>

      {/* stats row */}
      <div className="grid-cols-3" style={{ gap: "0.6rem", marginBottom: "1.25rem" }}>
        {[
          { icon: "✅", value: "Done", sub: "Today", accent: "rgba(74,222,128,0.2)", border: "rgba(74,222,128,0.3)" },
          { icon: "🔥", value: streak || 0, sub: "Day Streak", accent: "rgba(249,115,22,0.2)", border: "rgba(249,115,22,0.35)" },
          { icon: "🏆", value: "Win", sub: "Earned", accent: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.3)" },
        ].map((s, i) => (
          <div key={i} style={{
            background: s.accent,
            border: `1px solid ${s.border}`,
            borderRadius: 14,
            padding: "0.85rem 0.5rem",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "1.6rem", lineHeight: 1, marginBottom: "0.35rem" }}>{s.icon}</div>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{s.value}</div>
            <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "0.15rem" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* streak message */}
      {streak > 0 && (
        <div style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: "0.85rem 1rem",
          marginBottom: "1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}>
          <span style={{ fontSize: "1.4rem", flexShrink: 0 }}>🎯</span>
          <div>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.9rem" }}>{streak} Days of Consistency!</div>
            <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.65)", marginTop: "0.15rem" }}>
              {streak >= 30 ? "You're a legend! 30+ days of dedication!" :
                streak >= 14 ? "Two weeks strong! You're unstoppable!" :
                  streak >= 7 ? "One week milestone! Keep the momentum!" :
                    "Every day counts. You're building greatness!"}
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => document.querySelector(".section-title")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        style={{
          width: "100%",
          background: "linear-gradient(135deg, #22c55e, #16a34a)",
          color: "#fff",
          border: "none",
          borderRadius: 12,
          padding: "0.85rem",
          fontSize: "0.9rem",
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "0.04em",
          boxShadow: "0 4px 16px rgba(34,197,94,0.3)",
          marginBottom: "1rem",
        }}
      >
        📊 View My Feedback Scores
      </button>

      {/* quote */}
      <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.55)", fontStyle: "italic", paddingLeft: "0.75rem", borderLeft: "2px solid rgba(74,222,128,0.4)" }}>
        💫 {quote}
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

// ── Vocabulary Words Card (Enhanced Pro) ────────────────────────────────────
function VocabularyWords({ words, requiredCount, totalCount, isPictureDescription = false }) {
  if (!words || words.length === 0) return null;
  const required = requiredCount ?? 3;
  const total = totalCount ?? words.length;
  const maxPts = isPictureDescription ? 10 : 30;
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [ttsWarning, setTtsWarning] = useState(null);
  const audioFallbackRef = useRef(null);

  // ── LocalStorage 16-hour TTL for Planned Vocabulary ──────────────────────────
  const VOCAB_STORAGE_KEY = "speakshine_planned_vocab_v1";
  const SIXTEEN_HOURS_MS = 16 * 60 * 60 * 1000;

  const [plannedWords, setPlannedWords] = useState(() => {
    try {
      const saved = localStorage.getItem(VOCAB_STORAGE_KEY);
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      // Check if expired (stored timestamp older than 16 hours)
      if (Date.now() - (parsed.timestamp || 0) > SIXTEEN_HOURS_MS) {
        localStorage.removeItem(VOCAB_STORAGE_KEY);
        return {};
      }
      return parsed.planned || {};
    } catch {
      return {};
    }
  });

  const parseVocabItem = (item) => {
    if (!item) return { word: "", meaning: "", example: "" };
    if (typeof item === "string") {
      const parts = item.split(/\s*[-—:]\s*/);
      if (parts.length >= 2) {
        return {
          word: parts[0].trim(),
          meaning: parts.slice(1).join(" — ").trim(),
          example: "",
        };
      }
      return { word: item.trim(), meaning: "", example: "" };
    }
    const word = item.word || item.Word || item.term || item.name || "";
    const meaning = item.meaning || item.Meaning || item.definition || item.desc || "";
    const example = item.example || item.Example || item.sentence || "";
    return { word, meaning, example };
  };

  const handleSpeak = (rawWord, rawMeaning, rawExample, idx) => {
    if (!rawWord) return;
    const wordClean = (rawWord || "").trim();
    const meaningClean = (rawMeaning || "").trim();
    const exampleClean = (rawExample || "").trim();

    // Construct full spoken narrative
    let textToSpeak = wordClean;
    if (meaningClean) {
      textToSpeak += `. ${meaningClean}`;
    }
    if (exampleClean) {
      textToSpeak += `. For example: ${exampleClean}`;
    }

    setSpeakingIndex(idx);

    // Stop any previous playing audio
    if (audioFallbackRef.current) {
      audioFallbackRef.current.pause();
      audioFallbackRef.current = null;
    }

    // Dynamic safety timer proportional to text length
    const expectedDurationMs = Math.max(6000, Math.min(30000, textToSpeak.length * 90));
    const safetyTimer = setTimeout(() => {
      setSpeakingIndex(prev => prev === idx ? null : prev);
    }, expectedDurationMs);

    // 1. Primary: Server-side audio stream from /api/video/tts (100% reliable MP3 stream)
    const audioUrl = `/api/video/tts?text=${encodeURIComponent(textToSpeak)}`;
    const audio = new Audio(audioUrl);
    audioFallbackRef.current = audio;

    audio.onended = () => {
      clearTimeout(safetyTimer);
      setSpeakingIndex(null);
    };

    audio.onerror = () => {
      // 2. Secondary: Native Web Speech API fallback
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = 0.88;
          utterance.lang = 'en-US';
          window._activeSpeechUtterance = utterance;
          utterance.onend = () => {
            clearTimeout(safetyTimer);
            setSpeakingIndex(null);
          };
          utterance.onerror = () => {
            clearTimeout(safetyTimer);
            setSpeakingIndex(null);
          };
          window.speechSynthesis.speak(utterance);
          return;
        } catch {}
      }
      clearTimeout(safetyTimer);
      setSpeakingIndex(null);
    };

    audio.play().catch(() => {
      // Autoplay / touch fallback
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = 0.88;
          utterance.lang = 'en-US';
          utterance.onend = () => {
            clearTimeout(safetyTimer);
            setSpeakingIndex(null);
          };
          utterance.onerror = () => {
            clearTimeout(safetyTimer);
            setSpeakingIndex(null);
          };
          window.speechSynthesis.speak(utterance);
          return;
        } catch {}
      }
      clearTimeout(safetyTimer);
      setSpeakingIndex(null);
    });
  };

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

  return (
    <div className="vocab-container-pro">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.1rem" }}>📚</span>
          <span style={{
            fontSize: "0.74rem", fontWeight: 800, textTransform: "uppercase",
            letterSpacing: "0.1em", color: "#c4b5fd",
          }}>
            Today's Vocabulary Challenge
          </span>
        </div>
        <div style={{
          fontSize: "0.72rem", fontWeight: 700,
          background: plannedCount >= required ? "rgba(74, 222, 128, 0.15)" : "rgba(124, 111, 255, 0.15)",
          border: `1px solid ${plannedCount >= required ? "rgba(74, 222, 128, 0.4)" : "rgba(124, 111, 255, 0.3)"}`,
          color: plannedCount >= required ? "#4ade80" : "#c4b5fd",
          padding: "2px 8px", borderRadius: 99,
        }}>
          🎯 Goal: {required} / {total} words (+{maxPts} pts)
        </div>
      </div>

      {speakingIndex !== null && (
        <div style={{
          marginBottom: "0.65rem", padding: "0.45rem 0.85rem", borderRadius: 8,
          background: "rgba(124, 111, 255, 0.15)", border: "1px solid rgba(124, 111, 255, 0.4)",
          color: "#c4b5fd", fontSize: "0.75rem", fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.4rem",
        }}>
          <span>🔊 Playing audio pronunciation...</span>
          <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>
            (If silent, check that your browser tab/site sound is un-muted)
          </span>
        </div>
      )}

      {ttsWarning && (
        <div style={{
          marginBottom: "0.65rem", padding: "0.4rem 0.75rem", borderRadius: 8,
          background: "rgba(251, 191, 36, 0.12)", border: "1px solid rgba(251, 191, 36, 0.35)",
          color: "#fbbf24", fontSize: "0.74rem", fontWeight: 600,
        }}>
          ℹ️ {ttsWarning}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {words.map((rawItem, i) => {
          const w = parseVocabItem(rawItem);
          const isPlanned = !!plannedWords[i];
          const isSpeaking = speakingIndex === i;
          return (
            <div key={i} className="vocab-card-pro" style={isPlanned ? { borderColor: "rgba(74, 222, 128, 0.45)", background: "rgba(74, 222, 128, 0.05)" } : {}}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.2rem" }}>
                    <div className="vocab-num-badge">0{i + 1}</div>
                    <span className="vocab-word-title" style={{ fontWeight: 800, fontSize: "0.98rem" }}>
                      {w.word}
                    </span>
                    {w.meaning && (
                      <span className="vocab-meaning-text" style={{ fontSize: "0.82rem", fontWeight: 500, lineHeight: 1.4 }}>
                        — {w.meaning}
                      </span>
                    )}
                  </div>

                  {w.example && (
                    <div className="vocab-example-bubble">
                      💬 <span style={{ fontStyle: "italic" }}>"{w.example}"</span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexShrink: 0, marginTop: "2px" }}>
                  <button
                    type="button"
                    onClick={() => handleSpeak(w.word, w.meaning, w.example, i)}
                    className="vocab-listen-btn"
                    title="Listen to full pronunciation and example sentence"
                    style={isSpeaking ? { background: "var(--primary)", color: "#fff", transform: "scale(1.15)" } : {}}
                  >
                    {isSpeaking ? "🔊" : "🔈"}
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePlanned(i)}
                    className="vocab-plan-btn"
                    style={{
                      background: isPlanned ? "rgba(74, 222, 128, 0.2)" : "var(--card2)",
                      border: `1px solid ${isPlanned ? "rgba(74, 222, 128, 0.4)" : "var(--border)"}`,
                      color: isPlanned ? "var(--success)" : "var(--text2)",
                      borderRadius: 8,
                      padding: "4px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    title="Mark if you plan to use this word in your recording"
                  >
                    {isPlanned ? "✓ Planned" : "+ Plan to use"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "0.85rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.74rem", color: "var(--muted)" }}>
        <span>✨ Speak naturally: past tense & plurals are automatically recognized!</span>
        {plannedCount > 0 && (
          <span style={{ color: plannedCount >= required ? "var(--success)" : "var(--warning)", fontWeight: 700 }}>
            {plannedCount} of {required} words planned
          </span>
        )}
      </div>
    </div>
  );
}

const tt = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--text)" };
const avg = (arr, k) => { const v = arr.filter(s => s[k] != null).map(s => s[k]); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "—"; };
const scoreColor = v => v >= 7 ? "var(--success)" : v >= 5 ? "var(--warning)" : "var(--danger)";

const CACHE_KEY = "dashboard_cache_v5"; // bump version for stale-while-revalidate
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache with background revalidation

function getCachedDashboard() {
  try {
    // Also clear all old cache versions on read
    ["dashboard_cache_v1", "dashboard_cache_v2", "dashboard_cache_v3", "dashboard_cache_v4"].forEach(k => {
      try { localStorage.removeItem(k); } catch { }
    });
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function setCachedDashboard(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { }
}

// ── Guest dummy data — same shape as /api/dashboard/me response ─────────────
function buildGuestData() {
  const scores = Array.from({ length: 10 }, (_, i) => {
    const prog = i * 0.22;
    const j = () => (Math.random() - 0.5) * 0.8;
    return {
      fluency: +Math.min(10, Math.max(1, 5.8 + prog + j())).toFixed(1),
      grammar: +Math.min(10, Math.max(1, 6.2 + prog + j())).toFixed(1),
      confidence: +Math.min(10, Math.max(1, 5.5 + prog + j())).toFixed(1),
      vocabulary: +Math.min(10, Math.max(1, 6.0 + prog + j())).toFixed(1),
      submittedAt: new Date(Date.now() - (9 - i) * 86400000).toISOString(),
    };
  });

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
      feedbackScores: scores,
    },
    today: {
      question: "Tell us about a skill you are learning and why it excites you.",
      topic: "Personal Growth",
      category: "Self-Development",
      questionSent: true,
      isMonthlyReflection: false,
      isMonthlyGoals: false,
      vocabulary: [
        { word: "Resilience", meaning: "The ability to recover quickly from setbacks", example: "Her resilience helped her bounce back after every failure." },
        { word: "Perseverance", meaning: "Continued effort despite difficulty", example: "With perseverance, he finally mastered public speaking." },
        { word: "Articulate", meaning: "Able to express thoughts clearly", example: "She was articulate and confident during the presentation." },
        { word: "Proficiency", meaning: "A high degree of skill or competence", example: "He reached proficiency in English after years of practice." },
        { word: "Ambition", meaning: "A strong desire to achieve something", example: "Her ambition drove her to learn a new skill every year." },
      ],
      vocabWordCount: 5,
      vocabRequiredCount: 3,
    },
    stats: { total: 87, completed: 23, pending: 64 },
    topStreak: [
      { name: "Arjun M.", streak: 42, completed: true, weeklySubmissions: 5, monthlyScore: 210 },
      { name: "Priya K.", streak: 38, completed: true, weeklySubmissions: 5, monthlyScore: 195 },
      { name: "Rahul S.", streak: 31, completed: false, weeklySubmissions: 4, monthlyScore: 157 },
      { name: "Divya R.", streak: 27, completed: true, weeklySubmissions: 5, monthlyScore: 143 },
      { name: "Kiran T.", streak: 19, completed: false, weeklySubmissions: 3, monthlyScore: 98 },
    ],
    myStreakEntry: null,
    streakRecord: { name: "Arjun M.", streak: 87, achievedAt: new Date(Date.now() - 30 * 86400000).toISOString() },
    showReport: false,
    posterSendTime: "08:00",
  };
}

export default function UserDashboard() {
  const { user } = useAuth();
  const isGuest = !user;

  const cached = isGuest ? null : getCachedDashboard();
  const [data, setData] = useState(() => isGuest ? buildGuestData() : cached);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!isGuest && !cached);
  const [liveSessions, setLiveSessions] = useState([]);
  const [sessionPage, setSessionPage] = useState(1);
  const [celebrationQueue, setCelebrationQueue] = useState([]);
  const [showBadgeCatalog, setShowBadgeCatalog] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const badgeStateInitialized = useRef(false);
  const navigate = useNavigate();
  const entranceRef = useGsapEntrance({ selector: ".gsap-stagger-card", y: 22, stagger: 0.08, deps: [loading] });

  const handleCopyPrompt = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const applyDashboardData = (nextData) => {
    const earned = nextData?.profile?.earnedBadges || [];
    const badgeKey = `speak-shine-seen-badges-${user?.id || user?.phone || "user"}`;
    let seen = [];
    let hasSeenState = false;
    try {
      const stored = localStorage.getItem(badgeKey);
      hasSeenState = stored !== null;
      seen = JSON.parse(stored || "[]");
    } catch { }

    if (!badgeStateInitialized.current) {
      badgeStateInitialized.current = true;
      if (!hasSeenState) {
        // Establish a baseline on first load so pre-existing badges do not replay.
        try { localStorage.setItem(badgeKey, JSON.stringify(earned.map(b => b.id))); } catch { }
      } else {
        const newBadges = earned.filter(badge => !seen.includes(badge.id));
        if (newBadges.length) {
          setCelebrationQueue(newBadges);
          try { localStorage.setItem(badgeKey, JSON.stringify([...new Set([...seen, ...newBadges.map(b => b.id)])])); } catch { }
        }
      }
    } else {
      const newBadges = earned.filter(badge => !seen.includes(badge.id));
      if (newBadges.length) {
        setCelebrationQueue(queue => [...queue, ...newBadges]);
        try { localStorage.setItem(badgeKey, JSON.stringify([...new Set([...seen, ...newBadges.map(b => b.id)])])); } catch { }
      }
    }
    setData(nextData);
  };

  useEffect(() => {
    if (isGuest) return; // guests already have dummy data
    const fetchData = () => {
      Promise.all([
        api.get("/dashboard/me"),
        api.get("/live-sessions").catch(() => ({ data: [] })),
      ]).then(([d, ls]) => {
        applyDashboardData(d.data);
        setCachedDashboard(d.data);
        setLiveSessions((ls.data || []).filter(s => s.status === "live" || s.status === "scheduled"));
      })
        .catch(err => {
          if (!getCachedDashboard()) setError(err.response?.data?.error || "Failed to load data");
        })
        .finally(() => setLoading(false));
    };

    fetchData();
    const interval = setInterval(() => api.get("/dashboard/me").then(d => {
      applyDashboardData(d.data);
      setCachedDashboard(d.data);
    }).catch(() => { }), 30_000);
    return () => clearInterval(interval);
  }, [isGuest]);

  if (loading) return <Layout title="My Dashboard"><div className="spinner-wrap"><div className="spinner" /><p style={{ color: "var(--muted)" }}>Loading…</p></div></Layout>;
  if (error) return <Layout title="My Dashboard"><div className="error-box"><p>{error}</p><button className="btn-primary" style={{ marginTop: "1rem" }} onClick={() => window.location.reload()}>Retry</button></div></Layout>;

  const profile = data?.profile;
  const scores = profile?.feedbackScores || [];
  const latest = scores.slice(-1)[0];
  const chartData = scores.map((s, i) => ({ session: `#${i + 1}`, Fluency: s.fluency, Grammar: s.grammar, Confidence: s.confidence, Vocabulary: s.vocabulary }));
  const isSundayScore = (score) => {
    if (score.sundayBonus === true) return true;
    if (!score.date) return false;
    return new Date(score.date).toLocaleString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" }) === "Sun";
  };
  const graphScores = scores.filter(score => !isSundayScore(score));
  const pointsData = graphScores.map((s, i) => ({ session: `#${i + 1}`, pts: s.points != null ? Math.round(s.points) : null })).filter(d => d.pts != null);
  const parseDurationToSeconds = (value) => {
    if (value == null || value === "") return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
      const parts = trimmed.split(":").map(p => Number(p));
      if (parts.every(part => Number.isFinite(part))) {
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }
    return null;
  };
  const formatDurationLabel = (seconds) => {
    if (seconds == null || seconds <= 0) return "0m";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };
  const formatSessionDuration = (seconds) => {
    if (seconds == null || seconds <= 0) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${String(secs).padStart(2, "0")}s`;
  };
  const totalSessionsCount = profile?.totalSessions != null
    ? profile.totalSessions
    : scores.length;

  const totalRecordedSeconds = profile?.totalRecordedSeconds != null
    ? profile.totalRecordedSeconds
    : scores.reduce((sum, score) => {
        const durationValue = parseDurationToSeconds(score.duration ?? score.videoDuration ?? score.recordedDuration ?? score.durationSeconds);
        return sum + (durationValue ?? 0);
      }, 0);
  const totalRecordedTimeLabel = formatDurationLabel(totalRecordedSeconds);

  // Last 30 sessions duration specifically for the Daily Points Trend card
  const last30Scores = scores.slice(-30);
  const last30RecordedSeconds = last30Scores.reduce((sum, score) => {
    const durationValue = parseDurationToSeconds(score.duration ?? score.videoDuration ?? score.recordedDuration ?? score.durationSeconds);
    return sum + (durationValue ?? 0);
  }, 0);
  const last30RecordedTimeLabel = formatDurationLabel(last30RecordedSeconds);

  const pointsSummary = pointsData.length > 0 ? (() => {
    const values = pointsData.map(d => d.pts);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const best = Math.max(...values);
    const latest = values[values.length - 1] ?? 0;
    const previous = values.length > 1 ? values[values.length - 2] : null;
    const deltaFromAvg = latest - avg;
    const deltaFromPrev = previous !== null ? latest - previous : null;
    const sessionCount = values.length;

    // Multi-tier Performance Classification
    let performanceState;
    if (sessionCount === 1) {
      performanceState = {
        label: "Baseline Set",
        tier: "initial",
        icon: "🌱",
        color: "#38bdf8",
        badgeBg: "rgba(56,189,248,0.15)",
        trendText: "First speaking milestone logged",
        motivationalTip: "Great start! Every submission builds your speaking confidence and vocabulary.",
      };
    } else if (latest >= best && sessionCount > 1) {
      performanceState = {
        label: "Personal Best!",
        tier: "peak",
        icon: "🏆",
        color: "#fbbf24",
        badgeBg: "rgba(251,191,36,0.18)",
        trendText: `+${Math.round(deltaFromAvg)} pts above avg (All-time high!)`,
        motivationalTip: "🎉 Incredible achievement! You just achieved your highest speaking score ever.",
      };
    } else if (deltaFromAvg >= 15 || latest >= 90) {
      performanceState = {
        label: "Exceptional",
        tier: "exceptional",
        icon: "⚡",
        color: "#34d399",
        badgeBg: "rgba(52,211,153,0.18)",
        trendText: `+${Math.round(deltaFromAvg)} pts above average`,
        motivationalTip: "🔥 You're in peak form! Outstanding fluency, grammar, and delivery.",
      };
    } else if (deltaFromAvg >= 5) {
      performanceState = {
        label: "Above Average",
        tier: "above",
        icon: "🚀",
        color: "#22d3ee",
        badgeBg: "rgba(34,211,238,0.15)",
        trendText: `+${Math.round(deltaFromAvg)} pts above average`,
        motivationalTip: "📈 Strong session! You're consistently performing above your historical baseline.",
      };
    } else if (Math.abs(deltaFromAvg) < 5) {
      performanceState = {
        label: "Solid & On Track",
        tier: "consistent",
        icon: "🎯",
        color: "#818cf8",
        badgeBg: "rgba(129,140,248,0.15)",
        trendText: `±${Math.round(Math.abs(deltaFromAvg))} pts from average (${Math.round(avg)} pts)`,
        motivationalTip: "🎯 Rock-solid consistency! Daily steady practice is the proven path to fluency.",
      };
    } else if (deltaFromAvg >= -12) {
      performanceState = {
        label: "Building Momentum",
        tier: "rebuilding",
        icon: "🌱",
        color: "#fb923c",
        badgeBg: "rgba(251,146,60,0.15)",
        trendText: `${Math.round(Math.abs(deltaFromAvg))} pts from avg · Next one counts!`,
        motivationalTip: "💪 Good effort! Focus on natural pacing & vocabulary to level up tomorrow.",
      };
    } else {
      performanceState = {
        label: "Comeback Zone",
        tier: "comeback",
        icon: "💫",
        color: "#f43f5e",
        badgeBg: "rgba(244,63,94,0.15)",
        trendText: `Target: ${Math.round(avg)}+ pts on your next video`,
        motivationalTip: "✨ Every challenge is a stepping stone. Reset, practice once, and shine on your next submission!",
      };
    }

    // Multi-tier Momentum / Trend Classification
    let trendState;
    if (sessionCount === 1) {
      trendState = {
        label: "First Step",
        icon: "🚀",
        color: "#38bdf8",
        subText: "Speaking journey begun",
      };
    } else if (sessionCount >= 3 && values[values.length - 1] > values[values.length - 2] && values[values.length - 2] > values[values.length - 3]) {
      const gain = Math.round(values[values.length - 1] - values[values.length - 3]);
      trendState = {
        label: "3-Session Surge",
        icon: "🔥",
        color: "#34d399",
        subText: `+${gain} pts over last 3 sessions`,
      };
    } else if (latest >= best && sessionCount > 1) {
      trendState = {
        label: "All-Time Peak",
        icon: "👑",
        color: "#fbbf24",
        subText: "Highest speaking level to date",
      };
    } else if (deltaFromPrev !== null && deltaFromPrev >= 10) {
      trendState = {
        label: `Surging Up (+${Math.round(deltaFromPrev)} pts)`,
        icon: "⚡",
        color: "#22d3ee",
        subText: `Jumped +${Math.round(deltaFromPrev)} pts vs last session`,
      };
    } else if (deltaFromPrev !== null && deltaFromPrev > 0) {
      trendState = {
        label: `Growing (+${Math.round(deltaFromPrev)} pts)`,
        icon: "📈",
        color: "#4ade80",
        subText: `Improved vs previous session`,
      };
    } else if (deltaFromPrev !== null && deltaFromPrev === 0) {
      trendState = {
        label: "Even & Steady",
        icon: "⚖️",
        color: "#818cf8",
        subText: `Matched last session score`,
      };
    } else if (deltaFromPrev !== null && deltaFromPrev >= -6) {
      trendState = {
        label: "Holding Strong",
        icon: "🛡️",
        color: "#fb923c",
        subText: "Close to recent best",
      };
    } else {
      trendState = {
        label: "Ready to Rebound",
        icon: "💪",
        color: "#f43f5e",
        subText: "Next session is your comeback",
      };
    }

    return {
      avg: Math.round(avg),
      best,
      latest,
      previous,
      deltaFromAvg,
      deltaFromPrev,
      sessionCount,
      performance: performanceState,
      trend: trendState,
      performanceDelta: deltaFromAvg,
      performanceTrendText: performanceState.trendText,
      performanceLabel: performanceState.label,
      totalRecordedLabel: totalRecordedTimeLabel,
      last30RecordedLabel: last30RecordedTimeLabel,
      last30RecordedSeconds,
    };
  })() : null;
  const SESSION_PAGE_SIZE = 5;
  const reversedScores = [...scores].reverse();
  const totalPages = Math.ceil(reversedScores.length / SESSION_PAGE_SIZE);
  const pagedScores = reversedScores.slice((sessionPage - 1) * SESSION_PAGE_SIZE, sessionPage * SESSION_PAGE_SIZE);

  return (
    <div style={{ minHeight: "100vh", background: "#06050b", color: "#f1f0f5" }}>
      {celebrationQueue[0] && (
        <BadgeCelebration
          badge={celebrationQueue[0]}
          onClose={() => setCelebrationQueue((queue) => queue.slice(1))}
        />
      )}
      {showBadgeCatalog && (
        <BadgeCatalogModal
          badges={profile?.availableBadges || data?.availableBadges || STREAK_BADGES}
          earnedBadges={profile?.earnedBadges || []}
          onClose={() => setShowBadgeCatalog(false)}
        />
      )}
      {/* Guest banner — shown to unauthenticated visitors */}
      {isGuest && <GuestBanner />}

      <ModernDashboardView
        user={user}
        profile={profile || {}}
        today={data?.today || {}}
        scores={scores || []}
        leaderboard={data?.topStreak || data?.leaderboard || []}
        stats={data?.stats || {}}
        streakRecord={data?.streakRecord || null}
        myStreakEntry={data?.myStreakEntry || null}
        badges={{
          available: profile?.availableBadges || [],
          earned: profile?.earnedBadges || [],
        }}
        onOpenBadges={() => setShowBadgeCatalog(true)}
        onOpenSettings={() => navigate("/payment")}
        onOpenReport={(session) => {
          if (session?._id) navigate("/analysis/" + session._id);
          else navigate("/video-analysis");
        }}
        onLogout={() => {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }}
      />
    </div>
  );
}
