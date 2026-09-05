import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import GuestBanner from "../components/GuestBanner.jsx";
import StreakBadge from "../components/StreakBadge.jsx";
import { useGsapEntrance, AnimatedNumber } from "../hooks/useGsapStagger.jsx";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Area, AreaChart,
} from "recharts";

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
        onClick={() => navigate('/record')}
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
  const [plannedWords, setPlannedWords] = useState({});
  const [ttsWarning, setTtsWarning] = useState(null);
  const audioFallbackRef = useRef(null);

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
    setPlannedWords(prev => ({ ...prev, [idx]: !prev[idx] }));
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
    <Layout title="My Dashboard">
      {celebrationQueue[0] && (
        <BadgeCelebration
          badge={celebrationQueue[0]}
          onClose={() => setCelebrationQueue((queue) => queue.slice(1))}
        />
      )}
      {showBadgeCatalog && (
        <BadgeCatalogModal
          badges={profile?.availableBadges}
          earnedBadges={profile?.earnedBadges}
          onClose={() => setShowBadgeCatalog(false)}
        />
      )}
      {/* Guest banner — shown to unauthenticated visitors */}
      {isGuest && <GuestBanner />}

      <div ref={entranceRef}>
        {/* Modern Student Hero Banner */}
        <div className="student-hero-banner gsap-stagger-card">
          <div>
            <div className="student-hero-greeting">
              <span>
                {getGreeting() === "morning"
                  ? "🌅"
                  : getGreeting() === "afternoon"
                    ? "☀️"
                    : "🌙"}
              </span>
              <span>
                Good {getGreeting()}
                {profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}!
              </span>
              <span style={{ fontSize: "1.15rem" }}>✨</span>
            </div>
            <div className="student-hero-sub">
              {profile?.completed
                ? "🎉 You've completed today's challenge! Great job keeping the momentum."
                : "🔥 Today's speaking challenge is live — record your video and claim your daily points!"}
            </div>
          </div>

          <div className="student-hero-stats">
            {profile && (
              <>
                <div
                  className="student-stat-pill flame"
                  title="Current Daily Streak"
                >
                  <span style={{ fontSize: "1rem" }}>🔥</span>
                  <span><AnimatedNumber value={profile.streak || 0} /> Day Streak</span>
                </div>
                <div
                  className="student-stat-pill score"
                  title="Leaderboard Points"
                >
                  <span style={{ fontSize: "1rem" }}>⭐</span>
                  <span><AnimatedNumber value={Math.round(profile.monthlyScore || 0)} /> Pts</span>
                </div>
                <div
                  className="student-stat-pill freeze"
                  title="Available Streak Freezes"
                >
                  <span style={{ fontSize: "1rem" }}>🧊</span>
                  <span><AnimatedNumber value={profile.streakFreeze || 0} /> Freezes</span>
                </div>
              </>
            )}
          </div>
        </div>

      {data?.showReport && data?.dailyReport && (
        <div
          className="daily-poster gsap-stagger-card"
        >
          <div className="daily-poster-header">
            <div className="daily-poster-brand">📊 Yesterday's Performance</div>
            <div className="daily-poster-sub">DAILY REPORT</div>
            {data.dailyReport.submitted && (
              <div
                className="daily-poster-badge"
                style={{ background: "#4ade80" }}
              >
                ✅ Submitted
              </div>
            )}
            {!data.dailyReport.submitted && (
              <div
                className="daily-poster-badge"
                style={{ background: "#f87171" }}
              >
                ❌ Missed
              </div>
            )}
          </div>

          {data.dailyReport.submitted ? (
            <>
              {/* Scores */}
              <div style={{ marginTop: "1.5rem" }}>
                <div className="daily-poster-section-label">YOUR SCORES</div>
                <div className="grid-cols-2" style={{ marginTop: "0.75rem" }}>
                  {[
                    {
                      label: "Fluency",
                      value: data.dailyReport.fluency,
                      icon: "🗣️",
                    },
                    {
                      label: "Grammar",
                      value: data.dailyReport.grammar,
                      icon: "📝",
                    },
                    {
                      label: "Confidence",
                      value: data.dailyReport.confidence,
                      icon: "💪",
                    },
                    {
                      label: "Vocabulary",
                      value: data.dailyReport.vocabulary,
                      icon: "📚",
                    },
                  ].map(({ label, value, icon }) => (
                    <div
                      key={label}
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}
                      >
                        {icon}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#8888aa",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: "bold",
                          color:
                            value >= 7
                              ? "#4ade80"
                              : value >= 5
                                ? "#fbbf24"
                                : "#f87171",
                        }}
                      >
                        {value || "—"}/10
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Overall Comment */}
              {data.dailyReport.overallComment && (
                <div style={{ marginTop: "1.5rem" }}>
                  <div className="daily-poster-section-label">💬 FEEDBACK</div>
                  <div
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      padding: "1rem",
                      borderRadius: "8px",
                      marginTop: "0.75rem",
                      fontSize: "0.9rem",
                      lineHeight: "1.6",
                    }}
                  >
                    {data.dailyReport.overallComment}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid-cols-3" style={{ marginTop: "1.5rem" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem" }}>🔥</div>
                  <div
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: "bold",
                      marginTop: "0.25rem",
                    }}
                  >
                    {data.dailyReport.streak}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#8888aa" }}>
                    Streak
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem" }}>📅</div>
                  <div
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: "bold",
                      marginTop: "0.25rem",
                    }}
                  >
                    {data.dailyReport.weeklySubmissions}/7
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#8888aa" }}>
                    This Week
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem" }}>📆</div>
                  <div
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: "bold",
                      marginTop: "0.25rem",
                    }}
                  >
                    {data.dailyReport.monthlySubmissions}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#8888aa" }}>
                    This Month
                  </div>
                </div>
              </div>

              {/* Points & Freeze Information */}
              <div className="grid-cols-2" style={{ marginTop: "1.5rem" }}>
                <div
                  style={{
                    background: "rgba(56, 189, 248, 0.1)",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    textAlign: "center",
                    border: "1px solid rgba(56, 189, 248, 0.2)",
                  }}
                >
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
                    🧊
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#8888aa",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Streak Freeze
                  </div>
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: "bold",
                      color: "#38bdf8",
                    }}
                  >
                    {data.dailyReport.streakFreeze || 0}
                  </div>
                </div>
                <div
                  style={{
                    background: "rgba(167, 139, 250, 0.1)",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    textAlign: "center",
                    border: "1px solid rgba(167, 139, 250, 0.2)",
                  }}
                >
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
                    ⭐
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#8888aa",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Monthly Score
                  </div>
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: "bold",
                      color: "#a78bfa",
                    }}
                  >
                    {data.dailyReport.monthlyScore || 0}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                marginTop: "1.5rem",
                textAlign: "center",
                padding: "2rem",
              }}
            >
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>😔</div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: "bold",
                  marginBottom: "0.5rem",
                }}
              >
                You missed yesterday's challenge
              </div>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: "#8888aa",
                  marginBottom: "1rem",
                }}
              >
                Don't worry! Today is a new opportunity to shine.
              </div>

              {/* Points & Freeze for Missed Day */}
              <div
                className="grid-cols-2"
                style={{ maxWidth: "300px", margin: "1.5rem auto 0" }}
              >
                <div
                  style={{
                    background: "rgba(56, 189, 248, 0.1)",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    textAlign: "center",
                    border: "1px solid rgba(56, 189, 248, 0.2)",
                  }}
                >
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
                    🧊
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#8888aa",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Streak Freeze
                  </div>
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: "bold",
                      color: "#38bdf8",
                    }}
                  >
                    {data.dailyReport.streakFreeze || 0}
                  </div>
                </div>
                <div
                  style={{
                    background: "rgba(167, 139, 250, 0.1)",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    textAlign: "center",
                    border: "1px solid rgba(167, 139, 250, 0.2)",
                  }}
                >
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
                    ⭐
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#8888aa",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Monthly Score
                  </div>
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: "bold",
                      color: "#a78bfa",
                    }}
                  >
                    {Math.round(data.dailyReport.monthlyScore || 0)}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="daily-poster-cta" style={{ marginTop: "1.5rem" }}>
            ⏰ New question arrives at 8:00 AM
          </div>
        </div>
      )}

      {/* Show Question (8 AM onwards) — hide if already completed */}
      {!data?.showReport && data?.today?.question && !profile?.completed && (
        <div
          className={`daily-poster gsap-stagger-card ${
            data?.today?.isMonthlyReflection
              ? "poster-reflection"
              : data?.today?.isMonthlyGoals
                ? "poster-goals"
                : data?.today?.isStorySummary
                  ? "poster-story"
                  : data?.today?.isPictureDescription
                    ? "poster-picture"
                    : ""
          }`}
        >
          {/* Header */}
          <div className="daily-poster-header">
            <div className="daily-poster-brand">
              {data?.today?.isMonthlyReflection
                ? "🌟 Speak & Shine"
                : data?.today?.isMonthlyGoals
                  ? "🎯 Speak & Shine"
                  : data?.today?.isStorySummary
                    ? "🎧 Speak & Shine"
                    : data?.today?.isPictureDescription
                      ? "🖼️ Speak & Shine"
                      : "✦ Speak & Shine"}
            </div>
            <div className="daily-poster-sub">
              {data?.today?.isMonthlyReflection
                ? "MONTHLY REFLECTION"
                : data?.today?.isMonthlyGoals
                  ? "MONTHLY GOAL SETTING"
                  : data?.today?.isStorySummary
                    ? "STORY SUMMARY"
                    : data?.today?.isPictureDescription
                      ? "PICTURE DESCRIPTION"
                      : "DAILY SPEAKING CHALLENGE"}
            </div>
            {/* Sunday bonus badge */}
            {new Date().getDay() === 0 && (
              <div
                className="daily-poster-badge"
                style={{
                  background: "rgba(251,191,36,0.2)",
                  border: "1px solid rgba(251,191,36,0.5)",
                  color: "#fbbf24",
                  marginTop: "0.35rem",
                }}
              >
                🎉 Sunday Bonus — Double Points Today!
              </div>
            )}
            {data.today.category && (
              <div
                className="daily-poster-badge"
                style={
                  data?.today?.isMonthlyReflection
                    ? {
                        background: "rgba(139,92,246,0.3)",
                        border: "1px solid rgba(167,139,250,0.5)",
                        color: "#c4b5fd",
                      }
                    : data?.today?.isMonthlyGoals
                      ? {
                          background: "rgba(34,197,94,0.25)",
                          border: "1px solid rgba(74,222,128,0.5)",
                          color: "#4ade80",
                        }
                      : data?.today?.isStorySummary
                        ? {
                            background: "rgba(20,184,166,0.25)",
                            border: "1px solid rgba(45,212,191,0.5)",
                            color: "#5eead4",
                          }
                        : data?.today?.isPictureDescription
                          ? {
                              background: "rgba(66,153,225,0.25)",
                              border: "1px solid rgba(99,179,237,0.5)",
                              color: "#90cdf4",
                            }
                          : {}
                }
              >
                {data.today.category}
              </div>
            )}
          </div>

          {/* Monthly Reflection questions */}
          {data?.today?.isPictureDescription ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="daily-poster-section-label">
                🖼️ PICTURE DESCRIPTION
              </div>
              {data.today.topic && (
                <div className="daily-poster-topic-wrap">
                  <div className="daily-poster-section-label">SCENE</div>
                  <div className="daily-poster-topic">"{data.today.topic}"</div>
                </div>
              )}
              {data.today.imageUrl && (
                <div
                  style={{
                    margin: "0.75rem 0",
                    borderRadius: 12,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <img
                    src={data.today.imageUrl}
                    alt={data.today.topic || "Picture description challenge"}
                    style={{
                      width: "100%",
                      maxHeight: 300,
                      objectFit: "contain",
                      background: "#0a0a14",
                      display: "block",
                      borderRadius: 12,
                    }}
                    loading="lazy"
                  />
                  {data.today.imagePhotographer && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: "0.4rem 0.65rem",
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.65), transparent)",
                        borderBottomLeftRadius: 12,
                        borderBottomRightRadius: 12,
                        fontSize: "0.62rem",
                        color: "rgba(255,255,255,0.75)",
                      }}
                    >
                      📷 Photo by {data.today.imagePhotographer}
                      {data.today.imageSource
                        ? ` on ${data.today.imageSource}`
                        : ""}
                    </div>
                  )}
                </div>
              )}
              <div
                style={{
                  marginTop: "0.75rem",
                  background: "rgba(66,153,225,0.08)",
                  border: "1px solid rgba(99,179,237,0.25)",
                  borderRadius: 10,
                  padding: "0.65rem 0.85rem",
                  fontSize: "0.82rem",
                  color: "var(--text)",
                  lineHeight: 1.5,
                }}
              >
                {data.today.imageInstructions ||
                  data.today.question ||
                  "Look at the image carefully. Describe what you see, what might be happening, and what you think about it."}
              </div>
            </div>
          ) : data?.today?.isStorySummary ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="daily-poster-section-label">
                🎧 LISTENING PRACTICE
              </div>
              {data.today.topic && (
                <div className="daily-poster-topic-wrap">
                  <div className="daily-poster-section-label">STORY</div>
                  <div className="daily-poster-topic">"{data.today.topic}"</div>
                </div>
              )}
              {data.today.audioUrl && (
                <audio
                  controls
                  controlsList="nodownload nofullscreen noremoteplayback"
                  onContextMenu={(e) => e.preventDefault()}
                  src={data.today.audioUrl}
                  style={{ width: "100%", marginTop: "0.75rem" }}
                />
              )}
              <div
                style={{
                  marginTop: "0.85rem",
                  background: "rgba(20,184,166,0.08)",
                  border: "1px solid rgba(45,212,191,0.25)",
                  borderRadius: 10,
                  padding: "0.65rem 0.85rem",
                  fontSize: "0.82rem",
                  color: "var(--text)",
                  lineHeight: 1.5,
                }}
              >
                {data.today.question ||
                  "Listen to the story audio. Then record a clear video summary in your own words."}
              </div>
            </div>
          ) : data?.today?.isMonthlyReflection ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="daily-poster-section-label">
                📋 REFLECTION QUESTIONS
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                  marginTop: "0.75rem",
                }}
              >
                {[
                  "How many reviews did you attend this month?",
                  "How many reviews passed and how many failed? Why did you fail?",
                  "How many extensions did you take this month?",
                  "What is your current growth and progress in the program?",
                  "What did you do this month to improve your communication skill?",
                  "What is your communication skill level now compared to last month?",
                ].map((q, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                      background: "var(--card2)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "0.65rem 0.85rem",
                    }}
                  >
                    <div
                      style={{
                        minWidth: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "rgba(139,92,246,0.2)",
                        border: "1px solid rgba(139,92,246,0.4)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        color: "#a78bfa",
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text)",
                        lineHeight: 1.5,
                      }}
                    >
                      {q}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: "0.85rem",
                  background: "rgba(139,92,246,0.08)",
                  border: "1px solid rgba(139,92,246,0.2)",
                  borderRadius: 10,
                  padding: "0.65rem 0.85rem",
                  fontSize: "0.78rem",
                  color: "var(--text2)",
                }}
              >
                💡 Record a video answering all 6 questions. Same rules apply —
                counts as your daily submission.
              </div>
            </div>
          ) : /* Monthly Goals questions */
          data?.today?.isMonthlyGoals ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="daily-poster-section-label">
                🎯 GOAL SETTING QUESTIONS
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                  marginTop: "0.75rem",
                }}
              >
                {[
                  "What is your main goal for this month in the program?",
                  "What is your dream or target you are working toward right now?",
                  "What specific steps will you take this month to improve your communication?",
                  "What was your biggest challenge last month and how will you overcome it this month?",
                  "How many reviews are you planning to attend this month?",
                  "What will you do differently this month to grow faster?",
                ].map((q, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                      background: "var(--card2)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "0.65rem 0.85rem",
                    }}
                  >
                    <div
                      style={{
                        minWidth: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "rgba(34,197,94,0.2)",
                        border: "1px solid rgba(74,222,128,0.4)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        color: "#4ade80",
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text)",
                        lineHeight: 1.5,
                      }}
                    >
                      {q}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: "0.85rem",
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(74,222,128,0.2)",
                  borderRadius: 10,
                  padding: "0.65rem 0.85rem",
                  fontSize: "0.78rem",
                  color: "var(--text2)",
                }}
              >
                💡 Be specific and speak from the heart. Your goals drive your
                growth — say them out loud with confidence!
              </div>
            </div>
          ) : (
            <>
              {data.today.topic && (
                <div className="daily-poster-topic-wrap">
                  <div className="daily-poster-section-label">🎯 TOPIC</div>
                  <div className="daily-poster-topic">"{data.today.topic}"</div>
                </div>
              )}
              <div className="daily-poster-question-wrap">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.4rem",
                  }}
                >
                  <div className="daily-poster-section-label">
                    ❓ QUESTION PROMPT
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPrompt(data.today.question)}
                    style={{
                      background: copiedPrompt
                        ? "rgba(16, 185, 129, 0.15)"
                        : "var(--card2)",
                      border: `1px solid ${copiedPrompt ? "rgba(16, 185, 129, 0.4)" : "var(--border2)"}`,
                      color: copiedPrompt
                        ? "var(--success)"
                        : "var(--text2)",
                      padding: "3px 8px",
                      borderRadius: 8,
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      transition: "all 0.15s ease",
                    }}
                    title="Copy question to clipboard"
                  >
                    {copiedPrompt ? "✓ Copied!" : "📋 Copy"}
                  </button>
                </div>
                <div className="daily-poster-question">
                  {data.today.question}
                </div>
              </div>
            </>
          )}

          {/* Vocabulary words — all day types */}
          {Array.isArray(data.today.vocabulary) &&
            data.today.vocabulary.length > 0 && (
              <VocabularyWords
                words={data.today.vocabulary}
                requiredCount={data.today.vocabRequiredCount}
                totalCount={data.today.vocabWordCount}
                isPictureDescription={data.today.isPictureDescriptionDay || data.today.todayContentType === "picture_description"}
              />
            )}

          {/* Speaking Readiness Tips Checklist */}
          <div className="readiness-strip">
            <div className="readiness-chip">
              <span className="icon">⏱️</span>
              <span>Speak 60s+ for Full Marks</span>
            </div>
            <div className="readiness-chip">
              <span className="icon">📚</span>
              <span>Include 3+ Target Words</span>
            </div>
            <div className="readiness-chip">
              <span className="icon">🗣️</span>
              <span>Natural Tone & Flow</span>
            </div>
          </div>

          {/* Dual CTA Hero Buttons */}
          <div className="daily-poster-cta-row">
            <button
              type="button"
              className="btn-hero-primary"
              onClick={() =>
                isGuest ? navigate("/register") : navigate("/record")
              }
            >
              <span>🎥</span>
              <span>
                {isGuest
                  ? "Register to Submit Video"
                  : data?.today?.isMonthlyReflection
                    ? "Record Monthly Reflection"
                    : data?.today?.isMonthlyGoals
                      ? "Record Monthly Goals"
                      : data?.today?.isStorySummary
                        ? "Record Story Summary"
                        : data?.today?.isPictureDescription
                          ? "Record Picture Description"
                          : "Record Video Now"}
              </span>
            </button>
            {!isGuest && (
              <button
                type="button"
                className="btn-hero-secondary"
                onClick={() => navigate("/video-analysis")}
              >
                <span>📁</span>
                <span>Upload Video File</span>
              </button>
            )}
          </div>
        </div>
      )}

      {!profile && !isGuest && (
        <div className="warn-box">
          <p>⚠️ Account not linked to WhatsApp yet</p>
          <p>
            Register with the same phone number you use in the WhatsApp group.
            Submit a video to see your data here.
          </p>
        </div>
      )}

      {/* No question yet — show motivational countdown */}
      {!data?.showReport && !data?.today?.question && (
        <QuestionCountdown
          posterSendTime={data?.posterSendTime || "08:00"}
          name={profile?.name}
          streak={profile?.streak || 0}
        />
      )}

      {profile &&
        data?.today?.question &&
        !isGuest &&
        (profile.completed ? (
          <CelebrationCard
            name={profile?.name}
            streak={profile?.streak || 0}
            navigate={navigate}
          />
        ) : data?.today?.isMonthlyReflection || data?.today?.isMonthlyGoals ? (
          <SubmitNudge
            name={profile?.name}
            streak={profile?.streak || 0}
            navigate={navigate}
            specialDay={data?.today?.isMonthlyGoals ? "goals" : "reflection"}
          />
        ) : (
          <SubmitNudge
            name={profile?.name}
            streak={profile?.streak || 0}
            navigate={navigate}
          />
        ))}

      {/* Guest submit nudge — same visual weight as SubmitNudge but drives to register */}
      {isGuest && data?.today?.question && (
        <div
          style={{
            background:
              "linear-gradient(135deg, #1e3a8a 0%, #1e40af 60%, #1e3a8a 100%)",
            border: "2px solid rgba(96,165,250,0.5)",
            borderRadius: 16,
            padding: "1.75rem 1.5rem",
            marginBottom: "1.5rem",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -60,
              right: -60,
              width: 200,
              height: 200,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(96,165,250,0.3) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              fontSize: "0.75rem",
              color: "rgba(255,255,255,0.7)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "0.5rem",
            }}
          >
            🎯 Ready to take the challenge?
          </div>
          <div
            style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              color: "#fff",
              marginBottom: "0.5rem",
              lineHeight: 1.3,
            }}
          >
            Submit your video and get AI-powered feedback!
          </div>
          <div
            style={{
              fontSize: "0.85rem",
              color: "rgba(255,255,255,0.75)",
              marginBottom: "1.25rem",
            }}
          >
            Register to unlock fluency, grammar, confidence & vocabulary
            analysis after each submission.
          </div>
          <button
            onClick={() => navigate("/register")}
            style={{
              width: "100%",
              background: "linear-gradient(135deg,#60a5fa,#3b82f6)",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "1rem",
              fontSize: "1.05rem",
              fontWeight: 800,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
            }}
          >
            ✨ Register Free — 30 Spots Daily
          </button>
        </div>
      )}

      <div className="stat-grid">
        <StatCard
          icon="🔥"
          label="Current Streak"
          value={`${profile?.streak || 0} days`}
          color="#f97316"
        />
        <StatCard
          icon="📹"
          label="Total Sessions"
          value={totalSessionsCount}
          color="#7c6fff"
        />
        <StatCard
          icon="⏱️"
          label="Total Recorded (All-time)"
          value={totalRecordedTimeLabel}
          color="#38bdf8"
        />
        <StatCard
          icon="📅"
          label="This Week"
          value={`${profile?.weeklySubmissions || 0}/7`}
          color="#4ade80"
        />
        <StatCard
          icon="📆"
          label="Monthly"
          value={profile?.monthlySubmissions || 0}
          color="#fbbf24"
        />
      </div>

      {/* Earned streak badges */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="section-title">🏅 Streak Badges</div>
        {profile?.currentBadge && (
          <div
            style={{
              marginBottom: "0.7rem",
              color: "var(--muted)",
              fontSize: "0.78rem",
            }}
          >
            Current badge <StreakBadge badge={profile.currentBadge} />
          </div>
        )}
        {profile?.nextBadge ? (
          <div style={{ marginBottom: "0.85rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "0.35rem",
                fontSize: "0.75rem",
              }}
            >
              <span style={{ color: "var(--muted)" }}>
                Progress to <StreakBadge badge={profile.nextBadge} compact />
              </span>
              <span
                style={{
                  color: profile.nextBadge.color,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {profile.badgeProgress?.remainingDays || 0} days to go
              </span>
            </div>
            <div
              style={{
                height: 9,
                borderRadius: 99,
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${profile.badgeProgress?.percent || 0}%`,
                  borderRadius: 99,
                  background: `linear-gradient(90deg, ${profile.currentBadge?.color || "#4ade80"}, ${profile.nextBadge.color})`,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "0.25rem",
                color: "var(--muted)",
                fontSize: "0.68rem",
              }}
            >
              <span>{profile.streak || 0} days</span>
              <span>{profile.nextBadge.days} days</span>
            </div>
          </div>
        ) : profile?.currentBadge ? (
          <div
            style={{
              marginBottom: "0.85rem",
              color: "#facc15",
              fontSize: "0.8rem",
              fontWeight: 700,
            }}
          >
            🌍 You’ve reached the highest badge — Master Orator!
          </div>
        ) : null}
        {profile?.earnedBadges?.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
            {profile.earnedBadges.map((badge) => (
              <StreakBadge key={badge.id} badge={badge} />
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
            Reach a 3-day streak to earn your first badge 🌱
          </div>
        )}
        {profile?.availableBadges?.length > 0 && (
          <div
            style={{
              marginTop: "1rem",
              paddingTop: "0.9rem",
              borderTop: "1px solid var(--border)",
            }}
          >
            <button
              onClick={() => setShowBadgeCatalog(true)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "0.75rem 0.85rem",
                borderRadius: 10,
                border: "1px solid rgba(124,111,255,0.3)",
                background: "rgba(124,111,255,0.08)",
                color: "var(--text)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                  }}
                >
                  View all badges
                </span>
                <span
                  style={{
                    display: "block",
                    color: "var(--muted)",
                    fontSize: "0.7rem",
                    marginTop: "0.2rem",
                  }}
                >
                  {profile.earnedBadges?.length || 0} of{" "}
                  {profile.availableBadges.length} unlocked
                </span>
              </span>
              <span style={{ color: "#a78bfa", fontSize: "1.2rem" }}>→</span>
            </button>
          </div>
        )}
      </div>

      <div className="stat-grid">
        <StatCard
          icon="👥"
          label="Group Members"
          value={data?.stats?.total || 0}
          color="#7c6fff"
        />
        <StatCard
          icon="✅"
          label="Submitted Today"
          value={data?.stats?.completed || 0}
          color="#4ade80"
        />
        <StatCard
          icon="⏳"
          label="Pending Today"
          value={data?.stats?.pending || 0}
          color="#f87171"
        />
      </div>

      {/* ── Hall of Fame — always visible ── */}
      {data?.streakRecord && (
        <div
          className="streak-record-banner"
          style={{
            marginBottom: "1rem",
            borderRadius: 14,
            padding: "0.75rem 1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            boxShadow: "0 0 24px rgba(251,191,36,0.12)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -30,
              right: -30,
              width: 120,
              height: 120,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(251,191,36,0.18) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <span style={{ fontSize: "1.6rem", flexShrink: 0 }}>👑</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.6rem",
                fontWeight: 800,
                color: "rgba(251,191,36,0.7)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: "0.15rem",
              }}
            >
              All-Time Streak Record
            </div>
            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "#fde68a",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {data.streakRecord.name}
            </div>
            {data.streakRecord.achievedAt && (
              <div
                style={{
                  fontSize: "0.62rem",
                  color: "rgba(251,191,36,0.5)",
                  marginTop: "0.1rem",
                }}
              >
                Set on{" "}
                {new Date(data.streakRecord.achievedAt).toLocaleDateString(
                  "en-IN",
                  { day: "numeric", month: "short", year: "numeric" },
                )}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: 900,
                color: "#fbbf24",
                lineHeight: 1,
              }}
            >
              {data.streakRecord.streak}
            </div>
            <div
              style={{
                fontSize: "0.62rem",
                color: "rgba(251,191,36,0.6)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              day streak
            </div>
          </div>
        </div>
      )}

      {/* ── Today's Top Scorer ── */}
      {data?.todayTopScorer && (
        <div
          className="today-top-scorer-banner"
          style={{
            marginBottom: "1rem",
            borderRadius: 18,
            padding: "0.85rem 1.25rem",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* shimmer line at top */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background:
                "linear-gradient(90deg, transparent 0%, #22d3ee 40%, #34d399 60%, transparent 100%)",
              opacity: 0.8,
            }}
          />
          {/* glow orbs */}
          <div
            style={{
              position: "absolute",
              top: -40,
              right: -40,
              width: 160,
              height: 160,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -30,
              left: -20,
              width: 100,
              height: 100,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(52,211,153,0.1) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* single row: label + name on left, score on right — all vertically centered */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            {/* left: label + name */}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  marginBottom: "0.25rem",
                }}
              >
                <span style={{ fontSize: "0.75rem", lineHeight: 1 }}>⭐</span>
                <span
                  style={{
                    fontSize: "0.58rem",
                    fontWeight: 800,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                    color: "#22d3ee",
                    opacity: 0.8,
                  }}
                >
                  Today's Top Scorer
                </span>
              </div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "#f0fdff",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  letterSpacing: "-0.02em",
                }}
              >
                {data.todayTopScorer.name}
              </div>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "rgba(34,211,238,0.45)",
                  marginTop: "0.1rem",
                }}
              >
                highest score today
              </div>
            </div>

            {/* right: score number + "points" label */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: "2.1rem",
                  fontWeight: 900,
                  lineHeight: 1,
                  background:
                    "linear-gradient(135deg, #22d3ee 0%, #34d399 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  letterSpacing: "-0.03em",
                }}
              >
                {data.todayTopScorer.score}
              </span>
              <span
                style={{
                  fontSize: "0.56rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(34,211,238,0.45)",
                  marginTop: "0.15rem",
                }}
              >
                points
              </span>
            </div>
          </div>
        </div>
      )}
      {/* ── Top Streaks leaderboard — always visible ── */}
      {data?.topStreak?.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="section-title">🏆 Today's Leaderboard</div>
          <div
            className="streak-list"
            style={{
              maxHeight: "16rem",
              overflowY: "auto",
              overflowX: "auto",
              paddingRight: "0.25rem",
            }}
          >
            {data.topStreak.map((u, i) => {
              const isMe =
                data?.myStreakEntry?.inTop5 &&
                data.myStreakEntry.rank === i + 1;
              return (
                <div
                  className="streak-row"
                  key={i}
                  style={
                    isMe
                      ? {
                          background: "var(--card2)",
                          border: "1.5px solid var(--primary)",
                          borderRadius: 12,
                          padding: "0.6rem 0.85rem",
                        }
                      : {}
                  }
                >
                  <span className="streak-rank">
                    {["🥇", "🥈", "🥉"][i] || `${i + 1}.`}
                  </span>
                  <span
                    className="streak-name"
                    style={isMe ? { color: "var(--primary)", fontWeight: 700 } : {}}
                  >
                    {u.name || u.userId?.split("@")[0]}
                    {u.currentBadge && (
                      <StreakBadge badge={u.currentBadge} compact />
                    )}
                    {isMe && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          color: "var(--primary)",
                          marginLeft: "0.35rem",
                          fontWeight: 700,
                        }}
                      >
                        (you)
                      </span>
                    )}
                  </span>
                  {/* stats row — wraps below name on very small screens */}
                  <span className="streak-val">🔥 {u.streak}d</span>
                  <span className="streak-sub">{u.weeklySubmissions}/7</span>
                  {u.monthlyScore > 0 ? (
                    <span className="streak-pts">
                      {Math.round(u.monthlyScore)} pts
                    </span>
                  ) : (
                    <span className="streak-pts-placeholder" />
                  )}
                  <span
                    className={`streak-badge ${u.completed ? "streak-badge--done" : "streak-badge--pending"}`}
                    style={{ marginLeft: "0.4rem" }}
                  >
                    {u.completed ? "✅ Done" : "⏳ Pending"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* My position row — only if NOT in top 5 */}
          {data?.myStreakEntry && !data.myStreakEntry.inTop5 && (
            <>
              <div
                style={{
                  borderTop: "1px dashed rgba(255,255,255,0.07)",
                  margin: "0.5rem 0",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%,-50%)",
                    background: "var(--card)",
                    padding: "0 0.5rem",
                    fontSize: "0.6rem",
                    color: "var(--muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  · · ·
                </span>
              </div>
              <div
                className="streak-row"
                style={{
                  background: "var(--card2)",
                  border: "1.5px solid var(--primary)",
                  borderRadius: 12,
                  padding: "0.6rem 0.85rem",
                }}
              >
                <span
                  className="streak-rank"
                  style={{ color: "var(--primary)", minWidth: 28, fontWeight: 800 }}
                >
                  #{data.myStreakEntry.rank}
                </span>
                <span
                  className="streak-name"
                  style={{ color: "var(--primary)", fontWeight: 700 }}
                >
                  {data.myStreakEntry.name || "You"}{" "}
                  {data.myStreakEntry.currentBadge && (
                    <StreakBadge
                      badge={data.myStreakEntry.currentBadge}
                      compact
                    />
                  )}{" "}
                  <span style={{ fontSize: "0.65rem", opacity: 0.8 }}>
                    (you)
                  </span>
                </span>
                <span className="streak-val">
                  🔥 {data.myStreakEntry.streak} days
                </span>
                <span className="streak-sub">
                  {data.myStreakEntry.weeklySubmissions}/7
                </span>
                {data.myStreakEntry.monthlyScore > 0 ? (
                  <span className="streak-pts">
                    {Math.round(data.myStreakEntry.monthlyScore)} pts
                  </span>
                ) : (
                  <span className="streak-pts-placeholder" />
                )}
                <span
                  className={`streak-badge ${data.myStreakEntry.completed ? "streak-badge--done" : "streak-badge--pending"}`}
                  style={{ marginLeft: "0.4rem" }}
                >
                  {data.myStreakEntry.completed ? "✅ Done" : "⏳ Pending"}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {scores.length > 0 ? (
        <>
          <div className="stat-grid">
            {Object.entries(SCORES).map(([k, c]) => (
              <StatCard
                key={k}
                icon={
                  k === "fluency"
                    ? "🗣️"
                    : k === "grammar"
                      ? "📝"
                      : k === "confidence"
                        ? "💪"
                        : "📚"
                }
                label={`Avg ${k.charAt(0).toUpperCase() + k.slice(1)}`}
                value={avg(scores, k)}
                color={c}
              />
            ))}
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">Latest Session Scores</div>
            <div className="grid-cols-2" style={{ gap: "1rem" }}>
              {Object.entries(SCORES).map(([k, c]) => (
                <div className="score-bar" key={k}>
                  <div className="score-bar-header">
                    <span className="score-bar-label">
                      {k.charAt(0).toUpperCase() + k.slice(1)}
                    </span>
                    <span
                      className="score-bar-value"
                      style={{ color: scoreColor(latest?.[k] || 0) }}
                    >
                      {latest?.[k] || 0}/10
                    </span>
                  </div>
                  <div className="score-bar-track">
                    <div
                      className="score-bar-fill"
                      style={{
                        width: `${(latest?.[k] || 0) * 10}%`,
                        background: c,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">
              Score History ({scores.length} sessions)
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                <XAxis dataKey="session" stroke="var(--muted)" fontSize={11} />
                <YAxis domain={[0, 10]} stroke="var(--muted)" fontSize={11} />
                <Tooltip contentStyle={tt} />
                <Legend />
                {Object.entries(SCORES).map(([k, c]) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k.charAt(0).toUpperCase() + k.slice(1)}
                    stroke={c}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            {isGuest && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: "0.75rem",
                  color: "var(--muted)",
                  marginTop: "0.5rem",
                  padding: "0.5rem",
                  background: "rgba(124,111,255,0.07)",
                  borderRadius: 8,
                }}
              >
                📊 Sample data — register to track your real progress
              </div>
            )}
          </div>

          {pointsData.length > 0 && pointsSummary && (
            <div
              className="card points-trend-card"
              style={{
                marginTop: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "1rem",
                  marginBottom: "0.95rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    className="section-title"
                    style={{ marginBottom: "0.25rem" }}
                  >
                    📈 Daily Points Trend
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: "0.74rem" }}>
                    Your consistency over the last {pointsData.length} sessions
                    · Sunday bonuses excluded
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      padding: "0.4rem 0.7rem",
                      borderRadius: 999,
                      background: "rgba(34,211,238,0.12)",
                      color: "#67e8f9",
                      fontSize: "0.74rem",
                      fontWeight: 700,
                    }}
                  >
                    {pointsSummary.avg} avg pts
                  </div>
                  <div
                    style={{
                      padding: "0.4rem 0.7rem",
                      borderRadius: 999,
                      background: "rgba(167,139,250,0.14)",
                      color: "#c4b5fd",
                      fontSize: "0.74rem",
                      fontWeight: 700,
                    }}
                  >
                    Best {pointsSummary.best} pts
                  </div>
                  <div
                    style={{
                      padding: "0.4rem 0.75rem",
                      borderRadius: 999,
                      background: pointsSummary.performance.badgeBg,
                      color: pointsSummary.performance.color,
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      border: `1px solid ${pointsSummary.performance.color}33`,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <span>{pointsSummary.performance.icon}</span>
                    <span>{pointsSummary.performance.label}</span>
                  </div>
                </div>
              </div>

              {/* Motivational Insight Banner */}
              {pointsSummary.performance?.motivationalTip && (
                <div
                  className="points-motivational-tip"
                  style={{
                    padding: "0.65rem 0.9rem",
                    borderRadius: 10,
                    marginBottom: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                  }}
                >
                  <span style={{ fontSize: "1.1rem" }}>
                    {pointsSummary.performance.icon}
                  </span>
                  <span
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--text)",
                      lineHeight: 1.4,
                      fontWeight: 600,
                    }}
                  >
                    {pointsSummary.performance.motivationalTip}
                  </span>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "0.7rem",
                  marginBottom: "0.9rem",
                }}
              >
                <div className="points-trend-stat-box">
                  <div
                    style={{
                      fontSize: "0.7rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--muted)",
                      marginBottom: "0.25rem",
                      fontWeight: 700,
                    }}
                  >
                    Latest
                  </div>
                  <div
                    style={{
                      fontSize: "1.2rem",
                      fontWeight: 800,
                      color: "var(--text)",
                    }}
                  >
                    {pointsSummary.latest} pts
                  </div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      color: "var(--muted)",
                      marginTop: "0.2rem",
                    }}
                  >
                    Session #{pointsSummary.sessionCount}
                  </div>
                </div>
                <div className="points-trend-stat-box">
                  <div
                    style={{
                      fontSize: "0.7rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--muted)",
                      marginBottom: "0.25rem",
                      fontWeight: 700,
                    }}
                  >
                    Performance
                  </div>
                  <div
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      color: pointsSummary.performance.color,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <span>{pointsSummary.performance.icon}</span>
                    <span>{pointsSummary.performance.label}</span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      color: "var(--text2)",
                      marginTop: "0.2rem",
                    }}
                  >
                    {pointsSummary.performance.trendText}
                  </div>
                </div>
                <div className="points-trend-stat-box">
                  <div
                    style={{
                      fontSize: "0.7rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--muted)",
                      marginBottom: "0.25rem",
                      fontWeight: 700,
                    }}
                  >
                    Last 30 Sessions
                  </div>
                  <div
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 800,
                      color: "var(--text)",
                    }}
                  >
                    {pointsSummary.last30RecordedLabel}
                  </div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      color: "var(--muted)",
                      marginTop: "0.25rem",
                    }}
                  >
                    {pointsSummary.last30RecordedSeconds > 0
                      ? "Recent speak time"
                      : "Last 30 sessions"}
                  </div>
                </div>
                <div className="points-trend-stat-box">
                  <div
                    style={{
                      fontSize: "0.7rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--muted)",
                      marginBottom: "0.25rem",
                      fontWeight: 700,
                    }}
                  >
                    Momentum
                  </div>
                  <div
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: pointsSummary.trend.color,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <span>{pointsSummary.trend.icon}</span>
                    <span>{pointsSummary.trend.label}</span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      color: "var(--text2)",
                      marginTop: "0.2rem",
                    }}
                  >
                    {pointsSummary.trend.subText}
                  </div>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={250}>
                <AreaChart
                  data={pointsData}
                  margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="dailyPointsFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#22d3ee"
                        stopOpacity={0.28}
                      />
                      <stop
                        offset="72%"
                        stopColor="#22d3ee"
                        stopOpacity={0.08}
                      />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 6"
                    stroke="rgba(148,163,184,0.14)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="session"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    dy={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      ...tt,
                      boxShadow: "var(--shadow)",
                    }}
                    cursor={{ stroke: "var(--border3)", strokeWidth: 1 }}
                    formatter={(v) => [`${v} pts`, "Daily points"]}
                    itemStyle={{ color: "var(--primary)", fontWeight: 700 }}
                    labelStyle={{ color: "var(--muted)", marginBottom: "0.2rem" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pts"
                    stroke="none"
                    fill="url(#dailyPointsFill)"
                  />
                  <Line
                    type="monotone"
                    dataKey="pts"
                    name="Daily points"
                    stroke="#67e8f9"
                    strokeWidth={3.2}
                    connectNulls
                    isAnimationActive={false}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="pts"
                    stroke="none"
                    strokeWidth={0}
                    connectNulls={false}
                    isAnimationActive={false}
                    dot={{
                      r: 4.5,
                      fill: "#cffafe",
                      stroke: "#67e8f9",
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6,
                      fill: "#cffafe",
                      stroke: "#0891b2",
                      strokeWidth: 2.5,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">Session History</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Recorded</th>
                    <th>Fluency</th>
                    <th>Grammar</th>
                    <th>Confidence</th>
                    <th>Vocabulary</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedScores.map((s, i) => {
                    const globalIdx =
                      scores.length -
                      ((sessionPage - 1) * SESSION_PAGE_SIZE + i);
                    return (
                      <tr key={i}>
                        <td style={{ color: "var(--muted)" }}>{globalIdx}</td>
                        <td style={{ color: "var(--muted)" }}>
                          {s.date
                            ? new Date(s.date).toLocaleDateString("en-IN")
                            : s.submittedAt
                              ? new Date(s.submittedAt).toLocaleDateString(
                                  "en-IN",
                                )
                              : "—"}
                        </td>
                        <td
                          style={{
                            color: "#38bdf8",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatSessionDuration(
                            parseDurationToSeconds(
                              s.duration ??
                                s.videoDuration ??
                                s.recordedDuration ??
                                s.durationSeconds,
                            ),
                          )}
                        </td>
                        {["fluency", "grammar", "confidence", "vocabulary"].map(
                          (k) => (
                            <td
                              key={k}
                              style={{
                                fontWeight: 600,
                                color: scoreColor(s[k] || 0),
                              }}
                            >
                              {s[k] ?? "—"}/10
                            </td>
                          ),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginTop: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn-ghost"
                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.82rem" }}
                  onClick={() => setSessionPage((p) => Math.max(1, p - 1))}
                  disabled={sessionPage === 1}
                >
                  ← Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (p) => (
                    <button
                      key={p}
                      className={
                        sessionPage === p ? "btn-primary" : "btn-ghost"
                      }
                      style={{
                        padding: "0.3rem 0.65rem",
                        fontSize: "0.82rem",
                        minWidth: 34,
                      }}
                      onClick={() => setSessionPage(p)}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  className="btn-ghost"
                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.82rem" }}
                  onClick={() =>
                    setSessionPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={sessionPage === totalPages}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card empty-state">
          <div className="empty-icon">📹</div>
          <p>
            No feedback scores yet. Submit a video via WhatsApp to get started!
          </p>
        </div>
      )}

      {/* Live Sessions */}
      {liveSessions.length > 0 && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <div className="section-title">🎥 Live Sessions</div>
          <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
            {liveSessions.map((s) => {
              const isLive = s.status === "live";
              const alreadyIn =
                isLive && s.participants?.includes(data?.profile?.linkedPhone);
              return (
                <div
                  key={s._id}
                  style={{
                    background: isLive
                      ? "rgba(74,222,128,0.05)"
                      : "var(--bg-secondary)",
                    border: `1px solid ${isLive ? "rgba(74,222,128,0.4)" : "rgba(96,165,250,0.25)"}`,
                    borderRadius: 12,
                    padding: "1rem 1.25rem",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {isLive && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        background: "linear-gradient(90deg, #4ade80, #22c55e)",
                      }}
                    />
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "1rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          marginBottom: "0.3rem",
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                          {s.title}
                        </span>
                        <span
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            padding: "0.15rem 0.5rem",
                            borderRadius: 20,
                            textTransform: "uppercase",
                            background: isLive
                              ? "rgba(74,222,128,0.15)"
                              : "rgba(96,165,250,0.15)",
                            color: isLive ? "#4ade80" : "#60a5fa",
                          }}
                        >
                          {isLive ? "🔴 Live Now" : "Scheduled"}
                        </span>
                        {/* "You're inside" badge */}
                        {alreadyIn && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              padding: "0.15rem 0.5rem",
                              borderRadius: 20,
                              background: "rgba(124,111,255,0.15)",
                              color: "#a78bfa",
                            }}
                          >
                            ✅ You're in
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--muted)",
                            marginBottom: "0.4rem",
                          }}
                        >
                          {s.description}
                        </div>
                      )}
                      <div
                        style={{ fontSize: "0.78rem", color: "var(--muted)" }}
                      >
                        📅{" "}
                        {new Date(s.scheduledAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {s.participantCount > 0 &&
                          ` · 👥 ${s.participantCount}/${s.maxParticipants || 20}`}
                        {s.participantCount >= (s.maxParticipants || 20) &&
                          " 🔴 Full"}
                      </div>
                    </div>

                    {/* Join / Rejoin button — only for live sessions */}
                    {isLive && (
                      <button
                        onClick={() => navigate(`/live/${s._id}`)}
                        style={{
                          background: alreadyIn
                            ? "rgba(124,111,255,0.15)"
                            : "linear-gradient(135deg,#4ade80,#22c55e)",
                          color: alreadyIn ? "#a78bfa" : "#065f46",
                          border: alreadyIn
                            ? "1px solid rgba(124,111,255,0.35)"
                            : "none",
                          borderRadius: 10,
                          padding: "0.5rem 1rem",
                          fontWeight: 700,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {alreadyIn ? "🔄 Rejoin" : "📹 Join Now"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </Layout>
  );
}
