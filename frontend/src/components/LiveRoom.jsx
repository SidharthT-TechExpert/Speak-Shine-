/**
 * LiveRoom.jsx
 * RoomAudioRenderer + GridLayout + custom fixed ControlBar with device pickers.
 * Includes in-room group chat panel (reuses GroupChat component).
 */

import { useEffect, useState, useRef } from "react";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useTracks,
  useMediaDeviceSelect,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";
import GroupChat from "./GroupChat.jsx";

// ── Device Picker Popup ───────────────────────────────────────────────────────
function DevicePicker({ kind, onClose }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
  return (
    <div style={{
      position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(10,10,26,0.98)", backdropFilter: "blur(20px)",
      border: "1px solid rgba(124,111,255,0.25)", borderRadius: 12,
      padding: "0.5rem", minWidth: 220, zIndex: 100000,
      boxShadow: "0 -8px 32px rgba(0,0,0,0.7)",
    }}>
      <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0.3rem 0.5rem 0.5rem" }}>
        {kind === "audioinput" ? "🎤 Microphone" : "📹 Camera"}
      </div>
      {devices.map(d => (
        <button key={d.deviceId} onClick={() => { setActiveMediaDevice(d.deviceId); onClose(); }}
          style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            width: "100%", padding: "0.5rem 0.6rem", borderRadius: 8,
            border: "none", cursor: "pointer", textAlign: "left",
            background: d.deviceId === activeDeviceId ? "rgba(124,111,255,0.2)" : "transparent",
            color: d.deviceId === activeDeviceId ? "#a78bfa" : "#e2e8f0",
            fontSize: "0.78rem", fontWeight: d.deviceId === activeDeviceId ? 700 : 400,
          }}>
          <span style={{ fontSize: "0.7rem", flexShrink: 0 }}>{d.deviceId === activeDeviceId ? "✅" : "○"}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.label || `Device ${d.deviceId.slice(0, 8)}`}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Single control button (icon + label, no dual icons) ───────────────────────
function CtrlBtn({ icon, label, active = true, muted = false, danger = false, onClick, style: extraStyle }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: "0.22rem",
        padding: "0.5rem 0.85rem", borderRadius: 14,
        border: danger
          ? "none"
          : muted
            ? "1px solid rgba(248,113,113,0.35)"
            : active
              ? "1px solid rgba(255,255,255,0.12)"
              : "1px solid rgba(124,111,255,0.4)",
        background: danger
          ? "linear-gradient(135deg,#ef4444,#dc2626)"
          : muted
            ? "rgba(248,113,113,0.12)"
            : active
              ? "rgba(255,255,255,0.07)"
              : "rgba(124,111,255,0.18)",
        color: danger ? "#fff" : muted ? "#f87171" : active ? "#e2e8f0" : "#a78bfa",
        cursor: "pointer", minWidth: 58,
        transition: "all 0.15s",
        ...extraStyle,
      }}
    >
      <span style={{ fontSize: "1.3rem", lineHeight: 1, display: "block" }}>{icon}</span>
      <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.03em", lineHeight: 1 }}>{label}</span>
    </button>
  );
}

