import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate, useLocation, Link, Outlet } from "react-router-dom";
import api from "../api/client.js";
import { getSharedSocket } from "../hooks/useSocket.js";
import { useShell, ShellProvider } from "../context/ShellContext.jsx";

const Modal = lazy(() => import("./Modal.jsx"));
import ThemeToggle from "./ThemeToggle.jsx";

// ── Live session banner (shown on all pages when a session goes live) ────────
function LiveSessionBanner() {
  const { user } = useAuth();
  const [liveSession, setLiveSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    api.get("/live-sessions?status=live")
      .then(r => {
        const sessions = r.data || [];
        if (sessions.length > 0) setLiveSession(sessions[0]);
      })
      .catch(() => {});

    const socket = getSharedSocket();
    if (!socket) return;
    const handleLive = (data) => setLiveSession(data);
    const handleEnded = () => setLiveSession(null);

    socket.on("session:live", handleLive);
    socket.on("session:ended", handleEnded);

    return () => {
      socket.off("session:live", handleLive);
      socket.off("session:ended", handleEnded);
    };
  }, [user]);

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
  const [prompt, setPrompt] = useState(() => window.__pwaInstallPrompt || null);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches
  );

  useEffect(() => {
    if (isInstalled) return;
    const onReady = () => setPrompt(window.__pwaInstallPrompt);
    window.addEventListener("pwa-prompt-ready", onReady, { once: true });
    window.addEventListener("appinstalled", () => setIsInstalled(true));
    return () => window.removeEventListener("pwa-prompt-ready", onReady);
  }, [isInstalled]);

  const install = async () => {
    if (!prompt) return false;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") { setPrompt(null); window.__pwaInstallPrompt = null; }
    return outcome === "accepted";
  };

  return { prompt, isInstalled, install };
}

export function AppShell() {
  return (
    <ShellProvider>
      <Layout isShellRoot={true}>
        <Outlet />
      </Layout>
    </ShellProvider>
  );
}

