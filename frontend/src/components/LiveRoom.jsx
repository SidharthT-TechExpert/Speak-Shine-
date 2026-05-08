/**
 * LiveRoom.jsx — Full-screen video conference
 *
 * Uses LiveKit's GridLayout + RoomAudioRenderer for correct audio/video.
 * Custom grid fills all available space with no black voids.
 * Responsive: works on mobile, tablet, desktop.
 */

import { useEffect, useState, useRef } from "react";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
  useParticipants,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
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
      background: "rgba(8,8,20,0.97)",
      backdropFilter: "blur(20px)",
      border: "1px solid rgba(124,111,255,0.2)",
      borderRadius: 14,
      width: collapsed ? "auto" : 250,
      boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
      overflow: "hidden",
      transition: "width 0.2s ease",
    }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.6rem 0.85rem",
          borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.05)",
          cursor: "pointer", userSelect: "none",
        }}
        onClick={() => setCollapsed(v => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ fontSize: "0.85rem" }}>🛡️</span>
          {!collapsed && (
            <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "#e2e8f0" }}>
              Participants
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{
            background: "rgba(124,111,255,0.2)", color: "#a78bfa",
            borderRadius: 20, padding: "0.1rem 0.4rem",
            fontSize: "0.68rem", fontWeight: 700,
          }}>
            {participants.length}
          </span>
          <span style={{ color: "#55557a", fontSize: "0.68rem" }}>
            {collapsed ? "▶" : "▼"}
          </span>
        </div>
      </div>

      {!collapsed && (
        <div style={{ maxHeight: "45vh", overflowY: "auto" }}>
          {participants.length === 0 ? (
            <div style={{ textAlign: "center", color: "#55557a", fontSize: "0.75rem", padding: "1rem" }}>
              No participants yet
            </div>
          ) : (
            participants.map(p => (
              <div key={p.identity} style={{
                display: "flex", alignItems: "center",
                padding: "0.45rem 0.85rem", gap: "0.5rem",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "linear-gradient(135deg,#7c6fff,#4f46e5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.72rem", fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>
                  {(p.name || p.identity)[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: "0.75rem", fontWeight: 600, color: "#e2e8f0",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {p.name || p.identity}
                    {p.isLocal && <span style={{ color: "#7c6fff", fontSize: "0.6rem", marginLeft: 4 }}>(you)</span>}
                  </div>
                  <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.15rem" }}>
                    <span style={{
                      fontSize: "0.58rem", padding: "0.08rem 0.28rem", borderRadius: 4,
                      background: p.isMicrophoneEnabled ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                      color: p.isMicrophoneEnabled ? "#4ade80" : "#f87171",
                    }}>
                      {p.isMicrophoneEnabled ? "🎤 On" : "🔇 Off"}
                    </span>
                    <span style={{
                      fontSize: "0.58rem", padding: "0.08rem 0.28rem", borderRadius: 4,
                      background: p.isCameraEnabled ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                      color: p.isCameraEnabled ? "#4ade80" : "#f87171",
                    }}>
                      {p.isCameraEnabled ? "📹 On" : "🚫 Off"}
                    </span>
                  </div>
                </div>
                {!p.isLocal && (
                  <div style={{ display: "flex", gap: "0.2rem", flexShrink: 0 }}>
                    <button
                      onClick={() => action("mute", p.identity)}
                      disabled={!!busy[p.identity]}
                      title="Mute"
                      style={{
                        width: 26, height: 26, borderRadius: 6,
                        border: "1px solid rgba(251,191,36,0.3)",
                        background: "rgba(251,191,36,0.08)",
                        color: "#fbbf24", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.7rem", opacity: busy[p.identity] ? 0.5 : 1,
                      }}
                    >
                      {busy[p.identity] === "mute" ? "…" : "🔇"}
                    </button>
                    <button
                      onClick={() => action("remove", p.identity)}
                      disabled={!!busy[p.identity]}
                      title="Remove"
                      style={{
                        width: 26, height: 26, borderRadius: 6,
                        border: "1px solid rgba(248,113,113,0.3)",
                        background: "rgba(248,113,113,0.08)",
                        color: "#f87171", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.7rem", opacity: busy[p.identity] ? 0.5 : 1,
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

// ── Session Info Bar ──────────────────────────────────────────────────────────
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
      background: "rgba(8,8,20,0.92)",
      backdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10, padding: "0.45rem 0.85rem",
      display: "flex", alignItems: "center", gap: "0.6rem",
      boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
      maxWidth: "calc(100vw - 280px)", // don't overlap admin panel
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%", background: "#f87171",
          animation: "speakDot 1s ease-in-out infinite alternate",
        }} />
        <span style={{ fontSize: "0.65rem", fontWeight: 800, color: "#f87171", letterSpacing: "0.06em" }}>
          LIVE
        </span>
      </div>
      <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
      <span style={{
        fontSize: "0.75rem", fontWeight: 600, color: "#e2e8f0",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {session?.title}
      </span>
      <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
      <span style={{ fontSize: "0.68rem", color: "#55557a", flexShrink: 0 }}>👥 {participants.length}</span>
      <span style={{ fontSize: "0.68rem", color: "#55557a", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        ⏱ {fmt(elapsed)}
      </span>
    </div>
  );
}

// ── Responsive Video Grid ─────────────────────────────────────────────────────
function ResponsiveGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera,      withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const count = tracks.length;

  // Calculate grid columns based on count and viewport
  const getColumns = () => {
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 2; // 2+1 layout handled below
    if (count === 4) return 2;
    if (count <= 6)  return 3;
    if (count <= 9)  return 3;
    return 4;
  };

  const cols = getColumns();

  // For 3 participants: use CSS grid-template-areas for centered 3rd tile
  const is3 = count === 3;

  return (
    <div style={{
      flex: 1,
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: is3 ? "1fr 1fr" : `repeat(${Math.ceil(count / cols)}, 1fr)`,
      gap: "0.5rem",
      padding: "0.5rem",
      height: "100%",
      width: "100%",
      boxSizing: "border-box",
      ...(is3 ? { gridTemplateAreas: '"a b" "c c"' } : {}),
    }}>
      {tracks.map((track, i) => (
        <div
          key={track.participant.identity + track.source}
          style={{
            position: "relative",
            borderRadius: 12,
            overflow: "hidden",
            background: "#0d0d1f",
            minHeight: 0,
            // Center the 3rd tile in 3-participant layout
            ...(is3 && i === 2 ? {
              gridArea: "c",
              maxWidth: "50%",
              width: "100%",
              margin: "0 auto",
              justifySelf: "center",
            } : {}),
          }}
        >
          <ParticipantTile
            trackRef={track}
            style={{ width: "100%", height: "100%", borderRadius: 12 }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Inner Room ────────────────────────────────────────────────────────────────
function InnerRoom({ sessionId, userRole, onLeave, session }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      background: "#07071a",
      display: "flex", flexDirection: "column",
    }}>
      {/* Audio renderer — MUST be present for remote audio to play */}
      <RoomAudioRenderer />

      {/* Overlays */}
      <SessionInfoBar session={session} />
      {(userRole === "admin" || userRole === "trainer") && (
        <AdminControls sessionId={sessionId} />
      )}

      {/* Video grid — fills all space between top and bottom bar */}
      <div style={{
        flex: 1,
        paddingTop: 52,    // clear the info bar
        paddingBottom: 80, // clear the control bar
        overflow: "hidden",
        display: "flex",
      }}>
        <ResponsiveGrid />
      </div>

      {/* Control bar — styled via CSS */}
      <ControlBar
        variation="minimal"
        controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: true }}
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          zIndex: 9998,
          background: "rgba(8,8,20,0.97)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: "0.6rem 1.5rem",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "0.5rem",
          height: 72,
        }}
      />
    </div>
  );
}

// ── Main LiveRoom ─────────────────────────────────────────────────────────────
export default function LiveRoom({ sessionId, userRole, onLeave }) {
  const [token,   setToken]   = useState(null);
  const [lkUrl,   setLkUrl]   = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [sRes, tRes] = await Promise.all([
          api.get(`/live-sessions/${sessionId}`),
          api.post(`/live-sessions/${sessionId}/token`),
        ]);
        setSession(sRes.data);
        setToken(tRes.data.token);
        setLkUrl(tRes.data.livekitUrl || import.meta.env.VITE_LIVEKIT_URL);
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
      <p style={{ color: "#55557a", fontSize: "0.9rem" }}>Joining session…</p>
    </div>
  );

  if (error) return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100vh", gap: "1rem", background: "#07071a",
    }}>
      <div style={{ fontSize: "2rem" }}>❌</div>
      <div style={{ color: "#f87171", fontWeight: 600 }}>{error}</div>
      <button
        onClick={onLeave}
        style={{
          background: "rgba(124,111,255,0.15)", border: "1px solid rgba(124,111,255,0.3)",
          color: "#a78bfa", borderRadius: 10, padding: "0.6rem 1.25rem",
          cursor: "pointer", fontWeight: 600, fontSize: "0.9rem",
        }}
      >
        ← Back
      </button>
    </div>
  );

  return (
    <LiveKitRoom
      token={token}
      serverUrl={lkUrl}
      connect={true}
      video={true}
      audio={true}
      onDisconnected={onLeave}
      style={{ height: "100vh", width: "100vw" }}
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
