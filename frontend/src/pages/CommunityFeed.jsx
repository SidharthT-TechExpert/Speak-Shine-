import { useState, useEffect } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/client.js";

const scoreColor = v => v >= 7 ? "var(--success)" : v >= 5 ? "var(--warning)" : "var(--danger)";
const scoreBg    = v => v >= 7 ? "rgba(74,222,128,0.1)" : v >= 5 ? "rgba(251,191,36,0.1)" : "rgba(248,113,113,0.1)";
const fmtDur = s => s ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}` : "—";
const fmtTime = d => new Date(d).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

const SCORE_LABELS = [
  { key: "fluency",    label: "Fluency",    icon: "🗣️" },
  { key: "grammar",    label: "Grammar",    icon: "📝" },
  { key: "confidence", label: "Confidence", icon: "💪" },
  { key: "vocabulary", label: "Vocabulary", icon: "📚" },
];

function ScoreBar({ label, icon, value }) {
  if (value == null) return null;
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", fontSize: "0.78rem" }}>
        <span style={{ color: "var(--muted)" }}>{icon} {label}</span>
        <span style={{ fontWeight: 700, color: scoreColor(value) }}>{value}/10</span>
      </div>
      <div style={{ height: "6px", borderRadius: "99px", background: "var(--border2)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${value * 10}%`,
          background: scoreColor(value),
          borderRadius: "99px",
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

function FeedbackPanel({ analysis }) {
  if (!analysis) return null;
  return (
    <div style={{
      marginTop: "1rem",
      padding: "1rem",
      borderRadius: "10px",
      background: "var(--card2)",
      border: "1px solid var(--border2)",
    }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>
        📊 Feedback
      </div>

      {/* Score bars */}
      {SCORE_LABELS.map(({ key, label, icon }) => (
        <ScoreBar key={key} label={label} icon={icon} value={analysis[key]} />
      ))}

      {/* Overall score */}
      {analysis.overallScore != null && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: "0.75rem", paddingTop: "0.75rem",
          borderTop: "1px solid var(--border2)",
        }}>
          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>⭐ Overall Score</span>
          <span style={{
            fontWeight: 800, fontSize: "1rem",
            color: scoreColor(analysis.overallScore),
            background: scoreBg(analysis.overallScore),
            padding: "0.2rem 0.6rem", borderRadius: "8px",
          }}>{analysis.overallScore}/10</span>
        </div>
      )}

      {/* Strengths */}
      {analysis.strengths?.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--success)", marginBottom: "0.3rem" }}>✅ Strengths</div>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {analysis.strengths.map((s, i) => (
              <li key={i} style={{ fontSize: "0.78rem", color: "var(--text2)", marginBottom: "0.2rem" }}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvements */}
      {analysis.improvements?.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--warning)", marginBottom: "0.3rem" }}>💡 Improvements</div>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {analysis.improvements.map((s, i) => (
              <li key={i} style={{ fontSize: "0.78rem", color: "var(--text2)", marginBottom: "0.2rem" }}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Full comment */}
      {analysis.overallComment && (
        <p style={{
          marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--text2)",
          lineHeight: 1.6, fontStyle: "italic",
          paddingTop: "0.75rem", borderTop: "1px solid var(--border2)",
        }}>
          "{analysis.overallComment}"
        </p>
      )}
    </div>
  );
}

