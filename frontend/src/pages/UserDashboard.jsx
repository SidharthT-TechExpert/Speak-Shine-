import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import api from "../api/client.js";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
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

const SUBMIT_MOTIVATIONAL = [
  "Your streak is on the line! Submit now to keep it alive! 🔥",
  "The clock is ticking! Show us what you've got! ⏰",
  "Don't let today slip away — your voice matters! 💪",
  "Every second counts! Make your submission before midnight! 🌟",
  "You're so close! Just one video away from another win! 🎯",
  "Time waits for no one! Submit and keep your momentum! 🚀",
  "Your future self will thank you for submitting today! ✨",
  "Beat the deadline! Your consistency is your superpower! 💎",
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
            { val: pad(remaining.hrs),  label: "Hours" },
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
  const [quote] = useState(() => SUBMIT_MOTIVATIONAL[Math.floor(Math.random() * SUBMIT_MOTIVATIONAL.length)]);
  const timerRef = useRef(null);

  const calcRemaining = () => {
    const now = new Date();
    const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    
    // Calculate time until next midnight IST (00:00:00 tomorrow)
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

  return (
    <div style={{
      background: urgency === "high" 
        ? "linear-gradient(135deg, #7f1d1d 0%, #991b1b 60%, #7f1d1d 100%)"
        : urgency === "medium"
        ? "linear-gradient(135deg, #78350f 0%, #92400e 60%, #78350f 100%)"
        : "linear-gradient(135deg, #1e3a8a 0%, #1e40af 60%, #1e3a8a 100%)",
      border: urgency === "high" 
        ? "2px solid rgba(248,113,113,0.5)"
        : urgency === "medium"
        ? "2px solid rgba(251,191,36,0.5)"
        : "2px solid rgba(96,165,250,0.5)",
      borderRadius: 16,
      padding: "1.75rem 1.5rem",
      marginBottom: "1.5rem",
      position: "relative",
      overflow: "hidden",
      animation: urgency === "high" ? "pulse 2s ease-in-out infinite" : "none",
    }}>
      {/* Animated glow */}
      <div style={{
        position: "absolute", top: -60, right: -60,
        width: 200, height: 200, borderRadius: "50%",
        background: urgency === "high"
          ? "radial-gradient(circle, rgba(248,113,113,0.3) 0%, transparent 70%)"
          : urgency === "medium"
          ? "radial-gradient(circle, rgba(251,191,36,0.3) 0%, transparent 70%)"
          : "radial-gradient(circle, rgba(96,165,250,0.3) 0%, transparent 70%)",
        pointerEvents: "none",
        animation: "float 3s ease-in-out infinite",
      }} />

      {/* Urgency badge */}
      <div style={{
        position: "absolute", top: "1rem", right: "1rem",
        background: urgency === "high" ? "#f87171" : urgency === "medium" ? "#fbbf24" : "#60a5fa",
        color: urgency === "high" ? "#7f1d1d" : urgency === "medium" ? "#78350f" : "#1e3a8a",
        padding: "0.4rem 0.8rem", borderRadius: 20,
        fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}>
        {urgency === "high" ? "⚠️ URGENT" : urgency === "medium" ? "⏰ HURRY" : "📌 PENDING"}
      </div>

      {/* Header */}
      <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
        {name ? `${name.split(" ")[0]}, ` : ""}Time is Running Out!
      </div>

      {/* Main message */}
      <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", marginBottom: "0.5rem", lineHeight: 1.3 }}>
        {specialDay === "weekly"
          ? "📅 Weekly Reflection — Record Before Midnight!"
          : specialDay === "goals"
          ? "🎯 Monthly Goals — Speak Your Plan Today!"
          : specialDay === "reflection"
          ? "🌟 Monthly Reflection — Submit Before Midnight!"
          : urgency === "high"
          ? "⚡ Submit NOW or Lose Your Streak!"
          : urgency === "medium"
          ? "🎯 Don't Wait! Submit Your Video Today!"
          : "📹 Question is Live — Time to Shine!"}
      </div>

      {/* Countdown */}
      {remaining && (
        <div style={{ marginTop: "1.25rem", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.8)", marginBottom: "0.75rem", fontWeight: 600 }}>
            ⏰ Time Remaining Until Midnight:
          </div>
          <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}>
            {[
              { val: pad(remaining.hrs),  label: "Hours", icon: "⏰" },
              { val: pad(remaining.mins), label: "Minutes", icon: "⏱️" },
              { val: pad(remaining.secs), label: "Seconds", icon: "⚡" },
            ].map(({ val, label, icon }) => (
              <div key={label} style={{
                flex: 1, 
                background: "rgba(255,255,255,0.15)", 
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 12, 
                padding: "0.9rem 0.5rem", 
                textAlign: "center",
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              }}>
                <div style={{ fontSize: "0.9rem", marginBottom: "0.2rem" }}>{icon}</div>
                <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>{val}</div>
                <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.8)", marginTop: "0.35rem", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Streak warning */}
      {streak > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.6rem",
          background: "rgba(249,115,22,0.2)", 
          border: "2px solid rgba(249,115,22,0.4)",
          borderRadius: 12, 
          padding: "0.8rem 1rem", 
          marginBottom: "1.25rem",
          fontSize: "0.9rem",
          boxShadow: "0 4px 12px rgba(249,115,22,0.2)",
        }}>
          <span style={{ fontSize: "1.5rem" }}>🔥</span>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, marginBottom: "0.1rem" }}>
              {streak}-Day Streak at Risk!
            </div>
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.8rem" }}>
              Don't break your amazing streak — submit before midnight!
            </div>
          </div>
        </div>
      )}

      {/* CTA Button */}
      <button
        onClick={() => navigate('/record')}
        style={{
          width: "100%",
          background: urgency === "high"
            ? "linear-gradient(135deg, #f87171 0%, #ef4444 100%)"
            : urgency === "medium"
            ? "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)"
            : "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
          color: urgency === "high" || urgency === "medium" ? "#000" : "#fff",
          border: "none",
          borderRadius: 12,
          padding: "1rem 1.5rem",
          fontSize: "1.05rem",
          fontWeight: 800,
          cursor: "pointer",
          transition: "all 0.3s ease",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
          marginBottom: "1rem",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-3px) scale(1.02)";
          e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0) scale(1)";
          e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
        }}
      >
        🎥 {specialDay === "weekly" ? "RECORD WEEKLY REFLECTION" : specialDay === "goals" ? "RECORD MONTHLY GOALS" : specialDay === "reflection" ? "RECORD MONTHLY REFLECTION" : urgency === "high" ? "SUBMIT NOW!" : urgency === "medium" ? "Upload Video Now!" : "Record Your Answer"}
      </button>

      {/* Motivational quote */}
      <div style={{
        borderLeft: "3px solid rgba(255,255,255,0.4)",
        paddingLeft: "0.85rem",
        color: "rgba(255,255,255,0.9)",
        fontSize: "0.85rem",
        fontStyle: "italic",
        lineHeight: 1.5,
        fontWeight: 500,
      }}>
        💡 {quote}
      </div>

      {/* Add keyframes for animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(248,113,113,0.4); }
          50% { box-shadow: 0 0 40px rgba(248,113,113,0.7); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
}

function CelebrationCard({ name, streak, navigate }) {
  const [quote] = useState(() => CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)]);

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
      <div style={{ position:"absolute", top:-60, right:-60, width:200, height:200, borderRadius:"50%", background:"radial-gradient(circle, rgba(74,222,128,0.18) 0%, transparent 70%)", pointerEvents:"none" }} />
      <div style={{ position:"absolute", bottom:-40, left:-40, width:160, height:160, borderRadius:"50%", background:"radial-gradient(circle, rgba(34,197,94,0.12) 0%, transparent 70%)", pointerEvents:"none" }} />

      {/* top row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"1.25rem" }}>
        <div>
          <div style={{ fontSize:"0.7rem", color:"rgba(74,222,128,0.8)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"0.4rem" }}>
            🎊 {name ? `Well done, ${name.split(" ")[0]}!` : "Well done!"}
          </div>
          <div style={{ fontSize:"1.5rem", fontWeight:800, color:"#fff", lineHeight:1.2 }}>
            Today's challenge<br/>complete ✅
          </div>
        </div>
        <div style={{
          background:"rgba(74,222,128,0.15)",
          border:"1px solid rgba(74,222,128,0.4)",
          color:"#4ade80",
          padding:"0.35rem 0.85rem",
          borderRadius:20,
          fontSize:"0.72rem",
          fontWeight:700,
          textTransform:"uppercase",
          letterSpacing:"0.06em",
          whiteSpace:"nowrap",
          flexShrink:0,
        }}>✓ Submitted</div>
      </div>

      {/* stats row */}
      <div className="grid-cols-3" style={{ gap:"0.6rem", marginBottom:"1.25rem" }}>
        {[
          { icon:"✅", value:"Done", sub:"Today", accent:"rgba(74,222,128,0.2)", border:"rgba(74,222,128,0.3)" },
          { icon:"🔥", value:streak||0, sub:"Day Streak", accent:"rgba(249,115,22,0.2)", border:"rgba(249,115,22,0.35)" },
          { icon:"🏆", value:"Win", sub:"Earned", accent:"rgba(251,191,36,0.15)", border:"rgba(251,191,36,0.3)" },
        ].map((s,i) => (
          <div key={i} style={{
            background:s.accent,
            border:`1px solid ${s.border}`,
            borderRadius:14,
            padding:"0.85rem 0.5rem",
            textAlign:"center",
          }}>
            <div style={{ fontSize:"1.6rem", lineHeight:1, marginBottom:"0.35rem" }}>{s.icon}</div>
            <div style={{ fontSize:"1rem", fontWeight:800, color:"#fff" }}>{s.value}</div>
            <div style={{ fontSize:"0.6rem", color:"rgba(255,255,255,0.6)", textTransform:"uppercase", letterSpacing:"0.06em", marginTop:"0.15rem" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* streak message */}
      {streak > 0 && (
        <div style={{
          background:"rgba(255,255,255,0.06)",
          border:"1px solid rgba(255,255,255,0.1)",
          borderRadius:12,
          padding:"0.85rem 1rem",
          marginBottom:"1rem",
          display:"flex",
          alignItems:"center",
          gap:"0.75rem",
        }}>
          <span style={{ fontSize:"1.4rem", flexShrink:0 }}>🎯</span>
          <div>
            <div style={{ fontWeight:700, color:"#fff", fontSize:"0.9rem" }}>{streak} Days of Consistency!</div>
            <div style={{ fontSize:"0.78rem", color:"rgba(255,255,255,0.65)", marginTop:"0.15rem" }}>
              {streak >= 30 ? "You're a legend! 30+ days of dedication!" :
               streak >= 14 ? "Two weeks strong! You're unstoppable!" :
               streak >= 7  ? "One week milestone! Keep the momentum!" :
               "Every day counts. You're building greatness!"}
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => document.querySelector(".section-title")?.scrollIntoView({ behavior:"smooth", block:"start" })}
        style={{
          width:"100%",
          background:"linear-gradient(135deg, #22c55e, #16a34a)",
          color:"#fff",
          border:"none",
          borderRadius:12,
          padding:"0.85rem",
          fontSize:"0.9rem",
          fontWeight:700,
          cursor:"pointer",
          letterSpacing:"0.04em",
          boxShadow:"0 4px 16px rgba(34,197,94,0.3)",
          marginBottom:"1rem",
        }}
      >
        📊 View My Feedback Scores
      </button>

      {/* quote */}
      <div style={{ fontSize:"0.8rem", color:"rgba(255,255,255,0.55)", fontStyle:"italic", paddingLeft:"0.75rem", borderLeft:"2px solid rgba(74,222,128,0.4)" }}>
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
const tt = { background: "#16162a", border: "1px solid #252545", borderRadius: 10, fontSize: 12 };
const avg = (arr, k) => { const v = arr.filter(s => s[k] != null).map(s => s[k]); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(1) : "—"; };
const scoreColor = v => v >= 7 ? "var(--success)" : v >= 5 ? "var(--warning)" : "var(--danger)";

const CACHE_KEY = "dashboard_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedDashboard() {
  try {
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
  } catch {}
}

export default function UserDashboard() {
  const cached = getCachedDashboard();
  const [data, setData] = useState(cached); // show cached immediately
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!cached); // skip spinner if cached
  const [liveSessions, setLiveSessions] = useState([]);
  const [sessionPage, setSessionPage] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get("/dashboard/me"),
      api.get("/live-sessions").catch(() => ({ data: [] })),
    ]).then(([d, ls]) => {
      setData(d.data);
      setCachedDashboard(d.data); // save fresh data for next visit
      setLiveSessions((ls.data || []).filter(s => s.status === "live" || s.status === "scheduled"));
    })
    .catch(err => {
      // Only show error if we have no cached data to fall back on
      if (!getCachedDashboard()) setError(err.response?.data?.error || "Failed to load data");
    })
    .finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout title="My Dashboard"><div className="spinner-wrap"><div className="spinner"/><p style={{color:"var(--muted)"}}>Loading…</p></div></Layout>;
  if (error) return <Layout title="My Dashboard"><div className="error-box"><p>{error}</p><button className="btn-primary" style={{marginTop:"1rem"}} onClick={()=>window.location.reload()}>Retry</button></div></Layout>;

  const profile = data?.profile;
  const scores = profile?.feedbackScores || [];
  const latest = scores.slice(-1)[0];
  const chartData = scores.map((s, i) => ({ session: `#${i+1}`, Fluency: s.fluency, Grammar: s.grammar, Confidence: s.confidence, Vocabulary: s.vocabulary }));
  const radarData = latest ? Object.keys(SCORES).map(k => ({ subject: k.charAt(0).toUpperCase()+k.slice(1), score: latest[k] || 0 })) : [];
  const SESSION_PAGE_SIZE = 5;
  const reversedScores = [...scores].reverse();
  const totalPages = Math.ceil(reversedScores.length / SESSION_PAGE_SIZE);
  const pagedScores = reversedScores.slice((sessionPage - 1) * SESSION_PAGE_SIZE, sessionPage * SESSION_PAGE_SIZE);

  return (
    <Layout title="My Dashboard">
      {/* Show Daily Report (12 AM - 8 AM) */}
      {data?.showReport && data?.dailyReport && (
        <div className="daily-poster" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" }}>
          <div className="daily-poster-header">
            <div className="daily-poster-brand">📊 Yesterday's Performance</div>
            <div className="daily-poster-sub">DAILY REPORT</div>
            {data.dailyReport.submitted && (
              <div className="daily-poster-badge" style={{ background: "#4ade80" }}>✅ Submitted</div>
            )}
            {!data.dailyReport.submitted && (
              <div className="daily-poster-badge" style={{ background: "#f87171" }}>❌ Missed</div>
            )}
          </div>

          {data.dailyReport.submitted ? (
            <>
              {/* Scores */}
              <div style={{ marginTop: "1.5rem" }}>
                <div className="daily-poster-section-label">YOUR SCORES</div>
                <div className="grid-cols-2" style={{ marginTop: "0.75rem" }}>
                  {[
                    { label: "Fluency", value: data.dailyReport.fluency, icon: "🗣️" },
                    { label: "Grammar", value: data.dailyReport.grammar, icon: "📝" },
                    { label: "Confidence", value: data.dailyReport.confidence, icon: "💪" },
                    { label: "Vocabulary", value: data.dailyReport.vocabulary, icon: "📚" },
                  ].map(({ label, value, icon }) => (
                    <div key={label} style={{ background: "rgba(255,255,255,0.05)", padding: "0.75rem", borderRadius: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>{icon}</div>
                      <div style={{ fontSize: "0.75rem", color: "#8888aa", marginBottom: "0.25rem" }}>{label}</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: value >= 7 ? "#4ade80" : value >= 5 ? "#fbbf24" : "#f87171" }}>
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
                  <div style={{ background: "rgba(255,255,255,0.05)", padding: "1rem", borderRadius: "8px", marginTop: "0.75rem", fontSize: "0.9rem", lineHeight: "1.6" }}>
                    {data.dailyReport.overallComment}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid-cols-3" style={{ marginTop: "1.5rem" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem" }}>🔥</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: "bold", marginTop: "0.25rem" }}>{data.dailyReport.streak}</div>
                  <div style={{ fontSize: "0.75rem", color: "#8888aa" }}>Streak</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem" }}>📅</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: "bold", marginTop: "0.25rem" }}>{data.dailyReport.weeklySubmissions}/7</div>
                  <div style={{ fontSize: "0.75rem", color: "#8888aa" }}>This Week</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem" }}>📆</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: "bold", marginTop: "0.25rem" }}>{data.dailyReport.monthlySubmissions}</div>
                  <div style={{ fontSize: "0.75rem", color: "#8888aa" }}>This Month</div>
                </div>
              </div>

              {/* Fine Information */}
              <div className="grid-cols-2" style={{ marginTop: "1.5rem" }}>
                <div style={{ background: "rgba(248, 113, 113, 0.1)", padding: "0.75rem", borderRadius: "8px", textAlign: "center", border: "1px solid rgba(248, 113, 113, 0.2)" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>💸</div>
                  <div style={{ fontSize: "0.75rem", color: "#8888aa", marginBottom: "0.25rem" }}>Total Fine</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#f87171" }}>₹{data.dailyReport.fine || 0}</div>
                </div>
                <div style={{ background: "rgba(251, 191, 36, 0.1)", padding: "0.75rem", borderRadius: "8px", textAlign: "center", border: "1px solid rgba(251, 191, 36, 0.2)" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>📊</div>
                  <div style={{ fontSize: "0.75rem", color: "#8888aa", marginBottom: "0.25rem" }}>Weekly Fine</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#fbbf24" }}>₹{data.dailyReport.weeklyFine || 0}</div>
                </div>
              </div>

              {/* Fine Added Warning */}
              {data.dailyReport.fineAdded && (
                <div style={{ marginTop: "1rem", background: "rgba(248, 113, 113, 0.1)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(248, 113, 113, 0.2)", textAlign: "center" }}>
                  <div style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>⚠️</div>
                  <div style={{ fontSize: "0.9rem", color: "#f87171", fontWeight: "bold" }}>Fine was added yesterday for missing submission</div>
                </div>
              )}
            </>
          ) : (
            <div style={{ marginTop: "1.5rem", textAlign: "center", padding: "2rem" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>😔</div>
              <div style={{ fontSize: "1.1rem", fontWeight: "bold", marginBottom: "0.5rem" }}>You missed yesterday's challenge</div>
              <div style={{ fontSize: "0.9rem", color: "#8888aa", marginBottom: "1rem" }}>Don't worry! Today is a new opportunity to shine.</div>
              
              {/* Fine Information for Missed Day */}
              <div className="grid-cols-2" style={{ maxWidth: "300px", margin: "1.5rem auto 0" }}>
                <div style={{ background: "rgba(248, 113, 113, 0.1)", padding: "0.75rem", borderRadius: "8px", textAlign: "center", border: "1px solid rgba(248, 113, 113, 0.2)" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>💸</div>
                  <div style={{ fontSize: "0.75rem", color: "#8888aa", marginBottom: "0.25rem" }}>Total Fine</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#f87171" }}>₹{data.dailyReport.fine || 0}</div>
                </div>
                <div style={{ background: "rgba(251, 191, 36, 0.1)", padding: "0.75rem", borderRadius: "8px", textAlign: "center", border: "1px solid rgba(251, 191, 36, 0.2)" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>📊</div>
                  <div style={{ fontSize: "0.75rem", color: "#8888aa", marginBottom: "0.25rem" }}>Weekly Fine</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#fbbf24" }}>₹{data.dailyReport.weeklyFine || 0}</div>
                </div>
              </div>
              
              {data.dailyReport.fineAdded && (
                <div style={{ marginTop: "1rem", background: "rgba(248, 113, 113, 0.1)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(248, 113, 113, 0.2)" }}>
                  <div style={{ fontSize: "0.9rem", color: "#f87171", fontWeight: "bold" }}>⚠️ Fine was added for missing submission</div>
                </div>
              )}
            </div>
          )}

          <div className="daily-poster-cta" style={{ marginTop: "1.5rem" }}>
            ⏰ New question arrives at 8:00 AM
          </div>
        </div>
      )}

      {/* Show Question (8 AM onwards) — hide if already completed */}
      {!data?.showReport && data?.today?.question && !profile?.completed && (
        <div className="daily-poster" style={data?.today?.isMonthlyReflection ? {
          background: "linear-gradient(135deg, #1a0a2e 0%, #2d1060 50%, #1a0a2e 100%)",
          border: "2px solid rgba(167,139,250,0.5)",
          boxShadow: "0 8px 40px rgba(139,92,246,0.25)",
        } : data?.today?.isMonthlyGoals ? {
          background: "linear-gradient(135deg, #0a1f0a 0%, #0d3d1a 50%, #0a2e12 100%)",
          border: "2px solid rgba(74,222,128,0.45)",
          boxShadow: "0 8px 40px rgba(34,197,94,0.2)",
        } : data?.today?.isWeeklyReflection ? {
          background: "linear-gradient(135deg, #0c1a2e 0%, #0f2d4a 50%, #0c1a2e 100%)",
          border: "2px solid rgba(56,189,248,0.45)",
          boxShadow: "0 8px 40px rgba(14,165,233,0.2)",
        } : {}}>
          {/* Header */}
          <div className="daily-poster-header">
            <div className="daily-poster-brand">
              {data?.today?.isMonthlyReflection ? "🌟 Speak & Shine"
               : data?.today?.isMonthlyGoals ? "🎯 Speak & Shine"
               : data?.today?.isWeeklyReflection ? "📅 Speak & Shine"
               : "✦ Speak & Shine"}
            </div>
            <div className="daily-poster-sub">
              {data?.today?.isMonthlyReflection ? "MONTHLY REFLECTION"
               : data?.today?.isMonthlyGoals ? "MONTHLY GOAL SETTING"
               : data?.today?.isWeeklyReflection ? "WEEKLY REFLECTION"
               : "DAILY SPEAKING CHALLENGE"}
            </div>
            {data.today.category && (
              <div className="daily-poster-badge" style={
                data?.today?.isMonthlyReflection ? { background:"rgba(139,92,246,0.3)", border:"1px solid rgba(167,139,250,0.5)", color:"#c4b5fd" }
                : data?.today?.isMonthlyGoals ? { background:"rgba(34,197,94,0.25)", border:"1px solid rgba(74,222,128,0.5)", color:"#4ade80" }
                : data?.today?.isWeeklyReflection ? { background:"rgba(14,165,233,0.25)", border:"1px solid rgba(56,189,248,0.5)", color:"#38bdf8" }
                : {}
              }>
                {data.today.category}
              </div>
            )}
          </div>

          {/* Monthly Reflection questions */}
          {data?.today?.isMonthlyReflection ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="daily-poster-section-label">📋 REFLECTION QUESTIONS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
                {["How many reviews did you attend this month?","How many reviews passed and how many failed? Why did you fail?","How many extensions did you take this month?","What is your current growth and progress in the program?","What did you do this month to improve your communication skill?","What is your communication skill level now compared to last month?"].map((q, i) => (
                  <div key={i} style={{ display:"flex", gap:"0.75rem", alignItems:"flex-start", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(167,139,250,0.2)", borderRadius:10, padding:"0.65rem 0.85rem" }}>
                    <div style={{ minWidth:24, height:24, borderRadius:"50%", background:"rgba(139,92,246,0.3)", border:"1px solid rgba(139,92,246,0.5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.72rem", fontWeight:800, color:"#a78bfa", flexShrink:0 }}>{i+1}</div>
                    <div style={{ fontSize:"0.85rem", color:"rgba(255,255,255,0.9)", lineHeight:1.5 }}>{q}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:"0.85rem", background:"rgba(139,92,246,0.1)", border:"1px solid rgba(139,92,246,0.25)", borderRadius:10, padding:"0.65rem 0.85rem", fontSize:"0.78rem", color:"rgba(255,255,255,0.65)" }}>
                💡 Record a video answering all 6 questions. Same rules apply — counts as your daily submission.
              </div>
            </div>

          /* Monthly Goals questions */
          ) : data?.today?.isMonthlyGoals ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="daily-poster-section-label">🎯 GOAL SETTING QUESTIONS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
                {["What is your main goal for this month in the program?","What is your dream or target you are working toward right now?","What specific steps will you take this month to improve your communication?","What was your biggest challenge last month and how will you overcome it this month?","How many reviews are you planning to attend this month?","What will you do differently this month to grow faster?"].map((q, i) => (
                  <div key={i} style={{ display:"flex", gap:"0.75rem", alignItems:"flex-start", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:10, padding:"0.65rem 0.85rem" }}>
                    <div style={{ minWidth:24, height:24, borderRadius:"50%", background:"rgba(34,197,94,0.25)", border:"1px solid rgba(74,222,128,0.5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.72rem", fontWeight:800, color:"#4ade80", flexShrink:0 }}>{i+1}</div>
                    <div style={{ fontSize:"0.85rem", color:"rgba(255,255,255,0.9)", lineHeight:1.5 }}>{q}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:"0.85rem", background:"rgba(34,197,94,0.08)", border:"1px solid rgba(74,222,128,0.25)", borderRadius:10, padding:"0.65rem 0.85rem", fontSize:"0.78rem", color:"rgba(255,255,255,0.65)" }}>
                💡 Be specific and speak from the heart. Your goals drive your growth — say them out loud with confidence!
              </div>
            </div>

          /* Weekly Reflection questions */
          ) : data?.today?.isWeeklyReflection ? (
            <div style={{ marginTop: "1rem" }}>
              <div className="daily-poster-section-label">📅 WEEKLY REFLECTION QUESTIONS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.75rem" }}>
                {["Did you attend your review this week? If yes, did you pass or fail? Why?","How many days did you submit your speaking video this week?","What was the best speaking moment you had this week?","What was the most difficult part of speaking this week?","What new word or phrase did you learn and use this week?","What is your focus for next week — in both review preparation and communication?"].map((q, i) => (
                  <div key={i} style={{ display:"flex", gap:"0.75rem", alignItems:"flex-start", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(56,189,248,0.2)", borderRadius:10, padding:"0.65rem 0.85rem" }}>
                    <div style={{ minWidth:24, height:24, borderRadius:"50%", background:"rgba(14,165,233,0.25)", border:"1px solid rgba(56,189,248,0.5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.72rem", fontWeight:800, color:"#38bdf8", flexShrink:0 }}>{i+1}</div>
                    <div style={{ fontSize:"0.85rem", color:"rgba(255,255,255,0.9)", lineHeight:1.5 }}>{q}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:"0.85rem", background:"rgba(14,165,233,0.08)", border:"1px solid rgba(56,189,248,0.25)", borderRadius:10, padding:"0.65rem 0.85rem", fontSize:"0.78rem", color:"rgba(255,255,255,0.65)" }}>
                💡 Be honest about your week. Reflection is how you grow — speak clearly and specifically!
              </div>
            </div>

          ) : (
            <>
              {data.today.topic && (
                <div className="daily-poster-topic-wrap">
                  <div className="daily-poster-section-label">TOPIC</div>
                  <div className="daily-poster-topic">"{data.today.topic}"</div>
                </div>
              )}
              <div className="daily-poster-question-wrap">
                <div className="daily-poster-section-label">❓ QUESTION</div>
                <div className="daily-poster-question">{data.today.question}</div>
              </div>
            </>
          )}

          {/* CTA Button */}
          <button
            className="daily-poster-cta"
            onClick={() => navigate('/record')}
            style={{
              cursor: 'pointer', border: 'none', width: '100%',
              transition: 'transform 0.2s, box-shadow 0.2s',
              ...(data?.today?.isMonthlyReflection ? { background:"linear-gradient(135deg,#7c3aed,#5b21b6)", boxShadow:"0 4px 20px rgba(139,92,246,0.4)" }
                : data?.today?.isMonthlyGoals ? { background:"linear-gradient(135deg,#16a34a,#15803d)", boxShadow:"0 4px 20px rgba(34,197,94,0.4)" }
                : data?.today?.isWeeklyReflection ? { background:"linear-gradient(135deg,#0ea5e9,#0284c7)", boxShadow:"0 4px 20px rgba(14,165,233,0.4)" }
                : {}),
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {data?.today?.isMonthlyReflection ? "🌟 Record Monthly Reflection Video"
             : data?.today?.isMonthlyGoals ? "🎯 Record Monthly Goals Video"
             : data?.today?.isWeeklyReflection ? "📅 Record Weekly Reflection Video"
             : "🎥 Upload Your Speaking Video Now!"}
          </button>
        </div>
      )}

      {!profile && (
        <div className="warn-box">
          <p>⚠️ Account not linked to WhatsApp yet</p>
          <p>Register with the same phone number you use in the WhatsApp group. Submit a video to see your data here.</p>
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

      {profile && data?.today?.question && (
        profile.completed
          ? <CelebrationCard
              name={profile?.name}
              streak={profile?.streak || 0}
              navigate={navigate}
            />
          : (data?.today?.isMonthlyReflection || data?.today?.isMonthlyGoals || data?.today?.isWeeklyReflection)
            ? <SubmitNudge
                name={profile?.name}
                streak={profile?.streak || 0}
                navigate={navigate}
                specialDay={
                  data?.today?.isWeeklyReflection ? "weekly"
                  : data?.today?.isMonthlyGoals ? "goals"
                  : "reflection"
                }
              />
            : <SubmitNudge
                name={profile?.name}
                streak={profile?.streak || 0}
                navigate={navigate}
              />
      )}

      <div className="stat-grid">
        <StatCard icon="🔥" label="Current Streak"    value={`${profile?.streak || 0} days`}        color="#f97316" />
        <StatCard icon="📹" label="Total Sessions"     value={scores.length}                          color="#7c6fff" />
        <StatCard icon="📅" label="This Week"          value={`${profile?.weeklySubmissions || 0}/7`} color="#4ade80" />
        <StatCard icon="📆" label="Monthly"            value={profile?.monthlySubmissions || 0}      color="#fbbf24" />
      </div>

      {/* Fine breakdown card */}
      <div className="card" style={{
        marginBottom: "1rem",
        background: (profile?.fine || 0) > 0
          ? "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(15,15,34,0) 100%)"
          : "var(--card)",
        border: (profile?.fine || 0) > 0
          ? "1px solid rgba(239,68,68,0.25)"
          : "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <div className="section-title" style={{ margin: 0 }}>💸 Fine Summary</div>
          {(profile?.fine || 0) === 0 && (
            <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.65rem", borderRadius: "99px", background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)" }}>
              ✅ No fines
            </span>
          )}
        </div>
        <div className="grid-cols-2">
          {/* Total fine — handles negative (streak credit) */}
          {(() => {
            const fine = profile?.fine ?? 0;
            const isCredit = fine < 0;
            const isZero = fine === 0;
            return (
              <div style={{
                background: isCredit ? "rgba(74,222,128,0.08)" : fine > 0 ? "rgba(239,68,68,0.1)" : "var(--bg2)",
                border: `1px solid ${isCredit ? "rgba(74,222,128,0.35)" : fine > 0 ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
                borderRadius: "12px", padding: "1rem", textAlign: "center",
              }}>
                <div style={{ fontSize: "1.5rem", marginBottom: "0.3rem" }}>{isCredit ? "🛡️" : "💸"}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>
                  {isCredit ? "Streak Credit" : "Total Fine"}
                </div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: isCredit ? "#4ade80" : fine > 0 ? "#f87171" : "#4ade80" }}>
                  {isCredit ? `+₹${Math.abs(fine)}` : `₹${fine}`}
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  {isCredit ? `${Math.floor(Math.abs(fine) / 2)} free day${Math.floor(Math.abs(fine) / 2) !== 1 ? "s" : ""} buffered` : fine > 0 ? "accumulated total" : "no fines 🎉"}
                </div>
              </div>
            );
          })()}
          {/* Weekly fine */}
          <div style={{
            background: (profile?.weeklyFine || 0) > 0 ? "rgba(251,191,36,0.08)" : "var(--bg2)",
            border: `1px solid ${(profile?.weeklyFine || 0) > 0 ? "rgba(251,191,36,0.3)" : "var(--border)"}`,
            borderRadius: "12px",
            padding: "1rem",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "1.5rem", marginBottom: "0.3rem" }}>📊</div>
            <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>This Week</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: (profile?.weeklyFine || 0) > 0 ? "#fbbf24" : "#4ade80" }}>
              ₹{profile?.weeklyFine || 0}
            </div>
            {(profile?.weeklyFine || 0) > 0 && (
              <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.25rem" }}>resets every Sunday</div>
            )}
          </div>
        </div>
        {(profile?.fine ?? 0) > 0 && (
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.75rem", textAlign: "center", lineHeight: 1.5 }}>
            💡 Submit your video every day to avoid fines. Fines are added at midnight for missed days.
          </p>
        )}
        {(profile?.fine ?? 0) < 0 && (
          <p style={{ fontSize: "0.75rem", color: "#4ade80", marginTop: "0.75rem", textAlign: "center", lineHeight: 1.5 }}>
            🛡️ Your 7-day streak reward gives you a fine buffer — missed days are absorbed before any fine is charged, and your streak is kept until the buffer runs out.
          </p>
        )}
      </div>

      <div className="stat-grid">
        <StatCard icon="👥" label="Group Members"      value={data?.stats?.total || 0}               color="#7c6fff" />
        <StatCard icon="✅" label="Submitted Today"    value={data?.stats?.completed || 0}           color="#4ade80" />
        <StatCard icon="⏳" label="Pending Today"      value={data?.stats?.pending || 0}             color="#f87171" />
        <StatCard icon="💰" label="All Members Fines"  value={`₹${data?.stats?.totalFines || 0}`}   color="#a78bfa" />
      </div>

      {/* ── Hall of Fame — always visible ── */}
      {data?.streakRecord && (
        <div style={{
          marginBottom: "1rem",
          background: "linear-gradient(135deg, #2a1f00 0%, #3d2e00 50%, #2a1f00 100%)",
          border: "1.5px solid rgba(251,191,36,0.55)",
          borderRadius: 14,
          padding: "0.75rem 1rem",
          display: "flex", alignItems: "center", gap: "0.75rem",
          boxShadow: "0 0 24px rgba(251,191,36,0.12)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position:"absolute", top:-30, right:-30, width:120, height:120, borderRadius:"50%", background:"radial-gradient(circle, rgba(251,191,36,0.18) 0%, transparent 70%)", pointerEvents:"none" }} />
          <span style={{ fontSize: "1.6rem", flexShrink: 0 }}>👑</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, color: "rgba(251,191,36,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.15rem" }}>
              All-Time Streak Record
            </div>
            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#fde68a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {data.streakRecord.name}
            </div>
            {data.streakRecord.achievedAt && (
              <div style={{ fontSize: "0.62rem", color: "rgba(251,191,36,0.5)", marginTop: "0.1rem" }}>
                Set on {new Date(data.streakRecord.achievedAt).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#fbbf24", lineHeight: 1 }}>
              {data.streakRecord.streak}
            </div>
            <div style={{ fontSize: "0.62rem", color: "rgba(251,191,36,0.6)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              day streak
            </div>
          </div>
        </div>
      )}

      {/* ── Top Streaks leaderboard — always visible ── */}
      {data?.topStreak?.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="section-title">🏆 Top Streaks</div>
          <div className="streak-list">
            {data.topStreak.map((u, i) => {
              const isMe = data?.myStreakEntry?.inTop5 && data.myStreakEntry.rank === i + 1;
              return (
                <div
                  className="streak-row"
                  key={i}
                  style={isMe ? {
                    background: "rgba(124,111,255,0.13)",
                    border: "1px solid rgba(124,111,255,0.35)",
                    borderRadius: 10,
                    padding: "0.45rem 0.6rem",
                    margin: "0 -0.1rem",
                  } : {}}
                >
                  <span className="streak-rank">{["🥇","🥈","🥉"][i] || `${i+1}.`}</span>
                  <span className="streak-name" style={isMe ? { color: "#a78bfa", fontWeight: 700 } : {}}>
                    {u.name || u.userId?.split("@")[0]}
                    {isMe && <span style={{ fontSize: "0.62rem", color: "#7c6fff", marginLeft: "0.3rem", opacity: 0.85 }}>(you)</span>}
                  </span>
                  <span className="streak-val">🔥 {u.streak} days</span>
                  <span className="streak-sub">{u.weeklySubmissions}/7</span>
                  <span style={{
                    marginLeft: "auto", fontSize: "0.75rem", fontWeight: 600,
                    padding: "0.2rem 0.6rem", borderRadius: 20,
                    background: u.completed ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.12)",
                    color: u.completed ? "#4ade80" : "#f87171",
                    whiteSpace: "nowrap",
                  }}>
                    {u.completed ? "✅ Done" : "⏳ Pending"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* My position row — only if NOT in top 5 */}
          {data?.myStreakEntry && !data.myStreakEntry.inTop5 && (
            <>
              <div style={{ borderTop: "1px dashed rgba(255,255,255,0.07)", margin: "0.5rem 0", position: "relative" }}>
                <span style={{
                  position: "absolute", top: "50%", left: "50%",
                  transform: "translate(-50%,-50%)",
                  background: "var(--card)", padding: "0 0.5rem",
                  fontSize: "0.6rem", color: "var(--muted)", whiteSpace: "nowrap",
                }}>· · ·</span>
              </div>
              <div className="streak-row" style={{
                background: "rgba(124,111,255,0.07)",
                border: "1px solid rgba(124,111,255,0.2)",
                borderRadius: 10,
                padding: "0.5rem 0.75rem",
              }}>
                <span className="streak-rank" style={{ color: "#a78bfa", minWidth: 28 }}>#{data.myStreakEntry.rank}</span>
                <span className="streak-name" style={{ color: "#a78bfa", fontWeight: 700 }}>
                  {data.myStreakEntry.name || "You"} <span style={{ fontSize: "0.65rem", opacity: 0.7 }}>(you)</span>
                </span>
                <span className="streak-val">🔥 {data.myStreakEntry.streak} days</span>
                <span className="streak-sub">{data.myStreakEntry.weeklySubmissions}/7</span>
                <span style={{
                  marginLeft: "auto", fontSize: "0.75rem", fontWeight: 600,
                  padding: "0.2rem 0.6rem", borderRadius: 20,
                  background: data.myStreakEntry.completed ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.12)",
                  color: data.myStreakEntry.completed ? "#4ade80" : "#f87171",
                  whiteSpace: "nowrap",
                }}>
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
              <StatCard key={k} icon={k==="fluency"?"🗣️":k==="grammar"?"📝":k==="confidence"?"💪":"📚"}
                label={`Avg ${k.charAt(0).toUpperCase()+k.slice(1)}`} value={avg(scores, k)} color={c} />
            ))}
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="section-title">Latest Session Radar</div>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#252545" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#8888aa", fontSize: 12 }} />
                  <Radar dataKey="score" stroke="#7c6fff" fill="#7c6fff" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="section-title">Latest Scores</div>
              {Object.entries(SCORES).map(([k, c]) => (
                <div className="score-bar" key={k}>
                  <div className="score-bar-header">
                    <span className="score-bar-label">{k.charAt(0).toUpperCase()+k.slice(1)}</span>
                    <span className="score-bar-value" style={{ color: scoreColor(latest?.[k] || 0) }}>{latest?.[k] || 0}/10</span>
                  </div>
                  <div className="score-bar-track">
                    <div className="score-bar-fill" style={{ width: `${(latest?.[k] || 0) * 10}%`, background: c }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">Score History ({scores.length} sessions)</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252545" />
                <XAxis dataKey="session" stroke="#8888aa" fontSize={11} />
                <YAxis domain={[0, 10]} stroke="#8888aa" fontSize={11} />
                <Tooltip contentStyle={tt} />
                <Legend />
                {Object.entries(SCORES).map(([k, c]) => (
                  <Line key={k} type="monotone" dataKey={k.charAt(0).toUpperCase()+k.slice(1)} stroke={c} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <div className="section-title">Session History</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Date</th><th>Fluency</th><th>Grammar</th><th>Confidence</th><th>Vocabulary</th></tr></thead>
                <tbody>
                  {pagedScores.map((s, i) => {
                    const globalIdx = scores.length - ((sessionPage - 1) * SESSION_PAGE_SIZE + i);
                    return (
                      <tr key={i}>
                        <td style={{ color: "var(--muted)" }}>{globalIdx}</td>
                        <td style={{ color: "var(--muted)" }}>{s.date ? new Date(s.date).toLocaleDateString("en-IN") : "—"}</td>
                        {["fluency","grammar","confidence","vocabulary"].map(k => (
                          <td key={k} style={{ fontWeight: 600, color: scoreColor(s[k] || 0) }}>{s[k] ?? "—"}/10</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
                <button
                  className="btn-ghost"
                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.82rem" }}
                  onClick={() => setSessionPage(p => Math.max(1, p - 1))}
                  disabled={sessionPage === 1}
                >← Prev</button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    className={sessionPage === p ? "btn-primary" : "btn-ghost"}
                    style={{ padding: "0.3rem 0.65rem", fontSize: "0.82rem", minWidth: 34 }}
                    onClick={() => setSessionPage(p)}
                  >{p}</button>
                ))}

                <button
                  className="btn-ghost"
                  style={{ padding: "0.3rem 0.75rem", fontSize: "0.82rem" }}
                  onClick={() => setSessionPage(p => Math.min(totalPages, p + 1))}
                  disabled={sessionPage === totalPages}
                >Next →</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card empty-state">
          <div className="empty-icon">📹</div>
          <p>No feedback scores yet. Submit a video via WhatsApp to get started!</p>
        </div>
      )}

      {/* Live Sessions */}
      {liveSessions.length > 0 && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <div className="section-title">🎥 Live Sessions</div>
          <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
            {liveSessions.map(s => {
              const isLive = s.status === "live";
              const alreadyIn = isLive && s.participants?.includes(data?.profile?.linkedPhone);
              return (
                <div key={s._id} style={{
                  background: isLive ? "rgba(74,222,128,0.05)" : "var(--bg-secondary)",
                  border: `1px solid ${isLive ? "rgba(74,222,128,0.4)" : "rgba(96,165,250,0.25)"}`,
                  borderRadius: 12,
                  padding: "1rem 1.25rem",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  {isLive && (
                    <div style={{
                      position: "absolute",
                      top: 0, left: 0, right: 0, height: 3,
                      background: "linear-gradient(90deg, #4ade80, #22c55e)",
                    }} />
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{s.title}</span>
                        <span style={{
                          fontSize: "0.65rem", fontWeight: 700,
                          padding: "0.15rem 0.5rem", borderRadius: 20, textTransform: "uppercase",
                          background: isLive ? "rgba(74,222,128,0.15)" : "rgba(96,165,250,0.15)",
                          color: isLive ? "#4ade80" : "#60a5fa",
                        }}>
                          {isLive ? "🔴 Live Now" : "Scheduled"}
                        </span>
                        {/* "You're inside" badge */}
                        {alreadyIn && (
                          <span style={{
                            fontSize: "0.65rem", fontWeight: 700,
                            padding: "0.15rem 0.5rem", borderRadius: 20,
                            background: "rgba(124,111,255,0.15)",
                            color: "#a78bfa",
                          }}>
                            ✅ You're in
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.4rem" }}>
                          {s.description}
                        </div>
                      )}
                      <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                        📅 {new Date(s.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        {s.participantCount > 0 && ` · 👥 ${s.participantCount}/${s.maxParticipants || 20}`}
                        {s.participantCount >= (s.maxParticipants || 20) && " 🔴 Full"}
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
                          border: alreadyIn ? "1px solid rgba(124,111,255,0.35)" : "none",
                          borderRadius: 10,
                          padding: "0.5rem 1rem",
                          fontWeight: 700, fontSize: "0.82rem",
                          cursor: "pointer", whiteSpace: "nowrap",
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

    </Layout>
  );
}
