import React, { useEffect, useState } from "react";
import api from "../api/client.js";
import { useToast } from "./Toast.jsx";

export default function AdminHelpDeskTab() {
  const [tickets, setTickets] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [responseMap, setResponseMap] = useState({});
  const [submittingId, setSubmittingId] = useState(null);
  const { toast } = useToast();

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/help-tickets/admin/tickets${filterStatus !== "all" ? `?status=${filterStatus}` : ""}`);
      if (res.data?.tickets) {
        setTickets(res.data.tickets);
      }
    } catch (err) {
      console.warn("[HelpDeskTab] Failed to load tickets:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [filterStatus]);

  const handleSendResponse = async (ticketId) => {
    const text = responseMap[ticketId];
    if (!text || !text.trim()) {
      toast.error("Please enter a response or grammar tip for the student.");
      return;
    }
    setSubmittingId(ticketId);
    try {
      const res = await api.post(`/help-tickets/admin/respond/${ticketId}`, {
        response: text.trim(),
      });
      if (res.data?.success) {
        toast.success("Solution & Grammar Tip sent to student!");
        setResponseMap(prev => ({ ...prev, [ticketId]: "" }));
        loadTickets();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || "Failed to respond.");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Top Header & Filter Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text)" }}>🆘 Student Help Desk &amp; Doubts</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Review student questions, provide grammar advice, and resolve support requests.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {["all", "pending", "resolved"].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: 10,
                fontSize: "0.78rem",
                fontWeight: 700,
                textTransform: "capitalize",
                background: filterStatus === st ? "rgba(139,92,246,0.2)" : "var(--card2, rgba(255,255,255,0.05))",
                border: `1px solid ${filterStatus === st ? "rgba(139,92,246,0.5)" : "var(--border, rgba(255,255,255,0.1))"}`,
                color: filterStatus === st ? "#c4b5fd" : "var(--text2, #94a3b8)",
                cursor: "pointer",
              }}
            >
              {st === "all" ? "All Doubts" : st === "pending" ? "🟡 Pending" : "🟢 Resolved"}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket List */}
      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>Loading student doubts...</div>
      ) : tickets.length === 0 ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)", background: "var(--card2, rgba(255,255,255,0.03))", borderRadius: 16, border: "1px solid var(--border, rgba(255,255,255,0.08))" }}>
          🎉 No help tickets found in this filter view.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {tickets.map(t => {
            const isResolved = t.status === "resolved";
            return (
              <div
                key={t._id}
                style={{
                  background: "var(--card, #1e1e38)",
                  border: `1px solid ${isResolved ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.35)"}`,
                  borderRadius: 16,
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                {/* Ticket Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(139,92,246,0.2)", color: "#a78bfa", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.95rem" }}>
                      {t.userName?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "var(--text, #fff)" }}>{t.userName} ({t.userPhone})</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)" }}>Category: <strong style={{ color: "#c4b5fd" }}>{t.category}</strong> · Submitted: {new Date(t.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: "0.7rem", fontWeight: 800, padding: "0.25rem 0.65rem", borderRadius: 99, background: isResolved ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)", color: isResolved ? "#4ade80" : "#fbbf24", border: `1px solid ${isResolved ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}` }}>
                    {isResolved ? "🟢 RESOLVED" : "🟡 PENDING"}
                  </span>
                </div>

                {/* Question Box */}
                <div style={{ background: "var(--bg2, rgba(0,0,0,0.2))", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 12, padding: "0.85rem", fontSize: "0.88rem", color: "var(--text, #f8fafc)", lineHeight: 1.5 }}>
                  "{t.issueText}"
                </div>

                {/* Response Section */}
                {isResolved ? (
                  <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 12, padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.74rem" }}>
                      <span style={{ fontWeight: 800, color: "#c4b5fd" }}>🎓 Response from {t.respondedBy || "Staff"} ({t.respondedByRole || "Staff"})</span>
                      <span style={{ color: "var(--muted, #94a3b8)" }}>{new Date(t.respondedAt).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text, #fff)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {t.response}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    <textarea
                      rows={3}
                      value={responseMap[t._id] || ""}
                      onChange={(e) => setResponseMap({ ...responseMap, [t._id]: e.target.value })}
                      placeholder="Write grammar advice, pronunciation tip, or solution task for the student..."
                      style={{
                        width: "100%",
                        background: "var(--bg2, rgba(0,0,0,0.2))",
                        border: "1px solid var(--border2, rgba(255,255,255,0.15))",
                        borderRadius: 12,
                        padding: "0.75rem",
                        color: "var(--text, #fff)",
                        fontSize: "0.84rem",
                        resize: "none",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={() => handleSendResponse(t._id)}
                        disabled={submittingId === t._id}
                        style={{
                          background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 10,
                          padding: "0.55rem 1.1rem",
                          fontWeight: 700,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                        }}
                      >
                        {submittingId === t._id ? "Sending..." : "💬 Send Solution & Mark Resolved"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