export default function CommunityFeed() {
  const [feed, setFeed]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [playing, setPlaying]   = useState(null);
  const [expanded, setExpanded] = useState({}); // reportId → bool for feedback panel

  useEffect(() => {
    api.get("/video/community-feed")
      .then(r => setFeed(r.data.feed || []))
      .catch(() => setError("Failed to load community feed"))
      .finally(() => setLoading(false));
  }, []);

  const toggleFeedback = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  if (loading) return (
    <Layout title="Community Feed">
      <div className="spinner-wrap"><div className="spinner" /><p style={{ color: "var(--muted)" }}>Loading…</p></div>
    </Layout>
  );

  return (
    <Layout title="Community Feed">
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>

        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.4rem" }}>
            👥 Today's Submissions
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            Watch how other members answered today's question. Videos auto-delete after 24 hours.
          </p>
        </div>

        {error && <div className="error-box"><p>{error}</p></div>}

        {!error && feed.length === 0 && (
          <div className="card empty-state">
            <div className="empty-icon">🎥</div>
            <p>No public submissions yet today.</p>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.5rem" }}>
              Be the first — submit your video and enable "Share with group"
            </p>
          </div>
        )}

        <div style={{ display: "grid", gap: "1rem" }}>
          {feed.map((item) => (
            <div key={item._id} className="card" style={{ padding: "1.25rem" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div className="avatar" style={{ width: "38px", height: "38px", fontSize: "0.9rem" }}>
                    {(item.uploaderName || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)" }}>
                      {item.uploaderName || "Anonymous"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                      {fmtTime(item.submittedAt)} · {fmtDur(item.videoDuration)}
                    </div>
                  </div>
                </div>

                {/* Score badges */}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {SCORE_LABELS.map(({ key, label }) => item.analysis?.[key] != null && (
                    <span key={key} style={{
                      fontSize: "0.68rem", fontWeight: 700,
                      padding: "0.2rem 0.5rem", borderRadius: "99px",
                      background: "var(--card2)", border: "1px solid var(--border2)",
                      color: scoreColor(item.analysis[key]),
                    }}>{label[0]} {item.analysis[key]}/10</span>
                  ))}
                </div>
              </div>

              {/* Short comment preview */}
              {item.analysis?.overallComment && !expanded[item._id] && (
                <p style={{ fontSize: "0.82rem", color: "var(--text2)", marginBottom: "1rem", lineHeight: 1.6, fontStyle: "italic" }}>
                  "{item.analysis.overallComment.slice(0, 180)}{item.analysis.overallComment.length > 180 ? "…" : ""}"
                </p>
              )}

              {/* Video player */}
              {playing === item._id ? (
                <div>
                  <video
                    src={item.videoUrl}
                    controls
                    autoPlay
                    playsInline
                    style={{ width: "100%", borderRadius: "10px", background: "#000", maxHeight: "400px" }}
                  />
                  <button
                    onClick={() => setPlaying(null)}
                    style={{ marginTop: "0.5rem", fontSize: "0.78rem", color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    ✕ Close video
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPlaying(item._id)}
                  style={{
                    width: "100%", padding: "0.75rem", borderRadius: "10px",
                    background: "rgba(124,111,255,0.1)", border: "1px solid rgba(124,111,255,0.25)",
                    color: "var(--primary)", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer",
                    transition: "all 0.18s",
                  }}
                  onMouseOver={e => e.currentTarget.style.background = "rgba(124,111,255,0.18)"}
                  onMouseOut={e => e.currentTarget.style.background = "rgba(124,111,255,0.1)"}
                >
                  ▶ Watch Video
                </button>
              )}

              {/* Feedback toggle */}
              {item.analysis && (
                <>
                  <button
                    onClick={() => toggleFeedback(item._id)}
                    style={{
                      marginTop: "0.6rem", width: "100%", padding: "0.5rem",
                      borderRadius: "8px", background: "transparent",
                      border: "1px solid var(--border2)",
                      color: "var(--muted)", fontSize: "0.78rem",
                      cursor: "pointer", transition: "all 0.18s",
                    }}
                    onMouseOver={e => e.currentTarget.style.borderColor = "var(--primary)"}
                    onMouseOut={e => e.currentTarget.style.borderColor = "var(--border2)"}
                  >
                    {expanded[item._id] ? "▲ Hide Feedback" : "▼ View Feedback"}
                  </button>

                  {expanded[item._id] && <FeedbackPanel analysis={item.analysis} />}
                </>
              )}

            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
