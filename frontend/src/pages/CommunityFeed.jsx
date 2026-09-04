import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { getSharedSocket } from "../hooks/useSocket.js";
import GuestBanner from "../components/GuestBanner.jsx";
import StreakBadge from "../components/StreakBadge.jsx";

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

// ── Content Protection Hook ──────────────────────────────────────────────────
function useContentProtection() {
  const [isObscured, setIsObscured] = useState(false);

  useEffect(() => {
    const handleContextMenu = (e) => {
      // Allow right-clicking textareas, inputs, but block globally elsewhere just to be safe
      if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
      }
    };
    
    const handleKeyDown = (e) => {
      if (e.key === "PrintScreen") {
        try { navigator.clipboard.writeText(""); } catch(err){}
        setIsObscured(true); setTimeout(() => setIsObscured(false), 2000);
        e.preventDefault();
      }
      if (
        (e.metaKey && e.shiftKey && ["s", "S", "3", "4", "5"].includes(e.key)) ||
        (e.ctrlKey && e.shiftKey && ["s", "S"].includes(e.key)) ||
        (e.ctrlKey && ["p", "P", "s", "S"].includes(e.key))
      ) {
        try { navigator.clipboard.writeText(""); } catch(err){}
        setIsObscured(true); setTimeout(() => setIsObscured(false), 2000);
        e.preventDefault();
      }
    };
    const handleBlur = () => setIsObscured(true);
    const handleFocus = () => setIsObscured(false);
    const handleVisibility = () => setIsObscured(document.hidden);

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return isObscured;
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

  // ── Composite score card (same data as VideoAnalysis page) ────────────────
  const bd = a.scoreBreakdown || a._scoreBreakdown || null;
  const cs = a.compositeScore ?? a._compositeScore ?? null;
  const isPictureBd = a.challengeType === "picture_description" || bd?.isPictureDescription === true;
  const isStoryBd = a.challengeType === "story_summary" || bd?.isStorySummary === true;

  const improvementTips = [];
  if (bd) {
    const lenGap = isPictureBd ? (bd.maxDuration || 20) - (bd.duration || 0) : (bd.maxLength || 30) - (bd.length || 0);
    const vocGap = isPictureBd ? (bd.maxVocabulary || 10) - (bd.vocabulary || 0) : (bd.maxVocab || 30) - (bd.vocabUsed || 0);
    const topGap = isPictureBd ? (bd.maxContent || 35) - (bd.content || 0) : (bd.maxTopic || 15) - (bd.topic || 0);
    const comGap = isPictureBd ? (bd.maxCommunication || 20) - (bd.communication || 0) : (bd.maxComm || (bd.isSpecialDay ? 25 : 10)) - (bd.comm || 0);
    const groGap = (bd.maxGrowth || 15) - (bd.growth || 0);
    if (lenGap > 2) improvementTips.push({ icon: "⏱️", label: "Record longer",          detail: `+${lenGap.toFixed(1)} pts possible — speak closer to the full-score time`,                      gap: lenGap });
    if (vocGap > 2) {
      const requiredVocabWords = bd.requiredVocabWords || 3;
      const totalVocabWords = bd.totalVocabWords || 5;
      improvementTips.push({ icon: "📚", label: "Use more vocab words",    detail: `+${vocGap.toFixed(1)} pts possible — use at least ${requiredVocabWords} of today's ${totalVocabWords} vocabulary words`,                  gap: vocGap });
    }
    if (!bd.isSpecialDay && topGap > 1) {
      improvementTips.push({
        icon: isStoryBd ? "📖" : "🎯",
        label: isStoryBd ? "Cover key story points" : "Stay on topic",
        detail: isStoryBd
          ? `+${topGap.toFixed(1)} pts possible — retell the story plot, characters, key events, and conclusion`
          : `+${topGap.toFixed(1)} pts possible — answer the question more directly`,
        gap: topGap,
      });
    }
    if (comGap > 2) improvementTips.push({ icon: "🗣️", label: "Improve communication",  detail: `+${comGap.toFixed(1)} pts possible — work on fluency, grammar, confidence & eye contact`,     gap: comGap });
    if (groGap > 2) improvementTips.push({ icon: "🌱", label: "Aim for personal growth", detail: `+${groGap.toFixed(1)} pts possible — speak with slightly clearer pacing and flow to beat your baseline`, gap: groGap });
    improvementTips.sort((x, y) => y.gap - x.gap);
  }

  return (
    <div style={{ fontSize: "0.85rem" }}>

      {/* ── Personal Growth Banner ── */}
      {bd?.growthDelta != null && bd.growthDelta > 0 && (bd.growth ?? 0) >= 9 && (
        <div style={{
          marginBottom: "0.85rem",
          padding: "0.65rem 0.85rem",
          borderRadius: 10,
          background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(74,222,128,0.08))",
          border: "1px solid rgba(16,185,129,0.45)",
          display: "flex", alignItems: "center", gap: "0.65rem",
        }}>
          <span style={{ fontSize: "1.3rem", flexShrink: 0 }}>🌱</span>
          <div>
            <div style={{ fontWeight: 800, color: "#10b981", fontSize: "0.85rem", marginBottom: "0.15rem" }}>
              Personal Growth Bonus! +{bd.growth} pts
            </div>
            <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>
              Beat baseline ({bd.baselineComm != null ? `${bd.baselineComm.toFixed(1)} avg` : "past attempts"}) by <strong style={{ color: "#34d399" }}>+{bd.growthDelta.toFixed(1)}</strong>!
            </div>
          </div>
        </div>
      )}

      {/* ── Today's Score Card ── */}
      {cs != null && (
        <div style={{
          marginBottom: "1rem",
          borderRadius: 14,
          border: "1px solid rgba(124,111,255,0.35)",
          background: "linear-gradient(135deg, rgba(124,111,255,0.13) 0%, rgba(79,70,229,0.07) 100%)",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "0.9rem 1.1rem 0.7rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <div style={{ fontSize: "0.65rem", color: "rgba(167,139,250,0.8)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.2rem" }}>
                🏆 Score
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
                <span style={{ fontSize: "2rem", fontWeight: 900, lineHeight: 1, color: cs >= 80 ? "#4ade80" : cs >= 60 ? "#a78bfa" : cs >= 40 ? "#fbbf24" : "#f87171" }}>
                  {Math.round(cs)}
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 600 }}>/100 pts</span>
              </div>
            </div>
            <div style={{
              background: cs >= 80 ? "rgba(74,222,128,0.15)" : cs >= 60 ? "rgba(124,111,255,0.15)" : cs >= 40 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)",
              border: `1px solid ${cs >= 80 ? "rgba(74,222,128,0.4)" : cs >= 60 ? "rgba(124,111,255,0.4)" : cs >= 40 ? "rgba(251,191,36,0.4)" : "rgba(248,113,113,0.4)"}`,
              borderRadius: 10, padding: "0.4rem 0.85rem", textAlign: "center",
            }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text)" }}>
                {cs >= 90 ? "🏆 Elite" : cs >= 80 ? "⭐ Excellent" : cs >= 65 ? "✅ Good" : cs >= 50 ? "📈 Developing" : "💪 Keep going"}
              </div>
            </div>
          </div>

          {/* Breakdown bars */}
          {bd && (
            <div style={{ padding: "0 1.1rem 0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {(isPictureBd ? [
                { label: "🗣️ Communication", earned: bd.communication || 0, max: bd.maxCommunication || 20, color: "#60a5fa" },
                { label: "🧠 Content & Relevance",      earned: bd.content       || 0, max: bd.maxContent       || 35, color: "#a78bfa" },
                { label: "📚 Vocabulary",               earned: bd.vocabulary    || 0, max: bd.maxVocabulary    || 10, color: "#34d399" },
                { label: "⏱️ Duration",                 earned: bd.duration      || 0, max: bd.maxDuration      || 20, color: "#fbbf24" },
                ...(bd.growth != null || bd.maxGrowth != null ? [{
                  label: "🌱 Personal Growth",
                  earned: bd.growth || 0,
                  max: bd.maxGrowth || 15,
                  color: "#10b981",
                  subtext: bd.isCalibration
                    ? "Establishing baseline"
                    : bd.growthDelta > 0
                    ? `+${bd.growthDelta.toFixed(1)} vs baseline`
                    : bd.growthDelta === 0
                    ? "Matches baseline"
                    : `${bd.growthDelta.toFixed(1)} vs baseline`,
                }] : []),
              ] : [
                { label: bd.speechRatio != null ? `⏱️ Duration (${bd.speechRatio}% speaking)` : "⏱️ Duration", earned: bd.length || 0, max: bd.maxLength || 30, color: "#60a5fa" },
                { label: "📚 Vocab used", earned: bd.vocabUsed || 0, max: bd.maxVocab || 30, color: "#a78bfa" },
                ...(!bd.isSpecialDay ? [{ label: isStoryBd ? "🎯 Story relevance" : "🎯 Topic relevance", earned: bd.topic || 0, max: bd.maxTopic || 15, color: "#34d399" }] : []),
                { label: "🗣️ Communication", earned: bd.comm || 0, max: bd.maxComm || (bd.isSpecialDay ? 25 : 10), color: "#fbbf24" },
                ...(bd.growth != null || bd.maxGrowth != null ? [{
                  label: "🌱 Personal Growth",
                  earned: bd.growth || 0,
                  max: bd.maxGrowth || 15,
                  color: "#10b981",
                  subtext: bd.isCalibration
                    ? "Establishing baseline"
                    : bd.growthDelta > 0
                    ? `+${bd.growthDelta.toFixed(1)} vs baseline`
                    : bd.growthDelta === 0
                    ? "Matches baseline"
                    : `${bd.growthDelta.toFixed(1)} vs baseline`,
                }] : []),
              ]).map(({ label, earned, max, color, subtext }) => (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "0.72rem", marginBottom: "0.18rem" }}>
                    <span style={{ color: "var(--muted)" }}>
                      {label}
                      {subtext && (
                        <span style={{ marginLeft: "0.35rem", color: color, fontSize: "0.68rem", fontWeight: 600 }}>
                          ({subtext})
                        </span>
                      )}
                    </span>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{earned.toFixed(1)} / {max.toFixed(1)}</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 99, height: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (earned / max) * 100)}%`, background: color, borderRadius: 99 }} />
                  </div>
                </div>
              ))}

              {Array.isArray(a.vocabularyUsed) && a.vocabularyUsed.length > 0 && (
                <div style={{
                  marginTop: "0.2rem",
                  padding: "0.4rem 0.65rem",
                  borderRadius: 8,
                  background: "rgba(167, 139, 250, 0.08)",
                  border: "1px solid rgba(167, 139, 250, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  flexWrap: "wrap",
                  fontSize: "0.72rem",
                }}>
                  <span style={{ color: "#c4b5fd", fontWeight: 700 }}>🎯 Target Words Recognized:</span>
                  {a.vocabularyUsed.map((w, i) => (
                    <span key={i} style={{
                      background: "rgba(74, 222, 128, 0.15)",
                      border: "1px solid rgba(74, 222, 128, 0.35)",
                      color: "#4ade80",
                      padding: "1px 6px",
                      borderRadius: 6,
                      fontWeight: 700,
                      fontSize: "0.7rem",
                    }}>
                      ✓ {w}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Improvement tips */}
          {improvementTips.length > 0 && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "0.7rem 1.1rem" }}>
              <div style={{ fontSize: "0.65rem", color: "rgba(167,139,250,0.8)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                🚀 How to score higher
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {improvementTips.map((tip, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.78rem" }}>
                    <span style={{ flexShrink: 0 }}>{tip.icon}</span>
                    <div>
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>{tip.label}</span>
                      <span style={{ color: "var(--muted)", marginLeft: "0.3rem" }}>{tip.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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

// ── Protected Video Player with YouTube-style controls ────────────────────────
function ProtectedVideoPlayer({ src, identity, watermarkUrl, fullscreenId, itemId, containerRef, onToggleFullscreen, knownDuration }) {
  const videoRef    = useRef(null);
  const wrapRef     = useRef(null);
  const hideTimer   = useRef(null);
  const flashTimer  = useRef(null);
  const rafRef      = useRef(null);

  const [tick,      setTick]      = useState(0);
  const [playing,   setPlaying]   = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [muted,     setMuted]     = useState(false);
  const [showCtrl,  setShowCtrl]  = useState(true);
  const [seeking,   setSeeking]   = useState(false);
  const [hoverPct,  setHoverPct]  = useState(null);
  const [hoverTime, setHoverTime] = useState("");
  const [flash,     setFlash]     = useState(null);
  const [videoError, setVideoError] = useState(false);

  // Read directly from video element every rAF tick
  const v      = videoRef.current;
  const cur    = v?.currentTime || 0;
  // Use knownDuration from DB as fallback when browser returns Infinity
  const rawDur = v?.duration;
  const dur    = (rawDur && isFinite(rawDur) && rawDur > 0)
                   ? rawDur
                   : (knownDuration > 0 ? knownDuration : 0);
  const pct    = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

  const fmt = (s) => {
    if (!s || !isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  };

  const resetHide = () => {
    setShowCtrl(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowCtrl(false), 3000);
  };

  const showFlash = (text, side) => {
    clearTimeout(flashTimer.current);
    setFlash({ text, side });
    flashTimer.current = setTimeout(() => setFlash(null), 700);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); showFlash("▶", "center"); }
    else          { v.pause(); setPlaying(false); showFlash("⏸", "center"); }
    resetHide();
  };

  const skip = (sec) => {
    const v = videoRef.current;
    if (!v) return;
    const d = (isFinite(v.duration) && v.duration > 0) ? v.duration : knownDuration;
    v.currentTime = Math.max(0, Math.min(d || 0, v.currentTime + sec));
    showFlash(sec > 0 ? `+${sec}s` : `${sec}s`, sec > 0 ? "right" : "left");
    resetHide();
  };

  const toggleMute = () => {
    setMuted(m => { showFlash(!m ? "🔇" : "🔊", "center"); return !m; });
    resetHide();
  };

  const seekTo = (clientX, rect) => {
    const v = videoRef.current;
    if (!v) return;
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // Use knownDuration as fallback when browser returns Infinity
    const d = (isFinite(v.duration) && v.duration > 0) ? v.duration : knownDuration;
    if (d > 0) {
      v.currentTime = p * d;
    }
  };

  // rAF loop — re-renders every animation frame while playing so bar moves smoothly
  useEffect(() => {
    const loop = () => {
      setTick(t => t + 1);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case " ": case "k": case "K": e.preventDefault(); togglePlay(); break;
        case "ArrowRight": case "l": case "L": e.preventDefault(); skip(10); break;
        case "ArrowLeft":  case "j": case "J": e.preventDefault(); skip(-10); break;
        case "ArrowUp":   e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); showFlash(`🔊 ${Math.round(v.volume*100)}%`, "center"); resetHide(); break;
        case "ArrowDown": e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); showFlash(`🔊 ${Math.round(v.volume*100)}%`, "center"); resetHide(); break;
        case "m": case "M": e.preventDefault(); toggleMute(); break;
        case "f": case "F": e.preventDefault(); onToggleFullscreen(); break;
        case "0": case "1": case "2": case "3": case "4":
        case "5": case "6": case "7": case "8": case "9":
          e.preventDefault();
          if (isFinite(v.duration)) v.currentTime = (parseInt(e.key) / 10) * v.duration;
          showFlash(`${e.key}0%`, "center"); resetHide(); break;
        default: break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setVideoError(false);
    setBuffering(true);
    v.play().catch(() => {});
    resetHide();
    return () => {
      clearTimeout(hideTimer.current);
      clearTimeout(flashTimer.current);
    };
  }, [src]);

  return (
    <div
      ref={(el) => { wrapRef.current = el; if (typeof containerRef === "function") containerRef(el); else if (containerRef) containerRef.current = el; }}
      className="community-video-wrap"
      style={{ position: "relative", borderRadius: "10px", overflow: "hidden", background: "#000", outline: "none" }}
      onMouseMove={resetHide}
      onTouchStart={resetHide}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline preload="auto"
        disablePictureInPicture
        onContextMenu={e => e.preventDefault()}
        onClick={togglePlay}
        style={{ cursor: "pointer", width: "100%", display: "block",
          maxHeight: fullscreenId === itemId ? "100vh" : "400px",
          height: fullscreenId === itemId ? "100%" : "auto",
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => { setBuffering(false); setPlaying(true); }}
        onCanPlay={() => setBuffering(false)}
        onLoadedData={() => setBuffering(false)}
        onStalled={() => setBuffering(true)}
        onEnded={() => setPlaying(false)}
        onError={() => { setBuffering(false); setVideoError(true); }}
        muted={muted}
      />

      {/* Error overlay — shown when video fails to load (e.g. expired presigned URL) */}
      {videoError && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 50,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.82)", gap: 8,
        }}>
          <span style={{ fontSize: "2rem" }}>⚠️</span>
          <span style={{ color: "#f87171", fontWeight: 700, fontSize: "0.9rem" }}>Video unavailable</span>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.75rem", textAlign: "center", maxWidth: 220 }}>
            The link may have expired. Refresh the page to get a new one.
          </span>
        </div>
      )}

      {/* Buffering spinner */}
      {buffering && !videoError && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.35)", pointerEvents: "none",
        }}>
          <div className="yt-buffer-ring" />
        </div>
      )}

      {/* Flash indicator (skip / play / pause) */}
      {flash && (
        <div style={{
          position: "absolute", zIndex: 60, pointerEvents: "none",
          top: "50%", transform: "translateY(-50%)",
          ...(flash.side === "left"   ? { left: "15%" }  :
              flash.side === "right"  ? { right: "15%" } :
              { left: "50%", transform: "translate(-50%, -50%)" }),
          background: "rgba(0,0,0,0.55)",
          borderRadius: 12, padding: "8px 16px",
          color: "#fff", fontSize: "1.1rem", fontWeight: 700,
          animation: "yt-flash 0.7s ease forwards",
        }}>
          {flash.text}
        </div>
      )}

      {/* Watermark */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10,
        backgroundImage: `url("${watermarkUrl}")`,
        backgroundRepeat: "repeat", backgroundSize: "320px 160px",
      }} />

      {/* Identity badge */}
      <div style={{
        position: "absolute", top: 8, right: 48, zIndex: 20, pointerEvents: "none",
        background: "rgba(0,0,0,0.35)", borderRadius: 4, padding: "2px 7px",
        color: "rgba(255,255,255,0.3)", fontSize: "0.58rem", fontWeight: 600,
      }}>{identity}</div>

      {/* Fullscreen button */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onToggleFullscreen(); }}
        style={{
          position: "absolute", top: 6, right: 8, zIndex: 30,
          background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 6, color: "rgba(255,255,255,0.75)",
          width: 30, height: 24,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", fontSize: "0.75rem",
        }}
      >
        {fullscreenId === itemId ? "⧄" : "⛶"}
      </button>

      {/* ── Controls bar ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 25,
          background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
          padding: "28px 10px 8px",
          transition: "opacity 0.25s",
          opacity: showCtrl ? 1 : 0,
          pointerEvents: showCtrl ? "auto" : "none",
        }}
      >
        {/* ── Seek bar with hover tooltip ── */}
        <div
          style={{ position: "relative", height: 20, display: "flex", alignItems: "center", marginBottom: 4, cursor: "pointer" }}
          onClick={e => {
            e.stopPropagation();
            seekTo(e.clientX, e.currentTarget.getBoundingClientRect());
          }}
          onMouseDown={e => { e.stopPropagation(); setSeeking(true); }}
          onMouseUp={e => { e.stopPropagation(); setSeeking(false); }}
          onTouchStart={e => {
            e.stopPropagation();
            setSeeking(true);
            seekTo(e.touches[0].clientX, e.currentTarget.getBoundingClientRect());
          }}
          onTouchEnd={e => { e.stopPropagation(); setSeeking(false); }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setHoverPct(p * 100);
            setHoverTime(fmt(p * dur));
            if (seeking && e.buttons === 1) seekTo(e.clientX, rect);
          }}
          onMouseLeave={() => { setHoverPct(null); setSeeking(false); }}
        >
          {/* Track */}
          <div style={{ position: "absolute", left: 0, right: 0, height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 99 }} />
          {/* Fill */}
          <div style={{
            position: "absolute", left: 0, height: 4,
            width: `${pct}%`,
            background: "#ff0000", borderRadius: 99,
            pointerEvents: "none",
          }} />
          {/* Hover preview fill */}
          {hoverPct !== null && (
            <div style={{
              position: "absolute", left: 0, height: 4,
              width: `${hoverPct}%`,
              background: "rgba(255,255,255,0.35)", borderRadius: 99,
              pointerEvents: "none",
            }} />
          )}
          {/* Thumb */}
          <div style={{
            position: "absolute", width: 14, height: 14, borderRadius: "50%",
            background: "#ff0000", border: "2px solid #fff",
            left: `calc(${pct}% - 7px)`,
            boxShadow: "0 0 4px rgba(0,0,0,0.6)",
            pointerEvents: "none",
          }} />
          {/* Hover time tooltip */}
          {hoverPct !== null && (
            <div style={{
              position: "absolute", bottom: 22,
              left: `clamp(20px, ${hoverPct}%, calc(100% - 36px))`,
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.85)", color: "#fff",
              fontSize: "0.68rem", fontWeight: 600,
              padding: "2px 7px", borderRadius: 5,
              pointerEvents: "none", whiteSpace: "nowrap",
            }}>
              {hoverTime}
            </div>
          )}
        </div>

        {/* Bottom row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Play/Pause  Space / K */}
          <button onClick={togglePlay} title="Play/Pause (Space / K)"
            style={{ background: "none", border: "none", color: "#fff", fontSize: "1.1rem", cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>
            {playing ? "⏸" : "▶"}
          </button>

          {/* Skip -10  ← / J */}
          <button onClick={() => skip(-10)} title="Back 10s (← / J)"
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "0 2px", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
            <span style={{ fontSize: "1rem" }}>⟪</span>
            <span style={{ fontSize: "0.52rem", color: "rgba(255,255,255,0.7)" }}>10s</span>
          </button>

          {/* Skip +10  → / L */}
          <button onClick={() => skip(10)} title="Forward 10s (→ / L)"
            style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "0 2px", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
            <span style={{ fontSize: "1rem" }}>⟫</span>
            <span style={{ fontSize: "0.52rem", color: "rgba(255,255,255,0.7)" }}>10s</span>
          </button>

          {/* Time */}
          <span style={{ color: "#fff", fontSize: "0.72rem", fontWeight: 500, flex: 1 }}>
            {fmt(cur)} / {fmt(dur)}
          </span>

          {/* Mute  M */}
          <button onClick={toggleMute} title="Mute/Unmute (M)"
            style={{ background: "none", border: "none", color: "#fff", fontSize: "1rem", cursor: "pointer", padding: "0 2px" }}>
            {muted ? "🔇" : "🔊"}
          </button>
        </div>

        {/* Keyboard shortcut hint — shown briefly on focus */}
        <div style={{ textAlign: "center", fontSize: "0.58rem", color: "rgba(255,255,255,0.3)", marginTop: 2, letterSpacing: "0.03em" }}>
          Space/K · ←/J · →/L · M · F · 0-9
        </div>
      </div>

      <style>{`
        @keyframes yt-flash {
          0%   { opacity: 1; transform: translateY(-50%) scale(1.1); }
          60%  { opacity: 1; transform: translateY(-50%) scale(1); }
          100% { opacity: 0; transform: translateY(-50%) scale(0.9); }
        }
      `}</style>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function CommunityFeed() {
  const { user, token } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [feed, setFeed]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [playing, setPlaying]   = useState(null);
  const [view, setView]         = useState({});
  const [showComments, setShowComments] = useState({});
  const isObscured = useContentProtection();
  const containerRefs = useRef({});
  const itemRefs      = useRef({});   // ref per feed card for scroll-to
  const [fullscreenId, setFullscreenId] = useState(null);
  const highlightId = searchParams.get("highlight");

  // Listen for native fullscreen exit (Escape key)
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        setFullscreenId(null);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback((id) => {
    const el = containerRefs.current[id];
    if (!el) return;
    if (!document.fullscreenElement) {
      // Try container first, fall back to video element for mobile Safari
      const target = el.querySelector("video") || el;
      const req = target.requestFullscreen || target.webkitRequestFullscreen || target.mozRequestFullScreen;
      if (req) {
        req.call(target).then(() => setFullscreenId(id)).catch(() => {});
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
      if (exit) exit.call(document).then(() => setFullscreenId(null)).catch(() => {});
    }
  }, []);

  const identity = `${user?.name || "User"} • ${user?.phone || ""}`;
  // Subtle watermark — barely visible, single diagonal text per tile
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160">
    <text x="160" y="80" transform="rotate(-20 160 80)" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.12)" letter-spacing="1">${identity}</text>
  </svg>`;
  const watermarkUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;

  useEffect(() => {
    if (!user) {
      // Guests see dummy community feed from preview API (cached 24h)
      api.get("/guest/preview")
        .then(r => setFeed(r.data?.communityFeed || []))
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }
    api.get("/video/community-feed")
      .then(r => {
        const items = r.data.feed || [];
        setFeed(items);
      })
      .catch(() => setError("Failed to load community feed"))
      .finally(() => setLoading(false));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time comment & like updates from other users
  useEffect(() => {
    if (!token) return;
    const socket = getSharedSocket(token);
    const myPhone = user?.phone;

    const onComment = ({ reportId, comment }) => {
      if (!reportId || !comment) return;
      setFeed(prev => prev.map(item => {
        if (item._id !== reportId) return item;
        if ((item.comments || []).some(c => String(c._id) === String(comment._id))) return item;
        return {
          ...item,
          comments: [
            ...(item.comments || []),
            {
              _id: comment._id,
              name: comment.name,
              role: comment.role,
              text: comment.text,
              createdAt: comment.createdAt,
              isOwn: comment.authorPhone === myPhone,
            },
          ],
        };
      }));
    };

    const onCommentDeleted = ({ reportId, commentId }) => {
      if (!reportId || !commentId) return;
      setFeed(prev => prev.map(item =>
        item._id === reportId
          ? { ...item, comments: (item.comments || []).filter(c => String(c._id) !== String(commentId)) }
          : item
      ));
    };

    const onReact = ({ reportId, likeCount, dislikeCount, actorPhone, actorReaction }) => {
      if (!reportId) return;
      setFeed(prev => prev.map(item => {
        if (item._id !== reportId) return item;
        return {
          ...item,
          likeCount,
          dislikeCount,
          userReaction: actorPhone === myPhone ? actorReaction : item.userReaction,
        };
      }));
    };

    socket.on("community:comment", onComment);
    socket.on("community:comment-deleted", onCommentDeleted);
    socket.on("community:react", onReact);
    return () => {
      socket.off("community:comment", onComment);
      socket.off("community:comment-deleted", onCommentDeleted);
      socket.off("community:react", onReact);
    };
  }, [token, user?.phone]);

  // Auto-open comments when highlightId changes (e.g. clicking notification while already on page)
  useEffect(() => {
    if (highlightId && feed.length > 0) {
      setShowComments(prev => ({ ...prev, [highlightId]: true }));
    }
  }, [highlightId, feed.length]);

  // Scroll to highlighted card after feed renders
  useEffect(() => {
    if (!highlightId || loading) return;
    // Wait two frames so the card DOM is painted
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = itemRefs.current[highlightId];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightId, loading]);

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
      {isObscured && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999999, background: "rgba(10,10,24,0.98)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          textAlign: "center", color: "#fff"
        }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🛡️</div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>Content Protected</h2>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Screenshots and recording are disabled for privacy.</p>
        </div>
      )}
      <div style={{ maxWidth: "900px", margin: "0 auto", userSelect: "none", WebkitUserSelect: "none" }}>

        {/* Guest banner — shown when not logged in */}
        {!user && <GuestBanner />}

        <div style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.4rem" }}>
            👥 Today's Submissions
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {user
              ? "Watch, like, and comment on how other members answered today's question. Videos auto-delete after 24 hours."
              : "Preview of community submissions — register to see real videos and join the conversation!"}
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

        {/* Highlight pulse animation */}
        <style>{`
          @keyframes highlight-ring {
            0%   { box-shadow: 0 0 0 0 rgba(124,111,255,0.8), 0 8px 32px rgba(0,0,0,0.3); }
            40%  { box-shadow: 0 0 0 8px rgba(124,111,255,0.35), 0 8px 32px rgba(0,0,0,0.3); }
            100% { box-shadow: 0 0 0 4px rgba(124,111,255,0.15), 0 8px 32px rgba(0,0,0,0.3); }
          }
        `}</style>

        <div style={{ display: "grid", gap: "1rem" }}>
          {feed.map((item) => (
            <div
              key={item._id}
              ref={el => { itemRefs.current[item._id] = el; }}
              className="card"
              style={{
                padding: "1.25rem",
                transition: "box-shadow 0.3s",
                ...(item._id === highlightId ? {
                  animation: "highlight-ring 1.8s ease forwards",
                  border: "1.5px solid rgba(124,111,255,0.55)",
                } : {}),
              }}
            >

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div className="avatar" style={{
                    width: "38px", height: "38px", fontSize: "0.9rem",
                    ...(item.uploaderColor ? { background: `linear-gradient(135deg, ${item.uploaderColor}, ${item.uploaderColor}99)` } : {}),
                  }}>
                    {item.uploaderInitials || (item.uploaderName || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      {item.uploaderName || "Anonymous"}
                      {item.currentBadge && <StreakBadge badge={item.currentBadge} compact />}
                      {item.isDemo && <span style={{ fontSize: "0.62rem", background: "rgba(124,111,255,0.15)", color: "#a78bfa", borderRadius: 20, padding: "0.1rem 0.45rem", fontWeight: 700 }}>DEMO</span>}
                      {item.isPublic === false && <span style={{ fontSize: "0.62rem", background: "rgba(248,113,113,0.12)", color: "#f87171", borderRadius: 20, padding: "0.1rem 0.45rem", fontWeight: 700 }}>🔒 Private</span>}
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
              {item.isDemo ? (
                /* Demo card — show topic + colored thumbnail, no video lock */
                <div style={{
                  width: "100%", borderRadius: "10px", background: "#0a0a14",
                  border: `1px solid ${item.uploaderColor || "rgba(124,111,255,0.25)"}44`,
                  aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative", overflow: "hidden", marginBottom: "1rem",
                }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    background: `linear-gradient(135deg, ${item.uploaderColor || "#7c6fff"}22, transparent 70%)`,
                  }} />
                  <div style={{ textAlign: "center", position: "relative", zIndex: 1, padding: "1rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎙️</div>
                    <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.82rem", lineHeight: 1.4, maxWidth: 280 }}>
                      "{item.analysis?.transcription?.slice(0, 100)}…"
                    </div>
                    <button
                      onClick={() => navigate("/register")}
                      style={{
                        marginTop: "0.75rem",
                        background: `linear-gradient(135deg, ${item.uploaderColor || "#7c6fff"}, ${item.uploaderColor || "#4f46e5"})`,
                        border: "none", color: "#fff",
                        borderRadius: 8, padding: "0.4rem 0.9rem",
                        fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                      }}
                    >🎬 Watch Real Videos — Register Free</button>
                  </div>
                  <div style={{ position: "absolute", bottom: 8, right: 10, background: "rgba(0,0,0,0.7)", borderRadius: 6, padding: "2px 8px", fontSize: "0.7rem", color: "#fff" }}>
                    {fmtDur(item.videoDuration)}
                  </div>
                </div>
              ) : playing === item._id ? (
                <div style={{ marginBottom: "1.5rem" }}>
                  <ProtectedVideoPlayer
                    src={item.videoUrl ? item.videoUrl + "#t=0.1" : item.videoUrl}
                    knownDuration={item.videoDuration || 0}
                    identity={identity}
                    watermarkUrl={watermarkUrl}
                    fullscreenId={fullscreenId}
                    itemId={item._id}
                    containerRef={el => containerRefs.current[item._id] = el}
                    onToggleFullscreen={() => toggleFullscreen(item._id)}
                  />
                  {fullscreenId !== item._id && (
                    <button onClick={() => setPlaying(null)}
                      style={{
                        marginTop: "0.5rem", fontSize: "0.78rem",
                        color: "var(--muted)", background: "none",
                        border: "none", cursor: "pointer",
                      }}>✕ Close video</button>
                  )}
                </div>
              ) : (
                <button onClick={() => setPlaying(item._id)} style={{
                  width: "100%", borderRadius: "10px", background: "#0a0a14",
                  border: "1px solid rgba(124,111,255,0.25)", cursor: "pointer",
                  padding: 0, overflow: "hidden", position: "relative",
                  aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <video src={`${item.videoUrl}#t=2`} preload="metadata" muted playsInline
                    onContextMenu={e => e.preventDefault()}
                    onError={e => { e.currentTarget.style.display = "none"; }}
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
                    {view[item._id] === "report" ? "▲ Hide" : "📋 Report"}
                  </button>
                </div>

              {/* Quick feedback panel — scores + one-liner */}
              {view[item._id] === "feedback" && item.analysis && (
                <div style={{ marginTop: "0.75rem", padding: "1rem", borderRadius: "10px", background: "var(--card2)", border: "1px solid var(--border2)" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>📊 Feedback</div>
                  <FeedbackPanel a={item.analysis} />
                </div>
              )}

              {/* Full detailed report — everything */}
              {view[item._id] === "report" && (
                <div style={{ marginTop: "0.75rem", padding: "1rem", borderRadius: "10px", background: "var(--card2)", border: "1px solid var(--border2)" }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>📋 Detailed Analysis Report</div>
                  {item.analysis
                    ? <DetailedReport a={item.analysis} />
                    : <p style={{ color: "var(--muted)", fontSize: "0.82rem" }}>The detailed report is not available for this submission.</p>}
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