// ── Custom Control Bar ────────────────────────────────────────────────────────
function CustomControls({ onLeave, chatOpen, onChatToggle, unreadCount }) {
  const { localParticipant } = useLocalParticipant();
  const [micOn,    setMicOn]    = useState(true);
  const [camOn,    setCamOn]    = useState(true);
  const [shareOn,  setShareOn]  = useState(false);
  const [picker,   setPicker]   = useState(null);
  const barRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setPicker(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleMic = async () => {
    try { await localParticipant.setMicrophoneEnabled(!micOn); setMicOn(v => !v); }
    catch (e) { console.error("Mic:", e); }
  };
  const toggleCam = async () => {
    try { await localParticipant.setCameraEnabled(!camOn); setCamOn(v => !v); }
    catch (e) { console.error("Cam:", e); }
  };
  const toggleShare = async () => {
    try { await localParticipant.setScreenShareEnabled(!shareOn); setShareOn(v => !v); }
    catch (e) { console.error("Share:", e); }
  };
  const handleLeave = () => {
    localParticipant.room?.disconnect();
    onLeave();
  };

  const chevronStyle = (muted) => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "0 0.35rem", borderRadius: "0 10px 10px 0",
    border: muted ? "1px solid rgba(248,113,113,0.3)" : "1px solid rgba(255,255,255,0.1)",
    borderLeft: "1px solid rgba(255,255,255,0.05)",
    background: muted ? "rgba(248,113,113,0.07)" : "rgba(255,255,255,0.04)",
    color: "#55557a", cursor: "pointer", fontSize: "0.5rem",
    alignSelf: "stretch",
    transition: "all 0.15s",
  });

  return (
    <div ref={barRef} style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 99999,
      background: "rgba(6,6,18,0.98)", backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderTop: "1px solid rgba(255,255,255,0.07)",
      padding: "0.6rem 1.5rem",
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: "0.45rem", height: 76,
    }}>

      {/* Mic + device picker */}
      <div style={{ position: "relative", display: "flex", alignItems: "stretch" }}>
        <CtrlBtn
          icon={micOn ? "🎤" : "🔇"}
          label={micOn ? "Mute" : "Unmute"}
          active={micOn} muted={!micOn}
          onClick={toggleMic}
          style={{ borderRadius: "14px 0 0 14px" }}
        />
        <button style={chevronStyle(!micOn)} onClick={() => setPicker(p => p === "audioinput" ? null : "audioinput")}>▲</button>
        {picker === "audioinput" && <DevicePicker kind="audioinput" onClose={() => setPicker(null)} />}
      </div>

      {/* Camera + device picker */}
      <div style={{ position: "relative", display: "flex", alignItems: "stretch" }}>
        <CtrlBtn
          icon={camOn ? "📹" : "🚫"}
          label={camOn ? "Camera" : "No Cam"}
          active={camOn} muted={!camOn}
          onClick={toggleCam}
          style={{ borderRadius: "14px 0 0 14px" }}
        />
        <button style={chevronStyle(!camOn)} onClick={() => setPicker(p => p === "videoinput" ? null : "videoinput")}>▲</button>
        {picker === "videoinput" && <DevicePicker kind="videoinput" onClose={() => setPicker(null)} />}
      </div>

      {/* Screen share */}
      <CtrlBtn
        icon="🖥️"
        label={shareOn ? "Sharing" : "Share"}
        active={!shareOn}
        onClick={toggleShare}
        style={shareOn ? { border: "1px solid rgba(124,111,255,0.5)", background: "rgba(124,111,255,0.2)", color: "#a78bfa" } : {}}
      />

      {/* Chat */}
      <div style={{ position: "relative" }}>
        <CtrlBtn
          icon="💬"
          label="Chat"
          active={!chatOpen}
          onClick={onChatToggle}
          style={chatOpen ? { border: "1px solid rgba(124,111,255,0.5)", background: "rgba(124,111,255,0.2)", color: "#a78bfa" } : {}}
        />
        {unreadCount > 0 && !chatOpen && (
          <div style={{
            position: "absolute", top: -4, right: -4,
            width: 18, height: 18, borderRadius: "50%",
            background: "#ef4444", color: "#fff",
            fontSize: "0.58rem", fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid rgba(6,6,18,0.98)",
            pointerEvents: "none",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </div>
        )}
      </div>

      {/* Leave */}
      <CtrlBtn icon="📞" label="Leave" danger onClick={handleLeave} />
    </div>
  );
}

