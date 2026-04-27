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

function getGreeting() {
  const h = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
const tt = { background: "#16162a", border: "1px solid #252545", borderRadius: 10, fontSize: 12 };
const avg = (arr, k) => { const v = arr.filter(s => s[k] != null).map(s => s[k]); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(1) : "—"; };
const scoreColor = v => v >= 7 ? "var(--success)" : v >= 5 ? "var(--warning)" : "var(--danger)";

export default function UserDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/dashboard/me")
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || "Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout title="My Dashboard"><div className="spinner-wrap"><div className="spinner"/><p style={{color:"var(--muted)"}}>Loading…</p></div></Layout>;
  if (error) return <Layout title="My Dashboard"><div className="error-box"><p>{error}</p><button className="btn-primary" style={{marginTop:"1rem"}} onClick={()=>window.location.reload()}>Retry</button></div></Layout>;

  const profile = data?.profile;
  const scores = profile?.feedbackScores || [];
  const latest = scores.slice(-1)[0];
  const chartData = scores.map((s, i) => ({ session: `#${i+1}`, Fluency: s.fluency, Grammar: s.grammar, Confidence: s.confidence, Vocabulary: s.vocabulary }));
  const radarData = latest ? Object.keys(SCORES).map(k => ({ subject: k.charAt(0).toUpperCase()+k.slice(1), score: latest[k] || 0 })) : [];

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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem", marginTop: "0.75rem" }}>
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
              <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
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
              <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
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
              <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem", maxWidth: "300px", margin: "1.5rem auto 0" }}>
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

      {/* Show Question (8 AM onwards) */}
      {!data?.showReport && data?.today?.question && (
        <div className="daily-poster">
          {/* Header */}
          <div className="daily-poster-header">
            <div className="daily-poster-brand">✦ Speak &amp; Shine</div>
            <div className="daily-poster-sub">DAILY SPEAKING CHALLENGE</div>
            {data.today.category && (
              <div className="daily-poster-badge">{data.today.category}</div>
            )}
          </div>

          {/* Topic */}
          {data.today.topic && (
            <div className="daily-poster-topic-wrap">
              <div className="daily-poster-section-label">TOPIC</div>
              <div className="daily-poster-topic">"{data.today.topic}"</div>
            </div>
          )}

          {/* Question */}
          <div className="daily-poster-question-wrap">
            <div className="daily-poster-section-label">❓ QUESTION</div>
            <div className="daily-poster-question">{data.today.question}</div>
          </div>

          {/* CTA Button */}
          <button 
            className="daily-poster-cta" 
            onClick={() => navigate('/video-analysis')}
            style={{ 
              cursor: 'pointer',
              border: 'none',
              width: '100%',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(124, 111, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            🎥 Upload Your Speaking Video Now!
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
        <div className={`status-banner ${profile.completed ? "done" : "pending"}`}>
          {profile.completed ? "✅ You've submitted today — great work!" : "⏳ Haven't submitted today yet. Send your video on WhatsApp or upload here!"}
        </div>
      )}

      <div className="stat-grid">
        <StatCard icon="🔥" label="Current Streak"    value={`${profile?.streak || 0} days`}        color="#f97316" />
        <StatCard icon="💸" label="Total Fine"         value={`₹${profile?.fine || 0}`}              color="#f87171" />
        <StatCard icon="📹" label="Total Sessions"     value={scores.length}                          color="#7c6fff" />
        <StatCard icon="📅" label="This Week"          value={`${profile?.weeklySubmissions || 0}/7`} color="#4ade80" />
      </div>

      <div className="stat-grid">
        <StatCard icon="👥" label="Group Members"      value={data?.stats?.total || 0}               color="#7c6fff" />
        <StatCard icon="✅" label="Submitted Today"    value={data?.stats?.completed || 0}           color="#4ade80" />
        <StatCard icon="⏳" label="Pending Today"      value={data?.stats?.pending || 0}             color="#f87171" />
        <StatCard icon="📆" label="Monthly"            value={profile?.monthlySubmissions || 0}      color="#fbbf24" />
      </div>

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
                  {[...scores].reverse().map((s, i) => (
                    <tr key={i}>
                      <td style={{ color: "var(--muted)" }}>{scores.length - i}</td>
                      <td style={{ color: "var(--muted)" }}>{s.date ? new Date(s.date).toLocaleDateString("en-IN") : "—"}</td>
                      {["fluency","grammar","confidence","vocabulary"].map(k => (
                        <td key={k} style={{ fontWeight: 600, color: scoreColor(s[k] || 0) }}>{s[k] ?? "—"}/10</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card empty-state">
          <div className="empty-icon">📹</div>
          <p>No feedback scores yet. Submit a video via WhatsApp to get started!</p>
        </div>
      )}

      {data?.topStreak?.length > 0 && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <div className="section-title">🏆 Top Streaks</div>
          <div className="streak-list">
            {data.topStreak.map((u, i) => (
              <div className="streak-row" key={i}>
                <span className="streak-rank">{["🥇","🥈","🥉"][i] || `${i+1}.`}</span>
                <span className="streak-name">{u.name || u.userId?.split("@")[0]}</span>
                <span className="streak-val">🔥 {u.streak} days</span>
                <span className="streak-sub">{u.weeklySubmissions}/7</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
