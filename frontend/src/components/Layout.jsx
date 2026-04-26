import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate, useLocation, Link } from "react-router-dom";
import Modal from "./Modal.jsx";

export default function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

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
    ];
    if (user?.role === "trainer") return [
      { to: "/trainer",   label: "🎓 Dashboard" },
      { to: "/dashboard", label: "👤 User View" },
      { to: "/video-analysis", label: "📹 Video Analysis" },
    ];
    return [
      { to: "/dashboard", label: "📊 Dashboard" },
      { to: "/video-analysis", label: "📹 Video Analysis" },
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
        </div>
      )}

      <main className="app-main">
        {title && <h1 className="page-title">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
