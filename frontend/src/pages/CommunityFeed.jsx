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

// ── Reusable score bar (progress style) ─────────────────────────────────────
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
          background: scoreColor(value), borderRadius: "99px", transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

// ── Block score bar (same style as VideoAnalysis page) ───────────────────────
function BlockScoreBar({ score }) {
  const filled = Math.round(score || 0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "2px" }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{
            width: "16px", height: "16px", borderRadius: "3px",
            background: i < filled ? scoreColor(score) : "var(--bg)",
            border: "1px solid var(--border)",
          }} />
        ))}
      </div>
      <span style={{ fontWeight: 700, minWidth: "36px", fontSize: "0.85rem" }}>{score}/10</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "1.1rem" }}>
      <div style={{ borderTop: "1px solid var(--border)", margin: "0.9rem 0 0.65rem" }} />
      <div style={{ fontWeight: 700, marginBottom: "0.65rem", color: "var(--text)", fontSize: "0.88rem" }}>{title}</div>
      {children}
    </div>
  );
}

// ── Full detailed report (mirrors VideoAnalysis ReportView) ──────────────────
function DetailedReport({ a }) {
  if (!a) return null;
  const s = a.stats || {};
  return (
    <div style={{ fontSize: "0.85rem" }}>
      {/* Stats bar */}
      <div style={{
        background: "var(--bg)", borderRadius: "8px", padding: "0.65rem 0.9rem",
        marginBottom: "0.9rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.82rem",
      }}>
        {s.duration   && <span>⏱️ <strong>{s.duration}</strong></span>}
        {s.wpm        && <span>📊 <strong>{s.wpm} wpm</strong> {s.wpm < 100 ? "🐢 Slow" : s.wpm <= 150 ? "✅ Good" : "⚡ Fast"}</span>}
        {s.fillerTotal > 0 && <span>🗣️ Fillers: <strong>{Object.entries(s.fillerWords || {}).map(([w,c]) => `"${w}" ×${c}`).join(", ")}</strong></span>}
        {s.pauses > 0 && <span>🔇 Pauses: <strong>{s.pauses}</strong></span>}
        {s.rhythm?.speechRatio != null && <span>🎵 Speech: <strong>{s.rhythm.speechRatio}%</strong> {s.rhythm.speechRatio >= 75 ? "✅" : s.rhythm.speechRatio >= 55 ? "⚠️" : "❌"}</span>}
      </div>

      {a.qualityWarning && <p style={{ color: "var(--warning)", marginBottom: "0.5rem" }}>🔈 {a.qualityWarning}</p>}

      {/* Speech scores */}
      <Section title="🗣️ Speech Scores">
        {[{ icon: "🗣️", label: "Fluency", v: a.fluency }, { icon: "📚", label: "Grammar", v: a.grammar },
          { icon: "🔥", label: "Confidence", v: a.confidence }, { icon: "🧠", label: "Vocabulary", v: a.vocabulary }]
          .map(({ icon, label, v }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <span style={{ width: "100px", color: "var(--muted)", fontSize: "0.8rem" }}>{icon} {label}</span>
              <BlockScoreBar score={v} />
            </div>
          ))}
        {s.cefrLevel && (
          <p style={{ marginTop: "0.4rem", color: "var(--muted)", fontSize: "0.8rem" }}>
            🎓 Level: <strong>{s.cefrLevel.level}</strong> — <em>{s.cefrLevel.description}</em>
          </p>
        )}
        {a.topicRelevance != null && (
          <div style={{ marginTop: "0.4rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.3rem" }}>
              <span style={{ width: "100px", color: "var(--muted)", fontSize: "0.8rem" }}>🎯 On-topic</span>
              <BlockScoreBar score={a.topicRelevance} />
            </div>
            {a.topicFeedback && <p style={{ color: "var(--muted)", fontSize: "0.8rem", fontStyle: "italic" }}>💬 {a.topicFeedback}</p>}
          </div>
        )}
      </Section>

      {/* Visual presence */}
      {a.eyeContact != null && (
        <Section title="📹 Visual Presence">
          {[{ icon: "👁️", label: "Eye Contact", v: a.eyeContact }, { icon: "🧍", label: "Body Language", v: a.bodyLanguage },
            { icon: "😊", label: "Expression", v: a.facialExpression }, { icon: "✨", label: "Presence", v: a.overallPresence }]
            .map(({ icon, label, v }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <span style={{ width: "110px", color: "var(--muted)", fontSize: "0.8rem" }}>{icon} {label}</span>
                <BlockScoreBar score={v} />
              </div>
            ))}
        </Section>
      )}

      {/* Pronunciation & Rhythm */}
      {(a.pronunciationNote || a.rhythmNote) && (
        <Section title="🎵 Pronunciation & Rhythm">
          {a.pronunciationNote && <p style={{ marginBottom: "0.3rem" }}>🗣️ {a.pronunciationNote}</p>}
          {a.rhythmNote        && <p>🎵 {a.rhythmNote}</p>}
        </Section>
      )}

      {/* Grammar errors */}
      {a.grammarErrors?.length > 0 && (
        <Section title="❌ Grammar Issues">
          {a.grammarErrors.map((e, i) => (
            <div key={i} style={{ marginBottom: "0.5rem", paddingLeft: "0.5rem", borderLeft: "3px solid var(--danger)" }}>
              <span style={{ color: "var(--muted)", fontStyle: "italic" }}>"{e.original}"</span>{" → "}
              <strong style={{ color: "var(--success)" }}>"{e.correction}"</strong>
              {e.rule && <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}> ({e.rule})</span>}
            </div>
          ))}
        </Section>
      )}

      {/* Strong points */}
      {a.strongPoints?.length > 0 && (
        <Section title="✅ What They Did Well">
          <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
            {a.strongPoints.map((p, i) => <li key={i} style={{ marginBottom: "0.25rem" }}>{p}</li>)}
          </ul>
        </Section>
      )}

      {/* Visual observations */}
      {(a.eyeContactNote || a.bodyLanguageNote || a.expressionNote || a.visualStrengths?.length > 0) && (
        <Section title="📹 Visual Observations">
          {a.eyeContactNote   && <p style={{ marginBottom: "0.3rem" }}>👁️ {a.eyeContactNote}</p>}
          {a.bodyLanguageNote && <p style={{ marginBottom: "0.3rem" }}>🧍 {a.bodyLanguageNote}</p>}
          {a.expressionNote   && <p style={{ marginBottom: "0.3rem" }}>😊 {a.expressionNote}</p>}
          {a.visualStrengths?.map((s, i) => <p key={i} style={{ marginBottom: "0.25rem" }}>✅ {s}</p>)}
        </Section>
      )}

      {/* Vocabulary */}
      {(a.vocabularyHighlights?.strong?.length > 0 || a.vocabularyHighlights?.weak?.length > 0) && (
        <Section title="📖 Vocabulary">
          {a.vocabularyHighlights.strong?.length > 0 && <p style={{ marginBottom: "0.3rem" }}>💎 Good words: <strong>{a.vocabularyHighlights.strong.join(", ")}</strong></p>}
          {a.vocabularyHighlights.weak?.length > 0   && <p>📖 Upgrade: <strong>{a.vocabularyHighlights.weak.join(", ")}</strong></p>}
        </Section>
      )}

      {/* Speaking tips */}
      {a.suggestions?.length > 0 && (
        <Section title="💡 Speaking Tips">
          <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
            {a.suggestions.map((t, i) => <li key={i} style={{ marginBottom: "0.25rem" }}>{t}</li>)}
          </ul>
        </Section>
      )}

      {/* Presentation tips */}
      {a.visualSuggestions?.length > 0 && (
        <Section title="🎬 Presentation Tips">
          <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
            {a.visualSuggestions.map((t, i) => <li key={i} style={{ marginBottom: "0.25rem" }}>{t}</li>)}
          </ul>
        </Section>
      )}

      {/* Overall comment */}
      {a.overallComment && (
        <Section title="📝 Overall Feedback">
          <p style={{ lineHeight: 1.7 }}>{a.overallComment}</p>
        </Section>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function CommunityFeed() {
  const [feed, setFeed]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [playing, setPlaying]   = useState(null);
  const [view, setView]         = useState({}); // id → "feedback" | "report" | null

  useEffect(() => {
    api.get("/video/community-feed")
      .then(r => setFeed(r.data.feed || []))
      .catch(() => setError("Failed to load community feed"))
      .finally(() => setLoading(false));
  }, []);

  const toggleView = (id, mode) =>
    setView(prev => ({ ...prev, [id]: prev[id] === mode ? null : mode }));

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

              {/* Short comment — only when nothing expanded */}
              {!view[item._id] && item.analysis?.overallComment && (
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
                    preload="metadata"
                    style={{ width: "100%", borderRadius: "10px", background: "#000", maxHeight: "400px" }}
                  />
                  <button onClick={() => setPlaying(null)}
                    style={{ marginTop: "0.5rem", fontSize: "0.78rem", color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}>
                    ✕ Close video
                  </button>
                </div>
              ) : (
                <button onClick={() => setPlaying(item._id)} style={{
                  width: "100%",
                  borderRadius: "10px",
                  background: "#0a0a14",
                  border: "1px solid rgba(124,111,255,0.25)",
                  cursor: "pointer",
                  padding: 0,
                  overflow: "hidden",
                  position: "relative",
                  aspectRatio: "16/9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {/* Blurred thumbnail from video */}
                  <video
                    src={`${item.videoUrl}#t=2`}
                    preload="metadata"
                    muted
                    playsInline
                    style={{
                      position: "absolute", inset: 0,
                      width: "100%", height: "100%",
                      objectFit: "cover",
                      filter: "blur(6px) brightness(0.45)",
                      borderRadius: "10px",
                      pointerEvents: "none",
                    }}
                  />
                  {/* Play button overlay */}
                  <div style={{
                    position: "relative", zIndex: 1,
                    width: 52, height: 52, borderRadius: "50%",
                    background: "rgba(124,111,255,0.85)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 20px rgba(124,111,255,0.5)",
                  }}>
                    <span style={{ fontSize: "1.3rem", marginLeft: 3 }}>▶</span>
                  </div>
                  {/* Duration badge */}
                  {item.videoDuration && (
                    <span style={{
                      position: "absolute", bottom: 8, right: 10, zIndex: 1,
                      background: "rgba(0,0,0,0.7)", color: "#fff",
                      fontSize: "0.72rem", fontWeight: 600,
                      padding: "0.15rem 0.45rem", borderRadius: 6,
                    }}>
                      {Math.floor(item.videoDuration / 60)}:{String(item.videoDuration % 60).padStart(2, "0")}
                    </span>
                  )}
                </button>
              )}

              {/* Action buttons */}
              {item.analysis && (
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
                  <button onClick={() => toggleView(item._id, "feedback")} style={{
                    flex: 1, padding: "0.5rem", borderRadius: "8px", background: "transparent",
                    border: `1px solid ${view[item._id] === "feedback" ? "var(--primary)" : "var(--border2)"}`,
                    color: view[item._id] === "feedback" ? "var(--primary)" : "var(--muted)",
                    fontSize: "0.78rem", cursor: "pointer", transition: "all 0.18s",
                  }}>
                    {view[item._id] === "feedback" ? "▲ Hide Feedback" : "📊 Feedback"}
                  </button>
                  <button onClick={() => toggleView(item._id, "report")} style={{
                    flex: 1, padding: "0.5rem", borderRadius: "8px", background: "transparent",
                    border: `1px solid ${view[item._id] === "report" ? "var(--primary)" : "var(--border2)"}`,
                    color: view[item._id] === "report" ? "var(--primary)" : "var(--muted)",
                    fontSize: "0.78rem", cursor: "pointer", transition: "all 0.18s",
                  }}>
                    {view[item._id] === "report" ? "▲ Hide Report" : "📋 Full Report"}
                  </button>
                </div>
              )}

              {/* Quick feedback panel */}
              {view[item._id] === "feedback" && item.analysis && (
                <div style={{
                  marginTop: "0.75rem", padding: "1rem", borderRadius: "10px",
                  background: "var(--card2)", border: "1px solid var(--border2)",
                }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>📊 Feedback</div>
                  {SCORE_LABELS.map(({ key, label, icon }) => (
                    <ScoreBar key={key} label={label} icon={icon} value={item.analysis[key]} />
                  ))}
                  {item.analysis.overallScore != null && (
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border2)",
                    }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>⭐ Overall</span>
                      <span style={{
                        fontWeight: 800, fontSize: "1rem", color: scoreColor(item.analysis.overallScore),
                        background: scoreBg(item.analysis.overallScore), padding: "0.2rem 0.6rem", borderRadius: "8px",
                      }}>{item.analysis.overallScore}/10</span>
                    </div>
                  )}
                  {item.analysis.strongPoints?.length > 0 && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--success)", marginBottom: "0.3rem" }}>✅ Strengths</div>
                      <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                        {item.analysis.strongPoints.map((s, i) => (
                          <li key={i} style={{ fontSize: "0.78rem", color: "var(--text2)", marginBottom: "0.2rem" }}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.analysis.suggestions?.length > 0 && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--warning)", marginBottom: "0.3rem" }}>💡 Tips</div>
                      <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                        {item.analysis.suggestions.map((s, i) => (
                          <li key={i} style={{ fontSize: "0.78rem", color: "var(--text2)", marginBottom: "0.2rem" }}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.analysis.overallComment && (
                    <p style={{
                      marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--text2)",
                      lineHeight: 1.6, fontStyle: "italic",
                      paddingTop: "0.75rem", borderTop: "1px solid var(--border2)",
                    }}>"{item.analysis.overallComment}"</p>
                  )}
                </div>
              )}

              {/* Full detailed report */}
              {view[item._id] === "report" && item.analysis && (
                <div style={{
                  marginTop: "0.75rem", padding: "1rem", borderRadius: "10px",
                  background: "var(--card2)", border: "1px solid var(--border2)",
                }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>📋 Detailed Analysis Report</div>
                  <DetailedReport a={item.analysis} />
                </div>
              )}

            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
