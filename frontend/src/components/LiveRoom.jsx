import { useEffect, useState, useCallback, useRef } from "react";
import {
  LiveKitRoom,
  useRoomContext,
  useParticipants,
  useLocalParticipant,
  useTracks,
  VideoTrack,
  AudioTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";

// ── Participant Tile ─────────────────────────────────────────────────────────
function ParticipantTile({ participant, isLocal = false }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const videoTrack = tracks.find(
    t => t.participant.identity === participant.identity &&
         t.source === Track.Source.Camera
  );
  const screenTrack = tracks.find(
    t => t.participant.identity === participant.identity &&
         t.source === Track.Source.ScreenShare
  );

  const isCamOn  = participant.isCameraEnabled;
  const isMicOn  = participant.isMicrophoneEnabled;
  const isSpeaking = participant.isSpeaking;
  const displayName = participant.name || participant.identity;
  const initial = (displayName[0] || "?").toUpperCase();

  const activeTrack = screenTrack || videoTrack;

  return (
    <div style={{
      position: "relative",
      background: "#0d0d1f",
      borderRadius: 14,
      overflow: "hidden",
      aspectRatio: "16/9",
      border: isSpeaking
        ? "2px solid #4ade80"
        : "2px solid rgba(255,255,255,0.07)",
      transition: "border-color 0.2s",
      boxShadow: isSpeaking
        ? "0 0 0 3px rgba(74,222,128,0.2)"
        : "0 4px 20px rgba(0,0,0,0.5)",
    }}>
      {/* Video / Avatar */}
      {isCamOn && activeTrack?.publication?.track ? (
        <VideoTrack
          trackRef={activeTrack}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #1a1a3a 0%, #0d0d22 100%)",
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: "linear-gradient(135deg, #7c6fff, #4f46e5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.8rem", fontWeight: 800, color: "#fff",
            boxShadow: "0 4px 20px rgba(124,111,255,0.4)",
          }}>
            {initial}
          </div>
        </div>
      )}

      {/* Speaking ring */}
      {isSpeaking && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 12,
          border: "2px solid #4ade80",
          animation: "speakPulse 1.2s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}

      {/* Bottom bar: name + mic/cam status */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
        padding: "0.75rem 0.75rem 0.6rem",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "0.4rem",
          maxWidth: "70%",
        }}>
          {isSpeaking && (
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#4ade80",
              animation: "speakDot 0.8s ease-in-out infinite alternate",
              flexShrink: 0,
            }} />
          )}
          <span style={{
            fontSize: "0.78rem", fontWeight: 700, color: "#fff",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {displayName}{isLocal ? " (You)" : ""}
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
          {/* Mic indicator */}
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: isMicOn ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.25)",
            border: `1px solid ${isMicOn ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.7rem",
          }}>
            {isMicOn ? "🎤" : "🔇"}
          </div>
          {/* Cam indicator */}
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: isCamOn ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.25)",
            border: `1px solid ${isCamOn ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.7rem",
          }}>
            {isCamOn ? "📹" : "🚫"}
          </div>
        </div>
      </div>

      {/* Screen share badge */}
      {screenTrack && (
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "rgba(124,111,255,0.9)",
          borderRadius: 6, padding: "0.2rem 0.5rem",
          fontSize: "0.65rem", fontWeight: 700, color: "#fff",
        }}>
          🖥️ Screen
        </div>
      )}
    </div>
  );
}

