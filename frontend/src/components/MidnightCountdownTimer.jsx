import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext.jsx";

// ── Isolated Countdown Timer with Green/Orange/Red Dynamic Urgency Cycle ──
export default function MidnightCountdownTimer({ onCycleChange }) {
  const { isDark } = useTheme();
  const calc = () => {
    const now = new Date();
    const nowIST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const midnight = new Date(nowIST);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);

    const diffSec = Math.max(0, Math.floor((midnight - nowIST) / 1000));
    const totalHours = diffSec / 3600;
    const hrs = String(Math.floor(diffSec / 3600)).padStart(2, "0");
    const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, "0");
    const secs = String(diffSec % 60).padStart(2, "0");

    // Dynamic 3-Phase Urgency Cycle: Green (>8h) -> Orange (2-8h) -> Red (<2h)
    let cycle = "green";
    if (totalHours <= 2) {
      cycle = "red";
    } else if (totalHours <= 8) {
      cycle = "orange";
    }

    return { hrs, mins, secs, totalHours, cycle };
  };

  const [t, setT] = useState(calc);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = calc();
      setT(next);
      if (onCycleChange) onCycleChange(next.cycle);
    }, 1000);
    if (onCycleChange) onCycleChange(t.cycle);
    return () => clearInterval(interval);
  }, [onCycleChange]);

  const cycleConfig = {
    green: {
      color: "#22c55e",
      label: "Active Window · Ample Time",
      badgeBg: isDark ? "rgba(34, 197, 94, 0.14)" : "rgba(34, 197, 94, 0.1)",
      badgeBorder: isDark ? "rgba(34, 197, 94, 0.4)" : "rgba(34, 197, 94, 0.35)",
      boxBg: isDark
        ? "linear-gradient(145deg, rgba(34, 197, 94, 0.12) 0%, rgba(16, 185, 129, 0.04) 50%, rgba(13, 10, 24, 0.95) 100%)"
        : "linear-gradient(145deg, rgba(34, 197, 94, 0.08) 0%, #ffffff 100%)",
      boxBorder: isDark ? "1px solid rgba(34, 197, 94, 0.35)" : "1px solid rgba(34, 197, 94, 0.3)",
      glow: isDark ? "0 2px 10px rgba(34, 197, 94, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.08)" : "0 2px 8px rgba(34, 197, 94, 0.08)",
      colonColor: isDark ? "#22c55e" : "#16a34a",
      labelColor: isDark ? "#86efac" : "#15803d",
      containerBg: isDark ? "rgba(34, 197, 94, 0.04)" : "rgba(34, 197, 94, 0.03)",
      containerBorder: isDark ? "rgba(34, 197, 94, 0.18)" : "rgba(34, 197, 94, 0.15)",
    },
    orange: {
      color: "#f97316",
      label: "Evening Practice",
      badgeBg: isDark ? "rgba(249, 115, 22, 0.14)" : "rgba(249, 115, 22, 0.1)",
      badgeBorder: isDark ? "rgba(249, 115, 22, 0.35)" : "rgba(249, 115, 22, 0.3)",
      boxBg: isDark
        ? "linear-gradient(145deg, rgba(249, 115, 22, 0.14) 0%, rgba(234, 88, 12, 0.05) 50%, rgba(13, 10, 24, 0.95) 100%)"
        : "linear-gradient(145deg, rgba(249, 115, 22, 0.08) 0%, #ffffff 100%)",
      boxBorder: isDark ? "1px solid rgba(249, 115, 22, 0.35)" : "1px solid rgba(249, 115, 22, 0.3)",
      glow: isDark ? "0 2px 10px rgba(249, 115, 22, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.08)" : "0 2px 8px rgba(249, 115, 22, 0.08)",
      colonColor: isDark ? "#f97316" : "#ea580c",
      labelColor: isDark ? "#fdba74" : "#c2410c",
      containerBg: isDark ? "rgba(249, 115, 22, 0.04)" : "rgba(249, 115, 22, 0.03)",
      containerBorder: isDark ? "rgba(249, 115, 22, 0.18)" : "rgba(249, 115, 22, 0.15)",
    },
    red: {
      color: "#ef4444",
      label: "Closing at Midnight",
      badgeBg: isDark ? "rgba(239, 68, 68, 0.16)" : "rgba(239, 68, 68, 0.1)",
      badgeBorder: isDark ? "rgba(239, 68, 68, 0.4)" : "rgba(239, 68, 68, 0.35)",
      boxBg: isDark
        ? "linear-gradient(145deg, rgba(239, 68, 68, 0.18) 0%, rgba(220, 38, 38, 0.06) 50%, rgba(15, 10, 20, 0.98) 100%)"
        : "linear-gradient(145deg, rgba(239, 68, 68, 0.1) 0%, #ffffff 100%)",
      boxBorder: isDark ? "1px solid rgba(239, 68, 68, 0.45)" : "1px solid rgba(239, 68, 68, 0.4)",
      glow: isDark ? "0 2px 12px rgba(239, 68, 68, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)" : "0 2px 8px rgba(239, 68, 68, 0.12)",
      colonColor: isDark ? "#ef4444" : "#dc2626",
      labelColor: isDark ? "#fca5a5" : "#b91c1c",
      containerBg: isDark ? "rgba(239, 68, 68, 0.05)" : "rgba(239, 68, 68, 0.04)",
      containerBorder: isDark ? "rgba(239, 68, 68, 0.22)" : "rgba(239, 68, 68, 0.18)",
    },
  }[t.cycle];

  return (
    <div style={{
      background: cycleConfig.containerBg,
      border: `1px solid ${cycleConfig.containerBorder}`,
      borderRadius: 14,
      padding: "0.85rem 0.95rem",
      marginBottom: "0.85rem",
      transition: "all 0.4s ease",
    }}>
      {/* Dynamic Urgency Cycle Header Pill */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.65rem", flexWrap: "wrap", gap: "0.4rem" }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: isDark ? "#8b85a3" : "#64748b", textTransform: "uppercase" }}>
          DAILY PRACTICE WINDOW
        </div>
        <div style={{
          fontSize: "0.64rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "3px 9px",
          borderRadius: 999,
          background: cycleConfig.badgeBg,
          border: `1px solid ${cycleConfig.badgeBorder}`,
          color: cycleConfig.color,
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: cycleConfig.color,
            boxShadow: `0 0 8px ${cycleConfig.color}`,
          }} />
          <span>{cycleConfig.label}</span>
        </div>
      </div>

      {/* 3 Widened, Centered Countdown Timer Boxes (Spans 100% Width, No Empty Space) */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        gap: "0.55rem",
      }}>
        <div className="speakshine-timer-box" style={{
          flex: 1,
          minWidth: 0,
          background: cycleConfig.boxBg,
          border: cycleConfig.boxBorder,
          boxShadow: cycleConfig.glow,
          borderRadius: 12,
          padding: "0.85rem 0.5rem",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.4s ease",
        }}>
          <div className="speakshine-timer-val" style={{
            fontSize: "2.15rem",
            fontWeight: 800,
            color: isDark ? "#ffffff" : "#0f172a",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}>
            {t.hrs}
          </div>
          <div style={{
            fontSize: "0.62rem",
            fontWeight: 800,
            color: cycleConfig.labelColor,
            textTransform: "uppercase",
            marginTop: "6px",
            letterSpacing: "0.09em",
          }}>
            HRS
          </div>
        </div>

        <span style={{
          fontSize: "1.6rem",
          fontWeight: 800,
          color: cycleConfig.colonColor,
          paddingBottom: "12px",
          flexShrink: 0,
          userSelect: "none",
        }}>:</span>

        <div className="speakshine-timer-box" style={{
          flex: 1,
          minWidth: 0,
          background: cycleConfig.boxBg,
          border: cycleConfig.boxBorder,
          boxShadow: cycleConfig.glow,
          borderRadius: 12,
          padding: "0.85rem 0.5rem",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.4s ease",
        }}>
          <div className="speakshine-timer-val" style={{
            fontSize: "2.15rem",
            fontWeight: 800,
            color: isDark ? "#ffffff" : "#0f172a",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}>
            {t.mins}
          </div>
          <div style={{
            fontSize: "0.62rem",
            fontWeight: 800,
            color: cycleConfig.labelColor,
            textTransform: "uppercase",
            marginTop: "6px",
            letterSpacing: "0.09em",
          }}>
            MINS
          </div>
        </div>

        <span style={{
          fontSize: "1.6rem",
          fontWeight: 800,
          color: cycleConfig.colonColor,
          paddingBottom: "12px",
          flexShrink: 0,
          userSelect: "none",
        }}>:</span>

        <div className="speakshine-timer-box" style={{
          flex: 1,
          minWidth: 0,
          background: cycleConfig.boxBg,
          border: cycleConfig.boxBorder,
          boxShadow: cycleConfig.glow,
          borderRadius: 12,
          padding: "0.85rem 0.5rem",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.4s ease",
        }}>
          <div className="speakshine-timer-val" style={{
            fontSize: "2.15rem",
            fontWeight: 800,
            color: isDark ? "#ffffff" : "#0f172a",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}>
            {t.secs}
          </div>
          <div style={{
            fontSize: "0.62rem",
            fontWeight: 800,
            color: cycleConfig.labelColor,
            textTransform: "uppercase",
            marginTop: "6px",
            letterSpacing: "0.09em",
          }}>
            SECS
          </div>
        </div>
      </div>
    </div>
  );
}
