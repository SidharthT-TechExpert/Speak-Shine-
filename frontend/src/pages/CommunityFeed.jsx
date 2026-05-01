import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

const scoreColor = v => v >= 7 ? "var(--success)" : v >= 5 ? "var(--warning)" : "var(--danger)";
const scoreBg    = v => v >= 7 ? "rgba(74,222,128,0.1)" : v >= 5 ? "rgba(251,191,36,0.1)" : "rgba(248,113,113,0.1)";
const fmtDur = s => s ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}` : "";
const fmtTime = d => new Date(d).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
const fmtAgo = d => {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
};

const ROLE_BADGE = { admin: "👑", trainer: "🎓", user: "" };
const ROLE_COLOR = { admin: "#f59e0b", trainer: "#8b5cf6", user: "#94a3b8" };

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
        <div style={{ height: "100%", width: `${value * 10}%`, background: scoreColor(value), borderRadius: "99px", transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function BlockScoreBar({ score }) {
  const filled = Math.round(score || 0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "2px" }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} style={{ width: "16px", height: "16px", borderRadius: "3px", background: i < filled ? scoreColor(score) : "var(--bg)", border: "1px solid var(--border)" }} />
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

// ── Short Feedback Panel — scores + one-liner only ───────────────────────────
function FeedbackPanel({ a }) {
  if (!a) return null;
  return (
    <div style={{ fontSize: "0.85rem" }}>
      {/* Score bars */}
      {SCORE_LABELS.map(({ key, label, icon }) => (
        <ScoreBar key={key} label={label} icon={icon} value={a[key]} />
      ))}

      {/* Overall score */}
      {a.overallScore != null && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border2)" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>⭐ Overall</span>
          <span style={{ fontWeight: 800, fontSize: "1rem", color: scoreColor(a.overallScore), background: scoreBg(a.overallScore), padding: "0.2rem 0.6rem", borderRadius: "8px" }}>
            {a.overallScore}/10
          </span>
        </div>
      )}

      {/* One-line overall comment */}
      {a.overallComment && (
        <p style={{ marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--text2)", lineHeight: 1.6, fontStyle: "italic", borderTop: "1px solid var(--border2)", paddingTop: "0.75rem" }}>
          "{a.overallComment.slice(0, 160)}{a.overallComment.length > 160 ? "…" : ""}"
        </p>
      )}
    </div>
  );
}

// ── Full Detailed Report — everything ────────────────────────────────────────
function DetailedReport({ a }) {
  if (!a) return null;
  const s = a.stats || {};
  return (
    <div style={{ fontSize: "0.85rem" }}>

      {/* Stats bar */}
      <div style={{ background: "var(--bg)", borderRadius: "8px", padding: "0.65rem 0.9rem", marginBottom: "0.9rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.82rem" }}>
        {s.duration   && <span>⏱️ <strong>{s.duration}</strong></span>}
        {s.wpm        && <span>📊 <strong>{s.wpm} wpm</strong> {s.wpm < 100 ? "🐢 Slow" : s.wpm <= 150 ? "✅ Good" : "⚡ Fast"}</span>}
        {s.fillerTotal > 0 && <span>🗣️ Fillers: <strong>{Object.entries(s.fillerWords || {}).map(([w,c]) => `"${w}" ×${c}`).join(", ")}</strong></span>}
        {s.pauses > 0 && <span>🔇 Pauses: <strong>{s.pauses}</strong></span>}
        {s.rhythm?.speechRatio != null && (
          <span>🎵 Speech: <strong>{s.rhythm.speechRatio}%</strong> {s.rhythm.speechRatio >= 75 ? "✅" : s.rhythm.speechRatio >= 55 ? "⚠️" : "❌"}</span>
        )}
      </div>

      {a.qualityWarning && <p style={{ color: "var(--warning)", marginBottom: "0.5rem" }}>🔈 {a.qualityWarning}</p>}

      {/* Speech scores */}
      <Section title="🗣️ Speech Scores">
        {[
          { icon: "🗣️", label: "Fluency",    v: a.fluency },
          { icon: "📚", label: "Grammar",    v: a.grammar },
          { icon: "🔥", label: "Confidence", v: a.confidence },
          { icon: "🧠", label: "Vocabulary", v: a.vocabulary },
        ].map(({ icon, label, v }) => (
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
          {[
            { icon: "👁️", label: "Eye Contact",   v: a.eyeContact },
            { icon: "🧍", label: "Body Language",  v: a.bodyLanguage },
            { icon: "😊", label: "Expression",     v: a.facialExpression },
            { icon: "✨", label: "Presence",       v: a.overallPresence },
          ].map(({ icon, label, v }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <span style={{ width: "110px", color: "var(--muted)", fontSize: "0.8rem" }}>{icon} {label}</span>
              <BlockScoreBar score={v} />
            </div>
          ))}
        </Section>
      )}

      {/* Pronunciation & Rhythm */}
      {(a.pronunciationNote || a.rhythmNote) && (
        <Section title="🎵 Pronunciation &amp; Rhythm">
          {a.pronunciationNote && <p style={{ marginBottom: "0.3rem" }}>🗣️ {a.pronunciationNote}</p>}
          {a.rhythmNote        && <p>🎵 {a.rhythmNote}</p>}
        </Section>
      )}

      {/* Grammar errors */}
      {a.grammarErrors?.length > 0 && (
        <Section title="❌ Grammar Issues">
          {a.grammarErrors.map((e, i) => (
            <div key={i} style={{ marginBottom: "0.5rem", paddingLeft: "0.5rem", borderLeft: "3px solid var(--danger)" }}>
              <span style={{ color: "var(--muted)", fontStyle: "italic" }}>"{e.original}"</span>
              {" → "}
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
          {a.visualStrengths?.map((vs, i) => <p key={i} style={{ marginBottom: "0.25rem" }}>✅ {vs}</p>)}
        </Section>
      )}

      {/* Vocabulary */}
      {(a.vocabularyHighlights?.strong?.length > 0 || a.vocabularyHighlights?.weak?.length > 0) && (
        <Section title="📖 Vocabulary">
          {a.vocabularyHighlights.strong?.length > 0 && (
            <p style={{ marginBottom: "0.3rem" }}>💎 Good words: <strong>{a.vocabularyHighlights.strong.join(", ")}</strong></p>
          )}
          {a.vocabularyHighlights.weak?.length > 0 && (
            <p>📖 Words to upgrade: <strong>{a.vocabularyHighlights.weak.join(", ")}</strong></p>
          )}
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

      {/* Overall feedback */}
      {a.overallComment && (
        <Section title="📝 Overall Feedback">
          <p style={{ lineHeight: 1.7 }}>{a.overallComment}</p>
        </Section>
      )}
    </div>
  );
}

// ── Engagement bar (likes / dislikes / comment count) ────────────────────────
function EngagementBar({ item, onReact, onToggleComments, showComments }) {
  const [busy, setBusy] = useState(false);

  const react = async (reaction) => {
    if (busy) return;
    setBusy(true);
    await onReact(item._id, reaction);
    setBusy(false);
  };

  const liked    = item.userReaction === "like";
  const disliked = item.userReaction === "dislike";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
      {/* Like */}
      <button
        onClick={() => react("like")}
        disabled={busy}
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          padding: "0.4rem 0.75rem", borderRadius: "99px",
          border: `1px solid ${liked ? "rgba(74,222,128,0.5)" : "var(--border2)"}`,
          background: liked ? "rgba(74,222,128,0.12)" : "transparent",
          color: liked ? "#4ade80" : "var(--muted)",
          fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: "1rem" }}>👍</span>
        <span>{item.likeCount}</span>
      </button>

      {/* Dislike */}
      <button
        onClick={() => react("dislike")}
        disabled={busy}
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          padding: "0.4rem 0.75rem", borderRadius: "99px",
          border: `1px solid ${disliked ? "rgba(248,113,113,0.5)" : "var(--border2)"}`,
          background: disliked ? "rgba(248,113,113,0.1)" : "transparent",
          color: disliked ? "#f87171" : "var(--muted)",
          fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: "1rem" }}>👎</span>
        <span>{item.dislikeCount}</span>
      </button>

      {/* Comment toggle */}
      <button
        onClick={() => onToggleComments(item._id)}
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          padding: "0.4rem 0.75rem", borderRadius: "99px",
          border: `1px solid ${showComments ? "rgba(139,92,246,0.5)" : "var(--border2)"}`,
          background: showComments ? "rgba(139,92,246,0.1)" : "transparent",
          color: showComments ? "var(--primary)" : "var(--muted)",
          fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
          transition: "all 0.15s",
          marginLeft: "auto",
        }}
      >
        <span style={{ fontSize: "1rem" }}>💬</span>
        <span>{item.comments?.length || 0}</span>
      </button>
    </div>
  );
}

// ── Comment section ──────────────────────────────────────────────────────────
function CommentSection({ item, onAddComment, onDeleteComment }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    await onAddComment(item._id, text.trim());
    setText("");
    setBusy(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
      {/* Comment list */}
      {item.comments?.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.75rem", maxHeight: "260px", overflowY: "auto" }}>
          {item.comments.map((c) => (
            <div key={c._id} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                background: `linear-gradient(135deg, ${ROLE_COLOR[c.role] || "#8b5cf6"}, #06b6d4)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "12px", fontWeight: 700, color: "#fff",
              }}>
                {c.name?.[0]?.toUpperCase() || "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: ROLE_COLOR[c.role] || "var(--text)" }}>
                    {ROLE_BADGE[c.role]} {c.name}
                  </span>
                  <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{fmtAgo(c.createdAt)}</span>
                  {c.isOwn && (
                    <button
                      onClick={() => onDeleteComment(item._id, c._id)}
                      style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                      title="Delete comment"
                    >
                      🗑️
                    </button>
                  )}
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--text2)", lineHeight: 1.5, wordBreak: "break-word" }}>
                  {c.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "0.75rem", textAlign: "center" }}>
          No comments yet. Be the first! 💬
        </p>
      )}

      {/* Input */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <textarea
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Add a comment…"
          maxLength={500}
          style={{
            flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)",
            borderRadius: "12px", color: "var(--text)", fontSize: "0.82rem",
            padding: "0.5rem 0.75rem", resize: "none", outline: "none",
            fontFamily: "inherit", lineHeight: 1.45, maxHeight: "80px", overflowY: "auto",
            transition: "border-color 0.15s",
          }}
          onFocus={e => e.target.style.borderColor = "rgba(139,92,246,0.5)"}
          onBlur={e => e.target.style.borderColor = "var(--border2)"}
        />
        <button
          onClick={submit}
          disabled={!text.trim() || busy}
          style={{
            background: "linear-gradient(135deg, #8b5cf6, #6c63ff)",
            border: "none", borderRadius: "10px", color: "#fff",
            width: 36, height: 36, cursor: "pointer", fontSize: "15px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, opacity: (!text.trim() || busy) ? 0.4 : 1,
            transition: "opacity 0.15s",
          }}
        >
          ➤
        </button>
      </div>
      {text.length > 400 && (
        <div style={{ fontSize: "0.68rem", color: text.length >= 500 ? "var(--danger)" : "var(--muted)", marginTop: "0.25rem", textAlign: "right" }}>
          {text.length}/500
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function CommunityFeed() {
  const { user } = useAuth();
  const [feed, setFeed]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [playing, setPlaying]   = useState(null);
  const [view, setView]         = useState({});       // id → "feedback" | "report" | null
  const [showComments, setShowComments] = useState({}); // id → bool

  useEffect(() => {
    api.get("/video/community-feed")
      .then(r => setFeed(r.data.feed || []))
      .catch(() => setError("Failed to load community feed"))
      .finally(() => setLoading(false));
  }, []);

  const toggleView = (id, mode) =>
    setView(prev => ({ ...prev, [id]: prev[id] === mode ? null : mode }));

  const toggleComments = (id) =>
    setShowComments(prev => ({ ...prev, [id]: !prev[id] }));

  const handleReact = useCallback(async (reportId, reaction) => {
    try {
      const { data } = await api.post(`/video/react/${reportId}`, { reaction });
      setFeed(prev => prev.map(item =>
        item._id === reportId
          ? { ...item, likeCount: data.likes, dislikeCount: data.dislikes, userReaction: data.userReaction }
          : item
      ));
    } catch {}
  }, []);

  const handleAddComment = useCallback(async (reportId, text) => {
    try {
      const { data } = await api.post(`/video/comment/${reportId}`, { text });
      setFeed(prev => prev.map(item =>
        item._id === reportId
          ? { ...item, comments: [...(item.comments || []), { ...data.comment, isOwn: true }] }
          : item
      ));
      setShowComments(prev => ({ ...prev, [reportId]: true }));
    } catch {}
  }, []);

  const handleDeleteComment = useCallback(async (reportId, commentId) => {
    try {
      await api.delete(`/video/comment/${reportId}/${commentId}`);
      setFeed(prev => prev.map(item =>
        item._id === reportId
          ? { ...item, comments: item.comments.filter(c => c._id !== commentId) }
          : item
      ));
    } catch {}
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
            Watch, like, and comment on how other members answered today's question. Videos auto-delete after 24 hours.
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
                      {fmtTime(item.submittedAt)}{item.videoDuration ? ` · ${fmtDur(item.videoDuration)}` : ""}
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
                    controls autoPlay playsInline preload="metadata"
                    style={{ width: "100%", borderRadius: "10px", background: "#000", maxHeight: "400px" }}
                  />
                  <button onClick={() => setPlaying(null)}
                    style={{ marginTop: "0.5rem", fontSize: "0.78rem", color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}>
                    ✕ Close video
                  </button>
                </div>
              ) : (
                <button onClick={() => setPlaying(item._id)} style={{
                  width: "100%", borderRadius: "10px", background: "#0a0a14",
                  border: "1px solid rgba(124,111,255,0.25)", cursor: "pointer",
                  padding: 0, overflow: "hidden", position: "relative",
                  aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <video src={`${item.videoUrl}#t=2`} preload="metadata" muted playsInline
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(6px) brightness(0.45)", borderRadius: "10px", pointerEvents: "none" }}
                  />
                  <div style={{ position: "relative", zIndex: 1, width: 52, height: 52, borderRadius: "50%", background: "rgba(124,111,255,0.85)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(124,111,255,0.5)" }}>
                    <span style={{ fontSize: "1.3rem", marginLeft: 3 }}>▶</span>
                  </div>
                  {item.videoDuration && (
                    <span style={{ position: "absolute", bottom: 8, right: 10, zIndex: 1, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: "0.72rem", fontWeight: 600, padding: "0.15rem 0.45rem", borderRadius: 6 }}>
                      {fmtDur(item.videoDuration)}
                    </span>
                  )}
                </button>
              )}

              {/* Feedback / Report toggle buttons */}
              {item.analysis && (
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
                  <button onClick={() => toggleView(item._id, "feedback")} style={{
                    flex: 1, padding: "0.5rem", borderRadius: "8px", background: "transparent",
                    border: `1px solid ${view[item._id] === "feedback" ? "var(--primary)" : "var(--border2)"}`,
                    color: view[item._id] === "feedback" ? "var(--primary)" : "var(--muted)",
                    fontSize: "0.78rem", cursor: "pointer", transition: "all 0.18s",
                  }}>
                    {view[item._id] === "feedback" ? "▲ Hide" : "📊 Feedback"}
                  </button>
                  <button onClick={() => toggleView(item._id, "report")} style={{
                    flex: 1, padding: "0.5rem", borderRadius: "8px", background: "transparent",
                    border: `1px solid ${view[item._id] === "report" ? "var(--primary)" : "var(--border2)"}`,
                    color: view[item._id] === "report" ? "var(--primary)" : "var(--muted)",
                    fontSize: "0.78rem", cursor: "pointer", transition: "all 0.18s",
                  }}>
                    {view[item._id] === "report" ? "▲ Hide" : "📋 Full Report"}
                  </button>
                </div>
              )}

              {/* Quick feedback panel — scores + one-liner */}
              {view[item._id] === "feedback" && item.analysis && (
                <div style={{ marginTop: "0.75rem", padding: "1rem", borderRadius: "10px", background: "var(--card2)", border: "1px solid var(--border2)" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>📊 Feedback</div>
                  <FeedbackPanel a={item.analysis} />
                </div>
              )}

              {/* Full detailed report — everything */}
              {view[item._id] === "report" && item.analysis && (
                <div style={{ marginTop: "0.75rem", padding: "1rem", borderRadius: "10px", background: "var(--card2)", border: "1px solid var(--border2)" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>📋 Detailed Analysis Report</div>
                  <DetailedReport a={item.analysis} />
                </div>
              )}

              {/* ── Engagement bar ── */}
              <EngagementBar
                item={item}
                onReact={handleReact}
                onToggleComments={toggleComments}
                showComments={!!showComments[item._id]}
              />

              {/* ── Comments ── */}
              {showComments[item._id] && (
                <CommentSection
                  item={item}
                  onAddComment={handleAddComment}
                  onDeleteComment={handleDeleteComment}
                />
              )}

            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