// ── Video Grid ───────────────────────────────────────────────────────────────
function VideoGrid({ participants }) {
  const count = participants.length;

  // Grid layout based on participant count
  const getGridStyle = () => {
    if (count === 1) return { gridTemplateColumns: "1fr", maxWidth: 900 };
    if (count === 2) return { gridTemplateColumns: "1fr 1fr", maxWidth: 1100 };
    if (count === 3) return { gridTemplateColumns: "1fr 1fr", maxWidth: 1100 };
    if (count === 4) return { gridTemplateColumns: "1fr 1fr", maxWidth: 1100 };
    if (count <= 6)  return { gridTemplateColumns: "1fr 1fr 1fr", maxWidth: 1400 };
    return { gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", maxWidth: 1400 };
  };

  const gridStyle = getGridStyle();

  return (
    <div style={{
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
      overflow: "auto",
    }}>
      <div style={{
        display: "grid",
        gap: "0.75rem",
        width: "100%",
        ...gridStyle,
        // Center the 3rd tile when count === 3
        ...(count === 3 ? {
          gridTemplateAreas: '"a b" "c c"',
        } : {}),
      }}>
        {participants.map((p, i) => (
          <div
            key={p.identity}
            style={{
              // Center the lone 3rd tile
              ...(count === 3 && i === 2 ? {
                gridArea: "c",
                maxWidth: "50%",
                margin: "0 auto",
                width: "100%",
              } : {}),
            }}
          >
            <ParticipantTile
              participant={p}
              isLocal={p.isLocal}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Self Controls Bar ────────────────────────────────────────────────────────
function ControlsBar({ onLeave, sessionTitle }) {
  const { localParticipant } = useLocalParticipant();
  const [micOn,  setMicOn]  = useState(true);
  const [camOn,  setCamOn]  = useState(true);
  const [shareOn, setShareOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Timer
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

  const toggleMic = async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!micOn);
      setMicOn(v => !v);
    } catch (e) { console.error("Mic toggle failed:", e); }
  };

  const toggleCam = async () => {
    try {
      await localParticipant.setCameraEnabled(!camOn);
      setCamOn(v => !v);
    } catch (e) { console.error("Cam toggle failed:", e); }
  };

  const toggleShare = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!shareOn);
      setShareOn(v => !v);
    } catch (e) { console.error("Screen share failed:", e); }
  };

  const btnBase = {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "0.3rem", padding: "0.6rem 1rem", borderRadius: 12,
    border: "none", cursor: "pointer", transition: "all 0.2s",
    minWidth: 64, fontSize: "0.65rem", fontWeight: 700,
    letterSpacing: "0.02em",
  };

  const btnOn = {
    ...btnBase,
    background: "rgba(255,255,255,0.08)",
    color: "#e2e8f0",
  };

  const btnOff = {
    ...btnBase,
    background: "rgba(248,113,113,0.15)",
    color: "#f87171",
    border: "1px solid rgba(248,113,113,0.3)",
  };

  const btnActive = {
    ...btnBase,
    background: "rgba(124,111,255,0.2)",
    color: "#a78bfa",
    border: "1px solid rgba(124,111,255,0.4)",
  };

  const iconStyle = { fontSize: "1.3rem", lineHeight: 1 };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      zIndex: 500,
      background: "rgba(10,10,26,0.95)",
      backdropFilter: "blur(20px)",
      borderTop: "1px solid rgba(255,255,255,0.08)",
      padding: "0.75rem 1.5rem",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: "1rem",
    }}>
      {/* Left: session info */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "0.4rem",
          background: "rgba(248,113,113,0.15)",
          border: "1px solid rgba(248,113,113,0.3)",
          borderRadius: 8, padding: "0.3rem 0.65rem",
          flexShrink: 0,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#f87171",
            animation: "speakDot 1s ease-in-out infinite alternate",
          }} />
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#f87171" }}>LIVE</span>
        </div>
        <span style={{
          fontSize: "0.82rem", fontWeight: 600, color: "#e2e8f0",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: 200,
        }}>
          {sessionTitle}
        </span>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          ⏱ {fmt(elapsed)}
        </span>
      </div>

      {/* Center: controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
        {/* Mic */}
        <button style={micOn ? btnOn : btnOff} onClick={toggleMic} title={micOn ? "Mute mic" : "Unmute mic"}>
          <span style={iconStyle}>{micOn ? "🎤" : "🔇"}</span>
          <span>{micOn ? "Mute" : "Unmuted"}</span>
        </button>

        {/* Camera */}
        <button style={camOn ? btnOn : btnOff} onClick={toggleCam} title={camOn ? "Turn off camera" : "Turn on camera"}>
          <span style={iconStyle}>{camOn ? "📹" : "🚫"}</span>
          <span>{camOn ? "Camera" : "No Cam"}</span>
        </button>

        {/* Screen share */}
        <button style={shareOn ? btnActive : btnOn} onClick={toggleShare} title={shareOn ? "Stop sharing" : "Share screen"}>
          <span style={iconStyle}>🖥️</span>
          <span>{shareOn ? "Sharing" : "Share"}</span>
        </button>

        {/* Leave */}
        <button
          onClick={onLeave}
          style={{
            ...btnBase,
            background: "linear-gradient(135deg, #ef4444, #dc2626)",
            color: "#fff",
            padding: "0.6rem 1.4rem",
            minWidth: 80,
          }}
          title="Leave session"
        >
          <span style={iconStyle}>📞</span>
          <span>Leave</span>
        </button>
      </div>

      {/* Right: spacer to balance layout */}
      <div style={{ minWidth: 200 }} />
    </div>
  );
}

