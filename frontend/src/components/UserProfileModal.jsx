import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/client.js";
import { getSharedSocket } from "../hooks/useSocket.js";

export default function UserProfileModal({ isOpen, onClose, user, onThemeToggle }) {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch full profile and wallet details
  const loadProfile = () => {
    setLoading(true);
    api.get("/users/me")
      .then((res) => {
        if (res.data) {
          setProfileData(res.data);
        }
      })
      .catch((err) => {
        console.warn("[ProfileModal] Failed to load profile:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      loadProfile();
      setCopiedCode(false);
      setCopiedLink(false);
    }
  }, [isOpen]);

  // Real-time wallet update listener
  useEffect(() => {
    if (!isOpen) return;
    const socket = getSharedSocket();
    if (!socket) return;

    const handleWalletUpdated = (data) => {
      setProfileData((prev) => {
        if (!prev?.user) return prev;
        return {
          ...prev,
          user: {
            ...prev.user,
            walletBalance: data.walletBalance,
            referralEarnings: (prev.user.referralEarnings || 0) + (data.creditAmount || 0),
          },
        };
      });
    };

    socket.on("wallet:updated", handleWalletUpdated);
    return () => {
      socket.off("wallet:updated", handleWalletUpdated);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const authUser = profileData?.auth || user;
  const userDetails = profileData?.user || {};

  const displayName = authUser?.name || user?.name || "Student";
  const displayPhone = authUser?.phone || user?.phone || "";
  const displayRole = authUser?.role || user?.role || "user";
  const isPaid = userDetails?.paid ?? user?.paid ?? false;
  const walletBalance = userDetails?.walletBalance ?? 0;
  const walletHistory = userDetails?.walletHistory || [];
  const referralCode = userDetails?.referralCode || "";
  const referralCount = userDetails?.referralCount ?? 0;
  const referralEarnings = userDetails?.referralEarnings ?? 0;
  const referralRewardAmount = profileData?.referralRewardAmount ?? userDetails?.referralRewardAmount ?? 5;

  // Build referral URL (supports public app URL env var when testing across devices)
  const origin = typeof window !== "undefined"
    ? (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin)
    : "";
  const referralLink = referralCode ? `${origin}/register?ref=${encodeURIComponent(referralCode)}` : "";

  const handleCopyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleWhatsAppShare = () => {
    if (!referralCode || !referralLink) return;
    const shareMessage = `Hey! Join me on Speak & Shine AI Fluency Lab to master English speaking together 🌟\n\nSign up with my referral code: *${referralCode}*\n\n${referralLink}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SS";

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "92vh",
          overflowY: "auto",
          background: "var(--card, #13111c)",
          border: "1px solid var(--border, rgba(255, 255, 255, 0.12))",
          borderRadius: 20,
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5), 0 0 20px rgba(124, 111, 255, 0.15)",
          color: "var(--foreground, #f8fafc)",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          position: "relative",
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "1.2rem",
            right: "1.2rem",
            background: "rgba(255, 255, 255, 0.08)",
            border: "none",
            borderRadius: "50%",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted, #94a3b8)",
            cursor: "pointer",
            fontSize: "1rem",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.16)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
            e.currentTarget.style.color = "var(--muted, #94a3b8)";
          }}
        >
          ✕
        </button>

        {/* ── Profile Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexShrink: 0 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #7c6fff 0%, #4f46e5 100%)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "1.35rem",
              boxShadow: "0 0 16px rgba(124, 111, 255, 0.4)",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
                {displayName}
              </h2>
              <span
                style={{
                  background: displayRole === "admin" || displayRole === "admins"
                    ? "rgba(239, 68, 68, 0.18)"
                    : displayRole === "trainer"
                    ? "rgba(168, 85, 247, 0.18)"
                    : "rgba(124, 111, 255, 0.18)",
                  color: displayRole === "admin" || displayRole === "admins"
                    ? "#fca5a5"
                    : displayRole === "trainer"
                    ? "#d8b4fe"
                    : "#a5b4fc",
                  border: `1px solid ${
                    displayRole === "admin" || displayRole === "admins"
                      ? "rgba(239, 68, 68, 0.35)"
                      : displayRole === "trainer"
                      ? "rgba(168, 85, 247, 0.35)"
                      : "rgba(124, 111, 255, 0.35)"
                  }`,
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  padding: "0.15rem 0.5rem",
                  borderRadius: 6,
                  textTransform: "capitalize",
                }}
              >
                {displayRole}
              </span>
            </div>
            <div style={{ color: "var(--muted, #94a3b8)", fontSize: "0.85rem", marginTop: "0.2rem" }}>
              📱 {displayPhone || "No phone linked"}
            </div>
            <div style={{ marginTop: "0.35rem" }}>
              {isPaid ? (
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#4ade80", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <span>✅</span> Subscription Active
                </span>
              ) : (
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#fbbf24", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <span>⚠️</span> Payment Required &bull;{" "}
                  <Link to="/payment-history" onClick={onClose} style={{ color: "#38bdf8", textDecoration: "underline" }}>
                    Pay Now
                  </Link>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Wallet Card ── */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(124, 111, 255, 0.12) 0%, rgba(99, 102, 241, 0.05) 100%)",
            border: "1px solid rgba(124, 111, 255, 0.3)",
            borderRadius: 16,
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#a5b4fc", fontWeight: 700 }}>
              👛 Wallet Balance
            </div>
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#fff", lineHeight: 1.2, marginTop: "0.2rem" }}>
              ₹{walletBalance}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)", marginTop: "0.2rem" }}>
              Auto-applied on renewals &amp; checkouts
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "flex-end" }}>
            <Link
              to="/payment-history"
              onClick={onClose}
              style={{
                background: "rgba(124, 111, 255, 0.2)",
                border: "1px solid rgba(124, 111, 255, 0.4)",
                color: "#c7d2fe",
                padding: "0.4rem 0.8rem",
                borderRadius: 8,
                fontSize: "0.78rem",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              <span>💳 Payments</span>
            </Link>
            {walletHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory((h) => !h)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "0.72rem",
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showHistory ? "Hide Activity" : "View Activity"}
              </button>
            )}
          </div>
        </div>

        {/* Optional Wallet History Dropdown */}
        {showHistory && walletHistory.length > 0 && (
          <div
            style={{
              background: "rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 14,
              padding: "0.85rem 1rem",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Recent Wallet Activity
            </div>
            {walletHistory.slice(-5).reverse().map((entry, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "0.85rem",
                  paddingBottom: idx < Math.min(walletHistory.length, 5) - 1 ? "0.6rem" : 0,
                  borderBottom: idx < Math.min(walletHistory.length, 5) - 1 ? "1px solid rgba(255, 255, 255, 0.08)" : "none",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: entry.type === "credit" ? "#4ade80" : "#f87171",
                      fontWeight: 700,
                      fontSize: "0.82rem",
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                    }}
                  >
                    {entry.type === "credit" ? "+" : "-"}₹{entry.amount} &bull; {entry.reason}
                  </div>
                  <div style={{ color: "#64748b", fontSize: "0.7rem", marginTop: "0.2rem" }}>
                    {new Date(entry.date).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <span
                  style={{
                    color: "#cbd5e1",
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    flexShrink: 0,
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    padding: "0.25rem 0.55rem",
                    borderRadius: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  Bal: ₹{entry.balanceAfter}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Refer & Earn Section ── */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(245, 158, 11, 0.03) 100%)",
            border: "1px solid rgba(251, 191, 36, 0.28)",
            borderRadius: 16,
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <span style={{ fontSize: "1.2rem" }}>🎁</span>
              <span style={{ fontWeight: 800, fontSize: "0.98rem", color: "#fbbf24" }}>
                Refer a Friend &amp; Earn ₹{referralRewardAmount}
              </span>
            </div>
            <span
              style={{
                background: "rgba(251, 191, 36, 0.2)",
                color: "#fbbf24",
                padding: "0.2rem 0.55rem",
                borderRadius: 20,
                fontSize: "0.68rem",
                fontWeight: 800,
                letterSpacing: "0.04em",
              }}
            >
              ₹{referralRewardAmount} PER FRIEND
            </span>
          </div>

          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted, #cbd5e1)", lineHeight: 1.45 }}>
            Invite friends to Speak &amp; Shine. When your friend completes their membership payment, <strong>₹{referralRewardAmount}</strong> is instantly credited to your wallet balance!
          </p>

          {/* Referral Code Box */}
          <div>
            <label style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "0.3rem" }}>
              Your Unique Referral Code
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "rgba(0, 0, 0, 0.35)",
                border: "1px dashed rgba(251, 191, 36, 0.4)",
                padding: "0.5rem 0.85rem",
                borderRadius: 10,
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontFamily: "monospace",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  color: "#fbbf24",
                }}
              >
                {referralCode || (loading ? "Generating..." : "SPEAK...")}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                disabled={!referralCode}
                style={{
                  background: copiedCode ? "#22c55e" : "rgba(251, 191, 36, 0.18)",
                  color: copiedCode ? "#fff" : "#fbbf24",
                  border: "1px solid rgba(251, 191, 36, 0.4)",
                  borderRadius: 8,
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {copiedCode ? "Copied! ✓" : "Copy Code"}
              </button>
            </div>
          </div>

          {/* Action Buttons: Copy Link & WhatsApp Share */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={!referralLink}
              style={{
                background: copiedLink ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 255, 255, 0.08)",
                color: copiedLink ? "#4ade80" : "#f1f5f9",
                border: copiedLink ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: 10,
                padding: "0.65rem 0.75rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                transition: "all 0.2s ease",
              }}
            >
              <span>🔗</span>
              <span>{copiedLink ? "Link Copied! ✓" : "Copy Link"}</span>
            </button>

            <button
              type="button"
              onClick={handleWhatsAppShare}
              disabled={!referralCode}
              style={{
                background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "0.65rem 0.75rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                boxShadow: "0 4px 12px rgba(37, 211, 102, 0.25)",
                transition: "all 0.2s ease",
              }}
            >
              <span>📲</span>
              <span>Share WhatsApp</span>
            </button>
          </div>

          {/* Referral Stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.6rem",
              marginTop: "0.2rem",
            }}
          >
            <div
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                borderRadius: 10,
                padding: "0.65rem 0.85rem",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div style={{ fontSize: "0.68rem", color: "var(--muted, #94a3b8)", textTransform: "uppercase", fontWeight: 700 }}>
                Friends Joined
              </div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", marginTop: "0.15rem" }}>
                {referralCount}
              </div>
            </div>

            <div
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                borderRadius: 10,
                padding: "0.65rem 0.85rem",
                border: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div style={{ fontSize: "0.68rem", color: "var(--muted, #94a3b8)", textTransform: "uppercase", fontWeight: 700 }}>
                Referral Earnings
              </div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#4ade80", marginTop: "0.15rem" }}>
                ₹{referralEarnings}
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--muted, #64748b)" }}>
          Speak &amp; Shine AI Fluency Lab &bull; Keep speaking every day to shine!
        </div>
      </div>
    </div>
  );
}
