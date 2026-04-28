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
  const [error, setError]     = useState(null);
  const [inRoom, setInRoom]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/live-sessions/${id}`);
        setSession(res.data);
        if (res.data.status !== "live") setError("Session is not live");
      } catch (e) {
        setError(e.response?.data?.error || "Failed to load session");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleJoin = () => setInRoom(true);
  const handleLeave = () => { setInRoom(false); navigate("/dashboard"); };

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
          <button className="btn-primary" onClick={handleJoin} style={{ width: "100%", fontSize: "1.05rem", padding: "1rem" }}>
            🚀 Join Now
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={session.title}>
      <div className="card" style={{ padding: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>{session.title}</h3>
          <button className="btn-danger" onClick={handleLeave} style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}>
            🚪 Leave
          </button>
        </div>
        <LiveRoom
          sessionId={id}
          userRole={user.role}
          onLeave={handleLeave}
          onSessionEnded={handleLeave}
        />
      </div>
    </Layout>
  );
}
