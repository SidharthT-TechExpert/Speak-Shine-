import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import api from "../api/client.js";
import { getSharedSocket } from "../hooks/useSocket.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Profile() {
  const { user, updateUser } = useAuth() || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  const initialTab = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(
    ["overview", "edit", "security"].includes(initialTab) ? initialTab : "overview"
  );

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setSearchParams({ tab: tabKey }, { replace: true });
    setFeedback(null);
  };

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef(null);
  const [editName, setEditName] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingPwd, setSavingPwd] = useState(false);
  const [showPwd, setShowPwd] = useState({ current: false, newP: false, confirm: false });
  const [feedback, setFeedback] = useState(null);

  const showMsg = (message, type = "success") => {
    setFeedback({ message, type });
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => setFeedback(p => p?.message === message ? null : p), 5000);
  };

  const loadProfile = () => {
    setLoading(true);
    api.get("/users/me")
      .then(res => {
        if (res.data) {
          setProfileData(res.data);
          setEditName(res.data.auth?.name || res.data.user?.name || user?.name || "");
        }
      })
      .catch(err => console.warn("[Profile]", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadProfile(); }, []);

  useEffect(() => {
    const socket = getSharedSocket();
    if (!socket) return;
    const onWallet = (data) => setProfileData(p => p?.user ? {
      ...p, user: { ...p.user, walletBalance: data.walletBalance, referralEarnings: (p.user.referralEarnings || 0) + (data.creditAmount || 0) }
    } : p);
    socket.on("wallet:updated", onWallet);
    return () => socket.off("wallet:updated", onWallet);
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
  const origin = typeof window !== "undefined" ? (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin) : "";
  const referralLink = referralCode ? `${origin}/register?ref=${encodeURIComponent(referralCode)}` : "";
  const initials = displayName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "SS";

  const roleConfig = {
    admin:   { label: "Admin",   color: "#f43f5e", bg: "rgba(244,63,94,0.14)", border: "rgba(244,63,94,0.3)" },
    admins:  { label: "Admin",   color: "#f43f5e", bg: "rgba(244,63,94,0.14)", border: "rgba(244,63,94,0.3)" },
    trainer: { label: "Trainer", color: "#a855f7", bg: "rgba(168,85,247,0.14)", border: "rgba(168,85,247,0.3)" },
    user:    { label: "Member",  color: "#818cf8", bg: "rgba(129,140,248,0.14)", border: "rgba(129,140,248,0.3)" },
  }[displayRole] || { label: displayRole, color: "#818cf8", bg: "rgba(129,140,248,0.14)", border: "rgba(129,140,248,0.3)" };

  const handleCopyCode = async () => {
    if (!referralCode) return;
    try { await navigator.clipboard.writeText(referralCode); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); } catch {}
  };
  const handleCopyLink = async () => {
    if (!referralLink) return;
    try { await navigator.clipboard.writeText(referralLink); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); } catch {}
  };
  const handleWhatsAppShare = () => {
    if (!referralCode || !referralLink) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`Hey! Join Speak & Shine 🌟\n\nReferral code: *${referralCode}*\n\n${referralLink}`)}`, "_blank", "noopener,noreferrer");
  };
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showMsg("Select an image file", "error"); return; }
    if (file.size > 5242880) { showMsg("Image must be under 5MB", "error"); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    if (activeTab !== "edit") handleTabChange("edit");
  };
  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    if (!editName.trim()) { showMsg("Enter a valid name", "error"); return; }
    setSavingProfile(true); setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("name", editName.trim());
      if (photoFile) fd.append("photo", photoFile);
      const res = await api.patch("/users/me/profile", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (res.data?.success) {
        showMsg("Profile saved ✨"); setPhotoFile(null);
        if (res.data.avatarUrl) setPhotoPreview(res.data.avatarUrl);
        setProfileData(p => ({ ...p, auth: { ...p?.auth, name: res.data.name, avatarUrl: res.data.avatarUrl }, user: { ...p?.user, name: res.data.name, avatarUrl: res.data.avatarUrl } }));
        if (updateUser) updateUser({ name: res.data.name, avatarUrl: res.data.avatarUrl });
      }
    } catch (err) { showMsg(err.response?.data?.error || "Failed to update", "error"); }
    finally { setSavingProfile(false); }
  };
  const handleRemovePhoto = async () => {
    setSavingProfile(true); setFeedback(null);
    try {
      const fd = new FormData(); fd.append("removePhoto", "true"); if (editName.trim()) fd.append("name", editName.trim());
      const res = await api.patch("/users/me/profile", fd);
      if (res.data?.success) {
        showMsg("Photo removed"); setPhotoFile(null); setPhotoPreview(null);
        setProfileData(p => ({ ...p, auth: { ...p?.auth, avatarUrl: null }, user: { ...p?.user, avatarUrl: null } }));
        if (updateUser) updateUser({ avatarUrl: null });
      }
    } catch (err) { showMsg(err.response?.data?.error || "Failed", "error"); }
    finally { setSavingProfile(false); }
  };
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pwdForm.currentPassword) { showMsg("Enter current password", "error"); return; }
    if (!pwdForm.newPassword || pwdForm.newPassword.length < 6) { showMsg("New password needs 6+ characters", "error"); return; }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) { showMsg("Passwords don't match", "error"); return; }
    setSavingPwd(true); setFeedback(null);
    try {
      const res = await api.patch("/users/me/password", { currentPassword: pwdForm.currentPassword, newPassword: pwdForm.newPassword });
      if (res.data?.success) { showMsg("Password updated 🔐"); setPwdForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); }
    } catch (err) { showMsg(err.response?.data?.error || "Failed to change password", "error"); }
    finally { setSavingPwd(false); }
  };

  const TABS = [
    { key: "overview", icon: "✦", label: "Overview" },
    { key: "edit",     icon: "✎", label: "Edit Profile" },
    { key: "security", icon: "⚿", label: "Security" },
  ];

  const STATS = [
    { label: "Wallet",      value: `₹${walletBalance}`,        icon: "₹",   grad: "linear-gradient(135deg, #6366f1, #4338ca)", shadow: "rgba(99,102,241,0.3)" },
    { label: "Referrals",   value: String(referralCount),      icon: "↗",   grad: "linear-gradient(135deg, #10b981, #047857)", shadow: "rgba(16,185,129,0.3)" },
    { label: "Earned",      value: `₹${referralEarnings}`,     icon: "◈",   grad: "linear-gradient(135deg, #f59e0b, #b45309)", shadow: "rgba(245,158,11,0.3)" },
    { label: "Per Friend",  value: `₹${referralRewardAmount}`, icon: "♦",   grad: "linear-gradient(135deg, #ec4899, #be185d)", shadow: "rgba(236,72,153,0.3)" },
  ];

  return (
    <Layout title="My Profile" subtitle="Account · Security · Referrals">
      <style>{`
        /* Profile container */
        .pf-wrap {
          border-radius: var(--r);
          background: var(--bg);
          color: var(--text);
          min-height: 100%;
          overflow: hidden;
          border: 1px solid var(--border);
          box-shadow: var(--shadow);
        }

        /* Top banner with theme support */
        .pf-banner {
          height: 160px;
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 70%, #6d28d9 100%);
          position: relative;
          overflow: hidden;
        }
        [data-theme="light"] .pf-banner,
        .light .pf-banner {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 45%, #93c5fd 100%);
        }
        .pf-banner::before {
          content:'';
          position: absolute; inset: 0;
          background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }

        /* Identity Row - Clean flex layout (NO overlaps!) */
        .pf-identity-row {
          padding: 0 1.75rem 1.25rem;
          margin-top: -46px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1.25rem;
          position: relative;
          z-index: 2;
        }

        /* Left Side User Block */
        .pf-user-block {
          display: flex;
          align-items: flex-end;
          gap: 1.25rem;
          flex-wrap: wrap;
        }

        /* Avatar Box */
        .pf-avatar-box {
          position: relative;
          width: 104px;
          height: 104px;
          flex-shrink: 0;
          cursor: pointer;
        }
        .pf-avatar-img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 4px solid var(--bg);
          background: linear-gradient(135deg, var(--primary), #6366f1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 2.4rem;
          color: #fff;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0,0,0,0.22);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .pf-avatar-box:hover .pf-avatar-img {
          transform: scale(1.03);
          box-shadow: 0 0 0 3px var(--primary-light), 0 10px 30px rgba(0,0,0,0.3);
        }
        .pf-cam-btn {
          position: absolute;
          bottom: 2px;
          right: 2px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--primary);
          border: 2.5px solid var(--bg);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.82rem;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transition: transform 0.2s;
        }
        .pf-cam-btn:hover { transform: scale(1.15); }

        /* User Text Block next to avatar */
        .pf-user-text {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          padding-bottom: 2px;
        }
        .pf-user-name-row {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .pf-user-name {
          margin: 0;
          font-size: 1.75rem;
          font-weight: 900;
          color: var(--text);
          letter-spacing: -0.025em;
          line-height: 1.1;
        }
        .pf-role-badge {
          font-size: 0.68rem;
          font-weight: 800;
          padding: 0.22rem 0.75rem;
          border-radius: 99px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .pf-user-meta-row {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          flex-wrap: wrap;
        }
        .pf-phone-tag {
          color: var(--muted);
          font-size: 0.85rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .pf-active-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          color: var(--success);
          font-size: 0.8rem;
          font-weight: 700;
          background: rgba(34,197,94,0.1);
          border: 1px solid rgba(34,197,94,0.22);
          padding: 0.18rem 0.7rem;
          border-radius: 99px;
        }
        .pf-free-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          color: var(--warning);
          font-size: 0.8rem;
          font-weight: 700;
          background: rgba(245,158,11,0.1);
          border: 1px solid rgba(245,158,11,0.22);
          padding: 0.18rem 0.7rem;
          border-radius: 99px;
        }

        /* Actions Block Right */
        .pf-actions-block {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          flex-wrap: wrap;
          margin-left: auto;
          padding-bottom: 2px;
        }
        .pf-wallet-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 0.65rem 1.3rem;
          text-align: right;
          box-shadow: var(--shadow);
        }
        .pf-wallet-lbl {
          font-size: 0.62rem;
          color: var(--primary);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .pf-wallet-val {
          font-size: 1.6rem;
          font-weight: 900;
          color: var(--text);
          line-height: 1.1;
          letter-spacing: -0.02em;
        }

        /* Tab Bar */
        .pf-tab-bar {
          display: flex; gap: 0.35rem; overflow-x: auto;
          border-bottom: 1px solid var(--border);
          padding: 0 1.75rem; margin-top: 1.25rem;
        }
        .pf-tab {
          padding: 0.85rem 1.4rem; background: none; border: none;
          color: var(--text2); font-weight: 600; font-size: 0.88rem;
          cursor: pointer; border-bottom: 2.5px solid transparent;
          transition: all 0.2s ease; white-space: nowrap;
          font-family: inherit; display:flex; align-items:center; gap:0.45rem;
        }
        .pf-tab:hover { color: var(--text); }
        .pf-tab.active {
          color: var(--primary); border-bottom-color: var(--primary);
          background: linear-gradient(to bottom, transparent, var(--border3));
          border-radius: 8px 8px 0 0;
        }

        /* Content Area */
        .pf-content { padding: 1.75rem; }

        /* Generic Card */
        .pf-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 1.75rem;
          box-shadow: var(--shadow);
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        /* Stat Card Grid */
        .pf-stat-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem;
        }
        .pf-stat-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1.25rem;
          position: relative; overflow: hidden;
          box-shadow: var(--shadow);
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
        }
        .pf-stat-card:hover {
          transform: translateY(-3px);
          border-color: var(--border2);
          box-shadow: var(--shadow-lg);
        }
        .pf-stat-icon {
          width: 44px; height: 44px; border-radius: 12px; margin-bottom: 0.85rem;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.25rem; font-weight: 900; color: #fff;
        }

        /* Form Inputs */
        .pf-input {
          width: 100%; box-sizing: border-box;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.85rem 1rem;
          color: var(--text);
          font-size: 0.92rem;
          font-family: inherit;
          outline: none; transition: border-color 0.2s, box-shadow 0.2s;
        }
        .pf-input:focus {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 3px var(--border3) !important;
        }

        /* Buttons */
        .pf-btn-primary {
          background: linear-gradient(135deg, var(--primary), var(--primary2));
          border: none; color: #fff; border-radius: 12px;
          padding: 0.85rem 1.8rem; font-weight: 700; font-size: 0.92rem;
          cursor: pointer; font-family: inherit;
          box-shadow: 0 4px 16px rgba(124,58,237,0.35);
          transition: all 0.2s ease; display:inline-flex; align-items:center; gap:0.5rem;
        }
        .pf-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(124,58,237,0.45); }
        .pf-btn-primary:disabled { opacity: 0.6; cursor:default; transform:none; }

        .pf-btn-ghost {
          background: var(--card2);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 10px;
          padding: 0.58rem 1.1rem;
          font-weight: 600; font-size: 0.84rem;
          cursor: pointer; font-family: inherit;
          transition: all 0.2s ease;
          display:inline-flex; align-items:center; gap:0.4rem;
        }
        .pf-btn-ghost:hover {
          background: var(--card3);
          border-color: var(--border2);
        }

        .pf-btn-danger {
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.22);
          color: var(--danger);
          border-radius: 10px;
          padding: 0.58rem 1.1rem;
          font-weight: 600; font-size: 0.84rem;
          cursor: pointer; font-family: inherit;
          transition: all 0.2s ease;
          display:inline-flex; align-items:center; gap:0.4rem;
        }
        .pf-btn-danger:hover {
          background: rgba(239,68,68,0.15);
          border-color: rgba(239,68,68,0.35);
        }

        /* Referral Card Dual Theme */
        .pf-ref-card {
          background: linear-gradient(135deg, var(--card) 0%, var(--card2) 100%);
          border: 1px solid var(--border3);
          border-radius: 20px; padding: 1.75rem 2rem;
          position: relative; overflow: hidden;
          box-shadow: var(--shadow);
        }
        [data-theme="light"] .pf-ref-card,
        .light .pf-ref-card {
          background: linear-gradient(135deg, #ffffff 0%, #f5f3ff 60%, #ede9fe 100%);
          border: 1.5px solid #ddd6fe;
          box-shadow: 0 10px 30px rgba(124,58,237,0.08);
        }

        /* Wallet history */
        .pf-hist-row { transition: background 0.15s; border-radius: 10px; }
        .pf-hist-row:hover { background: var(--card2) !important; }

        /* Toast animation */
        @keyframes pf-slide { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        .pf-toast { animation: pf-slide 0.22s ease; }

        @media (max-width:640px) {
          .pf-identity-row { padding: 0 1.25rem 1rem; }
          .pf-tab-bar { padding: 0 1rem; }
          .pf-content { padding: 1.25rem; }
          .pf-ref-card { padding: 1.25rem; }
          .pf-actions-block { width: 100%; margin-left: 0; justify-content: space-between; }
        }
      `}</style>

      <input type="file" ref={fileInputRef} accept="image/jpeg,image/png,image/webp,image/gif" onChange={handlePhotoSelect} style={{ display:"none" }} />

      <div className="pf-wrap">

        {/* ── Top Cover Banner ── */}
        <div className="pf-banner" />

        {/* ── Profile Identity Row (Clean Flex - Avatar & Name Never Collide) ── */}
        <div className="pf-identity-row">
          
          {/* User Block Left */}
          <div className="pf-user-block">
            {/* Avatar Box */}
            <div className="pf-avatar-box" onClick={() => fileInputRef.current?.click()} title="Upload photo">
              <div className="pf-avatar-img">
                {avatarUrl
                  ? <img src={avatarUrl} alt={displayName} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  : initials}
              </div>
              <button className="pf-cam-btn" onClick={() => fileInputRef.current?.click()} title="Upload photo">📷</button>
            </div>

            {/* Name & Badges */}
            <div className="pf-user-text">
              <div className="pf-user-name-row">
                <h1 className="pf-user-name">{displayName}</h1>
                <span className="pf-role-badge" style={{
                  background: roleConfig.bg, border: `1px solid ${roleConfig.border}`, color: roleConfig.color
                }}>{roleConfig.label}</span>
              </div>

              <div className="pf-user-meta-row">
                <span className="pf-phone-tag">📱 +91 {displayPhone || "—"}</span>
                {isPaid
                  ? <span className="pf-active-tag">✅ Active Member</span>
                  : <span className="pf-free-tag">
                      ⚠️ Free Plan · <Link to="/payment-history" style={{ color:"var(--primary)", textDecoration:"underline" }}>Activate Now</Link>
                    </span>
                }
              </div>
            </div>
          </div>

          {/* Actions Block Right */}
          <div className="pf-actions-block">
            <div className="pf-wallet-card">
              <div className="pf-wallet-lbl">Wallet Balance</div>
              <div className="pf-wallet-val">₹{walletBalance}</div>
            </div>
            <div style={{ display:"flex", gap:"0.5rem" }}>
              <button className="pf-btn-ghost" onClick={() => handleTabChange("edit")}>✏️ Edit Profile</button>
              <button className="pf-btn-ghost" onClick={() => handleTabChange("security")}>🔐 Security</button>
            </div>
          </div>

        </div>

        {/* ── Feedback Toast ── */}
        {feedback && (
          <div className="pf-toast" style={{
            margin:"0.5rem 1.75rem 0", padding:"0.85rem 1.25rem", borderRadius:"12px",
            display:"flex", alignItems:"center", gap:"0.7rem",
            background: feedback.type==="success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            border:`1px solid ${feedback.type==="success" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
            color: feedback.type==="success" ? "var(--success)" : "var(--danger)",
            fontSize:"0.88rem", fontWeight:600,
          }}>
            <span>{feedback.type==="success" ? "✅" : "⚠️"}</span>
            <span style={{ flex:1 }}>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} style={{ background:"none", border:"none", color:"inherit", cursor:"pointer", padding:"2px 4px", fontSize:"0.95rem" }}>✕</button>
          </div>
        )}

        {/* ── Navigation Tabs ── */}
        <div className="pf-tab-bar">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`pf-tab${activeTab===t.key?" active":""}`}
              onClick={() => handleTabChange(t.key)}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* ─────────────────────── */}
        {/*  TAB: OVERVIEW           */}
        {/* ─────────────────────── */}
        {activeTab==="overview" && (
          <div className="pf-content" style={{ display:"flex", flexDirection:"column", gap:"1.5rem" }}>

            {/* Vibrant Stat Cards Grid */}
            <div className="pf-stat-grid">
              {STATS.map(s => (
                <div key={s.label} className="pf-stat-card">
                  <div className="pf-stat-icon" style={{ background: s.grad, boxShadow: `0 4px 14px ${s.shadow}` }}>
                    {s.icon}
                  </div>
                  <div style={{ fontSize:"0.65rem", color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"0.2rem" }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize:"1.6rem", fontWeight:900, color:"var(--text)", letterSpacing:"-0.02em", lineHeight:1 }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Wallet Activity Collapsible Card */}
            {walletHistory.length > 0 && (
              <div className="pf-card" style={{ padding: 0, overflow:"hidden" }}>
                <button
                  onClick={() => setShowHistory(h => !h)}
                  style={{ width:"100%", background:"none", border:"none", cursor:"pointer", padding:"1.1rem 1.4rem", display:"flex", alignItems:"center", justifyContent:"space-between", color:"var(--text)" }}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,var(--primary),#4338ca)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.9rem", fontWeight:900, color:"#fff" }}>₹</div>
                    <span style={{ fontWeight:800, fontSize:"0.95rem" }}>Wallet Activity</span>
                    <span style={{ background:"var(--border3)", color:"var(--primary)", fontSize:"0.68rem", fontWeight:800, padding:"0.12rem 0.55rem", borderRadius:99 }}>{walletHistory.length}</span>
                  </div>
                  <span style={{ color:"var(--muted)", fontSize:"0.85rem", transition:"transform 0.2s", display:"inline-block", transform:showHistory?"rotate(180deg)":"rotate(0deg)" }}>▾</span>
                </button>
                {showHistory && (
                  <div style={{ padding:"0 1.25rem 1.25rem", display:"flex", flexDirection:"column", gap:"0.45rem" }}>
                    <div style={{ height:1, background:"var(--border)", marginBottom:"0.35rem" }} />
                    {walletHistory.slice(-8).reverse().map((e, i) => (
                      <div key={i} className="pf-hist-row" style={{
                        display:"flex", justifyContent:"space-between", alignItems:"center", gap:"1rem",
                        padding:"0.65rem 0.85rem",
                        background: e.type==="credit" ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                        border:`1px solid ${e.type==="credit" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
                      }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ color:e.type==="credit"?"var(--success)":"var(--danger)", fontWeight:700, fontSize:"0.87rem" }}>
                            {e.type==="credit"?"+":"−"}₹{e.amount} · {e.reason}
                          </div>
                          <div style={{ color:"var(--muted)", fontSize:"0.72rem", marginTop:"0.1rem" }}>
                            {new Date(e.date).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                          </div>
                        </div>
                        <span style={{ color:"var(--text2)", fontWeight:700, fontSize:"0.78rem", flexShrink:0, background:"var(--bg2)", border:"1px solid var(--border)", padding:"0.22rem 0.55rem", borderRadius:8 }}>
                          ₹{e.balanceAfter}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Refer & Earn Banner Card */}
            <div className="pf-ref-card">
              {/* Header */}
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:"1rem", marginBottom:"1.5rem", position:"relative", zIndex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
                  <div style={{
                    width:52, height:52, borderRadius:16,
                    background:"linear-gradient(135deg,rgba(245,158,11,0.2),rgba(251,191,36,0.1))",
                    border:"1px solid rgba(245,158,11,0.3)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:"1.5rem", boxShadow:"0 4px 16px rgba(245,158,11,0.15)",
                  }}>🎁</div>
                  <div>
                    <h2 style={{ margin:"0 0 0.2rem", fontSize:"1.25rem", fontWeight:900, color:"var(--text)", letterSpacing:"-0.01em" }}>
                      Refer & Earn ₹{referralRewardAmount}
                    </h2>
                    <p style={{ margin:0, color:"var(--muted)", fontSize:"0.84rem" }}>
                      Get ₹{referralRewardAmount} credited to your wallet whenever a friend joins & completes payment
                    </p>
                  </div>
                </div>
                <span style={{
                  background:"rgba(245,158,11,0.12)", border:"1px solid rgba(245,158,11,0.3)",
                  color:"var(--warning)", fontSize:"0.7rem", fontWeight:800,
                  padding:"0.3rem 0.85rem", borderRadius:99, letterSpacing:"0.06em", textTransform:"uppercase",
                }}>₹{referralRewardAmount} / friend</span>
              </div>

              {/* Code display box */}
              <div style={{ position:"relative", zIndex:1, marginBottom:"1.25rem" }}>
                <div style={{ fontSize:"0.65rem", color:"var(--muted)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"0.4rem" }}>Your Referral Code</div>
                <div style={{
                  display:"flex", alignItems:"center", gap:"1rem",
                  background:"var(--bg2)", border:"1.5px dashed var(--primary)",
                  padding:"0.9rem 1.2rem", borderRadius:"12px",
                  boxShadow:"inset 0 1px 4px rgba(0,0,0,0.05)",
                }}>
                  <span style={{ flex:1, fontFamily:"'Courier New',monospace", fontSize:"1.35rem", fontWeight:900, letterSpacing:"0.18em", color:"var(--primary)" }}>
                    {referralCode || (loading ? "Loading…" : "SPEAK...")}
                  </span>
                  <button onClick={handleCopyCode} disabled={!referralCode} className="pf-btn-primary" style={{ padding:"0.55rem 1.1rem", fontSize:"0.83rem" }}>
                    {copiedCode ? "✓ Copied!" : "Copy Code"}
                  </button>
                </div>
              </div>

              {/* Share action buttons */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.75rem", position:"relative", zIndex:1 }}>
                <button onClick={handleCopyLink} disabled={!referralLink} className="pf-btn-ghost" style={{ justifyContent:"center", padding:"0.75rem 1rem" }}>
                  🔗 {copiedLink ? "Link Copied! ✓" : "Copy Invite Link"}
                </button>

                <button onClick={handleWhatsAppShare} disabled={!referralCode} style={{
                  background:"linear-gradient(135deg,#25D366,#128C7E)", color:"#fff",
                  border:"none", borderRadius:"10px", padding:"0.75rem 1rem",
                  fontSize:"0.86rem", fontWeight:700, cursor:"pointer",
                  fontFamily:"inherit",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:"0.45rem",
                  boxShadow:"0 4px 14px rgba(37,211,102,0.25)", transition:"all 0.2s",
                }}>
                  📲 Share on WhatsApp
                </button>

                <Link to="/payment-history" className="pf-btn-ghost" style={{ justifyContent:"center", padding:"0.75rem 1rem", textDecoration:"none" }}>
                  💳 Payments & Invoices
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────── */}
        {/*  TAB: EDIT PROFILE       */}
        {/* ─────────────────────── */}
        {activeTab==="edit" && (
          <form className="pf-content" onSubmit={handleSaveProfile} style={{ display:"flex", flexDirection:"column", gap:"1.25rem" }}>

            {/* Profile Photo Card */}
            <div className="pf-card">
              <div style={{ display:"flex", alignItems:"center", gap:"0.65rem", marginBottom:"1.25rem" }}>
                <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,var(--primary),#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1rem", color:"#fff" }}>🖼️</div>
                <div>
                  <div style={{ fontWeight:800, color:"var(--text)", fontSize:"0.97rem" }}>Profile Picture</div>
                  <div style={{ fontSize:"0.75rem", color:"var(--muted)" }}>Stored on Cloudinary · Max file size 5 MB</div>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:"1.75rem", flexWrap:"wrap" }}>
                <div style={{
                  width:90, height:90, borderRadius:"50%", flexShrink:0, overflow:"hidden",
                  background:"linear-gradient(135deg,var(--primary),#6366f1)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontWeight:900, fontSize:"2rem", color:"#fff",
                  boxShadow:"0 0 0 3px var(--border3), 0 4px 16px rgba(0,0,0,0.15)",
                }}>
                  {avatarUrl ? <img src={avatarUrl} alt={displayName} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : initials}
                </div>
                <div>
                  <div style={{ display:"flex", gap:"0.6rem", flexWrap:"wrap", marginBottom:"0.65rem" }}>
                    <button type="button" className="pf-btn-ghost" onClick={() => fileInputRef.current?.click()} disabled={savingProfile}>
                      📁 {photoFile ? "Change Image" : "Upload Photo"}
                    </button>
                    {avatarUrl && <button type="button" className="pf-btn-danger" onClick={handleRemovePhoto} disabled={savingProfile}>🗑️ Remove</button>}
                  </div>
                  <div style={{ fontSize:"0.75rem", color:"var(--muted)", lineHeight:1.6 }}>
                    Supports JPG, PNG or WebP. Auto-cropped for optimal avatar display.
                  </div>
                </div>
              </div>
            </div>

            {/* Display Name Card */}
            <div className="pf-card">
              <div style={{ display:"flex", alignItems:"center", gap:"0.65rem", marginBottom:"1.25rem" }}>
                <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,var(--primary),#6366f1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1rem", color:"#fff" }}>👤</div>
                <div>
                  <div style={{ fontWeight:800, color:"var(--text)", fontSize:"0.97rem" }}>Display Name</div>
                  <div style={{ fontSize:"0.75rem", color:"var(--muted)" }}>Visible on leaderboards, live rooms and practice sessions</div>
                </div>
              </div>
              <input
                type="text" value={editName} onChange={e=>setEditName(e.target.value)}
                placeholder="Your full name" required maxLength={60}
                className="pf-input" style={{ maxWidth:440 }}
              />
            </div>

            <div>
              <button type="submit" disabled={savingProfile} className="pf-btn-primary">
                <span>{savingProfile ? "⏳" : "💾"}</span>
                <span>{savingProfile ? "Saving…" : "Save Changes"}</span>
              </button>
            </div>
          </form>
        )}

        {/* ─────────────────────── */}
        {/*  TAB: SECURITY           */}
        {/* ─────────────────────── */}
        {activeTab==="security" && (
          <div className="pf-content" style={{ display:"flex", flexDirection:"column", gap:"1.25rem" }}>
            <form onSubmit={handleChangePassword} className="pf-card">
              <div style={{ display:"flex", alignItems:"center", gap:"0.65rem", marginBottom:"1.5rem" }}>
                <div style={{ width:40, height:40, borderRadius:12, background:"linear-gradient(135deg,#a855f7,var(--primary))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.1rem", color:"#fff", boxShadow:"0 4px 14px rgba(168,85,247,0.3)" }}>🔑</div>
                <div>
                  <div style={{ fontWeight:900, color:"var(--text)", fontSize:"1.05rem" }}>Change Password</div>
                  <div style={{ fontSize:"0.75rem", color:"var(--muted)" }}>Requires minimum 6 characters</div>
                </div>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:"1rem", maxWidth:460 }}>
                {[
                  { key:"currentPassword", label:"Current Password",  show:showPwd.current, toggleKey:"current",  placeholder:"Enter current password" },
                  { key:"newPassword",     label:"New Password",       show:showPwd.newP,    toggleKey:"newP",     placeholder:"Min 6 characters" },
                  { key:"confirmPassword", label:"Confirm Password",   show:showPwd.confirm, toggleKey:"confirm",  placeholder:"Repeat new password" },
                ].map(({ key, label, show, toggleKey, placeholder }) => (
                  <div key={key}>
                    <label style={{ fontSize:"0.7rem", color:"var(--muted)", fontWeight:700, display:"block", marginBottom:"0.4rem", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</label>
                    <div style={{ position:"relative" }}>
                      <input
                        type={show?"text":"password"}
                        value={pwdForm[key]}
                        onChange={e => setPwdForm(p => ({ ...p, [key]: e.target.value }))}
                        placeholder={placeholder} required
                        className="pf-input"
                        style={{
                          paddingRight:"3rem",
                          ...(key==="confirmPassword" && pwdForm.confirmPassword && pwdForm.newPassword!==pwdForm.confirmPassword
                            ? { borderColor:"var(--danger)" } : {}),
                        }}
                      />
                      <button type="button" onClick={() => setShowPwd(p => ({ ...p, [toggleKey]: !p[toggleKey] }))} style={{
                        position:"absolute", right:"0.9rem", top:"50%", transform:"translateY(-50%)",
                        background:"transparent", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:"0.95rem", padding:0,
                      }}>{show?"🙈":"👁️"}</button>
                    </div>
                    {key==="confirmPassword" && pwdForm.confirmPassword && pwdForm.newPassword!==pwdForm.confirmPassword && (
                      <div style={{ color:"var(--danger)", fontSize:"0.74rem", marginTop:"0.28rem", fontWeight:600 }}>⚠ Passwords don't match</div>
                    )}
                  </div>
                ))}

                <button type="submit" disabled={savingPwd} className="pf-btn-primary" style={{ alignSelf:"flex-start", marginTop:"0.25rem" }}>
                  <span>{savingPwd ? "⏳" : "🔐"}</span>
                  <span>{savingPwd ? "Updating…" : "Update Password"}</span>
                </button>
              </div>
            </form>

            {/* Security Tips Card */}
            <div style={{
              background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.18)",
              borderRadius:"12px", padding:"1.25rem 1.5rem",
              display:"flex", alignItems:"flex-start", gap:"0.85rem",
            }}>
              <span style={{ fontSize:"1.3rem", flexShrink:0 }}>🛡️</span>
              <div>
                <div style={{ fontWeight:800, color:"var(--warning)", fontSize:"0.88rem", marginBottom:"0.35rem" }}>Account Security Recommendations</div>
                <ul style={{ margin:0, padding:"0 0 0 1.1rem", color:"var(--muted)", fontSize:"0.8rem", lineHeight:1.8 }}>
                  <li>Include uppercase letters, numbers and special characters in your password</li>
                  <li>Never share your credentials or login OTPs with anyone</li>
                  <li>Always log out when accessing your account from public devices</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
