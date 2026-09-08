/**
 * PaymentHistory
 * Shows the logged-in user's payment status, live grace period countdown,
 * instant Razorpay payment / renewal option, and transaction invoices.
 */

import { useEffect, useState, lazy, Suspense } from "react";
import Layout from "../components/Layout.jsx";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
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

      <div style={{ maxWidth: 980, margin: "0 auto", width: "100%" }}>

        {/* ── Active Membership Card (When Paid) ── */}
        {isPaid ? (
          <div style={{
            background: "linear-gradient(135deg, #0d2818 0%, #081c10 100%)",
            border: "1px solid rgba(74, 222, 128, 0.35)",
            borderRadius: 18,
            padding: "1.35rem 1.6rem",
            marginBottom: "1.5rem",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35), 0 0 20px rgba(74, 222, 128, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(74, 222, 128, 0.15)",
                border: "1.5px solid rgba(74, 222, 128, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.4rem",
                color: "#4ade80",
                flexShrink: 0,
              }}>
                ✓
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff" }}>
                    {graceStatus.monthName} Membership Active
                  </span>
                  <span style={{
                    background: "rgba(74, 222, 128, 0.15)",
                    color: "#4ade80",
                    border: "1px solid rgba(74, 222, 128, 0.3)",
                    borderRadius: 10,
                    padding: "0.2rem 0.6rem",
                    fontSize: "0.74rem",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                  }}>
                    UNLOCKED
                  </span>
                </div>
                <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "0.25rem", lineHeight: 1.4 }}>
                  {paidAt ? `Paid on ${formatDate(paidAt)}` : "Monthly subscription active"}
                  {paymentId ? ` · Ref: ${paymentId.slice(-10)}` : ""}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {transactions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceTx(transactions[0])}
                  style={{
                    background: "rgba(74, 222, 128, 0.12)",
                    border: "1px solid rgba(74, 222, 128, 0.35)",
                    color: "#86efac",
                    borderRadius: 12,
                    padding: "0.6rem 1.1rem",
                    fontSize: "0.86rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>📄</span> View Invoice
                </button>
              )}
            </div>
          </div>
        ) : isBypassRole ? (
          <div style={{
            background: "linear-gradient(135deg, #1e1b4b 0%, #17153b 100%)",
            border: "1px solid rgba(167, 139, 250, 0.35)",
            borderRadius: 16,
            padding: "1.25rem 1.5rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#ffffff" }}>
                Staff Role Access ({user?.role?.toUpperCase()})
              </div>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                Payment gate is bypassed for admin and trainer roles.
              </div>
            </div>
            <span style={{
              background: "rgba(167, 139, 250, 0.15)",
              color: "#c4b5fd",
              border: "1px solid rgba(167, 139, 250, 0.3)",
              borderRadius: 10,
              padding: "0.3rem 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 800,
            }}>
              EXEMPT
            </span>
          </div>
        ) : graceStatus.isGracePeriod ? (
          /* ── Grace Period Payment Card (Day 1 & Day 2) ── */
          <div style={{
            background: "linear-gradient(135deg, #1f153a 0%, #150e29 50%, #0d091b 100%)",
            border: "1.5px solid rgba(167, 139, 250, 0.45)",
            borderRadius: 20,
            padding: "1.5rem",
            marginBottom: "1.5rem",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 10px 35px rgba(0, 0, 0, 0.5), 0 0 25px rgba(124, 111, 255, 0.15)",
          }}>
            <div style={{
              position: "absolute", top: -50, right: -50,
              width: 180, height: 180, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(124, 111, 255, 0.25) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
              <span style={{
                background: "rgba(251, 191, 36, 0.15)",
                border: "1px solid rgba(251, 191, 36, 0.4)",
                color: "#fbbf24",
                fontSize: "0.74rem",
                fontWeight: 800,
                padding: "0.25rem 0.7rem",
                borderRadius: 20,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", display: "inline-block" }} />
                FREE TRIAL: DAY {graceStatus.dayOfMonth} OF 2
              </span>
              <span style={{
                background: "rgba(124, 111, 255, 0.15)",
                color: "#c4b5fd",
                fontSize: "0.74rem",
                fontWeight: 700,
                padding: "0.25rem 0.6rem",
                borderRadius: 20,
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
                <h2 style={{ fontSize: "1.25rem", fontWeight: 900, color: "#ffffff", marginBottom: "0.4rem" }}>
                  Unlock Full {graceStatus.monthName} Membership
                </h2>
                <p style={{ fontSize: "0.86rem", color: "#cbd5e1", lineHeight: 1.6, margin: 0 }}>
                  You can upload videos without payment during the first 2 days. Pay ₹{planAmount} now to avoid service interruption starting Day 3.
                </p>
              </div>

              {/* Countdown & Action */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.75rem" }}>
                {/* Live Countdown */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  background: "rgba(0, 0, 0, 0.45)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  padding: "0.45rem 0.75rem",
                  borderRadius: 14,
                }}>
                  {days > 0 && (
                    <>
                      <div style={{ textAlign: "center", minWidth: 36 }}>
                        <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#fbbf24", fontFamily: "monospace" }}>
                          {String(days).padStart(2, "0")}
                        </div>
                        <div style={{ fontSize: "0.55rem", color: "var(--muted)", fontWeight: 700 }}>DAYS</div>
                      </div>
                      <span style={{ color: "#fbbf24", fontWeight: 800 }}>:</span>
                    </>
                  )}
                  <div style={{ textAlign: "center", minWidth: 36 }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#fbbf24", fontFamily: "monospace" }}>
                      {String(hours).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: "0.55rem", color: "var(--muted)", fontWeight: 700 }}>HOURS</div>
                  </div>
                  <span style={{ color: "#fbbf24", fontWeight: 800 }}>:</span>
                  <div style={{ textAlign: "center", minWidth: 36 }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#fbbf24", fontFamily: "monospace" }}>
                      {String(minutes).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: "0.55rem", color: "var(--muted)", fontWeight: 700 }}>MINS</div>
                  </div>
                  <span style={{ color: "#fbbf24", fontWeight: 800 }}>:</span>
                  <div style={{ textAlign: "center", minWidth: 36 }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#f87171", fontFamily: "monospace" }}>
                      {String(seconds).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: "0.55rem", color: "var(--muted)", fontWeight: 700 }}>SECS</div>
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
                  {paying ? "Opening Checkout…" : `💳 Pay ₹${planAmount} Now`}
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
          /* ── Post-Grace Period Payment Card (Day 3 onwards & Unpaid) ── */
          <div style={{
            background: "linear-gradient(135deg, #2b0f14 0%, #1f0b0e 100%)",
            border: "1.5px solid rgba(248, 113, 113, 0.45)",
            borderRadius: 20,
            padding: "1.5rem",
            marginBottom: "1.5rem",
            boxShadow: "0 10px 35px rgba(0, 0, 0, 0.5), 0 0 20px rgba(248, 113, 113, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1.25rem",
          }}>
            <div style={{ flex: "1 1 300px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <span style={{
                  background: "rgba(248, 113, 113, 0.15)",
                  border: "1px solid rgba(248, 113, 113, 0.35)",
                  color: "#f87171",
                  borderRadius: 20,
                  padding: "0.2rem 0.6rem",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                }}>
                  LOCKED
                </span>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.78rem" }}>
                  {graceStatus.monthName} {graceStatus.year}
                </span>
              </div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ffffff", marginBottom: "0.3rem" }}>
                Payment Required
              </h2>
              <p style={{ fontSize: "0.84rem", color: "#cbd5e1", lineHeight: 1.5, margin: 0 }}>
                The 2-day free monthly trial has ended. Complete your payment of ₹{planAmount} to unlock speaking submissions and AI speech analysis immediately.
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

        {/* ── Transaction History Table ── */}
        <div style={{
          background: "var(--bg-card, #10101e)",
          border: "1px solid var(--border, #1e1e3a)",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
        }}>
          <div style={{
            padding: "1.1rem 1.4rem",
            borderBottom: "1px solid var(--border, #1e1e3a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)" }}>
                💳 Transaction History &amp; Official Invoices
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                Official GST-compliant receipts for all completed payments
              </div>
            </div>
            <div style={{
              fontSize: "0.74rem", color: "var(--muted)",
              background: "rgba(124,111,255,0.1)", borderRadius: 10,
              padding: "0.25rem 0.7rem", border: "1px solid rgba(124,111,255,0.2)",
              fontWeight: 700,
            }}>
              {transactions.length} record{transactions.length !== 1 ? "s" : ""}
            </div>
          </div>

          {transactions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3.5rem 1rem", color: "var(--muted)", fontSize: "0.9rem" }}>
              <div style={{ fontSize: "2.8rem", marginBottom: "0.75rem" }}>📭</div>
              <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: "0.25rem" }}>No Transactions Yet</div>
              <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                Payments you make will appear here with downloadable official receipts.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border, #1e1e3a)", background: "rgba(255, 255, 255, 0.02)" }}>
                    {["Date & Time", "Amount", "Status", "Payment Reference", "Invoice"].map(h => (
                      <th key={h} style={{
                        textAlign: h === "Invoice" ? "center" : "left",
                        padding: "0.85rem 1.1rem",
                        color: "var(--muted)", fontWeight: 700,
                        fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, i) => (
                    <tr key={tx._id || i} style={{
                      borderBottom: "1px solid var(--border, #1e1e3a)",
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    }}>
                      <td style={{ padding: "0.85rem 1.1rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatDate(tx.createdAt)}
                      </td>
                      <td style={{ padding: "0.85rem 1.1rem", fontWeight: 800, color: "#ffffff", fontSize: "0.95rem" }}>
                        {tx.amount > 0 ? `₹${tx.amount}` : tx.source === "admin" ? "—" : "₹0"}
                      </td>
                      <td style={{ padding: "0.85rem 1.1rem" }}>
                        {statusBadge(tx.status)}
                        {tx.note && (
                          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                            {tx.note}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "0.85rem 1.1rem", color: "#a5b4fc", fontFamily: "monospace", fontSize: "0.78rem" }}>
                        {tx.razorpayPaymentId
                          ? <span title={tx.razorpayPaymentId}>{tx.razorpayPaymentId}</span>
                          : tx.source === "admin" ? "Admin Override" : "—"}
                      </td>
                      <td style={{ padding: "0.85rem 1.1rem", textAlign: "center", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => setSelectedInvoiceTx(tx)}
                          style={{
                            background: "rgba(124, 111, 255, 0.12)",
                            border: "1px solid rgba(124, 111, 255, 0.35)",
                            color: "#c4b5fd",
                            borderRadius: 10,
                            padding: "0.35rem 0.85rem",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(124, 111, 255, 0.25)";
                            e.currentTarget.style.color = "#fff";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(124, 111, 255, 0.12)";
                            e.currentTarget.style.color = "#c4b5fd";
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
          )}
        </div>

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--muted)", marginTop: "1.5rem" }}>
          Secured by Razorpay · 100% Instant UPI &amp; QR verification · Need help? Contact your trainer.
        </p>
      </div>
    </Layout>
  );
}
