import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client.js";
import { useConfirm } from "./ConfirmDialog.jsx";

export default function LiveSessionsPanel() {
  const navigate = useNavigate();
  const confirm  = useConfirm();
  const [sessions, setSessions]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ title: "", scheduledAt: "", description: "", maxParticipants: 20 });
  const [saving, setSaving]         = useState(false);
  const [busy, setBusy]             = useState({});
  const [toast, setToast]           = useState(null);

  const notify = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try {
      const res = await api.get("/live-sessions");
      setSessions(res.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/live-sessions", form);
      setForm({ title: "", scheduledAt: "", description: "", maxParticipants: 20 });
      setShowForm(false);
      notify("Session scheduled!");
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to create session", "error");
    } finally { setSaving(false); }
  };

  const start = async (id) => {
    setBusy(b => ({ ...b, [id]: "starting" }));
    try { await api.post(`/live-sessions/${id}/start`); notify("Session is now LIVE! 🔴"); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed to start", "error"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const end = async (id) => {
    const ok = await confirm({ title: "End Session", message: "End this session for all participants?", confirmText: "End Session", type: "danger" });
    if (!ok) return;
    setBusy(b => ({ ...b, [id]: "ending" }));
    try { await api.post(`/live-sessions/${id}/end`); notify("Session ended."); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed to end", "error"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const cancel = async (id) => {
    const ok = await confirm({ title: "Cancel Session", message: "Cancel this scheduled session? This cannot be undone.", confirmText: "Yes, Cancel", type: "danger" });
    if (!ok) return;
    setBusy(b => ({ ...b, [id]: "cancelling" }));
    try { await api.delete(`/live-sessions/${id}`); notify("Session cancelled."); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed to cancel", "error"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const statusConfig = {
    scheduled: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)", label: "Scheduled", icon: "📅" },
    live:      { color: "#4ade80", bg: "rgba(74,222,128,0.1)", label: "🔴 Live",    icon: "🔴" },
    ended:     { color: "#6b7280", bg: "rgba(107,114,128,0.1)", label: "Ended",    icon: "✅" },
  };

  const liveSessions      = sessions.filter(s => s.status === "live");
  const scheduledSessions = sessions.filter(s => s.status === "scheduled");
  const endedSessions     = sessions.filter(s => s.status === "ended");

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "5rem", right: "1rem", zIndex: 9999,
          background: toast.type === "error" ? "#7f1d1d" : "#065f46",
          border: `1px solid ${toast.type === "error" ? "rgba(248,113,113,0.4)" : "rgba(74,222,128,0.4)"}`,
          color: "#fff", padding: "0.75rem 1.25rem", borderRadius: 12,
          fontSize: "0.9rem", fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          animation: "slideUpIn 0.3s ease",
        }}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>🎥 Live Sessions</h2>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            Schedule and manage live video sessions for your group
          </p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          style={{
            background: showForm ? "rgba(248,113,113,0.15)" : "linear-gradient(135deg,#7c6fff,#4f46e5)",
            border: showForm ? "1px solid rgba(248,113,113,0.3)" : "none",
            color: showForm ? "#f87171" : "#fff",
            borderRadius: 12, padding: "0.65rem 1.25rem",
            fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {showForm ? "✕ Cancel" : "+ Schedule Session"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{
          background: "linear-gradient(135deg, rgba(124,111,255,0.08), rgba(79,70,229,0.05))",
          border: "1px solid rgba(124,111,255,0.25)",
          borderRadius: 16, padding: "1.5rem", marginBottom: "1.5rem",
        }}>
          <div style={{ fontWeight: 700, marginBottom: "1rem", fontSize: "1rem" }}>📅 New Session</div>
          <form onSubmit={create}>
            <div className="grid-cols-2" style={{ marginBottom: "0.75rem" }}>
              <div>
                <label className="form-label">Session Title *</label>
                <input className="form-input" placeholder="e.g. Weekly Speaking Practice" required
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Date & Time *</label>
                <input className="form-input" type="datetime-local" required
                  value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label">Description (optional)</label>
              <input className="form-input" placeholder="What will be covered in this session…"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label">
                Max Participants
                <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                  (2–100, default 20)
                </span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <input
                  className="form-input"
                  type="number"
                  min={2} max={100}
                  style={{ width: 100 }}
                  value={form.maxParticipants}
                  onChange={e => setForm(f => ({ ...f, maxParticipants: Math.min(100, Math.max(2, parseInt(e.target.value) || 20)) }))}
                />
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {[5, 10, 20, 30, 50].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, maxParticipants: n }))}
                      style={{
                        padding: "0.25rem 0.6rem", borderRadius: 8, fontSize: "0.75rem",
                        border: form.maxParticipants === n ? "1px solid #7c6fff" : "1px solid var(--border)",
                        background: form.maxParticipants === n ? "rgba(124,111,255,0.2)" : "var(--bg-secondary)",
                        color: form.maxParticipants === n ? "#a78bfa" : "var(--muted)",
                        cursor: "pointer",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving} style={{ minWidth: 160 }}>
              {saving ? "Scheduling…" : "📅 Schedule Session"}
            </button>
          </form>
        </div>
      )}

      {loading && <div className="spinner-wrap"><div className="spinner" /></div>}

      {/* Live now */}
      {liveSessions.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            🔴 Live Now
          </div>
          {liveSessions.map(s => <SessionCard key={s._id} s={s} onStart={start} onEnd={end} busy={busy} navigate={navigate} />)}
        </div>
      )}

      {/* Scheduled */}
      {scheduledSessions.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            📅 Upcoming
          </div>
          {scheduledSessions.map(s => <SessionCard key={s._id} s={s} onStart={start} onEnd={end} onCancel={cancel} busy={busy} navigate={navigate} />)}
        </div>
      )}

      {/* Ended */}
      {endedSessions.length > 0 && (
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            ✅ Past Sessions
          </div>
          {endedSessions.slice(0, 5).map(s => <SessionCard key={s._id} s={s} onStart={start} onEnd={end} busy={busy} navigate={navigate} />)}
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎥</div>
          <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No sessions yet</div>
          <div style={{ fontSize: "0.85rem" }}>Click "+ Schedule Session" to create your first live session</div>
        </div>
      )}
    </div>
  );
}

