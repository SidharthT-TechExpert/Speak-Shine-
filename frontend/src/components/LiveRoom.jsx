/**
 * LiveRoom.jsx
 *
 * Uses LiveKit's VideoConference component for correct audio/video rendering.
 * Custom overlays (session info, admin controls) are layered on top.
 *
 * Why VideoConference instead of manual track rendering:
 * - Handles AudioTrack rendering automatically (remote audio plays)
 * - Handles video grid layout, speaking indicators, screen share
 * - Handles device permissions and track subscriptions
 * - Our manual approach was missing AudioTrack → no sound
 */

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  VideoConference,
  useParticipants,
  useLocalParticipant,
  ControlBar,
} from "@livekit/components-react";
import "@livekit/components-styles";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";

// ── Admin Controls Panel ─────────────────────────────────────────────────────
function AdminControls({ sessionId }) {
  const participants = useParticipants();
  const [busy, setBusy]           = useState({});
  const [collapsed, setCollapsed] = useState(false);
  const toast = useToast();

  const action = async (type, identity) => {
    setBusy(b => ({ ...b, [identity]: type }));
    try {
      await api.post(`/live-sessions/${sessionId}/${type}/${encodeURIComponent(identity)}`);
      toast(`${type === "mute" ? "Muted" : "Removed"} successfully`, "success");
    } catch (e) {
      toast(e.response?.data?.error || `${type} failed`, "error");
    } finally {
      setBusy(b => ({ ...b, [identity]: null }));
    }
  };

  return (
    <div style={{
      position: "fixed", top: 12, right: 12, zIndex: 9999,
      background: "rgba(10,10,26,0.96)",
      backdropFilter: "blur(16px)",
      border: "1px solid rgba(124,111,255,0.25)",
      borderRadius: 14,
      width: collapsed ? "auto" : 260,
      boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.65rem 0.9rem",
          borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.06)",
          cursor: "pointer", userSelect: "none",
        }}
        onClick={() => setCollapsed(v => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <span>🛡️</span>
          {!collapsed && (
            <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#e2e8f0" }}>
              Admin Controls
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{
            background: "rgba(124,111,255,0.25)", color: "#a78bfa",
            borderRadius: 20, padding: "0.1rem 0.45rem",
            fontSize: "0.7rem", fontWeight: 700,
          }}>
            {participants.length}
          </span>
          <span style={{ color: "#55557a", fontSize: "0.7rem" }}>
            {collapsed ? "▶" : "▼"}
          </span>
        </div>
      </div>

      {/* Participant list */}
      {!collapsed && (
        <div style={{ maxHeight: "50vh", overflowY: "auto", padding: "0.35rem 0" }}>
          {participants.length === 0 ? (
            <div style={{ textAlign: "center", color: "#55557a", fontSize: "0.78rem", padding: "1.25rem 1rem" }}>
              No participants yet
            </div>
          ) : (
            participants.map(p => (
              <div key={p.identity} style={{
                display: "flex", alignItems: "center",
                padding: "0.5rem 0.9rem", gap: "0.55rem",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                {/* Avatar */}
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "linear-gradient(135deg,#7c6fff,#4f46e5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.75rem", fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>
                  {(p.name || p.identity)[0]?.toUpperCase()}
                </div>

                {/* Name + badges */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: "0.78rem", fontWeight: 600, color: "#e2e8f0",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {p.name || p.identity}
                    {p.isLocal && <span style={{ color: "#7c6fff", fontSize: "0.62rem", marginLeft: 4 }}>(you)</span>}
                  </div>
                  <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.2rem" }}>
                    <span style={{
                      fontSize: "0.6rem", padding: "0.1rem 0.3rem", borderRadius: 4,
                      background: p.isMicrophoneEnabled ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                      color: p.isMicrophoneEnabled ? "#4ade80" : "#f87171",
                    }}>
                      {p.isMicrophoneEnabled ? "🎤" : "🔇"}
                    </span>
                    <span style={{
                      fontSize: "0.6rem", padding: "0.1rem 0.3rem", borderRadius: 4,
                      background: p.isCameraEnabled ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                      color: p.isCameraEnabled ? "#4ade80" : "#f87171",
                    }}>
                      {p.isCameraEnabled ? "📹" : "🚫"}
                    </span>
                  </div>
                </div>

                {/* Action buttons — only for other participants */}
                {!p.isLocal && (
                  <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
                    <button
                      onClick={() => action("mute", p.identity)}
                      disabled={!!busy[p.identity]}
                      title="Mute"
                      style={{
                        width: 28, height: 28, borderRadius: 7,
                        border: "1px solid rgba(251,191,36,0.35)",
                        background: "rgba(251,191,36,0.1)",
                        color: "#fbbf24", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.75rem", opacity: busy[p.identity] ? 0.5 : 1,
                      }}
                    >
                      {busy[p.identity] === "mute" ? "…" : "🔇"}
                    </button>
                    <button
                      onClick={() => action("remove", p.identity)}
                      disabled={!!busy[p.identity]}
                      title="Remove"
                      style={{
                        width: 28, height: 28, borderRadius: 7,
                        border: "1px solid rgba(248,113,113,0.35)",
                        background: "rgba(248,113,113,0.1)",
                        color: "#f87171", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.75rem", opacity: busy[p.identity] ? 0.5 : 1,
                      }}
                    >
                      {busy[p.identity] === "remove" ? "…" : "✕"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Session Info Bar (top-left) ───────────────────────────────────────────────
function SessionInfoBar({ session }) {
  const participants = useParticipants();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = s => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
      : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  return (
    <div style={{
      position: "fixed", top: 12, left: 12, zIndex: 9999,
      background: "rgba(10,10,26,0.92)",
      backdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: "0.5rem 0.9rem",
      display: "flex", alignItems: "center", gap: "0.65rem",
      boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    }}>
      {/* Live dot */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%", background: "#f87171",
          animation: "speakDot 1s ease-in-out infinite alternate",
        }} />
        <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#f87171", letterSpacing: "0.06em" }}>
          LIVE
        </span>
      </div>

      <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />

      <span style={{
        fontSize: "0.78rem", fontWeight: 600, color: "#e2e8f0",
        maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {session?.title}
      </span>

      <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />

      <span style={{ fontSize: "0.72rem", color: "#55557a" }}>
        👥 {participants.length}
      </span>

      <span style={{ fontSize: "0.72rem", color: "#55557a", fontVariantNumeric: "tabular-nums" }}>
        ⏱ {fmt(elapsed)}
      </span>
    </div>
  );
}

// ── Inner Room (needs LiveKit context) ───────────────────────────────────────
function InnerRoom({ sessionId, userRole, onLeave, session }) {
  return (
    <>
      {/* LiveKit's VideoConference handles:
          - Video grid layout (auto-adjusts for participant count)
          - Audio track rendering (THIS is why sound works)
          - Speaking indicators
          - Screen share
          - Built-in control bar (mic, camera, screen share, leave)
      */}
      <VideoConference
        style={{ height: "100vh", width: "100vw" }}
      />

      {/* Our custom overlays on top */}
      <SessionInfoBar session={session} />
      {(userRole === "admin" || userRole === "trainer") && (
        <AdminControls sessionId={sessionId} />
      )}
    </>
  );
}

// ── Main LiveRoom component ──────────────────────────────────────────────────
export default function LiveRoom({ sessionId, userRole, onLeave, onSessionEnded }) {
  const [token,      setToken]   = useState(null);
  const [livekitUrl, setUrl]     = useState(null);
  const [error,      setError]   = useState(null);
  const [loading,    setLoading] = useState(true);
  const [session,    setSession] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [sessionRes, tokenRes] = await Promise.all([
          api.get(`/live-sessions/${sessionId}`),
          api.post(`/live-sessions/${sessionId}/token`),
        ]);
        setSession(sessionRes.data);
        setToken(tokenRes.data.token);
        setUrl(tokenRes.data.livekitUrl || import.meta.env.VITE_LIVEKIT_URL);
      } catch (e) {
        setError(e.response?.data?.error || "Failed to join session");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100vh", gap: "1rem", background: "#07071a",
    }}>
      <div className="spinner" />
      <p style={{ color: "#55557a" }}>Joining session…</p>
    </div>
  );

  if (error) return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100vh", gap: "1rem", background: "#07071a",
    }}>
      <div style={{ color: "#f87171", fontSize: "1rem", fontWeight: 600 }}>❌ {error}</div>
      <button
        onClick={onLeave}
        style={{
          background: "rgba(124,111,255,0.15)", border: "1px solid rgba(124,111,255,0.3)",
          color: "#a78bfa", borderRadius: 10, padding: "0.6rem 1.25rem",
          cursor: "pointer", fontWeight: 600,
        }}
      >
        ← Back
      </button>
    </div>
  );

  return (
    <LiveKitRoom
      token={token}
      serverUrl={livekitUrl}
      connect={true}
      video={true}
      audio={true}
      onDisconnected={onLeave}
      style={{ height: "100vh", width: "100vw", position: "fixed", inset: 0, zIndex: 400 }}
    >
      <InnerRoom
        sessionId={sessionId}
        userRole={userRole}
        onLeave={onLeave}
        session={session}
      />
    </LiveKitRoom>
  );
}
