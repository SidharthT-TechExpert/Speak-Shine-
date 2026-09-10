import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useTheme } from "../context/ThemeContext.jsx";

export default function InvoiceModal({ transaction, user, onClose }) {
  if (!transaction) return null;

  const themeContext = useTheme();
  const [isDark, setIsDark] = useState(() => {
    if (themeContext?.isDark !== undefined) return themeContext.isDark;
    return document.documentElement.getAttribute("data-theme") !== "light" &&
           !document.documentElement.classList.contains("light");
  });

  useEffect(() => {
    if (themeContext?.isDark !== undefined) {
      setIsDark(themeContext.isDark);
      return;
    }
    const check = () => {
      const dark = document.documentElement.getAttribute("data-theme") !== "light" &&
                   !document.documentElement.classList.contains("light");
      setIsDark(dark);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, [themeContext?.isDark]);

  const tx = transaction;
  const studentName = tx.name || user?.name || user?.registeredName || "Student Member";
  const studentPhone = tx.phone || user?.phone || "—";
  
  const txDate = tx.createdAt ? new Date(tx.createdAt) : new Date();
  const dateFormatted = txDate.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const invoiceNo = `INV-${txDate.getFullYear()}${(txDate.getMonth() + 1).toString().padStart(2, "0")}-${(tx.razorpayPaymentId || tx._id || "REC").slice(-6).toUpperCase()}`;

  const handlePrint = () => {
    window.print();
  };

  const modalContent = (
    <>
      {/* Precision 1-Page A4 Print Stylesheet */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm 12mm;
        }

        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Completely hide entire root React app to prevent multi-page overflow */
          #root, .app, nav, header, aside, .admin-dashboard-container {
            display: none !important;
          }

          .invoice-modal-overlay {
            position: static !important;
            background: transparent !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          #printable-invoice {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-shadow: none !important;
            border: 1.5px solid #cbd5e1 !important;
            border-radius: 12px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
          }

          .invoice-no-print {
            display: none !important;
          }

          .invoice-header-box {
            background: #f8fafc !important;
            border-bottom: 1.5px solid #cbd5e1 !important;
          }

          .invoice-header-title {
            color: #0f172a !important;
          }

          .invoice-header-sub {
            color: #475569 !important;
          }

          .invoice-status-badge {
            background: #dcfce7 !important;
            border: 1.5px solid #86efac !important;
            color: #15803d !important;
          }

          .invoice-print-card {
            background: #f8fafc !important;
            border: 1px solid #e2e8f0 !important;
          }

          .invoice-print-text-dark {
            color: #0f172a !important;
          }

          .invoice-print-text-muted {
            color: #64748b !important;
          }

          .invoice-total-box {
            background: #f1f5f9 !important;
            border-top: 1.5px solid #cbd5e1 !important;
          }

          .invoice-total-amount {
            color: #15803d !important;
          }
        }
      `}</style>

      <div
        className="invoice-modal-overlay"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: isDark ? "rgba(0, 0, 0, 0.78)" : "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(6px)",
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          overflowY: "auto",
        }}
      >
        <div
          id="printable-invoice"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: isDark ? "#0e101d" : "#ffffff",
            border: isDark ? "1px solid rgba(124, 111, 255, 0.3)" : "1.5px solid #e2e8f0",
            borderRadius: 20,
            width: "100%",
            maxWidth: 620,
            boxShadow: isDark
              ? "0 25px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(124, 111, 255, 0.15)"
              : "0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)",
            color: isDark ? "#f8fafc" : "#0f172a",
            overflow: "hidden",
            position: "relative",
            animation: "fadeInUp 0.22s ease-out",
          }}
        >
          {/* Header Banner */}
          <div
            className="invoice-header-box"
            style={{
              background: isDark
                ? "linear-gradient(135deg, rgba(124, 111, 255, 0.18), rgba(99, 102, 241, 0.08))"
                : "linear-gradient(135deg, #faf5ff 0%, #f1f5f9 100%)",
              borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
              padding: "1.35rem 1.6rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "1.6rem" }}>🗣️</span>
                <div>
                  <div className="invoice-header-title" style={{ fontSize: "1.25rem", fontWeight: 900, color: isDark ? "#fff" : "#0f172a", letterSpacing: "-0.02em" }}>
                    Speak &amp; Shine
                  </div>
                  <div className="invoice-header-sub" style={{ fontSize: "0.74rem", color: isDark ? "#a5b4fc" : "#6d28d9", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    English Communication &amp; AI Fluency Academy
                  </div>
                </div>
              </div>
              <div className="invoice-print-text-muted" style={{ fontSize: "0.75rem", color: isDark ? "var(--muted)" : "#64748b", marginTop: "0.35rem" }}>
                🌐 speak-shine.sidhartht.online · 📞 +91 88480 96746
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div
                className="invoice-status-badge"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  background: isDark ? "rgba(34, 197, 94, 0.12)" : "#dcfce7",
                  border: isDark ? "1px solid rgba(34, 197, 94, 0.35)" : "1px solid #86efac",
                  color: isDark ? "#4ade80" : "#15803d",
                  padding: "0.28rem 0.7rem",
                  borderRadius: 10,
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  marginBottom: "0.3rem",
                }}
              >
                <span>✓</span> PAID &amp; VERIFIED
              </div>
              <div className="invoice-print-text-muted" style={{ fontSize: "0.74rem", color: isDark ? "var(--muted)" : "#64748b", fontFamily: "monospace", fontWeight: 600 }}>
                {invoiceNo}
              </div>
            </div>
          </div>

          {/* Invoice Body */}
          <div style={{ padding: "1.35rem 1.6rem" }}>
            {/* 2-Column Info Grid */}
            <div
              className="invoice-print-card"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1.1rem",
                marginBottom: "1.25rem",
                background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
                border: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid #e2e8f0",
                borderRadius: 12,
                padding: "1rem",
              }}
            >
              <div>
                <div className="invoice-print-text-muted" style={{ fontSize: "0.7rem", color: isDark ? "var(--muted)" : "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
                  Billed To (Student)
                </div>
                <div style={{ fontWeight: 800, fontSize: "0.95rem", color: isDark ? "#f8fafc" : "#0f172a" }} className="invoice-print-text-dark">
                  {studentName}
                </div>
                <div className="invoice-print-text-muted" style={{ fontSize: "0.8rem", color: isDark ? "#94a3b8" : "#64748b", marginTop: "0.15rem" }}>
                  📱 {studentPhone}
                </div>
                <div style={{ fontSize: "0.74rem", color: isDark ? "#16a34a" : "#15803d", fontWeight: 600, marginTop: "0.2rem" }}>
                  Active Enrolled Student
                </div>
              </div>

              <div>
                <div className="invoice-print-text-muted" style={{ fontSize: "0.7rem", color: isDark ? "var(--muted)" : "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
                  Payment Details
                </div>
                <div style={{ fontSize: "0.82rem", color: isDark ? "#f8fafc" : "#0f172a", fontWeight: 600 }} className="invoice-print-text-dark">
                  📅 {dateFormatted}
                </div>
                <div className="invoice-print-text-muted" style={{ fontSize: "0.78rem", color: isDark ? "#94a3b8" : "#64748b", marginTop: "0.15rem" }}>
                  💳 {tx.source === "admin" ? "Admin Tier Override" : "Razorpay Online / UPI"}
                </div>
                {tx.razorpayPaymentId && (
                  <div className="invoice-print-text-muted" style={{ fontSize: "0.72rem", color: isDark ? "var(--muted)" : "#64748b", fontFamily: "monospace", marginTop: "0.15rem" }}>
                    ID: {tx.razorpayPaymentId}
                  </div>
                )}
              </div>
            </div>

            {/* Itemized Table */}
            <div
              className="invoice-print-card"
              style={{
                border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
                borderRadius: 12,
                overflow: "hidden",
                marginBottom: "1.25rem",
                background: isDark ? "transparent" : "#ffffff",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", background: isDark ? "transparent" : "#ffffff" }}>
                <thead>
                  <tr style={{ background: isDark ? "rgba(255, 255, 255, 0.04)" : "#f8fafc", borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0" }}>
                    <th style={{ textAlign: "left", padding: "0.65rem 0.9rem", color: isDark ? "#cbd5e1" : "#475569", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }} className="invoice-print-text-dark">
                      Description &amp; Access Plan
                    </th>
                    <th style={{ textAlign: "center", padding: "0.65rem 0.5rem", color: isDark ? "#cbd5e1" : "#475569", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase", width: 50 }} className="invoice-print-text-dark">
                      Qty
                    </th>
                    <th style={{ textAlign: "right", padding: "0.65rem 0.9rem", color: isDark ? "#cbd5e1" : "#475569", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase", width: 90 }} className="invoice-print-text-dark">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "0.75rem 0.9rem", borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 800, color: isDark ? "#fff" : "#0f172a", marginBottom: "0.15rem" }} className="invoice-print-text-dark">
                        Daily Speaking Challenge &amp; AI Voice Analysis
                      </div>
                      <div className="invoice-print-text-muted" style={{ fontSize: "0.72rem", color: isDark ? "#94a3b8" : "#64748b", lineHeight: 1.35 }}>
                        • Full access to daily speaking topics &amp; AI video/audio evaluation<br/>
                        • Personalized trainer feedback, streak freezers &amp; leaderboards
                      </div>
                    </td>
                    <td style={{ textAlign: "center", padding: "0.75rem 0.5rem", color: isDark ? "var(--muted)" : "#64748b", fontWeight: 600, borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid #e2e8f0" }} className="invoice-print-text-muted">
                      1
                    </td>
                    <td style={{ textAlign: "right", padding: "0.75rem 0.9rem", fontWeight: 800, color: isDark ? "#f8fafc" : "#0f172a", fontSize: "0.92rem", borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.04)" : "1px solid #e2e8f0" }} className="invoice-print-text-dark">
                      ₹{tx.amount > 0 ? tx.amount.toLocaleString("en-IN") : "0"}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Total Calculation Row */}
              <div
                className="invoice-total-box"
                style={{
                  background: isDark ? "rgba(124, 111, 255, 0.06)" : "#faf5ff",
                  padding: "0.75rem 0.9rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: isDark ? "1px solid rgba(124, 111, 255, 0.15)" : "1.5px solid #ddd6fe",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.75rem", color: isDark ? "#a5b4fc" : "#4338ca", fontWeight: 700 }} className="invoice-print-text-dark">
                    Total Amount Paid (Inclusive of Taxes)
                  </div>
                  <div className="invoice-print-text-muted" style={{ fontSize: "0.68rem", color: isDark ? "var(--muted)" : "#64748b" }}>
                    Zero Balance Due · Instant Digital Receipt
                  </div>
                </div>
                <div className="invoice-total-amount" style={{ fontSize: "1.2rem", fontWeight: 900, color: isDark ? "#4ade80" : "#15803d" }}>
                  ₹{tx.amount > 0 ? tx.amount.toLocaleString("en-IN") : "0"}
                </div>
              </div>
            </div>

            {/* Note & Seal */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.6rem",
                padding: "0.6rem 0",
                fontSize: "0.72rem",
                color: isDark ? "var(--muted)" : "#64748b",
                borderTop: isDark ? "1px dashed rgba(255, 255, 255, 0.1)" : "1px dashed #cbd5e1",
              }}
            >
              <div className="invoice-print-text-muted">
                🔒 This is a verified electronic receipt generated by Speak &amp; Shine.<br/>
                Billing inquiries: <span style={{ color: isDark ? "#a5b4fc" : "#4f46e5", fontWeight: 600 }}>support@speakandshine.app</span>
              </div>
              <div className="invoice-print-text-muted" style={{ textAlign: "right", fontFamily: "monospace", fontSize: "0.68rem", color: isDark ? "rgba(255, 255, 255, 0.4)" : "#94a3b8" }}>
                REF: {tx.razorpayOrderId || tx._id || "VERIFIED"}
              </div>
            </div>
          </div>

          {/* Action Footer (Hidden during print) */}
          <div
            className="invoice-no-print"
            style={{
              background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
              borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
              padding: "0.85rem 1.6rem",
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.65rem",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0",
                border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #cbd5e1",
                color: isDark ? "#e2e8f0" : "#334155",
                borderRadius: 10,
                padding: "0.5rem 1rem",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: "linear-gradient(135deg, #7c6fff 0%, #4f46e5 100%)",
                border: "none",
                color: "#ffffff",
                borderRadius: 10,
                padding: "0.5rem 1.2rem",
                fontSize: "0.82rem",
                fontWeight: 800,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                boxShadow: "0 4px 15px rgba(124, 111, 255, 0.4)",
                transition: "all 0.15s ease",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print / Save PDF (1 Page)
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}
