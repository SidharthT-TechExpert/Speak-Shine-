import { useState, useEffect } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/client.js";

const scoreColor = v => v >= 7 ? "var(--success)" : v >= 5 ? "var(--warning)" : "var(--danger)";
const fmtDur = s => s ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}` : "—";
const fmtTime = d => new Date(d).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

export default function CommunityFeed() {
  const [feed, setFeed]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [playing, setPlaying] = useState(null); // reportId of expanded player

  useEffect(() => {
    api.get("/video/community-feed")
      .then(r => setFeed(r.data.feed || []))
      .catch(() => setError("Failed to load community feed"))
      .finally(() => setLoading(false));
  }, []);

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
                  {[
                    { label: "F", v: item.analysis?.fluency },
                    { label: "G", v: item.analysis?.grammar },
                    { label: "C", v: item.analysis?.confidence },
                    { label: "V", v: item.analysis?.vocabulary },
                  ].map(({ label, v }) => v != null && (
                    <span key={label} style={{
                      fontSize: "0.68rem", fontWeight: 700,
                      padding: "0.2rem 0.5rem", borderRadius: "99px",
                      background: "var(--card2)", border: "1px solid var(--border2)",
                      color: scoreColor(v),
                    }}>{label} {v}/10</span>
                  ))}
                </div>
              </div>

              {/* Overall comment */}
              {item.analysis?.overallComment && (
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
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
