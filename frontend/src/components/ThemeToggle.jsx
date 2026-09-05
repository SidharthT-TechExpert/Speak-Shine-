import { useRef } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import gsap from "gsap";

export default function ThemeToggle({ compact = false, showLabel = false, className = "" }) {
  const { theme, isDark, toggleTheme, setTheme } = useTheme();
  const iconRef = useRef(null);

  const handleToggle = () => {
    if (iconRef.current) {
      // Luxury GSAP micro-animation
      gsap.timeline()
        .to(iconRef.current, {
          rotate: isDark ? 180 : -180,
          scale: 0.75,
          duration: 0.18,
          ease: "power2.in",
        })
        .set(iconRef.current, {
          rotate: 0,
        })
        .to(iconRef.current, {
          scale: 1.15,
          duration: 0.22,
          ease: "back.out(2.5)",
        })
        .to(iconRef.current, {
          scale: 1,
          duration: 0.15,
          ease: "power1.out",
        });
    }
    toggleTheme();
  };

  if (compact) {
    return (
      <button
        onClick={handleToggle}
        className={`theme-toggle-btn ${className}`}
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        title={`Switch to ${isDark ? "light" : "dark"} mode`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 10,
          background: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.05)",
          border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(15, 23, 42, 0.12)",
          color: isDark ? "#fbbf24" : "#6d28d9",
          cursor: "pointer",
          transition: "all 0.2s ease",
          padding: 0,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.06)";
          e.currentTarget.style.borderColor = isDark ? "rgba(251, 191, 36, 0.4)" : "rgba(109, 40, 217, 0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.borderColor = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(15, 23, 42, 0.12)";
        }}
      >
        <span ref={iconRef} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isDark ? (
            // Sun icon for switching to Light mode
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
          ) : (
            // Moon icon for switching to Dark mode
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          )}
        </span>
      </button>
    );
  }

  // Segmented Pill (Full view for mobile drawer or settings)
  return (
    <div
      className={`theme-segmented-control ${className}`}
      style={{
        display: "flex",
        alignItems: "center",
        background: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.06)",
        border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(15, 23, 42, 0.1)",
        borderRadius: 12,
        padding: 3,
        position: "relative",
        gap: 2,
        width: "100%",
        maxWidth: 260,
      }}
    >
      <button
        onClick={() => setTheme("dark")}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.45rem",
          padding: "0.45rem 0.75rem",
          borderRadius: 9,
          fontSize: "0.82rem",
          fontWeight: isDark ? 700 : 500,
          background: isDark ? "linear-gradient(135deg, #7c6fff, #6366f1)" : "transparent",
          color: isDark ? "#ffffff" : isDark ? "#9494b8" : "#64748b",
          boxShadow: isDark ? "0 2px 8px rgba(124, 111, 255, 0.4)" : "none",
          border: "none",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
        Dark
      </button>

      <button
        onClick={() => setTheme("light")}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.45rem",
          padding: "0.45rem 0.75rem",
          borderRadius: 9,
          fontSize: "0.82rem",
          fontWeight: !isDark ? 700 : 500,
          background: !isDark ? "#ffffff" : "transparent",
          color: !isDark ? "#0f172a" : "#9494b8",
          boxShadow: !isDark ? "0 2px 8px rgba(15, 23, 42, 0.1)" : "none",
          border: "none",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" /><path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" /><path d="M20 12h2" />
        </svg>
        Light
      </button>
    </div>
  );
}
