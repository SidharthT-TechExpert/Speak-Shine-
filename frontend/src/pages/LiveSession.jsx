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
    (async () => {
      try {
        const res = await api.get(`/live-sessions/${id}`);
        setSession(res.data);
        if (res.data.status !== "live") {
          setError("Session is not live");
        } else {
          // Check if user has already joined this session
          const userPhone = user?.phone;
          if (userPhone && res.data.participants?.includes(userPhone)) {
            setHasJoined(true);
          }
        }
      } catch (e) {
        setError(e.response?.data?.error || "Failed to load session");
      } finally {
        setLoading(false);
      }
    })();
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
        <div className="card" style={{ maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🎥</div>
          <h2 style={{ marginBottom: "0.5rem" }}>{session.title}</h2>
          {session.description && <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>{session.description}</p>}
          
          {/* Show participant count */}
          {session.participants?.length > 0 && (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              gap: "0.5rem", 
              marginBottom: "1rem",
              color: "var(--muted)",
              fontSize: "0.9rem"
            }}>
              <span>👥</span>
              <span>{session.participants.length} participant{session.participants.length !== 1 ? 's' : ''} joined</span>
            </div>
          )}

          {/* Show different UI based on join status */}
          {hasJoined ? (
            <div>
              <div style={{ 
                background: "rgba(74,222,128,0.1)", 
                border: "1px solid rgba(74,222,128,0.3)",
                borderRadius: "12px",
                padding: "1rem",
                marginBottom: "1rem",
                color: "#4ade80"
              }}>
                <div style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>✅ You're already in this session</div>
                <div style={{ fontSize: "0.9rem", opacity: 0.8 }}>Click below to rejoin the room</div>
              </div>
              <button 
                className="btn-primary" 
                onClick={handleJoin} 
                style={{ width: "100%", fontSize: "1.05rem", padding: "1rem" }}
              >
                🔄 Rejoin Session
              </button>
            </div>
          ) : (
            <button 
              className="btn-primary" 
              onClick={handleJoin} 
              style={{ width: "100%", fontSize: "1.05rem", padding: "1rem" }}
            >
              🚀 Join Now
            </button>
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={session.title}>
      <LiveRoom
        sessionId={id}
        userRole={user.role}
        onLeave={handleLeave}
        onSessionEnded={handleLeave}
      />
    </Layout>
  );
}
