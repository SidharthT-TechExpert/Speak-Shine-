import { useEffect, useState, useCallback } from "react";
import {
  LiveKitRoom,
  VideoConference,
  useRoomContext,
  useParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";

// ── Admin controls panel shown inside the room ───────────────────────────────
function AdminControls({ sessionId }) {
  const participants = useParticipants();
  const [busy, setBusy] = useState({});
  const toast = useToast();

  const action = async (type, identity) => {
    setBusy(b => ({ ...b, [identity]: true }));
    try {
      await api.post(`/live-sessions/${sessionId}/${type}/${encodeURIComponent(identity)}`);
    } catch (e) {
      toast(e.response?.data?.error || `${type} failed`, "error");
    } finally {
      setBusy(b => ({ ...b, [identity]: false }));
    }
  };

  return (
    <div style={{
      position: "fixed", top: 70, right: 12, zIndex: 1000,
      background: "#13132a", border: "1px solid rgba(124,111,255,0.3)",
      borderRadius: 14, padding: "1rem", width: 240,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      maxHeight: "70vh", overflowY: "auto",
    }}>
      <div style={{ fontWeight: 700, color: "#fff", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
        🛡️ Participants ({participants.length})
      </div>
      {participants.map(p => (
        <div key={p.identity} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.5rem 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
          gap: "0.4rem",
        }}>
          <span style={{ fontSize: "0.78rem", color: "#c4c4e0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.name || p.identity}
          </span>
          <button
            onClick={() => action("mute", p.identity)}
            disabled={busy[p.identity]}
            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: 6, border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.1)", color: "#fbbf24", cursor: "pointer" }}
          >🔇</button>
          <button
            onClick={() => action("remove", p.identity)}
            disabled={busy[p.identity]}
            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: 6, border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.1)", color: "#f87171", cursor: "pointer" }}
          >✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Main LiveRoom component ──────────────────────────────────────────────────
export default function LiveRoom({ sessionId, userRole, onLeave, onSessionEnded }) {
  const [token, setToken]       = useState(null);
  const [livekitUrl, setUrl]    = useState(null);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.post(`/live-sessions/${sessionId}/token`);
        setToken(res.data.token);
        setUrl(res.data.livekitUrl || import.meta.env.VITE_LIVEKIT_URL);
      } catch (e) {
        setError(e.response?.data?.error || "Failed to join session");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: "1rem" }}>
      <div className="spinner" />
      <p style={{ color: "var(--muted)" }}>Joining session…</p>
    </div>
  );

  if (error) return (
    <div className="error-box">
      <p>{error}</p>
      <button className="btn-secondary" onClick={onLeave} style={{ marginTop: "0.75rem" }}>← Back</button>
    </div>
  );

  return (
    <div style={{ position: "relative", height: "calc(100vh - 120px)", minHeight: 400 }}>
      <LiveKitRoom
        token={token}
        serverUrl={livekitUrl}
        connect={true}
        video={true}
        audio={true}
        onDisconnected={onLeave}
        style={{ height: "100%" }}
      >
        <VideoConference />
        {userRole === "admin" && <AdminControls sessionId={sessionId} />}
      </LiveKitRoom>
    </div>
  );
}