export default function Layout({ children, title, subtitle, isShellRoot = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const shell = useShell();
  const { isInsideShell, setHeaderMeta, scrollerRef, headerTitle, headerSubtitle, scrollToTop } = shell || {};

  // If already inside persistent AppShell and not root shell, pass through children and sync title
  useEffect(() => {
    if (!isShellRoot && isInsideShell && setHeaderMeta) {
      setHeaderMeta({ title, subtitle });
    }
  }, [isShellRoot, isInsideShell, title, subtitle, setHeaderMeta]);

  // Reset middle screen scroll on page route transition when running as shell root
  useEffect(() => {
    if (isShellRoot && scrollToTop) {
      scrollToTop();
    }
  }, [isShellRoot, location.pathname, scrollToTop]);

  if (!isShellRoot && isInsideShell) {
    return (
      <div className="speakshine-page-wrapper">
        {/* Read-only banner for viewer accounts */}
        {user?.role === "viewer" && (
          <div style={{
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.3)",
            borderRadius: "10px",
            padding: "0.6rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            fontSize: "0.82rem",
            color: "#fbbf24",
            fontWeight: 500,
          }}>
            <span style={{ fontSize: "1rem" }}>👁️</span>
            <span><strong>Read-only mode</strong> — You can view all pages but cannot make any changes.</span>
          </div>
        )}
        {children}
      </div>
    );
  }

  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const { prompt, isInstalled, install } = useInstall();

  // Load user profile statistics for Topbar and Freeze box
  const [profile, setProfile] = useState(() => {
    try {
      const cached = localStorage.getItem("speakshine_profile_cache") || localStorage.getItem("speak-shine-dashboard-cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.profile || parsed;
      }
    } catch {}
    return null;
  });

  useEffect(() => {
    if (!user) return;
    api.get("/dashboard/me").then(res => {
      if (res.data?.profile) {
        setProfile(res.data.profile);
        try {
          localStorage.setItem("speakshine_profile_cache", JSON.stringify(res.data.profile));
        } catch {}
      }
    }).catch(() => {});
  }, [user]);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const canInstall = !isInstalled && (prompt || isIOS);

  const handleInstallClick = async () => {
    if (isIOS) { setShowIOSHint(h => !h); return; }
    setMenuOpen(false);
    setShowInstallModal(true);
  };

  const handleInstallConfirm = async () => {
    setShowInstallModal(false);
    await install();
  };

  const doLogout = async () => {
    setShowLogoutModal(false);
    setMenuOpen(false);
    try {
      if (logout) await logout();
    } catch (e) {
      console.warn("[Layout] Logout error:", e);
    }
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    if (user?.role === "admin" || user?.role === "admins") window.location.href = "/admin/login";
    else if (user?.role === "trainer") window.location.href = "/trainer/login";
    else window.location.href = "/login";
  };

  const handleLogout = () => setShowLogoutModal(true);

  // User details
  const streak = profile?.streak ?? (user?.streak || 0);
  const totalPoints = Math.round(profile?.monthlyScore ?? (user?.monthlyScore || 0));
  const freezeTokens = profile?.streakFreeze ?? (user?.streakFreeze || 0);
  const freezeStreakProgress = Math.min(
    7,
    Math.max(
      0,
      profile?.freezeStreakProgress ??
        user?.freezeStreakProgress ??
        ((streak || 0) % 7)
    )
  );
  const freezeDaysNeeded = Math.max(0, 7 - freezeStreakProgress);
  const displayName = user?.name ? user.name.split(" ")[0] : (profile?.name ? profile.name.split(" ")[0] : "Speaker");
  const avatarInitials = (displayName || "S").charAt(0).toUpperCase();
  const isLoggedIn = Boolean(
    (user && user.name !== "Preview User") ||
    (profile && profile.name && profile.name !== "Preview User")
  );

  const isAdminRoute = location.pathname.startsWith("/admin");
  const isTrainerRoute = location.pathname.startsWith("/trainer");
  const isStaffRoute = isAdminRoute || isTrainerRoute;

  const getGreeting = () => {
    const h = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
  };

  const getComputedSubtitle = () => {
    if (headerSubtitle) return headerSubtitle;
    if (subtitle) return subtitle;
    if (headerTitle) return `${headerTitle} · Speak & Shine`;
    const path = location.pathname;
    if (path.startsWith("/admin")) {
      return "Control center for members, automated curriculum, live rooms & system settings.";
    }
    if (path.startsWith("/trainer")) {
      return "Review student recordings, assign CEFR fluency feedback & host live coaching.";
    }
    if (path.startsWith("/record") || path.startsWith("/video-analysis")) {
      return "Here's your speaking mission for today.";
    }
    if (path.startsWith("/community")) {
      return "Engage and share feedback with fellow cohort speakers.";
    }
    if (path.startsWith("/payment")) {
      return "Manage your monthly membership, grace period and invoices.";
    }
    if (path.startsWith("/live")) {
      return "Live audio-video interactive practice rooms.";
    }
    if (path === "/dashboard") {
      return "Here's your speaking mission for today.";
    }
    return title ? `${title} · Speak & Shine` : "Here's your speaking mission for today.";
  };

  const isVideoAnalysisActive = location.pathname.startsWith("/record") || location.pathname.startsWith("/video-analysis");
  const isCommunityActive = location.pathname.startsWith("/community");
  const isLiveRoomsActive = location.pathname.startsWith("/live");
  const isPaymentsActive = location.pathname.startsWith("/payment");
  const isDashboardActive = location.pathname === "/dashboard";

  return (
    <div className="speakshine-shell">
      {/* ── Logout confirmation modal ── */}
      {showLogoutModal && (
        <Suspense fallback={null}>
          <Modal
            type="danger"
            title="Log Out"
            message="Are you sure you want to log out?"
            confirmText="Log Out"
            cancelText="Stay"
            onConfirm={doLogout}
            onCancel={() => setShowLogoutModal(false)}
          />
        </Suspense>
      )}

      {/* ── Custom PWA install modal ── */}
      {showInstallModal && (
        <div className="modal-overlay" onClick={() => setShowInstallModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "linear-gradient(145deg, #13132a 0%, #1a1a35 100%)",
            border: "1.5px solid rgba(124,111,255,0.35)",
            borderRadius: 20,
            padding: "1.5rem",
            width: "calc(100% - 2rem)",
            maxWidth: 380,
            boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
            position: "relative",
          }}>
            <button onClick={() => setShowInstallModal(false)} style={{
              position: "absolute", top: "0.85rem", right: "0.85rem",
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "50%", width: 28, height: 28, cursor: "pointer",
              color: "#666688", fontSize: "0.85rem",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>

            <div style={{ display: "flex", alignItems: "center", gap: "0.9rem", marginBottom: "1.1rem" }}>
              <img src="/icons/icon-192.png" alt="Speak & Shine" style={{ width: 52, height: 52, borderRadius: 14 }} />
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "1rem" }}>Speak &amp; Shine</div>
                <div style={{ color: "#7777aa", fontSize: "0.75rem" }}>speakandshine.app · Free</div>
              </div>
            </div>

            <button onClick={handleInstallConfirm} style={{
              width: "100%", background: "linear-gradient(135deg, #7c6fff, #4f46e5)",
              color: "#fff", border: "none", borderRadius: 14, padding: "0.9rem",
              fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", marginBottom: "0.6rem",
            }}>
              Install App
            </button>
            <button onClick={() => setShowInstallModal(false)} style={{
              width: "100%", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)", color: "#888899",
              borderRadius: 14, padding: "0.7rem", fontSize: "0.85rem", cursor: "pointer",
            }}>
              Not now
            </button>
          </div>
        </div>
      )}

      {/* ── Left Sidebar Navigation (Matching Target UI) ── */}
      <aside className="speakshine-sidebar">
        {/* Brand Header with Gold Star Logo */}
        <Link to="/dashboard" className="speakshine-sidebar-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L14.7 9.3L22 12L14.7 14.7L12 22L9.3 14.7L2 12L9.3 9.3L12 2Z"
              fill="url(#goldStarGradLayout)"
            />
            <defs>
              <linearGradient id="goldStarGradLayout" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fbbf24" />
                <stop offset="1" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
          </svg>
          <span className="brand-logo-text">Speak &amp; Shine</span>
        </Link>

        {/* Navigation Items */}
        <nav className="speakshine-sidebar-nav">
          <Link to="/dashboard" className={`speakshine-nav-item${isDashboardActive ? " active" : ""}`}>
            <span className="nav-icon">⏱</span>
            <span>Dashboard</span>
          </Link>
          <Link to="/record" className={`speakshine-nav-item${isVideoAnalysisActive ? " active" : ""}`}>
            <span className="nav-icon">📹</span>
            <span>Video analysis</span>
          </Link>
          <Link to="/community" className={`speakshine-nav-item${isCommunityActive ? " active" : ""}`}>
            <span className="nav-icon">👥</span>
            <span>Community</span>
          </Link>
          <Link to="/live/rooms" className={`speakshine-nav-item${isLiveRoomsActive ? " active" : ""}`}>
            <span className="nav-icon">📡</span>
            <span>Live rooms</span>
          </Link>
          <Link to="/payment-history" className={`speakshine-nav-item${isPaymentsActive ? " active" : ""}`}>
            <span className="nav-icon">💳</span>
            <span>Payments</span>
          </Link>

          {(user?.role === "admin" || user?.role === "admins") && (
            <Link to="/admin" className={`speakshine-nav-item${location.pathname.startsWith("/admin") ? " active" : ""}`}>
              <span className="nav-icon">🛡️</span>
              <span>Admin</span>
            </Link>
          )}
          {(user?.role === "trainer" || user?.role === "admin" || user?.role === "admins") && (
            <Link to="/trainer" className={`speakshine-nav-item${location.pathname.startsWith("/trainer") ? " active" : ""}`}>
              <span className="nav-icon">🎓</span>
              <span>Trainer</span>
            </Link>
          )}
        </nav>

        {/* Appearance / Theme Mode Selector */}
        <div className="speakshine-sidebar-theme" style={{ padding: "0 1.25rem", marginBottom: "0.85rem", marginTop: isStaffRoute ? "auto" : 0 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#7c7793", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.45rem" }}>
            Appearance
          </div>
          <ThemeToggle />
        </div>

        {/* Freeze Tokens Bottom Box (Hidden on staff routes) */}
        {!isStaffRoute && (
          <div className="speakshine-freeze-box">
            <div className="freeze-title">FREEZE TOKENS</div>
            <div className="freeze-val">
              {freezeTokens} <span style={{ fontSize: "0.95rem", color: "#7c7793", fontWeight: 500 }}>Available</span>
            </div>

            {/* Continuous 7-Day Streak Freeze Progress Bar */}
            <div className="freeze-progress-wrap">
              <div className="freeze-progress-header">
                <span className="freeze-progress-label">Next Shield</span>
                <span className="freeze-progress-count">
                  <strong>{freezeStreakProgress}</strong>/7 days
                </span>
              </div>
              <div className="freeze-progress-track">
                <div
                  className="freeze-progress-fill"
                  style={{ width: `${Math.round((freezeStreakProgress / 7) * 100)}%` }}
                />
              </div>
              <div className="freeze-progress-pills">
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <span
                    key={day}
                    className={`freeze-pill ${day <= freezeStreakProgress ? "active" : ""}`}
                    title={`Day ${day} of 7`}
                  />
                ))}
              </div>
              <div className="freeze-progress-sub">
                {freezeDaysNeeded === 0
                  ? "🎉 Milestone reached! +1 Shield awarded"
                  : `${freezeDaysNeeded} continuous ${freezeDaysNeeded === 1 ? "day" : "days"} needed`}
              </div>
            </div>

            <div className="freeze-desc">
              Earn tokens by completing 7 continuous days of practice.
            </div>
            {isLoggedIn && (
              <button
                type="button"
                onClick={handleLogout}
                className="freeze-link speakshine-sidebar-logout"
                title="Log Out"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
                <span>Log out</span>
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ── Main Content Area ── */}
      <div className="speakshine-main">
        {/* Top Header Bar */}
        <header className="speakshine-topbar">
          <div className="speakshine-topbar-left" style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
            <span className="speakshine-topbar-greeting" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
              Good {getGreeting()}, {displayName} 👋
            </span>
            <span className="speakshine-topbar-subtitle hidden md:block" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {getComputedSubtitle()}
            </span>
          </div>

          <div className="speakshine-topbar-right" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "0.35rem" }}>
            {isStaffRoute ? (
              <div
                className="speakshine-pill"
                style={{
                  borderColor: isAdminRoute ? "rgba(239, 68, 68, 0.45)" : "rgba(168, 85, 247, 0.45)",
                  background: isAdminRoute ? "rgba(239, 68, 68, 0.14)" : "rgba(168, 85, 247, 0.14)",
                  color: isAdminRoute ? "#fca5a5" : "#d8b4fe",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  padding: "0.3rem 0.6rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  flexShrink: 0,
                }}
              >
                <span>{isAdminRoute ? "🛡️" : "🎓"}</span>
                <span className="hidden sm:inline">{isAdminRoute ? "Admin Portal" : "Trainer Workspace"}</span>
              </div>
            ) : (
              <>
                <div className="speakshine-pill streak" style={{ flexShrink: 0 }}>
                  <span>🔥</span>
                  <span>{streak} Day</span>
                </div>
                <div className="speakshine-pill points hidden sm:inline-flex" style={{ flexShrink: 0 }}>
                  <span style={{ color: "#fbbf24" }}>⭐</span>
                  <span>{totalPoints} Pts</span>
                </div>
              </>
            )}
            {isLoggedIn && (
              <div
                className="speakshine-avatar disabled hidden sm:flex"
                title={`${displayName} (${user?.email || ""})`}
              >
                {avatarInitials}
              </div>
            )}

            {/* Mobile Hamburger Toggle - hidden on laptop and desktop */}
            <button
              type="button"
              className={`hamburger lg:hidden ${menuOpen ? "open" : ""}`}
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Toggle mobile menu"
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
                padding: "6px",
                marginLeft: "2px",
              }}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </header>

        {/* Canvas Body - Middle Screen Scroll Container */}
        <main className="speakshine-canvas-scroller" ref={scrollerRef}>
          <div className="speakshine-canvas">
            {/* Read-only banner for viewer accounts */}
            {user?.role === "viewer" && (
              <div style={{
                background: "rgba(251,191,36,0.1)",
                border: "1px solid rgba(251,191,36,0.3)",
                borderRadius: "10px",
                padding: "0.6rem 1rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                fontSize: "0.82rem",
                color: "#fbbf24",
                fontWeight: 500,
              }}>
                <span style={{ fontSize: "1rem" }}>👁️</span>
                <span><strong>Read-only mode</strong> — You can view all pages but cannot make any changes.</span>
              </div>
            )}

            {children}
          </div>
        </main>
      </div>

      {/* Mobile Drawer */}
      {menuOpen && (
        <div
          className="speakshine-mobile-backdrop lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="speakshine-mobile-drawer"
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
              <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="speakshine-sidebar-brand">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L14.7 9.3L22 12L14.7 14.7L12 22L9.3 14.7L2 12L9.3 9.3L12 2Z"
                    fill="url(#goldStarGradLayoutDrawer)"
                  />
                  <defs>
                    <linearGradient id="goldStarGradLayoutDrawer" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#fbbf24" />
                      <stop offset="1" stopColor="#f59e0b" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="brand-logo-text">Speak &amp; Shine</span>
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#e2e8f0",
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                }}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <nav className="speakshine-sidebar-nav" style={{ flex: 1 }}>
              <Link to="/dashboard" onClick={() => setMenuOpen(false)} className={`speakshine-nav-item${isDashboardActive ? " active" : ""}`}>
                <span className="nav-icon">⏱</span>
                <span>Dashboard</span>
              </Link>
              <Link to="/record" onClick={() => setMenuOpen(false)} className={`speakshine-nav-item${isVideoAnalysisActive ? " active" : ""}`}>
                <span className="nav-icon">📹</span>
                <span>Video analysis</span>
              </Link>
              <Link to="/community" onClick={() => setMenuOpen(false)} className={`speakshine-nav-item${isCommunityActive ? " active" : ""}`}>
                <span className="nav-icon">👥</span>
                <span>Community</span>
              </Link>
              <Link to="/live/rooms" onClick={() => setMenuOpen(false)} className={`speakshine-nav-item${isLiveRoomsActive ? " active" : ""}`}>
                <span className="nav-icon">📡</span>
                <span>Live rooms</span>
              </Link>
              <Link to="/payment-history" onClick={() => setMenuOpen(false)} className={`speakshine-nav-item${isPaymentsActive ? " active" : ""}`}>
                <span className="nav-icon">💳</span>
                <span>Payments</span>
              </Link>

              {(user?.role === "admin" || user?.role === "admins") && (
                <Link to="/admin" onClick={() => setMenuOpen(false)} className={`speakshine-nav-item${location.pathname.startsWith("/admin") ? " active" : ""}`}>
                  <span className="nav-icon">🛡️</span>
                  <span>Admin</span>
                </Link>
              )}
              {(user?.role === "trainer" || user?.role === "admin" || user?.role === "admins") && (
                <Link to="/trainer" onClick={() => setMenuOpen(false)} className={`speakshine-nav-item${location.pathname.startsWith("/trainer") ? " active" : ""}`}>
                  <span className="nav-icon">🎓</span>
                  <span>Trainer</span>
                </Link>
              )}
            </nav>

            <div style={{ marginTop: "auto", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8e8a9f", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                Appearance
              </div>
              <ThemeToggle />
            </div>

            {isLoggedIn && (
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  background: "rgba(248,113,113,0.1)",
                  border: "1px solid rgba(248,113,113,0.3)",
                  color: "#f87171",
                  padding: "0.75rem",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "center",
                  width: "100%",
                }}
              >
                Log Out
              </button>
            )}
          </div>
        </div>
      )}

      <LiveSessionBanner />
    </div>
  );
}
