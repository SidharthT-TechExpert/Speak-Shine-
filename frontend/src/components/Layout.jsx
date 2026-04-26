import { useAuth } from "../context/AuthContext.jsx";
import { useNavigate, useLocation, Link } from "react-router-dom";

export default function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    if (user?.role === "admin") navigate("/admin/login");
    else if (user?.role === "trainer") navigate("/trainer/login");
    else navigate("/login");
  };

  const navLink = (to, label) => (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
        ${location.pathname === to
          ? "bg-[#7c6fff]/20 text-[#7c6fff]"
          : "text-[#8888aa] hover:text-[#e8e8f4] hover:bg-white/5"}`}
    >
      {label}
    </Link>
  );

  const roleBadgeColor = {
    admin:   "bg-[#7c6fff]/15 text-[#7c6fff]",
    trainer: "bg-[#fbbf24]/15 text-[#fbbf24]",
    user:    "bg-[#4ade80]/15 text-[#4ade80]",
  }[user?.role] || "";

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a14]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#16162a]/80 backdrop-blur-xl border-b border-[#252545]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-2xl">🗣️</span>
            <span className="font-bold text-base text-[#e8e8f4] hidden sm:block">Speak & Shine</span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {user?.role === "admin" && (
              <>
                {navLink("/admin", "Admin")}
                {navLink("/trainer", "Trainer")}
                {navLink("/dashboard", "User View")}
              </>
            )}
            {user?.role === "trainer" && (
              <>
                {navLink("/trainer", "Dashboard")}
                {navLink("/dashboard", "User View")}
              </>
            )}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${roleBadgeColor}`}>
              {user?.role}
            </span>
            <span className="text-sm text-[#8888aa] hidden sm:block">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-[#8888aa] border border-[#252545] px-3 py-1.5 rounded-lg hover:border-[#f87171] hover:text-[#f87171] transition-all"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {title && (
          <h1 className="text-2xl font-bold text-[#e8e8f4] mb-6">{title}</h1>
        )}
        {children}
      </main>
    </div>
  );
}
