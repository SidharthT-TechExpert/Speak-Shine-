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
      {data?.today?.question && (
        <div className="today-card">
          <div className="today-label">📌 Today's Question</div>
          <div className="today-q">{data.today.question}</div>
          {data.today.topic && <span className="today-topic">{data.today.topic}</span>}
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
