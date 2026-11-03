import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import api from "../api/client.js";
import { getSharedSocket } from "../hooks/useSocket.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function UserProfileModal({ isOpen, onClose, user, onThemeToggle }) {
  const { updateUser } = useAuth() || {};
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "edit" | "security"

  // Referral states
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Edit Profile states
  const fileInputRef = useRef(null);
  const [editName, setEditName] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Security: Password change states
  const [pwdForm, setPwdForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingPwd, setSavingPwd] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  // Security: Phone change states
  const [phoneForm, setPhoneForm] = useState({ newPhone: "", password: "" });
  const [savingPhone, setSavingPhone] = useState(false);

  // Status feedback message { type: 'success' | 'error', message: '' }
  const [feedback, setFeedback] = useState(null);

  const showMsg = (message, type = "success") => {
    setFeedback({ message, type });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

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
          const initialName = res.data.auth?.name || res.data.user?.name || user?.name || "";
          setEditName(initialName);
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
      setActiveTab("overview");
      setCopiedCode(false);
      setCopiedLink(false);
      setPhotoFile(null);
      setPhotoPreview(null);
      setFeedback(null);
      setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPhoneForm({ newPhone: "", password: "" });
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
  const avatarUrl = photoPreview || authUser?.avatarUrl || userDetails?.avatarUrl || user?.avatarUrl || null;
  const isPaid = userDetails?.paid ?? user?.paid ?? false;
  const walletBalance = userDetails?.walletBalance ?? 0;
  const walletHistory = userDetails?.walletHistory || [];
  const referralCode = userDetails?.referralCode || "";
  const referralCount = userDetails?.referralCount ?? 0;
  const referralEarnings = userDetails?.referralEarnings ?? 0;
  const referralRewardAmount = profileData?.referralRewardAmount ?? userDetails?.referralRewardAmount ?? 5;

  // Build referral URL
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

  // Handle Photo selection
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showMsg("Please select an image file (JPG, PNG, WebP)", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showMsg("Image size exceeds 5MB limit", "error");
      return;
    }

    setPhotoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);
  };

  // Submit Profile update (Name and/or Photo via Cloudinary)
  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    if (!editName.trim()) {
      showMsg("Please enter a valid display name", "error");
      return;
    }

    setSavingProfile(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append("name", editName.trim());
      if (photoFile) {
        formData.append("photo", photoFile);
      }

      const res = await api.patch("/users/me/profile", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.success) {
        showMsg("Profile updated successfully!");
        setPhotoFile(null);
        if (res.data.avatarUrl) {
          setPhotoPreview(res.data.avatarUrl);
        }
        // Update local profile state
        setProfileData((prev) => ({
          ...prev,
          auth: { ...prev?.auth, name: res.data.name, avatarUrl: res.data.avatarUrl },
          user: { ...prev?.user, name: res.data.name, avatarUrl: res.data.avatarUrl },
        }));
        // Update global auth context
        if (updateUser) {
          updateUser({ name: res.data.name, avatarUrl: res.data.avatarUrl });
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || "Failed to update profile";
      showMsg(errorMsg, "error");
    } finally {
      setSavingProfile(false);
    }
  };

  // Remove Profile Photo
  const handleRemovePhoto = async () => {
    setSavingProfile(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append("removePhoto", "true");
      if (editName.trim()) {
        formData.append("name", editName.trim());
      }

      const res = await api.patch("/users/me/profile", formData);
      if (res.data?.success) {
        showMsg("Profile photo removed");
        setPhotoFile(null);
        setPhotoPreview(null);
        setProfileData((prev) => ({
          ...prev,
          auth: { ...prev?.auth, avatarUrl: null },
          user: { ...prev?.user, avatarUrl: null },
        }));
        if (updateUser) {
          updateUser({ avatarUrl: null });
        }
      }
    } catch (err) {
      showMsg(err.response?.data?.error || "Failed to remove photo", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  // Submit Password Change
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pwdForm.currentPassword) {
      showMsg("Please enter your current password", "error");
      return;
    }
    if (!pwdForm.newPassword || pwdForm.newPassword.length < 6) {
      showMsg("New password must be at least 6 characters long", "error");
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      showMsg("New passwords do not match", "error");
      return;
    }

    setSavingPwd(true);
    setFeedback(null);
    try {
      const res = await api.patch("/users/me/password", {
        currentPassword: pwdForm.currentPassword,
        newPassword: pwdForm.newPassword,
      });
      if (res.data?.success) {
        showMsg("Password changed successfully! Keep it safe.");
        setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    } catch (err) {
      showMsg(err.response?.data?.error || "Failed to change password", "error");
    } finally {
      setSavingPwd(false);
    }
  };

  // Submit Phone Number Change
  const handleChangePhone = async (e) => {
    e.preventDefault();
    const clean = phoneForm.newPhone.replace(/[^\d]/g, "").replace(/^(\+91|91)/, "");
    if (clean.length !== 10) {
      showMsg("Please enter a valid 10-digit mobile number", "error");
      return;
    }
    if (!phoneForm.password) {
      showMsg("Please enter your current password to authorize phone change", "error");
      return;
    }

    setSavingPhone(true);
    setFeedback(null);
    try {
      const res = await api.patch("/users/me/phone", {
        newPhone: clean,
        password: phoneForm.password,
      });
      if (res.data?.success) {
        showMsg("Mobile number updated successfully!");
        setPhoneForm({ newPhone: "", password: "" });
        setProfileData((prev) => ({
          ...prev,
          auth: { ...prev?.auth, phone: res.data.phone },
          user: { ...prev?.user, phone: res.data.phone },
        }));
        if (updateUser) {
          updateUser({ phone: res.data.phone });
        }
      }
    } catch (err) {
      showMsg(err.response?.data?.error || "Failed to update phone number", "error");
    } finally {
      setSavingPhone(false);
    }
  };

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
          gap: "1.15rem",
          position: "relative",
        }}
      >
        {/* Hidden File Input for Cloudinary avatar upload */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handlePhotoSelect}
          style={{ display: "none" }}
        />

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
            zIndex: 10,
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

        {/* ── Profile Header with Avatar & Quick Photo Upload ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexShrink: 0 }}>
          {/* Avatar with Camera badge */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #7c6fff 0%, #4f46e5 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: "1.4rem",
                boxShadow: "0 0 16px rgba(124, 111, 255, 0.4)",
                flexShrink: 0,
                overflow: "hidden",
                border: "2px solid rgba(124, 111, 255, 0.45)",
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                initials
              )}
            </div>
            {/* Quick Camera button to trigger Cloudinary file picker */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Change profile photo (Cloudinary)"
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "#7c6fff",
                border: "2px solid #13111c",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "0.75rem",
                boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              📷
            </button>
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

        {/* ── Tab Navigation ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "0.35rem",
            background: "rgba(255, 255, 255, 0.04)",
            padding: "0.25rem",
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.08)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => { setActiveTab("overview"); setFeedback(null); }}
            style={{
              padding: "0.5rem 0.35rem",
              borderRadius: 8,
              border: "none",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              background: activeTab === "overview" ? "rgba(124, 111, 255, 0.25)" : "transparent",
              color: activeTab === "overview" ? "#fff" : "var(--muted, #94a3b8)",
              borderBottom: activeTab === "overview" ? "2px solid #7c6fff" : "2px solid transparent",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.3rem",
            }}
          >
            <span>🎁</span> Overview
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("edit"); setFeedback(null); }}
            style={{
              padding: "0.5rem 0.35rem",
              borderRadius: 8,
              border: "none",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              background: activeTab === "edit" ? "rgba(124, 111, 255, 0.25)" : "transparent",
              color: activeTab === "edit" ? "#fff" : "var(--muted, #94a3b8)",
              borderBottom: activeTab === "edit" ? "2px solid #7c6fff" : "2px solid transparent",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.3rem",
            }}
          >
            <span>✏️</span> Edit Profile
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("security"); setFeedback(null); }}
            style={{
              padding: "0.5rem 0.35rem",
              borderRadius: 8,
              border: "none",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              background: activeTab === "security" ? "rgba(124, 111, 255, 0.25)" : "transparent",
              color: activeTab === "security" ? "#fff" : "var(--muted, #94a3b8)",
              borderBottom: activeTab === "security" ? "2px solid #7c6fff" : "2px solid transparent",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.3rem",
            }}
          >
            <span>🔒</span> Security
          </button>
        </div>

        {/* ── Status Feedback Banner ── */}
        {feedback && (
          <div
            style={{
              padding: "0.65rem 0.9rem",
              borderRadius: 10,
              fontSize: "0.82rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: feedback.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${feedback.type === "success" ? "rgba(34, 197, 94, 0.35)" : "rgba(239, 68, 68, 0.35)"}`,
              color: feedback.type === "success" ? "#4ade80" : "#fca5a5",
              animation: "fadeIn 0.2s ease",
            }}
          >
            <span>{feedback.type === "success" ? "✓" : "⚠️"}</span>
            <span>{feedback.message}</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: OVERVIEW & REFERRAL                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <>
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
                  {showHistory ? "Hide Activity" : `View Activity ${walletHistory.length > 0 ? `(${walletHistory.length})` : ""}`}
                </button>
              </div>
            </div>

            {/* Optional Wallet History Dropdown */}
            {showHistory && (
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
                {walletHistory.length === 0 ? (
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8", textAlign: "center", padding: "0.5rem" }}>
                    No wallet activity recorded yet.
                  </div>
                ) : (
                  walletHistory.slice(-5).reverse().map((entry, idx) => (
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
                )))}
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
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: EDIT PROFILE (Name & Cloudinary Photo)                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "edit" && (
          <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Profile Photo Section */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 14,
                padding: "1.1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                🖼️ Profile Photo
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "1.2rem" }}>
                {/* Large Preview Circle */}
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #7c6fff 0%, #4f46e5 100%)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: "1.6rem",
                    boxShadow: "0 0 16px rgba(124, 111, 255, 0.3)",
                    overflow: "hidden",
                    flexShrink: 0,
                    border: "2px solid rgba(124, 111, 255, 0.5)",
                  }}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    initials
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", flex: 1 }}>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={savingProfile}
                      style={{
                        background: "rgba(124, 111, 255, 0.2)",
                        border: "1px solid rgba(124, 111, 255, 0.45)",
                        color: "#c7d2fe",
                        padding: "0.45rem 0.85rem",
                        borderRadius: 8,
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <span>📁</span>
                      <span>{photoFile ? "Choose Different" : "Upload Photo"}</span>
                    </button>

                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        disabled={savingProfile}
                        style={{
                          background: "rgba(239, 68, 68, 0.12)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          color: "#fca5a5",
                          padding: "0.45rem 0.75rem",
                          borderRadius: 8,
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)", lineHeight: 1.35 }}>
                    Supports JPG, PNG, WebP up to 5MB. Auto-cropped to square using Cloudinary AI face-detection.
                  </div>
                </div>
              </div>
            </div>

            {/* Display Name Section */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 14,
                padding: "1.1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                👤 Full Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter your full name"
                required
                maxLength={60}
                style={{
                  background: "rgba(0, 0, 0, 0.3)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: 10,
                  padding: "0.65rem 0.85rem",
                  color: "#fff",
                  fontSize: "0.95rem",
                  outline: "none",
                }}
              />
              <div style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)" }}>
                This name appears on the leaderboard, reports, and community sessions.
              </div>
            </div>

            {/* Save Profile Button */}
            <button
              type="submit"
              disabled={savingProfile}
              style={{
                background: "linear-gradient(135deg, #7c6fff 0%, #4f46e5 100%)",
                border: "none",
                color: "#fff",
                padding: "0.75rem 1rem",
                borderRadius: 12,
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(124, 111, 255, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                transition: "opacity 0.2s ease",
                opacity: savingProfile ? 0.7 : 1,
              }}
            >
              <span>{savingProfile ? "Saving..." : "💾 Save Changes"}</span>
            </button>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: SECURITY (Password & Phone change)                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "security" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Change Password Card */}
            <form
              onSubmit={handleChangePassword}
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 14,
                padding: "1.1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                🔑 Change Password
              </div>

              <div>
                <label style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                  Current Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showCurrentPwd ? "text" : "password"}
                    value={pwdForm.currentPassword}
                    onChange={(e) => setPwdForm((p) => ({ ...p, currentPassword: e.target.value }))}
                    placeholder="Enter current password"
                    required
                    style={{
                      width: "100%",
                      background: "rgba(0, 0, 0, 0.3)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: 10,
                      padding: "0.6rem 2.4rem 0.6rem 0.8rem",
                      color: "#fff",
                      fontSize: "0.88rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPwd((s) => !s)}
                    style={{
                      position: "absolute",
                      right: "0.7rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      padding: 0,
                    }}
                  >
                    {showCurrentPwd ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
                <div>
                  <label style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                    New Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showNewPwd ? "text" : "password"}
                      value={pwdForm.newPassword}
                      onChange={(e) => setPwdForm((p) => ({ ...p, newPassword: e.target.value }))}
                      placeholder="Min 6 characters"
                      required
                      minLength={6}
                      style={{
                        width: "100%",
                        background: "rgba(0, 0, 0, 0.3)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        borderRadius: 10,
                        padding: "0.6rem 2.4rem 0.6rem 0.8rem",
                        color: "#fff",
                        fontSize: "0.88rem",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPwd((s) => !s)}
                      style={{
                        position: "absolute",
                        right: "0.7rem",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        padding: 0,
                      }}
                    >
                      {showNewPwd ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={pwdForm.confirmPassword}
                    onChange={(e) => setPwdForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Repeat password"
                    required
                    style={{
                      width: "100%",
                      background: "rgba(0, 0, 0, 0.3)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: 10,
                      padding: "0.6rem 0.8rem",
                      color: "#fff",
                      fontSize: "0.88rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingPwd}
                style={{
                  background: "rgba(124, 111, 255, 0.2)",
                  border: "1px solid rgba(124, 111, 255, 0.4)",
                  color: "#c7d2fe",
                  padding: "0.65rem 1rem",
                  borderRadius: 10,
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: "0.2rem",
                }}
              >
                {savingPwd ? "Updating..." : "Update Password"}
              </button>
            </form>

            {/* Change Mobile Number Card */}
            <form
              onSubmit={handleChangePhone}
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 14,
                padding: "1.1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                📱 Update Mobile Number
              </div>

              <div style={{ fontSize: "0.78rem", color: "var(--muted, #94a3b8)" }}>
                Current linked phone: <strong style={{ color: "#fff" }}>{displayPhone || "None"}</strong>
              </div>

              <div>
                <label style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                  New 10-Digit Mobile Number
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--muted, #94a3b8)", fontWeight: 700 }}>+91</span>
                  <input
                    type="tel"
                    value={phoneForm.newPhone}
                    onChange={(e) => setPhoneForm((p) => ({ ...p, newPhone: e.target.value.replace(/[^\d]/g, "").slice(0, 10) }))}
                    placeholder="9876543210"
                    maxLength={10}
                    required
                    style={{
                      flex: 1,
                      background: "rgba(0, 0, 0, 0.3)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: 10,
                      padding: "0.6rem 0.8rem",
                      color: "#fff",
                      fontSize: "0.95rem",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                  Account Password Confirmation
                </label>
                <input
                  type="password"
                  value={phoneForm.password}
                  onChange={(e) => setPhoneForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Enter current password to authorize"
                  required
                  style={{
                    width: "100%",
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: 10,
                    padding: "0.6rem 0.8rem",
                    color: "#fff",
                    fontSize: "0.88rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={savingPhone}
                style={{
                  background: "rgba(124, 111, 255, 0.2)",
                  border: "1px solid rgba(124, 111, 255, 0.4)",
                  color: "#c7d2fe",
                  padding: "0.65rem 1rem",
                  borderRadius: 10,
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: "0.2rem",
                }}
              >
                {savingPhone ? "Updating Phone..." : "Confirm & Update Phone"}
              </button>
            </form>
          </div>
        )}

        {/* Footer info */}
        <div style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--muted, #64748b)" }}>
          Speak &amp; Shine AI Fluency Lab &bull; Keep speaking every day to shine!
        </div>
      </div>
    </div>
  );
}
