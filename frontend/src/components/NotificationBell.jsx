import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getSharedSocket } from "../hooks/useSocket.js";

/**
 * NotificationBell
 * Shows a bell icon with an unread-count badge in the navbar.
 * Clicking opens a dropdown listing recent notifications.
 * Real-time delivery via socket; persisted in DB for offline users.
 */
export default function NotificationBell() {
  const { token } = useAuth();
  const navigate  = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [open,          setOpen]          = useState(false);
  const [loading,       setLoading]       = useState(false);

  const panelRef = useRef(null);

  // ── Fetch on mount ──────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount   || 0);
    } catch {
      // Non-critical — silently ignore
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Real-time socket listener ───────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const socket = getSharedSocket(token);

    const onNew = (notification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 30));
      setUnreadCount((c) => c + 1);
    };

    socket.on("notification:new", onNew);
    return () => socket.off("notification:new", onNew);
  }, [token]);

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Mark all read ───────────────────────────────────────────────────────────
  const markAllRead = async () => {
    if (!token || unreadCount === 0) return;
    try {
      await fetch("/api/notifications/read", {
        method:  "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      // Remove all notifications from the list immediately after marking read
      setNotifications([]);
      setUnreadCount(0);
    } catch {}
  };

  // ── Mark one read & navigate ────────────────────────────────────────────────
  const handleClick = async (notif) => {
    setOpen(false);
    // Remove from list immediately
    setNotifications((prev) => prev.filter((n) => n._id !== notif._id));
    setUnreadCount((c) => Math.max(0, notif.read ? c : c - 1));

    if (!notif.read) {
      try {
        await fetch(`/api/notifications/${notif._id}/read`, {
          method:  "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    if (notif.url) {
      navigate(notif.url);
    } else if (notif.reportId) {
      navigate(`/community?highlight=${notif.reportId}`);
    } else {
      navigate("/community");
    }
  };

  // ── Open bell: show notifications, then mark all read after 2s ─────────────
  const togglePanel = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      // Mark all read after 2 seconds (user has seen them)
      setTimeout(() => markAllRead(), 2000);
    }
  };

  // ── Relative time helper ────────────────────────────────────────────────────
  const relativeTime = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1)  return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const typeIcon = (type) => {
    if (type === "like")    return "❤️";
    if (type === "mention") return "📣";
    return "💬"; // default: comment
  };

  if (!token) return null;

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      {/* ── Bell button ── */}
      <button
        id="notification-bell-btn"
        onClick={togglePanel}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        style={{
          position:        "relative",
          background:      open
            ? "rgba(124,111,255,0.15)"
            : "rgba(255,255,255,0.06)",
          border:          open
            ? "1px solid rgba(124,111,255,0.4)"
            : "1px solid rgba(255,255,255,0.1)",
          borderRadius:    10,
          width:           36,
          height:          36,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          cursor:          "pointer",
          transition:      "all 0.2s",
          flexShrink:      0,
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "rgba(124,111,255,0.1)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
      >
        {/* Bell SVG */}
        <svg
          width="17" height="17" viewBox="0 0 24 24"
          fill="none" stroke={open ? "#a78bfa" : "#aaaacc"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          {unreadCount > 0 && (
            <circle cx="18" cy="5" r="4" fill="#ef4444" stroke="none" />
          )}
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span style={{
            position:     "absolute",
            top:          -4,
            right:        -4,
            background:   "linear-gradient(135deg, #ef4444, #dc2626)",
            color:        "#fff",
            borderRadius: "50%",
            minWidth:     17,
            height:       17,
            fontSize:     "0.65rem",
            fontWeight:   800,
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            padding:      "0 3px",
            boxShadow:    "0 0 0 2px #0d0d1a",
            animation:    "notif-pop 0.3s cubic-bezier(.34,1.56,.64,1)",
            pointerEvents: "none",
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <>
          <style>{`
            @keyframes notif-pop {
              0%   { transform: scale(0.5); opacity: 0; }
              100% { transform: scale(1);   opacity: 1; }
            }
            @keyframes notif-slide-in {
              0%   { opacity: 0; transform: translateY(-8px) scale(0.97); }
              100% { opacity: 1; transform: translateY(0)   scale(1); }
            }
            .notif-item:hover {
              background: rgba(124,111,255,0.08) !important;
            }
            .notif-mark-all:hover {
              color: #c4b5fd !important;
            }
          `}</style>

          <div style={{
            position:        "absolute",
            top:             "calc(100% + 10px)",
            right:           0,
            width:           320,
            maxHeight:       420,
            background:      "linear-gradient(145deg, #0f0f23 0%, #161630 100%)",
            border:          "1px solid rgba(124,111,255,0.25)",
            borderRadius:    16,
            boxShadow:       "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset",
            display:         "flex",
            flexDirection:   "column",
            overflow:        "hidden",
            zIndex:          9999,
            animation:       "notif-slide-in 0.2s ease",
          }}>
            {/* Header */}
            <div style={{
              padding:        "0.9rem 1rem 0.75rem",
              borderBottom:   "1px solid rgba(255,255,255,0.06)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              flexShrink:     0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span style={{ fontWeight: 700, color: "#e8e8ff", fontSize: "0.875rem" }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span style={{
                    background:   "rgba(124,111,255,0.2)",
                    color:        "#a78bfa",
                    borderRadius: 20,
                    padding:      "1px 7px",
                    fontSize:     "0.7rem",
                    fontWeight:   700,
                  }}>
                    {unreadCount} new
                  </span>
                )}
              </div>

              {notifications.some((n) => !n.read) && (
                <button
                  className="notif-mark-all"
                  onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                  style={{
                    background: "none",
                    border:     "none",
                    color:      "#7777aa",
                    fontSize:   "0.72rem",
                    cursor:     "pointer",
                    padding:    "2px 4px",
                    transition: "color 0.15s",
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Body */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {loading && notifications.length === 0 ? (
                <div style={{
                  padding:    "2rem",
                  textAlign:  "center",
                  color:      "#555577",
                  fontSize:   "0.82rem",
                }}>
                  Loading…
                </div>
              ) : notifications.length === 0 ? (
                <div style={{
                  padding:       "2.5rem 1rem",
                  textAlign:     "center",
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    "center",
                  gap:           "0.5rem",
                }}>
                  <span style={{ fontSize: "1.8rem" }}>🔕</span>
                  <span style={{ color: "#555577", fontSize: "0.82rem" }}>
                    No notifications yet
                  </span>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif._id}
                    className="notif-item"
                    onClick={() => handleClick(notif)}
                    style={{
                      padding:        "0.75rem 1rem",
                      borderBottom:   "1px solid rgba(255,255,255,0.04)",
                      cursor:         "pointer",
                      display:        "flex",
                      gap:            "0.65rem",
                      alignItems:     "flex-start",
                      background:     notif.read
                        ? "transparent"
                        : "rgba(124,111,255,0.05)",
                      transition:     "background 0.15s",
                    }}
                  >
                    {/* Icon */}
                    <div style={{
                      width:           32,
                      height:          32,
                      borderRadius:    "50%",
                      background:      "rgba(124,111,255,0.12)",
                      display:         "flex",
                      alignItems:      "center",
                      justifyContent:  "center",
                      fontSize:        "0.9rem",
                      flexShrink:      0,
                      marginTop:       "1px",
                    }}>
                      {typeIcon(notif.type)}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color:        notif.read ? "#9999bb" : "#d4d4f0",
                        fontSize:     "0.8rem",
                        lineHeight:   1.45,
                        marginBottom: "0.2rem",
                        fontWeight:   notif.read ? 400 : 500,
                      }}>
                        {notif.message}
                      </div>
                      <div style={{
                        color:    "#555577",
                        fontSize: "0.7rem",
                      }}>
                        {relativeTime(notif.createdAt)}
                        {notif.reportId && (
                          <span style={{ color: "#7c6fff", marginLeft: "0.4rem" }}>→ View video</span>
                        )}
                      </div>
                    </div>

                    {/* Unread dot */}
                    {!notif.read && (
                      <div style={{
                        width:        7,
                        height:       7,
                        borderRadius: "50%",
                        background:   "#7c6fff",
                        flexShrink:   0,
                        marginTop:    6,
                        boxShadow:    "0 0 6px rgba(124,111,255,0.6)",
                      }} />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div style={{
                padding:      "0.6rem 1rem",
                borderTop:    "1px solid rgba(255,255,255,0.06)",
                textAlign:    "center",
                fontSize:     "0.7rem",
                color:        "#444466",
                flexShrink:   0,
              }}>
                Showing last {notifications.length} notifications
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
