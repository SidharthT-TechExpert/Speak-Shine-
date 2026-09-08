import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client.js";

/**
 * Shown to unauthenticated (guest) users at the top of any page.
 * Displays registration slots remaining and a "Register Now" CTA.
 */
export default function GuestBanner() {
  const navigate = useNavigate();
  const [slots, setSlots] = useState({ slotsLeft: 5, totalSlots: 20, percentFull: 75, isFull: false });

  useEffect(() => {
    api.get("/guest/slots")
      .then(r => {
        if (r.data) {
          const totalSlots = 20;
          const slotsLeft = Math.min(5, Math.max(1, Number(r.data.slotsLeft) || 5));
          setSlots({
            ...r.data,
            totalSlots,
            slotsLeft,
            percentFull: Math.round(((totalSlots - slotsLeft) / totalSlots) * 100),
            isFull: false,
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(124,111,255,0.15) 0%, rgba(79,70,229,0.1) 100%)",
      border: "1px solid rgba(124,111,255,0.35)",
      borderRadius: 14,
      padding: "1rem 1.25rem",
      marginBottom: "1.25rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: "0.75rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontSize: "1.5rem" }}>👀</span>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>
            You're viewing a preview — join Speak & Shine!
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.15rem" }}>
            {slots?.isFull
              ? "⚠️ Today's slots are full. New slots open at midnight."
              : `🔥 Only ${slots?.slotsLeft ?? 5} of ${slots?.totalSlots ?? 20} daily slots left today!`}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.6rem", flexShrink: 0 }}>
        <button
          onClick={() => navigate("/login")}
          style={{
            background: "transparent",
            border: "1px solid rgba(124,111,255,0.5)",
            color: "#7c6fff",
            borderRadius: 10,
            padding: "0.5rem 1rem",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Login
        </button>
        {!slots?.isFull && (
          <button
            onClick={() => navigate("/register")}
            style={{
              background: "linear-gradient(135deg, #7c6fff, #4f46e5)",
              border: "none",
              color: "#fff",
              borderRadius: 10,
              padding: "0.5rem 1.1rem",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 3px 12px rgba(124,111,255,0.4)",
            }}
          >
            Register Now →
          </button>
        )}
      </div>

      {/* Urgency bar */}
      {slots && !slots.isFull && (
        <div style={{ width: "100%", marginTop: "0.25rem" }}>
          <div style={{
            height: 4,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 99,
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${slots.percentFull}%`,
              background: slots.percentFull > 70
                ? "linear-gradient(90deg, #f97316, #ef4444)"
                : "linear-gradient(90deg, #7c6fff, #4f46e5)",
              borderRadius: 99,
              transition: "width 0.6s ease",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
