import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getSharedSocket } from "../hooks/useSocket.js";

/**
 * NotificationBell - Fully Responsive Mobile-First Design
 * Shows a bell icon with an unread-count badge in the navbar.
 * Clicking opens a dropdown (desktop) or bottom sheet (mobile).
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

  // ── Close on outside click (desktop only) ───────────────────────────────────
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
      setNotifications([]);
      setUnreadCount(0);
    } catch {}
  };

  // ── Mark one read & navigate ────────────────────────────────────────────────
  const handleClick = async (notif) => {
    setOpen(false);
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
    return "💬";
  };

  if (!token) return null;

  return (
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
        @keyframes notif-slide-up {
          0%   { opacity: 0; transform: translateY(100%); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .notif-item:hover {
          background: rgba(124,111,255,0.08) !important;
        }
        .notif-item:active {
          transform: scale(0.98);
        }
        .notif-mark-all:hover {
          color: #c4b5fd !important;
        }
        .notif-mark-all:active {
          transform: scale(0.95);
        }
        
        /* Mobile bottom sheet */
        @media (max-width: 640px) {
          .notif-panel-mobile {
            position: fixed !important;
            top: auto !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            max-height: 85vh !important;
            border-radius: 24px 24px 0 0 !important;
            animation: notif-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
        }
        
        /* Smooth scrolling */
        .notif-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(124,111,255,0.3) transparent;
        }
        .notif-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .notif-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .notif-scroll::-webkit-scrollbar-thumb {
          background: rgba(124,111,255,0.3);
          border-radius: 3px;
        }
      `}</style>

      <div ref={panelRef} style={{ position: "relative" }}>
        {/* ── Bell button - Larger touch target for mobile ── */}
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
            width:           44,  // Larger for mobile
            height:          44,  // Larger for mobile
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
          {/* Bell SVG - Larger for mobile */}
          <svg
            width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke={open ? "#a78bfa" : "#aaaacc"}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            {unreadCount > 0 && (
              <circle cx="18" cy="5" r="4" fill="#ef4444" stroke="none" />
            )}
          </svg>

          {/* Badge - Larger for mobile */}
          {unreadCount > 0 && (
            <span style={{
              position:     "absolute",
              top:          -2,
              right:        -2,
              background:   "linear-gradient(135deg, #ef4444, #dc2626)",
              color:        "#fff",
              borderRadius: "50%",
              minWidth:     20,
              height:       20,
              fontSize:     "0.7rem",
              fontWeight:   800,
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              padding:      "0 4px",
              boxShadow:    "0 0 0 2px #0d0d1a, 0 2px 8px rgba(239,68,68,0.4)",
              animation:    "notif-pop 0.3s cubic-bezier(.34,1.56,.64,1)",
              pointerEvents: "none",
            }}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* ── Backdrop for mobile ── */}
        {open && (
          <div 
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 9998,
              display: window.innerWidth <= 640 ? "block" : "none",
            }}
          />
        )}

        {/* ── Dropdown panel / Bottom sheet ── */}
        {open && (
          <div 
            className="notif-panel-mobile"
            style={{
              position:        "absolute",
              top:             "calc(100% + 10px)",
              right:           0,
              width:           Math.min(380, window.innerWidth - 32),
              maxHeight:       window.innerWidth <= 640 ? "85vh" : "520px",
              background:      "linear-gradient(145deg, #0f0f23 0%, #161630 100%)",
              border:          "1px solid rgba(124,111,255,0.25)",
              borderRadius:    16,
              boxShadow:       "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset",
              display:         "flex",
              flexDirection:   "column",
              overflow:        "hidden",
              zIndex:          9999,
              animation:       window.innerWidth <= 640 ? "notif-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)" : "notif-slide-in 0.2s ease",
            }}
          >
            {/* Mobile drag handle */}
            {window.innerWidth <= 640 && (
              <div style={{
                padding: "12px 0 8px",
                display: "flex",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <div style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.2)",
                }} />
              </div>
            )}

            {/* Header - Larger text for mobile */}
            <div style={{
              padding:        window.innerWidth <= 640 ? "1rem 1.25rem 0.85rem" : "0.9rem 1rem 0.75rem",
              borderBottom:   "1px solid rgba(255,255,255,0.06)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              flexShrink:     0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <svg width={window.innerWidth <= 640 ? 18 : 15} height={window.innerWidth <= 640 ? 18 : 15} viewBox="0 0 24 24" fill="none"
                  stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span style={{ 
                  fontWeight: 700, 
                  color: "#e8e8ff", 
                  fontSize: window.innerWidth <= 640 ? "1rem" : "0.875rem"
                }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span style={{
                    background:   "rgba(124,111,255,0.2)",
                    color:        "#a78bfa",
                    borderRadius: 20,
                    padding:      window.innerWidth <= 640 ? "2px 9px" : "1px 7px",
                    fontSize:     window.innerWidth <= 640 ? "0.75rem" : "0.7rem",
                    fontWeight:   700,
                  }}>
                    {unreadCount} new
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {notifications.some((n) => !n.read) && (
                  <button
                    className="notif-mark-all"
                    onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                    style={{
                      background: "none",
                      border:     "none",
                      color:      "#7777aa",
                      fontSize:   window.innerWidth <= 640 ? "0.8rem" : "0.72rem",
                      cursor:     "pointer",
                      padding:    window.innerWidth <= 640 ? "6px 8px" : "2px 4px",
                      transition: "all 0.15s",
                      borderRadius: 6,
                    }}
                  >
                    Mark all read
                  </button>
                )}
                
                {/* Close button for mobile */}
                {window.innerWidth <= 640 && (
                  <button
                    onClick={() => setOpen(false)}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "none",
                      borderRadius: 8,
                      width: 32,
                      height: 32,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: "#7777aa",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Body - Scrollable with larger touch targets */}
            <div className="notif-scroll" style={{ overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" }}>
              {loading && notifications.length === 0 ? (
                <div style={{
                  padding:    window.innerWidth <= 640 ? "3rem 1.5rem" : "2rem",
                  textAlign:  "center",
                  color:      "#555577",
                  fontSize:   window.innerWidth <= 640 ? "0.95rem" : "0.82rem",
                }}>
                  Loading…
                </div>
              ) : notifications.length === 0 ? (
                <div style={{
                  padding:       window.innerWidth <= 640 ? "3.5rem 1.5rem" : "2.5rem 1rem",
                  textAlign:     "center",
                  display:       "flex",
                  flexDirection: "column",
                  alignItems:    "center",
                  gap:           "0.75rem",
                }}>
                  <span style={{ fontSize: window.innerWidth <= 640 ? "2.5rem" : "1.8rem" }}>🔕</span>
                  <span style={{ 
                    color: "#555577", 
                    fontSize: window.innerWidth <= 640 ? "0.95rem" : "0.82rem",
                    fontWeight: 500,
                  }}>
                    No notifications yet
                  </span>
                  <span style={{ 
                    color: "#444466", 
                    fontSize: window.innerWidth <= 640 ? "0.85rem" : "0.75rem",
                  }}>
                    We'll notify you when something happens
                  </span>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif._id}
                    className="notif-item"
                    onClick={() => handleClick(notif)}
                    style={{
                      padding:        window.innerWidth <= 640 ? "1rem 1.25rem" : "0.75rem 1rem",
                      borderBottom:   "1px solid rgba(255,255,255,0.04)",
                      cursor:         "pointer",
                      display:        "flex",
                      gap:            window.innerWidth <= 640 ? "0.85rem" : "0.65rem",
                      alignItems:     "flex-start",
                      background:     notif.read
                        ? "transparent"
                        : "rgba(124,111,255,0.05)",
                      transition:     "all 0.15s",
                      minHeight:      window.innerWidth <= 640 ? "72px" : "auto",
                    }}
                  >
                    {/* Icon - Larger for mobile */}
                    <div style={{
                      width:           window.innerWidth <= 640 ? 40 : 32,
                      height:          window.innerWidth <= 640 ? 40 : 32,
                      borderRadius:    "50%",
                      background:      "rgba(124,111,255,0.12)",
                      display:         "flex",
                      alignItems:      "center",
                      justifyContent:  "center",
                      fontSize:        window.innerWidth <= 640 ? "1.1rem" : "0.9rem",
                      flexShrink:      0,
                      marginTop:       "1px",
                    }}>
                      {typeIcon(notif.type)}
                    </div>

                    {/* Content - Larger text for mobile */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color:        notif.read ? "#9999bb" : "#d4d4f0",
                        fontSize:     window.innerWidth <= 640 ? "0.95rem" : "0.8rem",
                        lineHeight:   1.5,
                        marginBottom: "0.3rem",
                        fontWeight:   notif.read ? 400 : 500,
                        wordBreak:    "break-word",
                      }}>
                        {notif.message}
                      </div>
                      <div style={{
                        color:    "#555577",
                        fontSize: window.innerWidth <= 640 ? "0.8rem" : "0.7rem",
                        display:  "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}>
                        <span>{relativeTime(notif.createdAt)}</span>
                        {notif.reportId && (
                          <span style={{ color: "#7c6fff", fontWeight: 500 }}>→ View video</span>
                        )}
                      </div>
                    </div>

                    {/* Unread dot */}
                    {!notif.read && (
                      <div style={{
                        width:        window.innerWidth <= 640 ? 8 : 7,
                        height:       window.innerWidth <= 640 ? 8 : 7,
                        borderRadius: "50%",
                        background:   "#7c6fff",
                        flexShrink:   0,
                        marginTop:    window.innerWidth <= 640 ? 8 : 6,
                        boxShadow:    "0 0 6px rgba(124,111,255,0.6)",
                      }} />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer - Larger for mobile */}
            {notifications.length > 0 && (
              <div style={{
                padding:      window.innerWidth <= 640 ? "0.85rem 1.25rem" : "0.6rem 1rem",
                borderTop:    "1px solid rgba(255,255,255,0.06)",
                textAlign:    "center",
                fontSize:     window.innerWidth <= 640 ? "0.8rem" : "0.7rem",
                color:        "#444466",
                flexShrink:   0,
              }}>
                Showing last {notifications.length} notifications
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
