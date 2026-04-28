import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate, useLocation, Link } from "react-router-dom";
import Modal from "./Modal.jsx";
import { io } from "socket.io-client";

// ── Live session banner (shown on all pages when a session goes live) ────────
function LiveSessionBanner() {
  const [liveSession, setLiveSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if there's already a live session on mount
    fetch("/api/live-sessions?status=live", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then(r => r.json())
      .then(sessions => { if (sessions.length > 0) setLiveSession(sessions[0]); })
      .catch(() => {});

    // Listen for real-time events
    const socket = io({ path: "/socket.io", transports: ["websocket"] });
    socket.on("session:live", (data) => setLiveSession(data));
    socket.on("session:ended", () => setLiveSession(null));
    return () => socket.disconnect();
  }, []);

  if (!liveSession) return null;

  return (
    <div style={{
      position: "fixed", bottom: "5rem", left: "50%", transform: "translateX(-50%)",
      zIndex: 9998, width: "calc(100% - 2rem)", maxWidth: 420,
      background: "linear-gradient(135deg, #7c6fff, #4f46e5)",
      borderRadius: 14, padding: "0.85rem 1rem",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem",
      boxShadow: "0 8px 32px rgba(124,111,255,0.5)",
      animation: "slideUpIn 0.4s ease",
    }}>
      <div>
        <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.9rem" }}>🔴 Live Now!</div>
        <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.8rem" }}>{liveSession.title}</div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button
          onClick={() => navigate(`/live/${liveSession.sessionId || liveSession._id}`)}
          style={{ background: "#fff", color: "#4f46e5", border: "none", borderRadius: 10, padding: "0.5rem 1rem", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}
        >Join Now</button>
        <button
          onClick={() => setLiveSession(null)}
          style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 10, padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.85rem" }}
        >✕</button>
      </div>
    </div>
  );
}

function useInstall() {
  const [prompt, setPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }
    const handler = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!prompt) return false;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setPrompt(null);
    return outcome === "accepted";
  };

  return { prompt, isInstalled, install };
}

export default function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const { prompt, isInstalled, install } = useInstall();

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const canInstall = !isInstalled && (prompt || isIOS);

  const handleInstallClick = async () => {
    if (isIOS) { setShowIOSHint(h => !h); return; }
    await install();
  };

  const doLogout = () => {
    setShowLogoutModal(false);
    setMenuOpen(false);
    logout();
    if (user?.role === "admin") navigate("/admin/login");
    else if (user?.role === "trainer") navigate("/trainer/login");
    else navigate("/login");
  };

  const handleLogout = () => setShowLogoutModal(true);

  const navLinks = () => {
    if (user?.role === "admin") return [
      { to: "/admin",     label: "🛡️ Admin" },
      { to: "/trainer",   label: "🎓 Trainer" },
      { to: "/dashboard", label: "👤 User View" },
      { to: "/video-analysis", label: "📹 Video Analysis" },
      { to: "/community", label: "👥 Community" },
    ];
    if (user?.role === "trainer") return [
      { to: "/trainer",   label: "🎓 Dashboard" },
      { to: "/dashboard", label: "👤 User View" },
      { to: "/video-analysis", label: "📹 Video Analysis" },
      { to: "/community", label: "👥 Community" },
    ];
    return [
      { to: "/dashboard", label: "📊 Dashboard" },
      { to: "/video-analysis", label: "📹 Video Analysis" },
      { to: "/community", label: "👥 Community" },
    ];
  };

  const links = navLinks();

  return (
    <div className="app-shell">
      {showLogoutModal && (
        <Modal
          type="danger"
          title="Log Out"
          message="Are you sure you want to log out?"
          confirmText="Log Out"
          cancelText="Stay"
          onConfirm={doLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}
      <header className="app-header">
        {/* Brand */}
        <div className="brand">
          <span className="brand-emoji">🗣️</span>
          <span>Speak & Shine</span>
        </div>

        {/* Desktop nav */}
        {links.length > 0 && (
          <nav className="header-nav">
            {links.map(l => (
              <Link key={l.to} to={l.to} className={`nav-link${location.pathname === l.to ? " active" : ""}`}>
                {l.label}
              </Link>
            ))}
          </nav>
        )}

        {/* Right side */}
        <div className="header-right">
          {/* Install App button */}
          {canInstall && (
            <div style={{ position: "relative" }}>
              <button
                onClick={handleInstallClick}
                title="Install App"
                style={{
                  display: "flex", alignItems: "center", gap: "0.4rem",
                  background: "linear-gradient(135deg, #7c6fff, #4f46e5)",
                  border: "none", borderRadius: 10,
                  padding: "0.4rem 0.75rem",
                  color: "#fff", fontSize: "0.78rem", fontWeight: 700,
                  cursor: "pointer", whiteSpace: "nowrap",
                  boxShadow: "0 2px 10px rgba(124,111,255,0.4)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >
                {/* Download arrow SVG */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span className="install-label">Install</span>
              </button>

              {/* iOS tooltip */}
              {isIOS && showIOSHint && (
                <div style={{
                  position: "absolute", top: "calc(100% + 10px)", right: 0,
                  background: "#1a1a2e", border: "1px solid rgba(124,111,255,0.4)",
                  borderRadius: 12, padding: "0.85rem 1rem",
                  fontSize: "0.8rem", color: "#c4c4e0", lineHeight: 1.6,
                  width: 220, zIndex: 1000,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}>
                  <div style={{ fontWeight: 700, color: "#fff", marginBottom: "0.4rem" }}>📲 Install on iOS</div>
                  Tap <strong style={{ color: "#7c6fff" }}>Share ⎙</strong> in Safari, then{" "}
                  <strong style={{ color: "#7c6fff" }}>"Add to Home Screen"</strong>
                  <button onClick={() => setShowIOSHint(false)} style={{
                    display: "block", marginTop: "0.6rem", background: "none",
                    border: "none", color: "#666688", cursor: "pointer", fontSize: "0.75rem",
                  }}>Dismiss</button>
                </div>
              )}
            </div>
          )}

          <span className={`role-badge ${user?.role}`}>{user?.role}</span>
          <span className="header-name">{user?.name}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>

          {/* Hamburger — mobile only */}
          {links.length > 0 && (
            <button
              className={`hamburger${menuOpen ? " open" : ""}`}
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Menu"
            >
              <span /><span /><span />
            </button>
          )}
        </div>
      </header>

      {/* Mobile nav drawer */}
      {menuOpen && (
        <div className="mobile-nav open" onClick={() => setMenuOpen(false)}>
          {links.map(l => (
            <Link key={l.to} to={l.to}
              className={`nav-link${location.pathname === l.to ? " active" : ""}`}
              onClick={() => setMenuOpen(false)}>
              {l.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            style={{ marginTop: "auto", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--danger)", padding: "0.875rem 1rem", borderRadius: 12, fontSize: "0.9rem", fontWeight: 600, textAlign: "left" }}
          >
            🚪 Logout
          </button>
          {canInstall && (
            <button
              onClick={handleInstallClick}
              style={{ background: "linear-gradient(135deg,#7c6fff,#4f46e5)", border: "none", color: "#fff", padding: "0.875rem 1rem", borderRadius: 12, fontSize: "0.9rem", fontWeight: 700, textAlign: "left", display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Install App
            </button>
          )}
        </div>
      )}

      <main className="app-main">
        {title && <h1 className="page-title">{title}</h1>}
        {children}
      </main>
      <LiveSessionBanner />
    </div>
  );
}
