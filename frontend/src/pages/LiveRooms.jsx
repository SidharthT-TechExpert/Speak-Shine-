import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import api from "../api/client.js";

export default function LiveRooms() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'live' | 'scheduled' | 'ended'

  const isTrainerOrAdmin = ["trainer", "admin", "admins"].includes(user?.role);

  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await api.get("/live-sessions");
      setSessions(res.data || []);
    } catch (err) {
      console.error("Failed to load live sessions:", err);
      if (!silent) {
        setError(err.response?.data?.error || "Could not load live sessions.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    // Auto-refresh every 15 seconds to catch newly started live sessions
    const timer = setInterval(() => fetchSessions(true), 15000);
    return () => clearInterval(timer);
  }, [fetchSessions]);

  const liveSessions = sessions.filter(s => s.status === "live");
  const scheduledSessions = sessions.filter(s => s.status === "scheduled");
  const endedSessions = sessions.filter(s => s.status === "ended");

  const filteredSessions = sessions.filter(s => {
    if (activeTab === "live") return s.status === "live";
    if (activeTab === "scheduled") return s.status === "scheduled";
    if (activeTab === "ended") return s.status === "ended";
    return true; // 'all'
  });

  const formatSessionTime = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const getTimeUntil = (dateStr) => {
    if (!dateStr) return "";
    const diff = new Date(dateStr) - new Date();
    if (diff <= 0) return "Starting shortly";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `In ${days} day${days > 1 ? "s" : ""}`;
    }
    if (hours > 0) return `In ~${hours}h ${mins}m`;
    return `In ~${mins} mins`;
  };

  return (
    <div className="live-rooms-page">
      {/* ── Top Hero Showcase ── */}
      <div className="live-rooms-hero">
        <div className="live-rooms-hero-content">
          <div className="live-badge-pill">
            <span className="live-badge-dot" />
            <span>INTERACTIVE AUDIO &amp; VIDEO</span>
          </div>
          <h1 className="live-rooms-title">
            Live Practice Rooms
          </h1>
          <p className="live-rooms-subtitle">
            Step onto the virtual stage. Engage in real-time speech drills, cohort roundtables,
            and trainer-led coaching rooms with low-latency WebRTC streaming.
          </p>

          <div className="live-rooms-kpi-row">
            <div className="live-kpi-chip">
              <span className="live-kpi-val" style={{ color: liveSessions.length > 0 ? "#22c55e" : "#94a3b8" }}>
                {liveSessions.length}
              </span>
              <span className="live-kpi-lbl">Active Live Now</span>
            </div>
            <div className="live-kpi-chip">
              <span className="live-kpi-val" style={{ color: "#7c6fff" }}>
                {scheduledSessions.length}
              </span>
              <span className="live-kpi-lbl">Upcoming Scheduled</span>
            </div>
            <div className="live-kpi-chip">
              <span className="live-kpi-val" style={{ color: "#38bdf8" }}>
                HD
              </span>
              <span className="live-kpi-lbl">LiveKit Audio/Video</span>
            </div>
          </div>
        </div>

        <div className="live-rooms-hero-actions">
          <button
            onClick={() => fetchSessions(true)}
            disabled={refreshing}
            className="live-refresh-btn"
            title="Refresh room status"
          >
            <span className={refreshing ? "spin" : ""}>🔄</span>
            <span>{refreshing ? "Refreshing…" : "Sync Status"}</span>
          </button>

          {isTrainerOrAdmin && (
            <Link
              to={user?.role === "trainer" ? "/trainer" : "/admin"}
              className="live-host-btn"
            >
              <span>🎙️ Host / Manage Rooms</span>
            </Link>
          )}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="live-error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => fetchSessions()}>Retry</button>
        </div>
      )}

      {/* ── Active Live Sessions (Priority Spotlight) ── */}
      {liveSessions.length > 0 && (
        <section className="live-section">
          <div className="live-section-header">
            <div className="live-section-title-wrap">
              <div className="live-pulse-indicator" />
              <h2 className="live-section-title">Happening Right Now</h2>
            </div>
            <span className="live-count-badge">
              {liveSessions.length} Room{liveSessions.length !== 1 ? "s" : ""} Online
            </span>
          </div>

          <div className="live-cards-grid">
            {liveSessions.map((session) => (
              <div key={session._id} className="live-card live-card-active">
                <div className="live-card-top">
                  <div className="live-card-badge-live">
                    <span className="live-red-dot" />
                    LIVE NOW
                  </div>
                  <div className="live-card-participants">
                    <span>👥</span>
                    <span>
                      {session.participants?.length || 0}
                      {session.maxParticipants ? ` / ${session.maxParticipants}` : ""} in room
                    </span>
                  </div>
                </div>

                <h3 className="live-card-title">{session.title}</h3>
                {session.description && (
                  <p className="live-card-desc">{session.description}</p>
                )}

                <div className="live-card-meta">
                  <div className="live-meta-item">
                    <span>Host:</span>
                    <strong>{session.createdBy || "Trainer"}</strong>
                  </div>
                  {session.startedAt && (
                    <div className="live-meta-item">
                      <span>Started:</span>
                      <strong>{formatSessionTime(session.startedAt)}</strong>
                    </div>
                  )}
                </div>

                <button
                  className="live-join-btn"
                  onClick={() => navigate(`/live/${session._id}`)}
                >
                  <span>🚀 Enter Live Room</span>
                  <span>→</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Filter Tabs & Listing ── */}
      <section className="live-section" style={{ marginTop: "2rem" }}>
        <div className="live-section-header">
          <h2 className="live-section-title">Session Directory</h2>

          <div className="live-tabs-group">
            <button
              className={`live-tab-btn ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All ({sessions.length})
            </button>
            <button
              className={`live-tab-btn ${activeTab === "live" ? "active" : ""}`}
              onClick={() => setActiveTab("live")}
            >
              Live ({liveSessions.length})
            </button>
            <button
              className={`live-tab-btn ${activeTab === "scheduled" ? "active" : ""}`}
              onClick={() => setActiveTab("scheduled")}
            >
              Scheduled ({scheduledSessions.length})
            </button>
            <button
              className={`live-tab-btn ${activeTab === "ended" ? "active" : ""}`}
              onClick={() => setActiveTab("ended")}
            >
              Past ({endedSessions.length})
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="live-loading-wrap">
            <div className="spinner" />
            <p>Scanning live rooms &amp; scheduled workshops…</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          /* Empty State */
          <div className="live-empty-card">
            <div className="live-empty-icon">📡</div>
            <h3 className="live-empty-title">
              {activeTab === "live"
                ? "No Live Rooms Running Right Now"
                : activeTab === "scheduled"
                ? "No Upcoming Sessions Scheduled"
                : activeTab === "ended"
                ? "No Past Sessions Recorded"
                : "No Live Sessions Found"}
            </h3>
            <p className="live-empty-desc">
              {liveSessions.length === 0
                ? "Our trainers regularly host interactive group rooms, mock speeches, and live speech reviews. Check back soon or practice with your daily mission!"
                : "Try selecting a different filter tab above to view other sessions."}
            </p>
            <div className="live-empty-actions">
              <Link to="/dashboard" className="live-btn-outline">
                ⏱ Go to Dashboard
              </Link>
              <Link to="/record" className="live-btn-primary">
                📹 Record Video Mission
              </Link>
            </div>
          </div>
        ) : (
          <div className="live-cards-grid">
            {filteredSessions.map((session) => {
              const isLive = session.status === "live";
              const isScheduled = session.status === "scheduled";
              const isEnded = session.status === "ended";

              return (
                <div
                  key={session._id}
                  className={`live-card ${
                    isLive
                      ? "live-card-active"
                      : isScheduled
                      ? "live-card-scheduled"
                      : "live-card-ended"
                  }`}
                >
                  <div className="live-card-top">
                    {isLive ? (
                      <span className="live-card-badge-live">
                        <span className="live-red-dot" />
                        LIVE NOW
                      </span>
                    ) : isScheduled ? (
                      <span className="live-card-badge-scheduled">
                        ⏳ {getTimeUntil(session.scheduledAt)}
                      </span>
                    ) : (
                      <span className="live-card-badge-ended">
                        ✓ Concluded
                      </span>
                    )}

                    <div className="live-card-participants">
                      <span>👥</span>
                      <span>
                        {session.participants?.length || 0}
                        {session.maxParticipants ? ` / ${session.maxParticipants}` : ""} max
                      </span>
                    </div>
                  </div>

                  <h3 className="live-card-title">{session.title}</h3>
                  {session.description && (
                    <p className="live-card-desc">{session.description}</p>
                  )}

                  <div className="live-card-meta">
                    <div className="live-meta-item">
                      <span>📅 Time:</span>
                      <strong>{formatSessionTime(session.scheduledAt || session.startedAt)}</strong>
                    </div>
                    <div className="live-meta-item">
                      <span>🎙️ Host:</span>
                      <strong>{session.createdBy || "Trainer"}</strong>
                    </div>
                  </div>

                  <div className="live-card-footer">
                    {isLive ? (
                      <button
                        className="live-join-btn"
                        onClick={() => navigate(`/live/${session._id}`)}
                      >
                        🚀 Enter Room
                      </button>
                    ) : isScheduled ? (
                      <div className="live-scheduled-hint">
                        <span>🔔 Opens at scheduled time</span>
                      </div>
                    ) : (
                      <div className="live-ended-hint">
                        <span>Session finished</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Helpful Guidelines ── */}
      <section className="live-guidelines-section">
        <h3 className="live-guidelines-title">Tips for Interactive Practice Rooms</h3>
        <div className="live-guidelines-grid">
          <div className="live-tip-card">
            <div className="live-tip-icon">🎧</div>
            <h4>Headphones Recommended</h4>
            <p>Use headphones or earphones to prevent audio feedback and enable clear two-way conversations.</p>
          </div>
          <div className="live-tip-card">
            <div className="live-tip-icon">📹</div>
            <h4>Camera Confidence</h4>
            <p>Keep your video feed enabled during speaking turns to build authentic eye contact and stage presence.</p>
          </div>
          <div className="live-tip-card">
            <div className="live-tip-icon">🤝</div>
            <h4>Cohort Collaboration</h4>
            <p>Encourage fellow speakers with positive chat reactions and constructive feedback.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
