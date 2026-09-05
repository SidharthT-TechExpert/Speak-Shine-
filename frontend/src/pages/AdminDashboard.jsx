import { useEffect, useState, useMemo, useRef, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import StatCard from "../components/StatCard.jsx";
import Modal from "../components/Modal.jsx";
import RoleSelector from "../components/RoleSelector.jsx";
import SubmissionControls from "../components/SubmissionControls.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import StreakBadge from "../components/StreakBadge.jsx";
import { getSharedSocket } from "../hooks/useSocket.js";

const InvoiceModal = lazy(() => import("../components/InvoiceModal.jsx"));

const CATS = ["Daily Life","Opinion","Personal Experience","English Growth","Future Goals","Fun Topic","Free Talk"];
const PIE_COLORS = ["#7c6fff","#4ade80","#fbbf24","#ff6b9d","#38bdf8","#fb923c","#a78bfa"];
const tt = { background:"#16162a", border:"1px solid #252545", borderRadius:10, fontSize:12 };
const DEFAULT_SUBMISSION_TEMPLATES = {
  comprehensive: `📊 *SPEAK & SHINE — DAILY SUBMISSION REPORT*\n📅 *Date:* {date} | ⏰ *Time:* {time}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n✅ *SUBMITTED TODAY ({submitted_count}/{total_paid})*\n{submitted_list}\n\n⏳ *PENDING SUBMISSIONS ({pending_count}/{total_paid})*\n{pending_list}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n📈 *Completion Rate:* {percent} {progress_bar}\n💡 *Reminder:* Please record and submit your 1-minute speaking video before midnight (12:00 AM) to keep your streak active!\n🚀 *Submit your video here:* {app_url}`,
  urgent: `⚠️ *FINAL CALL — URGENT SUBMISSION REMINDER* ⚠️\n📅 *Date:* {date} | ⏰ *Time:* {time}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⏳ *Pending Students ({pending_count} remaining):*\n{pending_list}\n\n🏆 *Top Scorer Today:* {top_points_user}\n📈 *Class Progress:* {percent} {progress_bar}\n\n⚡ Midnight deadline approaching! Record & submit your video now to pints & keep your streak!\n\n🚀 *Submit here:* {app_url}`,
  motivation: `🌟 *SPEAK & SHINE — DAILY PROGRESS UPDATE* 🌟\n📅 *Date:* {date} | ⏰ *Time:* {time}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🏆 *Top Scorer Today:* {top_points_user}\n📈 *Class Progress:* {percent} {progress_bar}\n\n✅ *Submitted Heroes ({submitted_count}/{total_paid}):*\n{submitted_list}\n\n⏳ *Still Time to Submit ({pending_count} pending):*\n{pending_list}\n\n🚀 *Submit your video now:* {app_url}`,
  custom: `🔔 *SPEAK & SHINE — DAILY UPDATE*\n📅 *Date:* {date} | ⏰ *Time:* {time}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⏳ *Pending Students ({pending_count} left):*\n{pending_list}\n\n🚀 *Submit your video here:* {app_url}`,
};

const formatTime12h = (t) => {
  if (!t) return "";
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  }
  return t;
};