// ── Participants Panel ────────────────────────────────────────────────────────
function ParticipantsPanel({ sessionId }) {
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
      position: "fixed", top: 12, right: 12, zIndex: 99998,
      background: "rgba(8,8,20,0.97)", backdropFilter: "blur(20px)",
      border: "1px solid rgba(124,111,255,0.2)", borderRadius: 14,
      width: collapsed ? "auto" : 250, boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
      overflow: "hidden", transition: "width 0.2s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0.85rem", borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.05)", cursor: "pointer", userSelect: "none" }}
        onClick={() => setCollapsed(v => !v)}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span>🛡️</span>
          {!collapsed && <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "#e2e8f0" }}>Participants</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ background: "rgba(124,111,255,0.2)", color: "#a78bfa", borderRadius: 20, padding: "0.1rem 0.4rem", fontSize: "0.68rem", fontWeight: 700 }}>{participants.length}</span>
          <span style={{ color: "#55557a", fontSize: "0.68rem" }}>{collapsed ? "▶" : "▼"}</span>
        </div>
      </div>
      {!collapsed && (
        <div style={{ maxHeight: "45vh", overflowY: "auto" }}>
          {participants.map(p => (
            <div key={p.identity} style={{ display: "flex", alignItems: "center", padding: "0.45rem 0.85rem", gap: "0.5rem", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7c6fff,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                {(p.name || p.identity)[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name || p.identity}{p.isLocal && <span style={{ color: "#7c6fff", fontSize: "0.6rem", marginLeft: 4 }}>(you)</span>}
                </div>
                <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.15rem" }}>
                  <span style={{ fontSize: "0.58rem", padding: "0.08rem 0.28rem", borderRadius: 4, background: p.isMicrophoneEnabled ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)", color: p.isMicrophoneEnabled ? "#4ade80" : "#f87171" }}>
                    {p.isMicrophoneEnabled ? "🎤" : "🔇"}
                  </span>
                  <span style={{ fontSize: "0.58rem", padding: "0.08rem 0.28rem", borderRadius: 4, background: p.isCameraEnabled ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)", color: p.isCameraEnabled ? "#4ade80" : "#f87171" }}>
                    {p.isCameraEnabled ? "📹" : "🚫"}
                  </span>
                </div>
              </div>
              {!p.isLocal && (
                <div style={{ display: "flex", gap: "0.2rem", flexShrink: 0 }}>
                  <button onClick={() => action("mute", p.identity)} disabled={!!busy[p.identity]} title="Mute"
                    style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.08)", color: "#fbbf24", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", opacity: busy[p.identity] ? 0.5 : 1 }}>
                    {busy[p.identity] === "mute" ? "…" : "🔇"}
                  </button>
                  <button onClick={() => action("remove", p.identity)} disabled={!!busy[p.identity]} title="Remove"
                    style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", color: "#f87171", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", opacity: busy[p.identity] ? 0.5 : 1 }}>
                    {busy[p.identity] === "remove" ? "…" : "✕"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Session Info Bar ──────────────────────────────────────────────────────────
function SessionInfoBar({ session }) {
  const participants = useParticipants();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const t = setInterval(() => setElapsed(e => e + 1), 1000); return () => clearInterval(t); }, []);
  const fmt = s => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60; return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`; };

  return (
    <div style={{ position: "fixed", top: 12, left: 12, zIndex: 99998, background: "rgba(8,8,20,0.92)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "0.45rem 0.85rem", display: "flex", alignItems: "center", gap: "0.6rem", boxShadow: "0 4px 20px rgba(0,0,0,0.6)", maxWidth: "calc(100vw - 280px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#f87171", animation: "speakDot 1s ease-in-out infinite alternate" }} />
        <span style={{ fontSize: "0.65rem", fontWeight: 800, color: "#f87171", letterSpacing: "0.06em" }}>LIVE</span>
      </div>
      <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session?.title}</span>
      <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
      <span style={{ fontSize: "0.68rem", color: "#55557a", flexShrink: 0 }}>👥 {participants.length}</span>
      <span style={{ fontSize: "0.68rem", color: "#55557a", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>⏱ {fmt(elapsed)}</span>
    </div>
  );
}

// ── Video Grid ────────────────────────────────────────────────────────────────
function VideoGrid() {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false }
  );
  return (
    <GridLayout tracks={tracks} style={{ height: "100%", width: "100%", background: "#07071a" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

// ── Inner Room ────────────────────────────────────────────────────────────────
function InnerRoom({ sessionId, userRole, onLeave, session }) {
  const [chatOpen,    setChatOpen]    = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleUnread = () => {
    setUnreadCount(c => c + 1);
  };

  const handleChatToggle = () => {
    setChatOpen(v => !v);
    if (!chatOpen) setUnreadCount(0); // clear badge when opening
  };

  const CHAT_WIDTH = 340;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#07071a", display: "flex", flexDirection: "column" }}>
      <RoomAudioRenderer />
      <SessionInfoBar session={session} />
      {(userRole === "admin" || userRole === "trainer") && <ParticipantsPanel sessionId={sessionId} />}

      {/* Video grid — shrinks when chat is open */}
      <div style={{
        position: "absolute",
        top: 0, left: 0,
        right: chatOpen ? CHAT_WIDTH : 0,
        bottom: 76,
        transition: "right 0.25s ease",
      }}>
        <VideoGrid />
      </div>

      {/* Chat panel — slides in from right */}
      <div style={{
        position: "fixed",
        top: 0, right: 0, bottom: 76,
        width: CHAT_WIDTH,
        zIndex: 99997,
        transform: chatOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s ease",
        background: "rgba(8,8,20,0.98)",
        backdropFilter: "blur(20px)",
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        display: "flex", flexDirection: "column",
      }}>
        <div className="live-room-chat" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <GroupChat
            onClose={() => setChatOpen(false)}
            onUnread={handleUnread}
          />
        </div>
      </div>

      <CustomControls
        onLeave={onLeave}
        chatOpen={chatOpen}
        onChatToggle={handleChatToggle}
        unreadCount={unreadCount}
      />
    </div>
  );
}

// ── Main LiveRoom ─────────────────────────────────────────────────────────────
export default function LiveRoom({ sessionId, userRole, onLeave }) {
  const [token, setToken]     = useState(null);
  const [lkUrl, setLkUrl]     = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [sRes, tRes] = await Promise.all([api.get(`/live-sessions/${sessionId}`), api.post(`/live-sessions/${sessionId}/token`)]);
        setSession(sRes.data); setToken(tRes.data.token);
        setLkUrl(tRes.data.livekitUrl || import.meta.env.VITE_LIVEKIT_URL);
      } catch (e) { setError(e.response?.data?.error || "Failed to join session"); }
      finally { setLoading(false); }
    })();
  }, [sessionId]);

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "1rem", background: "#07071a" }}>
      <div className="spinner" /><p style={{ color: "#55557a", fontSize: "0.9rem" }}>Joining session…</p>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: "1rem", background: "#07071a" }}>
      <div style={{ fontSize: "2rem" }}>❌</div>
      <div style={{ color: "#f87171", fontWeight: 600 }}>{error}</div>
      <button onClick={onLeave} style={{ background: "rgba(124,111,255,0.15)", border: "1px solid rgba(124,111,255,0.3)", color: "#a78bfa", borderRadius: 10, padding: "0.6rem 1.25rem", cursor: "pointer", fontWeight: 600 }}>← Back</button>
    </div>
  );

  return (
    <LiveKitRoom token={token} serverUrl={lkUrl} connect={true} video={true} audio={true} onDisconnected={onLeave} style={{ height: "100vh", width: "100vw" }}>
      <InnerRoom sessionId={sessionId} userRole={userRole} onLeave={onLeave} session={session} />
    </LiveKitRoom>
  );
}
