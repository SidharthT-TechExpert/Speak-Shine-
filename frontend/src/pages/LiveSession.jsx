import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Layout from "../components/Layout.jsx";
import LiveRoom from "../components/LiveRoom.jsx";
import api from "../api/client.js";

export default function LiveSession() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inRoom, setInRoom] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    // Bypass fetch for local testing
    setSession({ id: id, title: "Test Session", status: "live", participants: [] });
    setHasJoined(true);
    setInRoom(true);
    setLoading(false);
  }, [id, user?.phone]);

  const handleJoin = () => {
    setInRoom(true);
    setHasJoined(true);
  };
  
  const handleLeave = () => { 
    setInRoom(false); 
    navigate("/dashboard"); 
  };

  if (loading) return (
    <Layout title="Live Session">
      <div className="spinner-wrap"><div className="spinner" /><p style={{ color: "var(--muted)" }}>Loading…</p></div>
    </Layout>
  );

  if (error) return (
    <Layout title="Live Session">
      <div className="error-box">
        <p>{error}</p>
        <button className="btn-secondary" onClick={() => navigate("/dashboard")} style={{ marginTop: "0.75rem" }}>← Back to Dashboard</button>
      </div>
    </Layout>
  );

  if (!inRoom) {
    return (
      <Layout title="Live Session">
        <div style={{
          minHeight: "calc(100vh - 60px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1rem",
        }}>
          <div className="card" style={{ maxWidth: 460, width: "100%", textAlign: "center", padding: "2.5rem 2rem" }}>
            {/* Live badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "0.4rem",
              background: "rgba(248,113,113,0.12)",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 20, padding: "0.3rem 0.85rem",
              marginBottom: "1.25rem",
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#f87171",
                animation: "speakDot 1s ease-in-out infinite alternate",
              }} />
              <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#f87171", letterSpacing: "0.06em" }}>
                LIVE NOW
              </span>
            </div>

            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎥</div>
            <h2 style={{ marginBottom: "0.5rem", fontSize: "1.3rem" }}>{session.title}</h2>
            {session.description && (
              <p style={{ color: "var(--muted)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
                {session.description}
              </p>
            )}

            {/* Participant count */}
            {session.participants?.length > 0 && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                background: "rgba(124,111,255,0.1)",
                border: "1px solid rgba(124,111,255,0.2)",
                borderRadius: 20, padding: "0.3rem 0.85rem",
                marginBottom: "1.5rem",
                fontSize: "0.82rem", color: "#a78bfa",
              }}>
                <span>👥</span>
                <span>
                  {session.participants.length} participant{session.participants.length !== 1 ? "s" : ""} inside
                </span>
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleJoin}
              style={{ width: "100%", fontSize: "1rem", padding: "0.9rem", borderRadius: 12 }}
            >
              🚀 Join Now
            </button>

            <button
              onClick={() => navigate("/dashboard")}
              style={{
                marginTop: "0.75rem", width: "100%",
                background: "none", border: "none",
                color: "var(--muted)", fontSize: "0.85rem",
                cursor: "pointer", padding: "0.5rem",
              }}
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // When in room — render full-screen with NO Layout wrapper
  if (inRoom) {
    return (
      <LiveRoom
        sessionId={id}
        userRole={user.role}
        onLeave={handleLeave}
        onSessionEnded={handleLeave}
      />
    );
  }
}