// ── Admin Controls Panel ─────────────────────────────────────────────────────
function AdminControls({ sessionId }) {
  const participants = useParticipants();
  const [busy, setBusy] = useState({});
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
      position: "fixed", top: 70, right: 12, zIndex: 600,
      background: "rgba(13,13,30,0.97)",
      backdropFilter: "blur(16px)",
      border: "1px solid rgba(124,111,255,0.25)",
      borderRadius: 16,
      width: collapsed ? "auto" : 270,
      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      overflow: "hidden",
      transition: "width 0.25s ease",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.75rem 1rem",
        borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.06)",
        cursor: "pointer",
      }} onClick={() => setCollapsed(v => !v)}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.85rem" }}>🛡️</span>
          {!collapsed && (
            <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#e2e8f0" }}>
              Admin Controls
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{
            background: "rgba(124,111,255,0.25)",
            color: "#a78bfa",
            borderRadius: 20, padding: "0.15rem 0.5rem",
            fontSize: "0.72rem", fontWeight: 700,
          }}>
            {participants.length}
          </span>
          <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
            {collapsed ? "▶" : "▼"}
          </span>
        </div>
      </div>

      {/* Participant list */}
      {!collapsed && (
        <div style={{ maxHeight: "55vh", overflowY: "auto", padding: "0.5rem 0" }}>
          {participants.length === 0 ? (
            <div style={{
              textAlign: "center", color: "var(--muted)",
              fontSize: "0.8rem", padding: "1.5rem 1rem",
            }}>
              No participants yet
            </div>
          ) : (
            participants.map(p => (
              <div key={p.identity} style={{
                display: "flex", alignItems: "center",
                padding: "0.6rem 1rem",
                gap: "0.6rem",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                transition: "background 0.15s",
              }}>
                {/* Avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "linear-gradient(135deg, #7c6fff, #4f46e5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.8rem", fontWeight: 700, color: "#fff",
                  flexShrink: 0,
                }}>
                  {(p.name || p.identity)[0]?.toUpperCase()}
                </div>

                {/* Name + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: "0.8rem", fontWeight: 600, color: "#e2e8f0",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {p.name || p.identity}
                    {p.isLocal && (
                      <span style={{ color: "#7c6fff", fontSize: "0.65rem", marginLeft: 4 }}>(you)</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem" }}>
                    <span style={{
                      fontSize: "0.65rem", padding: "0.1rem 0.35rem", borderRadius: 4,
                      background: p.isMicrophoneEnabled ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                      color: p.isMicrophoneEnabled ? "#4ade80" : "#f87171",
                    }}>
                      {p.isMicrophoneEnabled ? "🎤 On" : "🔇 Muted"}
                    </span>
                    <span style={{
                      fontSize: "0.65rem", padding: "0.1rem 0.35rem", borderRadius: 4,
                      background: p.isCameraEnabled ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                      color: p.isCameraEnabled ? "#4ade80" : "#f87171",
                    }}>
                      {p.isCameraEnabled ? "📹 On" : "🚫 Off"}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                {!p.isLocal && (
                  <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
                    <button
                      onClick={() => action("mute", p.identity)}
                      disabled={!!busy[p.identity]}
                      title="Mute mic"
                      style={{
                        width: 30, height: 30, borderRadius: 8,
                        border: "1px solid rgba(251,191,36,0.35)",
                        background: busy[p.identity] === "mute"
                          ? "rgba(251,191,36,0.25)"
                          : "rgba(251,191,36,0.1)",
                        color: "#fbbf24", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.8rem",
                        opacity: busy[p.identity] ? 0.6 : 1,
                        transition: "all 0.15s",
                      }}
                    >
                      {busy[p.identity] === "mute" ? "…" : "🔇"}
                    </button>
                    <button
                      onClick={() => action("remove", p.identity)}
                      disabled={!!busy[p.identity]}
                      title="Remove from session"
                      style={{
                        width: 30, height: 30, borderRadius: 8,
                        border: "1px solid rgba(248,113,113,0.35)",
                        background: busy[p.identity] === "remove"
                          ? "rgba(248,113,113,0.25)"
                          : "rgba(248,113,113,0.1)",
                        color: "#f87171", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.8rem",
                        opacity: busy[p.identity] ? 0.6 : 1,
                        transition: "all 0.15s",
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

// ── Session Info Pill ────────────────────────────────────────────────────────
function SessionInfoPill({ session }) {
  const participants = useParticipants();

  return (
    <div style={{
      position: "fixed", top: 70, left: 12, zIndex: 600,
      background: "rgba(13,13,30,0.95)",
      backdropFilter: "blur(16px)",
      border: "1px solid rgba(124,111,255,0.2)",
      borderRadius: 12, padding: "0.6rem 1rem",
      display: "flex", alignItems: "center", gap: "0.75rem",
      boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    }}>
      {/* Live dot */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "#f87171",
          animation: "speakDot 1s ease-in-out infinite alternate",
        }} />
        <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#f87171", letterSpacing: "0.05em" }}>
          LIVE
        </span>
      </div>

      <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />

      <span style={{
        fontSize: "0.8rem", fontWeight: 600, color: "#e2e8f0",
        maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {session?.title}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
        <span style={{ fontSize: "0.75rem" }}>👥</span>
        <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
          {participants.length}
        </span>
      </div>
    </div>
  );
}

// ── Inner Room (needs LiveKit context) ───────────────────────────────────────
function InnerRoom({ sessionId, userRole, onLeave, session }) {
  const participants = useParticipants();

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#07071a",
      display: "flex", flexDirection: "column",
      zIndex: 400,
    }}>
      {/* Session info pill (top-left) */}
      <SessionInfoPill session={session} />

      {/* Admin controls (top-right) */}
      {(userRole === "admin" || userRole === "trainer") && (
        <AdminControls sessionId={sessionId} />
      )}

      {/* Video grid */}
      <div style={{
        flex: 1,
        paddingTop: 60,   // below header
        paddingBottom: 90, // above controls bar
        overflow: "hidden",
      }}>
        <VideoGrid participants={participants} />
      </div>

      {/* Controls bar (bottom) */}
      <ControlsBar onLeave={onLeave} sessionTitle={session?.title || "Live Session"} />
    </div>
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
      minHeight: 300, gap: "1rem",
    }}>
      <div className="spinner" />
      <p style={{ color: "var(--muted)" }}>Joining session…</p>
    </div>
  );

  if (error) return (
    <div className="error-box">
      <p>{error}</p>
      <button className="btn-secondary" onClick={onLeave} style={{ marginTop: "0.75rem" }}>
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
      style={{ height: "100%" }}
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
