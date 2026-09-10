/**
 * PaymentHistory
 * Shows the logged-in user's payment status, live grace period countdown,
 * instant Razorpay payment / renewal option, and transaction invoices.
 */

import { useEffect, useState, lazy, Suspense } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { getMonthlyGracePeriodStatus } from "../utils/gracePeriodUtils.js";

const InvoiceModal = lazy(() => import("../components/InvoiceModal.jsx"));

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const DEFAULT_PLAN_AMOUNT = 5;

function statusBadge(status) {
  const map = {
    success:  { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.3)",  label: "✅ Success" },
    failed:   { color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.3)", label: "❌ Failed" },
    manual:   { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)",  label: "🔧 Manual" },
    refunded: { color: "#38bdf8", bg: "rgba(56,189,248,0.12)",  border: "rgba(56,189,248,0.3)",  label: "↩️ Refunded" },
  };
  const s = map[status] || map.failed;
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 8, padding: "0.2rem 0.6rem", fontSize: "0.72rem", fontWeight: 700,
    }}>
      {s.label}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function PaymentHistory() {
  const { user, login } = useAuth();
  const { isDark } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [planAmount, setPlanAmount] = useState(DEFAULT_PLAN_AMOUNT);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState(null);
  const [selectedInvoiceTx, setSelectedInvoiceTx] = useState(null);
  const [graceStatus, setGraceStatus] = useState(() => getMonthlyGracePeriodStatus());

  // Fetch transactions and plan amount
  const fetchTransactions = () => {
    return api.get("/payments/my-transactions")
      .then(r => setData(r.data))
      .catch(e => setError(e?.response?.data?.error || "Failed to load payment details"));
  };

  useEffect(() => {
    Promise.all([
      fetchTransactions(),
      api.get("/payments/config").then(({ data: cfg }) => {
        const amount = Number(cfg?.amount);
        if (Number.isFinite(amount) && amount >= 1) setPlanAmount(amount);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // Update live grace period countdown every second
  useEffect(() => {
    const timer = setInterval(() => {
      setGraceStatus(getMonthlyGracePeriodStatus());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isBypassRole = ["admin", "admins", "trainer", "viewer"].includes(user?.role);
  const isPaid = Boolean(data?.paid) || Boolean(user?.paid);

  const handlePay = async () => {
    setPaymentError(null);
    setPaymentSuccessMsg(null);
    setPaying(true);

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setPaymentError("Payment gateway failed to load. Please check your internet connection.");
      setPaying(false);
      return;
    }

    try {
      const { data: order } = await api.post("/payments/create-order");

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "Speak & Shine",
        description: `${graceStatus.monthName} ${graceStatus.year} Membership`,
        image: "/icons/icon-192.png",
        order_id: order.order_id,
        config: {
          display: {
            blocks: {
              upiBlock: {
                name: "Pay via UPI / QR Code",
                instruments: [{ method: "upi" }],
              },
            },
            sequence: ["block.upiBlock"],
            preferences: { show_default_blocks: false },
          },
        },
        method: {
          upi: true,
          card: false,
          netbanking: false,
          wallet: false,
          emi: false,
          paylater: false,
        },
        handler: async (response) => {
          try {
            await api.post("/payments/verify", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            const txObj = {
              name: user?.name || user?.registeredName || "Student Member",
              phone: user?.phone,
              amount: planAmount,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              status: "success",
              source: "razorpay",
              createdAt: new Date().toISOString(),
            };

            if (user) {
              login({ ...user, paid: true });
            }

            setPaymentSuccessMsg("🎉 Payment successful! Your monthly membership is now fully active.");
            await fetchTransactions();
            setSelectedInvoiceTx(txObj);
          } catch (verifyErr) {
            const errStatus = verifyErr?.response?.status;
            const errMsg = verifyErr?.response?.data?.error || "";
            if (errStatus === 409 || errMsg.includes("already been processed")) {
              if (user) login({ ...user, paid: true });
              setPaymentSuccessMsg("🎉 Payment verified! Your monthly membership is active.");
              await fetchTransactions();
            } else {
              setPaymentError(errMsg || "Payment verification failed. Please contact support.");
            }
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
          },
        },
        prefill: {
          name: user?.name || "",
          contact: user?.phone || "",
        },
        theme: { color: "#7c6fff" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (res) => {
        setPaying(false);
        setPaymentError(res.error?.description || "Payment failed. Please try again.");
      });
      rzp.open();
    } catch (err) {
      setPaymentError(err?.response?.data?.error || "Could not initiate payment. Please try again.");
      setPaying(false);
    }
  };

  if (loading) return <Layout title="Payments"><div className="spinner-wrap"><div className="spinner" /></div></Layout>;
  if (error)   return <Layout title="Payments"><div className="error-box"><p>{error}</p></div></Layout>;

  const { transactions = [], paidAt, paymentId } = data || {};
  const { days, hours, minutes, seconds } = graceStatus.countdown;

  return (
    <Layout title="Payments">
      {/* Invoice / Receipt Modal */}
      {selectedInvoiceTx && (
        <Suspense fallback={null}>
          <InvoiceModal
            transaction={selectedInvoiceTx}
            user={user}
            onClose={() => setSelectedInvoiceTx(null)}
          />
        </Suspense>
      )}

      <div className="payment-page-container">

        {/* ── Section 1: Modern Hero Showcase Banner ── */}
        <div className="payment-hero-banner">
          {/* Top Pill / Badge */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "0.45rem",
              fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.06em",
              color: isDark ? "#c4b5fd" : "#6d28d9",
              background: isDark ? "rgba(124, 111, 255, 0.12)" : "rgba(124, 111, 255, 0.08)",
              border: isDark ? "1px solid rgba(124, 111, 255, 0.3)" : "1px solid rgba(124, 111, 255, 0.2)",
              padding: "4px 12px", borderRadius: 99,
            }}>
              <span>💳 BILLING &amp; SUBSCRIPTION</span>
              <span>·</span>
              <span>VERIFIED TAX INVOICES</span>
            </div>

            <div style={{
              display: "inline-flex", alignItems: "center", gap: "0.45rem",
              fontSize: "0.72rem", fontWeight: 700,
              color: "#22c55e",
              background: "rgba(34, 197, 94, 0.1)",
              border: "1px solid rgba(34, 197, 94, 0.25)",
              padding: "3px 9px", borderRadius: 99,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
              <span>100% SECURE RAZORPAY GATEWAY</span>
            </div>
          </div>

          {/* Headline Title */}
          <h1 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "1.9rem",
            fontWeight: 700,
            color: isDark ? "#ffffff" : "#0f172a",
            margin: "0 0 0.5rem 0",
            letterSpacing: "-0.01em",
          }}>
            Membership &amp; Payment <span style={{ fontStyle: "italic", color: isDark ? "#c084fc" : "#7c3aed" }}>Center</span>
          </h1>

          <p style={{
            color: isDark ? "#94a3b8" : "#64748b",
            fontSize: "0.88rem",
            lineHeight: 1.5,
            margin: "0 0 1.25rem 0",
            maxWidth: 820,
          }}>
            Manage your monthly speaking cohort membership, instant UPI renewals, and download official GST-compliant tax receipts.
          </p>

          {/* 4 Quick-KPI Stat Micro-Cards */}
          <div className="payment-kpi-grid">
            {/* Card 1: Membership Status */}
            <div className="payment-kpi-card">
              <div style={{ fontSize: "0.68rem", fontWeight: 800, color: isDark ? "#94a3b8" : "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                MEMBERSHIP STATUS
              </div>
              <div style={{
                fontSize: "1.15rem", fontWeight: 800,
                color: isPaid ? "#4ade80" : isBypassRole ? "#a78bfa" : graceStatus.isGracePeriod ? "#fbbf24" : "#f87171",
                marginTop: 2, display: "flex", alignItems: "center", gap: "0.4rem",
              }}>
                <span>{isPaid ? "● ACTIVE" : isBypassRole ? "● EXEMPT" : graceStatus.isGracePeriod ? "● TRIAL (DAY " + graceStatus.dayOfMonth + ")" : "● DUE"}</span>
              </div>
            </div>

            {/* Card 2: Current Billing Month */}
            <div className="payment-kpi-card">
              <div style={{ fontSize: "0.68rem", fontWeight: 800, color: isDark ? "#94a3b8" : "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                CURRENT CYCLE
              </div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a", marginTop: 2 }}>
                {graceStatus.monthName} {graceStatus.year}
              </div>
            </div>

            {/* Card 3: Monthly Access Plan */}
            <div className="payment-kpi-card">
              <div style={{ fontSize: "0.68rem", fontWeight: 800, color: isDark ? "#94a3b8" : "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                MONTHLY ACCESS
              </div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a", marginTop: 2 }}>
                ₹{planAmount} <span style={{ fontSize: "0.75rem", fontWeight: 500, color: isDark ? "#94a3b8" : "#64748b" }}>/ month</span>
              </div>
            </div>

            {/* Card 4: Official Invoices */}
            <div className="payment-kpi-card">
              <div style={{ fontSize: "0.68rem", fontWeight: 800, color: isDark ? "#94a3b8" : "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                TAX RECEIPTS
              </div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: isDark ? "#c084fc" : "#7c3aed", marginTop: 2 }}>
                {transactions.length} <span style={{ fontSize: "0.75rem", fontWeight: 500, color: isDark ? "#94a3b8" : "#64748b" }}>logged</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: Current Membership / Plan Status Card ── */}
        {isPaid ? (
          /* Active Paid Card */
          <div className="payment-status-card" style={{
            background: isDark
              ? "linear-gradient(135deg, #0a2517 0%, #06180f 100%)"
              : "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
            border: isDark ? "1.5px solid rgba(74, 222, 128, 0.4)" : "1.5px solid #86efac",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1.25rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: isDark ? "rgba(74, 222, 128, 0.15)" : "#22c55e",
                  border: isDark ? "1.5px solid rgba(74, 222, 128, 0.45)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.5rem",
                  color: isDark ? "#4ade80" : "#ffffff",
                  flexShrink: 0,
                  boxShadow: "0 4px 14px rgba(34, 197, 94, 0.3)",
                }}>
                  ✓
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "1.25rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a" }}>
                      {graceStatus.monthName} Membership Active
                    </span>
                    <span style={{
                      background: isDark ? "rgba(74, 222, 128, 0.18)" : "#bbf7d0",
                      color: isDark ? "#4ade80" : "#15803d",
                      border: isDark ? "1px solid rgba(74, 222, 128, 0.35)" : "1px solid #86efac",
                      borderRadius: 99,
                      padding: "3px 10px",
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                    }}>
                      UNLOCKED
                    </span>
                  </div>
                  <div style={{ fontSize: "0.84rem", color: isDark ? "#94a3b8" : "#475569", marginTop: "0.3rem", lineHeight: 1.4 }}>
                    {paidAt ? `Payment completed on ${formatDate(paidAt)}` : "Monthly subscription unlocked"}
                    {paymentId ? ` · Ref: ${paymentId.slice(-12)}` : ""}
                  </div>
                </div>
              </div>

              <div>
                {transactions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedInvoiceTx(transactions[0])}
                    style={{
                      background: isDark ? "rgba(74, 222, 128, 0.15)" : "#16a34a",
                      border: isDark ? "1.5px solid rgba(74, 222, 128, 0.4)" : "none",
                      color: isDark ? "#86efac" : "#ffffff",
                      borderRadius: 12,
                      padding: "0.7rem 1.35rem",
                      fontSize: "0.9rem",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      boxShadow: "0 4px 14px rgba(34, 197, 94, 0.25)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span>📄</span> View Official Invoice
                  </button>
                )}
              </div>
            </div>

            {/* Included Benefits List */}
            <div className="payment-benefits-grid">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: isDark ? "#cbd5e1" : "#1e293b" }}>
                <span style={{ color: "#22c55e", fontWeight: 800 }}>✓</span>
                <span>Daily AI video speech analysis &amp; 4-rubric CEFR scoring</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: isDark ? "#cbd5e1" : "#1e293b" }}>
                <span style={{ color: "#22c55e", fontWeight: 800 }}>✓</span>
                <span>24-Hour ephemeral cohort showcase &amp; peer comments</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: isDark ? "#cbd5e1" : "#1e293b" }}>
                <span style={{ color: "#22c55e", fontWeight: 800 }}>✓</span>
                <span>Live interactive speaking rooms &amp; trainer sessions</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: isDark ? "#cbd5e1" : "#1e293b" }}>
                <span style={{ color: "#22c55e", fontWeight: 800 }}>✓</span>
                <span>Downloadable GST-compliant invoices &amp; certificates</span>
              </div>
            </div>
          </div>
        ) : isBypassRole ? (
          /* Staff Role Access */
          <div className="payment-status-card" style={{
            background: isDark ? "linear-gradient(135deg, #1e1b4b 0%, #131032 100%)" : "#f5f3ff",
            border: isDark ? "1.5px solid rgba(167, 139, 250, 0.4)" : "1.5px solid #ddd6fe",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}>
            <div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a" }}>
                Staff Role Access ({user?.role?.toUpperCase()})
              </div>
              <div style={{ fontSize: "0.84rem", color: isDark ? "#94a3b8" : "#64748b", marginTop: "0.25rem" }}>
                Payment gate and subscription requirements are bypassed for administrative and trainer accounts.
              </div>
            </div>
            <span style={{
              background: isDark ? "rgba(167, 139, 250, 0.15)" : "#ede9fe",
              color: isDark ? "#c4b5fd" : "#6d28d9",
              border: isDark ? "1px solid rgba(167, 139, 250, 0.35)" : "1px solid #c4b5fd",
              borderRadius: 99,
              padding: "0.35rem 0.85rem",
              fontSize: "0.78rem",
              fontWeight: 800,
            }}>
              EXEMPT
            </span>
          </div>
        ) : graceStatus.isGracePeriod ? (
          /* Grace Period Payment Card (Day 1 & Day 2) */
          <div className="payment-status-card" style={{
            background: isDark
              ? "linear-gradient(135deg, #22173d 0%, #150e29 50%, #0d091b 100%)"
              : "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
            border: isDark ? "1.5px solid rgba(167, 139, 250, 0.45)" : "1.5px solid #fcd34d",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
              <span style={{
                background: isDark ? "rgba(251, 191, 36, 0.15)" : "#fef08a",
                border: isDark ? "1px solid rgba(251, 191, 36, 0.4)" : "1px solid #facc15",
                color: isDark ? "#fbbf24" : "#854d0e",
                fontSize: "0.74rem",
                fontWeight: 800,
                padding: "0.25rem 0.75rem",
                borderRadius: 99,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }} />
                FREE TRIAL: DAY {graceStatus.dayOfMonth} OF 2
              </span>
              <span style={{
                background: isDark ? "rgba(124, 111, 255, 0.15)" : "#ede9fe",
                color: isDark ? "#c4b5fd" : "#6d28d9",
                fontSize: "0.74rem",
                fontWeight: 700,
                padding: "0.25rem 0.65rem",
                borderRadius: 99,
              }}>
                {graceStatus.monthName} {graceStatus.year}
              </span>
            </div>

            <div style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1.25rem",
              marginTop: "0.5rem",
            }}>
              <div style={{ flex: "1 1 320px" }}>
                <h2 style={{ fontSize: "1.3rem", fontWeight: 900, color: isDark ? "#ffffff" : "#0f172a", marginBottom: "0.4rem" }}>
                  Unlock Full {graceStatus.monthName} Membership
                </h2>
                <p style={{ fontSize: "0.88rem", color: isDark ? "#cbd5e1" : "#475569", lineHeight: 1.6, margin: 0 }}>
                  You can submit speaking challenges freely during the 2-day grace period. Pay ₹{planAmount} now via UPI/QR to avoid any service interruption starting Day 3.
                </p>
              </div>

              {/* Countdown & Action */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.75rem" }}>
                {/* Live Countdown */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  background: isDark ? "rgba(0, 0, 0, 0.45)" : "#ffffff",
                  border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #e2e8f0",
                  padding: "0.45rem 0.75rem",
                  borderRadius: 14,
                }}>
                  {days > 0 && (
                    <>
                      <div style={{ textAlign: "center", minWidth: 36 }}>
                        <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#fbbf24", fontFamily: "monospace" }}>
                          {String(days).padStart(2, "0")}
                        </div>
                        <div style={{ fontSize: "0.55rem", color: isDark ? "#94a3b8" : "#64748b", fontWeight: 700 }}>DAYS</div>
                      </div>
                      <span style={{ color: "#fbbf24", fontWeight: 800 }}>:</span>
                    </>
                  )}
                  <div style={{ textAlign: "center", minWidth: 36 }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#fbbf24", fontFamily: "monospace" }}>
                      {String(hours).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: "0.55rem", color: isDark ? "#94a3b8" : "#64748b", fontWeight: 700 }}>HOURS</div>
                  </div>
                  <span style={{ color: "#fbbf24", fontWeight: 800 }}>:</span>
                  <div style={{ textAlign: "center", minWidth: 36 }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#fbbf24", fontFamily: "monospace" }}>
                      {String(minutes).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: "0.55rem", color: isDark ? "#94a3b8" : "#64748b", fontWeight: 700 }}>MINS</div>
                  </div>
                  <span style={{ color: "#fbbf24", fontWeight: 800 }}>:</span>
                  <div style={{ textAlign: "center", minWidth: 36 }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#f87171", fontFamily: "monospace" }}>
                      {String(seconds).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: "0.55rem", color: isDark ? "#94a3b8" : "#64748b", fontWeight: 700 }}>SECS</div>
                  </div>
                </div>

                {/* Pay Button */}
                <button
                  type="button"
                  onClick={handlePay}
                  disabled={paying}
                  style={{
                    background: paying
                      ? "rgba(249, 115, 22, 0.4)"
                      : "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 12,
                    padding: "0.85rem 1.6rem",
                    fontSize: "0.95rem",
                    fontWeight: 800,
                    cursor: paying ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    boxShadow: "0 6px 20px rgba(249, 115, 22, 0.4)",
                    whiteSpace: "nowrap",
                    transition: "transform 0.15s ease",
                  }}
                >
                  {paying ? "Opening Checkout…" : `💳 Pay ₹${planAmount} with UPI / QR`}
                </button>
              </div>
            </div>

            {paymentError && (
              <div style={{ marginTop: "0.85rem", color: "#f87171", fontSize: "0.82rem" }}>
                ⚠️ {paymentError}
              </div>
            )}
            {paymentSuccessMsg && (
              <div style={{ marginTop: "0.85rem", color: "#4ade80", fontSize: "0.82rem", fontWeight: 700 }}>
                {paymentSuccessMsg}
              </div>
            )}
          </div>
        ) : (
          /* Post-Grace Period Payment Card (Day 3 onwards & Unpaid) */
          <div className="payment-status-card" style={{
            background: isDark
              ? "linear-gradient(135deg, #2b0f14 0%, #1f0b0e 100%)"
              : "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
            border: isDark ? "1.5px solid rgba(248, 113, 113, 0.45)" : "1.5px solid #fca5a5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1.25rem",
          }}>
            <div style={{ flex: "1 1 300px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <span style={{
                  background: isDark ? "rgba(248, 113, 113, 0.15)" : "#fecaca",
                  border: isDark ? "1px solid rgba(248, 113, 113, 0.35)" : "1px solid #f87171",
                  color: isDark ? "#f87171" : "#b91c1c",
                  borderRadius: 99,
                  padding: "0.2rem 0.65rem",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                }}>
                  LOCKED
                </span>
                <span style={{ color: isDark ? "rgba(255,255,255,0.7)" : "#475569", fontSize: "0.78rem" }}>
                  {graceStatus.monthName} {graceStatus.year}
                </span>
              </div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a", marginBottom: "0.3rem" }}>
                Monthly Renewal Required
              </h2>
              <p style={{ fontSize: "0.86rem", color: isDark ? "#cbd5e1" : "#475569", lineHeight: 1.5, margin: 0 }}>
                The 2-day free monthly trial has ended. Complete your renewal of ₹{planAmount} to unlock speaking submissions, AI feedback, and community rooms immediately.
              </p>
            </div>

            <div>
              <button
                type="button"
                onClick={handlePay}
                disabled={paying}
                style={{
                  background: paying
                    ? "rgba(124, 111, 255, 0.4)"
                    : "linear-gradient(135deg, #7c6fff 0%, #6366f1 100%)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 14,
                  padding: "0.85rem 1.6rem",
                  fontSize: "0.98rem",
                  fontWeight: 800,
                  cursor: paying ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  boxShadow: "0 6px 20px rgba(124, 111, 255, 0.4)",
                  whiteSpace: "nowrap",
                }}
              >
                {paying ? "Opening Checkout…" : `💳 Pay ₹${planAmount} & Unlock Access`}
              </button>
            </div>

            {paymentError && (
              <div style={{ width: "100%", marginTop: "0.5rem", color: "#f87171", fontSize: "0.82rem" }}>
                ⚠️ {paymentError}
              </div>
            )}
            {paymentSuccessMsg && (
              <div style={{ width: "100%", marginTop: "0.5rem", color: "#4ade80", fontSize: "0.82rem", fontWeight: 700 }}>
                {paymentSuccessMsg}
              </div>
            )}
          </div>
        )}

        {/* ── Section 3: Transaction History & Official Invoices ── */}
        <div className="speakshine-card-box" style={{
          background: isDark ? "#0d0a18" : "#ffffff",
          border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: isDark ? "0 12px 36px rgba(0, 0, 0, 0.45)" : "0 4px 18px rgba(0, 0, 0, 0.04)",
          marginBottom: "1.5rem",
        }}>
          {/* Header */}
          <div style={{
            padding: "1.35rem 1.6rem",
            borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: isDark ? "#ffffff" : "#0f172a", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>💳</span>
                <span>Transaction History &amp; Official Invoices</span>
              </div>
              <div style={{ fontSize: "0.8rem", color: isDark ? "#94a3b8" : "#64748b", marginTop: "0.2rem" }}>
                Official GST-compliant receipts with invoice numbers for all completed payments
              </div>
            </div>
            <div style={{
              fontSize: "0.74rem", color: isDark ? "#c4b5fd" : "#6d28d9",
              background: isDark ? "rgba(124, 111, 255, 0.12)" : "rgba(124, 111, 255, 0.08)",
              borderRadius: 99,
              padding: "0.3rem 0.8rem",
              border: isDark ? "1px solid rgba(124, 111, 255, 0.25)" : "1px solid rgba(124, 111, 255, 0.2)",
              fontWeight: 800,
            }}>
              {transactions.length} record{transactions.length !== 1 ? "s" : ""}
            </div>
          </div>

          {transactions.length === 0 ? (
            /* Empty State */
            <div style={{ textAlign: "center", padding: "4rem 1.5rem", color: isDark ? "#94a3b8" : "#64748b" }}>
              <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>📭</div>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: isDark ? "#ffffff" : "#0f172a", marginBottom: "0.3rem" }}>
                No Transactions Recorded Yet
              </div>
              <div style={{ fontSize: "0.84rem", color: isDark ? "#94a3b8" : "#64748b", maxWidth: 440, margin: "0 auto" }}>
                Payments you complete will appear here with downloadable, print-ready official GST tax invoices.
              </div>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="payment-tx-desktop-table" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                  <thead>
                    <tr style={{
                      borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid #e2e8f0",
                      background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
                    }}>
                      {["Date & Time", "Amount", "Status", "Payment Reference", "Invoice"].map(h => (
                        <th key={h} style={{
                          textAlign: h === "Invoice" ? "center" : "left",
                          padding: "0.95rem 1.25rem",
                          color: isDark ? "#94a3b8" : "#64748b", fontWeight: 800,
                          fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={tx._id || i} style={{
                        borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid #f1f5f9",
                        background: i % 2 === 0 ? "transparent" : isDark ? "rgba(255, 255, 255, 0.015)" : "#fafafa",
                      }}>
                        <td style={{ padding: "0.95rem 1.25rem", color: isDark ? "#94a3b8" : "#64748b", whiteSpace: "nowrap" }}>
                          {formatDate(tx.createdAt)}
                        </td>
                        <td style={{ padding: "0.95rem 1.25rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a", fontSize: "0.98rem" }}>
                          {tx.amount > 0 ? `₹${tx.amount}` : tx.source === "admin" ? "—" : "₹0"}
                        </td>
                        <td style={{ padding: "0.95rem 1.25rem" }}>
                          {statusBadge(tx.status)}
                          {tx.note && (
                            <div style={{ fontSize: "0.7rem", color: isDark ? "#94a3b8" : "#64748b", marginTop: "0.25rem" }}>
                              {tx.note}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "0.95rem 1.25rem", color: isDark ? "#a5b4fc" : "#4f46e5", fontFamily: "monospace", fontSize: "0.8rem" }}>
                          {tx.razorpayPaymentId
                            ? <span title={tx.razorpayPaymentId}>{tx.razorpayPaymentId}</span>
                            : tx.source === "admin" ? "Admin Override" : "—"}
                        </td>
                        <td style={{ padding: "0.95rem 1.25rem", textAlign: "center", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => setSelectedInvoiceTx(tx)}
                            style={{
                              background: isDark ? "rgba(124, 111, 255, 0.12)" : "rgba(124, 111, 255, 0.08)",
                              border: isDark ? "1px solid rgba(124, 111, 255, 0.35)" : "1px solid rgba(124, 111, 255, 0.25)",
                              color: isDark ? "#c4b5fd" : "#6d28d9",
                              borderRadius: 10,
                              padding: "0.4rem 0.95rem",
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = isDark ? "rgba(124, 111, 255, 0.25)" : "rgba(124, 111, 255, 0.18)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isDark ? "rgba(124, 111, 255, 0.12)" : "rgba(124, 111, 255, 0.08)";
                            }}
                          >
                            <span>📄</span> View &amp; Print
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View (Completely fixes awkward horizontal table scrolling on mobile) */}
              <div className="payment-tx-mobile-cards">
                {transactions.map((tx, i) => (
                  <div key={tx._id || i} style={{
                    background: isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
                    border: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.78rem", color: isDark ? "#94a3b8" : "#64748b" }}>
                        {formatDate(tx.createdAt)}
                      </span>
                      {statusBadge(tx.status)}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: "1.2rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a" }}>
                        {tx.amount > 0 ? `₹${tx.amount}` : tx.source === "admin" ? "—" : "₹0"}
                      </span>
                      <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: isDark ? "#a5b4fc" : "#4f46e5" }}>
                        {tx.razorpayPaymentId || (tx.source === "admin" ? "Admin Override" : "—")}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedInvoiceTx(tx)}
                      style={{
                        background: isDark ? "rgba(124, 111, 255, 0.14)" : "rgba(124, 111, 255, 0.08)",
                        border: isDark ? "1px solid rgba(124, 111, 255, 0.35)" : "1px solid rgba(124, 111, 255, 0.25)",
                        color: isDark ? "#c4b5fd" : "#6d28d9",
                        borderRadius: 10,
                        padding: "0.55rem",
                        fontSize: "0.84rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.4rem",
                        marginTop: "0.25rem",
                      }}
                    >
                      <span>📄</span> View &amp; Print Official Invoice
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Section 4: Bank-Grade Trust & Billing FAQ Micro-Cards ── */}
        <div className="payment-trust-grid">
          <div className="payment-trust-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "1.1rem" }}>🛡️</span>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a" }}>
                Bank-Grade 256-Bit Security
              </span>
            </div>
            <p style={{ fontSize: "0.78rem", color: isDark ? "#94a3b8" : "#64748b", lineHeight: 1.5, margin: 0 }}>
              Payments are processed through RBI-authorized Razorpay gateway with 256-bit encryption. UPI, QR codes, and bank cards are supported with zero stored credentials.
            </p>
          </div>

          <div className="payment-trust-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "1.1rem" }}>📄</span>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a" }}>
                Official GST Tax Invoices
              </span>
            </div>
            <p style={{ fontSize: "0.78rem", color: isDark ? "#94a3b8" : "#64748b", lineHeight: 1.5, margin: 0 }}>
              All transactions generate certified GST tax invoices complete with invoice numbers, student details, and timestamped QR reference codes.
            </p>
          </div>

          <div className="payment-trust-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "1.1rem" }}>💬</span>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a" }}>
                Dedicated Billing Support
              </span>
            </div>
            <p style={{ fontSize: "0.78rem", color: isDark ? "#94a3b8" : "#64748b", lineHeight: 1.5, margin: 0 }}>
              Need assistance with payment verification or institutional invoicing? Reach out directly to your cohort trainer or administration anytime.
            </p>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: isDark ? "#64748b" : "#94a3b8", marginTop: "1.75rem" }}>
          Secured by Razorpay · 100% Instant UPI &amp; QR verification · Need help? Contact your trainer.
        </p>

      </div>
    </Layout>
  );
}
