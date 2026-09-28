import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";
import { getSharedSocket } from "../hooks/useSocket";

const CATEGORIES = [
  { id: "grammar", label: "Grammar & Correction", icon: "📝", desc: "Need help fixing a sentence or grammar rule" },
  { id: "speaking", label: "Speaking & Pronunciation", icon: "🗣️", desc: "How to pronounce or express an idea" },
  { id: "task_help", label: "Today's Task Help", icon: "🎯", desc: "Need clarification on today's topic or prompt" },
  { id: "technical", label: "Technical / App Issue", icon: "🛠️", desc: "Video recording or platform problem" },
  { id: "general", label: "General Question", icon: "💬", desc: "Any other doubt or feedback" },
];

export default function HelpDeskWidget() {
  const { token, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("raise"); // "raise" | "my_tickets"
  const [category, setCategory] = useState("grammar");
  const [issueText, setIssueText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [error, setError] = useState(null);

  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const fetchMyTickets = async () => {
    if (!user) return;
    setLoadingTickets(true);
    try {
      const res = await api.get("/help-tickets/my-tickets");
      if (res.data?.tickets) {
        setTickets(res.data.tickets);
        const resolvedUnread = res.data.tickets.some(t => t.status === "resolved");
        if (resolvedUnread && !isOpen) setHasUnread(true);
      }
    } catch (err) {
      console.warn("[HelpDesk] Failed to fetch tickets:", err.message);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchMyTickets();
    }
  }, [user]);

  // Real-time updates via socket
  useEffect(() => {
    if (!token) return;
    const socket = getSharedSocket(token);
    if (!socket) return;

    const handleResolved = (updatedTicket) => {
      setTickets(prev => prev.map(t => t._id === updatedTicket._id ? updatedTicket : t));
      setHasUnread(true);
    };

    socket.on("help_ticket:resolved", handleResolved);
    return () => socket.off("help_ticket:resolved", handleResolved);
  }, [token]);

  if (!user) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!issueText.trim()) {
      setError("Please describe your problem or question.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/help-tickets/raise", {
        category,
        issueText: issueText.trim(),
      });
      if (res.data?.success) {
        setSubmitSuccess(true);
        setIssueText("");
        fetchMyTickets();
        setTimeout(() => {
          setSubmitSuccess(false);
          setActiveTab("my_tickets");
        }, 1200);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to submit help request.");
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = tickets.filter(t => t.status === "pending").length;
  const resolvedCount = tickets.filter(t => t.status === "resolved").length;

  return (
    <>
      {/* Floating Panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "5rem",
            right: "1.25rem",
            zIndex: 9999,
            width: "calc(100vw - 2.5rem)",
            maxWidth: 420,
            maxHeight: "min(600px, 80vh)",
            display: "flex",
            flexDirection: "column",
            background: "linear-gradient(160deg, #100d1c 0%, #171329 100%)",
            border: "1.5px solid rgba(139,92,246,0.35)",
            borderRadius: 20,
            boxShadow: "0 20px 60px rgba(0,0,0,0.65), 0 0 30px rgba(139,92,246,0.15)",
            overflow: "hidden",
            color: "var(--text)",
            animation: "speakshineFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "1rem 1.25rem",
              background: "rgba(139,92,246,0.12)",
              borderBottom: "1px solid rgba(139,92,246,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1rem",
                }}
              >
                🆘
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.2 }}>
                  Student Help Desk
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text2)" }}>
                  Raise problems &amp; get trainer grammar advice
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "50%",
                width: 28,
                height: 28,
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>

          {/* Tab Controls */}
          <div
            style={{
              display: "flex",
              padding: "0.5rem 1rem 0",
              gap: "0.5rem",
              borderBottom: "1px solid var(--border)",
              background: "rgba(0,0,0,0.15)",
            }}
          >
            <button
              onClick={() => setActiveTab("raise")}
              style={{
                flex: 1,
                padding: "0.6rem",
                fontSize: "0.82rem",
                fontWeight: 700,
                border: "none",
                background: "transparent",
                color: activeTab === "raise" ? "#a78bfa" : "var(--muted)",
                borderBottom: activeTab === "raise" ? "2px solid #8b5cf6" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              ➕ Raise Problem
            </button>
            <button
              onClick={() => {
                setActiveTab("my_tickets");
                fetchMyTickets();
              }}
              style={{
                flex: 1,
                padding: "0.6rem",
                fontSize: "0.82rem",
                fontWeight: 700,
                border: "none",
                background: "transparent",
                color: activeTab === "my_tickets" ? "#a78bfa" : "var(--muted)",
                borderBottom: activeTab === "my_tickets" ? "2px solid #8b5cf6" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
              }}
            >
              📋 My Doubts ({tickets.length})
              {resolvedCount > 0 && (
                <span
                  style={{
                    background: "#22c55e",
                    color: "#fff",
                    fontSize: "0.62rem",
                    padding: "1px 5px",
                    borderRadius: 99,
                  }}
                >
                  {resolvedCount}
                </span>
              )}
            </button>
          </div>

          {/* Body Content */}
          <div style={{ padding: "1.1rem", overflowY: "auto", flex: 1 }}>
            {activeTab === "raise" ? (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {submitSuccess ? (
                  <div
                    style={{
                      background: "rgba(34,197,94,0.15)",
                      border: "1px solid rgba(34,197,94,0.4)",
                      color: "#4ade80",
                      padding: "1rem",
                      borderRadius: 12,
                      textAlign: "center",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                    }}
                  >
                    🎉 Question submitted successfully! Admin &amp; Trainer have been notified.
                  </div>
                ) : (
                  <>
                    <div>
                      <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "0.4rem" }}>
                        Select Category
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.45rem" }}>
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setCategory(cat.id)}
                            style={{
                              padding: "0.55rem 0.65rem",
                              borderRadius: 10,
                              textAlign: "left",
                              background: category === cat.id ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${category === cat.id ? "rgba(139,92,246,0.5)" : "var(--border)"}`,
                              color: category === cat.id ? "#c4b5fd" : "var(--text2)",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                              fontWeight: category === cat.id ? 700 : 500,
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <span>{cat.icon}</span>
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cat.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "0.4rem" }}>
                        Describe your problem or question
                      </label>
                      <textarea
                        rows={4}
                        value={issueText}
                        onChange={(e) => setIssueText(e.target.value)}
                        placeholder="E.g., Can you correct this sentence: 'I am practicing English since two months' or help me with today's speaking topic?"
                        style={{
                          width: "100%",
                          background: "var(--bg2)",
                          border: "1px solid var(--border2)",
                          borderRadius: 12,
                          padding: "0.75rem",
                          color: "var(--text)",
                          fontSize: "0.84rem",
                          resize: "none",
                          lineHeight: 1.45,
                        }}
                      />
                    </div>

                    {error && (
                      <div style={{ color: "#ef4444", fontSize: "0.76rem", fontWeight: 600 }}>
                        ⚠️ {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      style={{
                        background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 12,
                        padding: "0.75rem",
                        fontWeight: 700,
                        fontSize: "0.88rem",
                        cursor: submitting ? "not-allowed" : "pointer",
                        boxShadow: "0 4px 16px rgba(139,92,246,0.35)",
                        transition: "all 0.2s",
                      }}
                    >
                      {submitting ? "Submitting..." : "🚀 Send Question to Trainer & Admin"}
                    </button>
                  </>
                )}
              </form>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {loadingTickets ? (
                  <div style={{ textAlign: "center", color: "var(--muted)", padding: "2rem 0", fontSize: "0.84rem" }}>
                    Loading your doubts...
                  </div>
                ) : tickets.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--muted)", padding: "2rem 0", fontSize: "0.84rem" }}>
                    No help requests submitted yet. Click "Raise Problem" above to ask a question!
                  </div>
                ) : (
                  tickets.map((t) => {
                    const catObj = CATEGORIES.find(c => c.id === t.category) || CATEGORIES[0];
                    const isResolved = t.status === "resolved";
                    return (
                      <div
                        key={t._id}
                        style={{
                          background: "var(--card2)",
                          border: `1px solid ${isResolved ? "rgba(34,197,94,0.35)" : "var(--border)"}`,
                          borderRadius: 14,
                          padding: "0.85rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.6rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                          <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#a78bfa", display: "flex", alignItems: "center", gap: "4px" }}>
                            <span>{catObj.icon}</span>
                            <span>{catObj.label}</span>
                          </span>
                          <span
                            style={{
                              fontSize: "0.64rem",
                              fontWeight: 800,
                              padding: "2px 8px",
                              borderRadius: 99,
                              textTransform: "uppercase",
                              background: isResolved ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                              color: isResolved ? "#4ade80" : "#fbbf24",
                              border: `1px solid ${isResolved ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
                            }}
                          >
                            {isResolved ? "🟢 Resolved" : "🟡 Pending"}
                          </span>
                        </div>

                        <div style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.45 }}>
                          "{t.issueText}"
                        </div>

                        {/* Admin / Trainer Solution Box */}
                        {isResolved && t.response && (
                          <div
                            style={{
                              marginTop: "0.4rem",
                              padding: "0.75rem",
                              borderRadius: 10,
                              background: "rgba(139,92,246,0.12)",
                              border: "1px solid rgba(139,92,246,0.3)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.35rem",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.72rem" }}>
                              <span style={{ fontWeight: 800, color: "#c4b5fd" }}>
                                🎓 Answer from {t.respondedBy || "Trainer"} ({t.respondedByRole || "Trainer"})
                              </span>
                              <span style={{ color: "var(--muted)", fontSize: "0.68rem" }}>
                                {new Date(t.respondedAt || t.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div style={{ fontSize: "0.8rem", color: "#f8f7ff", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                              {t.response}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        onClick={() => {
          setIsOpen(v => !v);
          setHasUnread(false);
        }}
        title="Raise a Problem / Help Desk"
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 9998,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
          color: "#fff",
          border: "2px solid rgba(255,255,255,0.25)",
          boxShadow: "0 8px 24px rgba(139,92,246,0.45)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.4rem",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = "scale(1.08)";
          e.currentTarget.style.boxShadow = "0 10px 28px rgba(139,92,246,0.6)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 8px 24px rgba(139,92,246,0.45)";
        }}
      >
        🆘
        {hasUnread && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#22c55e",
              border: "2px solid #080711",
            }}
          />
        )}
      </button>
    </>
  );
}
