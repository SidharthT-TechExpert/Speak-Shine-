import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import api from "../api/client.js";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";

const SCORES = { fluency: "#7c6fff", grammar: "#4ade80", confidence: "#fbbf24", vocabulary: "#ff6b9d" };
const tt = { background: "#16162a", border: "1px solid #252545", borderRadius: 10, fontSize: 12 };
const avg = (arr, k) => { const v = arr.filter(s => s[k] != null).map(s => s[k]); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(1) : "—"; };
const scoreColor = v => v >= 7 ? "var(--success)" : v >= 5 ? "var(--warning)" : "var(--danger)";

export default function UserDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

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
            </>
          ) : (
            <div style={{ marginTop: "1.5rem", textAlign: "center", padding: "2rem" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>😔</div>
              <div style={{ fontSize: "1.1rem", fontWeight: "bold", marginBottom: "0.5rem" }}>You missed yesterday's challenge</div>
              <div style={{ fontSize: "0.9rem", color: "#8888aa" }}>Don't worry! Today is a new opportunity to shine.</div>
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

          {/* CTA */}
          <div className="daily-poster-cta">
            🎥 Upload your 1-min speaking video below!
          </div>
        </div>
      )}

      {!profile && (
        <div className="warn-box">
          <p>⚠️ Account not linked to WhatsApp yet</p>
          <p>Register with the same phone number you use in the WhatsApp group. Submit a video to see your data here.</p>
        </div>
      )}

      {profile && (
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
