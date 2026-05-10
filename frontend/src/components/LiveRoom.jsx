/**
 * LiveRoom.jsx
 * RoomAudioRenderer + GridLayout + custom fixed ControlBar with device pickers.
 * Includes in-room group chat panel (reuses GroupChat component).
 */

import { useEffect, useState, useRef, useCallback } from "react";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useTracks,
  useMediaDeviceSelect,
  useParticipantContext,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";
import GroupChat from "./GroupChat.jsx";
import LiveChat from "./LiveChat.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getSharedSocket } from "../hooks/useSocket.js";
import { useNoiseCancellation } from "../hooks/useNoiseCancellation.js";

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

// ── Emoji Reactions Overlay ──────────────────────────────────────────────────
const EMOJI_LIST = ["👍","❤️","😂","😮","👏","🎉","🔥","😍","🙌","💯","🤔","😢","💪","🚀","⭐"];

function FloatingReactions({ reactions }) {
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:99990, overflow:"hidden" }}>
      {reactions.map(r => (
        <div key={r.id} style={{
          position:"absolute",
          left: r.x + "%",
          bottom: "90px",
          fontSize: "2.4rem",
          lineHeight:1,
          animation:"floatUp 3s ease-out forwards",
          userSelect:"none",
        }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.15rem" }}>
            <span>{r.emoji}</span>
            <span style={{ fontSize:"0.55rem", color:"#e2e8f0", background:"rgba(0,0,0,0.55)", borderRadius:6, padding:"0.05rem 0.3rem", whiteSpace:"nowrap" }}>{r.fromName}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Emoji Picker Bar ──────────────────────────────────────────────────────────
function EmojiPickerBar({ onPick, onClose }) {
  return (
    <div style={{
      position:"absolute", bottom:"calc(100% + 10px)", left:"50%",
      transform:"translateX(-50%)",
      background:"rgba(10,10,26,0.98)", backdropFilter:"blur(20px)",
      border:"1px solid rgba(124,111,255,0.25)", borderRadius:16,
      padding:"0.5rem 0.6rem",
      display:"flex", gap:"0.4rem", flexWrap:"nowrap",
      width: "max-content", zIndex:100000,
      boxShadow:"0 -8px 32px rgba(0,0,0,0.7)",
      animation:"slideUpIn 0.15s ease",
    }}>
      {EMOJI_LIST.map(e => (
        <button key={e} onClick={() => { onPick(e); onClose(); }} style={{
          background:"none", border:"none", fontSize:"1.6rem",
          cursor:"pointer", borderRadius:8, padding:"0.3rem",
          transition:"transform 0.12s, background 0.12s",
          lineHeight:1,
        }}
          onMouseEnter={ev => { ev.currentTarget.style.background="rgba(124,111,255,0.2)"; ev.currentTarget.style.transform="scale(1.3)"; }}
          onMouseLeave={ev => { ev.currentTarget.style.background="none"; ev.currentTarget.style.transform="scale(1)"; }}
        >{e}</button>
      ))}
    </div>
  );
}

// ── Hand Raise Queue (host view) ─────────────────────────────────────────────
function HandRaiseQueue({ raisedHands, onDismiss }) {
  if (raisedHands.length === 0) return null;
  return (
    <div style={{
      position:"fixed", top:60, left:"50%", transform:"translateX(-50%)",
      zIndex:99995, display:"flex", flexDirection:"column", gap:"0.4rem",
      pointerEvents:"none",
    }}>
      {raisedHands.map(h => (
        <div key={h.from} style={{
          display:"flex", alignItems:"center", gap:"0.5rem",
          background:"rgba(251,191,36,0.15)", backdropFilter:"blur(16px)",
          border:"1px solid rgba(251,191,36,0.4)", borderRadius:10,
          padding:"0.4rem 0.8rem", pointerEvents:"all",
          animation:"slideUpIn 0.2s ease",
          boxShadow:"0 4px 20px rgba(0,0,0,0.6)",
        }}>
          <span style={{ fontSize:"1.1rem" }}>✋</span>
          <span style={{ fontSize:"0.78rem", fontWeight:700, color:"#fde68a" }}>{h.fromName}</span>
          <span style={{ fontSize:"0.68rem", color:"#92400e" }}>raised hand</span>
          <button onClick={() => onDismiss(h.from)} style={{
            background:"rgba(251,191,36,0.2)", border:"1px solid rgba(251,191,36,0.3)",
            color:"#fbbf24", borderRadius:6, cursor:"pointer",
            fontSize:"0.62rem", fontWeight:700, padding:"0.1rem 0.4rem",
          }}>✓ Dismiss</button>
        </div>
      ))}
    </div>
  );
}

// ── Custom Control Bar ────────────────────────────────────────────────────────
function CustomControls({ onLeave, chatOpen, onChatToggle, unreadCount, ncOn, onNcToggle, ncLoading, handRaised, onHandToggle, onReaction }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [shareOn,  setShareOn]  = useState(false);
  const [picker,   setPicker]   = useState(null);
  const barRef = useRef(null);

  // Derive truth from LiveKit track state, not local booleans
  const micOn = isMicrophoneEnabled;
  const camOn = isCameraEnabled;

  useEffect(() => {
    const handler = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setPicker(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleMic = async () => {
    try { await localParticipant.setMicrophoneEnabled(!micOn); }
    catch (e) { console.error("Mic:", e); }
  };
  const toggleCam = async () => {
    try { await localParticipant.setCameraEnabled(!camOn); }
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

      {/* Noise Cancellation */}
      <CtrlBtn
        icon={ncLoading ? "⏳" : ncOn ? "🎙️" : "🔊"}
        label={ncLoading ? "Loading…" : ncOn ? "NC On" : "NC Off"}
        active={!ncOn}
        onClick={onNcToggle}
        style={ncOn
          ? { border: "1px solid rgba(74,222,128,0.5)", background: "rgba(74,222,128,0.12)", color: "#4ade80" }
          : {}}
      />

      {/* Chat */}
      <div style={{ position: "relative" }}>
        <CtrlBtn
          icon="💬"
          label={unreadCount > 0 && !chatOpen ? `Chat (${unreadCount > 99 ? "99+" : unreadCount})` : "Chat"}
          active={!chatOpen}
          onClick={onChatToggle}
          style={
            chatOpen
              ? { border: "1px solid rgba(124,111,255,0.5)", background: "rgba(124,111,255,0.2)", color: "#a78bfa" }
              : unreadCount > 0
                ? { border: "1px solid rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.1)", color: "#fca5a5", animation: "badgePulse 1.5s ease-in-out infinite" }
                : {}
          }
        />
        {unreadCount > 0 && !chatOpen && (
          <div style={{
            position: "absolute", top: -6, right: -6,
            minWidth: 20, height: 20, borderRadius: 10,
            background: "linear-gradient(135deg,#ef4444,#dc2626)",
            color: "#fff",
            fontSize: "0.65rem", fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px",
            border: "2px solid rgba(6,6,18,0.98)",
            pointerEvents: "none",
            boxShadow: "0 0 8px rgba(239,68,68,0.6)",
            animation: "badgePulse 1.5s ease-in-out infinite",
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </div>
        )}
      </div>

      {/* Hand Raise */}
      <CtrlBtn
        icon={handRaised ? "✋" : "🖐️"}
        label={handRaised ? "Lower" : "Raise"}
        active={!handRaised}
        onClick={onHandToggle}
        style={handRaised
          ? { border:"1px solid rgba(251,191,36,0.6)", background:"rgba(251,191,36,0.2)", color:"#fbbf24", animation:"handPulse 1s ease-in-out infinite" }
          : {}}
      />

      {/* Emoji Reactions */}
      <div style={{ position:"relative" }}>
        <CtrlBtn icon="😀" label="React" active onClick={() => setPicker(p => p === "emoji" ? null : "emoji")} style={picker==="emoji" ? { border:"1px solid rgba(124,111,255,0.5)", background:"rgba(124,111,255,0.2)", color:"#a78bfa" } : {}} />
        {picker === "emoji" && <EmojiPickerBar onPick={onReaction} onClose={() => setPicker(null)} />}
      </div>

      {/* Leave */}
      <CtrlBtn icon="📞" label="Leave" danger onClick={handleLeave} />
    </div>
  );
}

// ── Participants Panel ────────────────────────────────────────────────────────
function ParticipantsPanel({ sessionId, onKicked }) {
  const participants = useParticipants();
  const [busy, setBusy]           = useState({});
  const [collapsed, setCollapsed] = useState(false);
  const toast = useToast();

  const action = async (type, identity, name) => {
    setBusy(b => ({ ...b, [`${identity}:${type}`]: true }));
    try {
      await api.post(`/live-sessions/${sessionId}/${type}/${encodeURIComponent(identity)}`);
      const labels = { mute: "Muted", "disable-video": "Camera disabled", kick: "Kicked & banned" };
      toast(`${labels[type] || "Done"}: ${name}`, "success");
    } catch (e) {
      toast(e.response?.data?.error || `${type} failed`, "error");
    } finally {
      setBusy(b => ({ ...b, [`${identity}:${type}`]: false }));
    }
  };

  const btnStyle = (color) => ({
    height: 26, borderRadius: 6, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "0.68rem", fontWeight: 600, padding: "0 0.5rem",
    border: `1px solid ${color}40`,
    background: `${color}12`,
    color,
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{
      position: "fixed", top: 12, right: 12, zIndex: 99998,
      background: "rgba(8,8,20,0.97)", backdropFilter: "blur(20px)",
      border: "1px solid rgba(124,111,255,0.2)", borderRadius: 14,
      width: collapsed ? "auto" : 280, boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
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
        <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {participants.length === 0 && (
            <div style={{ textAlign: "center", color: "#55557a", fontSize: "0.75rem", padding: "1rem" }}>No participants yet</div>
          )}
          {participants.map(p => {
            const displayName = p.name || p.identity;
            const isBusy = (type) => busy[`${p.identity}:${type}`];
            return (
              <div key={p.identity} style={{ padding: "0.5rem 0.85rem", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                {/* Name row */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7c6fff,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {displayName[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {displayName}
                      {p.isLocal && <span style={{ color: "#7c6fff", fontSize: "0.6rem", marginLeft: 4 }}>(you)</span>}
                    </div>
                    <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.15rem" }}>
                      <span style={{ fontSize: "0.58rem", padding: "0.08rem 0.28rem", borderRadius: 4, background: p.isMicrophoneEnabled ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)", color: p.isMicrophoneEnabled ? "#4ade80" : "#f87171" }}>
                        {p.isMicrophoneEnabled ? "🎤 On" : "🔇 Off"}
                      </span>
                      <span style={{ fontSize: "0.58rem", padding: "0.08rem 0.28rem", borderRadius: 4, background: p.isCameraEnabled ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)", color: p.isCameraEnabled ? "#4ade80" : "#f87171" }}>
                        {p.isCameraEnabled ? "📹 On" : "🚫 Off"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action buttons — only for other participants */}
                {!p.isLocal && (
                  <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                    {/* Mute mic */}
                    <button
                      style={btnStyle("#fbbf24")}
                      disabled={isBusy("mute")}
                      onClick={() => action("mute", p.identity, displayName)}
                      title="Mute microphone"
                    >
                      {isBusy("mute") ? "…" : "🔇 Mute"}
                    </button>

                    {/* Disable camera */}
                    <button
                      style={btnStyle("#60a5fa")}
                      disabled={isBusy("disable-video")}
                      onClick={() => action("disable-video", p.identity, displayName)}
                      title="Turn off camera"
                    >
                      {isBusy("disable-video") ? "…" : "🚫 Cam"}
                    </button>

                    {/* Kick + ban */}
                    <button
                      style={btnStyle("#f87171")}
                      disabled={isBusy("kick")}
                      onClick={() => action("kick", p.identity, displayName)}
                      title="Kick and ban from rejoining"
                    >
                      {isBusy("kick") ? "…" : "⛔ Kick"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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

// ── Participant Custom Overlay ──────────────────────────────────────────────
function CustomParticipantOverlay({ raisedHands }) {
  const participant = useParticipantContext();
  if (!participant) return null;
  const isHandRaised = raisedHands.some(h => h.from === participant.identity);

  if (!isHandRaised) return null;

  return (
    <div style={{
      position: "absolute", top: "12px", right: "12px", zIndex: 50,
      background: "rgba(251,191,36,0.95)", backdropFilter: "blur(8px)",
      border: "2px solid #fbbf24",
      borderRadius: "12px",
      padding: "0.3rem 0.7rem",
      fontSize: "1.5rem",
      boxShadow: "0 4px 16px rgba(251,191,36,0.6)",
      animation: "handPulse 1s ease-in-out infinite",
      display: "flex", alignItems: "center", gap: "0.5rem"
    }}>
      ✋ <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "#78350f", letterSpacing: "0.02em" }}>Hand Raised</span>
    </div>
  );
}

// ── Video Grid ────────────────────────────────────────────────────────────────
function VideoGrid({ raisedHands }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false }
  );
  return (
    <GridLayout tracks={tracks} style={{ height: "100%", width: "100%", background: "#07071a" }}>
      <ParticipantTile>
        <CustomParticipantOverlay raisedHands={raisedHands} />
      </ParticipantTile>
    </GridLayout>
  );
}

// ── Inner Room ────────────────────────────────────────────────────────────────
function InnerRoom({ sessionId, userRole, onLeave, session }) {
  const [chatOpen,    setChatOpen]    = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [kicked,      setKicked]      = useState(false);
  const [ncOn,        setNcOn]        = useState(false);
  const [ncLoading,   setNcLoading]   = useState(false);
  const [handRaised,  setHandRaised]  = useState(false);
  const [raisedHands, setRaisedHands] = useState([]); // [{from, fromName, ts}]
  const [reactions,   setReactions]   = useState([]);  // [{id, emoji, fromName, x}]
  const { token, user } = useAuth();
  const myPhone = user?.phone;
  const { localParticipant } = useLocalParticipant();
  const { applyNoiseCancellation, cleanupNC } = useNoiseCancellation();
  const rawStreamRef = useRef(null);
  const socketRef    = useRef(null);

  // ── Noise Cancellation toggle ──────────────────────────────────────────────
  const handleNcToggle = async () => {
    if (ncLoading) return;
    setNcLoading(true);
    try {
      if (!ncOn) {
        // Turn ON: get raw mic stream, apply RNNoise, publish clean track
        const rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        rawStreamRef.current = rawStream;
        const cleanStream = await applyNoiseCancellation(rawStream);
        const cleanAudioTrack = cleanStream.getAudioTracks()[0];
        if (cleanAudioTrack && localParticipant) {
          await localParticipant.publishTrack(cleanAudioTrack, {
            source: Track.Source.Microphone,
            name: "microphone",
          });
          setNcOn(true);
          console.log("[NC] Noise cancellation ON");
        }
      } else {
        // Turn OFF: stop NC, republish raw mic
        cleanupNC();
        if (rawStreamRef.current) {
          rawStreamRef.current.getTracks().forEach(t => t.stop());
          rawStreamRef.current = null;
        }
        // Re-enable microphone normally through LiveKit
        await localParticipant.setMicrophoneEnabled(false);
        await localParticipant.setMicrophoneEnabled(true);
        setNcOn(false);
        console.log("[NC] Noise cancellation OFF");
      }
    } catch (err) {
      console.error("[NC] Toggle failed:", err.message);
    } finally {
      setNcLoading(false);
    }
  };

  // Cleanup NC on unmount
  useEffect(() => {
    return () => {
      cleanupNC();
      if (rawStreamRef.current) {
        rawStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // ── Hand raise toggle ─────────────────────────────────────────────────────
  const handleHandToggle = useCallback(() => {
    if (!socketRef.current) return;
    if (!handRaised) {
      socketRef.current.emit("live:raise-hand", { sessionId });
      setHandRaised(true);
    } else {
      socketRef.current.emit("live:lower-hand", { sessionId });
      setHandRaised(false);
    }
  }, [handRaised, sessionId]);

  // ── Emoji reaction send ────────────────────────────────────────────────────
  const handleReaction = useCallback((emoji) => {
    if (!socketRef.current) return;
    socketRef.current.emit("live:reaction", { sessionId, emoji });
  }, [sessionId]);

  // ── Background socket listeners ───────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const socket = getSharedSocket(token);
    socketRef.current = socket;

    const onLiveMessage = ({ message }) => {
      if (!message) return;
      if (message.from !== myPhone) {
        setChatOpen(open => {
          if (!open) setUnreadCount(c => c + 1);
          return open;
        });
      }
    };

    const onKicked = ({ sessionId: sid }) => {
      if (sid?.toString() === sessionId?.toString()) {
        setKicked(true);
        setTimeout(onLeave, 3000);
      }
    };

    const playHandRaiseSound = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch (e) { console.error("Audio error:", e); }
    };

    const onHandRaised = ({ from, fromName, ts }) => {
      setRaisedHands(prev => {
        if (prev.some(h => h.from === from)) return prev;
        if (from !== myPhone) playHandRaiseSound();
        return [...prev, { from, fromName, ts }];
      });
    };
    const onHandLowered = ({ from }) => {
      setRaisedHands(prev => prev.filter(h => h.from !== from));
      if (from === myPhone) setHandRaised(false);
    };

    const onReaction = ({ id, emoji, fromName }) => {
      const x = 5 + Math.random() * 85; // random horizontal %
      const rid = id || `${Date.now()}-${Math.random()}`;
      setReactions(prev => [...prev, { id: rid, emoji, fromName, x }]);
      setTimeout(() => setReactions(prev => prev.filter(r => r.id !== rid)), 3200);
    };

    socket.on("live:message",     onLiveMessage);
    socket.on("session:kicked",   onKicked);
    socket.on("live:hand-raised", onHandRaised);
    socket.on("live:hand-lowered",onHandLowered);
    socket.on("live:reaction",    onReaction);

    if (socket.connected) socket.emit("live:join", { sessionId });
    const onConnect = () => socket.emit("live:join", { sessionId });
    socket.on("connect", onConnect);

    return () => {
      socket.off("live:message",     onLiveMessage);
      socket.off("session:kicked",   onKicked);
      socket.off("live:hand-raised", onHandRaised);
      socket.off("live:hand-lowered",onHandLowered);
      socket.off("live:reaction",    onReaction);
      socket.off("connect",          onConnect);
    };
  }, [token, sessionId, myPhone]);

  const handleChatToggle = () => {
    setChatOpen(v => !v);
    if (!chatOpen) setUnreadCount(0); // clear badge when opening
  };

  if (kicked) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "#07071a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
        <div style={{ fontSize: "3rem" }}>⛔</div>
        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f87171" }}>You've been removed</div>
        <div style={{ fontSize: "0.85rem", color: "#55557a", textAlign: "center", maxWidth: 300 }}>
          You were removed from this session by the host. You'll need permission to rejoin.
        </div>
        <div style={{ fontSize: "0.75rem", color: "#55557a" }}>Leaving in 3 seconds…</div>
      </div>
    );
  }

  const dismissHand = (from) => setRaisedHands(prev => prev.filter(h => h.from !== from));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#07071a", display: "flex", flexDirection: "column" }}>
      <RoomAudioRenderer />
      <SessionInfoBar session={session} />
      {(userRole === "admin" || userRole === "trainer") && <ParticipantsPanel sessionId={sessionId} />}
      {(userRole === "admin" || userRole === "trainer") && <HandRaiseQueue raisedHands={raisedHands} onDismiss={dismissHand} />}

      <FloatingReactions reactions={reactions} />

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 76 }}>
        <VideoGrid raisedHands={raisedHands} />
      </div>

      {chatOpen && (
        <div style={{
          position: "fixed", bottom: 84, right: 12,
          width: 320, height: 460, zIndex: 99997,
          background: "rgba(8,8,20,0.97)", backdropFilter: "blur(20px)",
          border: "1px solid rgba(124,111,255,0.2)", borderRadius: 16,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.7)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "slideUpIn 0.2s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0.85rem", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🗣️</span>
              <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#e2e8f0" }}>Session Chat</span>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
            </div>
            <button onClick={() => setChatOpen(false)} style={{ background: "none", border: "none", color: "#55557a", cursor: "pointer", fontSize: "1rem" }}>✕</button>
          </div>
          <div className="live-room-chat" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <LiveChat sessionId={sessionId} />
          </div>
        </div>
      )}

      <CustomControls
        onLeave={onLeave}
        chatOpen={chatOpen}
        onChatToggle={handleChatToggle}
        unreadCount={unreadCount}
        ncOn={ncOn}
        onNcToggle={handleNcToggle}
        ncLoading={ncLoading}
        handRaised={handRaised}
        onHandToggle={handleHandToggle}
        onReaction={handleReaction}
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
      <div style={{ fontSize: "2rem" }}>{error.includes("removed") || error.includes("banned") ? "⛔" : "❌"}</div>
      <div style={{ color: "#f87171", fontWeight: 600, textAlign: "center", maxWidth: 320, padding: "0 1rem" }}>{error}</div>
      {(error.includes("removed") || error.includes("banned")) && (
        <div style={{ fontSize: "0.8rem", color: "#55557a", textAlign: "center", maxWidth: 280 }}>
          Contact the session host to get permission to rejoin.
        </div>
      )}
      <button onClick={onLeave} style={{ background: "rgba(124,111,255,0.15)", border: "1px solid rgba(124,111,255,0.3)", color: "#a78bfa", borderRadius: 10, padding: "0.6rem 1.25rem", cursor: "pointer", fontWeight: 600 }}>← Back</button>
    </div>
  );

  return (
    <LiveKitRoom token={token} serverUrl={lkUrl} connect={true} video={true} audio={true} onDisconnected={onLeave} style={{ height: "100vh", width: "100vw" }}>
      <InnerRoom sessionId={sessionId} userRole={userRole} onLeave={onLeave} session={session} />
    </LiveKitRoom>
  );
}