function AdminSidebarIcon({ id, active }) {
  const props = {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? "2.2" : "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (id) {
    case "overview":
      return (
        <svg {...props}>
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
      );
    case "today":
      return (
        <svg {...props}>
          <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="m9 16 2 2 4-4" />
        </svg>
      );
    case "reports":
      return (
        <svg {...props}>
          <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
        </svg>
      );
    case "points":
      return (
        <svg {...props}>
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.45 1-1 1H7v2h10v-2h-2c-.55 0-1-.45-1-1v-2.34" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      );
    case "monitoring":
      return (
        <svg {...props}>
          <rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /><path d="m7 10 2.5-3 3 5 2.5-2" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "registrations":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" />
        </svg>
      );
    case "submissions":
      return (
        <svg {...props}>
          <path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" />
        </svg>
      );
    case "live":
      return (
        <svg {...props}>
          <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" /><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" /><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
        </svg>
      );
    case "payments":
      return (
        <svg {...props}>
          <rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      );
    case "questions":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
        </svg>
      );
    case "manual-questions":
      return (
        <svg {...props}>
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><line x1="10" x2="8" y1="9" y2="9" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...props}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

function TemplateDropdown({ value, onChange, onEdit }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const options = [
    {
      id: "comprehensive",
      icon: "📊",
      label: "Comprehensive Report",
      desc: "Full attendance list, streaks & progress bar",
      accent: "#818cf8",
      bg: "rgba(129, 140, 248, 0.15)",
    },
    {
      id: "urgent",
      icon: "⚡",
      label: "Urgent Final Call",
      desc: "Countdown & deadline alert for pending students",
      accent: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.15)",
    },
    {
      id: "motivation",
      icon: "🌟",
      label: "Motivation & Streaks",
      desc: "Celebrates top scorers & daily encouragement",
      accent: "#10b981",
      bg: "rgba(16, 185, 129, 0.15)",
    },
    {
      id: "custom",
      icon: "✏️",
      label: "Custom Template",
      desc: "Your personalized dynamic message text",
      accent: "#06b6d4",
      bg: "rgba(6, 182, 212, 0.15)",
    },
  ];

  const current = options.find(o => o.id === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} style={{ position: "relative", flex: 1, minWidth: 210 }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.6rem",
          padding: "0.45rem 0.75rem",
          borderRadius: 10,
          background: "rgba(255, 255, 255, 0.04)",
          border: isOpen ? "1px solid rgba(99, 102, 241, 0.6)" : "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: isOpen ? "0 0 14px rgba(99, 102, 241, 0.25)" : "none",
          color: "#f8fafc",
          cursor: "pointer",
          transition: "all 0.16s ease",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", minWidth: 0 }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 7,
            background: current.bg,
            fontSize: "0.85rem",
            flexShrink: 0,
          }}>
            {current.icon}
          </span>
          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {current.label}
          </span>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          right: 0,
          zIndex: 100,
          background: "linear-gradient(180deg, rgba(18, 20, 32, 0.98) 0%, rgba(12, 13, 24, 0.99) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 14,
          padding: "0.4rem",
          boxShadow: "0 20px 48px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          backdropFilter: "blur(24px)",
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
          animation: "fadeInUp 0.15s ease",
        }}>
          {options.map((opt) => {
            const isSelected = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  padding: "0.55rem 0.7rem",
                  borderRadius: 10,
                  background: isSelected ? "rgba(99, 102, 241, 0.18)" : "transparent",
                  border: isSelected ? "1px solid rgba(99, 102, 241, 0.35)" : "1px solid transparent",
                  color: isSelected ? "#ffffff" : "#cbd5e1",
                  cursor: "pointer",
                  transition: "all 0.14s ease",
                  textAlign: "left",
                  width: "100%",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.color = "#ffffff";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#cbd5e1";
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", minWidth: 0 }}>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: opt.bg,
                    fontSize: "0.95rem",
                    flexShrink: 0,
                  }}>
                    {opt.icon}
                  </span>
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: isSelected ? "#a5b4fc" : "#f8fafc" }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "1px" }}>
                      {opt.desc}
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { user: currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const isAdminsTier = currentUser?.role === "admins"; // limited admin role
  const [tab, setTab] = useState("overview");
  const [dash, setDash] = useState(null);
  const [users, setUsers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [qForm, setQForm] = useState({ category:"", topic:"", question:"" });
  const [editQ, setEditQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);
  const [search, setSearch] = useState("");
  const [qSearch, setQSearch] = useState("");
  const [qActionBusy, setQActionBusy] = useState(""); // "generating" | "cleaning" | ""
  const [qCat, setQCat] = useState("");
  const [modal, setModal] = useState(null);
  const [pointsModal, setPointsModal] = useState(null); // { isOpen: true, user, mode: "add"|"remove"|"set", amount: 50, reason: "" }
  const [savingPoints, setSavingPoints] = useState(false);
  const [fineInput, setFineInput] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [waStatus, setWaStatus] = useState(null);
  const [waLoading, setWaLoading] = useState(false);
  const [waReconnecting, setWaReconnecting] = useState(false);
  const [waUnlinking, setWaUnlinking] = useState(false);
  const [waSendingPoster, setWaSendingPoster] = useState(false);
  const [waSendingReport, setWaSendingReport] = useState(false);
  const [waSendingPrizeReport, setWaSendingPrizeReport] = useState(false);
  const [waPrizeSummary, setWaPrizeSummary] = useState(null);
  const [prizeWinnerCount, setPrizeWinnerCount] = useState(3);
  const [prizeCalculationMethod, setPrizeCalculationMethod] = useState("preset_top3");
  const [prizeCustomTotalCollection, setPrizeCustomTotalCollection] = useState("");
  const [prizeCustomAmounts, setPrizeCustomAmounts] = useState(["", "", "", "", "", ""]);
  const [prizeWinnerNames, setPrizeWinnerNames] = useState(["", "", "", "", "", ""]);
  const [prizeFooterNote, setPrizeFooterNote] = useState("*Rewards will credit before evening*");
  const [monthEndReportAutoSend, setMonthEndReportAutoSend] = useState(true);
  const [savingPrizeSettings, setSavingPrizeSettings] = useState(false);
  const [waPreviewTab, setWaPreviewTab] = useState("report");
  const [waSubSection, setWaSubSection] = useState("all");
  const [showWaPhone, setShowWaPhone] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState("schedules");
  const [editingTemplateType, setEditingTemplateType] = useState("comprehensive");
  const [settings, setSettings] = useState({
    posterSendTime: "08:00",
    questionGenerateTime: "07:00",
    submissionReportEnabled: true,
    submissionReportTimes: ["18:00", "21:00"],
    submissionReportSlots: [
      { time: "18:00", templateType: "comprehensive", customTemplate: "" },
      { time: "21:00", templateType: "urgent", customTemplate: "" },
    ],
    submissionReportTemplates: {},
    submissionReportTemplate: "",
    submissionReportSlotTemplates: {},
    vocabWordCount: 5,
    vocabRequiredCount: 3,
    vocabNormalWordCount: 5,
    vocabNormalRequiredCount: 3,
    vocabStoryWordCount: 5,
    vocabStoryRequiredCount: 3,
    vocabPictureWordCount: 5,
    vocabPictureRequiredCount: 3,
    vocabLevel: "B2",
    storyWordCount: 200,
    storyLevel: "B1",
    allowPrivateVideos: true,
    storyDays: [6],
    storyDay: 6,
    pictureDescriptionDays: [4],
    pictureDescriptionDay: 4,
    paymentAmount: 5,
    durationDefaultMax: 300,
    durationDefaultFull: 300,
    durationStoryMax: 180,
    durationStoryFull: 180,
    durationWeeklyMax: 420,
    durationWeeklyFull: 300,
    durationMonthlyReflectionMax: 420,
    durationMonthlyReflectionFull: 420,
    durationMonthlyGoalsMax: 600,
    durationMonthlyGoalsFull: 420,
    durationPictureMax: 180,
    durationPictureFull: 180,
    adminNotifyPhone: "",
    deploymentNotifyEnabled: true,
  });
  const [savingSection, setSavingSection] = useState(null); // null, "schedule", "vocab", "duration"
  const [resetting, setResetting] = useState("");
  const [publishQ, setPublishQ] = useState(null); // selected question for webapp publish
  const [publishCustom, setPublishCustom] = useState({ topic:"", question:"", category:"" }); // manual entry
  const [newMember, setNewMember] = useState({ name:"", phone:"", password:"", role:"user" });
  const [newMemberLoading, setNewMemberLoading] = useState(false);
  // Admin OTP verification state for adding members
  const [adminOtpStep, setAdminOtpStep] = useState("idle"); // "idle" | "sent" | "verified"
  const [adminOtp, setAdminOtp] = useState("");
  const [adminOtpLoading, setAdminOtpLoading] = useState(false);
  const [adminOtpError, setAdminOtpError] = useState("");
  const [adminActionToken, setAdminActionToken] = useState("");
  const [pendingRegs, setPendingRegs] = useState([]);
  const [pendingRegsLoading, setPendingRegsLoading] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [userFilter, setUserFilter] = useState("all"); // filter chip for users tab
  const [refreshing, setRefreshing] = useState(false); // command bar sync spinner
  const [sendingSlotIndex, setSendingSlotIndex] = useState(null);
  const [hoveredErrorIndex, setHoveredErrorIndex] = useState(null);
  const [testAlertLoading, setTestAlertLoading] = useState(false);
  const [slotStatusFilter, setSlotStatusFilter] = useState("all"); // "all" | "pending" | "success" | "failed"
  const [slotTemplateFilter, setSlotTemplateFilter] = useState("all"); // "all" | "comprehensive" | "urgent" | "motivation" | "custom"
  const [slotSearchQuery, setSlotSearchQuery] = useState("");
  const [slotSortOrder, setSlotSortOrder] = useState("asc"); // "asc" | "desc"
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedAdminInvoiceTx, setSelectedAdminInvoiceTx] = useState(null);

  // Advanced Payments Filters (Default: "paid", Time: "this_month")
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("paid"); // "paid" (default) | "all" | "manual" | "failed"
  const [paymentDateFilter, setPaymentDateFilter] = useState("this_month"); // "this_month" (default) | "all" | "today" | "week" | "prev_month" | "this_year"
  const [paymentSearchQuery, setPaymentSearchQuery] = useState("");
  const [paymentSortOrder, setPaymentSortOrder] = useState("desc"); // "desc" | "asc" | "amount_desc" | "amount_asc"

  // Admin Wallet History State (used in unified Points/Wallet adjustment modal)
  const [walletHistoryList, setWalletHistoryList] = useState([]);

  const openAdminWalletModal = (u, e) => {
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation();
      if (typeof e.preventDefault === "function") e.preventDefault();
    }
    openPointsModal(u, "add", "wallet");
  };

  const ribbonRef = useRef(null);
  const sidebarNavRef = useRef(null);

  const scrollRibbon = (offset) => {
    if (ribbonRef.current) {
      ribbonRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  // 1. Mouse wheel horizontal scrolling for mobile tab ribbon
  useEffect(() => {
    const el = ribbonRef.current;
    if (!el) return;
    const handleRibbonWheel = (e) => {
      if (e.deltaY !== 0 || e.deltaX !== 0) {
        e.preventDefault();
        el.scrollLeft += (e.deltaY || e.deltaX) * 1.5;
      }
    };
    el.addEventListener("wheel", handleRibbonWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleRibbonWheel);
  }, []);

  // 2. Mouse wheel vertical scrolling for sidebar drawer
  useEffect(() => {
    const el = sidebarNavRef.current;
    if (!el) return;
    const handleNavWheel = (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollTop += e.deltaY;
      }
    };
    el.addEventListener("wheel", handleNavWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleNavWheel);
  }, []);

  // 3. Auto-scroll active tab into view
  useEffect(() => {
    if (ribbonRef.current) {
      const activeEl = ribbonRef.current.querySelector(".admin-mobile-tab-pill.active");
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [tab]);

  // Real-time WebSocket listener for live payment updates across the admin dashboard
  useEffect(() => {
    const token = localStorage.getItem("token") || localStorage.getItem("auth_token");
    if (!token) return;
    const socket = getSharedSocket(token);

    const onUserPaidStatus = (data) => {
      if (!data?.phone) return;
      const strippedPhone = String(data.phone).replace(/^(\+91|91)/, "");
      setUsers(prev => prev.map(u => {
        const uPhone = String(u.phone || "").replace(/^(\+91|91)/, "");
        if (uPhone === strippedPhone || u.phone === data.phone) {
          return { ...u, paid: data.paid, paidAt: data.paidAt || new Date() };
        }
        return u;
      }));

      // Update selected student if open in modal / drawer
      setSelectedStudent(s => {
        if (!s) return null;
        const sPhone = String(s.phone || "").replace(/^(\+91|91)/, "");
        if (sPhone === strippedPhone || s.phone === data.phone) {
          return { ...s, paid: data.paid, paidAt: data.paidAt || new Date() };
        }
        return s;
      });

      // Update dashboard KPI counts
      setDash(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          stats: {
            ...prev.stats,
            totalPaid: data.paid ? (prev.stats?.totalPaid || 0) + 1 : Math.max(0, (prev.stats?.totalPaid || 1) - 1),
          },
        };
      });

      // Reload payments table if already loaded or active
      loadPayments();
    };

    const onPaymentRecorded = () => {
      loadPayments();
    };

    const onScoreUpdated = (data) => {
      if (!data?.phone) return;
      const strippedPhone = String(data.phone).replace(/^(\+91|91)/, "");
      setUsers(prev => prev.map(u => {
        const uPhone = String(u.phone || "").replace(/^(\+91|91)/, "");
        if (uPhone === strippedPhone || u.phone === data.phone || (data.userId && u.userId === data.userId)) {
          return { ...u, monthlyScore: data.monthlyScore };
        }
        return u;
      }));
      setSelectedStudent(s => {
        if (!s) return null;
        const sPhone = String(s.phone || "").replace(/^(\+91|91)/, "");
        if (sPhone === strippedPhone || s.phone === data.phone || (data.userId && s.userId === data.userId)) {
          return { ...s, monthlyScore: data.monthlyScore };
        }
        return s;
      });
    };

    const onFreezeUpdated = (data) => {
      if (!data?.phone) return;
      const strippedPhone = String(data.phone).replace(/^(\+91|91)/, "");
      setUsers(prev => prev.map(u => {
        const uPhone = String(u.phone || "").replace(/^(\+91|91)/, "");
        if (uPhone === strippedPhone || u.phone === data.phone || (data.userId && u.userId === data.userId)) {
          return { ...u, streakFreeze: data.streakFreeze };
        }
        return u;
      }));
      setSelectedStudent(s => {
        if (!s) return null;
        const sPhone = String(s.phone || "").replace(/^(\+91|91)/, "");
        if (sPhone === strippedPhone || s.phone === data.phone || (data.userId && s.userId === data.userId)) {
          return { ...s, streakFreeze: data.streakFreeze };
        }
        return s;
      });
    };

    const onStreakUpdated = (data) => {
      if (!data?.phone) return;
      const strippedPhone = String(data.phone).replace(/^(\+91|91)/, "");
      setUsers(prev => prev.map(u => {
        const uPhone = String(u.phone || "").replace(/^(\+91|91)/, "");
        if (uPhone === strippedPhone || u.phone === data.phone || (data.userId && u.userId === data.userId)) {
          return { ...u, streak: data.streak };
        }
        return u;
      }));
      setSelectedStudent(s => {
        if (!s) return null;
        const sPhone = String(s.phone || "").replace(/^(\+91|91)/, "");
        if (sPhone === strippedPhone || s.phone === data.phone || (data.userId && s.userId === data.userId)) {
          return { ...s, streak: data.streak };
        }
        return s;
      });
    };

    socket.on("user:paid_status", onUserPaidStatus);
    socket.on("payment:recorded", onPaymentRecorded);
    socket.on("user:score_updated", onScoreUpdated);
    socket.on("user:streak_updated", onStreakUpdated);
    socket.on("user:freeze_updated", onFreezeUpdated);

    return () => {
      socket.off("user:paid_status", onUserPaidStatus);
      socket.off("payment:recorded", onPaymentRecorded);
      socket.off("user:score_updated", onScoreUpdated);
      socket.off("user:streak_updated", onStreakUpdated);
      socket.off("user:freeze_updated", onFreezeUpdated);
    };
  }, [tab]);

  // Lazy loading flags to track what's been loaded
  const [dataLoaded, setDataLoaded] = useState({
    dashboard: false,
    users: false,
    questions: false,
    reports: false,
    settings: false,
  });

  // Load only essential data on mount (dashboard overview)
  const loadInitial = async () => {
    setLoading(true);
    try {
      // Load dashboard + questions + weekly + users together for a complete overview
      const [d, q, w, u] = await Promise.all([
        api.get("/dashboard"),
        api.get("/questions?limit=200"),
        api.get("/dashboard/report/weekly"),
        api.get("/users"),
      ]);
      setDash(d.data);
      setDataLoaded(prev => ({ ...prev, dashboard: true }));
      if (q.data.questions) {
        setQuestions(q.data.questions);
        setDataLoaded(prev => ({ ...prev, questions: true }));
      }
      setWeekly(w.data);
      setUsers(u.data);
      setDataLoaded(prev => ({ ...prev, reports: true, users: true }));
    } catch (err) {
      console.error("Failed to load dashboard:", err);
      try {
        const d = await api.get("/dashboard");
        setDash(d.data);
        setDataLoaded(prev => ({ ...prev, dashboard: true }));
      } catch {}
      msg(err?.response?.data?.error || "Failed to load dashboard", "danger");
    } finally {
      setLoading(false);
    }
  };

  // Load users data (for Users, Today, Submissions tabs)
  const loadUsers = async () => {
    if (dataLoaded.users) return; // Already loaded
    try {
      const u = await api.get("/users");
      setUsers(u.data);
      setDataLoaded(prev => ({ ...prev, users: true }));
    } catch (err) {
      console.error("Failed to load users:", err);
      msg("Failed to load users", "danger");
    }
  };

  // Load questions data (for Questions tab)
  const loadQuestions = async () => {
    if (dataLoaded.questions) return; // Already loaded
    try {
      const q = await api.get("/questions?limit=50"); // Reduced from 200 to 50
      setQuestions(q.data.questions);
      setDataLoaded(prev => ({ ...prev, questions: true }));
    } catch (err) {
      console.error("Failed to load questions:", err);
      msg("Failed to load questions", "danger");
    }
  };

  // Force-refresh questions regardless of dataLoaded flag
  const refreshQuestions = async () => {
    try {
      const q = await api.get("/questions?limit=50");
      setQuestions(q.data.questions);
      setDataLoaded(prev => ({ ...prev, questions: true }));
    } catch (err) {
      console.error("Failed to refresh questions:", err);
      msg("Failed to refresh questions", "danger");
    }
  };

  // Load reports data (for Reports tab)
  const loadReports = async () => {
    if (dataLoaded.reports) return; // Already loaded
    try {
      const [w, m] = await Promise.all([
        api.get("/dashboard/report/weekly"),
        api.get("/dashboard/report/monthly"),
      ]);
      setWeekly(w.data);
      setMonthly(m.data);
      setDataLoaded(prev => ({ ...prev, reports: true }));
    } catch (err) {
      console.error("Failed to load reports:", err);
      msg("Failed to load reports", "danger");
    }
  };

  // Load pending registrations
  const loadPendingRegs = async () => {
    setPendingRegsLoading(true);
    try {
      const r = await api.get("/auth/pending");
      setPendingRegs(r.data);
    } catch (err) {
      msg("Failed to load pending registrations", "danger");
    } finally {
      setPendingRegsLoading(false);
    }
  };

  // Load payment transactions (for Payments tab)
  const loadPayments = async () => {
    setPaymentLoading(true);
    try {
      const r = await api.get("/payments/admin/all?limit=500");
      setPaymentData(r.data);
    } catch (err) {
      msg("Failed to load payment data", "danger");
    } finally {
      setPaymentLoading(false);
    }
  };

  // Filtered payments memo with time range, search, and type (Default: "paid")
  const filteredPayments = useMemo(() => {
    const list = paymentData?.transactions || [];
    const now = new Date();

    return list.filter((tx) => {
      // 1. Payment Type / Source Filter
      if (paymentTypeFilter === "paid") {
        const isPaid = (tx.status === "success" && tx.amount > 0) || (tx.source === "razorpay" && tx.status === "success");
        if (!isPaid) return false;
      } else if (paymentTypeFilter === "manual") {
        const isManual = tx.source === "admin" || tx.status === "manual";
        if (!isManual) return false;
      } else if (paymentTypeFilter === "failed") {
        if (tx.status !== "failed" && tx.status !== "refunded") return false;
      }

      // 2. Date Filter
      if (paymentDateFilter !== "all" && tx.createdAt) {
        const d = new Date(tx.createdAt);
        if (paymentDateFilter === "today") {
          const isToday = d.toDateString() === now.toDateString();
          if (!isToday) return false;
        } else if (paymentDateFilter === "week") {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (d < weekAgo) return false;
        } else if (paymentDateFilter === "this_month") {
          const isThisMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
          if (!isThisMonth) return false;
        } else if (paymentDateFilter === "prev_month") {
          const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
          const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
          const isPrevMonth = d.getFullYear() === prevMonthYear && d.getMonth() === prevMonth;
          if (!isPrevMonth) return false;
        } else if (paymentDateFilter === "this_year") {
          const isThisYear = d.getFullYear() === now.getFullYear();
          if (!isThisYear) return false;
        }
      }

      // 3. Search Query
      if (paymentSearchQuery.trim()) {
        const q = paymentSearchQuery.toLowerCase().trim();
        const name = (tx.name || "").toLowerCase();
        const phone = (tx.phone || "").toLowerCase();
        const pid = (tx.razorpayPaymentId || "").toLowerCase();
        const oid = (tx.razorpayOrderId || "").toLowerCase();
        const note = (tx.note || "").toLowerCase();
        if (!name.includes(q) && !phone.includes(q) && !pid.includes(q) && !oid.includes(q) && !note.includes(q)) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (paymentSortOrder === "asc") {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      } else if (paymentSortOrder === "amount_desc") {
        return (b.amount || 0) - (a.amount || 0);
      } else if (paymentSortOrder === "amount_asc") {
        return (a.amount || 0) - (b.amount || 0);
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); // "desc" default
    });
  }, [paymentData, paymentTypeFilter, paymentDateFilter, paymentSearchQuery, paymentSortOrder]);

  // Dynamic calculated KPI metrics based on active filters
  const filteredPaymentMetrics = useMemo(() => {
    const list = filteredPayments;
    const totalRev = list.reduce((sum, tx) => (tx.status === "success" ? sum + (tx.amount || 0) : sum), 0);
    const paidCount = list.filter((tx) => tx.status === "success" && tx.amount > 0).length;
    const manualCount = list.filter((tx) => tx.source === "admin" || tx.status === "manual").length;
    const aov = paidCount > 0 ? Math.round(totalRev / paidCount) : 0;
    return { totalRev, paidCount, manualCount, aov };
  }, [filteredPayments]);

  // 1-Click CSV Export
  const handleExportPaymentsCSV = () => {
    if (!filteredPayments.length) {
      msg("No records to export", "warn");
      return;
    }
    const headers = ["Date (IST)", "Student Name", "Phone", "Amount (INR)", "Status", "Source", "Payment ID", "Order ID", "Notes"];
    const rows = filteredPayments.map(tx => [
      new Date(tx.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      `"${(tx.name || "").replace(/"/g, '""')}"`,
      `"${tx.phone || ""}"`,
      tx.amount || 0,
      tx.status || "",
      tx.source || "",
      `"${tx.razorpayPaymentId || ""}"`,
      `"${tx.razorpayOrderId || ""}"`,
      `"${(tx.note || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `speak-shine-payments-${paymentDateFilter}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    msg("Payments CSV downloaded!");
  };

  // Load settings data (for Settings tab)
  const loadSettings = async () => {
    if (dataLoaded.settings) return; // Already loaded
    try {
      const s = await api.get("/dashboard/settings");
      setSettings({
        posterSendTime: s.data.posterSendTime || "08:00",
        questionGenerateTime: s.data.questionGenerateTime || "07:00",
        submissionReportEnabled: s.data.submissionReportEnabled !== false,
        submissionReportTimes: Array.isArray(s.data.submissionReportTimes) && s.data.submissionReportTimes.length > 0
          ? s.data.submissionReportTimes
          : [s.data.submissionReportTime1 || "18:00", s.data.submissionReportTime2 || "21:00"].filter(Boolean),
        submissionReportSlots: Array.isArray(s.data.submissionReportSlots) && s.data.submissionReportSlots.length > 0
          ? s.data.submissionReportSlots
          : (Array.isArray(s.data.submissionReportTimes) ? s.data.submissionReportTimes : ["18:00", "21:00"]).map((t, idx) => ({
              time: t,
              templateType: idx === 1 ? "urgent" : "comprehensive",
              customTemplate: "",
            })),
        submissionReportTemplates: s.data.submissionReportTemplates || {},
        submissionReportTemplate: s.data.submissionReportTemplate || "",
        submissionReportSlotTemplates: s.data.submissionReportSlotTemplates || {},
        vocabWordCount: s.data.vocabWordCount ?? 5,
        vocabRequiredCount: s.data.vocabRequiredCount ?? 3,
        vocabNormalWordCount: s.data.vocabNormalWordCount ?? 5,
        vocabNormalRequiredCount: s.data.vocabNormalRequiredCount ?? 3,
        vocabStoryWordCount: s.data.vocabStoryWordCount ?? 5,
        vocabStoryRequiredCount: s.data.vocabStoryRequiredCount ?? 3,
        vocabPictureWordCount: s.data.vocabPictureWordCount ?? 5,
        vocabPictureRequiredCount: s.data.vocabPictureRequiredCount ?? 3,
        vocabLevel: s.data.vocabLevel || "B2",
        storyWordCount: s.data.storyWordCount ?? 200,
        storyLevel: s.data.storyLevel || "B1",
        allowPrivateVideos: s.data.allowPrivateVideos ?? true,
        storyDays: Array.isArray(s.data.storyDays) && s.data.storyDays.length > 0
          ? s.data.storyDays
          : (s.data.storyDay !== undefined ? [s.data.storyDay] : [6]),
        storyDay: s.data.storyDay ?? (Array.isArray(s.data.storyDays) && s.data.storyDays.length > 0 ? s.data.storyDays[0] : 6),
        pictureDescriptionDays: Array.isArray(s.data.pictureDescriptionDays)
          ? s.data.pictureDescriptionDays
          : (s.data.pictureDescriptionDay !== undefined && s.data.pictureDescriptionDay !== -1 ? [s.data.pictureDescriptionDay] : [4]),
        pictureDescriptionDay: s.data.pictureDescriptionDay ?? (Array.isArray(s.data.pictureDescriptionDays) && s.data.pictureDescriptionDays.length > 0 ? s.data.pictureDescriptionDays[0] : -1),
        paymentAmount: s.data.paymentAmount ?? 5,
        durationDefaultMax: s.data.durationDefaultMax ?? 300,
        durationDefaultFull: s.data.durationDefaultFull ?? 300,
        durationStoryMax: s.data.durationStoryMax ?? 180,
        durationStoryFull: s.data.durationStoryFull ?? 180,
        durationWeeklyMax: s.data.durationWeeklyMax ?? 420,
        durationWeeklyFull: s.data.durationWeeklyFull ?? 300,
        durationMonthlyReflectionMax: s.data.durationMonthlyReflectionMax ?? 420,
        durationMonthlyReflectionFull: s.data.durationMonthlyReflectionFull ?? 420,
        durationMonthlyGoalsMax: s.data.durationMonthlyGoalsMax ?? 600,
        durationMonthlyGoalsFull: s.data.durationMonthlyGoalsFull ?? 420,
        durationPictureMax:  s.data.durationPictureMax  ?? 180,
        durationPictureFull: s.data.durationPictureFull ?? 180,
        adminNotifyPhone: s.data.adminNotifyPhone || "",
        deploymentNotifyEnabled: s.data.deploymentNotifyEnabled !== false,
        prizeWinnerCount: s.data.prizeWinnerCount ?? 3,
        prizeCalculationMethod: s.data.prizeCalculationMethod || "preset_top3",
        prizeCustomTotalCollection: s.data.prizeCustomTotalCollection ?? null,
        prizeCustomAmounts: Array.isArray(s.data.prizeCustomAmounts) ? s.data.prizeCustomAmounts : [],
        prizeFooterNote: s.data.prizeFooterNote || "*Rewards will credit before evening*",
        monthEndReportAutoSend: s.data.monthEndReportAutoSend !== false,
      });

      if (s.data.prizeWinnerCount) setPrizeWinnerCount(s.data.prizeWinnerCount);
      if (s.data.prizeCalculationMethod) setPrizeCalculationMethod(s.data.prizeCalculationMethod);
      if (s.data.prizeCustomTotalCollection !== undefined && s.data.prizeCustomTotalCollection !== null) {
        setPrizeCustomTotalCollection(String(s.data.prizeCustomTotalCollection));
      }
      if (Array.isArray(s.data.prizeCustomAmounts) && s.data.prizeCustomAmounts.length > 0) {
        setPrizeCustomAmounts(prev => {
          const next = [...prev];
          s.data.prizeCustomAmounts.forEach((a, i) => { next[i] = String(a); });
          return next;
        });
      }
      if (s.data.prizeFooterNote) setPrizeFooterNote(s.data.prizeFooterNote);
      if (s.data.monthEndReportAutoSend !== undefined) setMonthEndReportAutoSend(s.data.monthEndReportAutoSend);

      setDataLoaded(prev => ({ ...prev, settings: true }));
    } catch (err) {
      console.error("Failed to load settings:", err);
      msg("Failed to load settings", "danger");
    }
  };

  const loadWhatsAppStatus = async () => {
    try {
      setWaLoading(true);
      const res = await api.get("/whatsapp/status");
      if (res.data?.success) {
        setWaStatus(res.data);
      }
    } catch (err) {
      console.warn("Failed to load WhatsApp status:", err);
    } finally {
      setWaLoading(false);
    }
  };

  const handleSendPosterToGroup = async () => {
    try {
      setWaSendingPoster(true);
      const res = await api.post("/whatsapp/send-poster");
      if (res.data?.success) {
        msg("✅ Poster and caption sent to WhatsApp group successfully!", "success");
      }
    } catch (err) {
      msg(err.response?.data?.error || "Failed to send poster to WhatsApp group", "danger");
    } finally {
      setWaSendingPoster(false);
    }
  };

  const handleSendSubmissionReportToGroup = async () => {
    try {
      setWaSendingReport(true);
      const res = await api.post("/whatsapp/send-submission-report");
      if (res.data?.success) {
        msg(`✅ Submission report sent to group! (${res.data.submittedCount}/${res.data.totalPaid} paid students submitted)`, "success");
        loadWhatsAppStatus();
      }
    } catch (err) {
      msg(err.response?.data?.error || "Failed to send submission report to WhatsApp group", "danger");
    } finally {
      setWaSendingReport(false);
    }
  };

  const loadWaPrizeSummary = async (overrides = null) => {
    try {
      const isInitialFetch = overrides === null;

      const effectiveWinnerCount = (overrides && overrides.winnerCount != null) ? overrides.winnerCount : prizeWinnerCount;
      const effectiveMethod = (overrides && overrides.calculationMethod) ? overrides.calculationMethod : prizeCalculationMethod;
      const effectiveCollection = (overrides && overrides.totalCollection !== undefined)
        ? (overrides.totalCollection !== "" ? overrides.totalCollection : undefined)
        : (prizeCustomTotalCollection !== "" ? prizeCustomTotalCollection : undefined);
      const effectiveCustomAmounts = (overrides && overrides.customAmounts != null)
        ? overrides.customAmounts
        : prizeCustomAmounts.slice(0, effectiveWinnerCount).filter(Boolean).join(",");
      const effectiveWinnerNames = (overrides && overrides.customWinnerNames != null)
        ? overrides.customWinnerNames
        : prizeWinnerNames.slice(0, effectiveWinnerCount).filter(Boolean).join(",");
      const effectiveFooterNote = (overrides && overrides.footerNote != null) ? overrides.footerNote : prizeFooterNote;

      const params = new URLSearchParams();
      if (!isInitialFetch) {
        if (effectiveWinnerCount != null) params.append("winnerCount", effectiveWinnerCount);
        if (effectiveMethod) params.append("calculationMethod", effectiveMethod);
        if (effectiveCollection != null && effectiveCollection !== "") params.append("totalCollection", effectiveCollection);
        if (effectiveCustomAmounts) params.append("customAmounts", effectiveCustomAmounts);
        if (effectiveWinnerNames) params.append("customWinnerNames", effectiveWinnerNames);
        if (effectiveFooterNote) params.append("footerNote", effectiveFooterNote);
      }

      const queryString = params.toString() ? `?${params.toString()}` : "";
      const res = await api.get(`/whatsapp/month-end-summary${queryString}`);
      if (res.data?.success) {
        setWaPrizeSummary(res.data);
        if (isInitialFetch) {
          if (res.data.winnerCount) setPrizeWinnerCount(res.data.winnerCount);
          if (res.data.calculationMethod) setPrizeCalculationMethod(res.data.calculationMethod);
          setPrizeCustomTotalCollection(res.data.prizeCustomTotalCollection != null ? String(res.data.prizeCustomTotalCollection) : "");
          if (res.data.footerNote) setPrizeFooterNote(res.data.footerNote);
          if (res.data.autoSendEnabled != null) setMonthEndReportAutoSend(res.data.autoSendEnabled);
          if (Array.isArray(res.data.prizeCustomAmounts) && res.data.prizeCustomAmounts.length > 0) {
            setPrizeCustomAmounts(prev => {
              const next = [...prev];
              res.data.prizeCustomAmounts.forEach((amt, i) => { next[i] = String(amt); });
              return next;
            });
          }
          if (Array.isArray(res.data.winners)) {
            const names = res.data.winners.map(w => w.name);
            setPrizeWinnerNames(prev => {
              const next = [...prev];
              names.forEach((n, i) => { next[i] = n || ""; });
              return next;
            });
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load Month-End Prize summary:", err);
    }
  };

  const handleSendPrizeReportToGroup = async () => {
    try {
      setWaSendingPrizeReport(true);
      const customWinnerNamesList = prizeWinnerNames.slice(0, prizeWinnerCount);
      const res = await api.post("/whatsapp/send-month-end-report", {
        winnerCount: prizeWinnerCount,
        calculationMethod: prizeCalculationMethod,
        totalCollection: prizeCustomTotalCollection !== "" ? Number(prizeCustomTotalCollection) : undefined,
        customAmounts: prizeCustomAmounts.slice(0, prizeWinnerCount).map(Number).filter(n => !isNaN(n)),
        customWinnerNames: customWinnerNamesList,
        footerNote: prizeFooterNote,
      });
      if (res.data?.success) {
        msg("✅ Month-End Prize Distribution Report sent to WhatsApp group successfully!", "success");
        loadWaPrizeSummary();
      }
    } catch (err) {
      msg(err.response?.data?.error || "Failed to send Month-End Prize Report", "danger");
    } finally {
      setWaSendingPrizeReport(false);
    }
  };

  const handleSavePrizeSettings = async () => {
    try {
      setSavingPrizeSettings(true);
      const customWinnerNamesList = prizeWinnerNames.slice(0, prizeWinnerCount);
      const res = await api.post("/whatsapp/save-month-end-settings", {
        winnerCount: prizeWinnerCount,
        calculationMethod: prizeCalculationMethod,
        totalCollection: prizeCustomTotalCollection !== "" ? Number(prizeCustomTotalCollection) : null,
        customAmounts: prizeCustomAmounts.slice(0, prizeWinnerCount).map(Number).filter(n => !isNaN(n)),
        customWinnerNames: customWinnerNamesList,
        footerNote: prizeFooterNote,
        monthEndReportAutoSend,
      });
      if (res.data?.success) {
        msg("✅ Month-End Prize Distribution settings saved to MongoDB successfully!", "success");
        await loadWaPrizeSummary();
      }
    } catch (err) {
      msg(err.response?.data?.error || "Failed to save Month-End Prize settings to MongoDB", "danger");
    } finally {
      setSavingPrizeSettings(false);
    }
  };

  const handleSendSlotNow = async (slot, idx) => {
    try {
      setSendingSlotIndex(idx);
      const res = await api.post("/whatsapp/send-slot-report", {
        slotIndex: idx,
        time: slot.time,
        templateType: slot.templateType || "comprehensive",
        customTemplate: slot.customTemplate || "",
      });
      if (res.data?.success) {
        msg(`✅ Slot #${idx + 1} (${slot.time}) sent to WhatsApp group! (${res.data.submittedCount || 0}/${res.data.totalPaid || 0} submitted)`, "success");
        setSettings(prev => {
          const list = [...(prev.submissionReportSlots || [])];
          if (list[idx]) {
            list[idx] = {
              ...list[idx],
              lastStatus: "success",
              lastError: null,
              completed: true,
              failed: false,
              lastSentTime: slot.time,
            };
          }
          return { ...prev, submissionReportSlots: list };
        });
        loadWhatsAppStatus();
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || "Failed to send slot message to WhatsApp group";
      msg(errMsg, "danger");
      setSettings(prev => {
        const list = [...(prev.submissionReportSlots || [])];
        if (list[idx]) {
          list[idx] = {
            ...list[idx],
            lastStatus: "failed",
            lastError: errMsg,
            completed: false,
            failed: true,
          };
        }
        return { ...prev, submissionReportSlots: list };
      });
    } finally {
      setSendingSlotIndex(null);
    }
  };

  const handleSendTestAdminAlert = async () => {
    try {
      setTestAlertLoading(true);
      const res = await api.post("/whatsapp/send-test-admin-alert", {
        phone: settings.adminNotifyPhone,
      });
      if (res.data?.success) {
        msg("✅ Test deployment alert sent to your personal WhatsApp!", "success");
      }
    } catch (err) {
      msg(err.response?.data?.error || "Failed to send test WhatsApp message", "danger");
    } finally {
      setTestAlertLoading(false);
    }
  };

  const handleSortSlots = (order = "asc") => {
    setSlotSortOrder(order);
    setSettings(s => {
      const list = [...(s.submissionReportSlots || [])];
      list.sort((a, b) => {
        const cmp = (a.time || "00:00").localeCompare(b.time || "00:00");
        return order === "asc" ? cmp : -cmp;
      });
      return {
        ...s,
        submissionReportSlots: list,
        submissionReportTimes: list.map(x => x.time),
      };
    });
    msg(
      order === "asc"
        ? "⏱️ Time slots sorted: Ascending (AM ➔ PM / Morning to Night)"
        : "⏱️ Time slots sorted: Descending (PM ➔ AM / Night to Morning)",
      "info"
    );
  };

  const handleReconnectWhatsApp = async (force = false) => {
    try {
      setWaReconnecting(true);
      const res = await api.post("/whatsapp/reconnect", { force });
      msg(force ? "⚡ Session reset. Generating fresh QR code..." : "🔄 Reconnecting WhatsApp socket...", "info");
      await loadWhatsAppStatus();
    } catch (err) {
      msg("Failed to trigger reconnect", "danger");
    } finally {
      setWaReconnecting(false);
    }
  };

  const handleLogoutWhatsApp = async () => {
    if (!window.confirm("Are you sure you want to disconnect WhatsApp and clear credentials?")) return;
    try {
      setWaUnlinking(true);
      await api.post("/whatsapp/logout");
      msg("🚪 Disconnected & unlinked WhatsApp device.", "info");
      await loadWhatsAppStatus();
    } catch (err) {
      msg("Failed to log out from WhatsApp", "danger");
    } finally {
      setWaUnlinking(false);
    }
  };

  // Load initial data on mount
  useEffect(() => {
    loadInitial();
    loadWhatsAppStatus();
  }, []);

  // Poll WhatsApp status while on WhatsApp tab or if QR scan needed
  useEffect(() => {
    if (tab === "whatsapp" || (!waStatus?.isConnected && tab === "today")) {
      loadWhatsAppStatus();
      loadWaPrizeSummary();
      const interval = setInterval(loadWhatsAppStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [tab, waStatus?.isConnected]);

  // Load data based on active tab
  useEffect(() => {
    if (tab === "overview") {
      // Overview needs dashboard data (already loaded)
    } else if (tab === "today" || tab === "users" || tab === "submissions" || tab === "points") {
      loadUsers();
    } else if (tab === "questions" || tab === "manual-questions") {
      loadQuestions();
    } else if (tab === "reports") {
      loadReports();
    } else if (tab === "registrations") {
      loadPendingRegs();
    } else if (tab === "payments") {
      loadPayments();
    } else if (tab === "settings") {
      loadSettings();
    } else if (tab === "whatsapp") {
      loadWhatsAppStatus();
    }
  }, [tab]);

  const msg = (text, type="success") => { setFlash({text,type}); setTimeout(()=>setFlash(null),3000); };
  
  // Smart reload - only reload what's currently visible/needed
  const reload = async (dataTypes = []) => {
    const promises = [];
    
    if (dataTypes.includes('dashboard') || dataTypes.length === 0) {
      promises.push(api.get("/dashboard").then(d => setDash(d.data)));
    }
    if (dataTypes.includes('users') || dataTypes.length === 0) {
      promises.push(api.get("/users").then(u => setUsers(u.data)));
    }
    if (dataTypes.includes('questions')) {
      promises.push(api.get("/questions?limit=50").then(q => setQuestions(q.data.questions)));
    }
    if (dataTypes.includes('reports')) {
      promises.push(
        Promise.all([
          api.get("/dashboard/report/weekly"),
          api.get("/dashboard/report/monthly"),
        ]).then(([w, m]) => {
          setWeekly(w.data);
          setMonthly(m.data);
        })
      );
    }
    
    if (promises.length > 0) {
      await Promise.all(promises).catch(err => {
        console.error("Reload failed:", err);
      });
    }
  };
  
  const toggleUser = async (phone) => { 
    await api.patch(`/users/${phone}/toggle`); 
    msg("Status toggled"); 
    reload(['users']); // Only reload users
  };
  
  const viewStudentDetail = (user) => {
    setSelectedStudent(user);
    setTab("student-detail");
  };

  const handleSubmissionUpdate = (type, newValue) => {
    if (!selectedStudent) return;
    // Update the selected student's submission count
    setSelectedStudent(prev => ({
      ...prev,
      [`${type}Submissions`]: newValue
    }));
    // Also update in the users list
    setUsers(prev => prev.map(u => 
      u.phone === selectedStudent.phone 
        ? { ...u, [`${type}Submissions`]: newValue }
        : u
    ));
  };

  const deleteUser = async (phone) => {
    setModal({
      type: "danger", title: "Remove User",
      message: "This user will be permanently removed. Are you sure?",
      confirmText: "Remove",
      onConfirm: async () => { 
        setModal(null); 
        await api.delete(`/users/${phone}`); 
        msg("Removed","danger"); 
        reload(['users', 'dashboard']); // Reload users and dashboard stats
      },
    });
  };
  const adjustFine = (phone, cur) => {
    setFineInput("0");
    setModal({
      type: "confirm", title: "Adjust Fine",
      message: `Current fine: ₹${cur}. Enter amount to add (negative to deduct):`,
      confirmText: "Apply",
      isFineInput: true,
      phone,
    });
  };
  const resetFine = async (phone) => {
    setModal({
      type: "danger", title: "Reset Fine",
      message: "Reset this user's fine to ₹0?",
      confirmText: "Reset",
      onConfirm: async () => {
        setModal(null);
        const u = users.find(x=>x.phone===phone);
        if (!u) return;
        await api.patch(`/users/${phone}/fine`,{amount:-(u.fine||0)});
        msg("Fine reset"); 
        reload(['users', 'dashboard']); // Reload users and dashboard stats
      },
    });
  };
  const saveQ = async (e) => { 
    e.preventDefault(); 
    if(editQ){
      await api.patch(`/questions/${editQ._id}`,qForm);
      setEditQ(null);
      msg("Updated!");
    }else{
      await api.post("/questions",qForm);
      msg("Added!");
    } 
    setQForm({category:"",topic:"",question:""}); 
    reload(['questions']); // Only reload questions
  };
  const deleteQ = async (id) => {
    setModal({
      type: "danger", title: "Delete Question",
      message: "This question will be permanently deleted.",
      confirmText: "Delete",
      onConfirm: async () => { 
        setModal(null); 
        await api.delete(`/questions/${id}`); 
        msg("Deleted","danger"); 
        reload(['questions']); // Only reload questions
      },
    });
  };
  const startEdit = (q) => { setEditQ(q); setQForm({category:q.category,topic:q.topic,question:q.question}); window.scrollTo({top:0,behavior:"smooth"}); };

  const saveSettings = async (e, section) => {
    e.preventDefault();
    setSavingSection(section);
    try {
      await api.patch("/dashboard/settings", settings);
      // Re-fetch fresh values to update state (bypasses 30s GET cache)
      const fresh = await api.get("/dashboard/settings?_t=" + Date.now());
      setSettings(s => ({
        ...s,
        posterSendTime: fresh.data.posterSendTime || "08:00",
        questionGenerateTime: fresh.data.questionGenerateTime || "07:00",
        submissionReportEnabled: fresh.data.submissionReportEnabled !== false,
        submissionReportTimes: Array.isArray(fresh.data.submissionReportTimes) && fresh.data.submissionReportTimes.length > 0
          ? fresh.data.submissionReportTimes
          : [fresh.data.submissionReportTime1 || "18:00", fresh.data.submissionReportTime2 || "21:00"].filter(Boolean),
        submissionReportSlots: Array.isArray(fresh.data.submissionReportSlots) && fresh.data.submissionReportSlots.length > 0
          ? fresh.data.submissionReportSlots
          : (Array.isArray(fresh.data.submissionReportTimes) ? fresh.data.submissionReportTimes : ["18:00", "21:00"]).map((t, idx) => ({
              time: t,
              templateType: idx === 1 ? "urgent" : "comprehensive",
              customTemplate: "",
            })),
        submissionReportTemplates: fresh.data.submissionReportTemplates || {},
        submissionReportTemplate: fresh.data.submissionReportTemplate || "",
        submissionReportSlotTemplates: fresh.data.submissionReportSlotTemplates || {},
        vocabWordCount: fresh.data.vocabWordCount ?? 5,
        vocabRequiredCount: fresh.data.vocabRequiredCount ?? 3,
        vocabNormalWordCount: fresh.data.vocabNormalWordCount ?? 5,
        vocabNormalRequiredCount: fresh.data.vocabNormalRequiredCount ?? 3,
        vocabStoryWordCount: fresh.data.vocabStoryWordCount ?? 5,
        vocabStoryRequiredCount: fresh.data.vocabStoryRequiredCount ?? 3,
        vocabPictureWordCount: fresh.data.vocabPictureWordCount ?? 5,
        vocabPictureRequiredCount: fresh.data.vocabPictureRequiredCount ?? 3,
        vocabLevel: fresh.data.vocabLevel || "B2",
        storyWordCount: fresh.data.storyWordCount ?? 200,
        storyLevel: fresh.data.storyLevel || "B1",
        storyDays: Array.isArray(fresh.data.storyDays)
          ? fresh.data.storyDays
          : (fresh.data.storyDay !== undefined ? [fresh.data.storyDay] : [6]),
        storyDay: fresh.data.storyDay ?? 6,
        pictureDescriptionDays: Array.isArray(fresh.data.pictureDescriptionDays)
          ? fresh.data.pictureDescriptionDays
          : (fresh.data.pictureDescriptionDay !== undefined && fresh.data.pictureDescriptionDay !== -1 ? [fresh.data.pictureDescriptionDay] : [4]),
        pictureDescriptionDay: fresh.data.pictureDescriptionDay ?? -1,
        paymentAmount: fresh.data.paymentAmount ?? 5,
        durationDefaultMax: fresh.data.durationDefaultMax ?? 300,
        durationDefaultFull: fresh.data.durationDefaultFull ?? 300,
        durationStoryMax: fresh.data.durationStoryMax ?? 180,
        durationStoryFull: fresh.data.durationStoryFull ?? 180,
        durationWeeklyMax: fresh.data.durationWeeklyMax ?? 420,
        durationWeeklyFull: fresh.data.durationWeeklyFull ?? 300,
        durationMonthlyReflectionMax: fresh.data.durationMonthlyReflectionMax ?? 420,
        durationMonthlyReflectionFull: fresh.data.durationMonthlyReflectionFull ?? 420,
        durationMonthlyGoalsMax: fresh.data.durationMonthlyGoalsMax ?? 600,
        durationMonthlyGoalsFull: fresh.data.durationMonthlyGoalsFull ?? 420,
        durationPictureMax:  fresh.data.durationPictureMax  ?? 180,
        durationPictureFull: fresh.data.durationPictureFull ?? 180,
        adminNotifyPhone: fresh.data.adminNotifyPhone || "",
        deploymentNotifyEnabled: fresh.data.deploymentNotifyEnabled !== false,
      }));
      msg("Settings saved!");
    } catch (err) {
      msg(err?.response?.data?.error || "Failed to save settings", "danger");
    } finally {
      setSavingSection(null);
    }
  };

  const resetWeekly = () => {
    setModal({
      type: "danger", title: "Reset Weekly Submissions",
      message: "This will reset ALL users' weekly submission count to 0. Continue?",
      confirmText: "Reset Weekly",
      onConfirm: async () => {
        setModal(null);
        setResetting("weekly");
        try {
          await api.post("/users/reset/weekly");
          msg("Weekly submissions reset for all users");
          reload(['users', 'dashboard', 'reports']); // Reload affected data
        } catch (err) {
          msg(err?.response?.data?.error || "Reset failed", "danger");
        } finally { setResetting(""); }
      },
    });
  };

  const resetMonthly = () => {
    setModal({
      type: "danger", title: "Reset Monthly Submissions",
      message: "This will reset ALL users' monthly submission count to 0. Are you sure?",
      confirmText: "Reset Monthly",
      onConfirm: async () => {
        setModal(null);
        setResetting("monthly");
        try {
          await api.post("/users/reset/monthly");
          msg("Monthly submissions reset for all users");
          reload(['users', 'dashboard', 'reports']); // Reload affected data
        } catch (err) {
          msg(err?.response?.data?.error || "Reset failed", "danger");
        } finally { setResetting(""); }
      },
    });
  };

  const openPointsModal = (u, defaultMode = "add", targetType = "points") => {
    if (!u) return;
    let initialAmount = 50;
    if (targetType === "streak") {
      initialAmount = defaultMode === "set" ? (u.streak || 0) : 1;
    } else if (targetType === "freeze") {
      initialAmount = defaultMode === "set" ? (u.streakFreeze || 0) : 1;
    } else if (targetType === "wallet") {
      initialAmount = defaultMode === "set" ? (u.walletBalance || 0) : 50;
    } else {
      initialAmount = defaultMode === "set" ? Math.round(u.monthlyScore || 0) : 50;
    }

    setPointsModal({
      isOpen: true,
      user: u,
      targetType, // "points" | "streak" | "freeze" | "wallet"
      mode: defaultMode,
      amount: initialAmount,
      reason: "",
    });

    if (targetType === "wallet" && u.phone) {
      api.get(`/payments/admin/wallet-history/${encodeURIComponent(u.phone)}`)
        .then(res => {
          if (res.data?.success) {
            setWalletHistoryList(res.data.walletHistory || []);
            if (res.data.user?.walletBalance != null) {
              setPointsModal(prev => prev ? {
                ...prev,
                user: { ...prev.user, walletBalance: res.data.user.walletBalance, walletHistory: res.data.walletHistory }
              } : null);
              setUsers(prev => prev.map(usr => usr.phone === u.phone ? { ...usr, walletBalance: res.data.user.walletBalance, walletHistory: res.data.walletHistory } : usr));
              setSelectedStudent(s => s && s.phone === u.phone ? { ...s, walletBalance: res.data.user.walletBalance, walletHistory: res.data.walletHistory } : s);
            }
          }
        })
        .catch(err => {
          console.warn("Failed to fetch fresh student wallet history:", err);
        });
    }
  };

  const savePointsAdjustment = async () => {
    if (!pointsModal?.user) return;
    const amount = Number(pointsModal.amount);
    const targetType = pointsModal.targetType || "points";
    const phone = pointsModal.user.phone;
    const studentName = pointsModal.user.registeredName || pointsModal.user.name || phone;

    if (targetType === "wallet") {
      const actionType = pointsModal.mode === "add" ? "credit" : (pointsModal.mode === "remove" ? "debit" : "set");
      if (actionType === "set") {
        if (isNaN(amount) || amount < 0) {
          msg("Please enter a valid balance amount (₹0 or greater)", "danger");
          return;
        }
      } else {
        if (isNaN(amount) || amount <= 0) {
          msg("Please enter a valid positive amount in ₹", "danger");
          return;
        }
      }

      setSavingPoints(true);
      try {
        const res = await api.post("/payments/admin/wallet-adjust", {
          phone,
          actionType,
          amount,
          reason: pointsModal.reason,
        });

        if (res.data?.success) {
          msg(`✅ Wallet ${actionType}ed successfully for ${studentName}! New balance: ₹${res.data.walletBalance}`, "success");
          setWalletHistoryList(res.data.walletHistory || []);
          setUsers(prev => prev.map(u => {
            const uPhone = String(u.phone || "").replace(/^(\+91|91)/, "");
            const targetPhone = String(phone).replace(/^(\+91|91)/, "");
            if (uPhone === targetPhone || u.phone === phone || (pointsModal.user.userId && u.userId === pointsModal.user.userId)) {
              return { ...u, walletBalance: res.data.walletBalance, walletHistory: res.data.walletHistory };
            }
            return u;
          }));

          setSelectedStudent(s => {
            if (!s) return null;
            const sPhone = String(s.phone || "").replace(/^(\+91|91)/, "");
            const targetPhone = String(phone).replace(/^(\+91|91)/, "");
            if (sPhone === targetPhone || s.phone === phone || (pointsModal.user.userId && s.userId === pointsModal.user.userId)) {
              return { ...s, walletBalance: res.data.walletBalance, walletHistory: res.data.walletHistory };
            }
            return s;
          });
        }
        setPointsModal(null);
      } catch (err) {
        msg(err?.response?.data?.error || "Failed to adjust wallet balance", "danger");
      } finally {
        setSavingPoints(false);
      }
      return;
    }

    if (isNaN(amount) || amount < 0) {
      msg("Please enter a valid amount", "danger");
      return;
    }
    setSavingPoints(true);
    try {
      if (targetType === "streak") {
        const { data } = await api.patch(`/users/${encodeURIComponent(phone)}/streak`, {
          amount,
          mode: pointsModal.mode,
        });

        setUsers(prev => prev.map(u => {
          const uPhone = String(u.phone || "").replace(/^(\+91|91)/, "");
          const targetPhone = String(phone).replace(/^(\+91|91)/, "");
          if (uPhone === targetPhone || u.phone === phone || (pointsModal.user.userId && u.userId === pointsModal.user.userId)) {
            return { ...u, streak: data.streak };
          }
          return u;
        }));

        setSelectedStudent(s => {
          if (!s) return null;
          const sPhone = String(s.phone || "").replace(/^(\+91|91)/, "");
          const targetPhone = String(phone).replace(/^(\+91|91)/, "");
          if (sPhone === targetPhone || s.phone === phone || (pointsModal.user.userId && s.userId === pointsModal.user.userId)) {
            return { ...s, streak: data.streak };
          }
          return s;
        });

        const changeText = data.change >= 0 ? `+${data.change}` : `${data.change}`;
        msg(`🔥 Updated streak for ${studentName}: ${data.previousStreak} → ${data.streak} (${changeText} days)`);
      } else if (targetType === "freeze") {
        const { data } = await api.patch(`/users/${encodeURIComponent(phone)}/freeze`, {
          amount,
          mode: pointsModal.mode,
        });

        setUsers(prev => prev.map(u => {
          const uPhone = String(u.phone || "").replace(/^(\+91|91)/, "");
          const targetPhone = String(phone).replace(/^(\+91|91)/, "");
          if (uPhone === targetPhone || u.phone === phone || (pointsModal.user.userId && u.userId === pointsModal.user.userId)) {
            return { ...u, streakFreeze: data.streakFreeze };
          }
          return u;
        }));

        setSelectedStudent(s => {
          if (!s) return null;
          const sPhone = String(s.phone || "").replace(/^(\+91|91)/, "");
          const targetPhone = String(phone).replace(/^(\+91|91)/, "");
          if (sPhone === targetPhone || s.phone === phone || (pointsModal.user.userId && s.userId === pointsModal.user.userId)) {
            return { ...s, streakFreeze: data.streakFreeze };
          }
          return s;
        });

        msg(`🧊 Updated streak freeze for ${studentName}: ${data.previousFreeze} → ${data.streakFreeze} shields`);
      } else {
        const { data } = await api.patch(`/users/${encodeURIComponent(phone)}/points`, {
          amount,
          mode: pointsModal.mode,
          reason: pointsModal.reason,
        });

        // Update in-memory users list
        setUsers(prev => prev.map(u => {
          const uPhone = String(u.phone || "").replace(/^(\+91|91)/, "");
          const targetPhone = String(phone).replace(/^(\+91|91)/, "");
          if (uPhone === targetPhone || u.phone === phone || (pointsModal.user.userId && u.userId === pointsModal.user.userId)) {
            return { ...u, monthlyScore: data.monthlyScore };
          }
          return u;
        }));

        // Update selectedStudent if open in modal/drawer
        setSelectedStudent(s => {
          if (!s) return null;
          const sPhone = String(s.phone || "").replace(/^(\+91|91)/, "");
          const targetPhone = String(phone).replace(/^(\+91|91)/, "");
          if (sPhone === targetPhone || s.phone === phone || (pointsModal.user.userId && s.userId === pointsModal.user.userId)) {
            return { ...s, monthlyScore: data.monthlyScore };
          }
          return s;
        });

        const changeText = data.change >= 0 ? `+${data.change}` : `${data.change}`;
        msg(`⭐ Updated points for ${studentName}: ${Math.round(data.previousScore)} → ${Math.round(data.monthlyScore)} (${changeText} pts)`);
      }

      setPointsModal(null);
    } catch (err) {
      msg(err?.response?.data?.error || "Failed to update ledger values", "danger");
    } finally {
      setSavingPoints(false);
    }
  };

  const filteredUsers = useMemo(()=>{
    const s = search.toLowerCase();
    const bySearch = users.filter(u => (u.registeredName||u.name||"").toLowerCase().includes(s)||(u.phone||"").includes(s));
    const today = new Date().toDateString();
    switch(userFilter) {
      case "paid":      return bySearch.filter(u => u.paid);
      case "submitted": return bySearch.filter(u => u.completed);
      case "pending":   return bySearch.filter(u => u.paid && !u.completed);
      case "streak":    return bySearch.filter(u => (u.streak||0) >= 7);
      case "trainers":  return bySearch.filter(u => u.role === "trainer" || u.role === "admins" || u.role === "admin");
      default:          return bySearch;
    }
  }, [users, search, userFilter]);
  const filteredQ = useMemo(()=>questions.filter(q=>(qCat?q.category===qCat:true)&&(q.question.toLowerCase().includes(qSearch.toLowerCase())||q.topic.toLowerCase().includes(qSearch.toLowerCase()))),[questions,qSearch,qCat]);

  const pieSub = [{name:"Submitted",value:dash?.stats?.completed||0,color:"#4ade80"},{name:"Pending",value:dash?.stats?.pending||0,color:"#f87171"}];
  const catCount = questions.reduce((a,q)=>{a[q.category]=(a[q.category]||0)+1;return a},{});
  const catPie = Object.entries(catCount).map(([name,value])=>({name,value}));
  const fineBar = [...users].filter(u=>(u.fine||0)>0).sort((a,b)=>(b.fine||0)-(a.fine||0)).slice(0,10).map(u=>({name:(u.registeredName||u.name||"?").slice(0,8),fine:u.fine||0}));

  if (loading) return <Layout><div className="spinner-wrap"><div className="spinner"/></div></Layout>;

  return (
    <Layout>
      {modal && (
        <Modal
          type={modal.type}
          title={modal.title}
          message={
            modal.isFineInput ? (
              <div>
                <p style={{ marginBottom: "0.75rem", color: "var(--muted)", fontSize: "0.9rem" }}>{modal.message}</p>
                <input
                  className="form-input"
                  type="number"
                  value={fineInput}
                  onChange={e => setFineInput(e.target.value)}
                  style={{ textAlign: "center", fontSize: "1.1rem" }}
                  autoFocus
                />
              </div>
            ) : modal.message
          }
          confirmText={modal.confirmText}
          onConfirm={modal.isFineInput ? async () => {
            if (isNaN(+fineInput)) return;
            setModal(null);
            await api.patch(`/users/${modal.phone}/fine`, { amount: +fineInput });
            msg(`Fine adjusted ₹${fineInput}`); 
            reload(['users', 'dashboard']); // Reload users and dashboard stats
          } : modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}
      {flash && <div className={`flash ${flash.type}`}>{flash.text}</div>}
      
      {/* Official Invoice / Receipt Modal */}
      {selectedAdminInvoiceTx && (
        <Suspense fallback={null}>
          <InvoiceModal
            transaction={selectedAdminInvoiceTx}
            onClose={() => setSelectedAdminInvoiceTx(null)}
          />
        </Suspense>
      )}

      {/* Points, Streak & Freeze Management Modal */}
      {pointsModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}>
          <div style={{
            background: "linear-gradient(180deg, #18192a 0%, #0f101c 100%)",
            border: `1px solid ${pointsModal.targetType === "streak" ? "rgba(249, 115, 22, 0.4)" : pointsModal.targetType === "freeze" ? "rgba(56, 189, 248, 0.4)" : pointsModal.targetType === "wallet" ? "rgba(16, 185, 129, 0.4)" : "rgba(167, 139, 250, 0.4)"}`,
            boxShadow: `0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px ${pointsModal.targetType === "streak" ? "rgba(249, 115, 22, 0.2)" : pointsModal.targetType === "freeze" ? "rgba(56, 189, 248, 0.2)" : pointsModal.targetType === "wallet" ? "rgba(16, 185, 129, 0.2)" : "rgba(124, 111, 255, 0.2)"}`,
            borderRadius: 20,
            width: "100%",
            maxWidth: 520,
            overflow: "hidden",
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "1.25rem 1.5rem",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: pointsModal.targetType === "streak" ? "linear-gradient(135deg, rgba(249, 115, 22, 0.3), rgba(234, 88, 12, 0.3))" : pointsModal.targetType === "freeze" ? "linear-gradient(135deg, rgba(56, 189, 248, 0.3), rgba(14, 165, 233, 0.3))" : pointsModal.targetType === "wallet" ? "linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.3))" : "linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(99, 102, 241, 0.3))",
                  border: `1px solid ${pointsModal.targetType === "streak" ? "rgba(249, 115, 22, 0.5)" : pointsModal.targetType === "freeze" ? "rgba(56, 189, 248, 0.5)" : pointsModal.targetType === "wallet" ? "rgba(16, 185, 129, 0.5)" : "rgba(168, 85, 247, 0.5)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.2rem",
                }}>
                  {pointsModal.targetType === "streak" ? "🔥" : pointsModal.targetType === "freeze" ? "🧊" : pointsModal.targetType === "wallet" ? "💰" : "⭐"}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#fff" }}>
                    {pointsModal.targetType === "streak" ? "Manage Daily Streak" : pointsModal.targetType === "freeze" ? "Manage Streak Freezes" : pointsModal.targetType === "wallet" ? "Manage Student Wallet" : "Manage Monthly Points"}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                    {pointsModal.user?.registeredName || pointsModal.user?.name || "Student"} ({pointsModal.user?.phone})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPointsModal(null)}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "#94a3b8",
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                }}
              >
                ✕
              </button>
            </div>

            {/* Target Category Switcher (Points / Streak / Freeze / Wallet) */}
            <div style={{ padding: "0.85rem 1.4rem 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.4rem" }}>
              {[
                { id: "points", label: "⭐ Points", color: "#c4b5fd" },
                { id: "streak", label: "🔥 Streak", color: "#fdba74" },
                { id: "freeze", label: "🧊 Freeze", color: "#7dd3fc" },
                { id: "wallet", label: "💰 Wallet", color: "#4ade80" },
              ].map(cat => {
                const isActive = (pointsModal.targetType || "points") === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      let defaultAmt = 50;
                      if (cat.id === "streak" || cat.id === "freeze") defaultAmt = 1;
                      else defaultAmt = 50;

                      setPointsModal(prev => ({
                        ...prev,
                        targetType: cat.id,
                        mode: "add",
                        amount: defaultAmt,
                      }));

                      if (cat.id === "wallet" && pointsModal.user?.phone) {
                        api.get(`/payments/admin/wallet-history/${encodeURIComponent(pointsModal.user.phone)}`)
                          .then(res => {
                            if (res.data?.success) {
                              setWalletHistoryList(res.data.walletHistory || []);
                              if (res.data.user?.walletBalance != null) {
                                setPointsModal(p => p ? {
                                  ...p,
                                  user: { ...p.user, walletBalance: res.data.user.walletBalance, walletHistory: res.data.walletHistory }
                                } : null);
                              }
                            }
                          })
                          .catch(() => {});
                      }
                    }}
                    style={{
                      padding: "0.5rem 0.3rem",
                      borderRadius: 10,
                      fontSize: "0.78rem",
                      fontWeight: 800,
                      border: isActive ? `1px solid ${cat.color}` : "1px solid rgba(255, 255, 255, 0.06)",
                      background: isActive ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.25)",
                      color: isActive ? cat.color : "var(--muted)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Modal Body */}
            <div style={{ padding: "1.2rem 1.4rem 1.4rem", display: "flex", flexDirection: "column", gap: "1.15rem" }}>
              
              {/* Value Comparison Display */}
              {(() => {
                const target = pointsModal.targetType || "points";
                let currentVal = 0;
                let unit = "pts";
                let icon = "⭐";
                let activeColor = "#c4b5fd";

                if (target === "streak") {
                  currentVal = Number(pointsModal.user?.streak || 0);
                  unit = "days";
                  icon = "🔥";
                  activeColor = "#f97316";
                } else if (target === "freeze") {
                  currentVal = Number(pointsModal.user?.streakFreeze || 0);
                  unit = "shields";
                  icon = "🧊";
                  activeColor = "#38bdf8";
                } else if (target === "wallet") {
                  currentVal = Number(pointsModal.user?.walletBalance || 0);
                  unit = "₹";
                  icon = "💰";
                  activeColor = "#4ade80";
                } else {
                  currentVal = Number(pointsModal.user?.monthlyScore || 0);
                  unit = "pts";
                  icon = "⭐";
                  activeColor = "#c4b5fd";
                }

                const inputVal = Number(pointsModal.amount || 0);
                const projectedVal = pointsModal.mode === "set"
                  ? Math.max(0, inputVal)
                  : pointsModal.mode === "remove"
                  ? Math.max(0, currentVal - Math.abs(inputVal))
                  : Math.max(0, currentVal + inputVal);

                return (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.85rem 1.1rem",
                    borderRadius: 12,
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.07)",
                  }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>
                        Current {target === "streak" ? "Streak" : target === "freeze" ? "Freezes" : target === "wallet" ? "Wallet Balance" : "Score"}
                      </div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 800, color: activeColor, marginTop: "0.15rem" }}>
                        {target === "wallet" ? `💰 ₹${Math.round(currentVal).toLocaleString()}` : `${icon} ${Math.round(currentVal).toLocaleString()} ${unit}`}
                      </div>
                    </div>
                    <div style={{ fontSize: "1.2rem", color: "var(--muted)" }}>➔</div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>
                        Projected {target === "streak" ? "Streak" : target === "freeze" ? "Freezes" : target === "wallet" ? "Wallet Balance" : "Score"}
                      </div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 800, color: projectedVal >= currentVal ? "#4ade80" : "#f87171", marginTop: "0.15rem" }}>
                        {target === "wallet" ? `💰 ₹${Math.round(projectedVal).toLocaleString()}` : `${icon} ${Math.round(projectedVal).toLocaleString()} ${unit}`}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Action Mode Tabs */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0.35rem",
                background: "rgba(0, 0, 0, 0.35)",
                padding: "4px",
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.07)",
              }}>
                {(() => {
                  const target = pointsModal.targetType || "points";
                  const isWallet = target === "wallet";
                  const addText = isWallet ? "➕ Credit (+₹)" : `➕ Add ${target === "streak" ? "Days" : target === "freeze" ? "Freezes" : "Points"}`;
                  const removeText = isWallet ? "➖ Debit (-₹)" : `➖ Deduct ${target === "streak" ? "Days" : target === "freeze" ? "Freezes" : "Points"}`;
                  const setText = isWallet ? "✏️ Set Exact Balance" : "✏️ Set Exact";

                  return [
                    { id: "add", label: addText, color: "#4ade80" },
                    { id: "remove", label: removeText, color: "#f87171" },
                    { id: "set", label: setText, color: "#a78bfa" },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        let curr = 0;
                        if (target === "streak") curr = pointsModal.user?.streak || 0;
                        else if (target === "freeze") curr = pointsModal.user?.streakFreeze || 0;
                        else if (target === "wallet") curr = pointsModal.user?.walletBalance || 0;
                        else curr = Math.round(pointsModal.user?.monthlyScore || 0);

                        setPointsModal(prev => ({
                          ...prev,
                          mode: m.id,
                          amount: m.id === "set" ? curr : ((target === "points" || target === "wallet") ? 50 : 1),
                        }));
                      }}
                      style={{
                        padding: "0.55rem 0.3rem",
                        borderRadius: 8,
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        background: pointsModal.mode === m.id ? "rgba(255, 255, 255, 0.12)" : "transparent",
                        color: pointsModal.mode === m.id ? (m.id === "add" ? "#4ade80" : m.id === "remove" ? "#f87171" : "#c4b5fd") : "var(--muted)",
                        boxShadow: pointsModal.mode === m.id ? "0 2px 8px rgba(0, 0, 0, 0.4)" : "none",
                      }}
                    >
                      {m.label}
                    </button>
                  ));
                })()}
              </div>

              {/* Amount Input & Quick Chips */}
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.45rem" }}>
                  {(() => {
                    const target = pointsModal.targetType || "points";
                    const noun = target === "streak" ? "Streak Days" : target === "freeze" ? "Streak Freeze Shields" : target === "wallet" ? "Wallet Amount (₹)" : "Monthly Points";
                    return pointsModal.mode === "add" ? `${noun} to Add / Credit (+)` : pointsModal.mode === "remove" ? `${noun} to Deduct / Debit (-)` : `Set Exact ${noun}`;
                  })()}
                </label>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.65rem" }}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={pointsModal.amount}
                    onChange={e => setPointsModal(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="e.g. 50"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "0.65rem 1rem",
                      borderRadius: 10,
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#fff",
                      fontSize: "1.15rem",
                      fontWeight: 800,
                      outline: "none",
                    }}
                    autoFocus
                  />
                </div>

                {/* Quick Preset Buttons */}
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  {(() => {
                    const target = pointsModal.targetType || "points";
                    let presets = [];
                    if (target === "streak") {
                      presets = pointsModal.mode === "add" ? [1, 2, 3, 5, 7, 14, 30] : pointsModal.mode === "remove" ? [1, 2, 3, 5, 7, 14] : [0, 7, 14, 30, 50, 100];
                    } else if (target === "freeze") {
                      presets = pointsModal.mode === "add" ? [1, 2, 3, 5, 10] : pointsModal.mode === "remove" ? [1, 2, 3, 5] : [0, 1, 2, 3, 5, 10];
                    } else if (target === "wallet") {
                      presets = pointsModal.mode === "add" ? [10, 20, 50, 100, 200, 500] : pointsModal.mode === "remove" ? [10, 20, 50, 100, 200] : [0, 50, 100, 200, 500, 1000];
                    } else {
                      presets = pointsModal.mode === "add" ? [10, 25, 50, 100, 250, 500] : pointsModal.mode === "remove" ? [10, 25, 50, 100, 200, 500] : [0, 50, 100, 500, 1000, 2000];
                    }

                    const prefix = target === "wallet" ? "₹" : "";
                    const suffix = target === "streak" ? "d" : target === "freeze" ? " shields" : target === "wallet" ? "" : " pts";

                    return presets.map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPointsModal(prev => ({ ...prev, amount: val }))}
                        style={{
                          padding: "0.3rem 0.65rem",
                          borderRadius: 8,
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          background: Number(pointsModal.amount) === val ? "rgba(124, 111, 255, 0.3)" : "rgba(255, 255, 255, 0.04)",
                          border: Number(pointsModal.amount) === val ? "1px solid #7c6fff" : "1px solid rgba(255, 255, 255, 0.08)",
                          color: Number(pointsModal.amount) === val ? "#fff" : "var(--muted)",
                          cursor: "pointer",
                          transition: "all 0.12s ease",
                        }}
                      >
                        {pointsModal.mode === "add" ? `+${prefix}${val}` : pointsModal.mode === "remove" ? `-${prefix}${val}` : `${prefix}${val}${suffix}`}
                      </button>
                    ));
                  })()}
                </div>
              </div>

              {/* Reason / Note Input (for points/streak tracking) */}
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.45rem" }}>
                  Reason / Audit Note <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: "0.74rem" }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={pointsModal.reason || ""}
                  onChange={e => setPointsModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g. Verified challenge participation"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.55rem 0.85rem",
                    borderRadius: 10,
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "var(--text)",
                    fontSize: "0.82rem",
                    outline: "none",
                  }}
                />
              </div>

              {/* Student Wallet Transaction History (when Wallet tab is active) */}
              {pointsModal.targetType === "wallet" && (
                <div style={{
                  marginTop: "0.25rem",
                  background: "rgba(0, 0, 0, 0.25)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 12,
                  padding: "0.85rem 1rem",
                }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#ffffff", marginBottom: "0.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>📜 Student Wallet Transaction History</span>
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{walletHistoryList.length} records</span>
                  </div>
                  {walletHistoryList.length === 0 ? (
                    <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.76rem", padding: "0.4rem 0", margin: 0 }}>
                      No wallet transactions recorded yet.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: 150, overflowY: "auto", paddingRight: "0.2rem" }}>
                      {[...walletHistoryList].reverse().map((tx, idx) => (
                        <div key={idx} style={{
                          background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.06)",
                          borderRadius: 8, padding: "0.45rem 0.65rem", display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.1rem" }}>
                              {tx.reason || "Wallet Adjustment"}
                            </div>
                            <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
                              {new Date(tx.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              {" · "}Balance: ₹{tx.balanceAfter}
                            </div>
                          </div>
                          <div style={{
                            fontWeight: 800, fontSize: "0.8rem",
                            color: tx.type === "credit" ? "#4ade80" : "#f87171",
                            background: tx.type === "credit" ? "rgba(74, 222, 128, 0.12)" : "rgba(248, 113, 113, 0.12)",
                            padding: "0.15rem 0.45rem", borderRadius: 6,
                            border: `1px solid ${tx.type === "credit" ? "rgba(74, 222, 128, 0.3)" : "rgba(248, 113, 113, 0.3)"}`,
                          }}>
                            {tx.type === "credit" ? `+₹${tx.amount}` : `-₹${tx.amount}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "1rem 1.5rem",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(0, 0, 0, 0.25)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
            }}>
              <button
                type="button"
                onClick={() => setPointsModal(null)}
                style={{
                  padding: "0.55rem 1.1rem",
                  borderRadius: 10,
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "var(--text)",
                  fontWeight: 700,
                  fontSize: "0.84rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingPoints}
                onClick={savePointsAdjustment}
                style={{
                  padding: "0.55rem 1.3rem",
                  borderRadius: 10,
                  background: pointsModal.mode === "remove" ? "linear-gradient(135deg, #ef4444, #dc2626)" : pointsModal.mode === "set" ? "linear-gradient(135deg, #8b5cf6, #7c6fff)" : pointsModal.targetType === "streak" ? "linear-gradient(135deg, #f97316, #ea580c)" : pointsModal.targetType === "freeze" ? "linear-gradient(135deg, #0284c7, #0369a1)" : "linear-gradient(135deg, #10b981, #059669)",
                  border: "none",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "0.84rem",
                  cursor: savingPoints ? "not-allowed" : "pointer",
                  opacity: savingPoints ? 0.7 : 1,
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
                }}
              >
                {savingPoints
                  ? "Saving..."
                  : pointsModal.targetType === "wallet"
                    ? (pointsModal.mode === "remove" ? "➖ Debit Wallet" : pointsModal.mode === "set" ? "✏️ Set Wallet Balance" : "➕ Credit Wallet")
                    : (pointsModal.mode === "remove" ? "➖ Deduct" : pointsModal.mode === "set" ? "✏️ Update Value" : "➕ Add / Award")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Drawer Backdrop */}
      <div
        className={`admin-sidebar-backdrop${mobileSidebarOpen ? " open" : ""}`}
        onClick={() => setMobileSidebarOpen(false)}
      />

      <div className="admin-dashboard-container">
        {/* Modern Left Sidebar / Mobile Slide-Out Drawer */}
        <aside className={`admin-sidebar${mobileSidebarOpen ? " open" : ""}`}>
          {/* Brand Header */}
          <div className="admin-sidebar-header">
            <div className="admin-sidebar-brand">
              <div className="admin-brand-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                <div className="admin-brand-title">Speak &amp; Shine</div>
                <div className="admin-brand-tag">Control Center</div>
              </div>
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {waStatus?.isConnected ? (
                <span className="status-pill" title="WhatsApp Connected" style={{ fontSize: "0.66rem", padding: "3px 8px" }}>
                  <span className="live-dot" /> Live
                </span>
              ) : (
                <span className="status-pill offline" title="WhatsApp Offline" style={{ fontSize: "0.66rem", padding: "3px 8px" }}>
                  <span className="live-dot red" /> Off
                </span>
              )}
              {/* Close Button on Mobile Drawer */}
              <button
                type="button"
                className="admin-sidebar-close-btn"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Close sidebar"
                title="Close Menu"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Middle Nav - Scrollable */}
          <div className="admin-sidebar-nav" ref={sidebarNavRef}>
            {/* Group 1: Analytics & Performance */}
            <div className="admin-sidebar-section">
              <div className="admin-sidebar-title">Analytics &amp; Activity</div>
              {[
                { id: "overview", label: "Overview" },
                { id: "today", label: "Today's Challenge" },
                { id: "reports", label: "Reports" },
                { id: "points", label: "Points & Streaks" },
                { id: "monitoring", label: "Live Monitor" },
              ].map(t => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`admin-sidebar-item${active ? " active" : ""}`}
                    onClick={() => {
                      setTab(t.id);
                      setMobileSidebarOpen(false);
                    }}
                  >
                    <div className="admin-sidebar-icon-box">
                      <AdminSidebarIcon id={t.id} active={active} />
                    </div>
                    <span className="admin-sidebar-label">{t.label}</span>
                    {active && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Group 2: Students & Community */}
            <div className="admin-sidebar-section">
              <div className="admin-sidebar-title">Students &amp; Community</div>
              {[
                { id: "users", label: "Users & Members", badge: users.length || null },
                { id: "registrations", label: "Registrations", badge: pendingRegs.length > 0 ? `${pendingRegs.length} new` : null, badgeColor: "#fbbf24" },
                { id: "submissions", label: "Submissions" },
                { id: "live", label: "Live Sessions" },
                { id: "payments", label: "Payments" },
              ].map(t => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`admin-sidebar-item${active ? " active" : ""}`}
                    onClick={() => {
                      setTab(t.id);
                      setMobileSidebarOpen(false);
                    }}
                  >
                    <div className="admin-sidebar-icon-box">
                      <AdminSidebarIcon id={t.id} active={active} />
                    </div>
                    <span className="admin-sidebar-label">{t.label}</span>
                    {t.badge && (
                      <span className="admin-sidebar-badge" style={t.badgeColor ? { background: `${t.badgeColor}22`, color: t.badgeColor, borderColor: `${t.badgeColor}44` } : {}}>
                        {t.badge}
                      </span>
                    )}
                    {active && !t.badge && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Group 3: Automation & Content */}
            <div className="admin-sidebar-section">
              <div className="admin-sidebar-title">Automation &amp; Content</div>
              {[
                { id: "questions", label: "Question Bank" },
                { id: "manual-questions", label: "Manual Questions" },
                { id: "whatsapp", label: "WhatsApp Bot" },
                { id: "settings", label: "Settings" },
              ].map(t => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`admin-sidebar-item${active ? " active" : ""}`}
                    onClick={() => {
                      setTab(t.id);
                      setMobileSidebarOpen(false);
                    }}
                  >
                    <div className="admin-sidebar-icon-box">
                      <AdminSidebarIcon id={t.id} active={active} />
                    </div>
                    <span className="admin-sidebar-label">{t.label}</span>
                    {active && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Student Profile (if active) */}
            {selectedStudent && (
              <div className="admin-sidebar-section" style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "0.5rem" }}>
                <div className="admin-sidebar-title">Active Profile</div>
                <button
                  type="button"
                  className={`admin-sidebar-item${tab === "student-detail" ? " active" : ""}`}
                  onClick={() => {
                    setTab("student-detail");
                    setMobileSidebarOpen(false);
                  }}
                >
                  <div className="admin-sidebar-icon-box">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <span className="admin-sidebar-label">
                    {selectedStudent.registeredName || selectedStudent.name || "Student"}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Sidebar Footer — Admin Identity Card */}
          <div className="admin-sidebar-footer">
            <div className="admin-user-card">
              <div className="admin-avatar-ring">
                {(currentUser?.name || currentUser?.phone || "A").charAt(0).toUpperCase()}
                <div className="admin-avatar-online" />
              </div>
              <div className="admin-sidebar-footer-info">
                <div className="admin-sidebar-footer-name">{currentUser?.name || currentUser?.phone || "Admin User"}</div>
                <div className="admin-sidebar-footer-role">{currentUser?.role || "ADMIN"}</div>
              </div>
              <button
                className="admin-sidebar-footer-logout"
                onClick={() => logout && logout()}
                title="Sign Out"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="admin-main-content">
          {/* ── Top Command Bar ── */}
          {(() => {
            const tabLabels = {
              overview: "Overview", today: "Today's Challenge", reports: "Reports",
              points: "Points & Streaks", monitoring: "Live Monitor",
              users: "Users & Members", registrations: "Registrations",
              submissions: "Submissions", live: "Live Sessions", payments: "Payments",
              questions: "Question Bank", "manual-questions": "Manual Questions",
              whatsapp: "WhatsApp Bot", settings: "Settings",
              "student-detail": "Student Profile",
            };
            return (
              <>
                <div className="admin-command-bar fade-in-up">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                    {/* Mobile Drawer Trigger */}
                    <button
                      type="button"
                      className="admin-mobile-menu-btn"
                      onClick={() => setMobileSidebarOpen(o => !o)}
                      title="Open All Tabs Menu"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                      </svg>
                      <span>Tabs</span>
                    </button>
                    <div className="admin-breadcrumb">
                      <span>⚡ Admin</span>
                      <span className="admin-breadcrumb-sep">/</span>
                      <span className="admin-breadcrumb-active">{tabLabels[tab] || tab}</span>
                    </div>
                  </div>
                  <div className="admin-cmd-right">
                    <span className={`status-pill${waStatus?.isConnected ? "" : " offline"}`}>
                      <span className={`live-dot${waStatus?.isConnected ? "" : " red"}`} />
                      {waStatus?.isConnected ? "WA Live" : "WA Offline"}
                    </span>
                    <span className="status-pill">
                      <span className="live-dot" />
                      API Synced
                    </span>
                    <button
                      className={`cmd-refresh-btn${refreshing ? " spinning" : ""}`}
                      onClick={async () => {
                        setRefreshing(true);
                        await reload(['dashboard', 'users']);
                        setTimeout(() => setRefreshing(false), 600);
                      }}
                      title="Sync data"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                      </svg>
                      Sync
                    </button>
                  </div>
                </div>

                {/* Single-row horizontal scroll ribbon on mobile/tablet */}
                <div className="admin-mobile-tab-ribbon-wrap">
                  <button
                    type="button"
                    className="ribbon-arrow-btn left"
                    onClick={() => scrollRibbon(-180)}
                    title="Scroll left"
                    aria-label="Scroll left"
                  >
                    ‹
                  </button>

                  <div
                    ref={ribbonRef}
                    className="admin-mobile-tab-ribbon"
                    onWheel={(e) => {
                      if (e.deltaY) {
                        e.currentTarget.scrollLeft += e.deltaY * 1.2;
                      }
                    }}
                  >
                    {[
                      { id: "overview", label: "Overview" },
                      { id: "today", label: "Today's Challenge" },
                      { id: "reports", label: "Reports" },
                      { id: "points", label: "Points & Streaks" },
                      { id: "monitoring", label: "Live Monitor" },
                      { id: "users", label: "Users & Members", badge: users.length || null },
                      { id: "registrations", label: "Registrations", badge: pendingRegs.length > 0 ? `${pendingRegs.length}` : null },
                      { id: "submissions", label: "Submissions" },
                      { id: "live", label: "Live Sessions" },
                      { id: "payments", label: "Payments" },
                      { id: "questions", label: "Question Bank" },
                      { id: "manual-questions", label: "Manual Questions" },
                      { id: "whatsapp", label: "WhatsApp Bot" },
                      { id: "settings", label: "Settings" },
                    ].map(t => {
                      const active = tab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`admin-mobile-tab-pill${active ? " active" : ""}`}
                          onClick={() => setTab(t.id)}
                        >
                          <AdminSidebarIcon id={t.id} active={active} />
                          <span>{t.label}</span>
                          {t.badge && <span className="admin-mobile-tab-badge">{t.badge}</span>}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="ribbon-arrow-btn right"
                    onClick={() => scrollRibbon(180)}
                    title="Scroll right"
                    aria-label="Scroll right"
                  >
                    ›
                  </button>
                </div>
              </>
            );
          })()}

          {/* ── Overview & Activity KPI Cards (Contextual) ── */}
          {["overview", "today", "reports", "points"].includes(tab) && (
            <div className="admin-kpi-row" style={{ marginBottom: "1.25rem" }}>
              {[
                { icon: "👥", label: "Total Students", value: dash?.stats?.total||0, accent: "#7c6fff", trend: "neu", sub: `${users.filter(u=>u.paid).length} paid members` },
                { icon: "✅", label: "Submitted Today", value: dash?.stats?.completed||0, accent: "#4ade80", trend: "up", sub: `${dash?.stats?.total ? Math.round((dash.stats.completed/dash.stats.total)*100) : 0}% completion rate` },
                { icon: "⏳", label: "Pending Today", value: dash?.stats?.pending||0, accent: "#f87171", trend: (dash?.stats?.pending||0) > 0 ? "down" : "up", sub: "Need to submit today" },
                { icon: "🧊", label: "Streak Freezes", value: users.reduce((s,u)=>s+(u.streakFreeze||0),0), accent: "#38bdf8", trend: "neu", sub: `Across ${users.length} users` },
              ].map(({ icon, label, value, accent, trend, sub }) => (
                <div key={label} className="admin-kpi-card" style={{ "--kpi-accent": accent }}>
                  <div className="admin-kpi-top">
                    <div className="admin-kpi-icon" style={{ background: `${accent}18` }}>{icon}</div>
                    <span className={`admin-kpi-trend ${trend}`}>
                      {trend === "up" ? "✓ Up" : trend === "down" ? "⏳ Action" : "• Stable"}
                    </span>
                  </div>
                  <div className="admin-kpi-value">{value}</div>
                  <div className="admin-kpi-label">{label}</div>
                  <div className="admin-kpi-sub">{sub}</div>
                </div>
              ))}
            </div>
          )}


      {/* OVERVIEW */}
      {tab==="overview" && (
        <>
          {/* ── Today's question banner ── */}
          {dash?.today?.question ? (
            <div style={{
              background: "linear-gradient(135deg, rgba(124,111,255,0.12), rgba(79,70,229,0.06))",
              border: "1px solid rgba(124,111,255,0.25)",
              borderRadius: 16, padding: "1rem 1.25rem",
              marginBottom: "1rem",
              display: "flex", alignItems: "flex-start", gap: "0.75rem",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: "rgba(124,111,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.1rem",
              }}>📌</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.3rem" }}>
                  Today's Question · {dash.today.category || dash.today.topic || "General"}
                </div>
                <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.45 }}>
                  {dash.today.question}
                </div>
              </div>
              <div style={{
                flexShrink: 0, fontSize: "0.72rem", fontWeight: 700,
                padding: "0.25rem 0.65rem", borderRadius: 20,
                background: "rgba(74,222,128,0.15)", color: "#4ade80",
                border: "1px solid rgba(74,222,128,0.3)",
              }}>✅ Live</div>
            </div>
          ) : (
            <div style={{
              background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)",
              borderRadius: 16, padding: "0.85rem 1.25rem",
              marginBottom: "1rem", fontSize: "0.85rem", color: "#fbbf24",
              display: "flex", alignItems: "center", gap: "0.5rem",
            }}>
              ⏳ No question published yet today
            </div>
          )}

          {/* ── Row 1: Submission donut + Streak leaderboard ── */}
          <div className="grid-cols-2" style={{ marginBottom: "1rem" }}>

            {/* Submission donut — redesigned */}
            <div className="card" style={{ display: "flex", flexDirection: "column" }}>
              <div className="section-title" style={{ marginBottom: "0.5rem" }}>📊 Today's Submissions</div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "1.5rem" }}>
                <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={pieSub} dataKey="value" cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={3} startAngle={90} endAngle={-270}>
                        {pieSub.map((e,i)=><Cell key={i} fill={e.color}/>)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>
                      {dash?.stats?.total ? Math.round((dash.stats.completed / dash.stats.total) * 100) : 0}%
                    </div>
                    <div style={{ fontSize: "0.6rem", color: "var(--muted)", fontWeight: 600 }}>done</div>
                  </div>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {[
                    { label: "Submitted", value: dash?.stats?.completed || 0, color: "#4ade80" },
                    { label: "Pending",   value: dash?.stats?.pending   || 0, color: "#f87171" },
                    { label: "Total",     value: dash?.stats?.total     || 0, color: "#7c6fff" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: "0.78rem", color: "var(--muted)", flex: 1 }}>{label}</span>
                      <span style={{ fontSize: "0.9rem", fontWeight: 700, color }}>{value}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: "0.25rem" }}>
                    <div style={{ height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 99,
                        background: "linear-gradient(90deg, #4ade80, #22c55e)",
                        width: `${dash?.stats?.total ? (dash.stats.completed / dash.stats.total) * 100 : 0}%`,
                        transition: "width 0.6s ease",
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Streak leaderboard — redesigned */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: "0.75rem" }}>🏆 Top Streaks</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {(dash?.topStreak || []).map((u, i) => {
                  const medals = ["🥇","🥈","🥉"];
                  const pct = dash.topStreak[0]?.streak ? Math.round((u.streak / dash.topStreak[0].streak) * 100) : 0;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: "0.75rem",
                      padding: "0.5rem 0.75rem",
                      background: i === 0 ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.02)",
                      borderRadius: 10,
                      border: i === 0 ? "1px solid rgba(251,191,36,0.15)" : "1px solid transparent",
                    }}>
                      <span style={{ fontSize: i < 3 ? "1.1rem" : "0.8rem", fontWeight: 700, color: "var(--muted)", width: 24, textAlign: "center", flexShrink: 0 }}>
                        {medals[i] || `${i+1}`}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          {u.name || u.userId?.split("@")[0]} {u.currentBadge && <StreakBadge badge={u.currentBadge} compact />}
                        </div>
                        <div style={{ height: 3, background: "var(--border)", borderRadius: 99, marginTop: "0.3rem", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 99, background: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7f32" : "#7c6fff", width: `${pct}%` }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f97316" }}>🔥 {u.streak}</span>
                        <span style={{ fontSize: "0.72rem", color: "var(--muted)", background: "var(--bg-secondary)", padding: "0.15rem 0.4rem", borderRadius: 6 }}>{u.weeklySubmissions}/7</span>
                      </div>
                    </div>
                  );
                })}
                {(!dash?.topStreak || dash.topStreak.length === 0) && (
                  <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.82rem", padding: "1rem" }}>No streak data yet</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 2: Weekly bar + Fine bar + Category pie ── */}
          <div className="grid-cols-3" style={{ gap: "1rem" }}>

            {/* Weekly submissions bar */}
            <div className="card">
              <div className="section-title">📅 Weekly Submissions</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekly.slice(0,8).map(u=>({name:(u.name||"?").slice(0,6),days:u.weeklySubmissions||0}))} margin={{top:4,right:4,left:-20,bottom:20}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                  <XAxis dataKey="name" stroke="#55557a" fontSize={9} tickLine={false} axisLine={false} angle={-30} textAnchor="end" interval={0}/>
                  <YAxis domain={[0,7]} stroke="#55557a" fontSize={10} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={tt} cursor={{fill:"rgba(124,111,255,0.06)"}}/>
                  <Bar dataKey="days" radius={[6,6,0,0]}>
                    {weekly.slice(0,8).map((u,i)=>(
                      <Cell key={i} fill={(u.weeklySubmissions||0)>=5?"#4ade80":(u.weeklySubmissions||0)>=3?"#7c6fff":"#f87171"}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pending Submissions */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div className="section-title" style={{ margin: 0 }}>⏳ Pending Today</div>
                <span style={{
                  fontSize: "0.72rem", fontWeight: 700,
                  padding: "0.15rem 0.5rem", borderRadius: 20,
                  background: "rgba(248,113,113,0.12)",
                  color: "#f87171",
                }}>
                  {users.filter(u => !u.completed).length} left
                </span>
              </div>
              {users.filter(u => !u.completed).length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.82rem", padding: "1.5rem 0" }}>
                  🎉 Everyone submitted today!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: 200, overflowY: "auto" }}>
                  {users.filter(u => !u.completed).map((u, i) => (
                    <div key={u.userId || u.phone} style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.35rem 0.5rem", borderRadius: 8,
                      background: "rgba(248,113,113,0.05)",
                      border: "1px solid rgba(248,113,113,0.1)",
                    }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(248,113,113,0.15)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.65rem", fontWeight: 700, color: "#f87171",
                      }}>
                        {(u.registeredName || u.name || "?")[0]?.toUpperCase()}
                      </div>
                      <span style={{
                        flex: 1, fontSize: "0.78rem", color: "var(--text)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        minWidth: 0,
                      }}>
                        {u.registeredName || u.name || u.phone}
                      </span>
                      <span style={{ fontSize: "0.68rem", color: "#f97316", flexShrink: 0 }}>
                        🔥{u.streak || 0}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Questions by category */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div className="section-title" style={{ margin: 0 }}>❓ Question Bank</div>
                <span style={{
                  fontSize: "0.72rem", fontWeight: 700,
                  padding: "0.15rem 0.5rem", borderRadius: 20,
                  background: questions.length <= 7 ? "rgba(248,113,113,0.15)" : questions.length <= 14 ? "rgba(251,191,36,0.15)" : "rgba(74,222,128,0.15)",
                  color: questions.length <= 7 ? "#f87171" : questions.length <= 14 ? "#fbbf24" : "#4ade80",
                }}>
                  {questions.length} total
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {CATS.map((cat, i) => {
                  const count = questions.filter(q => q.category === cat).length;
                  const maxCat = Math.max(...CATS.map(c => questions.filter(q => q.category === c).length), 1);
                  const pct = Math.round((count / maxCat) * 100);
                  const color = count === 0 ? "#f87171" : count <= 1 ? "#fbbf24" : PIE_COLORS[i % PIE_COLORS.length];
                  return (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: "0.72rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                      <div style={{ width: 50, height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 99, background: color, width: `${pct}%` }} />
                      </div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color, width: 16, textAlign: "right", flexShrink: 0 }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* TODAY */}
      {tab==="today" && (
        <>
          {dash?.today?.question
            ? <div className="today-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <div className="today-label">📌 Today's Question</div>
                    <div className="today-q">{dash.today.question}</div>
                    {dash.today.topic && <span className="today-topic">{dash.today.topic}</span>}
                  </div>
                  <button
                    className="btn-sm btn-primary"
                    style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                    onClick={waStatus?.isConnected ? handleSendPosterToGroup : () => setTab("whatsapp")}
                    disabled={waSendingPoster}
                  >
                    {waSendingPoster ? "⏳ Sending..." : waStatus?.isConnected ? "🚀 Send Poster to WhatsApp Group" : "📱 Connect WhatsApp to Send Poster"}
                  </button>
                </div>
              </div>
            : <div className="warn-box"><p>⏳ No question set for today yet.</p></div>}

          {/* Publish question to webapp */}
          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">📢 Publish Question to Webapp</div>
            <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:"1rem"}}>Set today's question so all webapp users can see and submit their video.</p>

            {/* Pick from bank */}
            <div style={{marginBottom:"1rem"}}>
              <label className="form-label">Pick from Question Bank</label>
              <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                <select className="form-input" style={{flex:1,minWidth:200}}
                  value={publishQ?._id||""}
                  onChange={e=>{
                    const q=questions.find(x=>x._id===e.target.value);
                    setPublishQ(q||null);
                    if(q) setPublishCustom({topic:q.topic,question:q.question,category:q.category});
                  }}>
                  <option value="">— Select a question —</option>
                  {questions.map(q=>(
                    <option key={q._id} value={q._id}>[{q.category}] {q.topic}: {q.question.slice(0,55)}…</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Or type manually */}
            <div style={{marginBottom:"1rem"}}>
              <label className="form-label">Or Enter Manually</label>
              <input className="form-input" style={{marginBottom:"0.5rem"}} placeholder="Topic (e.g. Future Goals)"
                value={publishCustom.topic} onChange={e=>{ setPublishQ(null); setPublishCustom(p=>({...p,topic:e.target.value})); }}/>
              <textarea className="form-input" rows={2} placeholder="Question text…"
                style={{resize:"vertical"}}
                value={publishCustom.question} onChange={e=>{ setPublishQ(null); setPublishCustom(p=>({...p,question:e.target.value})); }}/>
            </div>

            {/* Preview */}
            {publishCustom.question && (
              <div style={{padding:"0.75rem",background:"var(--bg-secondary)",borderRadius:8,fontSize:"0.9rem",marginBottom:"1rem",border:"1px solid var(--border)"}}>
                <div style={{color:"var(--muted)",fontSize:"0.75rem",marginBottom:"0.25rem"}}>Preview:</div>
                <strong>{publishCustom.topic}</strong>{publishCustom.topic?" — ":""}{publishCustom.question}
              </div>
            )}

            <button className="btn-primary" onClick={async()=>{
              if(!publishCustom.question.trim()){msg("Enter or select a question first","danger");return;}
              try{
                await api.patch("/dashboard/today-question",{
                  topic:publishCustom.topic,
                  question:publishCustom.question,
                  category:publishCustom.category||"General"
                });
                msg("✅ Question published! Users can now see it.");
                setPublishQ(null);
                setPublishCustom({topic:"",question:"",category:""});
                reload(['dashboard']); // Reload dashboard to show new question
              }catch(e){msg(e?.response?.data?.error||"Failed","danger");}
            }}>📢 Publish to Webapp</button>
          </div>

          <div className="card">
            <div className="section-title">Submission Status</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Phone</th><th>Streak</th><th>Status</th><th>🧊 Freeze</th><th>⭐ Score</th></tr></thead>
                <tbody>{users.map(u=>(
                  <tr key={u.userId}>
                    <td style={{fontWeight:500}}>{u.registeredName||u.name||"—"}</td>
                    <td style={{color:"var(--muted)"}}>{u.phone}</td>
                    <td>🔥 {u.streak||0}</td>
                    <td><span style={{color:u.completed?"var(--success)":"var(--danger)",fontWeight:600}}>{u.completed?"✅ Submitted":"⏳ Pending"}</span></td>
                    <td style={{color:"#38bdf8",fontWeight:600}}>🧊 {u.streakFreeze||0}</td>
                    <td style={{color:"#a78bfa",fontWeight:600}}>⭐ {u.monthlyScore||0}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* USERS */}
      {tab==="users" && (
        <>
          {/* Add Member — requires admin OTP verification first */}
          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">➕ Add New Member</div>

            {/* Step 1: Admin identity verification */}
            {adminOtpStep === "idle" && (
              <div>
                <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:"1rem"}}>
                  To add a member, first verify your identity via OTP sent to your registered phone.
                </p>
                {adminOtpError && (
                  <div style={{color:"#f87171",fontSize:"0.82rem",marginBottom:"0.75rem"}}>❌ {adminOtpError}</div>
                )}
                <button className="btn-primary" disabled={adminOtpLoading} onClick={async()=>{
                  setAdminOtpLoading(true); setAdminOtpError("");
                  try {
                    await api.post("/users/admin-send-otp");
                    setAdminOtpStep("sent");
                  } catch(e) {
                    setAdminOtpError(e?.response?.data?.error || "Failed to send OTP");
                  } finally { setAdminOtpLoading(false); }
                }}>
                  {adminOtpLoading ? "Sending…" : "🔐 Verify My Identity (Send OTP)"}
                </button>
              </div>
            )}

            {/* Step 2: Enter OTP */}
            {adminOtpStep === "sent" && (
              <div>
                <p style={{color:"var(--muted)",fontSize:"0.85rem",marginBottom:"1rem"}}>
                  Enter the 6-digit OTP sent to your registered phone number.
                </p>
                {adminOtpError && (
                  <div style={{color:"#f87171",fontSize:"0.82rem",marginBottom:"0.75rem"}}>❌ {adminOtpError}</div>
                )}
                <div style={{display:"flex",gap:"0.5rem",alignItems:"center",flexWrap:"wrap"}}>
                  <input className="form-input" style={{width:160,letterSpacing:"0.2em",textAlign:"center",fontSize:"1.1rem"}}
                    type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                    value={adminOtp} onChange={e=>setAdminOtp(e.target.value.replace(/\D/g,"").slice(0,6))}/>
                  <button className="btn-primary" disabled={adminOtpLoading||adminOtp.length!==6} onClick={async()=>{
                    setAdminOtpLoading(true); setAdminOtpError("");
                    try {
                      const {data} = await api.post("/users/admin-verify-otp",{otp:adminOtp});
                      setAdminActionToken(data.actionToken);
                      setAdminOtpStep("verified");
                      setAdminOtp("");
                    } catch(e) {
                      setAdminOtpError(e?.response?.data?.error || "Invalid OTP");
                      setAdminOtp("");
                    } finally { setAdminOtpLoading(false); }
                  }}>
                    {adminOtpLoading ? "Verifying…" : "Verify OTP"}
                  </button>
                  <button className="btn-ghost" onClick={()=>{setAdminOtpStep("idle");setAdminOtp("");setAdminOtpError("");}}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Add member form (identity verified) */}
            {adminOtpStep === "verified" && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setNewMemberLoading(true);
                try {
                  await api.post("/users/admin-create", { ...newMember, actionToken: adminActionToken });
                  msg(`✅ Account created for ${newMember.name}`);
                  setNewMember({ name:"", phone:"", password:"", role:"user" });
                  setAdminOtpStep("idle");
                  setAdminActionToken("");
                  reload(['users', 'dashboard']); // Reload users and dashboard stats
                } catch (err) {
                  const errMsg = err?.response?.data?.error || "Failed to create account";
                  // If token expired, reset to idle
                  if (errMsg.includes("expired") || errMsg.includes("token")) {
                    setAdminOtpStep("idle");
                    setAdminActionToken("");
                    msg("Session expired. Please re-verify your identity.", "danger");
                  } else {
                    msg(errMsg, "danger");
                  }
                } finally {
                  setNewMemberLoading(false);
                }
              }}>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"1rem",color:"#4ade80",fontSize:"0.85rem"}}>
                  ✅ Identity verified — you can now add a member
                  <button type="button" className="btn-ghost" style={{fontSize:"0.75rem",padding:"0.2rem 0.5rem"}}
                    onClick={()=>{setAdminOtpStep("idle");setAdminActionToken("");}}>
                    Re-verify
                  </button>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input className="form-input" placeholder="Member name" value={newMember.name}
                      onChange={e=>setNewMember(p=>({...p,name:e.target.value}))} required minLength={2}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone (10 digits)</label>
                    <input className="form-input" placeholder="9876543210" type="tel" value={newMember.phone}
                      onChange={e=>setNewMember(p=>({...p,phone:e.target.value}))} required maxLength={13}/>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input className="form-input" placeholder="Min 8 chars, upper+lower+number+symbol" type="password" value={newMember.password}
                      onChange={e=>setNewMember(p=>({...p,password:e.target.value}))} required minLength={8}/>
                    <div style={{fontSize:"0.72rem",color:"var(--muted)",marginTop:"0.3rem"}}>
                      Must contain: uppercase, lowercase, number, special character (!@#$%^&*)
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select className="form-input" value={newMember.role}
                      onChange={e=>setNewMember(p=>({...p,role:e.target.value}))}>
                      <option value="user">User</option>
                      <option value="trainer">Trainer</option>
                      <option value="viewer">Viewer (read-only)</option>
                      {!isAdminsTier && <option value="admins">Admins</option>}
                      {!isAdminsTier && <option value="admin">Admin</option>}
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn-primary" disabled={newMemberLoading}>
                  {newMemberLoading ? "Creating…" : "Create Account"}
                </button>
              </form>
            )}
          </div>

          <div className="card" style={{ padding: "1.25rem" }}>
            {/* Directory Header Toolbar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.85rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>
                    Students Directory
                  </div>
                  <span style={{ fontSize: "0.72rem", background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                    {filteredUsers.length} {filteredUsers.length === 1 ? "student" : "students"}
                  </span>
                  <span style={{ fontSize: "0.72rem", background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.25)", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                    {users.filter(u => u.paid).length} paid
                  </span>
                </div>
                <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                  Manage student profiles, streak freezes, role permissions, and payment verification.
                </div>
              </div>

              {/* Search Bar with SVG Icon */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, pointerEvents: "none" }}>
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    className="form-input"
                    style={{ width: 230, paddingLeft: "2rem", fontSize: "0.82rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10 }}
                    placeholder="Search name, phone..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      style={{ position: "absolute", right: 8, background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.9rem" }}
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Segmented Filter Chips */}
            <div className="admin-filter-bar" style={{ marginBottom: "1rem" }}>
              {[
                { key: "all",       label: "All Students",     count: users.length },
                { key: "paid",      label: "💳 Paid Members",  count: users.filter(u=>u.paid).length },
                { key: "submitted", label: "✅ Submitted Today",count: users.filter(u=>u.completed).length },
                { key: "pending",   label: "⏳ Pending Today",  count: users.filter(u=>u.paid&&!u.completed).length },
                { key: "streak",    label: "🔥 High Streak 7d+", count: users.filter(u=>(u.streak||0)>=7).length },
                { key: "trainers",  label: "🎓 Staff & Admins", count: users.filter(u=>["trainer","admins","admin"].includes(u.role)).length },
              ].map(chip => (
                <button
                  key={chip.key}
                  className={`admin-chip${userFilter === chip.key ? " active" : ""}`}
                  onClick={() => setUserFilter(chip.key)}
                >
                  <span>{chip.label}</span>
                  <span className="admin-chip-count">{chip.count}</span>
                </button>
              ))}
            </div>

            {/* Premium Responsive Table */}
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Streak</th>
                    <th>Freeze</th>
                    <th>Weekly</th>
                    <th>Monthly</th>
                    <th>Score</th>
                    <th>Payment</th>
                    <th style={{ textAlign: "right", paddingRight: "1.25rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--muted)" }}>
                        <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>🔍</div>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>No matching students found</div>
                        <div style={{ fontSize: "0.78rem", marginTop: "0.2rem" }}>Try adjusting your search query or filter chips.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => {
                      const initials = (u.registeredName || u.name || "?").slice(0, 2).toUpperCase();
                      const streak = u.streak || 0;
                      return (
                        <tr key={u.userId}>
                          {/* Student Name & Avatar */}
                          <td>
                            <div className="admin-user-cell">
                              <div className="admin-user-avatar">
                                {initials}
                                <div
                                  className="admin-user-avatar-dot"
                                  style={{ background: u.isActive ? "#4ade80" : "#f87171" }}
                                  title={u.isActive ? "Active Student" : "Disabled Account"}
                                />
                              </div>
                              <div>
                                <div className="admin-user-name">{u.registeredName || u.name || "—"}</div>
                                <div style={{ fontSize: "0.68rem", color: u.isActive ? "#4ade80" : "#f87171", fontWeight: 600, marginTop: "1px" }}>
                                  {u.isActive ? "● Active" : "● Disabled"}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Phone & Copy */}
                          <td>
                            <div className="admin-user-phone-wrap">
                              <span className="admin-user-phone">{u.phone}</span>
                              <button
                                className="copy-btn"
                                onClick={() => {
                                  navigator.clipboard?.writeText(u.phone);
                                  msg("Phone copied!");
                                }}
                                title="Copy phone number"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                </svg>
                              </button>
                            </div>
                          </td>

                          {/* Role Selector */}
                          <td>
                            <RoleSelector
                              phone={u.phone}
                              currentRole={u.role || "user"}
                              onRoleChange={() => reload(['users'])}
                            />
                          </td>

                          {/* Streak */}
                          <td>
                            <span
                              className={`streak-badge-pill${streak === 0 ? " dead" : ""}`}
                              onClick={() => openPointsModal(u, "add", "streak")}
                              title="Click to adjust streak days (+ / - / set)"
                              style={{ cursor: "pointer" }}
                            >
                              {streak > 0 ? "🔥" : "❄️"} {streak} {streak === 1 ? "day" : "days"}
                            </span>
                          </td>

                          {/* Streak Freeze */}
                          <td>
                            <span
                              className="freeze-badge-pill"
                              onClick={() => openPointsModal(u, "add", "freeze")}
                              title="Click to adjust streak freeze shields (+ / - / set)"
                              style={{ cursor: "pointer" }}
                            >
                              🧊 {u.streakFreeze || 0}
                            </span>
                          </td>

                          {/* Weekly Submissions */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: (u.weeklySubmissions || 0) >= 5 ? "#4ade80" : (u.weeklySubmissions || 0) >= 3 ? "#fbbf24" : "#94a3b8" }}>
                                {u.weeklySubmissions || 0}/7
                              </span>
                            </div>
                          </td>

                          {/* Monthly Submissions */}
                          <td>
                            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>
                              {u.monthlySubmissions || 0} sub
                            </span>
                          </td>

                          {/* Score / Points */}
                          <td>
                            <span
                              className="score-badge-pill"
                              onClick={() => openPointsModal(u, "add")}
                              title="Click to add or remove points for this user"
                              style={{ cursor: "pointer" }}
                            >
                              ⭐ {Math.round(u.monthlyScore || 0).toLocaleString()}
                            </span>
                          </td>

                          {/* Wallet Balance */}
                          <td>
                            <span
                              className="wallet-badge-pill"
                              onClick={(e) => openAdminWalletModal(u, e)}
                              title="Click to manage student wallet balance (Credit / Debit / View History)"
                              style={{
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.3rem",
                                background: (u.walletBalance || 0) > 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
                                border: (u.walletBalance || 0) > 0 ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid rgba(255, 255, 255, 0.12)",
                                color: (u.walletBalance || 0) > 0 ? "#4ade80" : "var(--muted)",
                                borderRadius: 10,
                                padding: "0.22rem 0.55rem",
                                fontSize: "0.76rem",
                                fontWeight: 700,
                              }}
                            >
                              💰 ₹{u.walletBalance || 0}
                            </span>
                          </td>

                          {/* Payment Toggle */}
                          <td>
                            <button
                              className={`paid-toggle-btn ${u.paid ? "paid" : "unpaid"}`}
                              onClick={async () => {
                                try {
                                  const { data } = await api.patch(`/payments/admin/toggle-paid/${encodeURIComponent(u.phone)}`);
                                  setUsers(prev => prev.map(x => x.phone === u.phone ? { ...x, paid: data.paid, paidAt: data.paidAt } : x));
                                  msg(`${u.registeredName || u.name || u.phone} marked as ${data.paid ? "✅ Paid" : "❌ Unpaid"}`);
                                } catch(e) {
                                  msg(e?.response?.data?.error || "Failed to update payment status", "danger");
                                }
                              }}
                              title={u.paid ? "Click to mark as unpaid" : "Click to mark as paid"}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: u.paid ? "#4ade80" : "#f87171", display: "inline-block" }} />
                              {u.paid ? "Paid" : "Unpaid"}
                            </button>
                          </td>

                          {/* Action Buttons */}
                          <td style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: "1rem" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                              <button
                                type="button"
                                className="act-icon-btn"
                                onClick={(e) => openAdminWalletModal(u, e)}
                                title="Manage Student Wallet Balance (Credit / Debit / History)"
                                style={{ color: "#4ade80", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", cursor: "pointer" }}
                              >
                                <span style={{ fontSize: "0.78rem" }}>💰</span>
                              </button>
                              <button
                                className="act-icon-btn"
                                onClick={() => viewStudentDetail(u)}
                                title="View Student Profile"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                              <button
                                className="act-icon-btn amber"
                                onClick={() => toggleUser(u.phone)}
                                title={u.isActive ? "Disable Account" : "Enable Account"}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                </svg>
                              </button>
                              <button
                                className="act-icon-btn"
                                onClick={async () => {
                                  try {
                                    await api.post(`/video/admin/reset-limit/${u._id || u.userId}`);
                                    msg(`Upload limit reset for ${u.registeredName || u.name || u.phone}`);
                                  } catch(e) {
                                    msg(e?.response?.data?.error || "Reset failed", "danger");
                                  }
                                }}
                                title="Reset Upload Limit"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                                </svg>
                              </button>
                              <button
                                className="act-icon-btn danger"
                                onClick={() => deleteUser(u.phone)}
                                title="Remove Student"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}


      {/* REPORTS */}
      {tab==="reports" && (
        <>
          <div style={{display:"flex",gap:"0.75rem",marginBottom:"1rem",flexWrap:"wrap"}}>
            <button className="btn-ghost danger" onClick={resetWeekly} disabled={resetting==="weekly"} style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
              {resetting==="weekly" ? "Resetting…" : "🔄 Reset Weekly Submissions"}
            </button>
            <button className="btn-ghost danger" onClick={resetMonthly} disabled={resetting==="monthly"} style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
              {resetting==="monthly" ? "Resetting…" : "🔄 Reset Monthly Submissions"}
            </button>
          </div>
          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">📅 Weekly Report</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weekly.slice(0,15).map(u=>({name:(u.name||"?").slice(0,8),days:u.weeklySubmissions||0,streak:u.streak||0}))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                <XAxis dataKey="name" stroke="#8888aa" fontSize={11}/>
                <YAxis domain={[0,7]} stroke="#8888aa" fontSize={11}/>
                <Tooltip contentStyle={tt}/><Legend/>
                <Bar dataKey="days" name="Days" fill="#7c6fff" radius={[4,4,0,0]}/>
                <Bar dataKey="streak" name="Streak" fill="#fbbf24" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
            <div className="table-wrap" style={{marginTop:"1rem"}}>
              <table className="data-table">
                <thead><tr><th>#</th><th>Name</th><th>Days</th><th>Streak</th><th>🧊 Freeze</th><th>⭐ Score</th></tr></thead>
                <tbody>{weekly.map((u,i)=>(
                  <tr key={i}>
                    <td style={{color:"var(--muted)"}}>{i+1}</td>
                    <td style={{fontWeight:500}}>{u.name||u.userId?.split("@")[0]}</td>
                    <td style={{color:(u.weeklySubmissions||0)>=7?"var(--success)":(u.weeklySubmissions||0)>=4?"var(--warning)":"var(--danger)",fontWeight:600}}>{u.weeklySubmissions||0}/7</td>
                    <td>🔥 {u.streak||0}</td>
                    <td style={{color:"#38bdf8",fontWeight:600}}>🧊 {u.streakFreeze||0}</td>
                    <td style={{color:"#a78bfa",fontWeight:600}}>⭐ {u.monthlyScore||0}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="section-title">📆 Monthly Report</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Name</th><th>Monthly</th><th>Streak</th><th>🧊 Freeze</th><th>⭐ Score</th></tr></thead>
                <tbody>{monthly.map((u,i)=>(
                  <tr key={i}>
                    <td style={{color:"var(--muted)"}}>{i+1}</td>
                    <td style={{fontWeight:500}}>{u.name||u.userId?.split("@")[0]}</td>
                    <td>{u.monthlySubmissions||0}</td>
                    <td>🔥 {u.streak||0}</td>
                    <td style={{color:"#38bdf8",fontWeight:600}}>🧊 {u.streakFreeze||0}</td>
                    <td style={{color:"#a78bfa",fontWeight:600}}>⭐ {u.monthlyScore||0}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* POINTS & FREEZE */}
      {tab==="points" && (
        <>
          <div className="stat-grid" style={{marginBottom:"1rem"}}>
            <StatCard icon="⭐" label="Top Monthly Score"  value={users.length ? Math.max(...users.map(u=>u.monthlyScore||0)) : 0}                        color="#a78bfa"/>
            <StatCard icon="🧊" label="Total Freezes Held" value={users.reduce((s,u)=>s+(u.streakFreeze||0),0)}                                           color="#38bdf8"/>
            <StatCard icon="🔥" label="Longest Streak"     value={users.length ? Math.max(...users.map(u=>u.streak||0)) : 0}                               color="#f97316"/>
            <StatCard icon="🏆" label="Scored This Month"  value={users.filter(u=>(u.monthlyScore||0)>0).length}                                           color="#4ade80"/>
          </div>

          {/* Top scores bar chart */}
          {users.filter(u=>(u.monthlyScore||0)>0).length > 0 && (
            <div className="card" style={{marginBottom:"1rem"}}>
              <div className="section-title">⭐ Top Monthly Scores</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[...users].sort((a,b)=>(b.monthlyScore||0)-(a.monthlyScore||0)).slice(0,10).map(u=>({name:(u.registeredName||u.name||"?").slice(0,10),score:u.monthlyScore||0,freeze:u.streakFreeze||0}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252545"/>
                  <XAxis dataKey="name" stroke="#8888aa" fontSize={11}/>
                  <YAxis stroke="#8888aa" fontSize={11}/>
                  <Tooltip contentStyle={tt}/>
                  <Legend/>
                  <Bar dataKey="score" name="Monthly Score" fill="#a78bfa" radius={[4,4,0,0]}/>
                  <Bar dataKey="freeze" name="Streak Freeze" fill="#38bdf8" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <div className="section-title" style={{ margin: 0 }}>⭐ Points &amp; Streak Freeze Ledger</div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                  Real-time leaderboard rankings with live manual point awards and deductions.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: 20, background: "rgba(168, 85, 247, 0.12)", color: "#c4b5fd", fontWeight: 700 }}>
                  ⭐ {users.filter(u => (u.monthlyScore || 0) > 0).length} Active Scorers
                </span>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>🔥 Streak</th>
                    <th>🧊 Freeze</th>
                    <th>⭐ Monthly Score</th>
                    <th>📅 Submissions</th>
                    <th style={{ textAlign: "right", paddingRight: "1.2rem" }}>⚙️ Manage Ledger</th>
                  </tr>
                </thead>
                <tbody>
                  {[...users].sort((a,b)=>(b.monthlyScore||0)-(a.monthlyScore||0)).map((u,i)=>(
                    <tr key={u.userId||i}>
                      <td style={{color:"var(--muted)",fontWeight:700}}>{i+1}</td>
                      <td>
                        <div style={{ fontWeight: 700, color: "#f8fafc" }}>
                          {u.registeredName || u.name || "—"}
                        </div>
                      </td>
                      <td style={{color:"var(--muted)",fontSize:"0.8rem",fontFamily:"monospace"}}>{u.phone}</td>
                      <td style={{fontWeight:700}}>
                        <span
                          style={{
                            cursor: "pointer",
                            background: "rgba(249, 115, 22, 0.12)",
                            color: "#f97316",
                            padding: "0.2rem 0.6rem",
                            borderRadius: 8,
                            border: "1px solid rgba(249, 115, 22, 0.25)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                          onClick={() => openPointsModal(u, "add", "streak")}
                          title="Click to adjust streak days (+ / - / set)"
                        >
                          🔥 {u.streak || 0}
                        </span>
                      </td>
                      <td style={{fontWeight:700}}>
                        <span
                          style={{
                            cursor: "pointer",
                            background: (u.streakFreeze || 0) > 0 ? "rgba(56, 189, 248, 0.12)" : "rgba(255, 255, 255, 0.03)",
                            color: "#38bdf8",
                            padding: "0.2rem 0.6rem",
                            borderRadius: 8,
                            border: (u.streakFreeze || 0) > 0 ? "1px solid rgba(56, 189, 248, 0.25)" : "1px solid rgba(255, 255, 255, 0.06)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                          onClick={() => openPointsModal(u, "add", "freeze")}
                          title="Click to adjust streak freeze shields (+ / - / set)"
                        >
                          {(u.streakFreeze || 0) > 0 ? `🧊 ${u.streakFreeze}` : <span style={{ color: "var(--muted)" }}>🧊 0</span>}
                        </span>
                      </td>
                      <td style={{fontWeight:800}}>
                        <span
                          className="score-badge-pill"
                          onClick={() => openPointsModal(u, "add", "points")}
                          title="Click to adjust student points"
                          style={{ cursor: "pointer", transition: "transform 0.12s ease" }}
                        >
                          ⭐ {Math.round(u.monthlyScore || 0).toLocaleString()} <span style={{ fontSize: "0.7rem", opacity: 0.85 }}>pts</span>
                        </span>
                      </td>
                      <td style={{color:"var(--muted)",fontSize:"0.82rem"}}>{u.monthlySubmissions||0} this month</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: "1rem" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          <button
                            className="act-icon-btn"
                            style={{
                              color: "#4ade80",
                              background: "rgba(74, 222, 128, 0.1)",
                              borderColor: "rgba(74, 222, 128, 0.28)",
                              width: "auto",
                              padding: "0.28rem 0.65rem",
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              borderRadius: 8,
                              gap: "0.25rem",
                            }}
                            onClick={() => openPointsModal(u, "add", "points")}
                            title="Add bonus points to student"
                          >
                            ⭐ +Pts
                          </button>
                          <button
                            className="act-icon-btn"
                            style={{
                              color: "#f97316",
                              background: "rgba(249, 115, 22, 0.1)",
                              borderColor: "rgba(249, 115, 22, 0.28)",
                              width: "auto",
                              padding: "0.28rem 0.65rem",
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              borderRadius: 8,
                              gap: "0.25rem",
                            }}
                            onClick={() => openPointsModal(u, "add", "streak")}
                            title="Add streak days"
                          >
                            🔥 +Streak
                          </button>
                          <button
                            className="act-icon-btn"
                            style={{
                              color: "#38bdf8",
                              background: "rgba(56, 189, 248, 0.1)",
                              borderColor: "rgba(56, 189, 248, 0.28)",
                              width: "auto",
                              padding: "0.28rem 0.65rem",
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              borderRadius: 8,
                              gap: "0.25rem",
                            }}
                            onClick={() => openPointsModal(u, "add", "freeze")}
                            title="Add streak freeze shields"
                          >
                            🧊 +Shield
                          </button>
                          <button
                            className="act-icon-btn"
                            style={{ width: 28, height: 28, borderRadius: 8 }}
                            onClick={() => openPointsModal(u, "set", "points")}
                            title="Open full Ledger Management modal"
                          >
                            ⚙️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* QUESTIONS */}
      {tab==="questions" && (
        <>
          {/* Low stock warning + Generate Now */}
          {questions.length <= 14 && (
            <div style={{
              background: questions.length <= 7 ? "rgba(248,113,113,0.08)" : "rgba(251,191,36,0.08)",
              border: `1px solid ${questions.length <= 7 ? "rgba(248,113,113,0.3)" : "rgba(251,191,36,0.3)"}`,
              borderRadius: 12, padding: "0.85rem 1.1rem",
              marginBottom: "1rem",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap",
            }}>
              <div>
                <span style={{ fontWeight: 700, color: questions.length <= 7 ? "#f87171" : "#fbbf24", fontSize: "0.9rem" }}>
                  {questions.length <= 7 ? "⚠️ Question bank is critically low!" : "ℹ️ Question bank is running low"}
                </span>
                <div style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: "0.2rem" }}>
                  {questions.length} question{questions.length !== 1 ? "s" : ""} remaining — auto-generate runs at the scheduled time, or generate now.
                </div>
              </div>
              <button
                className="btn-primary"
                style={{ whiteSpace: "nowrap", fontSize: "0.85rem", padding: "0.5rem 1rem", opacity: qActionBusy ? 0.6 : 1 }}
                disabled={!!qActionBusy}
                onClick={async () => {
                  setQActionBusy("generating");
                  msg("🤖 Generating questions… please wait (30–60s)");
                  try {
                    const res = await api.post("/questions/generate-now", { count: 14 }, { timeout: 95000 });
                    await refreshQuestions();
                    setQActionBusy("");
                    msg(`✅ ${res.data.message}`);
                  } catch (e) {
                    setQActionBusy("");
                    await refreshQuestions(); // still refresh — some may have been inserted
                    if (e?.code === "ECONNABORTED" || e?.message?.includes("timeout")) {
                      msg("⚠️ Request timed out — questions may still be generating. Check the bank in a moment.", "danger");
                    } else {
                      msg(e?.response?.data?.error || "Generation failed", "danger");
                    }
                  }
                }}
              >
                {qActionBusy === "generating" ? "⏳ Generating…" : "🤖 Generate Now"}
              </button>
            </div>
          )}

          <div className="card" style={{marginBottom:"1rem"}}>
            <div className="section-title">{editQ?"✏️ Edit Question":"➕ Add Question"}</div>
            <form onSubmit={saveQ}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-input" value={qForm.category} onChange={e=>setQForm({...qForm,category:e.target.value})} required>
                    <option value="">Select category</option>
                    {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Topic</label>
                  <input className="form-input" placeholder="e.g. Morning routines" value={qForm.topic} onChange={e=>setQForm({...qForm,topic:e.target.value})} required/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Question</label>
                <textarea className="form-input" style={{resize:"vertical",minHeight:80}} placeholder="Write the question…" value={qForm.question} onChange={e=>setQForm({...qForm,question:e.target.value})} required/>
              </div>
              <div style={{display:"flex",gap:"0.5rem"}}>
                <button type="submit" className="btn-primary">{editQ?"Update":"Add Question"}</button>
                {editQ && <button type="button" className="btn-ghost" onClick={()=>{setEditQ(null);setQForm({category:"",topic:"",question:""});}}>Cancel</button>}
              </div>
            </form>
          </div>
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:"0.5rem"}}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div className="section-title" style={{margin:0}}>Question Bank ({filteredQ.length}/{questions.length})</div>
                {/* Generate button */}
                <button
                  className="btn-ghost"
                  style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem", opacity: qActionBusy ? 0.6 : 1 }}
                  disabled={!!qActionBusy}
                  onClick={async () => {
                    setQActionBusy("generating");
                    msg("🤖 Generating questions… please wait (30–60s)");
                    try {
                      const res = await api.post("/questions/generate-now", { count: 14 }, { timeout: 95000 });
                      await refreshQuestions();
                      setQActionBusy("");
                      msg(`✅ ${res.data.message}`);
                    } catch (e) {
                      setQActionBusy("");
                      await refreshQuestions(); // still refresh — some may have been inserted
                      if (e?.code === "ECONNABORTED" || e?.message?.includes("timeout")) {
                        msg("⚠️ Request timed out — questions may still be generating. Check the bank in a moment.", "danger");
                      } else {
                        msg(e?.response?.data?.error || "Generation failed", "danger");
                      }
                    }
                  }}
                >
                  {qActionBusy === "generating" ? "⏳ Generating…" : "🤖 Generate"}
                </button>

                {/* Clean Generic button */}
                <button
                  className="btn-ghost danger"
                  style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem", opacity: qActionBusy ? 0.6 : 1 }}
                  disabled={!!qActionBusy}
                  onClick={async () => {
                    setQActionBusy("cleaning");
                    try {
                      const res = await api.post("/questions/clean-generic");
                      await refreshQuestions();
                      setQActionBusy("");
                      if (res.data.deleted === 0) {
                        msg("✅ Bank is clean — no generic questions found");
                      } else {
                        msg(`🗑️ Removed ${res.data.deleted} generic question${res.data.deleted !== 1 ? "s" : ""}. Bank refreshed.`, "danger");
                      }
                    } catch (e) {
                      setQActionBusy("");
                      msg(e?.response?.data?.error || "Clean failed", "danger");
                    }
                  }}
                >
                  {qActionBusy === "cleaning" ? "⏳ Cleaning…" : "🗑️ Clean Generic"}
                </button>
              </div>
              <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                <select className="form-input" style={{width:"auto"}} value={qCat} onChange={e=>setQCat(e.target.value)}>
                  <option value="">All Categories</option>
                  {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <input className="form-input" style={{width:180}} placeholder="Search…" value={qSearch} onChange={e=>setQSearch(e.target.value)}/>
              </div>
            </div>

            {/* Category balance bars */}
            {(() => {
              const maxCount = Math.max(...CATS.map(c => questions.filter(q => q.category === c).length), 1);
              return (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                  padding: "0.75rem",
                  background: "var(--bg-secondary)",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                }}>
                  {CATS.map(cat => {
                    const count = questions.filter(q => q.category === cat).length;
                    const pct = Math.round((count / maxCount) * 100);
                    const color = count === 0 ? "#f87171" : count <= 1 ? "#fbbf24" : "#4ade80";
                    return (
                      <div key={cat} style={{ fontSize: "0.72rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                          <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>{cat}</span>
                          <span style={{ fontWeight: 700, color, flexShrink: 0 }}>{count}</span>
                        </div>
                        <div style={{ height: 4, background: "var(--border)", borderRadius: 99 }}>
                          <div style={{
                            height: "100%", borderRadius: 99,
                            width: `${pct}%`,
                            background: color,
                            transition: "width 0.4s ease",
                            minWidth: count > 0 ? 4 : 0,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Category</th><th>Topic</th><th>Question</th><th>Actions</th></tr></thead>
                <tbody>{filteredQ.map(q=>(
                  <tr key={q._id}>
                    <td><span className="badge badge-purple">{q.category}</span></td>
                    <td style={{color:"var(--muted)",whiteSpace:"nowrap"}}>{q.topic}</td>
                    <td style={{maxWidth:320}}>{q.question}</td>
                    <td style={{whiteSpace:"nowrap"}}>
                      <button className="btn-ghost" style={{marginRight:3}} onClick={()=>startEdit(q)}>Edit</button>
                      <button className="btn-ghost danger" onClick={()=>deleteQ(q._id)}>Delete</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* SUBMISSIONS */}
      {tab==="submissions" && (
        <>
          {/* Submissions KPI Row */}
          <div className="admin-kpi-row" style={{ marginBottom: "1rem" }}>
            <div className="admin-kpi-card" style={{ "--kpi-accent": "#4ade80" }}>
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">SUBMITTED TODAY</span>
                <span className="admin-kpi-trend up">✓ On track</span>
              </div>
              <div className="admin-kpi-value" style={{ color: "#4ade80" }}>
                {users.filter(u => u.completed).length}
              </div>
              <div className="admin-kpi-sub">
                {users.length > 0 ? Math.round((users.filter(u => u.completed).length / users.length) * 100) : 0}% of all members
              </div>
            </div>

            <div className="admin-kpi-card" style={{ "--kpi-accent": "#f87171" }}>
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">PENDING TODAY</span>
                <span className="admin-kpi-trend down">⏳ Action needed</span>
              </div>
              <div className="admin-kpi-value" style={{ color: "#f87171" }}>
                {users.filter(u => !u.completed).length}
              </div>
              <div className="admin-kpi-sub">Need to submit before 12:00 AM</div>
            </div>

            <div className="admin-kpi-card" style={{ "--kpi-accent": "#818cf8" }}>
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">TOTAL STUDENTS</span>
                <span className="admin-kpi-trend neu">👥 Active roster</span>
              </div>
              <div className="admin-kpi-value" style={{ color: "#a5b4fc" }}>
                {users.length}
              </div>
              <div className="admin-kpi-sub">{users.filter(u => u.paid).length} active paid members</div>
            </div>

            <div className="admin-kpi-card" style={{ "--kpi-accent": "#38bdf8" }}>
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">COMPLETION RATE</span>
                <span className="admin-kpi-trend up">📊 Daily rate</span>
              </div>
              <div className="admin-kpi-value" style={{ color: "#38bdf8" }}>
                {users.length > 0 ? Math.round((users.filter(u => u.completed).length / users.length) * 100) : 0}%
              </div>
              <div className="admin-kpi-sub">Live daily submissions pace</div>
            </div>
          </div>

          <div className="card" style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em" }}>
                  Daily Submissions Tracker
                </div>
                <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                  Monitor daily submission status, manage weekly &amp; monthly submission tallies, and toggle individual attendance.
                </div>
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, pointerEvents: "none" }}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  className="form-input"
                  style={{ width: 220, paddingLeft: "2rem", fontSize: "0.82rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10 }}
                  placeholder="Search name or phone…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Phone</th>
                    <th>Today's Status</th>
                    <th>Streak</th>
                    <th>Weekly Attendance</th>
                    <th>Monthly Submissions</th>
                    <th style={{ textAlign: "right", paddingRight: "1.25rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--muted)" }}>
                        No matching students found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => {
                      const initials = (u.registeredName || u.name || "?").slice(0, 2).toUpperCase();
                      const streak = u.streak || 0;
                      return (
                        <tr key={u.userId}>
                          {/* Student Cell */}
                          <td>
                            <div className="admin-user-cell">
                              <div className="admin-user-avatar">
                                {initials}
                                <div
                                  className="admin-user-avatar-dot"
                                  style={{ background: u.isActive ? "#4ade80" : "#f87171" }}
                                />
                              </div>
                              <div>
                                <div className="admin-user-name">{u.registeredName || u.name || "—"}</div>
                                <div style={{ fontSize: "0.68rem", color: u.paid ? "#a5b4fc" : "#94a3b8", fontWeight: 600 }}>
                                  {u.paid ? "💳 Paid Member" : "Free User"}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Phone */}
                          <td>
                            <div className="admin-user-phone-wrap">
                              <span className="admin-user-phone">{u.phone}</span>
                              <button
                                className="copy-btn"
                                onClick={() => { navigator.clipboard?.writeText(u.phone); msg("Phone copied!"); }}
                                title="Copy phone"
                              >
                                ⎘
                              </button>
                            </div>
                          </td>

                          {/* Today's Status */}
                          <td>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                padding: "0.28rem 0.65rem",
                                borderRadius: 12,
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                background: u.completed ? "rgba(74, 222, 128, 0.12)" : "rgba(248, 113, 113, 0.12)",
                                color: u.completed ? "#4ade80" : "#f87171",
                                border: `1px solid ${u.completed ? "rgba(74, 222, 128, 0.28)" : "rgba(248, 113, 113, 0.28)"}`,
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: u.completed ? "#4ade80" : "#f87171" }} />
                              {u.completed ? "Submitted" : "Pending"}
                            </span>
                          </td>

                          {/* Streak */}
                          <td>
                            <span className={`streak-badge-pill${streak === 0 ? " dead" : ""}`}>
                              {streak > 0 ? "🔥" : "❄️"} {streak} {streak === 1 ? "day" : "days"}
                            </span>
                          </td>

                          {/* Weekly Stepper */}
                          <td>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", background: "rgba(255,255,255,0.03)", padding: "0.25rem 0.5rem", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                              <span style={{ minWidth: 28, fontSize: "0.82rem", fontWeight: 700, color: (u.weeklySubmissions || 0) >= 5 ? "#4ade80" : (u.weeklySubmissions || 0) >= 3 ? "#fbbf24" : "#94a3b8" }}>
                                {u.weeklySubmissions || 0}/7
                              </span>
                              <div style={{ display: "flex", gap: "0.2rem" }}>
                                <button
                                  className="copy-btn"
                                  onClick={async () => {
                                    try {
                                      const res = await api.patch(`/submissions/${u.phone}/weekly`, { delta: -1 });
                                      setUsers(prev => prev.map(user => user.phone === u.phone ? { ...user, weeklySubmissions: res.data.weeklySubmissions } : user));
                                    } catch(e) { msg(e?.response?.data?.error || "Failed", "danger"); }
                                  }}
                                  disabled={(u.weeklySubmissions || 0) === 0}
                                  title="Decrease weekly count"
                                >
                                  −
                                </button>
                                <button
                                  className="copy-btn"
                                  onClick={async () => {
                                    try {
                                      const res = await api.patch(`/submissions/${u.phone}/weekly`, { delta: 1 });
                                      setUsers(prev => prev.map(user => user.phone === u.phone ? { ...user, weeklySubmissions: res.data.weeklySubmissions } : user));
                                    } catch(e) { msg(e?.response?.data?.error || "Failed", "danger"); }
                                  }}
                                  title="Increase weekly count"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Monthly Stepper */}
                          <td>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", background: "rgba(255,255,255,0.03)", padding: "0.25rem 0.5rem", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                              <span style={{ minWidth: 24, fontSize: "0.82rem", fontWeight: 700, color: "#f8fafc" }}>
                                {u.monthlySubmissions || 0}
                              </span>
                              <div style={{ display: "flex", gap: "0.2rem" }}>
                                <button
                                  className="copy-btn"
                                  onClick={async () => {
                                    try {
                                      const res = await api.patch(`/submissions/${u.phone}/monthly`, { delta: -1 });
                                      setUsers(prev => prev.map(user => user.phone === u.phone ? { ...user, monthlySubmissions: res.data.monthlySubmissions } : user));
                                    } catch(e) { msg(e?.response?.data?.error || "Failed", "danger"); }
                                  }}
                                  disabled={(u.monthlySubmissions || 0) === 0}
                                  title="Decrease monthly count"
                                >
                                  −
                                </button>
                                <button
                                  className="copy-btn"
                                  onClick={async () => {
                                    try {
                                      const res = await api.patch(`/submissions/${u.phone}/monthly`, { delta: 1 });
                                      setUsers(prev => prev.map(user => user.phone === u.phone ? { ...user, monthlySubmissions: res.data.monthlySubmissions } : user));
                                    } catch(e) { msg(e?.response?.data?.error || "Failed", "danger"); }
                                  }}
                                  title="Increase monthly count"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: "1rem" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                              <button
                                className={`paid-toggle-btn ${u.completed ? "paid" : "unpaid"}`}
                                onClick={async () => {
                                  try {
                                    const res = await api.patch(`/users/${u.phone}/toggle-submitted`);
                                    setUsers(prev => prev.map(user => user.phone === u.phone ? { ...user, completed: res.data.completed } : user));
                                    msg(res.data.completed ? "Marked as submitted" : "Marked as not submitted");
                                  } catch(e) { msg(e?.response?.data?.error || "Failed", "danger"); }
                                }}
                              >
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: u.completed ? "#4ade80" : "#f87171" }} />
                                {u.completed ? "Submitted" : "Mark Done"}
                              </button>
                              <button
                                className="act-icon-btn"
                                onClick={() => viewStudentDetail(u)}
                                title="View Student Detail"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* PAYMENTS */}
      {tab==="payments" && (
        <>
          {paymentLoading ? (
            <div className="spinner-wrap"><div className="spinner"/></div>
          ) : paymentData ? (
            <>
              {/* Payment KPI Row (Dynamically calculated based on active filters) */}
              <div className="admin-kpi-row" style={{ marginBottom: "1rem" }}>
                <div className="admin-kpi-card" style={{ "--kpi-accent": "#4ade80" }}>
                  <div className="admin-kpi-top">
                    <span className="admin-kpi-label">FILTERED REVENUE</span>
                    <span className="admin-kpi-trend up">₹ INR</span>
                  </div>
                  <div className="admin-kpi-value" style={{ color: "#4ade80" }}>
                    ₹{filteredPaymentMetrics.totalRev.toLocaleString("en-IN")}
                  </div>
                  <div className="admin-kpi-sub">
                    {paymentDateFilter === "all" ? "Total verified collections" : `Filtered: ${paymentDateFilter.replace("_", " ").toUpperCase()}`}
                  </div>
                </div>

                <div className="admin-kpi-card" style={{ "--kpi-accent": "#818cf8" }}>
                  <div className="admin-kpi-top">
                    <span className="admin-kpi-label">VERIFIED PAID ORDERS</span>
                    <span className="admin-kpi-trend up">💳 Gateway</span>
                  </div>
                  <div className="admin-kpi-value" style={{ color: "#a5b4fc" }}>
                    {filteredPaymentMetrics.paidCount}
                  </div>
                  <div className="admin-kpi-sub">Online checkout subscriptions</div>
                </div>

                <div className="admin-kpi-card" style={{ "--kpi-accent": "#fbbf24" }}>
                  <div className="admin-kpi-top">
                    <span className="admin-kpi-label">AVG ORDER VALUE (AOV)</span>
                    <span className="admin-kpi-trend neu">📈 Ticket</span>
                  </div>
                  <div className="admin-kpi-value" style={{ color: "#fbbf24" }}>
                    ₹{filteredPaymentMetrics.aov.toLocaleString("en-IN")}
                  </div>
                  <div className="admin-kpi-sub">Average per paid student</div>
                </div>

                <div className="admin-kpi-card" style={{ "--kpi-accent": "#38bdf8" }}>
                  <div className="admin-kpi-top">
                    <span className="admin-kpi-label">SHOWING TRANSACTIONS</span>
                    <span className="admin-kpi-trend up">📋 Filtered</span>
                  </div>
                  <div className="admin-kpi-value" style={{ color: "#38bdf8" }}>
                    {filteredPayments.length} <span style={{ fontSize: "0.9rem", color: "var(--muted)", fontWeight: 500 }}>/ {paymentData.transactions?.length || 0}</span>
                  </div>
                  <div className="admin-kpi-sub">Matching current filter rules</div>
                </div>
              </div>

              {/* Advanced Filter Toolbar & Transactions Card */}
              <div className="card" style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em" }}>
                      Transaction History &amp; Orders
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                      Filter by payment source, date range, or search directly for students.
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      className="btn-ghost"
                      onClick={handleExportPaymentsCSV}
                      style={{
                        fontSize: "0.78rem",
                        padding: "0.4rem 0.85rem",
                        borderRadius: 8,
                        border: "1px solid rgba(74, 222, 128, 0.3)",
                        color: "#4ade80",
                        background: "rgba(74, 222, 128, 0.08)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                      title="Export filtered records to CSV"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      Export CSV
                    </button>
                    <button
                      className="cmd-refresh-btn"
                      onClick={loadPayments}
                      style={{ fontSize: "0.78rem" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                      </svg>
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Filter Controls Row 1: Source Filter Chips */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  padding: "0.75rem 0.85rem",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: 12,
                  marginBottom: "0.85rem",
                }}>
                  {/* Payment Type Selection (Default: Paid) */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginRight: 4 }}>
                      TYPE:
                    </span>
                    {[
                      { id: "paid", label: "💳 Online Paid (Default)" },
                      { id: "all", label: "👥 All Transactions" },
                      { id: "manual", label: "👤 Manual Activations" },
                      { id: "failed", label: "❌ Failed / Refunded" },
                    ].map(type => {
                      const active = paymentTypeFilter === type.id;
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setPaymentTypeFilter(type.id)}
                          style={{
                            background: active ? "rgba(124, 111, 255, 0.22)" : "rgba(255, 255, 255, 0.04)",
                            border: `1px solid ${active ? "rgba(124, 111, 255, 0.55)" : "rgba(255, 255, 255, 0.08)"}`,
                            color: active ? "#ffffff" : "#94a3b8",
                            borderRadius: 8,
                            padding: "0.32rem 0.72rem",
                            fontSize: "0.76rem",
                            fontWeight: active ? 700 : 500,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {type.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Sort Order Selector */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>
                      SORT:
                    </span>
                    <select
                      value={paymentSortOrder}
                      onChange={(e) => setPaymentSortOrder(e.target.value)}
                      style={{
                        background: "#161828",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        color: "#e2e8f0",
                        borderRadius: 8,
                        padding: "0.32rem 0.65rem",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        outline: "none",
                      }}
                    >
                      <option value="desc">🕒 Newest Date First</option>
                      <option value="asc">⏳ Oldest Date First</option>
                      <option value="amount_desc">💰 Highest Amount First</option>
                      <option value="amount_asc">🪙 Lowest Amount First</option>
                    </select>
                  </div>
                </div>

                {/* Filter Controls Row 2: Date Filters & Search */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  marginBottom: "1.1rem",
                }}>
                  {/* Date Filter Pills */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginRight: 4 }}>
                      TIME:
                    </span>
                    {[
                      { id: "this_month", label: "🗓️ This Month (Default)" },
                      { id: "today", label: "⚡ Today" },
                      { id: "week", label: "📆 This Week" },
                      { id: "prev_month", label: "⏮️ Previous Month" },
                      { id: "this_year", label: "⭐ This Year" },
                      { id: "all", label: "📅 All Time" },
                    ].map(d => {
                      const active = paymentDateFilter === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setPaymentDateFilter(d.id)}
                          style={{
                            background: active ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.03)",
                            border: `1px solid ${active ? "rgba(56, 189, 248, 0.5)" : "rgba(255, 255, 255, 0.08)"}`,
                            color: active ? "#38bdf8" : "#94a3b8",
                            borderRadius: 8,
                            padding: "0.3rem 0.65rem",
                            fontSize: "0.75rem",
                            fontWeight: active ? 700 : 500,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Search Input */}
                  <div style={{ position: "relative", minWidth: 240, flex: "1 1 240px", maxWidth: 360 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="🔍 Search name, phone, Razorpay ID..."
                      value={paymentSearchQuery}
                      onChange={(e) => setPaymentSearchQuery(e.target.value)}
                      style={{
                        padding: "0.38rem 2rem 0.38rem 0.75rem",
                        fontSize: "0.78rem",
                        borderRadius: 8,
                        width: "100%",
                      }}
                    />
                    {paymentSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setPaymentSearchQuery("")}
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "transparent",
                          border: "none",
                          color: "var(--muted)",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Table Container */}
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Date &amp; Time (IST)</th>
                        <th>Student &amp; Phone</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Gateway / Source</th>
                        <th>Payment ID</th>
                        <th>Remarks / Note</th>
                        <th style={{ textAlign: "center" }}>Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: "3rem 1rem" }}>
                            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📭</div>
                            No transactions found for the selected filters.
                            <div style={{ marginTop: "0.5rem" }}>
                              <button
                                className="btn-ghost"
                                onClick={() => {
                                  setPaymentTypeFilter("all");
                                  setPaymentDateFilter("all");
                                  setPaymentSearchQuery("");
                                }}
                                style={{ fontSize: "0.75rem", color: "#a5b4fc" }}
                              >
                                Reset All Filters
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredPayments.map((tx, i) => (
                          <tr key={tx._id || i}>
                            <td style={{ color: "var(--muted)", whiteSpace: "nowrap", fontSize: "0.78rem" }}>
                              {new Date(tx.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.85rem" }}>{tx.name || "—"}</div>
                              <div className="admin-user-phone">{tx.phone}</div>
                            </td>
                            <td>
                              <span style={{ fontWeight: 800, color: tx.amount > 0 ? "#4ade80" : "var(--muted)", fontSize: "0.9rem" }}>
                                {tx.amount > 0 ? `₹${tx.amount.toLocaleString("en-IN")}` : "—"}
                              </span>
                            </td>
                            <td>
                              <span style={{
                                background: tx.status === "success" ? "rgba(74,222,128,0.12)" : tx.status === "manual" ? "rgba(251,191,36,0.12)" : "rgba(248,113,113,0.12)",
                                color: tx.status === "success" ? "#4ade80" : tx.status === "manual" ? "#fbbf24" : "#f87171",
                                border: `1px solid ${tx.status === "success" ? "rgba(74,222,128,0.3)" : tx.status === "manual" ? "rgba(251,191,36,0.3)" : "rgba(248,113,113,0.3)"}`,
                                borderRadius: 8,
                                padding: "0.22rem 0.6rem",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.3rem",
                              }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: tx.status === "success" ? "#4ade80" : tx.status === "manual" ? "#fbbf24" : "#f87171" }} />
                                {tx.status === "success" ? "Success" : tx.status === "manual" ? "Manual" : tx.status === "refunded" ? "Refunded" : "Failed"}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: "0.78rem", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                {tx.source === "admin" ? "👤 Admin Manual" : "💳 Razorpay Gateway"}
                              </span>
                            </td>
                            <td>
                              {tx.razorpayPaymentId ? (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                  <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#a5b4fc" }}>
                                    {tx.razorpayPaymentId.slice(-12)}
                                  </span>
                                  <button
                                    className="copy-btn"
                                    onClick={() => { navigator.clipboard?.writeText(tx.razorpayPaymentId); msg("Payment ID copied!"); }}
                                    title="Copy full Razorpay ID"
                                  >
                                    ⎘
                                  </button>
                                </div>
                              ) : "—"}
                            </td>
                            <td style={{ fontSize: "0.78rem", color: "var(--muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {tx.note || "—"}
                            </td>
                            <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                              <button
                                type="button"
                                onClick={() => setSelectedAdminInvoiceTx(tx)}
                                style={{
                                  background: "rgba(124, 111, 255, 0.12)",
                                  border: "1px solid rgba(124, 111, 255, 0.35)",
                                  color: "#c4b5fd",
                                  borderRadius: 7,
                                  padding: "0.25rem 0.65rem",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.3rem",
                                  transition: "all 0.15s ease",
                                }}
                                title="View & Print Official Invoice"
                              >
                                <span>📄</span> Invoice
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="warn-box"><p>Failed to load payment data. <button className="btn-ghost" onClick={loadPayments}>Retry</button></p></div>
          )}
        </>
      )}

      {/* MONITORING */}
      {tab==="monitoring" && <MonitoringPanel />}

      {/* REGISTRATIONS */}
      {tab==="registrations" && (
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>Pending Registrations</span>
                {pendingRegs.length > 0 && (
                  <span style={{ fontSize: "0.72rem", background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                    {pendingRegs.length} pending
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                Review and approve new student sign-up requests before account credentials expire.
              </div>
            </div>
            <button
              className="cmd-refresh-btn"
              onClick={loadPendingRegs}
              disabled={pendingRegsLoading}
              style={{ fontSize: "0.78rem" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              {pendingRegsLoading ? "Loading…" : "Refresh Queue"}
            </button>
          </div>

          {pendingRegsLoading && <div style={{ textAlign: "center", color: "var(--muted)", padding: "2.5rem" }}>Loading registration queue…</div>}

          {!pendingRegsLoading && pendingRegs.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: "3rem 1rem" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(74, 222, 128, 0.1)", border: "1px solid rgba(74, 222, 128, 0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", margin: "0 auto 0.75rem", color: "#4ade80" }}>
                ✓
              </div>
              <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.95rem" }}>All Caught Up!</div>
              <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>There are no pending registrations waiting for review.</div>
            </div>
          )}

          {!pendingRegsLoading && pendingRegs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {pendingRegs.map(p => {
                const hoursLeft = Math.max(0, Math.round((new Date(p.expiresAt) - Date.now()) / 3600000));
                const urgent = hoursLeft < 4;
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      flexWrap: "wrap",
                      background: urgent ? "rgba(239, 68, 68, 0.04)" : "rgba(255, 255, 255, 0.02)",
                      border: `1px solid ${urgent ? "rgba(239, 68, 68, 0.25)" : "rgba(255, 255, 255, 0.07)"}`,
                      borderRadius: 14,
                      padding: "0.9rem 1.1rem",
                      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                    }}
                  >
                    <div className="admin-user-avatar" style={{ background: urgent ? "linear-gradient(135deg, #f87171, #fb923c)" : "linear-gradient(135deg, #6366f1, #06b6d4)" }}>
                      {p.name[0]?.toUpperCase() || "?"}
                    </div>

                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#f8fafc" }}>{p.name}</div>
                      <div className="admin-user-phone-wrap" style={{ marginTop: "0.15rem" }}>
                        <span className="admin-user-phone">📱 {p.phone}</span>
                        <button
                          className="copy-btn"
                          onClick={() => { navigator.clipboard?.writeText(p.phone); msg("Phone copied!"); }}
                          title="Copy phone"
                        >
                          ⎘
                        </button>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: urgent ? "#f87171" : "var(--muted)", marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <span>{urgent ? "⚠️" : "⏳"} Expires in {hoursLeft}h</span>
                        <span>·</span>
                        <span>Requested {new Date(p.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                      <button
                        className="paid-toggle-btn paid"
                        style={{ padding: "0.45rem 0.95rem" }}
                        onClick={async () => {
                          try {
                            await api.post(`/auth/pending/${p.id}/approve`);
                            msg(`✅ ${p.name} approved — they can now log in`);
                            loadPendingRegs();
                          } catch (e) { msg(e.response?.data?.error || "Approve failed", "danger"); }
                        }}
                      >
                        ✓ Approve
                      </button>
                      <button
                        className="paid-toggle-btn unpaid"
                        style={{ padding: "0.45rem 0.95rem" }}
                        onClick={async () => {
                          try {
                            await api.delete(`/auth/pending/${p.id}`);
                            msg(`Rejected ${p.name}`, "danger");
                            loadPendingRegs();
                          } catch (e) { msg(e.response?.data?.error || "Reject failed", "danger"); }
                        }}
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* WHATSAPP TAB */}
      {tab === "whatsapp" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", width: "100%", maxWidth: 1150, margin: "0 auto" }}>
          
          {/* Top Ultra-Premium Hero Header */}
          <div style={{
            background: "linear-gradient(135deg, rgba(30, 27, 75, 0.95), rgba(15, 23, 42, 0.95))",
            border: "1px solid rgba(124, 111, 255, 0.35)",
            borderRadius: 20,
            padding: "1.35rem 1.65rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1.25rem",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.4)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1.1rem" }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: "linear-gradient(135deg, #25d366, #128c7e)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.6rem",
                boxShadow: "0 6px 20px rgba(37, 211, 102, 0.35)",
                flexShrink: 0,
              }}>
                ⚡
              </div>
              <div>
                <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#fff", display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                  <span>WhatsApp Control Center</span>
                  <span style={{ fontSize: "0.72rem", background: "rgba(37, 211, 102, 0.2)", color: "#4ade80", border: "1px solid rgba(37, 211, 102, 0.4)", padding: "2px 10px", borderRadius: 12, fontWeight: 800, letterSpacing: "0.04em" }}>
                    PRO AUTOMATION
                  </span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Baileys v6 Socket · Multi-Slot Attendance Reminders · Automated 11:59 PM Month-End Prize Calculator
                </div>
              </div>
            </div>

            {/* Right Health Badges & Actions */}
            <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.55rem",
                background: "rgba(0,0,0,0.35)",
                padding: "0.5rem 0.9rem",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: "0.78rem",
                color: "#e2e8f0",
                fontWeight: 700,
              }}>
                <span style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: waStatus?.isConnected ? "#4ade80" : waStatus?.hasSavedCredentials ? "#38bdf8" : "#fbbf24",
                  boxShadow: `0 0 10px ${waStatus?.isConnected ? "#4ade80" : waStatus?.hasSavedCredentials ? "#38bdf8" : "#fbbf24"}`,
                }} />
                <span>
                  {waStatus?.isConnected
                    ? "Live Connected"
                    : waStatus?.hasSavedCredentials
                    ? "Re-authenticating"
                    : "QR Ready"}
                </span>
              </div>

              <button
                className="cmd-refresh-btn"
                onClick={loadWhatsAppStatus}
                disabled={waLoading}
                style={{ padding: "0.55rem 1.1rem", fontSize: "0.82rem", fontWeight: 800, background: "linear-gradient(135deg, rgba(124, 111, 255, 0.25), rgba(99, 102, 241, 0.15))", border: "1px solid rgba(124, 111, 255, 0.4)", color: "#c084fc", borderRadius: 14, cursor: "pointer" }}
              >
                🔄 Sync Status
              </button>
            </div>
          </div>

          {/* Sub-Tab Navigation Bar for Zero-Scroll Focused Views */}
          <div style={{
            display: "flex",
            gap: "0.5rem",
            background: "rgba(15, 23, 42, 0.8)",
            padding: "0.45rem",
            borderRadius: 16,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            flexWrap: "wrap",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}>
            {[
              { id: "all", label: "⚡ All-in-One Dashboard", icon: "⚡" },
              { id: "gateway", label: "📱 Gateway & Socket", icon: "📱" },
              { id: "preview", label: "💬 Live Message Hub", icon: "💬" },
              { id: "prize", label: "🏆 Month-End Prize", icon: "🏆" },
            ].map(tabItem => (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setWaSubSection(tabItem.id)}
                style={{
                  flex: 1,
                  minWidth: 140,
                  padding: "0.6rem 1rem",
                  borderRadius: 12,
                  fontSize: "0.84rem",
                  fontWeight: 800,
                  border: waSubSection === tabItem.id ? "1px solid #7c6fff" : "1px solid transparent",
                  background: waSubSection === tabItem.id ? "linear-gradient(135deg, rgba(124, 111, 255, 0.35), rgba(99, 102, 241, 0.2))" : "transparent",
                  color: waSubSection === tabItem.id ? "#fff" : "var(--muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  textAlign: "center",
                  boxShadow: waSubSection === tabItem.id ? "0 4px 14px rgba(124, 111, 255, 0.25)" : "none",
                }}
              >
                {tabItem.label}
              </button>
            ))}
          </div>

          {(waSubSection === "all" || waSubSection === "gateway" || waSubSection === "preview") && (
            <div className="wa-grid-layout" style={{ gridTemplateColumns: waSubSection === "gateway" ? "1fr" : waSubSection === "preview" ? "1fr" : undefined }}>
              {/* Left Column: Device & Connection Hub */}
              {(waSubSection === "all" || waSubSection === "gateway") && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className="card" style={{ padding: "1.5rem", margin: 0, background: "rgba(15, 23, 42, 0.75)", backdropFilter: "blur(16px)", border: "1px solid rgba(99, 102, 241, 0.25)", borderRadius: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                  <div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f8fafc", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span>📱 WhatsApp Gateway</span>
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                      Multi-device session powered by Baileys
                    </div>
                  </div>
                  <button 
                    className="cmd-refresh-btn" 
                    onClick={loadWhatsAppStatus} 
                    disabled={waLoading}
                    style={{ fontSize: "0.78rem" }}
                    title="Refresh Gateway Status"
                  >
                    Sync
                  </button>
                </div>

              {/* Status Banner */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.85rem",
                padding: "0.95rem 1.15rem",
                borderRadius: 14,
                background: waStatus?.isConnected ? "rgba(34, 197, 94, 0.08)" : waStatus?.hasSavedCredentials ? "rgba(56, 189, 248, 0.08)" : "rgba(234, 179, 8, 0.08)",
                border: `1px solid ${waStatus?.isConnected ? "rgba(34, 197, 94, 0.3)" : waStatus?.hasSavedCredentials ? "rgba(56, 189, 248, 0.3)" : "rgba(234, 179, 8, 0.3)"}`,
                marginBottom: "1.25rem",
              }}>
                <div style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: waStatus?.isConnected ? "#4ade80" : waStatus?.hasSavedCredentials ? "#38bdf8" : "#fbbf24",
                  boxShadow: `0 0 10px ${waStatus?.isConnected ? "#4ade80" : waStatus?.hasSavedCredentials ? "#38bdf8" : "#fbbf24"}`,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: "0.9rem", color: waStatus?.isConnected ? "#4ade80" : waStatus?.hasSavedCredentials ? "#38bdf8" : "#fbbf24" }}>
                    {waStatus?.isConnected
                      ? "Connected & Broadcasting Live"
                      : waStatus?.hasSavedCredentials
                      ? "Re-authenticating Saved Session..."
                      : waStatus?.qrCodeDataUrl
                      ? "QR Code Ready — Scan with Phone"
                      : "Establishing WhatsApp Handshake..."}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                    {waStatus?.isConnected
                      ? "Device is synced. Auto-dispatches will be delivered to your target group."
                      : waStatus?.hasSavedCredentials
                      ? "Session restored from disk. Connecting socket to WhatsApp gateway..."
                      : "Open WhatsApp > Linked Devices > Link a Device."}
                  </div>
                </div>
              </div>

              {/* Connected Details Card */}
              {waStatus?.isConnected ? (
                <div style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.07)",
                  borderRadius: 14,
                  padding: "1.25rem",
                  marginBottom: "1.25rem",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
                      Authenticated Sender Phone
                    </span>
                    <button
                      className="copy-btn"
                      onClick={() => setShowWaPhone(!showWaPhone)}
                      title={showWaPhone ? "Mask number" : "Reveal full number"}
                      style={{ fontSize: "0.75rem" }}
                    >
                      {showWaPhone ? "Hide" : "Reveal"}
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(74, 222, 128, 0.14)", border: "1px solid rgba(74, 222, 128, 0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", flexShrink: 0 }}>
                      📱
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#f8fafc", fontFamily: "monospace" }}>
                        {showWaPhone
                          ? waStatus.userPhone
                          : waStatus.userPhone?.replace(/(\+\d{2})(\d{3})\d{4}(\d{2})/, "$1 ••••• ••$3") || "Connected Number"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: 600, marginTop: "0.15rem" }}>
                        ⚡ Baileys Protocol Socket · Online
                      </div>
                    </div>
                  </div>
                </div>
              ) : waStatus?.hasSavedCredentials && !waStatus?.qrCodeDataUrl ? (
                <div style={{
                  padding: "2rem 1.5rem",
                  background: "rgba(56, 189, 248, 0.04)",
                  border: "1px solid rgba(56, 189, 248, 0.15)",
                  borderRadius: 14,
                  marginBottom: "1.25rem",
                  textAlign: "center",
                }}>
                  <div className="spinner" style={{ margin: "0 auto 1rem" }} />
                  <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.95rem" }}>Reconnecting to {waStatus.userPhone}...</div>
                  <div style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: "0.25rem" }}>
                    Saved credentials detected. Restoring live socket handshake.
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: "1.5rem",
                  background: "rgba(0, 0, 0, 0.3)",
                  border: "1px dashed rgba(167, 139, 250, 0.35)",
                  borderRadius: 14,
                  marginBottom: "1.25rem",
                  textAlign: "center",
                }}>
                  {waStatus?.qrCodeDataUrl ? (
                    <>
                      <div style={{
                        padding: "12px",
                        background: "#ffffff",
                        borderRadius: 14,
                        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
                        display: "inline-block",
                        marginBottom: "1rem",
                      }}>
                        <img
                          src={waStatus.qrCodeDataUrl}
                          alt="WhatsApp QR Code"
                          style={{ width: 220, height: 220, display: "block" }}
                        />
                      </div>
                      <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.95rem" }}>
                        Scan QR Code with WhatsApp
                      </div>
                      <p style={{ color: "var(--muted)", fontSize: "0.78rem", maxWidth: 320, margin: "0.4rem auto 0", lineHeight: 1.45 }}>
                        1. Open WhatsApp on phone<br/>
                        2. Tap <strong>Linked Devices</strong> → <strong>Link a Device</strong><br/>
                        3. Scan this screen
                      </p>
                    </>
                  ) : (
                    <div style={{ padding: "2rem 1rem", color: "var(--muted)" }}>
                      <div className="spinner" style={{ margin: "0 auto 1rem" }} />
                      <div style={{ fontSize: "0.85rem" }}>Generating fresh WhatsApp QR Code...</div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => handleReconnectWhatsApp(false)}
                  disabled={waReconnecting || waUnlinking}
                  style={{ flex: 1, padding: "0.6rem 1rem", fontSize: "0.82rem", fontWeight: 700 }}
                >
                  {waReconnecting ? "⏳ Reconnecting..." : `🔄 ${waStatus?.hasSavedCredentials ? "Reconnect Socket" : "Refresh QR"}`}
                </button>

                {waStatus?.hasSavedCredentials && !waStatus?.isConnected && (
                  <button 
                    className="btn-secondary" 
                    onClick={() => handleReconnectWhatsApp(true)}
                    disabled={waReconnecting || waUnlinking}
                    style={{ padding: "0.6rem 1rem", fontSize: "0.82rem", border: "1px solid rgba(251, 191, 36, 0.4)", color: "#fbbf24", background: "rgba(251, 191, 36, 0.1)", fontWeight: 700 }}
                    title="Force clear stale saved session & generate new QR Code"
                  >
                    ⚡ Reset &amp; Scan QR
                  </button>
                )}

                {(waStatus?.isConnected || waStatus?.hasSavedCredentials) && (
                  <button 
                    className="paid-toggle-btn unpaid" 
                    onClick={handleLogoutWhatsApp}
                    disabled={waUnlinking || waReconnecting}
                    style={{ padding: "0.6rem 1rem", fontSize: "0.82rem" }}
                  >
                    {waUnlinking ? "⏳ Unlinking..." : "🚪 Unlink Device"}
                  </button>
                )}
              </div>
            </div>

            {/* Target Group Info Card */}
            <div className="card" style={{ padding: "1.25rem", margin: 0 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#f8fafc", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span>🎯 Configured Target Group JID</span>
              </div>
              <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
                All automated posters and attendance reminders are sent to this WhatsApp Group.
              </div>

              <div style={{
                padding: "0.75rem 0.9rem",
                borderRadius: 10,
                background: "rgba(124, 111, 255, 0.08)",
                border: "1px solid rgba(124, 111, 255, 0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}>
                <span style={{ fontFamily: "monospace", fontSize: "0.84rem", fontWeight: 700, color: waStatus?.targetGroup ? "#c4b5fd" : "#f87171", wordBreak: "break-all" }}>
                  {waStatus?.targetGroup || "⚠️ TARGET_GROUP not set in .env"}
                </span>
                {waStatus?.targetGroup && (
                  <button
                    className="copy-btn"
                    onClick={() => { navigator.clipboard?.writeText(waStatus.targetGroup); msg("Group JID copied!"); }}
                    title="Copy Group JID"
                  >
                    ⎘
                  </button>
                )}
              </div>
              
              <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: "0.6rem" }}>
                🕒 Poster Time: <strong style={{ color: "var(--accent)" }}>{settings?.posterSendTime || "08:00"} IST</strong> · Auto-Sync: <span style={{ color: "#4ade80" }}>Active</span>
              </div>
            </div>
            </div>
          )}

          {/* Right Column: Live Message Simulation & Dispatch Hub */}
          {(waSubSection === "all" || waSubSection === "preview") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="card" style={{ padding: "1.5rem", margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f8fafc" }}>
                    💬 Live Message Preview &amp; Dispatch Hub
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                    Real-time WhatsApp rendering simulation and 1-click group broadcasting.
                  </div>
                </div>

                {/* Simulation Mode Switcher */}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setWaPreviewTab("report")}
                    style={{
                      padding: "0.38rem 0.75rem",
                      borderRadius: 10,
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      border: waPreviewTab === "report" ? "1px solid #7c6fff" : "1px solid rgba(255,255,255,0.1)",
                      background: waPreviewTab === "report" ? "rgba(124, 111, 255, 0.25)" : "rgba(255,255,255,0.04)",
                      color: waPreviewTab === "report" ? "#fff" : "var(--muted)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    📊 Attendance Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setWaPreviewTab("poster")}
                    style={{
                      padding: "0.38rem 0.75rem",
                      borderRadius: 10,
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      border: waPreviewTab === "poster" ? "1px solid #7c6fff" : "1px solid rgba(255,255,255,0.1)",
                      background: waPreviewTab === "poster" ? "rgba(124, 111, 255, 0.25)" : "rgba(255,255,255,0.04)",
                      color: waPreviewTab === "poster" ? "#fff" : "var(--muted)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    🖼️ Daily Poster
                  </button>
                  <button
                    type="button"
                    onClick={() => setWaPreviewTab("prize")}
                    style={{
                      padding: "0.38rem 0.75rem",
                      borderRadius: 10,
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      border: waPreviewTab === "prize" ? "1px solid #fbbf24" : "1px solid rgba(255,255,255,0.1)",
                      background: waPreviewTab === "prize" ? "rgba(251, 191, 36, 0.22)" : "rgba(255,255,255,0.04)",
                      color: waPreviewTab === "prize" ? "#fbbf24" : "var(--muted)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    🏆 Month-End Prize
                  </button>
                </div>
              </div>

              {/* Simulated WhatsApp Phone Frame */}
              <div className="wa-phone-mock" style={{ marginBottom: "1.25rem" }}>
                <div className="wa-phone-header">
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.95rem", color: "#fff", fontWeight: 700 }}>
                    🌟
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e9edef", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Speak &amp; Shine VIP Community
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "#8696a0" }}>
                      {users.length} members · tap here for group info
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", color: "#aebac1", fontSize: "0.9rem" }}>
                    <span>📞</span>
                    <span>⋮</span>
                  </div>
                </div>

                <div className="wa-phone-body">
                  <div style={{ alignSelf: "center", background: "#182229", padding: "3px 10px", borderRadius: 8, fontSize: "0.65rem", color: "#8696a0", textTransform: "uppercase", fontWeight: 600 }}>
                    Today · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </div>

                  {waPreviewTab === "report" ? (
                    <div className="wa-msg-bubble">
                      <div style={{ fontWeight: 800, color: "#25d366", marginBottom: "0.4rem" }}>
                        📊 *DAILY SUBMISSION STATUS REPORT*
                      </div>
                      <div>📅 *Date:* {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} | ⏰ *Time:* {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                      <div style={{ opacity: 0.7 }}>━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

                      <div style={{ marginTop: "0.5rem" }}>
                        <strong>✅ Submitted Students ({users.filter(u => u.completed).length}):</strong><br/>
                        {users.filter(u => u.completed).slice(0, 4).map((u, i) => (
                          <div key={i}>• {u.registeredName || u.name} (🔥 {u.streak || 0}d)</div>
                        ))}
                        {users.filter(u => u.completed).length === 0 && <em>No submissions recorded yet today.</em>}
                      </div>

                      <div style={{ marginTop: "0.5rem" }}>
                        <strong>⏳ Pending Students ({users.filter(u => !u.completed).length} remaining):</strong><br/>
                        {users.filter(u => !u.completed).slice(0, 4).map((u, i) => (
                          <div key={i}>{i + 1}. {u.registeredName || u.name}</div>
                        ))}
                        {users.filter(u => !u.completed).length > 4 && <div>...and {users.filter(u => !u.completed).length - 4} more</div>}
                      </div>

                      <div style={{ marginTop: "0.5rem" }}>
                        📈 *Class Progress:* {users.length > 0 ? Math.round((users.filter(u => u.completed).length / users.length) * 100) : 0}% ▰▰▱▱▱▱▱▱▱▱<br/>
                        ⭐ *Top Points Today:* {users.sort((a,b) => (b.monthlyScore||0) - (a.monthlyScore||0))[0]?.name || "Leader"} ({users.sort((a,b) => (b.monthlyScore||0) - (a.monthlyScore||0))[0]?.monthlyScore || 0} pts)
                      </div>

                      <div style={{ marginTop: "0.5rem", color: "#53bdeb" }}>
                        🚀 *Submit here:* https://speak-shine.app
                      </div>

                      <div className="wa-msg-time">
                        {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        <span style={{ color: "#53bdeb" }}>✓✓</span>
                      </div>
                    </div>
                  ) : waPreviewTab === "poster" ? (
                    <div className="wa-msg-bubble">
                      <div style={{ fontWeight: 800, color: "#25d366", marginBottom: "0.4rem" }}>
                        🎯 *SPEAK &amp; SHINE — DAILY CHALLENGE*
                      </div>
                      <div>📅 *Date:* {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                      <div style={{ opacity: 0.7 }}>━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

                      <div style={{ marginTop: "0.4rem" }}>
                        📌 *Category:* {waStatus?.todayQuestion?.category || dash?.today?.category || "Speaking Practice"}<br/>
                        💬 *Topic:* {waStatus?.todayQuestion?.topic || dash?.today?.topic || "Daily Routine"}<br/><br/>
                        📝 *Challenge:*<br/>
                        "{waStatus?.todayQuestion?.imageInstructions || waStatus?.todayQuestion?.question || dash?.today?.question || "No daily challenge published yet."}"
                      </div>

                      <div style={{ marginTop: "0.5rem", color: "#53bdeb" }}>
                        🚀 *Record and submit your 1-5 min video on the portal!*
                      </div>

                      <div className="wa-msg-time">
                        {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        <span style={{ color: "#53bdeb" }}>✓✓</span>
                      </div>
                    </div>
                  ) : (
                    <div className="wa-msg-bubble">
                      <div style={{ fontWeight: 800, color: "#fbbf24", marginBottom: "0.4rem" }}>
                        🏆 *SPEAK &amp; SHINE — {waPrizeSummary?.monthName || "MONTHLY"} PRIZE DISTRIBUTION* 🏆
                      </div>
                      <div>💰 <strong>Total Collection: ₹{waPrizeSummary?.totalCollection || (prizeCustomTotalCollection !== "" ? prizeCustomTotalCollection : 60)}</strong></div>
                      <div style={{ opacity: 0.7, margin: "0.3rem 0" }}>━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", margin: "0.5rem 0" }}>
                        {(waPrizeSummary?.winners || []).map((w, idx) => {
                          const emojis = ["🥇", "🥈", "🥉", "🏅", "🎖️", "🎗️"];
                          const labels = ["1st Place", "2nd Place", "3rd Place", "4th Place", "5th Place", "6th Place"];
                          return (
                            <div key={idx} style={{ fontSize: "0.82rem" }}>
                              {emojis[idx] || "🏅"} <strong>{labels[idx] || `${idx + 1}th Place`}:</strong> ₹{w.amount} <span style={{ color: "#38bdf8", fontWeight: 700 }}>{w.name}</span>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ opacity: 0.7, margin: "0.3rem 0" }}>━━━━━━━━━━━━━━━━━━ 💰 Total: ₹{waPrizeSummary?.totalCollection || 60}</div>

                      <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#f43f5e", fontWeight: 700 }}>
                        🎉 Congratulations to all the winners! 🎉🔥<br/>
                        ✨ Keep speaking, keep improving, and keep shining! 🌟
                      </div>

                      <div style={{ marginTop: "0.4rem", fontSize: "0.74rem", fontStyle: "italic", color: "var(--muted)" }}>
                        {prizeFooterNote}
                      </div>

                      <div className="wa-msg-time">
                        {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        <span style={{ color: "#53bdeb" }}>✓✓</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <button
                  className="btn-primary"
                  style={{
                    padding: "0.8rem 0.5rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.35rem",
                  }}
                  disabled={!waStatus?.isConnected || waSendingPoster}
                  onClick={handleSendPosterToGroup}
                >
                  {waSendingPoster ? "⏳ Sending..." : "🚀 Broadcast Poster"}
                </button>

                <button
                  className="btn-secondary"
                  style={{
                    padding: "0.8rem 0.5rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.35rem",
                    border: "1px solid rgba(124, 111, 255, 0.4)",
                    background: "rgba(124, 111, 255, 0.14)",
                    color: "#c084fc",
                  }}
                  disabled={!waStatus?.isConnected || waSendingReport}
                  onClick={handleSendSubmissionReportToGroup}
                >
                  {waSendingReport ? "⏳ Sending..." : "📊 Broadcast Report"}
                </button>

                <button
                  className="btn-secondary"
                  style={{
                    padding: "0.8rem 0.5rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.35rem",
                    border: "1px solid rgba(251, 191, 36, 0.4)",
                    background: "rgba(251, 191, 36, 0.14)",
                    color: "#fbbf24",
                  }}
                  disabled={!waStatus?.isConnected || waSendingPrizeReport}
                  onClick={handleSendPrizeReportToGroup}
                >
                  {waSendingPrizeReport ? "⏳ Sending..." : "🏆 Broadcast Prize"}
                </button>
              </div>

              {/* Configure Timers Shortcut */}
              <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => { setTab("settings"); setSettingsSubTab("schedules"); }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#a5b4fc",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  ⚙️ Configure Automated Multi-Slot Timers &amp; Custom Message Templates →
                </button>
              </div>
            </div>
          </div>
          )}
          </div>
          )}
          {/* End wa-grid-layout */}

          {/* TIER 3: Month-End Prize Distribution & Rewards Calculator Card */}
          {(waSubSection === "all" || waSubSection === "prize") && (
            <div className="card" style={{
              padding: "1.75rem",
              margin: 0,
              background: "linear-gradient(135deg, rgba(22, 18, 45, 0.98), rgba(30, 27, 75, 0.95))",
              borderRadius: 20,
              border: "1px solid rgba(251, 191, 36, 0.4)",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.45)",
            }}>
            {/* Card Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.85rem" }}>
              <div>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f8fafc", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>🏆 Month-End Prize Distribution &amp; Rewards Calculator</span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Calculate monthly collections, split prize money across Top 3 to Top 6 winners, inspect formulas, and save settings for future months.
                </div>
              </div>
              
              {/* Header Controls: Auto-Cron Badge & Toggle */}
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.74rem", background: "rgba(251, 191, 36, 0.15)", color: "#fbbf24", border: "1px solid rgba(251, 191, 36, 0.4)", padding: "4px 12px", borderRadius: 14, fontWeight: 700 }}>
                  ⏰ Auto-Cron: 11:59 PM IST (Last Day)
                </span>

                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  cursor: "pointer",
                  background: monthEndReportAutoSend ? "rgba(34, 197, 94, 0.15)" : "rgba(255, 255, 255, 0.05)",
                  padding: "4px 12px",
                  borderRadius: 14,
                  border: monthEndReportAutoSend ? "1px solid rgba(34, 197, 94, 0.4)" : "1px solid rgba(255, 255, 255, 0.12)",
                  transition: "all 0.2s ease",
                }}>
                  <input
                    type="checkbox"
                    checked={monthEndReportAutoSend}
                    onChange={e => setMonthEndReportAutoSend(e.target.checked)}
                    style={{ cursor: "pointer", accentColor: "#22c55e" }}
                  />
                  <span style={{ fontSize: "0.76rem", fontWeight: 700, color: monthEndReportAutoSend ? "#4ade80" : "var(--muted)" }}>
                    {monthEndReportAutoSend ? "⚡ Auto-Cron Active" : "⏸️ Auto-Cron Paused"}
                  </span>
                </label>
              </div>
            </div>

            {/* 2-Column Content Grid inside Prize Card */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1.5rem", marginTop: "1.25rem" }}>
              
              {/* Left Column: Formula + Controls */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                
                {/* Formula Breakdown & Calculation Method Banner */}
                <div style={{
                  padding: "0.95rem 1.15rem",
                  borderRadius: 14,
                  background: "linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(16, 185, 129, 0.08))",
                  border: "1px solid rgba(251, 191, 36, 0.35)",
                  fontSize: "0.82rem",
                  color: "#fef08a",
                  fontFamily: "monospace",
                  lineHeight: 1.5,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
                }}>
                  <div style={{ fontWeight: 800, color: "#fbbf24", marginBottom: "0.3rem", fontSize: "0.88rem", fontFamily: "sans-serif", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span>📊 Live Calculation Formula &amp; Split Ratios:</span>
                  </div>
                  {waPrizeSummary?.formulaText || "Calculation: Preset Top 3 (50% / 33.3% / 16.7%) → 1st: ₹30, 2nd: ₹20, 3rd: ₹10 | Total: ₹60"}
                </div>

                {/* Total Collection Input */}
                <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "1.1rem", borderRadius: 14, border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                  <label style={{ fontSize: "0.82rem", color: "#f8fafc", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
                    💰 Total Collection (₹)
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#fbbf24", fontWeight: 900, fontSize: "0.95rem" }}>₹</span>
                      <input
                        type="number"
                        className="form-input"
                        placeholder={waPrizeSummary?.autoCalculatedCollection ? `${waPrizeSummary.autoCalculatedCollection}` : "60"}
                        value={prizeCustomTotalCollection}
                        onChange={e => {
                          const val = e.target.value;
                          setPrizeCustomTotalCollection(val);
                          loadWaPrizeSummary({ totalCollection: val !== "" ? Number(val) : undefined });
                        }}
                        style={{ width: "100%", paddingLeft: "2rem", fontSize: "0.95rem", fontWeight: 700, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(251, 191, 36, 0.35)", color: "#fff", borderRadius: 10 }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setPrizeCustomTotalCollection("");
                        loadWaPrizeSummary({ totalCollection: undefined });
                      }}
                      style={{ fontSize: "0.78rem", padding: "0.55rem 0.9rem", whiteSpace: "nowrap", background: prizeCustomTotalCollection === "" ? "rgba(251, 191, 36, 0.2)" : "rgba(255,255,255,0.05)", border: "1px solid rgba(251, 191, 36, 0.35)", color: "#fbbf24", fontWeight: 800, borderRadius: 10 }}
                      title="Reset to Auto-Calculated Collection from current month's payments"
                    >
                      ⚡ Auto: ₹{waPrizeSummary?.autoCalculatedCollection || 60}
                    </button>
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: "0.45rem" }}>
                    Calculated from this month's payments ({waPrizeSummary?.monthName || "CURRENT MONTH"}).
                  </div>
                </div>

                {/* Winner Tier Count (Top 3 to Top 6) */}
                <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "1.1rem", borderRadius: 14, border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                  <label style={{ fontSize: "0.82rem", color: "#f8fafc", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
                    🏆 Number of Winners (Top 3 – Top 6)
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {[3, 4, 5, 6].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setPrizeWinnerCount(num);
                          const defaultMethod = num === 4 ? "preset_top4" : num === 5 ? "preset_top5" : num === 6 ? "preset_top6" : "preset_top3";
                          setPrizeCalculationMethod(defaultMethod);
                          loadWaPrizeSummary({ winnerCount: num, calculationMethod: defaultMethod });
                        }}
                        style={{
                          padding: "0.5rem 1rem",
                          borderRadius: 10,
                          fontSize: "0.84rem",
                          fontWeight: 800,
                          border: prizeWinnerCount === num ? "1px solid #fbbf24" : "1px solid rgba(255,255,255,0.12)",
                          background: prizeWinnerCount === num ? "linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(245, 158, 11, 0.15))" : "rgba(255,255,255,0.04)",
                          color: prizeWinnerCount === num ? "#fff" : "var(--muted)",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        Top {num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calculation Method Selection */}
                <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "1.1rem", borderRadius: 14, border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                  <label style={{ fontSize: "0.82rem", color: "#f8fafc", fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
                    ⚙️ Calculation Method &amp; Split Ratios
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {[
                      { id: `preset_top${prizeWinnerCount}`, label: `📊 Preset Ratio (Top ${prizeWinnerCount})` },
                      { id: "equal", label: `⚖️ Equal Split (1/${prizeWinnerCount} each)` },
                      { id: "custom", label: "✏️ Custom Manual Amounts" },
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setPrizeCalculationMethod(m.id);
                          loadWaPrizeSummary({ calculationMethod: m.id });
                        }}
                        style={{
                          padding: "0.5rem 1rem",
                          borderRadius: 10,
                          fontSize: "0.8rem",
                          fontWeight: 800,
                          border: prizeCalculationMethod === m.id ? "1px solid #7c6fff" : "1px solid rgba(255,255,255,0.12)",
                          background: prizeCalculationMethod === m.id ? "rgba(124, 111, 255, 0.28)" : "rgba(255,255,255,0.04)",
                          color: prizeCalculationMethod === m.id ? "#fff" : "var(--muted)",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Winners Leaderboard Mapping + Action Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                
                {/* Winners Leaderboard Mapping Table */}
                <div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#f8fafc", marginBottom: "0.65rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>🥇 Winners Leaderboard Mapping ({prizeWinnerCount} Members)</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Mapped directly from DB points</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {(waPrizeSummary?.winners || []).slice(0, prizeWinnerCount).map((w, idx) => {
                      const emojis = ["🥇", "🥈", "🥉", "🏅", "🎖️", "🎗️"];
                      const labels = ["1st Place", "2nd Place", "3rd Place", "4th Place", "5th Place", "6th Place"];
                      const rankBorders = [
                        "1px solid rgba(251, 191, 36, 0.5)",
                        "1px solid rgba(226, 232, 240, 0.4)",
                        "1px solid rgba(249, 115, 22, 0.4)",
                        "1px solid rgba(167, 139, 250, 0.25)",
                        "1px solid rgba(167, 139, 250, 0.2)",
                        "1px solid rgba(167, 139, 250, 0.2)",
                      ];
                      const rankGradients = [
                        "linear-gradient(135deg, rgba(251, 191, 36, 0.14), rgba(15, 23, 42, 0.85))",
                        "linear-gradient(135deg, rgba(226, 232, 240, 0.09), rgba(15, 23, 42, 0.85))",
                        "linear-gradient(135deg, rgba(249, 115, 22, 0.09), rgba(15, 23, 42, 0.85))",
                        "rgba(15, 23, 42, 0.6)",
                        "rgba(15, 23, 42, 0.6)",
                        "rgba(15, 23, 42, 0.6)",
                      ];
                      const rankTextColors = ["#fbbf24", "#e2e8f0", "#fdba74", "#cbd5e1", "#cbd5e1", "#cbd5e1"];

                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.85rem",
                            background: rankGradients[idx] || "rgba(15, 23, 42, 0.6)",
                            padding: "0.75rem 1rem",
                            borderRadius: 14,
                            border: rankBorders[idx] || "1px solid rgba(255, 255, 255, 0.08)",
                            flexWrap: "wrap",
                            boxShadow: idx < 3 ? "0 4px 14px rgba(0,0,0,0.25)" : "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: 100 }}>
                            <span style={{ fontSize: "1.25rem" }}>{emojis[idx] || "🏅"}</span>
                            <span style={{ fontSize: "0.82rem", fontWeight: 800, color: rankTextColors[idx] || "#e2e8f0" }}>
                              {labels[idx] || `${idx + 1}th`}
                            </span>
                          </div>

                          {/* Editable Name Input */}
                          <input
                            type="text"
                            className="form-input"
                            value={prizeWinnerNames[idx] ? prizeWinnerNames[idx] : (w?.name || "")}
                            onChange={e => {
                              const val = e.target.value;
                              setPrizeWinnerNames(prev => {
                                const next = [...prev];
                                next[idx] = val;
                                return next;
                              });
                            }}
                            style={{
                              flex: 1,
                              minWidth: 160,
                              fontSize: "0.88rem",
                              padding: "0.45rem 0.8rem",
                              background: "rgba(0,0,0,0.4)",
                              border: idx === 0 ? "1px solid rgba(251, 191, 36, 0.35)" : "1px solid rgba(255,255,255,0.15)",
                              color: "#fff",
                              fontWeight: 700,
                              borderRadius: 10,
                            }}
                            placeholder={w?.name || `Student ${idx + 1}`}
                          />

                          {/* Leaderboard Points Badge */}
                          <div style={{
                            background: "rgba(167, 139, 250, 0.15)",
                            border: "1px solid rgba(167, 139, 250, 0.3)",
                            padding: "4px 10px",
                            borderRadius: 10,
                            fontSize: "0.78rem",
                            color: "#c084fc",
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                          }}>
                            ⭐ {w.monthlyScore || 0} pts
                          </div>

                          {/* Custom Amount Input or Static Rupee Badge */}
                          {prizeCalculationMethod === "custom" ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <span style={{ fontSize: "0.9rem", color: "#4ade80", fontWeight: 900 }}>₹</span>
                              <input
                                type="number"
                                className="form-input"
                                value={prizeCustomAmounts[idx] != null ? prizeCustomAmounts[idx] : w.amount}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPrizeCustomAmounts(prev => {
                                    const next = [...prev];
                                    next[idx] = val;
                                    return next;
                                  });
                                  loadWaPrizeSummary({ customAmounts: prizeCustomAmounts.filter(Boolean).join(",") });
                                }}
                                style={{ width: 85, fontSize: "0.9rem", padding: "0.4rem 0.6rem", fontWeight: 800, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(74, 222, 128, 0.5)", color: "#4ade80", borderRadius: 10 }}
                              />
                            </div>
                          ) : (
                            <div style={{
                              background: "rgba(34, 197, 94, 0.15)",
                              border: "1px solid rgba(34, 197, 94, 0.35)",
                              padding: "4px 12px",
                              borderRadius: 12,
                              fontSize: "0.95rem",
                              fontWeight: 900,
                              color: "#4ade80",
                              textAlign: "center",
                              minWidth: 70,
                            }}>
                              ₹{w.amount}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Announcement Footer Note Input */}
                <div>
                  <label style={{ fontSize: "0.82rem", color: "#f8fafc", fontWeight: 700, display: "block", marginBottom: "0.4rem" }}>
                    📝 Announcement Footer Note
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={prizeFooterNote}
                    onChange={e => setPrizeFooterNote(e.target.value)}
                    placeholder="*Rewards will credit before evening*"
                    style={{ width: "100%", fontSize: "0.88rem", padding: "0.55rem 0.9rem", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: 10 }}
                  />
                </div>

                {/* Primary Action Buttons Row: Save Settings + Broadcast Now */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginTop: "0.5rem" }}>
                  <button
                    className="btn-secondary"
                    disabled={savingPrizeSettings}
                    onClick={handleSavePrizeSettings}
                    style={{
                      padding: "0.9rem 1.35rem",
                      fontSize: "0.9rem",
                      fontWeight: 800,
                      background: "linear-gradient(135deg, #059669, #10b981)",
                      border: "none",
                      color: "#fff",
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      boxShadow: "0 6px 20px rgba(16, 185, 129, 0.35)",
                      cursor: "pointer",
                    }}
                  >
                    {savingPrizeSettings ? "⏳ Saving Settings..." : "💾 Save Month-End Settings"}
                  </button>

                  <button
                    className="btn-primary"
                    disabled={!waStatus?.isConnected || waSendingPrizeReport}
                    onClick={handleSendPrizeReportToGroup}
                    style={{
                      padding: "0.9rem 1.35rem",
                      fontSize: "0.9rem",
                      fontWeight: 800,
                      background: "linear-gradient(135deg, #f59e0b, #d97706)",
                      border: "none",
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      boxShadow: "0 6px 20px rgba(245, 158, 11, 0.35)",
                      cursor: "pointer",
                    }}
                  >
                    {waSendingPrizeReport ? "⏳ Dispatching Report..." : "🚀 Broadcast Report Now"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      {/* SETTINGS */}
      {tab==="settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", width: "100%", maxWidth: 1100, margin: "0 auto", boxSizing: "border-box" }}>
          
          {/* Settings Header & Category Nav */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            padding: "1.25rem 1.5rem",
            background: "var(--card-bg, rgba(22, 18, 45, 0.7))",
            borderRadius: 16,
            border: "1px solid var(--border, rgba(124, 111, 255, 0.2))",
            backdropFilter: "blur(12px)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  ⚙️ Admin System Settings
                </h2>
                <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                  Manage WhatsApp automation, speaking duration limits, vocabulary rules, pricing, and system resets.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem", color: "var(--muted)" }}>
                <span>🕒 Server Timezone: <strong style={{ color: "var(--accent)" }}>IST (UTC+5:30)</strong></span>
              </div>
            </div>

            {/* Segmented Filter Pills */}
            <div style={{
              display: "flex",
              gap: "0.5rem",
              flexWrap: "wrap",
              paddingTop: "0.75rem",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            }}>
              {[
                { id: "schedules", label: "⏰ Bot & Schedules" },
                { id: "duration", label: "⏱️ Video Duration" },
                { id: "vocab", label: "📚 Vocabulary & Tasks" },
                { id: "pricing", label: "💳 Pricing & Privacy" },
                { id: "resets", label: "⚠️ System Resets" },
              ].map(sub => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSettingsSubTab(sub.id)}
                  style={{
                    padding: "0.5rem 1.1rem",
                    borderRadius: 20,
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    border: settingsSubTab === sub.id ? "1px solid #7c6fff" : "1px solid rgba(255, 255, 255, 0.1)",
                    background: settingsSubTab === sub.id ? "rgba(124, 111, 255, 0.25)" : "rgba(255, 255, 255, 0.04)",
                    color: settingsSubTab === sub.id ? "#fff" : "var(--muted)",
                    boxShadow: settingsSubTab === sub.id ? "0 0 12px rgba(124, 111, 255, 0.35)" : "none",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* SECTION 1: BOT SCHEDULES & AUTOMATION */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {settingsSubTab === "schedules" && (
            <div className="card" style={{ margin: 0, padding: "1.5rem", borderRadius: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <div className="section-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                    ⏰ Bot Automation &amp; Schedules
                  </div>
                  <p style={{ color: "var(--muted)", fontSize: "0.83rem", margin: "0.25rem 0 0" }}>
                    Configure automated daily dispatches and submission reports to your WhatsApp group (IST, 24-hour format).
                  </p>
                </div>
                <div style={{ fontSize: "0.76rem", padding: "4px 10px", borderRadius: 20, background: "rgba(124, 111, 255, 0.12)", color: "#a78bfa", fontWeight: 600 }}>
                  ⚡ Auto-syncs every minute
                </div>
              </div>

              <form onSubmit={e => saveSettings(e, "schedule")}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem", marginBottom: "1.25rem" }}>
                  
                  {/* Poster Send Time */}
                  <div style={{
                    padding: "1rem 1.25rem",
                    borderRadius: 12,
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                  }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      🖼️ Poster Send Time
                    </label>
                    <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0 0 0.75rem" }}>
                      Daily question / story audio poster is automatically sent to the WhatsApp group.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <input
                        className="form-input"
                        type="time"
                        value={settings.posterSendTime}
                        onChange={e => setSettings(s => ({ ...s, posterSendTime: e.target.value }))}
                        required
                        style={{ width: 140, fontSize: "1.05rem", padding: "0.45rem 0.6rem" }}
                      />
                      <span style={{ fontSize: "0.8rem", color: "var(--accent)", fontWeight: 600 }}>
                        Currently: {settings.posterSendTime} IST
                      </span>
                    </div>
                  </div>

                  {/* Question Generate Time */}
                  <div style={{
                    padding: "1rem 1.25rem",
                    borderRadius: 12,
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                  }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      🤖 Question Generate Time
                    </label>
                    <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0 0 0.75rem" }}>
                      AI automatically pre-generates 14 upcoming questions if bank stock is low.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <input
                        className="form-input"
                        type="time"
                        value={settings.questionGenerateTime}
                        onChange={e => setSettings(s => ({ ...s, questionGenerateTime: e.target.value }))}
                        required
                        style={{ width: 140, fontSize: "1.05rem", padding: "0.45rem 0.6rem" }}
                      />
                      <span style={{ fontSize: "0.8rem", color: "var(--accent)", fontWeight: 600 }}>
                        Currently: {settings.questionGenerateTime} IST
                      </span>
                    </div>
                  </div>

                </div>

                {/* Submission Report Schedule Box */}
                <div style={{
                  padding: "1.25rem",
                  borderRadius: 14,
                  background: "rgba(124, 111, 255, 0.05)",
                  border: "1px solid rgba(124, 111, 255, 0.25)",
                  marginBottom: "1.5rem"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        📊 WhatsApp Daily Submission Report (Paid Students)
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                        Auto-broadcasts daily attendance (submitted vs pending paid students) to your group at each configured time.
                      </div>
                    </div>

                    {/* Active / Paused Toggle Pill */}
                    <div
                      onClick={() => setSettings(s => ({ ...s, submissionReportEnabled: !s.submissionReportEnabled }))}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        cursor: "pointer",
                        userSelect: "none",
                        background: settings.submissionReportEnabled ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                        border: `1px solid ${settings.submissionReportEnabled ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
                        borderRadius: 24,
                        padding: "0.4rem 0.95rem",
                        transition: "all 0.2s ease",
                        width: "fit-content",
                      }}
                    >
                      <div style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: settings.submissionReportEnabled ? "#4ade80" : "#f87171",
                        boxShadow: `0 0 8px ${settings.submissionReportEnabled ? "#4ade80" : "#f87171"}`,
                      }} />
                      <span style={{ fontSize: "0.84rem", fontWeight: 700, color: settings.submissionReportEnabled ? "#4ade80" : "#f87171" }}>
                        {settings.submissionReportEnabled ? "🟢 Active (Auto-Send ON)" : "🔴 Paused (Auto-Send OFF)"}
                      </span>
                    </div>
                  </div>

                  {/* Dynamic Multi-Times List with Filters & Sorters */}
                  {(() => {
                    const allSlots = (settings.submissionReportSlots || [
                      { time: "18:00", templateType: "comprehensive", customTemplate: "" },
                      { time: "21:00", templateType: "urgent", customTemplate: "" }
                    ]);

                    const totalCount = allSlots.length;
                    const sentCount = allSlots.filter(s => s.completed || s.lastStatus === "success").length;
                    const failedCount = allSlots.filter(s => s.failed || s.lastStatus === "failed").length;
                    const pendingCount = totalCount - sentCount - failedCount;

                    const filteredSlotsWithIndex = allSlots.map((slot, origIdx) => ({ slot, origIdx })).filter(({ slot }) => {
                      const isSent = slot.completed || slot.lastStatus === "success";
                      const isFailed = slot.failed || slot.lastStatus === "failed";
                      const isPending = !isSent && !isFailed;

                      if (slotStatusFilter === "pending" && !isPending) return false;
                      if (slotStatusFilter === "success" && !isSent) return false;
                      if (slotStatusFilter === "failed" && !isFailed) return false;

                      if (slotTemplateFilter !== "all" && slot.templateType !== slotTemplateFilter) return false;

                      if (slotSearchQuery.trim()) {
                        const q = slotSearchQuery.toLowerCase().trim();
                        const time12 = formatTime12h(slot.time).toLowerCase();
                        const time24 = (slot.time || "").toLowerCase();
                        const tpl = (slot.templateType || "").toLowerCase();
                        const custom = (slot.customTemplate || "").toLowerCase();
                        if (!time12.includes(q) && !time24.includes(q) && !tpl.includes(q) && !custom.includes(q)) {
                          return false;
                        }
                      }
                      return true;
                    });

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem" }}>
                        {/* ── Toolbar: Status Chips, Template Selector, Search, Sort ── */}
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.65rem",
                          flexWrap: "wrap",
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          padding: "0.6rem 0.85rem",
                          borderRadius: 12,
                        }}>
                          {/* Status Filter Chips */}
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
                            {[
                              { id: "all", label: `All (${totalCount})`, color: "#a5b4fc" },
                              { id: "pending", label: `⏳ Pending (${pendingCount})`, color: "#94a3b8" },
                              { id: "success", label: `✅ Sent (${sentCount})`, color: "#4ade80" },
                              { id: "failed", label: `❌ Failed (${failedCount})`, color: "#f87171" },
                            ].map(chip => {
                              const active = slotStatusFilter === chip.id;
                              return (
                                <button
                                  key={chip.id}
                                  type="button"
                                  onClick={() => setSlotStatusFilter(chip.id)}
                                  style={{
                                    padding: "0.3rem 0.65rem",
                                    borderRadius: 8,
                                    fontSize: "0.76rem",
                                    fontWeight: 700,
                                    background: active ? "rgba(124, 111, 255, 0.25)" : "rgba(255, 255, 255, 0.04)",
                                    border: active ? "1px solid #7c6fff" : "1px solid rgba(255, 255, 255, 0.08)",
                                    color: active ? "#fff" : chip.color,
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                    boxShadow: active ? "0 0 10px rgba(124, 111, 255, 0.3)" : "none",
                                  }}
                                >
                                  {chip.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Filters & Actions */}
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                            {/* Template Type Dropdown Filter */}
                            <select
                              value={slotTemplateFilter}
                              onChange={e => setSlotTemplateFilter(e.target.value)}
                              style={{
                                background: "#0d0a1a",
                                color: "#e2e8f0",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                borderRadius: 8,
                                padding: "0.32rem 0.65rem",
                                fontSize: "0.76rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              <option value="all">📁 All Templates</option>
                              <option value="comprehensive">📊 Comprehensive</option>
                              <option value="urgent">⚡ Urgent Final Call</option>
                              <option value="motivation">🌟 Motivation &amp; Streaks</option>
                              <option value="custom">✏️ Custom Template</option>
                            </select>

                            {/* Search Box */}
                            <div style={{ position: "relative" }}>
                              <input
                                type="text"
                                placeholder="🔍 Search slot time..."
                                value={slotSearchQuery}
                                onChange={e => setSlotSearchQuery(e.target.value)}
                                style={{
                                  background: "#0d0a1a",
                                  color: "#e2e8f0",
                                  border: "1px solid rgba(255, 255, 255, 0.12)",
                                  borderRadius: 8,
                                  padding: "0.32rem 0.65rem",
                                  fontSize: "0.76rem",
                                  width: 155,
                                }}
                              />
                              {slotSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setSlotSearchQuery("")}
                                  style={{
                                    position: "absolute",
                                    right: 6,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none",
                                    border: "none",
                                    color: "var(--muted)",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                    padding: 2,
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>

                            {/* Sort Buttons: Ascending & Descending */}
                            <div style={{
                              display: "inline-flex",
                              alignItems: "center",
                              borderRadius: 8,
                              background: "rgba(255, 255, 255, 0.04)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              padding: 2,
                              gap: 2,
                            }}>
                              <button
                                type="button"
                                onClick={() => handleSortSlots("asc")}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  background: slotSortOrder === "asc" ? "rgba(124, 111, 255, 0.35)" : "transparent",
                                  border: "none",
                                  color: slotSortOrder === "asc" ? "#fff" : "var(--muted)",
                                  borderRadius: 6,
                                  padding: "0.28rem 0.6rem",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                  boxShadow: slotSortOrder === "asc" ? "0 0 8px rgba(124, 111, 255, 0.3)" : "none",
                                }}
                                title="Sort Ascending: Morning to Night (AM ➔ PM)"
                              >
                                <span>↑</span> Ascending
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSortSlots("desc")}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  background: slotSortOrder === "desc" ? "rgba(124, 111, 255, 0.35)" : "transparent",
                                  border: "none",
                                  color: slotSortOrder === "desc" ? "#fff" : "var(--muted)",
                                  borderRadius: 6,
                                  padding: "0.28rem 0.6rem",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                  boxShadow: slotSortOrder === "desc" ? "0 0 8px rgba(124, 111, 255, 0.3)" : "none",
                                }}
                                title="Sort Descending: Night to Morning (PM ➔ AM)"
                              >
                                <span>↓</span> Descending
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* ── Empty Filtered Results State ── */}
                        {filteredSlotsWithIndex.length === 0 ? (
                          <div style={{
                            textAlign: "center",
                            padding: "2rem 1rem",
                            borderRadius: 12,
                            background: "rgba(255, 255, 255, 0.02)",
                            border: "1px dashed rgba(255, 255, 255, 0.1)",
                          }}>
                            <div style={{ fontSize: "1.8rem", marginBottom: "0.4rem" }}>🔍</div>
                            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#e2e8f0", marginBottom: "0.2rem" }}>
                              No Matching Time Slots Found
                            </div>
                            <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0 0 0.85rem" }}>
                              No auto-send slots match your current filter settings.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setSlotStatusFilter("all");
                                setSlotTemplateFilter("all");
                                setSlotSearchQuery("");
                              }}
                              style={{
                                padding: "0.4rem 0.85rem",
                                borderRadius: 8,
                                background: "rgba(124, 111, 255, 0.2)",
                                border: "1px solid rgba(124, 111, 255, 0.4)",
                                color: "#fff",
                                fontSize: "0.78rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              🔄 Reset Filters
                            </button>
                          </div>
                        ) : (
                          filteredSlotsWithIndex.map(({ slot, origIdx }) => {
                            const isSentToday = slot.completed || slot.lastStatus === "success";
                            const isFailedToday = slot.failed || slot.lastStatus === "failed";
                            const isPending = !isSentToday && !isFailedToday;
                            const isSendingThis = sendingSlotIndex === origIdx;

                            return (
                              <div
                                key={origIdx}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.75rem",
                                  padding: "0.75rem 0.9rem",
                                  borderRadius: 12,
                                  background: isFailedToday
                                    ? "rgba(239, 68, 68, 0.04)"
                                    : isSentToday
                                      ? "rgba(34, 197, 94, 0.03)"
                                      : "rgba(255, 255, 255, 0.02)",
                                  border: isFailedToday
                                    ? "1px solid rgba(239, 68, 68, 0.28)"
                                    : isSentToday
                                      ? "1px solid rgba(34, 197, 94, 0.2)"
                                      : "1px solid rgba(255, 255, 255, 0.07)",
                                  flexWrap: "wrap",
                                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                                  transition: "all 0.2s ease",
                                }}
                              >
                                {/* Slot Badge */}
                                <div style={{
                                  fontSize: "0.72rem",
                                  fontWeight: 800,
                                  color: "#a5b4fc",
                                  background: "rgba(99, 102, 241, 0.14)",
                                  border: "1px solid rgba(99, 102, 241, 0.25)",
                                  padding: "3px 8px",
                                  borderRadius: 8,
                                  flexShrink: 0,
                                }}>
                                  #{origIdx + 1}
                                </div>

                                {/* Time Picker */}
                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                                  <input
                                    type="time"
                                    value={slot.time || "18:00"}
                                    onChange={e => {
                                      const newTime = e.target.value;
                                      setSettings(s => {
                                        const list = [...(s.submissionReportSlots || [])];
                                        list[origIdx] = { ...list[origIdx], time: newTime };
                                        return { ...s, submissionReportSlots: list, submissionReportTimes: list.map(x => x.time) };
                                      });
                                    }}
                                    style={{
                                      background: "rgba(255, 255, 255, 0.04)",
                                      color: "#f8fafc",
                                      border: "1px solid rgba(255, 255, 255, 0.1)",
                                      padding: "0.45rem 0.65rem",
                                      borderRadius: 8,
                                      fontSize: "0.88rem",
                                      fontWeight: 700,
                                      outline: "none",
                                    }}
                                  />
                                </div>

                                {/* Custom Template Dropdown Popover */}
                                <TemplateDropdown
                                  value={slot.templateType || "comprehensive"}
                                  onChange={(newType) => {
                                    setSettings(s => {
                                      const list = [...(s.submissionReportSlots || [])];
                                      list[origIdx] = { ...list[origIdx], templateType: newType };
                                      return { ...s, submissionReportSlots: list };
                                    });
                                  }}
                                />

                                {/* Live Execution Status Badge with Hover Details */}
                                <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                                  {isSentToday ? (
                                    <div
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.35rem",
                                        padding: "0.38rem 0.65rem",
                                        borderRadius: 8,
                                        fontSize: "0.74rem",
                                        fontWeight: 700,
                                        background: "rgba(34, 197, 94, 0.12)",
                                        border: "1px solid rgba(34, 197, 94, 0.3)",
                                        color: "#4ade80",
                                      }}
                                      title={`Sent successfully to WhatsApp group today at ${formatTime12h(slot.lastSentTime || slot.time)}`}
                                    >
                                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
                                      <span>Sent {slot.lastSentTime ? `(${formatTime12h(slot.lastSentTime)})` : "Today"}</span>
                                    </div>
                                  ) : isFailedToday ? (
                                    <div
                                      style={{ position: "relative" }}
                                      onMouseEnter={() => setHoveredErrorIndex(origIdx)}
                                      onMouseLeave={() => setHoveredErrorIndex(null)}
                                    >
                                      <div style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.35rem",
                                        padding: "0.38rem 0.65rem",
                                        borderRadius: 8,
                                        fontSize: "0.74rem",
                                        fontWeight: 700,
                                        background: "rgba(239, 68, 68, 0.15)",
                                        border: "1px solid rgba(239, 68, 68, 0.4)",
                                        color: "#f87171",
                                        cursor: "help",
                                      }}>
                                        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 6px #f87171" }} />
                                        <span>Failed ⚠️</span>
                                      </div>

                                      {/* Floating Hover Tooltip with Full Failure Reason */}
                                      {hoveredErrorIndex === origIdx && (
                                        <div style={{
                                          position: "absolute",
                                          bottom: "calc(100% + 8px)",
                                          left: "50%",
                                          transform: "translateX(-50%)",
                                          background: "#18182f",
                                          border: "1px solid rgba(239, 68, 68, 0.4)",
                                          borderRadius: 10,
                                          padding: "0.6rem 0.85rem",
                                          minWidth: 230,
                                          maxWidth: 320,
                                          zIndex: 9999,
                                          boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
                                          pointerEvents: "none",
                                        }}>
                                          <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#fca5a5", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                            <span>❌ Auto-Send Failed</span>
                                          </div>
                                          <div style={{ fontSize: "0.74rem", color: "#e2e8f0", lineHeight: 1.4, wordBreak: "break-word" }}>
                                            {slot.lastError || "WhatsApp bot was not connected or group was unreachable."}
                                          </div>
                                          {slot.lastSentTime && (
                                            <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "0.35rem" }}>
                                              Attempted: {formatTime12h(slot.lastSentTime)}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "0.35rem",
                                      padding: "0.38rem 0.65rem",
                                      borderRadius: 8,
                                      fontSize: "0.74rem",
                                      fontWeight: 600,
                                      background: "rgba(148, 163, 184, 0.08)",
                                      border: "1px solid rgba(148, 163, 184, 0.18)",
                                      color: "#94a3b8",
                                    }}>
                                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#94a3b8" }} />
                                      <span>Pending</span>
                                    </div>
                                  )}
                                </div>

                                {/* Action Buttons: Instant Send/Retry, Edit, Delete */}
                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0, marginLeft: "auto" }}>
                                  {/* Instant Send / Retry Button */}
                                  <button
                                    type="button"
                                    disabled={isSendingThis}
                                    onClick={() => handleSendSlotNow(slot, origIdx)}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "0.35rem",
                                      background: isFailedToday
                                        ? "rgba(239, 68, 68, 0.18)"
                                        : isSentToday
                                          ? "rgba(34, 197, 94, 0.14)"
                                          : "rgba(168, 85, 247, 0.16)",
                                      border: isFailedToday
                                        ? "1px solid rgba(239, 68, 68, 0.45)"
                                        : isSentToday
                                          ? "1px solid rgba(34, 197, 94, 0.35)"
                                          : "1px solid rgba(168, 85, 247, 0.35)",
                                      color: isFailedToday
                                        ? "#fca5a5"
                                        : isSentToday
                                          ? "#86efac"
                                          : "#d8b4fe",
                                      borderRadius: 8,
                                      padding: "0.45rem 0.75rem",
                                      cursor: isSendingThis ? "not-allowed" : "pointer",
                                      fontSize: "0.78rem",
                                      fontWeight: 700,
                                      transition: "all 0.15s ease",
                                      opacity: isSendingThis ? 0.7 : 1,
                                    }}
                                    title={isFailedToday ? "Retry sending this message now" : "Send this slot message immediately"}
                                  >
                                    {isSendingThis ? (
                                      <>
                                        <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                        Sending...
                                      </>
                                    ) : isFailedToday ? (
                                      <>🔄 Retry Now</>
                                    ) : isSentToday ? (
                                      <>✓ Re-send</>
                                    ) : (
                                      <>⚡ Send Now</>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTemplateType(slot.templateType || "comprehensive");
                                      document.getElementById("submissionReportTemplateTextarea")?.focus();
                                    }}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "0.35rem",
                                      background: "rgba(99, 102, 241, 0.14)",
                                      border: "1px solid rgba(99, 102, 241, 0.28)",
                                      color: "#c4b5fd",
                                      borderRadius: 8,
                                      padding: "0.45rem 0.75rem",
                                      cursor: "pointer",
                                      fontSize: "0.78rem",
                                      fontWeight: 700,
                                      transition: "all 0.15s ease",
                                    }}
                                    title="Edit template text below"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                    </svg>
                                    Edit
                                  </button>

                                  {(settings.submissionReportSlots || []).length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSettings(s => {
                                          const list = (s.submissionReportSlots || []).filter((_, i) => i !== origIdx);
                                          const finalList = list.length > 0 ? list : [{ time: "18:00", templateType: "comprehensive", customTemplate: "" }];
                                          return {
                                            ...s,
                                            submissionReportSlots: finalList,
                                            submissionReportTimes: finalList.map(x => x.time),
                                          };
                                        });
                                      }}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: 30,
                                        height: 30,
                                        background: "rgba(239, 68, 68, 0.12)",
                                        border: "1px solid rgba(239, 68, 68, 0.25)",
                                        color: "#f87171",
                                        borderRadius: 8,
                                        cursor: "pointer",
                                        transition: "all 0.15s ease",
                                      }}
                                      title="Delete this time slot"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}

                  <button
                    type="button"
                    onClick={() => {
                      setSettings(s => {
                        const current = s.submissionReportSlots || [];
                        const last = current[current.length - 1] || { time: "18:00", templateType: "comprehensive" };
                        const [h, m] = (last.time || "18:00").split(":").map(Number);
                        const nextHour = String((h + 2) % 24).padStart(2, "0");
                        const nextTime = `${nextHour}:${String(m || 0).padStart(2, "0")}`;
                        const newSlot = { time: nextTime, templateType: "urgent", customTemplate: "" };
                        const updated = [...current, newSlot];
                        return {
                          ...s,
                          submissionReportSlots: updated,
                          submissionReportTimes: updated.map(x => x.time),
                        };
                      });
                    }}
                    style={{
                      width: "100%",
                      padding: "0.65rem",
                      borderRadius: 10,
                      border: "1px dashed rgba(99, 102, 241, 0.35)",
                      background: "rgba(99, 102, 241, 0.06)",
                      color: "#c4b5fd",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.45rem",
                      transition: "all 0.16s ease",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Another Auto-Send Time Slot
                  </button>

                  <div style={{
                    marginTop: "0.85rem",
                    padding: "0.6rem 0.85rem",
                    borderRadius: 8,
                    background: settings.submissionReportEnabled ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                    border: `1px solid ${settings.submissionReportEnabled ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                    fontSize: "0.78rem",
                    color: settings.submissionReportEnabled ? "#4ade80" : "#f87171",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "0.5rem"
                  }}>
                    <span>
                      {settings.submissionReportEnabled
                        ? "✅ Auto-sending is ACTIVE — each timer will send its assigned dynamic message format."
                        : "⚠️ Auto-sending is PAUSED — click the switch above to turn it ON, then click 'Save Schedule & Templates'."}
                    </span>
                  </div>
                </div>

                {/* ══════════════════════════════════════════════════════════════ */}
                {/* ADVANCED DYNAMIC MESSAGE TEMPLATE EDITOR & SELECTOR */}
                {/* ══════════════════════════════════════════════════════════════ */}
                <div style={{
                  padding: "1.25rem",
                  borderRadius: 14,
                  background: "rgba(124, 111, 255, 0.04)",
                  border: "1px solid rgba(124, 111, 255, 0.2)",
                  marginBottom: "1.5rem"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        📝 Customize Dynamic Message Templates
                      </div>
                      <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0.2rem 0 0" }}>
                        Select which message type you want to edit below. Each timer will broadcast its assigned template.
                      </p>
                    </div>

                    {/* Template Type Switcher Tabs */}
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {[
                        { id: "comprehensive", label: "📊 Comprehensive" },
                        { id: "urgent", label: "⚡ Urgent Final Call" },
                        { id: "motivation", label: "🌟 Motivation & Streaks" },
                        { id: "custom", label: "✏️ Custom" },
                      ].map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setEditingTemplateType(t.id)}
                          style={{
                            padding: "0.35rem 0.75rem",
                            borderRadius: 8,
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            border: editingTemplateType === t.id ? "1px solid #7c6fff" : "1px solid rgba(255, 255, 255, 0.12)",
                            background: editingTemplateType === t.id ? "rgba(124, 111, 255, 0.25)" : "rgba(255, 255, 255, 0.04)",
                            color: editingTemplateType === t.id ? "#fff" : "var(--muted)",
                            boxShadow: editingTemplateType === t.id ? "0 0 10px rgba(124, 111, 255, 0.35)" : "none",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        title="Reset currently active template to system default"
                        onClick={() => {
                          setSettings(s => {
                            const tpls = { ...(s.submissionReportTemplates || {}) };
                            delete tpls[editingTemplateType];
                            return { ...s, submissionReportTemplates: tpls };
                          });
                        }}
                        style={{
                          padding: "0.35rem 0.65rem",
                          borderRadius: 8,
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background: "rgba(255, 255, 255, 0.05)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "var(--muted)",
                          cursor: "pointer",
                        }}
                      >
                        🔄 Reset to Default
                      </button>
                    </div>
                  </div>

                  {/* Clickable Smart Variable Tags */}
                  <div style={{ marginBottom: "0.75rem" }}>
                    <div style={{ fontSize: "0.73rem", fontWeight: 700, color: "var(--muted)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      💡 Click to Insert Smart Variable into "{editingTemplateType}":
                    </div>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      {[
                        { tag: "{date}", label: "{date} (Today's Date)" },
                        { tag: "{time}", label: "{time} (Time Slot)" },
                        { tag: "{submitted_list}", label: "{submitted_list} (Completed List)" },
                        { tag: "{pending_list}", label: "{pending_list} (Pending List)" },
                        { tag: "{submitted_count}", label: "{submitted_count}" },
                        { tag: "{pending_count}", label: "{pending_count}" },
                        { tag: "{total_paid}", label: "{total_paid}" },
                        { tag: "{percent}", label: "{percent} (%)" },
                        { tag: "{progress_bar}", label: "{progress_bar} (Bar)" },
                        { tag: "{top_points_user}", label: "{top_points_user} (Top Scorer Today)" },
                        { tag: "{topic}", label: "{topic} (Topic)" },
                        { tag: "{app_url}", label: "{app_url} (Link)" },
                      ].map(({ tag, label }) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            const el = document.getElementById("submissionReportTemplateTextarea");
                            const currentTpl = settings.submissionReportTemplates?.[editingTemplateType] ?? DEFAULT_SUBMISSION_TEMPLATES[editingTemplateType] ?? "";
                            if (el) {
                              const start = el.selectionStart || 0;
                              const end = el.selectionEnd || 0;
                              const next = currentTpl.slice(0, start) + tag + currentTpl.slice(end);
                              setSettings(s => ({
                                ...s,
                                submissionReportTemplates: {
                                  ...(s.submissionReportTemplates || {}),
                                  [editingTemplateType]: next,
                                }
                              }));
                              setTimeout(() => {
                                el.focus();
                                el.setSelectionRange(start + tag.length, start + tag.length);
                              }, 50);
                            } else {
                              setSettings(s => ({
                                ...s,
                                submissionReportTemplates: {
                                  ...(s.submissionReportTemplates || {}),
                                  [editingTemplateType]: currentTpl + tag,
                                }
                              }));
                            }
                          }}
                          style={{
                            padding: "0.25rem 0.55rem",
                            borderRadius: 6,
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background: "rgba(56, 189, 248, 0.1)",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                            color: "#38bdf8",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Grid: Editor + Live WhatsApp Simulation Preview */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
                    {/* Textarea Editor */}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                        <label className="form-label" style={{ fontSize: "0.76rem", margin: 0, textTransform: "capitalize" }}>
                          ✏️ Editing "{editingTemplateType}" Template:
                        </label>
                        <span style={{ fontSize: "0.7rem", color: settings.submissionReportTemplates?.[editingTemplateType] ? "#c084fc" : "var(--muted)" }}>
                          {settings.submissionReportTemplates?.[editingTemplateType] ? "Customized for this type" : "Using Default"}
                        </span>
                      </div>
                      <textarea
                        id="submissionReportTemplateTextarea"
                        className="form-input"
                        rows={12}
                        value={settings.submissionReportTemplates?.[editingTemplateType] ?? DEFAULT_SUBMISSION_TEMPLATES[editingTemplateType] ?? ""}
                        onChange={e => {
                          const val = e.target.value;
                          setSettings(s => ({
                            ...s,
                            submissionReportTemplates: {
                              ...(s.submissionReportTemplates || {}),
                              [editingTemplateType]: val,
                            }
                          }));
                        }}
                        style={{
                          width: "100%",
                          fontFamily: "Consolas, Monaco, monospace",
                          fontSize: "0.82rem",
                          lineHeight: 1.5,
                          padding: "0.75rem",
                          resize: "vertical",
                          borderRadius: 10,
                          background: "#0d0a1a",
                        }}
                      />
                    </div>

                    {/* Live WhatsApp Simulation Bubble */}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <label className="form-label" style={{ fontSize: "0.76rem", margin: 0, color: "#4ade80", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", display: "inline-block", animation: "pulse-live 2s infinite" }} />
                          Live Preview · {editingTemplateType}
                        </label>
                        <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>📊 Simulated data</span>
                      </div>
                      <div className="wa-bubble-wrap">
                        <div className="wa-bubble">
                          {(() => {
                            const tpl = settings.submissionReportTemplates?.[editingTemplateType] ?? DEFAULT_SUBMISSION_TEMPLATES[editingTemplateType] ?? DEFAULT_SUBMISSION_TEMPLATES.comprehensive;
                            const summary = waStatus?.submissionSummary || {};
                            const submittedNames = summary.submittedNames || ["John Doe", "Alex Smith"];
                            const pendingNames = summary.pendingNames || ["Priya Sharma", "Rahul Kumar", "Sarah Lee"];
                            const total = summary.totalPaid || 12;
                            const subCount = summary.submittedCount || 1;
                            const pendCount = summary.pendingCount || 11;
                            const pct = total > 0 ? Math.round((subCount / total) * 100) : 8;
                            const filled = Math.min(10, Math.max(0, Math.round(pct / 10)));
                            const bar = "[" + "█".repeat(filled) + "░".repeat(10 - filled) + "]";
                            const subList = submittedNames.length > 0 ? submittedNames.map((n, i) => `${i + 1}. ${n} 🔥 5d streak`).join("\n") : "_No submissions yet today._";
                            const pendList = pendingNames.length > 0 ? pendingNames.map((n, i) => `${i + 1}. ${n}`).join("\n") : "🎉 _All paid students have completed!_ 🌟";
                            const now = new Date();
                            const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
                            const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
                            return tpl
                              .replace(/\{date\}/gi, dateStr)
                              .replace(/\{time\}/gi, timeStr)
                              .replace(/\{submitted_list\}/gi, subList)
                              .replace(/\{pending_list\}/gi, pendList)
                              .replace(/\{submitted_count\}/gi, String(subCount))
                              .replace(/\{pending_count\}/gi, String(pendCount))
                              .replace(/\{total_paid\}/gi, String(total))
                              .replace(/\{percent\}/gi, `${pct}%`)
                              .replace(/\{progress_bar\}/gi, bar)
                              .replace(/\{topic\}/gi, dash?.today?.topic || "Speaking Practice")
                              .replace(/\{app_url\}/gi, window.location.origin || "https://speak-shine.sidhartht.online")
                              .replace(/\{top_points_user\}/gi, "John Doe (95 pts 🌟)")
                              .replace(/\{top_streak_user\}/gi, "John Doe (95 pts 🌟)");
                          })()}
                          <div className="wa-bubble-time">
                            {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                            <svg width="14" height="10" viewBox="0 0 14 10" fill="#53bdeb"><path d="M1 5l3 3L10 1"/><path d="M5 5l3 3 5-7" opacity="0.6"/></svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Personal WhatsApp Notifications & Deployment Alerts Card ── */}
                <div style={{
                  padding: "1.25rem 1.4rem",
                  borderRadius: 14,
                  background: "linear-gradient(135deg, rgba(99, 102, 241, 0.06), rgba(168, 85, 247, 0.04))",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  marginBottom: "1.5rem",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.75rem" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "0.98rem", color: "#fff", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                        🚀 Personal WhatsApp Deployment &amp; Crash Alerts
                      </div>
                      <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0.2rem 0 0" }}>
                        Automatically receive a private WhatsApp notification on your personal phone whenever a deployment succeeds or if a server boot error occurs.
                      </p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        type="checkbox"
                        id="deploymentNotifyToggle"
                        checked={settings.deploymentNotifyEnabled !== false}
                        onChange={e => setSettings(s => ({ ...s, deploymentNotifyEnabled: e.target.checked }))}
                        style={{ cursor: "pointer", width: 18, height: 18, accentColor: "#7c6fff" }}
                      />
                      <label htmlFor="deploymentNotifyToggle" style={{ fontSize: "0.82rem", fontWeight: 700, color: settings.deploymentNotifyEnabled !== false ? "#4ade80" : "var(--muted)", cursor: "pointer", margin: 0 }}>
                        {settings.deploymentNotifyEnabled !== false ? "🟢 Alerts Active" : "⚪ Alerts Disabled"}
                      </label>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <label className="form-label" style={{ fontSize: "0.75rem", marginBottom: "0.3rem" }}>
                        📱 Your Personal WhatsApp Number (with Country Code)
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 919048336746 (or +91 90483 36746)"
                        value={settings.adminNotifyPhone || ""}
                        onChange={e => setSettings(s => ({ ...s, adminNotifyPhone: e.target.value }))}
                        style={{
                          width: "100%",
                          fontSize: "0.88rem",
                          fontWeight: 600,
                          background: "#0d0a1a",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          padding: "0.55rem 0.85rem",
                          borderRadius: 9,
                        }}
                      />
                    </div>

                    <div style={{ marginTop: "1.45rem" }}>
                      <button
                        type="button"
                        disabled={testAlertLoading}
                        onClick={handleSendTestAdminAlert}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          background: "rgba(168, 85, 247, 0.16)",
                          border: "1px solid rgba(168, 85, 247, 0.4)",
                          color: "#d8b4fe",
                          borderRadius: 9,
                          padding: "0.55rem 1rem",
                          cursor: testAlertLoading ? "not-allowed" : "pointer",
                          fontSize: "0.84rem",
                          fontWeight: 700,
                          transition: "all 0.15s ease",
                        }}
                        title="Send a sample deployment success message to your WhatsApp right now"
                      >
                        {testAlertLoading ? "⏳ Sending Test..." : "⚡ Send Test Alert to My WhatsApp"}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                  <button type="submit" className="btn-primary" disabled={savingSection !== null} style={{ padding: "0.75rem 1.75rem", fontSize: "0.95rem" }}>
                    {savingSection === "schedule" ? "Saving Schedules…" : "💾 Save Schedule & Templates"}
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    style={{
                      padding: "0.75rem 1.25rem",
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      border: "1px solid rgba(124, 111, 255, 0.4)",
                      background: "rgba(124, 111, 255, 0.12)",
                      color: "#c084fc",
                      cursor: "pointer",
                    }}
                    disabled={!waStatus?.isConnected || waSendingReport}
                    onClick={handleSendSubmissionReportToGroup}
                  >
                    {waSendingReport ? "⏳ Sending Report..." : "⚡ Send Test Report to Group Now"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* SECTION 2: DURATION SCORING SETTINGS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {settingsSubTab === "duration" && (
            <div className="card" style={{ margin: 0, padding: "1.5rem", borderRadius: 16 }}>
              <div style={{ marginBottom: "1.25rem" }}>
                <div className="section-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                  ⏱️ Duration Targets &amp; Video Limits
                </div>
                <p style={{ color: "var(--muted)", fontSize: "0.83rem", margin: "0.25rem 0 0" }}>
                  Configure recording duration targets in seconds. Students earn full duration score when reaching "Full Score Target" and can record up to "Max Limit".
                </p>
              </div>

              <form onSubmit={e => saveSettings(e, "duration")}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                  
                  {[
                    { id: "default", icon: "📅", title: "Default Daily Questions", full: "durationDefaultFull", max: "durationDefaultMax", color: "#7c6fff" },
                    { id: "story", icon: "📚", title: "Story Summary Day", full: "durationStoryFull", max: "durationStoryMax", color: "#a78bfa" },
                    { id: "weekly", icon: "🔍", title: "Weekly Reflection Day", full: "durationWeeklyFull", max: "durationWeeklyMax", color: "#4ade80" },
                    { id: "monthly", icon: "💬", title: "Monthly Reflection Day", full: "durationMonthlyReflectionFull", max: "durationMonthlyReflectionMax", color: "#60a5fa" },
                    { id: "goals", icon: "🎯", title: "Monthly Goals Day", full: "durationMonthlyGoalsFull", max: "durationMonthlyGoalsMax", color: "#f472b6" },
                    { id: "picture", icon: "🖼️", title: "Picture Description Day", full: "durationPictureFull", max: "durationPictureMax", color: "#38bdf8" },
                  ].map(item => (
                    <div
                      key={item.id}
                      style={{
                        padding: "1rem 1.15rem",
                        borderRadius: 12,
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, fontSize: "0.88rem", color: item.color }}>
                        <span>{item.icon}</span> {item.title}
                      </div>

                      <div style={{ display: "flex", gap: "0.75rem" }}>
                        <div style={{ flex: 1 }}>
                          <label className="form-label" style={{ fontSize: "0.73rem", marginBottom: "0.2rem" }}>
                            Full Score (sec)
                          </label>
                          <input
                            className="form-input"
                            type="number"
                            min={60} max={1200}
                            value={settings[item.full]}
                            onChange={e => setSettings(s => ({ ...s, [item.full]: parseInt(e.target.value) || 60 }))}
                            required
                            style={{ textAlign: "center", padding: "0.4rem", fontSize: "0.95rem" }}
                          />
                          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.25rem", textAlign: "center" }}>
                            ≈ {Math.round((settings[item.full] || 60) / 60)} min
                          </div>
                        </div>

                        <div style={{ flex: 1 }}>
                          <label className="form-label" style={{ fontSize: "0.73rem", marginBottom: "0.2rem" }}>
                            Max Allowed (sec)
                          </label>
                          <input
                            className="form-input"
                            type="number"
                            min={60} max={1200}
                            value={settings[item.max]}
                            onChange={e => setSettings(s => ({ ...s, [item.max]: parseInt(e.target.value) || 60 }))}
                            required
                            style={{ textAlign: "center", padding: "0.4rem", fontSize: "0.95rem" }}
                          />
                          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.25rem", textAlign: "center" }}>
                            ≈ {Math.round((settings[item.max] || 60) / 60)} min
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                </div>

                <button type="submit" className="btn-primary" disabled={savingSection !== null} style={{ padding: "0.75rem 1.75rem", fontSize: "0.95rem" }}>
                  {savingSection === "duration" ? "Saving Durations…" : "💾 Save Duration Settings"}
                </button>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* SECTION 3: VOCABULARY & CONTENT SETTINGS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {settingsSubTab === "vocab" && (
            <div className="card" style={{ margin: 0, padding: "1.5rem", borderRadius: 16 }}>
              <div style={{ marginBottom: "1.25rem" }}>
                <div className="section-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                  📚 Vocabulary &amp; Content Rules
                </div>
                <p style={{ color: "var(--muted)", fontSize: "0.83rem", margin: "0.25rem 0 0" }}>
                  Set daily vocabulary targets, CEFR levels, audio story length, and special challenge day schedules.
                </p>
              </div>

              <form onSubmit={e => saveSettings(e, "vocab")}>
                
                {/* Vocabulary Word Count Targets Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
                  {[
                    { key: "Normal", label: "🗣️ Normal Daily Topics", words: "vocabNormalWordCount", required: "vocabNormalRequiredCount" },
                    { key: "Story", label: "📖 Story Summary Day", words: "vocabStoryWordCount", required: "vocabStoryRequiredCount" },
                    { key: "Picture", label: "🖼️ Picture Description Day", words: "vocabPictureWordCount", required: "vocabPictureRequiredCount" },
                  ].map(({ key, label, words, required }) => (
                    <div key={key} style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-secondary)" }}>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.6rem" }}>{label}</div>
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.74rem", color: "var(--muted)", display: "block", marginBottom: "0.2rem" }}>Shown</label>
                          <input className="form-input" type="number" min={1} max={10} value={settings[words]}
                            onChange={e => setSettings(s => ({ ...s, [words]: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)), [required]: Math.min(s[required], parseInt(e.target.value) || 1) }))}
                            required style={{ textAlign: "center", padding: "0.35rem" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.74rem", color: "var(--muted)", display: "block", marginBottom: "0.2rem" }}>Required</label>
                          <input className="form-input" type="number" min={1} max={settings[words]} value={settings[required]}
                            onChange={e => setSettings(s => ({ ...s, [required]: Math.max(1, Math.min(s[words], parseInt(e.target.value) || 1)) }))}
                            required style={{ textAlign: "center", padding: "0.35rem" }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CEFR Level Selector */}
                <div style={{ padding: "1.1rem 1.25rem", borderRadius: 12, background: "var(--bg-secondary)", border: "1px solid var(--border)", marginBottom: "1.25rem" }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    📊 CEFR Vocabulary Difficulty Level
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                    {["A1","A2","B1","B2","C1","C2"].map(l => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setSettings(s => ({ ...s, vocabLevel: l }))}
                        style={{
                          padding: "0.4rem 0.95rem",
                          borderRadius: 20,
                          fontSize: "0.84rem",
                          fontWeight: 700,
                          border: settings.vocabLevel === l ? "2px solid #7c6fff" : "1px solid var(--border)",
                          background: settings.vocabLevel === l ? "rgba(124,111,255,0.22)" : "rgba(255,255,255,0.04)",
                          color: settings.vocabLevel === l ? "#c084fc" : "var(--muted)",
                          cursor: "pointer",
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                    {settings.vocabLevel === "A1" && "A1: Beginner — very basic everyday words"}
                    {settings.vocabLevel === "A2" && "A2: Elementary — simple practical vocabulary"}
                    {settings.vocabLevel === "B1" && "B1: Intermediate — common useful conversational words"}
                    {settings.vocabLevel === "B2" && "B2: Upper-Intermediate — rich, professional words (Recommended)"}
                    {settings.vocabLevel === "C1" && "C1: Advanced — sophisticated fluent-speaker expressions"}
                    {settings.vocabLevel === "C2" && "C2: Proficient — complex academic & literary vocabulary"}
                  </div>
                </div>

                {/* Story Settings Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
                  
                  {/* Story Audio Length */}
                  <div style={{ padding: "1rem 1.15rem", borderRadius: 12, background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: "0.86rem", marginBottom: "0.35rem" }}>
                      🎧 Story Audio Word Count
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.3rem" }}>
                      <input
                        className="form-input"
                        type="number"
                        min={100} max={400} step={10}
                        value={settings.storyWordCount}
                        onChange={e => setSettings(s => ({ ...s, storyWordCount: parseInt(e.target.value) || 200 }))}
                        style={{ width: 90, textAlign: "center" }}
                      />
                      <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                        words &nbsp;·&nbsp; ≈ <strong style={{ color: "var(--accent)" }}>{Math.round(settings.storyWordCount / 130 * 60)}s</strong> audio
                      </span>
                    </div>
                  </div>

                  {/* Story Difficulty */}
                  <div style={{ padding: "1rem 1.15rem", borderRadius: 12, background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: "0.86rem", marginBottom: "0.35rem" }}>
                      🎓 Story Difficulty Level
                    </label>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {["A2","B1","B2","C1"].map(l => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setSettings(s => ({ ...s, storyLevel: l }))}
                          style={{
                            padding: "0.35rem 0.75rem",
                            borderRadius: 16,
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            border: settings.storyLevel === l ? "2px solid #7c6fff" : "1px solid var(--border)",
                            background: settings.storyLevel === l ? "rgba(124,111,255,0.2)" : "rgba(255,255,255,0.03)",
                            color: settings.storyLevel === l ? "#c084fc" : "var(--muted)",
                            cursor: "pointer",
                          }}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Day of Week Selectors */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                  
                  {/* Story Summary Days (Multi-select) */}
                  <div style={{ padding: "1rem 1.15rem", borderRadius: 12, background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: "0.86rem", margin: 0 }}>
                        📅 Story Summary Days
                      </label>
                      <div style={{ display: "flex", gap: "0.3rem" }}>
                        <button
                          type="button"
                          onClick={() => setSettings(s => ({ ...s, storyDays: [0,1,2,3,4,5,6], storyDay: 0 }))}
                          style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "0.72rem", cursor: "pointer", padding: "0.1rem 0.3rem", fontWeight: 600 }}
                        >
                          All
                        </button>
                        <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>|</span>
                        <button
                          type="button"
                          onClick={() => setSettings(s => ({ ...s, storyDays: [0,6], storyDay: 0 }))}
                          style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "0.72rem", cursor: "pointer", padding: "0.1rem 0.3rem", fontWeight: 600 }}
                        >
                          Weekends
                        </button>
                        <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>|</span>
                        <button
                          type="button"
                          onClick={() => setSettings(s => ({ ...s, storyDays: [], storyDay: 6 }))}
                          style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "0.72rem", cursor: "pointer", padding: "0.1rem 0.3rem" }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <p style={{ fontSize: "0.74rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>
                      Select which days of the week to automatically generate and publish audio story summary challenges.
                    </p>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                      {[
                        { d: 0, label: "Sun" }, { d: 1, label: "Mon" }, { d: 2, label: "Tue" },
                        { d: 3, label: "Wed" }, { d: 4, label: "Thu" }, { d: 5, label: "Fri" }, { d: 6, label: "Sat" }
                      ].map(({ d, label }) => {
                        const currentDays = Array.isArray(settings.storyDays)
                          ? settings.storyDays
                          : (settings.storyDay !== undefined ? [settings.storyDay] : [6]);
                        const isSelected = currentDays.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              const updated = isSelected
                                ? currentDays.filter(day => day !== d)
                                : [...currentDays, d].sort((a, b) => a - b);
                              setSettings(s => ({ ...s, storyDays: updated, storyDay: updated[0] ?? 6 }));
                            }}
                            style={{
                              padding: "0.35rem 0.65rem", borderRadius: 14, fontSize: "0.78rem", fontWeight: 700,
                              border: isSelected ? "2px solid #7c6fff" : "1px solid var(--border)",
                              background: isSelected ? "rgba(124,111,255,0.22)" : "rgba(255,255,255,0.03)",
                              color: isSelected ? "#c084fc" : "var(--muted)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            {isSelected && <span style={{ fontSize: "0.7rem" }}>✓</span>}
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {(() => {
                      const currentDays = Array.isArray(settings.storyDays)
                        ? settings.storyDays
                        : (settings.storyDay !== undefined ? [settings.storyDay] : [6]);
                      const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                      return (
                        <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
                          Runs on: {currentDays.length > 0 ? (
                            <strong style={{ color: "var(--accent)" }}>
                              {currentDays.map(d => dayNames[d]).join(", ")}
                            </strong>
                          ) : (
                            <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Disabled (No days selected)</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Picture Description Days (Multi-select) */}
                  <div style={{ padding: "1rem 1.15rem", borderRadius: 12, background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: "0.86rem", margin: 0 }}>
                        🖼️ Picture Description Days
                      </label>
                      <div style={{ display: "flex", gap: "0.3rem" }}>
                        <button
                          type="button"
                          onClick={() => setSettings(s => ({ ...s, pictureDescriptionDays: [0,1,2,3,4,5,6], pictureDescriptionDay: 0 }))}
                          style={{ background: "none", border: "none", color: "#38bdf8", fontSize: "0.72rem", cursor: "pointer", padding: "0.1rem 0.3rem", fontWeight: 600 }}
                        >
                          All
                        </button>
                        <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>|</span>
                        <button
                          type="button"
                          onClick={() => setSettings(s => ({ ...s, pictureDescriptionDays: [1,2,3,4,5], pictureDescriptionDay: 1 }))}
                          style={{ background: "none", border: "none", color: "#38bdf8", fontSize: "0.72rem", cursor: "pointer", padding: "0.1rem 0.3rem", fontWeight: 600 }}
                        >
                          Weekdays
                        </button>
                        <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>|</span>
                        <button
                          type="button"
                          onClick={() => setSettings(s => ({ ...s, pictureDescriptionDays: [], pictureDescriptionDay: -1 }))}
                          style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "0.72rem", cursor: "pointer", padding: "0.1rem 0.3rem" }}
                        >
                          Clear / Off
                        </button>
                      </div>
                    </div>
                    <p style={{ fontSize: "0.74rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>
                      Select which days of the week to automatically generate and publish image description challenges.
                    </p>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                      {[
                        { d: 0, label: "Sun" }, { d: 1, label: "Mon" }, { d: 2, label: "Tue" },
                        { d: 3, label: "Wed" }, { d: 4, label: "Thu" }, { d: 5, label: "Fri" }, { d: 6, label: "Sat" }
                      ].map(({ d, label }) => {
                        const currentDays = Array.isArray(settings.pictureDescriptionDays)
                          ? settings.pictureDescriptionDays
                          : (settings.pictureDescriptionDay !== undefined && settings.pictureDescriptionDay !== -1 ? [settings.pictureDescriptionDay] : [4]);
                        const isSelected = currentDays.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              const updated = isSelected
                                ? currentDays.filter(day => day !== d)
                                : [...currentDays, d].sort((a, b) => a - b);
                              setSettings(s => ({ ...s, pictureDescriptionDays: updated, pictureDescriptionDay: updated[0] ?? -1 }));
                            }}
                            style={{
                              padding: "0.35rem 0.65rem", borderRadius: 14, fontSize: "0.78rem", fontWeight: 700,
                              border: isSelected ? "2px solid #38bdf8" : "1px solid var(--border)",
                              background: isSelected ? "rgba(56,189,248,0.22)" : "rgba(255,255,255,0.03)",
                              color: isSelected ? "#38bdf8" : "var(--muted)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            {isSelected && <span style={{ fontSize: "0.7rem" }}>✓</span>}
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {(() => {
                      const currentDays = Array.isArray(settings.pictureDescriptionDays)
                        ? settings.pictureDescriptionDays
                        : (settings.pictureDescriptionDay !== undefined && settings.pictureDescriptionDay !== -1 ? [settings.pictureDescriptionDay] : [4]);
                      const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
                      return (
                        <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
                          Runs on: {currentDays.length > 0 ? (
                            <strong style={{ color: "#38bdf8" }}>
                              {currentDays.map(d => dayNames[d]).join(", ")}
                            </strong>
                          ) : (
                            <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Disabled (No days selected)</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                </div>

                <button type="submit" className="btn-primary" disabled={savingSection !== null} style={{ padding: "0.75rem 1.75rem", fontSize: "0.95rem" }}>
                  {savingSection === "vocab" ? "Saving Vocabulary…" : "💾 Save Vocabulary & Content Settings"}
                </button>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* SECTION 4: PRICING & PRIVACY SETTINGS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {settingsSubTab === "pricing" && (
            <div className="card" style={{ margin: 0, padding: "1.5rem", borderRadius: 16 }}>
              <div style={{ marginBottom: "1.25rem" }}>
                <div className="section-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                  💳 Membership Pricing &amp; Video Privacy
                </div>
                <p style={{ color: "var(--muted)", fontSize: "0.83rem", margin: "0.25rem 0 0" }}>
                  Set the student membership fee charged via Razorpay and manage community video privacy settings.
                </p>
              </div>

              <form onSubmit={e => saveSettings(e, "payment")}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.25rem", marginBottom: "1.5rem" }}>
                  
                  {/* Membership Amount */}
                  <div style={{ padding: "1.25rem", borderRadius: 12, background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.3rem" }}>
                      💰 Premium Membership Fee (INR)
                    </label>
                    <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0 0 0.75rem" }}>
                      Amount shown on the payment wall and charged at checkout.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--accent)" }}>₹</span>
                      <input
                        className="form-input"
                        type="number"
                        min={1} max={100000} step="0.01"
                        value={settings.paymentAmount}
                        onChange={e => setSettings(s => ({ ...s, paymentAmount: e.target.value }))}
                        required
                        style={{ width: 140, fontSize: "1.1rem", fontWeight: 700 }}
                      />
                      <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>INR</span>
                    </div>
                  </div>

                  {/* Allow Private Videos Toggle */}
                  <div style={{ padding: "1.25rem", borderRadius: 12, background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.3rem" }}>
                      🔒 Community Video Privacy
                    </label>
                    <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0 0 0.75rem" }}>
                      Allow or disallow students from marking their submission videos private.
                    </p>
                    <div
                      onClick={() => setSettings(s => ({ ...s, allowPrivateVideos: !s.allowPrivateVideos }))}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.75rem",
                        cursor: "pointer", userSelect: "none",
                        background: settings.allowPrivateVideos ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                        border: `1px solid ${settings.allowPrivateVideos ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
                        borderRadius: 12, padding: "0.65rem 1rem",
                      }}
                    >
                      <div style={{
                        width: 12, height: 12, borderRadius: "50%",
                        background: settings.allowPrivateVideos ? "#4ade80" : "#f87171",
                        boxShadow: `0 0 8px ${settings.allowPrivateVideos ? "#4ade80" : "#f87171"}`,
                      }} />
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: settings.allowPrivateVideos ? "#4ade80" : "#f87171" }}>
                          {settings.allowPrivateVideos ? "Enabled — Students can set videos private" : "Disabled — All videos are forced public"}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                <button type="submit" className="btn-primary" disabled={savingSection !== null} style={{ padding: "0.75rem 1.75rem", fontSize: "0.95rem" }}>
                  {savingSection === "payment" ? "Saving Pricing…" : "💾 Save Pricing & Privacy"}
                </button>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* SECTION 5: SYSTEM RESETS & MAINTENANCE */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {settingsSubTab === "resets" && (
            <div className="card" style={{
              margin: 0, padding: "1.5rem", borderRadius: 16,
              background: "rgba(239, 68, 68, 0.03)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}>
              <div style={{ marginBottom: "1.25rem" }}>
                <div className="section-title" style={{ margin: 0, fontSize: "1.1rem", color: "#f87171" }}>
                  ⚠️ System Maintenance &amp; Reset Controls
                </div>
                <p style={{ color: "var(--muted)", fontSize: "0.83rem", margin: "0.25rem 0 0" }}>
                  Manually trigger system resets on-demand. Note: These actions are normally performed automatically at 12:00 AM midnight.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                {[
                  { label: "🌅 Reset Day", desc: "Clears today's submissions and questions for all students", key: "day", endpoint: "/users/reset/day" },
                  { label: "📅 Reset Weekly", desc: "Resets all weekly submission counters back to 0", key: "weekly", endpoint: "/users/reset/weekly" },
                  { label: "📆 Reset Monthly", desc: "Resets all monthly submission scores back to 0", key: "monthly", endpoint: "/users/reset/monthly" },
                ].map(({ label, desc, key, endpoint }) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      padding: "1rem 1.15rem",
                      background: "var(--bg-secondary)",
                      borderRadius: 12,
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#fff" }}>{label}</div>
                      <div style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: "0.25rem" }}>{desc}</div>
                    </div>
                    <button
                      className="btn-ghost danger"
                      style={{ fontSize: "0.84rem", fontWeight: 700, padding: "0.45rem", alignSelf: "flex-start", width: "100%" }}
                      disabled={resetting === key}
                      onClick={() => setModal({
                        type: "danger", title: label,
                        message: `${desc}. This cannot be undone. Are you sure?`,
                        confirmText: "Yes, Reset Now",
                        onConfirm: async () => {
                          setModal(null); setResetting(key);
                          try { await api.post(endpoint); msg(`${label} completed!`); reload(); }
                          catch(e) { msg(e?.response?.data?.error || "Failed", "danger"); }
                          finally { setResetting(""); }
                        },
                      })}
                    >
                      {resetting === key ? "Resetting…" : `Execute ${label}`}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* LIVE SESSIONS */}
      {tab==="live" && <LiveSessionsPanel />}

      {/* MANUAL QUESTIONS */}
      {tab==="manual-questions" && <ManualQuestionsPanel />}

      {/* STUDENT DETAIL */}
      {tab==="student-detail" && selectedStudent && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 1000, margin: "0 auto" }}>
          {/* Back Navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              onClick={() => setTab("users")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#c4b5fd",
                padding: "0.45rem 0.9rem",
                borderRadius: 10,
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Students Directory
            </button>

            <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
              Student ID: <span style={{ fontFamily: "monospace", color: "#a5b4fc" }}>{selectedStudent.userId || selectedStudent._id || selectedStudent.phone}</span>
            </span>
          </div>

          {/* Hero Student Profile Card */}
          <div
            className="card"
            style={{
              padding: "1.5rem",
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(15, 17, 30, 0.8) 100%)",
              border: "1px solid rgba(124, 111, 255, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1.25rem",
              borderRadius: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1.1rem" }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366f1, #a855f7)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  color: "#fff",
                  boxShadow: "0 0 20px rgba(99, 102, 241, 0.4)",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                {(selectedStudent.registeredName || selectedStudent.name || "?").slice(0, 2).toUpperCase()}
                <div
                  style={{
                    position: "absolute",
                    bottom: 2,
                    right: 2,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: selectedStudent.isActive ? "#4ade80" : "#f87171",
                    border: "2.5px solid #0f111e",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#f8fafc" }}>
                  {selectedStudent.registeredName || selectedStudent.name || "Student Profile"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
                  <div className="admin-user-phone-wrap">
                    <span className="admin-user-phone" style={{ fontSize: "0.85rem" }}>📱 {selectedStudent.phone}</span>
                    <button
                      className="copy-btn"
                      onClick={() => { navigator.clipboard?.writeText(selectedStudent.phone); msg("Phone copied!"); }}
                      title="Copy phone"
                    >
                      ⎘
                    </button>
                  </div>

                  <span style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: selectedStudent.role === "admin" || selectedStudent.role === "admins" ? "rgba(168, 85, 247, 0.18)" : selectedStudent.role === "trainer" ? "rgba(245, 158, 11, 0.18)" : "rgba(148, 163, 184, 0.18)",
                    color: selectedStudent.role === "admin" || selectedStudent.role === "admins" ? "#c4b5fd" : selectedStudent.role === "trainer" ? "#fbbf24" : "#cbd5e1",
                    border: "1px solid rgba(255,255,255,0.1)",
                    textTransform: "uppercase",
                  }}>
                    {selectedStudent.role || "user"}
                  </span>

                  <span style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: selectedStudent.paid ? "rgba(74, 222, 128, 0.15)" : "rgba(248, 113, 113, 0.15)",
                    color: selectedStudent.paid ? "#4ade80" : "#f87171",
                    border: `1px solid ${selectedStudent.paid ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
                  }}>
                    {selectedStudent.paid ? "💳 Paid Member" : "Free Tier"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Toggles */}
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
              <button
                className={`paid-toggle-btn ${selectedStudent.completed ? "paid" : "unpaid"}`}
                style={{ padding: "0.5rem 1rem", fontSize: "0.82rem" }}
                onClick={async () => {
                  try {
                    const res = await api.patch(`/users/${selectedStudent.phone}/toggle-submitted`);
                    setSelectedStudent(s => ({ ...s, completed: res.data.completed }));
                    setUsers(prev => prev.map(u => u.phone === selectedStudent.phone ? { ...u, completed: res.data.completed } : u));
                    msg(res.data.completed ? "Marked as submitted" : "Marked as pending");
                  } catch (e) { msg(e?.response?.data?.error || "Failed", "danger"); }
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: selectedStudent.completed ? "#4ade80" : "#f87171" }} />
                {selectedStudent.completed ? "✓ Submitted Today" : "⏳ Mark as Done"}
              </button>

              <button
                className={`paid-toggle-btn ${selectedStudent.paid ? "paid" : "unpaid"}`}
                style={{ padding: "0.5rem 1rem", fontSize: "0.82rem" }}
                onClick={async () => {
                  try {
                    const res = await api.patch(`/payments/admin/toggle-paid/${encodeURIComponent(selectedStudent.phone)}`);
                    setSelectedStudent(s => ({ ...s, paid: res.data.paid, paidAt: res.data.paidAt }));
                    setUsers(prev => prev.map(u => u.phone === selectedStudent.phone ? { ...u, paid: res.data.paid, paidAt: res.data.paidAt } : u));
                    msg(res.data.paid ? "Marked as Paid" : "Marked as Unpaid");
                  } catch (e) { msg(e?.response?.data?.error || "Failed", "danger"); }
                }}
              >
                {selectedStudent.paid ? "🟢 Paid Member" : "🔴 Unpaid"}
              </button>

              <button
                type="button"
                className="paid-toggle-btn"
                onClick={(e) => openAdminWalletModal(selectedStudent, e)}
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "0.82rem",
                  background: (selectedStudent.walletBalance || 0) > 0 ? "rgba(16, 185, 129, 0.18)" : "rgba(255, 255, 255, 0.05)",
                  border: (selectedStudent.walletBalance || 0) > 0 ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(255, 255, 255, 0.12)",
                  color: (selectedStudent.walletBalance || 0) > 0 ? "#4ade80" : "var(--muted)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontWeight: 700,
                }}
                title="Click to manage student wallet balance (Credit / Debit / View History)"
              >
                💰 Wallet ₹{selectedStudent.walletBalance || 0}
              </button>
            </div>
          </div>

          {/* Student KPI Row */}
          <div className="admin-kpi-row">
            <div className="admin-kpi-card" style={{ "--kpi-accent": "#f97316" }}>
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">CURRENT STREAK</span>
                <button
                  type="button"
                  onClick={() => openPointsModal(selectedStudent, "add", "streak")}
                  style={{
                    background: "rgba(249, 115, 22, 0.2)",
                    border: "1px solid rgba(249, 115, 22, 0.4)",
                    color: "#fdba74",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Add, deduct or set streak days"
                >
                  ⚙️ Adjust
                </button>
              </div>
              <div className="admin-kpi-value" style={{ color: "#f97316" }}>
                {selectedStudent.streak || 0} <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>days</span>
              </div>
              <div className="admin-kpi-sub">Best consecutive daily speaking</div>
            </div>

            <div className="admin-kpi-card" style={{ "--kpi-accent": "#38bdf8" }}>
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">STREAK FREEZES</span>
                <button
                  type="button"
                  onClick={() => openPointsModal(selectedStudent, "add", "freeze")}
                  style={{
                    background: "rgba(56, 189, 248, 0.2)",
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    color: "#7dd3fc",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Add or remove streak freeze shields"
                >
                  ⚙️ Adjust
                </button>
              </div>
              <div className="admin-kpi-value" style={{ color: "#38bdf8" }}>
                {selectedStudent.streakFreeze || 0} <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>shields</span>
              </div>
              <div className="admin-kpi-sub">Available freeze passes</div>
            </div>

            <div className="admin-kpi-card" style={{ "--kpi-accent": "#a78bfa" }}>
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">MONTHLY SCORE</span>
                <button
                  type="button"
                  onClick={() => openPointsModal(selectedStudent, "add", "points")}
                  style={{
                    background: "rgba(168, 85, 247, 0.2)",
                    border: "1px solid rgba(168, 85, 247, 0.4)",
                    color: "#d8b4fe",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Add, deduct or set monthly score"
                >
                  ⚙️ Adjust
                </button>
              </div>
              <div className="admin-kpi-value" style={{ color: "#c4b5fd" }}>
                {Math.round(selectedStudent.monthlyScore || 0).toLocaleString()} <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 600 }}>pts</span>
              </div>
              <div className="admin-kpi-sub">Accumulated points this month</div>
            </div>

            <div className="admin-kpi-card" style={{ "--kpi-accent": "#10b981" }}>
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">WALLET BALANCE</span>
                <button
                  type="button"
                  onClick={(e) => openAdminWalletModal(selectedStudent, e)}
                  style={{
                    background: "rgba(16, 185, 129, 0.2)",
                    border: "1px solid rgba(16, 185, 129, 0.4)",
                    color: "#6ee7b7",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Credit, debit, or set student wallet balance"
                >
                  ⚙️ Adjust
                </button>
              </div>
              <div className="admin-kpi-value" style={{ color: "#4ade80" }}>
                ₹{selectedStudent.walletBalance || 0}
              </div>
              <div className="admin-kpi-sub">Available store &amp; reward credit</div>
            </div>

            <div className="admin-kpi-card" style={{ "--kpi-accent": "#4ade80" }}>
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">WEEKLY COMPLETION</span>
                <span className="admin-kpi-trend up">📅 7-Day</span>
              </div>
              <div className="admin-kpi-value" style={{ color: "#4ade80" }}>
                {selectedStudent.weeklySubmissions || 0}/7
              </div>
              <div className="admin-kpi-sub">Target: 5+ sessions per week</div>
            </div>

            <div className="admin-kpi-card" style={{ "--kpi-accent": "#818cf8" }}>
              <div className="admin-kpi-top">
                <span className="admin-kpi-label">MONTHLY SUBMISSIONS</span>
                <span className="admin-kpi-trend up">📆 Total</span>
              </div>
              <div className="admin-kpi-value" style={{ color: "#a5b4fc" }}>
                {selectedStudent.monthlySubmissions || 0}
              </div>
              <div className="admin-kpi-sub">Verified video submissions</div>
            </div>
          </div>

          {/* Manage Submissions Controls */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#f8fafc", marginBottom: "0.25rem" }}>
              ⚡ Adjust Attendance &amp; Submission Counters
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "1rem" }}>
              Directly override weekly and monthly completion counts for this student.
            </div>
            <SubmissionControls 
              phone={selectedStudent.phone}
              weeklySubmissions={selectedStudent.weeklySubmissions || 0}
              monthlySubmissions={selectedStudent.monthlySubmissions || 0}
              onUpdate={handleSubmissionUpdate}
            />
          </div>

          {/* Student Profile Overview Card */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#f8fafc", marginBottom: "1rem" }}>
              📋 Student Account Details
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 10, padding: "0.85rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Full Name</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc", marginTop: "0.2rem" }}>
                  {selectedStudent.registeredName || selectedStudent.name || "—"}
                </div>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 10, padding: "0.85rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Phone Number</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc", marginTop: "0.2rem" }}>
                  {selectedStudent.phone}
                </div>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 10, padding: "0.85rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>System Role</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#f8fafc", marginTop: "0.2rem", textTransform: "capitalize" }}>
                  {selectedStudent.role || "user"}
                </div>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 10, padding: "0.85rem 1rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Account Status</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: selectedStudent.isActive ? "#4ade80" : "#f87171", marginTop: "0.2rem" }}>
                  {selectedStudent.isActive ? "🟢 Active & Enabled" : "🔴 Account Disabled"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </Layout>
  );
}

// ── Live Sessions Panel ───────────────────────────────────────────────────────
function LiveSessionsPanel() {
  const navigate = useNavigate();
  const confirm  = useConfirm();
  const [sessions, setSessions]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ title: "", scheduledAt: "", description: "", maxParticipants: 20 });
  const [saving, setSaving]         = useState(false);
  const [busy, setBusy]             = useState({});
  const [toast, setToast]           = useState(null);

  const notify = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try {
      const res = await api.get("/live-sessions");
      setSessions(res.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/live-sessions", form);
      setForm({ title: "", scheduledAt: "", description: "", maxParticipants: 20 });
      setShowForm(false);
      notify("Session scheduled!");
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to create session", "error");
    } finally { setSaving(false); }
  };

  const start = async (id) => {
    setBusy(b => ({ ...b, [id]: "starting" }));
    try { await api.post(`/live-sessions/${id}/start`); notify("Session is now LIVE! 🔴"); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed to start", "error"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const end = async (id) => {
    const ok = await confirm({ title: "End Session", message: "End this session for all participants?", confirmText: "End Session", type: "danger" });
    if (!ok) return;
    setBusy(b => ({ ...b, [id]: "ending" }));
    try { await api.post(`/live-sessions/${id}/end`); notify("Session ended."); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed to end", "error"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const cancel = async (id) => {
    const ok = await confirm({ title: "Cancel Session", message: "Cancel this scheduled session? This cannot be undone.", confirmText: "Yes, Cancel", type: "danger" });
    if (!ok) return;
    setBusy(b => ({ ...b, [id]: "cancelling" }));
    try { await api.delete(`/live-sessions/${id}`); notify("Session cancelled."); load(); }
    catch (err) { notify(err.response?.data?.error || "Failed to cancel", "error"); }
    finally { setBusy(b => ({ ...b, [id]: null })); }
  };

  const statusConfig = {
    scheduled: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)", label: "Scheduled", icon: "📅" },
    live:      { color: "#4ade80", bg: "rgba(74,222,128,0.1)", label: "🔴 Live",    icon: "🔴" },
    ended:     { color: "#6b7280", bg: "rgba(107,114,128,0.1)", label: "Ended",    icon: "✅" },
  };

  const liveSessions      = sessions.filter(s => s.status === "live");
  const scheduledSessions = sessions.filter(s => s.status === "scheduled");
  const endedSessions     = sessions.filter(s => s.status === "ended");

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "5rem", right: "1rem", zIndex: 9999,
          background: toast.type === "error" ? "#7f1d1d" : "#065f46",
          border: `1px solid ${toast.type === "error" ? "rgba(248,113,113,0.4)" : "rgba(74,222,128,0.4)"}`,
          color: "#fff", padding: "0.75rem 1.25rem", borderRadius: 12,
          fontSize: "0.9rem", fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          animation: "slideUpIn 0.3s ease",
        }}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>🎥 Live Sessions</h2>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            Schedule and manage live video sessions for your group
          </p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          style={{
            background: showForm ? "rgba(248,113,113,0.15)" : "linear-gradient(135deg,#7c6fff,#4f46e5)",
            border: showForm ? "1px solid rgba(248,113,113,0.3)" : "none",
            color: showForm ? "#f87171" : "#fff",
            borderRadius: 12, padding: "0.65rem 1.25rem",
            fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {showForm ? "✕ Cancel" : "+ Schedule Session"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{
          background: "linear-gradient(135deg, rgba(124,111,255,0.08), rgba(79,70,229,0.05))",
          border: "1px solid rgba(124,111,255,0.25)",
          borderRadius: 16, padding: "1.5rem", marginBottom: "1.5rem",
        }}>
          <div style={{ fontWeight: 700, marginBottom: "1rem", fontSize: "1rem" }}>📅 New Session</div>
          <form onSubmit={create}>
            <div className="grid-cols-2" style={{ marginBottom: "0.75rem" }}>
              <div>
                <label className="form-label">Session Title *</label>
                <input className="form-input" placeholder="e.g. Weekly Speaking Practice" required
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Date & Time *</label>
                <input className="form-input" type="datetime-local" required
                  value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label">Description (optional)</label>
              <input className="form-input" placeholder="What will be covered in this session…"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label">
                Max Participants
                <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                  (2–100, default 20)
                </span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <input
                  className="form-input"
                  type="number"
                  min={2} max={100}
                  style={{ width: 100 }}
                  value={form.maxParticipants}
                  onChange={e => setForm(f => ({ ...f, maxParticipants: Math.min(100, Math.max(2, parseInt(e.target.value) || 20)) }))}
                />
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {[5, 10, 20, 30, 50].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, maxParticipants: n }))}
                      style={{
                        padding: "0.25rem 0.6rem", borderRadius: 8, fontSize: "0.75rem",
                        border: form.maxParticipants === n ? "1px solid #7c6fff" : "1px solid var(--border)",
                        background: form.maxParticipants === n ? "rgba(124,111,255,0.2)" : "var(--bg-secondary)",
                        color: form.maxParticipants === n ? "#a78bfa" : "var(--muted)",
                        cursor: "pointer",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving} style={{ minWidth: 160 }}>
              {saving ? "Scheduling…" : "📅 Schedule Session"}
            </button>
          </form>
        </div>
      )}

      {loading && <div className="spinner-wrap"><div className="spinner" /></div>}

      {/* Live now */}
      {liveSessions.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            🔴 Live Now
          </div>
          {liveSessions.map(s => <SessionCard key={s._id} s={s} onStart={start} onEnd={end} busy={busy} navigate={navigate} />)}
        </div>
      )}

      {/* Scheduled */}
      {scheduledSessions.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            📅 Upcoming
          </div>
          {scheduledSessions.map(s => <SessionCard key={s._id} s={s} onStart={start} onEnd={end} onCancel={cancel} busy={busy} navigate={navigate} />)}
        </div>
      )}

      {/* Ended */}
      {endedSessions.length > 0 && (
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            ✅ Past Sessions
          </div>
          {endedSessions.slice(0, 5).map(s => <SessionCard key={s._id} s={s} onStart={start} onEnd={end} busy={busy} navigate={navigate} />)}
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎥</div>
          <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No sessions yet</div>
          <div style={{ fontSize: "0.85rem" }}>Click "+ Schedule Session" to create your first live session</div>
        </div>
      )}
    </div>
  );
}

function SessionCard({ s, onStart, onEnd, onCancel, busy, navigate }) {
  const isLive      = s.status === "live";
  const isScheduled = s.status === "scheduled";
  const isEnded     = s.status === "ended";

  const borderColor = isLive ? "rgba(74,222,128,0.4)" : isScheduled ? "rgba(96,165,250,0.25)" : "rgba(255,255,255,0.06)";
  const bgColor     = isLive ? "rgba(74,222,128,0.05)" : "var(--bg-secondary)";

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 14, padding: "1rem 1.25rem",
      marginBottom: "0.75rem",
      transition: "all 0.2s",
      position: "relative",
      overflow: "hidden",
    }}>
      {isLive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: "linear-gradient(90deg, #4ade80, #22c55e)",
          animation: "shimmer 2s linear infinite",
        }} />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>{s.title}</span>
            <span style={{
              fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem",
              borderRadius: 20, textTransform: "uppercase",
              background: isLive ? "rgba(74,222,128,0.15)" : isScheduled ? "rgba(96,165,250,0.15)" : "rgba(107,114,128,0.15)",
              color: isLive ? "#4ade80" : isScheduled ? "#60a5fa" : "#6b7280",
            }}>
              {isLive ? "🔴 Live" : isScheduled ? "Scheduled" : "Ended"}
            </span>
          </div>

          {s.description && (
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.4rem" }}>{s.description}</div>
          )}

          <div style={{ display: "flex", gap: "1rem", fontSize: "0.78rem", color: "var(--muted)", flexWrap: "wrap" }}>
            <span>📅 {new Date(s.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            {s.participantCount > 0 && (
              <span style={{ color: s.participantCount >= (s.maxParticipants || 20) ? "#f87171" : "var(--muted)" }}>
                👥 {s.participantCount}/{s.maxParticipants || 20}
                {s.participantCount >= (s.maxParticipants || 20) && " 🔴 Full"}
              </span>
            )}
            {s.participantCount === 0 && (
              <span>👥 0/{s.maxParticipants || 20} max</span>
            )}
            {s.durationMinutes && <span>⏱️ {s.durationMinutes} min</span>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center" }}>
          {isScheduled && (
            <button
              onClick={() => onStart(s._id)}
              disabled={busy[s._id] === "starting"}
              style={{
                background: "linear-gradient(135deg,#4ade80,#22c55e)",
                color: "#065f46", border: "none", borderRadius: 10,
                padding: "0.5rem 1rem", fontWeight: 700, fontSize: "0.82rem",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {busy[s._id] === "starting" ? "Starting…" : "🔴 Go Live"}
            </button>
          )}
          {isScheduled && onCancel && (
            <button
              onClick={() => onCancel(s._id)}
              disabled={busy[s._id] === "cancelling"}
              style={{
                background: "rgba(248,113,113,0.12)",
                border: "1px solid rgba(248,113,113,0.3)",
                color: "#f87171", borderRadius: 10,
                padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {busy[s._id] === "cancelling" ? "Cancelling…" : "✕ Cancel"}
            </button>
          )}
          {isLive && (
            <>
              <button
                onClick={() => window.open(`/live/${s._id}`, "_blank")}
                style={{
                  background: "linear-gradient(135deg,#7c6fff,#4f46e5)",
                  color: "#fff", border: "none", borderRadius: 10,
                  padding: "0.5rem 1rem", fontWeight: 700, fontSize: "0.82rem",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                📹 Join
              </button>
              <button
                onClick={() => onEnd(s._id)}
                disabled={busy[s._id] === "ending"}
                style={{
                  background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)",
                  color: "#f87171", borderRadius: 10,
                  padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {busy[s._id] === "ending" ? "Ending…" : "⏹ End"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Monitoring Panel ─────────────────────────────────────────────────────────
function MonitoringPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async () => {
    try {
      const res = await api.get("/monitoring");
      setData(res.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load monitoring data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="spinner-wrap"><div className="spinner"/><p style={{color:"var(--muted)"}}>Loading…</p></div>;
  if (error) return <div className="error-box"><p>{error}</p><button className="btn-primary" style={{marginTop:"0.75rem"}} onClick={load}>Retry</button></div>;
  if (!data) return null;

  const { system, videos, queue, api: apiStats, activeUsers } = data;
  const cpuColor = system.cpuPercent > 80 ? "#f87171" : system.cpuPercent > 60 ? "#fbbf24" : "#4ade80";
  const memColor = system.memPercent > 85 ? "#f87171" : system.memPercent > 65 ? "#fbbf24" : "#4ade80";
  const isIdle = videos.processing === 0 && videos.queued === 0;

  return (
    <div style={{display:"grid",gap:"1rem"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"0.5rem"}}>
        <div className="section-title" style={{margin:0}}>🖥️ System Monitor</div>
        <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:"#4ade80",display:"inline-block",boxShadow:"0 0 6px #4ade80"}}/>
            <span style={{color:"var(--muted)",fontSize:"0.78rem"}}>
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}` : "Live"}
            </span>
          </div>
          <button className="btn-secondary" style={{padding:"0.3rem 0.8rem",fontSize:"0.8rem"}} onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {/* Row 1: 3 stat tiles */}
      <div className="grid-cols-3">
        <MonStat icon="👥" label="Active Users" value={activeUsers} accent="#7c6fff" />
        <MonStat icon="✅" label="Done Today" value={videos.completedToday} accent="#4ade80" />
        <MonStat icon="❌" label="Failed Today" value={videos.failedToday} accent={videos.failedToday > 0 ? "#f87171" : "#4ade80"} />
      </div>

      {/* Row 2: 3 stat tiles */}
      <div className="grid-cols-3">
        <MonStat icon="🎬" label="Processing Now" value={isIdle ? "Idle" : `${videos.activeCount ?? videos.processing} / ${videos.maxConcurrent ?? queue?.maxConcurrent ?? 15}`} accent="#38bdf8" />
        <MonStat icon="⏱️" label="Avg Process Time" value={queue?.avgProcessingMin ? `${queue.avgProcessingMin} min` : "—"} accent="#fbbf24" />
        <MonStat icon="🌐" label="Avg API Response" value={apiStats.avgResponseMs ? `${apiStats.avgResponseMs}ms` : "—"} accent="#fb923c" />
      </div>

      {/* Server Resources */}
      <div className="card">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem"}}>
          <span style={{fontWeight:600,fontSize:"0.95rem"}}>💻 Server Resources</span>
          <span style={{color:"var(--muted)",fontSize:"0.78rem"}}>Uptime: {system.uptimeHours}h</span>
        </div>
        <div style={{display:"grid",gap:"1.1rem"}}>
          <ResourceBar label="CPU" value={system.cpuPercent} unit="%" color={cpuColor} />
          <ResourceBar
            label="Memory"
            value={system.memPercent}
            unit="%"
            color={memColor}
            sublabel={`${system.memUsedMB} MB / ${system.memTotalMB} MB`}
          />
        </div>
      </div>

      {/* Queue + Errors — errors full width when there are security events */}
      <div className="grid-cols-2">

        {/* Queue */}
        <div className="card">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
            <span style={{fontWeight:600,fontSize:"0.95rem"}}>🚦 Video Queue</span>
            <span style={{fontSize:"0.72rem",background:"rgba(124,111,255,0.15)",color:"#7c6fff",borderRadius:99,padding:"0.15rem 0.55rem",fontWeight:600}}>
              ⚡ {videos.maxConcurrent ?? queue?.maxConcurrent ?? 15} concurrent
            </span>
          </div>
          {isIdle ? (
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",color:"#4ade80",fontWeight:500,fontSize:"0.9rem"}}>
              <span style={{fontSize:"1.1rem"}}>✅</span> Queue empty — all slots free
            </div>
          ) : (
            <div style={{display:"grid",gap:"0.6rem",fontSize:"0.88rem"}}>
              <QueueRow
                label="Active now"
                value={`${videos.activeCount ?? (videos.activeJobId ? 1 : 0)} / ${videos.maxConcurrent ?? queue?.maxConcurrent ?? 15}`}
                valueColor="#fbbf24"
              />
              <QueueRow label="Waiting" value={`${videos.queued} video${videos.queued !== 1 ? "s" : ""}`} />
              <QueueRow label="Est. wait" value={queue?.avgProcessingMin ? `~${queue.avgProcessingMin} min` : "~2.5 min"} />
            </div>
          )}
          <div className="grid-cols-2" style={{marginTop:"1rem",paddingTop:"0.75rem",borderTop:"1px solid var(--border)",gap:"0.5rem",fontSize:"0.82rem",color:"var(--muted)"}}>
            <span>Total processed: <strong style={{color:"var(--text)"}}>{queue?.totalProcessed || 0}</strong></span>
            <span>Total failed: <strong style={{color: (queue?.totalFailed || 0) > 0 ? "#f87171" : "var(--text)"}}>{queue?.totalFailed || 0}</strong></span>
          </div>
        </div>

        {/* Errors */}
        <div className="card">
          <div style={{fontWeight:600,fontSize:"0.95rem",marginBottom:"1rem"}}>
            ⚠️ Errors Today
            {(queue?.errorsToday || 0) > 0 && (
              <span style={{marginLeft:"0.5rem",background:"rgba(248,113,113,0.15)",color:"#f87171",borderRadius:99,padding:"0.1rem 0.5rem",fontSize:"0.75rem"}}>
                {queue.errorsToday}
              </span>
            )}
          </div>
          {!queue?.recentErrors || queue.recentErrors.length === 0 ? (
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",color:"#4ade80",fontWeight:500,fontSize:"0.9rem"}}>
              <span style={{fontSize:"1.1rem"}}>✅</span> No errors today
            </div>
          ) : (
            <div style={{display:"grid",gap:"0.5rem",maxHeight:320,overflowY:"auto"}}>
              {(queue?.recentErrors || []).map((e, i) => (
                <div key={i} style={{
                  background: e.type?.includes("Virus") || e.type?.includes("Content") || e.type?.includes("Codec")
                    ? "rgba(251,146,60,0.07)" : "rgba(248,113,113,0.07)",
                  border: `1px solid ${e.type?.includes("Virus") || e.type?.includes("Content") || e.type?.includes("Codec")
                    ? "rgba(251,146,60,0.25)" : "rgba(248,113,113,0.18)"}`,
                  borderRadius: 10,
                  padding: "0.65rem 0.85rem",
                }}>
                  {/* Top row: type badge + time */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.35rem",gap:"0.5rem",flexWrap:"wrap"}}>
                    <span style={{
                      fontSize:"0.72rem", fontWeight:700, padding:"0.15rem 0.5rem",
                      borderRadius:99,
                      background: e.type?.includes("Virus") || e.type?.includes("Content") || e.type?.includes("Codec")
                        ? "rgba(251,146,60,0.18)" : "rgba(248,113,113,0.15)",
                      color: e.type?.includes("Virus") || e.type?.includes("Content") || e.type?.includes("Codec")
                        ? "#fb923c" : "#f87171",
                    }}>
                      {e.type || "⚙️ Processing"}
                    </span>
                    <span style={{color:"var(--muted)",fontSize:"0.72rem",whiteSpace:"nowrap"}}>
                      {new Date(e.at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
                    </span>
                  </div>
                  {/* User info */}
                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.3rem"}}>
                    <span style={{fontSize:"0.8rem",fontWeight:600,color:"var(--text)"}}>
                      👤 {e.userName || "Unknown"}
                    </span>
                    {e.phone && e.phone !== "—" && (
                      <span style={{fontSize:"0.75rem",color:"var(--muted)"}}>· {e.phone}</span>
                    )}
                  </div>
                  {/* Error message */}
                  <div style={{color:"var(--muted)",fontSize:"0.78rem",lineHeight:1.5}}>{e.error}</div>
                  {/* Report ID */}
                  <div style={{color:"rgba(255,255,255,0.2)",fontSize:"0.68rem",marginTop:"0.25rem"}}>
                    ID: {String(e.reportId).slice(-8)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────
function MonStat({ icon, label, value, accent }) {
  return (
    <div style={{
      background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,
      padding:"1rem",display:"flex",flexDirection:"column",gap:"0.35rem",
      borderTop:`3px solid ${accent}`,
    }}>
      <div style={{fontSize:"1.4rem",lineHeight:1}}>{icon}</div>
      <div style={{fontSize:"0.72rem",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600}}>{label}</div>
      <div style={{fontSize:"1.35rem",fontWeight:700,color:"var(--text)",lineHeight:1}}>{value}</div>
    </div>
  );
}

function ResourceBar({ label, value, unit, color, sublabel }) {
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"0.4rem"}}>
        <span style={{fontSize:"0.85rem",color:"var(--muted)"}}>{label}</span>
        <div style={{textAlign:"right"}}>
          <span style={{fontWeight:700,color,fontSize:"0.9rem"}}>{value}{unit}</span>
          {sublabel && <span style={{color:"var(--muted)",fontSize:"0.75rem",marginLeft:"0.4rem"}}>({sublabel})</span>}
        </div>
      </div>
      <div style={{background:"rgba(255,255,255,0.06)",borderRadius:99,height:8,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${Math.min(value,100)}%`,background:color,borderRadius:99,transition:"width 0.6s ease",boxShadow:`0 0 8px ${color}55`}}/>
      </div>
    </div>
  );
}

function QueueRow({ label, value, valueColor }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{color:"var(--muted)"}}>{label}</span>
      <span style={{fontWeight:600,color:valueColor||"var(--text)"}}>{value}</span>
    </div>
  );
}

// ── Manual Questions Panel ────────────────────────────────────────────────────
function ManualQuestionsPanel() {
  const [manualQuestions, setManualQuestions] = useState([]);
  const [templates, setTemplates] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [publishMode, setPublishMode] = useState("now"); // "now" | "schedule"
  const [form, setForm] = useState({
    setupType: "normal",
    scheduledFor: "",
    scheduledTime: "",
    category: "General",
    topic: "",
    question: "",
    audioUrl: "",
    storyTranscript: "",
    summaryGuide: "",
    imageUrl: "",
    imageSource: "",
    imagePageUrl: "",
    imagePhotographer: "",
    imagePhotographerUrl: "",
    imageInstructions: ""
  });
  const [saving, setSaving] = useState(false);
  const [generatingStory, setGeneratingStory] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [generatingPicture, setGeneratingPicture] = useState(false);
  const [busy, setBusy] = useState({});
  const [toast, setToast] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const notify = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const getCurrentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };

  const getNextMonthFirst = () => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return nextMonth.toISOString().split('T')[0];
  };

  const getNextMonthLast = () => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return nextMonth.toISOString().split('T')[0];
  };

  const getDefaultDate = (setupType, mode = publishMode) => {
    if (mode === "now") return getTodayDate();
    switch (setupType) {
      case "normal":
      case "regular":
      case "story_summary":
      case "picture_description":
        return getTodayDate();
      case "monthly_goals":
        return getNextMonthFirst();
      case "monthly_reflection":
        return getNextMonthLast();
      default:
        return getTodayDate();
    }
  };

  const handleGenerateStory = async () => {
    setGeneratingStory(true);
    try {
      const res = await api.post("/questions/generate-story");
      const { topic, story, summaryGuide, question } = res.data;
      setForm(f => ({
        ...f,
        topic,
        question,
        storyTranscript: story,
        summaryGuide: Array.isArray(summaryGuide) ? summaryGuide.join("\n") : summaryGuide || "",
      }));
      notify("Story generated! Review and add an audio URL before saving.");
    } catch (err) {
      notify(err.response?.data?.error || "Story generation failed", "error");
    } finally {
      setGeneratingStory(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!form.storyTranscript) {
      notify("Generate a story first — the transcript is needed for audio.", "error");
      return;
    }
    setGeneratingAudio(true);
    try {
      const res = await api.post("/questions/generate-story-audio", {
        storyText: form.storyTranscript,
        topic: form.topic || "story",
      });
      setForm(f => ({ ...f, audioUrl: res.data.audioUrl }));
      notify("Audio generated and uploaded! URL has been filled in.");
    } catch (err) {
      notify(err.response?.data?.error || "Audio generation failed", "error");
    } finally {
      setGeneratingAudio(false);
    }
  };

  const handleGeneratePicture = async () => {
    setGeneratingPicture(true);
    try {
      const res = await api.post("/questions/generate-picture");
      const { title, instructions, imageUrl, imageSource, imagePageUrl, imagePhotographer, imagePhotographerUrl, imageSearchQuery } = res.data;
      setForm(f => ({
        ...f,
        topic: title || f.topic,
        question: instructions || f.question,
        imageUrl: imageUrl || "",
        imageSource: imageSource || "",
        imagePageUrl: imagePageUrl || "",
        imagePhotographer: imagePhotographer || "",
        imagePhotographerUrl: imagePhotographerUrl || "",
        imageInstructions: instructions || "",
        category: "Picture Description",
      }));
      notify("Picture challenge generated! All fields have been filled in.");
    } catch (err) {
      notify(err.response?.data?.error || "Picture generation failed", "error");
    } finally {
      setGeneratingPicture(false);
    }
  };

  const load = async () => {
    try {
      const [questionsRes, templatesRes] = await Promise.all([
        api.get("/questions/manual?upcoming=true"),
        api.get("/questions/templates")
      ]);
      setManualQuestions(questionsRes.data);
      setTemplates(templatesRes.data);
    } catch (err) {
      notify(err.response?.data?.error || "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setPublishMode("now");
    setForm({
      setupType: "normal",
      scheduledFor: getTodayDate(),
      scheduledTime: getCurrentTime(),
      category: "General",
      topic: "",
      question: "",
      audioUrl: "",
      storyTranscript: "",
      summaryGuide: "",
      imageUrl: "",
      imageSource: "",
      imagePageUrl: "",
      imagePhotographer: "",
      imagePhotographerUrl: "",
      imageInstructions: ""
    });
    setSelectedTemplate("");
    setShowForm(false);
  };

  const handleEdit = (q) => {
    setEditingId(q._id);
    const isPastOrToday = q.scheduledFor && new Date(q.scheduledFor) <= new Date();
    setPublishMode(isPastOrToday ? "now" : "schedule");
    const dateStr = q.scheduledFor ? new Date(q.scheduledFor).toISOString().split("T")[0] : "";
    setForm({
      setupType: q.setupType || "normal",
      scheduledFor: dateStr,
      scheduledTime: q.scheduledTime || (q.scheduledFor ? new Date(q.scheduledFor).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""),
      category: q.category || "General",
      topic: q.topic || "",
      question: q.question || "",
      audioUrl: q.audioUrl || "",
      storyTranscript: q.storyTranscript || "",
      summaryGuide: q.summaryGuide || "",
      imageUrl: q.imageUrl || "",
      imageSource: q.imageSource || "",
      imagePageUrl: q.imagePageUrl || "",
      imagePhotographer: q.imagePhotographer || "",
      imagePhotographerUrl: q.imagePhotographerUrl || "",
      imageInstructions: q.imageInstructions || ""
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setupQuestion = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        publishNow: publishMode === "now",
        scheduledFor: publishMode === "now" ? getTodayDate() : form.scheduledFor,
        scheduledTime: publishMode === "now" ? getCurrentTime() : form.scheduledTime,
      };

      if (editingId) {
        await api.patch(`/questions/manual/${editingId}`, payload);
        notify(publishMode === "now" ? "⚡ Question updated & made active today!" : "Manual question updated!");
      } else {
        await api.post("/questions/manual", payload);
        notify(publishMode === "now" ? "⚡ Question published live to user dashboard!" : "Manual question scheduled successfully!");
      }
      resetForm();
      load();
    } catch (err) {
      notify(err.response?.data?.error || `Failed to ${editingId ? "update" : "setup"} question`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePublishNow = async (id) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await api.post(`/questions/manual/${id}/publish-now`);
      notify("⚡ Question activated live on user dashboard!");
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to publish question now", "error");
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  };

  const deleteQuestion = async (id) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await api.delete(`/questions/manual/${id}`);
      notify("Question deleted successfully!");
      if (editingId === id) resetForm();
      load();
    } catch (err) {
      notify(err.response?.data?.error || "Failed to delete question", "error");
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  };

  const useTemplate = (templateQuestion) => {
    setForm(f => ({
      ...f,
      question: templateQuestion,
      category: f.setupType === "normal" || f.setupType === "regular" ? (f.category || "General") : f.setupType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      topic: f.setupType === "normal" || f.setupType === "regular" ? f.topic : f.setupType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    }));
  };

  const setupTypeLabels = {
    normal: "Normal Question (Daily Practice Prompt)",
    story_summary: "Story Summary (Listening Practice)",
    picture_description: "Picture Description Challenge",
    monthly_reflection: "Monthly Reflection (Last day of month)",
    monthly_goals: "Monthly Goals (1st of month)"
  };

  const groupedQuestions = {
    normal: manualQuestions.filter(q => q.setupType === "normal" || q.setupType === "regular"),
    story_summary: manualQuestions.filter(q => q.setupType === "story_summary"),
    picture_description: manualQuestions.filter(q => q.setupType === "picture_description"),
    monthly_reflection: manualQuestions.filter(q => q.setupType === "monthly_reflection"),
    monthly_goals: manualQuestions.filter(q => q.setupType === "monthly_goals"),
  };

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "5rem", right: "1rem", zIndex: 9999,
          background: toast.type === "error" ? "#7f1d1d" : "#065f46",
          border: `1px solid ${toast.type === "error" ? "rgba(248,113,113,0.4)" : "rgba(74,222,128,0.4)"}`,
          color: "#fff", padding: "0.75rem 1.25rem", borderRadius: 12,
          fontSize: "0.9rem", fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          animation: "slideUpIn 0.3s ease",
        }}>
          {toast.type === "error" ? "❌" : "✅"} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>📝 Manual Questions</h2>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            Setup and publish custom questions, reflections, stories, or picture description challenges
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => {
              if (showForm && publishMode === "now" && !editingId) {
                resetForm();
              } else {
                resetForm();
                setPublishMode("now");
                setShowForm(true);
              }
            }}
            style={{
              background: showForm && publishMode === "now" ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#059669,#047857)",
              border: "none",
              color: "#fff",
              borderRadius: 12, padding: "0.65rem 1.15rem",
              fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
              boxShadow: "0 4px 12px rgba(16,185,129,0.25)",
              display: "inline-flex", alignItems: "center", gap: "0.4rem"
            }}
          >
            ⚡ Setup Now (Today)
          </button>
          <button
            onClick={() => {
              if (showForm && publishMode === "schedule" && !editingId) {
                resetForm();
              } else {
                resetForm();
                setPublishMode("schedule");
                setShowForm(true);
              }
            }}
            style={{
              background: showForm && publishMode === "schedule" ? "linear-gradient(135deg,#7c6fff,#4f46e5)" : "rgba(124,111,255,0.15)",
              border: "1px solid rgba(124,111,255,0.3)",
              color: showForm && publishMode === "schedule" ? "#fff" : "#a78bfa",
              borderRadius: 12, padding: "0.65rem 1.15rem",
              fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: "0.4rem"
            }}
          >
            📅 Schedule Later
          </button>
        </div>
      </div>

      {/* Setup form */}
      {showForm && (
        <div style={{
          background: publishMode === "now" 
            ? "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))"
            : "linear-gradient(135deg, rgba(124,111,255,0.08), rgba(79,70,229,0.05))",
          border: publishMode === "now" ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(124,111,255,0.25)",
          borderRadius: 16, padding: "1.5rem", marginBottom: "1.5rem",
        }}>
          {/* Mode Switcher Tabs inside Form */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.2rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: publishMode === "now" ? "#34d399" : "#a78bfa" }}>
              {editingId ? "✏️ Edit Manual Question" : (publishMode === "now" ? "⚡ Setup & Publish Now (Today)" : "📅 Schedule Question for Later")}
            </div>
            <div style={{ display: "flex", background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                type="button"
                onClick={() => setPublishMode("now")}
                style={{
                  background: publishMode === "now" ? "rgba(16,185,129,0.3)" : "transparent",
                  color: publishMode === "now" ? "#34d399" : "var(--muted)",
                  border: "none", borderRadius: 8, padding: "0.35rem 0.75rem",
                  fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                }}
              >
                ⚡ Set for Today (Now)
              </button>
              <button
                type="button"
                onClick={() => setPublishMode("schedule")}
                style={{
                  background: publishMode === "schedule" ? "rgba(124,111,255,0.3)" : "transparent",
                  color: publishMode === "schedule" ? "#a78bfa" : "var(--muted)",
                  border: "none", borderRadius: 8, padding: "0.35rem 0.75rem",
                  fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                }}
              >
                📅 Schedule Later
              </button>
            </div>
          </div>

          {publishMode === "now" && (
            <div style={{
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: 10, padding: "0.6rem 0.85rem",
              fontSize: "0.82rem", color: "#34d399", marginBottom: "1rem",
              display: "flex", alignItems: "center", gap: "0.5rem"
            }}>
              <span>⚡</span>
              <span>This question will become <strong>immediately active</strong> on the user dashboard as today's challenge.</span>
            </div>
          )}

          <form onSubmit={setupQuestion}>
            <div className={publishMode === "now" ? "" : "grid-cols-2"} style={{ marginBottom: "0.75rem" }}>
              <div style={{ marginBottom: publishMode === "now" ? "0.75rem" : 0 }}>
                <label className="form-label">Question Type *</label>
                <select 
                  className="form-input" 
                  required
                  value={form.setupType} 
                  onChange={e => {
                    const newType = e.target.value;
                    setForm(f => ({ 
                      ...f, 
                      setupType: newType,
                      scheduledFor: getDefaultDate(newType),
                      scheduledTime: (newType === "story_summary" || newType === "picture_description") ? getCurrentTime() : f.scheduledTime,
                      category: newType === "normal" ? (f.category && f.category !== "Monthly Reflection" && f.category !== "Monthly Goals" ? f.category : "General") : newType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                      topic: newType === "normal" ? f.topic : newType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                      question: newType === "story_summary" ? "Listen to the story audio and record a short video summary in your own words." : newType === "picture_description" ? "Describe what you see in the image. Mention the people, setting, and actions. Share what you think might be happening." : f.question
                    }));
                    setSelectedTemplate("");
                  }}
                >
                  {Object.entries(setupTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {publishMode === "schedule" && (
                <>
                  <div>
                    <label className="form-label">Scheduled Date *</label>
                    <input 
                      className="form-input" 
                      type="date" 
                      required
                      value={form.scheduledFor} 
                      onChange={e => setForm(f => ({ ...f, scheduledFor: e.target.value }))} 
                    />
                  </div>
                  <div style={{ marginTop: "0.75rem" }}>
                    <label className="form-label">Scheduled Time {form.setupType === "story_summary" || form.setupType === "picture_description" ? "*" : "(optional)"}</label>
                    <input
                      className="form-input"
                      type="time"
                      required={form.setupType === "story_summary" || form.setupType === "picture_description"}
                      value={form.scheduledTime}
                      onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Template selector */}
            {templates[form.setupType] && (
              <div style={{ marginBottom: "0.75rem" }}>
                <label className="form-label">Use Template (optional)</label>
                <select 
                  className="form-input" 
                  value={selectedTemplate}
                  onChange={e => {
                    setSelectedTemplate(e.target.value);
                    if (e.target.value) {
                      useTemplate(e.target.value);
                    }
                  }}
                >
                  <option value="">Select a template...</option>
                  {templates[form.setupType].map((template, i) => (
                    <option key={i} value={template}>{template.slice(0, 60)}...</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid-cols-2" style={{ marginBottom: "0.75rem" }}>
              <div>
                <label className="form-label">Category *</label>
                <input 
                  className="form-input" 
                  placeholder="e.g. Daily Life, Opinion, Reflection" 
                  required
                  value={form.category} 
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))} 
                />
              </div>
              <div>
                <label className="form-label">Topic *</label>
                <input 
                  className="form-input" 
                  placeholder="e.g. My Favorite Childhood Memory" 
                  required
                  value={form.topic} 
                  onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} 
                />
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label">Question *</label>
              <textarea 
                className="form-input" 
                rows={3}
                placeholder="Enter your custom question..."
                required
                value={form.question} 
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))} 
              />
            </div>
            {form.setupType === "story_summary" && (
              <>
                <div style={{ marginBottom: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={generatingStory}
                    onClick={handleGenerateStory}
                    style={{ width: "100%", marginBottom: "0.75rem", background: "linear-gradient(135deg,#0f766e,#0d9488)" }}
                  >
                    {generatingStory ? "✨ Generating story…" : "✨ AI Generate Story"}
                  </button>
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label className="form-label">Story Audio URL *</label>
                  <input
                    className="form-input"
                    type="url"
                    placeholder="https://.../story.mp3"
                    required
                    value={form.audioUrl}
                    onChange={e => setForm(f => ({ ...f, audioUrl: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={generatingAudio}
                    onClick={handleGenerateAudio}
                    style={{ marginTop: "0.5rem", width: "100%", color: "#22d3ee", borderColor: "rgba(6,182,212,0.4)" }}
                  >
                    {generatingAudio ? "🔊 Generating audio…" : "🔊 Generate Audio from Story"}
                  </button>
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label className="form-label">Story Transcript (optional)</label>
                  <textarea
                    className="form-input"
                    rows={4}
                    placeholder="Paste the story text here for better AI summary scoring..."
                    value={form.storyTranscript}
                    onChange={e => setForm(f => ({ ...f, storyTranscript: e.target.value }))}
                  />
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label className="form-label">Expected Summary / Key Points (optional)</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="Key points students should mention..."
                    value={form.summaryGuide}
                    onChange={e => setForm(f => ({ ...f, summaryGuide: e.target.value }))}
                  />
                </div>
              </>
            )}
            {form.setupType === "picture_description" && (
              <>
                <div style={{ marginBottom: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={generatingPicture}
                    onClick={handleGeneratePicture}
                    style={{ width: "100%", marginBottom: "0.5rem", background: "linear-gradient(135deg,#1e40af,#1d4ed8)" }}
                  >
                    {generatingPicture ? "🖼️ Generating picture challenge…" : "🖼️ AI Generate Picture Challenge"}
                  </button>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", textAlign: "center" }}>
                    Generates topic, instructions, and fetches a Pexels image automatically. You can edit any field before saving.
                  </div>
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label className="form-label">Image URL * <span style={{ color: "var(--muted)", fontWeight: 400 }}>(direct photo link)</span></label>
                  <input
                    className="form-input"
                    type="url"
                    placeholder="https://images.pexels.com/photos/..."
                    required
                    value={form.imageUrl}
                    onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  />
                  {form.imageUrl && (
                    <img
                      src={form.imageUrl}
                      alt="preview"
                      style={{ marginTop: "0.5rem", width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(99,179,237,0.3)" }}
                      onError={e => { e.target.style.display = "none"; }}
                    />
                  )}
                </div>
                <div className="grid-cols-2" style={{ marginBottom: "0.75rem" }}>
                  <div>
                    <label className="form-label">Photographer Name</label>
                    <input
                      className="form-input"
                      placeholder="e.g. John Smith"
                      value={form.imagePhotographer}
                      onChange={e => setForm(f => ({ ...f, imagePhotographer: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Image Source</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Pexels"
                      value={form.imageSource}
                      onChange={e => setForm(f => ({ ...f, imageSource: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid-cols-2" style={{ marginBottom: "0.75rem" }}>
                  <div>
                    <label className="form-label">Pexels Photo Page URL</label>
                    <input
                      className="form-input"
                      type="url"
                      placeholder="https://www.pexels.com/photo/..."
                      value={form.imagePageUrl}
                      onChange={e => setForm(f => ({ ...f, imagePageUrl: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Photographer Profile URL</label>
                    <input
                      className="form-input"
                      type="url"
                      placeholder="https://www.pexels.com/@..."
                      value={form.imagePhotographerUrl}
                      onChange={e => setForm(f => ({ ...f, imagePhotographerUrl: e.target.value }))}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label className="form-label">Speaking Instructions (optional)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="e.g. Describe what you see. Mention who is in the image, what they are doing, and what the setting feels like."
                    value={form.imageInstructions}
                    onChange={e => setForm(f => ({ ...f, imageInstructions: e.target.value }))}
                  />
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={saving} 
                style={{ 
                  minWidth: 180,
                  background: publishMode === "now" ? "linear-gradient(135deg,#10b981,#059669)" : undefined 
                }}
              >
                {saving 
                  ? (editingId ? "Updating…" : "Publishing…") 
                  : (editingId 
                      ? (publishMode === "now" ? "⚡ Update & Make Active Now" : "💾 Update Question") 
                      : (publishMode === "now" ? "⚡ Publish Active Question Now" : "📅 Schedule Question"))}
              </button>
              <button type="button" onClick={resetForm} className="btn-ghost" style={{ padding: "0.65rem 1.25rem" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="spinner-wrap"><div className="spinner" /></div>}

      {/* Scheduled Questions */}
      {!loading && (
        <>
          {Object.entries(groupedQuestions).map(([type, questions]) => (
            questions.length > 0 && (
              <div key={type} style={{ marginBottom: "1.5rem" }}>
                <div style={{ 
                  fontSize: "0.75rem", 
                  fontWeight: 700, 
                  color: "#7c6fff", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.08em", 
                  marginBottom: "0.75rem" 
                }}>
                  📝 {setupTypeLabels[type]}
                </div>
                {questions.map(q => (
                  <div key={q._id} style={{
                    background: "var(--bg-secondary)",
                    border: editingId === q._id ? "2px solid #7c6fff" : (q.isUsed ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(124,111,255,0.25)"),
                    borderRadius: 14, 
                    padding: "1rem 1.25rem",
                    marginBottom: "0.75rem",
                    transition: "all 0.2s",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>{q.topic}</span>
                          <span style={{
                            fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem",
                            borderRadius: 20, textTransform: "uppercase",
                            background: q.isUsed ? "rgba(16,185,129,0.15)" : "rgba(124,111,255,0.15)",
                            color: q.isUsed ? "#34d399" : "#7c6fff",
                          }}>
                            {q.isUsed ? "⚡ Active / Published" : "Manual"}
                          </span>
                        </div>

                        <div style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: "0.4rem", lineHeight: 1.4 }}>
                          {q.question}
                        </div>
                        {q.audioUrl && (
                          <div style={{ fontSize: "0.78rem", color: "#2dd4bf", marginBottom: "0.4rem", wordBreak: "break-all" }}>
                            🎧 {q.audioUrl}
                          </div>
                        )}
                        {q.imageUrl && (
                          <div style={{ fontSize: "0.78rem", color: "#90cdf4", marginBottom: "0.4rem", wordBreak: "break-all" }}>
                            🖼️ {q.imageUrl}
                          </div>
                        )}

                        <div style={{ display: "flex", gap: "1rem", fontSize: "0.78rem", color: "var(--muted)", flexWrap: "wrap" }}>
                          <span>📅 {new Date(q.scheduledFor).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                          <span>⏰ {q.scheduledTime || new Date(q.scheduledFor).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                          <span>👤 {q.createdBy}</span>
                          <span>📂 {q.category}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          onClick={() => handlePublishNow(q._id)}
                          disabled={busy[q._id]}
                          title="Immediately set as today's active question"
                          style={{
                            background: "rgba(16,185,129,0.15)",
                            border: "1px solid rgba(16,185,129,0.35)",
                            color: "#34d399", borderRadius: 10,
                            padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                            cursor: "pointer", whiteSpace: "nowrap",
                            opacity: busy[q._id] ? 0.5 : 1
                          }}
                        >
                          ⚡ Make Active
                        </button>
                        <button
                          onClick={() => handleEdit(q)}
                          disabled={busy[q._id]}
                          style={{
                            background: "rgba(124,111,255,0.12)",
                            border: "1px solid rgba(124,111,255,0.3)",
                            color: "#a78bfa", borderRadius: 10,
                            padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => deleteQuestion(q._id)}
                          disabled={busy[q._id]}
                          style={{
                            background: "rgba(248,113,113,0.12)",
                            border: "1px solid rgba(248,113,113,0.3)",
                            color: "#f87171", borderRadius: 10,
                            padding: "0.5rem 0.85rem", fontWeight: 700, fontSize: "0.82rem",
                            cursor: "pointer", whiteSpace: "nowrap",
                            opacity: busy[q._id] ? 0.5 : 1
                          }}
                        >
                          {busy[q._id] ? "Deleting…" : "✕ Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ))}

          {manualQuestions.length === 0 && (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📝</div>
              <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No manual questions scheduled</div>
              <div style={{ fontSize: "0.85rem" }}>Click "⚡ Setup Now" to create and publish a question immediately for today</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
