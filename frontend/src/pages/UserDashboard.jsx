import { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from "recharts";

const SCORE_COLORS = { Fluency: "#7c6fff", Grammar: "#4ade80", Confidence: "#fbbf24", Vocabulary: "#ff6b9d" };

const ScoreBar = ({ label, value, color }) => (
  <div className="mb-4">
    <div className="flex justify-between mb-1.5">
      <span className="text-sm text-[#8888aa]">{label}</span>
      <span className="text-sm font-bold" style={{ color: value >= 7 ? "#4ade80" : value >= 5 ? "#fbbf24" : "#f87171" }}>
        {value}/10
      </span>
    </div>
    <div className="h-2 bg-[#111122] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value * 10}%`, background: color }} />
    </div>
  </div>
);

const Card = ({ children, className = "" }) => (
  <div className={`bg-[#16162a] border border-[#252545] rounded-2xl p-5 ${className}`}>{children}</div>
);

const SectionTitle = ({ children }) => (
  <h3 className="text-base font-semibold text-[#e8e8f4] mb-4">{children}</h3>
);

const tooltipStyle = { background: "#16162a", border: "1px solid #252545", borderRadius: 10, fontSize: 12 };

export default function UserDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/dashboard/me")
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || "Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <Layout title="My Dashboard">
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-10 h-10 border-2 border-[#252545] border-t-[#7c6fff] rounded-full animate-spin" />
        <p className="text-[#8888aa] text-sm">Loading your data…</p>
      </div>
    </Layout>
  );

  if (error) return (
    <Layout title="My Dashboard">
      <div className="bg-[#f87171]/10 border border-[#f87171]/30 rounded-2xl p-6 text-center">
        <p className="text-[#f87171] mb-3">⚠️ {error}</p>
        <button onClick={() => window.location.reload()} className="bg-[#7c6fff] text-white px-4 py-2 rounded-xl text-sm font-medium">Retry</button>
      </div>
    </Layout>
  );

  const profile = data?.profile;
  const scores = profile?.feedbackScores || [];
  const latest = scores.slice(-1)[0];

  const chartData = scores.map((s, i) => ({ session: `#${i+1}`, ...s }));
  const radarData = latest ? Object.entries(SCORE_COLORS).map(([k]) => ({ subject: k, score: latest[k.toLowerCase()] || 0 })) : [];
  const avg = k => { const v = scores.filter(s => s[k] != null).map(s => s[k]); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(1) : "—"; };

  return (
    <Layout title="My Dashboard">
      {/* Today's question */}
      {data?.today?.question && (
        <div className="mb-6 rounded-2xl p-5 border border-[#7c6fff]/30"
          style={{ background: "linear-gradient(135deg, rgba(124,111,255,0.1), rgba(255,107,157,0.05))" }}>
          <p className="text-xs text-[#8888aa] mb-2 font-medium">📌 TODAY'S QUESTION</p>
          <p className="text-[#e8e8f4] font-semibold text-base">{data.today.question}</p>
          {data.today.topic && (
            <span className="inline-block mt-2 text-xs bg-[#7c6fff]/20 text-[#7c6fff] px-3 py-1 rounded-full">{data.today.topic}</span>
          )}
        </div>
      )}

      {/* Not linked warning */}
      {!profile && (
        <div className="mb-6 bg-[#fbbf24]/8 border border-[#fbbf24]/25 rounded-2xl p-4">
          <p className="text-[#fbbf24] font-medium text-sm">⚠️ Account not linked to WhatsApp yet</p>
          <p className="text-[#8888aa] text-xs mt-1">Register with the same phone number you use in the WhatsApp group. Submit a video to see your data here.</p>
        </div>
      )}

      {/* Submission status */}
      {profile && (
        <div className={`mb-6 rounded-2xl px-5 py-3 text-sm font-medium text-center border ${
          profile.completed
            ? "bg-[#4ade80]/8 border-[#4ade80]/25 text-[#4ade80]"
            : "bg-[#fbbf24]/8 border-[#fbbf24]/20 text-[#fbbf24]"
        }`}>
          {profile.completed ? "✅ You've submitted today — great work!" : "⏳ Haven't submitted today yet. Send your video on WhatsApp!"}
        </div>
      )}

      {/* Personal stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon="🔥" label="Current Streak"    value={`${profile?.streak || 0} days`}        color="#f97316" />
        <StatCard icon="💸" label="Total Fine"         value={`₹${profile?.fine || 0}`}              color="#f87171" />
        <StatCard icon="📹" label="Total Sessions"     value={scores.length}                          color="#7c6fff" />
        <StatCard icon="📅" label="This Week"          value={`${profile?.weeklySubmissions || 0}/7`} color="#4ade80" />
      </div>

      {/* Group stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon="👥" label="Group Members"      value={data?.stats?.total || 0}               color="#7c6fff" />
        <StatCard icon="✅" label="Submitted Today"    value={data?.stats?.completed || 0}           color="#4ade80" />
        <StatCard icon="⏳" label="Pending Today"      value={data?.stats?.pending || 0}             color="#f87171" />
        <StatCard icon="📆" label="Monthly"            value={profile?.monthlySubmissions || 0}      color="#fbbf24" />
      </div>

      {scores.length > 0 ? (
        <>
          {/* Avg scores */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon="🗣️" label="Avg Fluency"    value={avg("fluency")}    color="#7c6fff" />
            <StatCard icon="📝" label="Avg Grammar"    value={avg("grammar")}    color="#4ade80" />
            <StatCard icon="💪" label="Avg Confidence" value={avg("confidence")} color="#fbbf24" />
            <StatCard icon="📚" label="Avg Vocabulary" value={avg("vocabulary")} color="#ff6b9d" />
          </div>

          {/* Radar + bars */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card>
              <SectionTitle>Latest Session Radar</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#252545" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#8888aa", fontSize: 12 }} />
                  <Radar dataKey="score" stroke="#7c6fff" fill="#7c6fff" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <SectionTitle>Latest Scores</SectionTitle>
              {Object.entries(SCORE_COLORS).map(([k, c]) => (
                <ScoreBar key={k} label={k} value={latest?.[k.toLowerCase()] || 0} color={c} />
              ))}
            </Card>
          </div>

          {/* Line chart */}
          <Card className="mb-6">
            <SectionTitle>Score History ({scores.length} sessions)</SectionTitle>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252545" />
                <XAxis dataKey="session" stroke="#8888aa" fontSize={11} />
                <YAxis domain={[0,10]} stroke="#8888aa" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                {Object.entries(SCORE_COLORS).map(([k, c]) => (
                  <Line key={k} type="monotone" dataKey={k.toLowerCase()} name={k} stroke={c} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Session table */}
          <Card>
            <SectionTitle>Session History</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#252545]">
                    {["#","Date","Fluency","Grammar","Confidence","Vocabulary"].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs text-[#8888aa] font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...scores].reverse().map((s, i) => (
                    <tr key={i} className="border-b border-[#252545]/50 hover:bg-[#7c6fff]/5 transition-colors">
                      <td className="py-2.5 px-3 text-[#8888aa]">{scores.length - i}</td>
                      <td className="py-2.5 px-3 text-[#8888aa] text-xs">{s.date ? new Date(s.date).toLocaleDateString("en-IN") : "—"}</td>
                      {["fluency","grammar","confidence","vocabulary"].map(k => (
                        <td key={k} className="py-2.5 px-3 font-semibold" style={{ color: (s[k]||0)>=7?"#4ade80":(s[k]||0)>=5?"#fbbf24":"#f87171" }}>
                          {s[k]??"-"}/10
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <Card className="text-center py-12">
          <p className="text-4xl mb-3">📹</p>
          <p className="text-[#8888aa]">No feedback scores yet. Submit a video via WhatsApp to get started!</p>
        </Card>
      )}

      {/* Top streaks */}
      {data?.topStreak?.length > 0 && (
        <Card className="mt-6">
          <SectionTitle>🏆 Top Streaks</SectionTitle>
          <div className="space-y-2">
            {data.topStreak.map((u, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#111122] rounded-xl px-4 py-3">
                <span className="text-lg w-7">{["🥇","🥈","🥉"][i] || `${i+1}.`}</span>
                <span className="flex-1 text-sm text-[#e8e8f4] font-medium">{u.name || u.userId?.split("@")[0]}</span>
                <span className="text-sm text-[#fbbf24] font-semibold">🔥 {u.streak} days</span>
                <span className="text-xs text-[#8888aa]">{u.weeklySubmissions}/7</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Layout>
  );
}
