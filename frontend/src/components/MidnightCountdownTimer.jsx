import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext.jsx";

// ── Isolated Countdown Timer with Green/Orange/Red Dynamic Urgency Cycle ──
export default function MidnightCountdownTimer() {
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
    const interval = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(interval);
  }, []);

  const cycleConfig = {
    green: {
      color: "#22c55e",
      label: "Cycle Open · Ample Time",
      badgeBg: isDark ? "rgba(34, 197, 94, 0.12)" : "rgba(34, 197, 94, 0.08)",
      badgeBorder: isDark ? "rgba(34, 197, 94, 0.35)" : "rgba(34, 197, 94, 0.3)",
      boxBorder: isDark ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid rgba(34, 197, 94, 0.35)",
      glow: "0 0 16px rgba(34, 197, 94, 0.12)",
      colonColor: isDark ? "rgba(34, 197, 94, 0.7)" : "#16a34a",
    },
    orange: {
      color: "#f97316",
      label: "Evening Rush",
      badgeBg: isDark ? "rgba(249, 115, 22, 0.12)" : "rgba(249, 115, 22, 0.08)",
      badgeBorder: isDark ? "rgba(249, 115, 22, 0.4)" : "rgba(249, 115, 22, 0.35)",
      boxBorder: isDark ? "1px solid rgba(249, 115, 22, 0.45)" : "1px solid rgba(249, 115, 22, 0.4)",
      glow: "0 0 18px rgba(249, 115, 22, 0.16)",
      colonColor: isDark ? "rgba(249, 115, 22, 0.7)" : "#ea580c",
    },
    red: {
      color: "#ef4444",
      label: "Final Hours · Closing Soon",
      badgeBg: isDark ? "rgba(239, 68, 68, 0.16)" : "rgba(239, 68, 68, 0.1)",
      badgeBorder: isDark ? "rgba(239, 68, 68, 0.5)" : "rgba(239, 68, 68, 0.4)",
      boxBorder: isDark ? "1px solid rgba(239, 68, 68, 0.55)" : "1px solid rgba(239, 68, 68, 0.45)",
      glow: "0 0 20px rgba(239, 68, 68, 0.25)",
      colonColor: isDark ? "rgba(239, 68, 68, 0.85)" : "#dc2626",
    },
  }[t.cycle];

  return (
    <div>
      {/* Dynamic Urgency Cycle Header Pill */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.55rem" }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", color: isDark ? "#8b85a3" : "#64748b", textTransform: "uppercase" }}>
          WINDOW CLOSES AT MIDNIGHT
        </div>
        <div style={{
          fontSize: "0.64rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "2px 8px",
          borderRadius: 999,
          background: cycleConfig.badgeBg,
          border: `1px solid ${cycleConfig.badgeBorder}`,
          color: cycleConfig.color,
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: cycleConfig.color,
            boxShadow: `0 0 6px ${cycleConfig.color}`,
          }} />
          <span>{cycleConfig.label}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.75rem" }}>
        <div className="speakshine-timer-box" style={{
          background: isDark ? "#141026" : "#ffffff",
          border: cycleConfig.boxBorder,
          boxShadow: cycleConfig.glow,
          borderRadius: 10,
          padding: "0.65rem 0.85rem",
          textAlign: "center",
          minWidth: 54,
        }}>
          <div className="speakshine-timer-val" style={{ fontSize: "1.85rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {t.hrs}
          </div>
          <div style={{ fontSize: "0.6rem", fontWeight: 800, color: isDark ? "#94a3b8" : "#64748b", textTransform: "uppercase", marginTop: "4px", letterSpacing: "0.08em" }}>
            HRS
          </div>
        </div>

        <span style={{ fontSize: "1.4rem", fontWeight: 800, color: cycleConfig.colonColor, paddingBottom: "12px" }}>:</span>

        <div className="speakshine-timer-box" style={{
          background: isDark ? "#141026" : "#ffffff",
          border: cycleConfig.boxBorder,
          boxShadow: cycleConfig.glow,
          borderRadius: 10,
          padding: "0.65rem 0.85rem",
          textAlign: "center",
          minWidth: 54,
        }}>
          <div className="speakshine-timer-val" style={{ fontSize: "1.85rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {t.mins}
          </div>
          <div style={{ fontSize: "0.6rem", fontWeight: 800, color: isDark ? "#94a3b8" : "#64748b", textTransform: "uppercase", marginTop: "4px", letterSpacing: "0.08em" }}>
            MINS
          </div>
        </div>

        <span style={{ fontSize: "1.4rem", fontWeight: 800, color: cycleConfig.colonColor, paddingBottom: "12px" }}>:</span>

        <div className="speakshine-timer-box" style={{
          background: isDark ? "#141026" : "#ffffff",
          border: cycleConfig.boxBorder,
          boxShadow: cycleConfig.glow,
          borderRadius: 10,
          padding: "0.65rem 0.85rem",
          textAlign: "center",
          minWidth: 54,
        }}>
          <div className="speakshine-timer-val" style={{ fontSize: "1.85rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {t.secs}
          </div>
          <div style={{ fontSize: "0.6rem", fontWeight: 800, color: isDark ? "#94a3b8" : "#64748b", textTransform: "uppercase", marginTop: "4px", letterSpacing: "0.08em" }}>
            SECS
          </div>
        </div>
      </div>
    </div>
  );
}
