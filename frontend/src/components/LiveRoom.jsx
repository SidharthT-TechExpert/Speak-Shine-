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
  useTrackToggle,
  useMediaDeviceSelect,
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

// ── Mobile detection ───────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 640) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return mobile;
}

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [ref, onOutside]);
}

const isScreenShareSupported = () => {
  if (typeof navigator === "undefined") return false;
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (mobileUa) return false;
  return !!(navigator.mediaDevices?.getDisplayMedia);
};

// ── Device Picker Popup ───────────────────────────────────────────────────────
function DevicePicker({ kind, onClose, onSelectDevice }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, requestPermissions: true });
  return (
    <div style={{
      position: "absolute", bottom: "calc(100% + 16px)", left: 0,
      background: "rgba(10,10,24,0.95)", backdropFilter: "blur(32px)",
      border: "1px solid rgba(124,111,255,0.25)", borderRadius: 16,
      padding: "0.8rem", width: "min(340px, calc(100vw - 1.5rem))", zIndex: 100000,
      boxShadow: "0 -12px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)",
      animation: "slideUpIn 0.2s cubic-bezier(0.34,1.56,0.64,1)",
      maxHeight: "65vh", display: "flex", flexDirection: "column"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem", flexShrink: 0 }}>
        <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {kind === "audioinput" ? "🎤 Microphone" : "📹 Camera"}
        </div>
        <button type="button" onClick={onClose} style={{ 
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          color: "#a78bfa", cursor: "pointer", borderRadius: 8,
          width: 24, height: 24, fontSize: "0.8rem", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s"
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.15)"; e.currentTarget.style.color = "#f87171"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#a78bfa"; }}
        >✕</button>
      </div>
      <div className="custom-scrollbar" style={{ display: "flex", flexDirection: "column", gap: "0.3rem", overflowY: "auto", paddingRight: "0.4rem" }}>
        {(!devices || devices.length === 0) && (
          <div style={{ padding: "1rem", color: "#64748b", fontSize: "0.8rem", textAlign: "center" }}>
            No devices found
          </div>
        )}
        {devices?.map(d => (
          <button type="button" key={d.deviceId} onClick={async (e) => { 
            e.preventDefault();
            try { await setActiveMediaDevice(d.deviceId); } catch(err) {}
            if (onSelectDevice) onSelectDevice(d.deviceId);
            onClose(); 
          }}
            style={{
              display: "flex", alignItems: "center", gap: "0.6rem",
              width: "100%", padding: "0.6rem 0.8rem", borderRadius: 10,
              border: "1px solid transparent", cursor: "pointer", textAlign: "left",
              background: d.deviceId === activeDeviceId ? "rgba(124,111,255,0.15)" : "transparent",
              color: d.deviceId === activeDeviceId ? "#c4b5fd" : "#94a3b8",
              transition: "all 0.15s"
            }}
            onMouseEnter={e => {
               if(d.deviceId !== activeDeviceId) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
               e.currentTarget.style.borderColor = d.deviceId === activeDeviceId ? "rgba(124,111,255,0.3)" : "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={e => {
               e.currentTarget.style.background = d.deviceId === activeDeviceId ? "rgba(124,111,255,0.15)" : "transparent";
               e.currentTarget.style.borderColor = "transparent";
            }}
          >
            <span style={{ fontSize: "0.85rem", flexShrink: 0 }}>{d.deviceId === activeDeviceId ? "✨" : "○"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.8rem", fontWeight: d.deviceId === activeDeviceId ? 600 : 400 }}>
              {d.label || `Device ${d.deviceId.slice(0, 8)}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Single control button ────────────────────────────────────────────────────────────
function CtrlBtn({ icon, label, active = true, muted = false, danger = false, pending = false, onClick, style: extraStyle, iconBoxStyle }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); onClick(e); }}
      disabled={pending}
      className="ctrl-btn"
      style={{ opacity: pending ? 0.6 : 1, ...extraStyle }}
      onMouseEnter={e => { const b = e.currentTarget.querySelector(".ctrl-icon-box"); if(b && !pending) b.style.transform="translateY(-3px) scale(1.08)"; }}
      onMouseLeave={e => { const b = e.currentTarget.querySelector(".ctrl-icon-box"); if(b) b.style.transform=""; }}
    >
      <div className="ctrl-icon-box" style={{
        background: danger ? "linear-gradient(135deg,#ef4444,#dc2626)"
          : muted  ? "rgba(248,113,113,0.15)"
          : active ? "rgba(255,255,255,0.09)"
          : "rgba(124,111,255,0.2)",
        border: danger ? "none"
          : muted  ? "1px solid rgba(248,113,113,0.4)"
          : active ? "1px solid rgba(255,255,255,0.12)"
          : "1px solid rgba(124,111,255,0.45)",
        boxShadow: danger ? "0 4px 16px rgba(239,68,68,0.4)" : "none",
        ...iconBoxStyle
      }}>
        <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>{pending ? "⏳" : icon}</span>
      </div>
      <span className="ctrl-label" style={{
        color: danger ? "#f87171" : muted ? "#f87171" : active ? "#94a3b8" : "#a78bfa",
      }}>{pending ? "…" : label}</span>
    </button>
  );
}

// Must match backend ALLOWED_EMOJIS in chatSocket.js
const EMOJI_LIST = [
  "👍","❤️","😂","😮","👏","🎉",
  "🔥","😍","🙌","💯","🤔","😢",
  "💪","🚀","⭐","😎","🥳",
];

function FloatingReactions({ reactions }) {
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:99990, overflow:"hidden" }}>
      {reactions.map((r, i) => (
        <div key={r.id} style={{
          position:"absolute",
          left: r.x + "%",
          bottom: "96px",
          userSelect:"none",
          animation:`floatUp 3.2s cubic-bezier(0.25,0.46,0.45,0.94) forwards`,
          animationDelay: `${(i % 3) * 0.08}s`,
        }}>
          {/* Glow bubble */}
          <div style={{
            display:"flex", flexDirection:"column", alignItems:"center", gap:"0.25rem",
          }}>
            <div style={{
              fontSize:"2.6rem", lineHeight:1,
              background:"rgba(10,10,26,0.75)",
              backdropFilter:"blur(12px)",
              borderRadius:"50%",
              width:"3.4rem", height:"3.4rem",
              display:"flex", alignItems:"center", justifyContent:"center",
              border:"1.5px solid rgba(255,255,255,0.15)",
              boxShadow:"0 4px 20px rgba(0,0,0,0.6), 0 0 12px rgba(124,111,255,0.3)",
            }}>{r.emoji}</div>
            <div style={{
              fontSize:"0.58rem", fontWeight:700,
              color:"#fff",
              background:"linear-gradient(135deg,rgba(124,111,255,0.85),rgba(79,70,229,0.85))",
              backdropFilter:"blur(8px)",
              borderRadius:"20px",
              padding:"0.1rem 0.45rem",
              whiteSpace:"nowrap",
              maxWidth:"80px",
              overflow:"hidden",
              textOverflow:"ellipsis",
              boxShadow:"0 2px 8px rgba(0,0,0,0.5)",
            }}>{r.fromName}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Emoji Picker Panel ────────────────────────────────────────────────────────
function EmojiBtn({ e, onPick, onClose }) {
  return (
    <button type="button"
      onClick={() => { onPick(e); onClose(); }}
      style={{
        background: "none", border: "none",
        fontSize: "1.6rem", cursor: "pointer",
        borderRadius: "50%", width: "clamp(36px, 8vw, 44px)", height: "clamp(36px, 8vw, 44px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "transform 0.15s, background 0.15s, box-shadow 0.15s",
        lineHeight: 1,
      }}
      onMouseEnter={ev => {
        ev.currentTarget.style.background = "rgba(124,111,255,0.25)";
        ev.currentTarget.style.boxShadow = "0 0 12px rgba(124,111,255,0.4)";
        ev.currentTarget.style.transform = "scale(1.25) translateY(-3px)";
      }}
      onMouseLeave={ev => {
        ev.currentTarget.style.background = "none";
        ev.currentTarget.style.boxShadow = "none";
        ev.currentTarget.style.transform = "scale(1)";
      }}
    >{e}</button>
  );
}

function EmojiPickerBar({ onPick, onClose, mobile = false }) {
  const rows = mobile
    ? [EMOJI_LIST.slice(0, 6), EMOJI_LIST.slice(6, 12), EMOJI_LIST.slice(12)]
    : [EMOJI_LIST.slice(0, 9), EMOJI_LIST.slice(9)];
  return (
    <div className={`lr-emoji-picker${mobile ? " lr-emoji-picker--mobile" : ""}`}>
      {mobile && (
        <div className="lr-sheet-handle-row">
          <span className="lr-sheet-title">Send a reaction</span>
          <button type="button" className="lr-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="lr-emoji-row">
          {row.map(e => <EmojiBtn key={e} e={e} onPick={onPick} onClose={onClose} />)}
        </div>
      ))}
    </div>
  );
}

// ── Hand Raise Queue (host view) ─────────────────────────────────────────────
function HandRaiseQueue({ raisedHands, onDismiss, onDismissAll }) {
  if (raisedHands.length === 0) return null;
  return (
    <div className="lr-hand-queue">
      {/* Queue header */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        background:"rgba(251,191,36,0.2)", backdropFilter:"blur(20px)",
        border:"1px solid rgba(251,191,36,0.5)",
        borderRadius:12, padding:"0.4rem 0.75rem",
        boxShadow:"0 0 24px rgba(251,191,36,0.25), 0 4px 20px rgba(0,0,0,0.7)",
        pointerEvents:"all",
        animation:"slideUpIn 0.2s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:"0.4rem" }}>
          <span style={{ fontSize:"1.2rem", animation:"waveHand 1.2s ease-in-out infinite" }}>✋</span>
          <span style={{ fontSize:"0.75rem", fontWeight:800, color:"#fde68a", letterSpacing:"0.02em" }}>
            Raised Hands
          </span>
          <div style={{
            background:"linear-gradient(135deg,#fbbf24,#f59e0b)",
            color:"#78350f", borderRadius:"99px",
            fontSize:"0.62rem", fontWeight:900,
            padding:"0.05rem 0.45rem", minWidth:20, textAlign:"center",
            boxShadow:"0 2px 8px rgba(251,191,36,0.5)",
          }}>{raisedHands.length}</div>
        </div>
        {raisedHands.length > 1 && (
          <button type="button" onClick={onDismissAll} style={{
            background:"rgba(251,191,36,0.15)", border:"1px solid rgba(251,191,36,0.35)",
            color:"#fbbf24", borderRadius:8, cursor:"pointer",
            fontSize:"0.6rem", fontWeight:700, padding:"0.15rem 0.5rem",
            transition:"all 0.15s",
          }}>✓ All</button>
        )}
      </div>

      {/* Individual hand entries */}
      {raisedHands.map((h, idx) => (
        <div key={h.from} style={{
          display:"flex", alignItems:"center", gap:"0.6rem",
          background:"rgba(10,10,26,0.92)", backdropFilter:"blur(20px)",
          border:"1px solid rgba(251,191,36,0.25)",
          borderLeft:"3px solid rgba(251,191,36,0.7)",
          borderRadius:10, padding:"0.45rem 0.75rem",
          pointerEvents:"all",
          animation:`slideUpIn 0.2s cubic-bezier(0.34,1.56,0.64,1) ${idx * 0.05}s both`,
          boxShadow:"0 4px 20px rgba(0,0,0,0.6)",
        }}>
          {/* Avatar */}
          <div style={{
            width:28, height:28, borderRadius:"50%",
            background:"linear-gradient(135deg,#fbbf24,#f59e0b)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:"0.7rem", fontWeight:800, color:"#78350f",
            flexShrink:0, boxShadow:"0 0 8px rgba(251,191,36,0.4)",
          }}>{h.fromName?.[0]?.toUpperCase() || "?"}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:"0.78rem", fontWeight:700, color:"#fde68a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {h.fromName}
            </div>
            <div style={{ fontSize:"0.6rem", color:"rgba(251,191,36,0.55)", marginTop:"0.05rem" }}>wants to speak</div>
          </div>
          <button type="button" onClick={() => onDismiss(h.from)} style={{
            background:"rgba(74,222,128,0.12)", border:"1px solid rgba(74,222,128,0.3)",
            color:"#4ade80", borderRadius:8, cursor:"pointer",
            fontSize:"0.62rem", fontWeight:700, padding:"0.2rem 0.55rem",
            whiteSpace:"nowrap", flexShrink:0, transition:"all 0.15s",
          }}>✓ Done</button>
        </div>
      ))}
    </div>
  );
}

// ── Custom Control Bar ────────────────────────────────────────────────────────
function CustomControls({
  userRole, onLeave, chatOpen, onChatToggle, unreadCount,
  ncOn, onNcToggle, ncLoading, handRaised, onHandToggle, onReaction,
  participantsOpen, onParticipantsToggle, isMobile,
}) {
  const { localParticipant } = useLocalParticipant();
  const toast = useToast();
  const [picker, setPicker]  = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const barRef = useRef(null);
  const canShare = isScreenShareSupported();

  const { toggle: toggleMic, enabled: micOn, pending: micPending } = useTrackToggle({ source: Track.Source.Microphone });
  const { toggle: toggleCam, enabled: camOn, pending: camPending } = useTrackToggle({ source: Track.Source.Camera });
  const { toggle: toggleShare, enabled: shareOn, pending: sharePending } = useTrackToggle({ source: Track.Source.ScreenShare });

  const closePickers = useCallback(() => { setPicker(null); setMoreOpen(false); }, []);
  useClickOutside(barRef, closePickers);

  const handleLeave = () => {
    localParticipant?.room?.disconnect();
    onLeave();
  };

  const handleShare = async () => {
    if (!canShare) {
      toast("Screen sharing is only available on desktop browsers", "warning");
      return;
    }
    try {
      await toggleShare();
    } catch (e) {
      console.error(e);
      toast(e?.message?.includes("Permission") ? "Screen share permission denied" : "Could not start screen share", "error");
    }
  };

  const handleReactionPick = (emoji) => {
    onReaction(emoji);
    setPicker(null);
    setMoreOpen(false);
  };

  const chevronStyle = (muted) => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "0 0.55rem", borderRadius: "0 16px 16px 0",
    border: muted ? "1px solid rgba(248,113,113,0.3)" : "1px solid rgba(255,255,255,0.1)",
    borderLeft: "1px solid rgba(255,255,255,0.05)",
    background: muted ? "rgba(248,113,113,0.07)" : "rgba(255,255,255,0.04)",
    color: "#55557a", cursor: "pointer", fontSize: "0.55rem",
    alignSelf: "stretch",
    transition: "all 0.15s",
  });

  const micCamGroup = (
    <>
      <div className="lr-ctrl-with-picker">
        <div className="lr-ctrl-split">
          <CtrlBtn icon={micOn ? "🎤" : "🔇"} label={micOn ? "Mute" : "Unmute"}
            active={micOn} muted={!micOn} pending={micPending}
            onClick={async () => { try { await toggleMic(); } catch(e) { console.error(e); } }}
            style={{ borderRadius: "14px 0 0 14px" }}
          />
          <button type="button" className="lr-chevron" data-muted={!micOn}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMoreOpen(false); setPicker(p => p === "audioinput" ? null : "audioinput"); }}
          >▴</button>
        </div>
        {picker === "audioinput" && <DevicePicker kind="audioinput" onClose={() => setPicker(null)} onSelectDevice={async () => { if (!micOn) { try { await toggleMic(); } catch(e){} } }} />}
      </div>
      <div className="lr-ctrl-with-picker">
        <div className="lr-ctrl-split">
          <CtrlBtn icon={camOn ? "📹" : "🚫"} label={camOn ? "Camera" : "No Cam"}
            active={camOn} muted={!camOn} pending={camPending}
            onClick={async () => { try { await toggleCam(); } catch(e) { console.error(e); } }}
            style={{ borderRadius: "14px 0 0 14px" }}
          />
          <button type="button" className="lr-chevron" data-muted={!camOn}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMoreOpen(false); setPicker(p => p === "videoinput" ? null : "videoinput"); }}
          >▴</button>
        </div>
        {picker === "videoinput" && <DevicePicker kind="videoinput" onClose={() => setPicker(null)} onSelectDevice={async () => { if (!camOn) { try { await toggleCam(); } catch(e){} } }} />}
      </div>
    </>
  );

  const reactBtn = (
    <div className="lr-ctrl-with-picker">
      <CtrlBtn icon="😀" label="React" active
        onClick={() => { setMoreOpen(false); setPicker(p => p === "emoji" ? null : "emoji"); }}
        iconBoxStyle={picker === "emoji" ? { border: "1px solid rgba(124,111,255,0.5)", background: "rgba(124,111,255,0.2)", color: "#a78bfa" } : {}}
      />
      {picker === "emoji" && !isMobile && (
        <EmojiPickerBar onPick={handleReactionPick} onClose={() => setPicker(null)} />
      )}
    </div>
  );

  const hostPeopleBtn = (userRole === "admin" || userRole === "trainer") && (
    <CtrlBtn icon="👥" label="People" active={!participantsOpen} onClick={() => { setPicker(null); setMoreOpen(false); onParticipantsToggle(); }}
      iconBoxStyle={participantsOpen ? { border: "1px solid rgba(124,111,255,0.5)", background: "rgba(124,111,255,0.2)", color: "#a78bfa" } : {}}
    />
  );

  const chatBtn = (
    <div className="lr-ctrl-with-picker" style={{ position: "relative" }}>
      <CtrlBtn icon="💬"
        label={unreadCount > 0 && !chatOpen ? `Chat (${unreadCount > 99 ? "99+" : unreadCount})` : "Chat"}
        active={!chatOpen} onClick={() => { setPicker(null); setMoreOpen(false); onChatToggle(); }}
        iconBoxStyle={chatOpen ? { border: "1px solid rgba(124,111,255,0.5)", background: "rgba(124,111,255,0.2)", color: "#a78bfa" }
          : unreadCount > 0 ? { border: "1px solid rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.1)", color: "#fca5a5", animation: "badgePulse 1.5s ease-in-out infinite" } : {}}
      />
      {unreadCount > 0 && !chatOpen && (
        <div className="lr-unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</div>
      )}
    </div>
  );

  const secondaryControls = (
    <>
      {canShare && (
        <CtrlBtn icon="🖥️" label={shareOn ? "Sharing" : "Share"} active={!shareOn} pending={sharePending}
          onClick={handleShare}
          iconBoxStyle={shareOn ? { border: "1px solid rgba(124,111,255,0.5)", background: "rgba(124,111,255,0.2)", color: "#a78bfa" } : {}}
        />
      )}
      <CtrlBtn
        icon={ncLoading ? "⏳" : ncOn ? "🎧" : "🎙️"}
        label={ncLoading ? "Loading…" : ncOn ? "Clear Audio" : "Normal Audio"}
        active={!ncOn} onClick={() => { setPicker(null); onNcToggle(); }}
        iconBoxStyle={ncOn ? { border: "1px solid rgba(168,85,247,0.5)", background: "rgba(168,85,247,0.15)", color: "#d8b4fe", boxShadow: "0 0 16px rgba(168,85,247,0.3)" } : {}}
      />
      <CtrlBtn
        icon={handRaised ? "✋" : "🖐️"} label={handRaised ? "Lower Hand" : "Raise Hand"}
        active={!handRaised} onClick={() => { setPicker(null); onHandToggle(); }}
        iconBoxStyle={handRaised ? { border: "1.5px solid rgba(251,191,36,0.7)", background: "rgba(251,191,36,0.18)", color: "#fde68a", boxShadow: "0 0 0 3px rgba(251,191,36,0.2)", animation: "handPulse 1.2s ease-in-out infinite" } : {}}
      />
    </>
  );

  if (isMobile) {
    return (
      <div ref={barRef} className="lr-controls-bar lr-controls-bar--mobile">
        {picker === "emoji" && (
          <>
            <div className="lr-mobile-backdrop" onClick={() => setPicker(null)} />
            <EmojiPickerBar mobile onPick={handleReactionPick} onClose={() => setPicker(null)} />
          </>
        )}
        {moreOpen && (
          <>
            <div className="lr-mobile-backdrop" onClick={() => setMoreOpen(false)} />
            <div className="lr-more-sheet">
              <div className="lr-sheet-handle-row">
                <span className="lr-sheet-title">More controls</span>
                <button type="button" className="lr-sheet-close" onClick={() => setMoreOpen(false)}>✕</button>
              </div>
              <div className="lr-more-sheet-grid">{secondaryControls}</div>
            </div>
          </>
        )}
        <div className="lr-ctrl-group lr-ctrl-group--primary">
          {micCamGroup}
          {reactBtn}
          {hostPeopleBtn}
          {chatBtn}
          <CtrlBtn icon="⋯" label="More" active={!moreOpen} onClick={() => { setPicker(null); setMoreOpen(v => !v); }}
            iconBoxStyle={moreOpen ? { border: "1px solid rgba(124,111,255,0.5)", background: "rgba(124,111,255,0.2)", color: "#a78bfa" } : {}}
          />
          <CtrlBtn icon="📞" label="Leave" danger onClick={handleLeave} />
        </div>
      </div>
    );
  }

  return (
    <div ref={barRef} className="lr-controls-bar">
      <div className="lr-ctrl-group">{micCamGroup}</div>
      <div className="lr-ctrl-divider" />
      <div className="lr-ctrl-group">
        {secondaryControls}
        {reactBtn}
      </div>
      <div className="lr-ctrl-divider" />
      <div className="lr-ctrl-group">
        {hostPeopleBtn}
        {chatBtn}
        <CtrlBtn icon="📞" label="Leave" danger onClick={handleLeave} />
      </div>
    </div>
  );
}


// ── Participants Panel ────────────────────────────────────────────────────────
function ParticipantsPanel({ sessionId, onKicked, onClose, overlay = false }) {
  const participants = useParticipants();
  const [busy, setBusy]           = useState({});
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
    <div className={`lr-participants-panel${overlay ? " lr-participants-panel--overlay" : ""}`}>
      {/* Header */}
      <div className="lr-panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1rem" }}>🛡️</span>
          <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#e2e8f0" }}>Participants</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span className="lr-count-badge">{participants.length}</span>
          <button type="button" onClick={onClose} className="lr-chat-close" style={{ marginLeft: "0.3rem" }}>✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
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
    </div>
  );
}

// ── Session Info Bar (full-width top bar) ────────────────────────────────────
function SessionInfoBar({ session }) {
  const participants = useParticipants();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const t = setInterval(() => setElapsed(e => e + 1), 1000); return () => clearInterval(t); }, []);
  const fmt = s => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60; return h > 0 ? `${h}:${String(m).padStart(2,"00")}:${String(sec).padStart(2,"00")}` : `${String(m).padStart(2,"00")}:${String(sec).padStart(2,"00")}`; };

  return (
    <div className="lr-topbar">
      {/* Left: LIVE badge + title */}
      <div className="lr-topbar-left">
        <div className="lr-live-badge">
          <div className="lr-live-dot" />
          <span>LIVE</span>
        </div>
        <span className="lr-session-title">{session?.title || "Live Session"}</span>
      </div>
      {/* Center: participant count */}
      <div className="lr-topbar-center">
        <div className="lr-stat-pill">
          <span style={{ fontSize: "0.9rem" }}>👥</span>
          <span>{participants.length} participant{participants.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
      {/* Right: timer */}
      <div className="lr-topbar-right">
        <div className="lr-stat-pill">
          <span style={{ fontSize: "0.85rem" }}>⏱</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(elapsed)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Custom Participant Wrapper ──────────────────────────────────────────────
function MyParticipantTile(props) {
  const { raisedHands, trackRef, className, style, ...rest } = props;
  const isHandRaised = trackRef?.participant && raisedHands.some(h => h.from === trackRef.participant.identity);

  return (
    <div
      className={className}
      style={{
        ...style,
        position: "relative", overflow: "hidden", borderRadius: "12px",
        // Glowing amber border when hand is raised
        ...(isHandRaised ? {
          outline: "3px solid rgba(251,191,36,0.85)",
          outlineOffset: "-3px",
          boxShadow: "0 0 0 4px rgba(251,191,36,0.25), 0 0 24px rgba(251,191,36,0.3)",
          animation: "handPulse 1.2s ease-in-out infinite",
        } : {}),
      }}
    >
      <ParticipantTile trackRef={trackRef} style={{ width: "100%", height: "100%" }} {...rest} />

      {isHandRaised && (
        <div style={{
          position: "absolute", top: 10, right: 10, zIndex: 50,
          display: "flex", alignItems: "center", gap: "0.35rem",
          background: "rgba(10,10,26,0.88)",
          backdropFilter: "blur(12px)",
          border: "1.5px solid rgba(251,191,36,0.7)",
          borderRadius: "40px",
          padding: "0.25rem 0.65rem 0.25rem 0.45rem",
          boxShadow: "0 4px 16px rgba(0,0,0,0.6), 0 0 12px rgba(251,191,36,0.35)",
        }}>
          <span style={{ fontSize: "1.1rem", animation: "waveHand 1.2s ease-in-out infinite", display: "inline-block" }}>✋</span>
          <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#fde68a", letterSpacing: "0.02em" }}>Hand Raised</span>
        </div>
      )}
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
      <MyParticipantTile raisedHands={raisedHands} />
    </GridLayout>
  );
}

// ── Inner Room ────────────────────────────────────────────────────────────────
function InnerRoom({ sessionId, userRole, onLeave, session }) {
  const isMobile = useIsMobile();
  const isHost = userRole === "admin" || userRole === "trainer";
  const [chatOpen,         setChatOpen]         = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 641px)").matches && (userRole === "admin" || userRole === "trainer");
  });
  const [unreadCount,      setUnreadCount]      = useState(0);
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

  const dismissHand    = (from) => setRaisedHands(prev => prev.filter(h => h.from !== from));
  const dismissAllHands = ()     => setRaisedHands([]);

  return (
    <div className="lr-shell">
      <RoomAudioRenderer />

      {/* Top bar */}
      <SessionInfoBar session={session} />

      {/* Hand raise queue — centered below top bar */}
      {(userRole === "admin" || userRole === "trainer") && (
        <HandRaiseQueue raisedHands={raisedHands} onDismiss={dismissHand} onDismissAll={dismissAllHands} />
      )}

      {/* Floating emoji reactions */}
      <FloatingReactions reactions={reactions} />

      {/* Main area: participants sidebar + video + chat sidebar */}
      <div className="lr-main">

        {/* Host participants panel — sidebar on desktop, full overlay on mobile */}
        {isHost && participantsOpen && (
          <>
            {isMobile && <div className="lr-mobile-backdrop" onClick={() => setParticipantsOpen(false)} />}
            <ParticipantsPanel
              sessionId={sessionId}
              onClose={() => setParticipantsOpen(false)}
              overlay={isMobile}
            />
          </>
        )}

        {/* Video grid — fills remaining space */}
        <div className="lr-video-area">
          <VideoGrid raisedHands={raisedHands} />
        </div>

        {/* Chat sidebar — slides in from right */}
        {chatOpen && (
          <div className="lr-chat-sidebar">
            <div className="lr-chat-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#e2e8f0" }}>Session Chat</span>
              </div>
              <button type="button" onClick={() => setChatOpen(false)} className="lr-chat-close">✕</button>
            </div>
            <div className="lr-chat-body live-room-chat">
              <LiveChat sessionId={sessionId} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom control bar */}
      <CustomControls
        userRole={userRole}
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
        participantsOpen={participantsOpen}
        onParticipantsToggle={() => setParticipantsOpen(v => !v)}
        isMobile={isMobile}
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
    <LiveKitRoom token={token} serverUrl={lkUrl} connect={true} video={true} audio={true} onDisconnected={() => console.warn("LiveKit disconnected")} style={{ height: "100vh", width: "100vw" }}>
      <InnerRoom sessionId={sessionId} userRole={userRole} onLeave={onLeave} session={session} />
    </LiveKitRoom>
  );
}
