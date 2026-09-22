import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import api from "../api/client.js";
import { getSharedSocket } from "../hooks/useSocket.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Profile() {
  const { user, updateUser } = useAuth() || {};
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Read initial tab from URL query param ?tab= (defaults to "overview")
  const initialTab = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(
    ["overview", "edit", "security"].includes(initialTab) ? initialTab : "overview"
  );

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setSearchParams({ tab: tabKey }, { replace: true });
    setFeedback(null);
  };

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
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

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
        console.warn("[ProfilePage] Failed to load profile:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Real-time wallet update listener via Socket.IO
  useEffect(() => {
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
  }, []);

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
    } catch {}
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
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
      showMsg("Please select an image file (JPG, PNG, WebP, GIF)", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showMsg("Image size exceeds 5MB limit", "error");
      return;
    }

    setPhotoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);
    // Switch to edit tab if on overview so user sees the preview and can save
    if (activeTab !== "edit") {
      handleTabChange("edit");
    }
  };

  // Submit Profile update (Name and/or Photo via Cloudinary)
  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    if (!editName.trim()) {
      showMsg("Please enter a valid full name", "error");
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
        showMsg("Profile details saved successfully!");
        setPhotoFile(null);
        if (res.data.avatarUrl) {
          setPhotoPreview(res.data.avatarUrl);
        }
        setProfileData((prev) => ({
          ...prev,
          auth: { ...prev?.auth, name: res.data.name, avatarUrl: res.data.avatarUrl },
          user: { ...prev?.user, name: res.data.name, avatarUrl: res.data.avatarUrl },
        }));
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
        showMsg("Password updated successfully! Keep your credentials safe.");
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
      showMsg("Please enter your current password to authorize this change", "error");
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
    <Layout title="My Profile" subtitle="Account Settings, Security & Referral Rewards">
      {/* Hidden File Input for Cloudinary photo upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handlePhotoSelect}
        style={{ display: "none" }}
      />

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "1.25rem 1rem 3rem" }}>

        {/* ── Status Feedback Banner ── */}
        {feedback && (
          <div
            style={{
              padding: "0.85rem 1.25rem",
              borderRadius: 14,
              fontSize: "0.9rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              marginBottom: "1.5rem",
              background: feedback.type === "success" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
              border: `1px solid ${feedback.type === "success" ? "rgba(34, 197, 94, 0.35)" : "rgba(239, 68, 68, 0.35)"}`,
              color: feedback.type === "success" ? "#4ade80" : "#fca5a5",
              boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
              animation: "slideDownIn 0.25s ease",
            }}
          >
            <span style={{ fontSize: "1.2rem" }}>{feedback.type === "success" ? "✓" : "⚠️"}</span>
            <span style={{ flex: 1 }}>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: "1rem" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Section 1: Hero Banner & Identity Card ── */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(124, 111, 255, 0.14) 0%, rgba(79, 70, 229, 0.06) 100%)",
            border: "1px solid rgba(124, 111, 255, 0.25)",
            borderRadius: 20,
            padding: "1.75rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1.5rem",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          }}
        >
          {/* Avatar and Info */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", minWidth: 260 }}>
            {/* Avatar Circle with Cloudinary quick upload camera badge */}
            <div style={{ position: "relative" }}>
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #7c6fff 0%, #4f46e5 100%)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "1.9rem",
                  boxShadow: "0 0 24px rgba(124, 111, 255, 0.45)",
                  overflow: "hidden",
                  border: "3px solid rgba(124, 111, 255, 0.55)",
                  flexShrink: 0,
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Change photo via Cloudinary"
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "#7c6fff",
                  border: "2px solid #0f0d19",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
                  transition: "transform 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                📷
              </button>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.01em", color: "#fff" }}>
                  {displayName}
                </h1>
                <span
                  style={{
                    background: displayRole === "admin" || displayRole === "admins"
                      ? "rgba(239, 68, 68, 0.2)"
                      : displayRole === "trainer"
                      ? "rgba(168, 85, 247, 0.2)"
                      : "rgba(124, 111, 255, 0.2)",
                    color: displayRole === "admin" || displayRole === "admins"
                      ? "#fca5a5"
                      : displayRole === "trainer"
                      ? "#d8b4fe"
                      : "#c7d2fe",
                    border: `1px solid ${
                      displayRole === "admin" || displayRole === "admins"
                        ? "rgba(239, 68, 68, 0.4)"
                        : displayRole === "trainer"
                        ? "rgba(168, 85, 247, 0.4)"
                        : "rgba(124, 111, 255, 0.4)"
                    }`,
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "0.2rem 0.6rem",
                    borderRadius: 99,
                    textTransform: "capitalize",
                  }}
                >
                  {displayRole}
                </span>
              </div>

              <div style={{ color: "var(--muted, #94a3b8)", fontSize: "0.88rem", marginTop: "0.3rem" }}>
                📱 +91 {displayPhone || "Not configured"}
              </div>

              <div style={{ marginTop: "0.45rem" }}>
                {isPaid ? (
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#4ade80", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>✅</span> Subscription Active
                  </span>
                ) : (
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fbbf24", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>⚠️</span> Payment Required &bull;{" "}
                    <Link to="/payment-history" style={{ color: "#38bdf8", textDecoration: "underline" }}>
                      Activate Membership
                    </Link>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats or Actions */}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => handleTabChange("edit")}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                color: "#fff",
                padding: "0.6rem 1.1rem",
                borderRadius: 12,
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                transition: "all 0.2s ease",
              }}
            >
              <span>✏️</span> Edit Profile
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("security")}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                color: "#fff",
                padding: "0.6rem 1.1rem",
                borderRadius: 12,
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                transition: "all 0.2s ease",
              }}
            >
              <span>🔒</span> Security
            </button>
          </div>
        </div>

        {/* ── Navigation Tabs ── */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
            marginBottom: "1.75rem",
            paddingBottom: "0.25rem",
            overflowX: "auto",
          }}
        >
          <button
            type="button"
            onClick={() => handleTabChange("overview")}
            style={{
              background: activeTab === "overview" ? "rgba(124, 111, 255, 0.18)" : "transparent",
              color: activeTab === "overview" ? "#fff" : "var(--muted, #94a3b8)",
              border: "none",
              borderBottom: activeTab === "overview" ? "3px solid #7c6fff" : "3px solid transparent",
              padding: "0.75rem 1.25rem",
              borderRadius: "8px 8px 0 0",
              fontWeight: 700,
              fontSize: "0.92rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            <span>🎁</span> Overview &amp; Referrals
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("edit")}
            style={{
              background: activeTab === "edit" ? "rgba(124, 111, 255, 0.18)" : "transparent",
              color: activeTab === "edit" ? "#fff" : "var(--muted, #94a3b8)",
              border: "none",
              borderBottom: activeTab === "edit" ? "3px solid #7c6fff" : "3px solid transparent",
              padding: "0.75rem 1.25rem",
              borderRadius: "8px 8px 0 0",
              fontWeight: 700,
              fontSize: "0.92rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            <span>✏️</span> Edit Profile Details
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("security")}
            style={{
              background: activeTab === "security" ? "rgba(124, 111, 255, 0.18)" : "transparent",
              color: activeTab === "security" ? "#fff" : "var(--muted, #94a3b8)",
              border: "none",
              borderBottom: activeTab === "security" ? "3px solid #7c6fff" : "3px solid transparent",
              padding: "0.75rem 1.25rem",
              borderRadius: "8px 8px 0 0",
              fontWeight: 700,
              fontSize: "0.92rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            <span>🔒</span> Password &amp; Phone Security
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: OVERVIEW & REFERRAL                                         */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* Wallet Card */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(124, 111, 255, 0.12) 0%, rgba(99, 102, 241, 0.04) 100%)",
                border: "1px solid rgba(124, 111, 255, 0.3)",
                borderRadius: 18,
                padding: "1.5rem 1.75rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1.25rem",
                boxShadow: "0 6px 24px rgba(0, 0, 0, 0.25)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#a5b4fc", fontWeight: 800 }}>
                  👛 Live Wallet Balance
                </div>
                <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "#fff", lineHeight: 1.1, marginTop: "0.35rem" }}>
                  ₹{walletBalance}
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--muted, #94a3b8)", marginTop: "0.35rem" }}>
                  Wallet cash is automatically applied on checkouts and membership renewals.
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", alignItems: "flex-end" }}>
                <Link
                  to="/payment-history"
                  style={{
                    background: "rgba(124, 111, 255, 0.22)",
                    border: "1px solid rgba(124, 111, 255, 0.45)",
                    color: "#c7d2fe",
                    padding: "0.6rem 1.1rem",
                    borderRadius: 10,
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                  }}
                >
                  <span>💳 Payments &amp; Invoices</span>
                </Link>

                {walletHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory((h) => !h)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#94a3b8",
                      fontSize: "0.8rem",
                      textDecoration: "underline",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {showHistory ? "Hide Wallet Activity" : `View Activity (${walletHistory.length})`}
                  </button>
                )}
              </div>
            </div>

            {/* Wallet History Table / Drawer */}
            {showHistory && walletHistory.length > 0 && (
              <div
                style={{
                  background: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 16,
                  padding: "1.25rem 1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Recent Transactions
                </div>
                {walletHistory.slice(-8).reverse().map((entry, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "1rem",
                      paddingBottom: idx < Math.min(walletHistory.length, 8) - 1 ? "0.75rem" : 0,
                      borderBottom: idx < Math.min(walletHistory.length, 8) - 1 ? "1px solid rgba(255, 255, 255, 0.08)" : "none",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          color: entry.type === "credit" ? "#4ade80" : "#f87171",
                          fontWeight: 700,
                          fontSize: "0.9rem",
                          lineHeight: 1.45,
                        }}
                      >
                        {entry.type === "credit" ? "+" : "-"}₹{entry.amount} &bull; {entry.reason}
                      </div>
                      <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.2rem" }}>
                        {new Date(entry.date).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <span
                      style={{
                        color: "#cbd5e1",
                        fontWeight: 700,
                        fontSize: "0.8rem",
                        flexShrink: 0,
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        padding: "0.3rem 0.65rem",
                        borderRadius: 8,
                      }}
                    >
                      Bal: ₹{entry.balanceAfter}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Refer & Earn Section */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(245, 158, 11, 0.02) 100%)",
                border: "1px solid rgba(251, 191, 36, 0.28)",
                borderRadius: 20,
                padding: "1.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>🎁</span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#fbbf24" }}>
                      Refer a Friend &amp; Earn ₹{referralRewardAmount}
                    </h2>
                    <div style={{ fontSize: "0.82rem", color: "var(--muted, #cbd5e1)", marginTop: "0.2rem" }}>
                      Share your unique code. When your friend signs up and completes membership payment, ₹{referralRewardAmount} is instantly credited to your wallet!
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    background: "rgba(251, 191, 36, 0.2)",
                    color: "#fbbf24",
                    padding: "0.3rem 0.75rem",
                    borderRadius: 99,
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                  }}
                >
                  ₹{referralRewardAmount} PER FRIEND
                </span>
              </div>

              {/* Code Box */}
              <div>
                <label style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "0.4rem" }}>
                  Your Unique Referral Code
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px dashed rgba(251, 191, 36, 0.45)",
                    padding: "0.75rem 1.25rem",
                    borderRadius: 12,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontFamily: "monospace",
                      fontSize: "1.3rem",
                      fontWeight: 800,
                      letterSpacing: "0.12em",
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
                      borderRadius: 10,
                      padding: "0.55rem 1rem",
                      fontSize: "0.85rem",
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" }}>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  disabled={!referralLink}
                  style={{
                    background: copiedLink ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 255, 255, 0.08)",
                    color: copiedLink ? "#4ade80" : "#f1f5f9",
                    border: copiedLink ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: 12,
                    padding: "0.85rem 1rem",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    transition: "all 0.2s ease",
                  }}
                >
                  <span>🔗</span>
                  <span>{copiedLink ? "Link Copied! ✓" : "Copy Direct Invitation Link"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  disabled={!referralCode}
                  style={{
                    background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "0.85rem 1rem",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    boxShadow: "0 4px 16px rgba(37, 211, 102, 0.3)",
                    transition: "all 0.2s ease",
                  }}
                >
                  <span>📲</span>
                  <span>Share on WhatsApp</span>
                </button>
              </div>

              {/* Referral Stats Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.25)",
                    borderRadius: 14,
                    padding: "1rem 1.25rem",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)", textTransform: "uppercase", fontWeight: 700 }}>
                    Friends Joined
                  </div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#fff", marginTop: "0.25rem" }}>
                    {referralCount}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.25)",
                    borderRadius: 14,
                    padding: "1rem 1.25rem",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)", textTransform: "uppercase", fontWeight: 700 }}>
                    Total Referral Rewards Earned
                  </div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#4ade80", marginTop: "0.25rem" }}>
                    ₹{referralEarnings}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: EDIT PROFILE                                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "edit" && (
          <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* Profile Photo Card */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 18,
                padding: "1.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#a5b4fc" }}>
                  🖼️ Profile Picture
                </h3>
                <div style={{ fontSize: "0.82rem", color: "var(--muted, #94a3b8)", marginTop: "0.25rem" }}>
                  Upload a photo to represent you on the community leaderboard and speaking sessions.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "1.75rem", flexWrap: "wrap" }}>
                {/* Photo Preview Circle */}
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #7c6fff 0%, #4f46e5 100%)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: "2rem",
                    boxShadow: "0 0 20px rgba(124, 111, 255, 0.35)",
                    overflow: "hidden",
                    border: "3px solid rgba(124, 111, 255, 0.5)",
                    flexShrink: 0,
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

                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={savingProfile}
                      style={{
                        background: "rgba(124, 111, 255, 0.22)",
                        border: "1px solid rgba(124, 111, 255, 0.5)",
                        color: "#c7d2fe",
                        padding: "0.6rem 1.1rem",
                        borderRadius: 10,
                        fontSize: "0.88rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.45rem",
                      }}
                    >
                      <span>📁</span>
                      <span>{photoFile ? "Choose Different Image" : "Upload Photo"}</span>
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
                          padding: "0.6rem 1rem",
                          borderRadius: 10,
                          fontSize: "0.88rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: "0.78rem", color: "var(--muted, #94a3b8)", lineHeight: 1.45 }}>
                    Cloudinary storage setup: Supports JPG, PNG, WebP up to 5MB. Face detection automatically centers and crops your avatar cleanly.
                  </div>
                </div>
              </div>
            </div>

            {/* Display Name Card */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 18,
                padding: "1.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 800, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: "0.06em", display: "block" }}>
                  👤 Full Display Name
                </label>
                <div style={{ fontSize: "0.8rem", color: "var(--muted, #94a3b8)", marginTop: "0.25rem" }}>
                  Your name visible to peers, trainers, and leaderboard participants.
                </div>
              </div>

              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter full name"
                required
                maxLength={60}
                style={{
                  maxWidth: 420,
                  background: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(255, 255, 255, 0.18)",
                  borderRadius: 12,
                  padding: "0.75rem 1rem",
                  color: "#fff",
                  fontSize: "1rem",
                  outline: "none",
                }}
              />
            </div>

            {/* Save Button */}
            <div>
              <button
                type="submit"
                disabled={savingProfile}
                style={{
                  background: "linear-gradient(135deg, #7c6fff 0%, #4f46e5 100%)",
                  border: "none",
                  color: "#fff",
                  padding: "0.85rem 1.75rem",
                  borderRadius: 12,
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 18px rgba(124, 111, 255, 0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  opacity: savingProfile ? 0.7 : 1,
                  transition: "opacity 0.2s ease",
                }}
              >
                <span>{savingProfile ? "Saving Details..." : "💾 Save Profile Changes"}</span>
              </button>
            </div>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: ACCOUNT & SECURITY                                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "security" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>

            {/* Change Password Card */}
            <form
              onSubmit={handleChangePassword}
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 18,
                padding: "1.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.1rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#a5b4fc" }}>
                  🔑 Change Password
                </h3>
                <div style={{ fontSize: "0.82rem", color: "var(--muted, #94a3b8)", marginTop: "0.25rem" }}>
                  Update your password to keep your account safe. Minimum 6 characters required.
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", color: "var(--muted, #94a3b8)", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                  Current Password
                </label>
                <div style={{ position: "relative", maxWidth: 420 }}>
                  <input
                    type={showCurrentPwd ? "text" : "password"}
                    value={pwdForm.currentPassword}
                    onChange={(e) => setPwdForm((p) => ({ ...p, currentPassword: e.target.value }))}
                    placeholder="Enter current password"
                    required
                    style={{
                      width: "100%",
                      background: "rgba(0, 0, 0, 0.35)",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      borderRadius: 12,
                      padding: "0.75rem 2.6rem 0.75rem 1rem",
                      color: "#fff",
                      fontSize: "0.95rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPwd((s) => !s)}
                    style={{
                      position: "absolute",
                      right: "0.85rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: "1rem",
                      padding: 0,
                    }}
                  >
                    {showCurrentPwd ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", maxWidth: 640 }}>
                <div>
                  <label style={{ fontSize: "0.78rem", color: "var(--muted, #94a3b8)", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
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
                        background: "rgba(0, 0, 0, 0.35)",
                        border: "1px solid rgba(255, 255, 255, 0.18)",
                        borderRadius: 12,
                        padding: "0.75rem 2.6rem 0.75rem 1rem",
                        color: "#fff",
                        fontSize: "0.95rem",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPwd((s) => !s)}
                      style={{
                        position: "absolute",
                        right: "0.85rem",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        fontSize: "1rem",
                        padding: 0,
                      }}
                    >
                      {showNewPwd ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.78rem", color: "var(--muted, #94a3b8)", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={pwdForm.confirmPassword}
                    onChange={(e) => setPwdForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Repeat new password"
                    required
                    style={{
                      width: "100%",
                      background: "rgba(0, 0, 0, 0.35)",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      borderRadius: 12,
                      padding: "0.75rem 1rem",
                      color: "#fff",
                      fontSize: "0.95rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={savingPwd}
                  style={{
                    background: "rgba(124, 111, 255, 0.22)",
                    border: "1px solid rgba(124, 111, 255, 0.45)",
                    color: "#c7d2fe",
                    padding: "0.75rem 1.5rem",
                    borderRadius: 12,
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {savingPwd ? "Updating Password..." : "Update Password"}
                </button>
              </div>
            </form>

            {/* Change Mobile Number Card */}
            <form
              onSubmit={handleChangePhone}
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 18,
                padding: "1.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.1rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#a5b4fc" }}>
                  📱 Update Mobile Number
                </h3>
                <div style={{ fontSize: "0.82rem", color: "var(--muted, #94a3b8)", marginTop: "0.25rem" }}>
                  Current linked login &amp; WhatsApp number: <strong style={{ color: "#fff" }}>+91 {displayPhone || "None"}</strong>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", color: "var(--muted, #94a3b8)", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                  New 10-Digit Mobile Number
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", maxWidth: 420 }}>
                  <span style={{ fontSize: "0.95rem", color: "var(--muted, #94a3b8)", fontWeight: 800 }}>+91</span>
                  <input
                    type="tel"
                    value={phoneForm.newPhone}
                    onChange={(e) => setPhoneForm((p) => ({ ...p, newPhone: e.target.value.replace(/[^\d]/g, "").slice(0, 10) }))}
                    placeholder="9876543210"
                    maxLength={10}
                    required
                    style={{
                      flex: 1,
                      background: "rgba(0, 0, 0, 0.35)",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      borderRadius: 12,
                      padding: "0.75rem 1rem",
                      color: "#fff",
                      fontSize: "1rem",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", color: "var(--muted, #94a3b8)", fontWeight: 700, display: "block", marginBottom: "0.3rem" }}>
                  Current Account Password (for Authorization)
                </label>
                <input
                  type="password"
                  value={phoneForm.password}
                  onChange={(e) => setPhoneForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Enter current password to authorize"
                  required
                  style={{
                    maxWidth: 420,
                    width: "100%",
                    background: "rgba(0, 0, 0, 0.35)",
                    border: "1px solid rgba(255, 255, 255, 0.18)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                    color: "#fff",
                    fontSize: "0.95rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={savingPhone}
                  style={{
                    background: "rgba(124, 111, 255, 0.22)",
                    border: "1px solid rgba(124, 111, 255, 0.45)",
                    color: "#c7d2fe",
                    padding: "0.75rem 1.5rem",
                    borderRadius: 12,
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {savingPhone ? "Updating Phone..." : "Authorize & Update Mobile Number"}
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </Layout>
  );
}