function SessionCard({ s, onStart, onEnd, onCancel, busy, navigate }) {
  const isLive      = s.status === "live";
  const isScheduled = s.status === "scheduled";
  const isEnded     = s.status === "ended";

  const borderColor = isLive ? "rgba(74,222,128,0.4)" : isScheduled ? "rgba(96,165,250,0.25)" : "rgba(255,255,255,0.06)";
  const bgColor     = isLive ? "rgba(74,222,128,0.05)" : "var(--bg-secondary)";

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 14, padding: "1rem 1.25rem",
      marginBottom: "0.75rem",
      transition: "all 0.2s",
      position: "relative",
      overflow: "hidden",
    }}>
      {isLive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: "linear-gradient(90deg, #4ade80, #22c55e)",
          animation: "shimmer 2s linear infinite",
        }} />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>{s.title}</span>
            <span style={{
              fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem",
              borderRadius: 20, textTransform: "uppercase",
              background: isLive ? "rgba(74,222,128,0.15)" : isScheduled ? "rgba(96,165,250,0.15)" : "rgba(107,114,128,0.15)",
              color: isLive ? "#4ade80" : isScheduled ? "#60a5fa" : "#6b7280",
            }}>
              {isLive ? "🔴 Live" : isScheduled ? "Scheduled" : "Ended"}
            </span>
          </div>

          {s.description && (
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.4rem" }}>{s.description}</div>
          )}

          <div style={{ display: "flex", gap: "1rem", fontSize: "0.78rem", color: "var(--muted)", flexWrap: "wrap" }}>
            <span>📅 {new Date(s.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            {s.participantCount > 0 && (
              <span style={{ color: s.participantCount >= (s.maxParticipants || 20) ? "#f87171" : "var(--muted)" }}>
                👥 {s.participantCount}/{s.maxParticipants || 20}
                {s.participantCount >= (s.maxParticipants || 20) && " 🔴 Full"}
              </span>
            )}
            {s.participantCount === 0 && (
              <span>👥 0/{s.maxParticipants || 20} max</span>
            )}
            {s.durationMinutes && <span>⏱️ {s.durationMinutes} min</span>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center" }}>
          {isScheduled && (
            <button
              onClick={() => onStart(s._id)}
              disabled={busy[s._id] === "starting"}
              style={{
                background: "linear-gradient(135deg,#4ade80,#22c55e)",
                color: "#065f46", border: "none", borderRadius: 10,
                padding: "0.5rem 1rem", fontWeight: 700, fontSize: "0.82rem",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {busy[s._id] === "starting" ? "Starting…" : "🔴 Go Live"}
            </button>
          )}
          {isScheduled && onCancel && (
            <button
              onClick={() => onCancel(s._id)}
              disabled={busy[s._id] === "cancelling"}
              style={{
                background: "rgba(248,113,113,0.12)",
                border: "1px solid rgba(248,113,113,0.3)",
                color: "#f87171", borderRadius: 10,
                padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {busy[s._id] === "cancelling" ? "Cancelling…" : "✕ Cancel"}
            </button>
          )}
          {isLive && (
            <>
              <button
                onClick={() => window.open(`/live/${s._id}`, "_blank")}
                style={{
                  background: "linear-gradient(135deg,#7c6fff,#4f46e5)",
                  color: "#fff", border: "none", borderRadius: 10,
                  padding: "0.5rem 1rem", fontWeight: 700, fontSize: "0.82rem",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                📹 Join
              </button>
              <button
                onClick={() => onEnd(s._id)}
                disabled={busy[s._id] === "ending"}
                style={{
                  background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)",
                  color: "#f87171", borderRadius: 10,
                  padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {busy[s._id] === "ending" ? "Ending…" : "⏹ End"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Monitoring Panel ─────────────────────────────────────────────────────────
