/**
 * MonthlyGraceCountdown
 * 
 * Displayed in Video Analysis during the initial 2-day free upload window of each month.
 * Shows a live ticking countdown timer, free access indicator, and direct Razorpay payment action.
 */

import { useState, useEffect, lazy, Suspense } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { getMonthlyGracePeriodStatus, formatRemainingTime } from "../utils/gracePeriodUtils.js";

const InvoiceModal = lazy(() => import("./InvoiceModal.jsx"));

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

export default function MonthlyGraceCountdown({ onPaymentSuccess }) {
  const { user, login } = useAuth();
  const themeContext = useTheme();
  const isDark = themeContext ? themeContext.isDark : (document.documentElement.getAttribute("data-theme") !== "light" && !document.documentElement.classList.contains("light"));
  const [status, setStatus] = useState(() => getMonthlyGracePeriodStatus());
  const [planAmount, setPlanAmount] = useState(DEFAULT_PLAN_AMOUNT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [justPaid, setJustPaid] = useState(false);
  const [successTx, setSuccessTx] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Fetch configured payment amount
  useEffect(() => {
    api.get("/payments/config")
      .then(({ data }) => {
        const amount = Number(data?.amount);
        if (Number.isFinite(amount) && amount >= 1) setPlanAmount(amount);
      })
      .catch(() => {});
  }, []);

  // Update countdown every 1 second
  useEffect(() => {
    const updateCountdown = () => {
      const current = getMonthlyGracePeriodStatus();
      setStatus(current);
    };

    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const isBypassRole = ["admin", "admins", "trainer", "viewer"].includes(user?.role);
  const isPaid = Boolean(user?.paid) || justPaid;

  // If role is admin/trainer or grace period is over and user not paid, don't show the grace banner here (PaymentWall handles hard gates)
  if (isBypassRole) {
    return null;
  }

  // If already paid for this month, show sleek active membership badge
  if (isPaid) {
    return (
      <>
        {showInvoiceModal && successTx && (
          <Suspense fallback={null}>
            <InvoiceModal
              transaction={successTx}
              user={user}
              onClose={() => setShowInvoiceModal(false)}
            />
          </Suspense>
        )}
        <div style={{
          background: isDark
            ? "linear-gradient(135deg, rgba(16, 40, 24, 0.85) 0%, rgba(10, 26, 16, 0.85) 100%)"
            : "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f0fdfa 100%)",
          border: isDark
            ? "1px solid rgba(74, 222, 128, 0.35)"
            : "1.5px solid #86efac",
          borderRadius: 16,
          padding: "0.9rem 1.25rem",
          marginBottom: "1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
          boxShadow: isDark
            ? "0 6px 20px rgba(0, 0, 0, 0.25), 0 0 15px rgba(74, 222, 128, 0.08)"
            : "0 4px 18px rgba(34, 197, 94, 0.12), 0 1px 3px rgba(0, 0, 0, 0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: isDark ? "rgba(74, 222, 128, 0.15)" : "#22c55e",
              border: isDark ? "1px solid rgba(74, 222, 128, 0.4)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.1rem",
              color: isDark ? "#4ade80" : "#ffffff",
              boxShadow: isDark ? "none" : "0 2px 8px rgba(34, 197, 94, 0.35)",
              flexShrink: 0,
            }}>
              ✓
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.92rem", fontWeight: 800, color: isDark ? "#ffffff" : "#0f172a" }}>
                  {status.monthName} Membership Active
                </span>
                <span style={{
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  color: isDark ? "#4ade80" : "#15803d",
                  background: isDark ? "rgba(74, 222, 128, 0.15)" : "#dcfce7",
                  border: isDark ? "1px solid rgba(74, 222, 128, 0.3)" : "1px solid #86efac",
                  padding: "0.15rem 0.5rem",
                  borderRadius: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}>
                  Paid Member
                </span>
              </div>
              <div style={{ fontSize: "0.78rem", color: isDark ? "#94a3b8" : "#475569", marginTop: "0.15rem" }}>
                Unlimited speaking submissions and AI evaluations active for all of {status.monthName} {status.year}.
              </div>
            </div>
          </div>

          {successTx && (
            <button
              type="button"
              onClick={() => setShowInvoiceModal(true)}
              style={{
                background: isDark ? "rgba(74, 222, 128, 0.12)" : "#ffffff",
                border: isDark ? "1px solid rgba(74, 222, 128, 0.35)" : "1.5px solid #86efac",
                color: isDark ? "#86efac" : "#15803d",
                borderRadius: 10,
                padding: "0.45rem 0.9rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                boxShadow: isDark ? "none" : "0 1px 3px rgba(34, 197, 94, 0.15)",
                transition: "all 0.15s ease",
              }}
            >
              <span>📄</span> Invoice
            </button>
          )}
        </div>
      </>
    );
  }

  // If outside initial 2 days and unpaid, the route or wall handles it
  if (!status.isGracePeriod) {
    return null;
  }

  const { days, hours, minutes, seconds } = status.countdown;

  const handlePay = async () => {
    setError(null);
    setLoading(true);

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setError("Payment system failed to load. Please check your internet connection.");
      setLoading(false);
      return;
    }

    try {
      const { data: order } = await api.post("/payments/create-order");

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "Speak & Shine",
        description: `${status.monthName} ${status.year} Membership`,
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

            setSuccessTx(txObj);
            setJustPaid(true);

            if (user) {
              login({ ...user, paid: true });
            }
            if (onPaymentSuccess) {
              onPaymentSuccess();
            }
          } catch (verifyErr) {
            const errStatus = verifyErr?.response?.status;
            const errMsg = verifyErr?.response?.data?.error || "";
            if (errStatus === 409 || errMsg.includes("already been processed")) {
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
              setSuccessTx(txObj);
              setJustPaid(true);
              if (user) login({ ...user, paid: true });
              if (onPaymentSuccess) onPaymentSuccess();
            } else {
              setError(errMsg || "Payment verification failed. Please contact support.");
            }
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
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
        setLoading(false);
        setError(res.error?.description || "Payment failed. Please try again.");
      });
      rzp.open();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not initiate payment. Please try again.");
      setLoading(false);
    }
  };

  return (
    <>
      {showInvoiceModal && successTx && (
        <Suspense fallback={null}>
          <InvoiceModal
            transaction={successTx}
            user={user}
            onClose={() => setShowInvoiceModal(false)}
          />
        </Suspense>
      )}

      <div style={{
        background: isDark
          ? "linear-gradient(135deg, #1c1438 0%, #150f28 50%, #0d0a1c 100%)"
          : "linear-gradient(135deg, #faf5ff 0%, #f5f3ff 50%, #ede9fe 100%)",
        border: isDark
          ? "1.5px solid rgba(167, 139, 250, 0.4)"
          : "1.5px solid #c4b5fd",
        borderRadius: 20,
        padding: "1.25rem 1.5rem",
        marginBottom: "1.25rem",
        position: "relative",
        overflow: "hidden",
        boxShadow: isDark
          ? "0 10px 30px rgba(0, 0, 0, 0.5), 0 0 25px rgba(124, 111, 255, 0.15)"
          : "0 10px 30px rgba(109, 40, 217, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
      }}>
        {/* Glow ambient background decoration */}
        <div style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: isDark
            ? "radial-gradient(circle, rgba(124, 111, 255, 0.22) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(167, 139, 250, 0.25) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}>
          {/* Left Column: Title and info */}
          <div style={{ flex: "1 1 320px", minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span style={{
                background: isDark ? "rgba(251, 191, 36, 0.15)" : "#fef3c7",
                border: isDark ? "1px solid rgba(251, 191, 36, 0.4)" : "1px solid #fcd34d",
                color: isDark ? "#fbbf24" : "#b45309",
                fontSize: "0.74rem",
                fontWeight: 800,
                padding: "0.2rem 0.6rem",
                borderRadius: 20,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                letterSpacing: "0.03em",
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: isDark ? "#fbbf24" : "#f59e0b",
                  display: "inline-block",
                  animation: "pulse 1.5s infinite",
                }} />
                FREE TRIAL: DAY {status.dayOfMonth} OF 2
              </span>

              <span style={{
                background: isDark ? "rgba(124, 111, 255, 0.15)" : "#ede9fe",
                border: isDark ? "none" : "1px solid #ddd6fe",
                color: isDark ? "#c4b5fd" : "#6d28d9",
                fontSize: "0.72rem",
                fontWeight: 700,
                padding: "0.2rem 0.55rem",
                borderRadius: 20,
              }}>
                {status.monthName} {status.year}
              </span>
            </div>

            <h3 style={{
              fontSize: "1.15rem",
              fontWeight: 800,
              color: isDark ? "#ffffff" : "#1e1b4b",
              marginBottom: "0.35rem",
              lineHeight: 1.3,
            }}>
              Free Upload Window Active
            </h3>

            <p style={{
              color: isDark ? "#cbd5e1" : "#475569",
              fontSize: "0.84rem",
              lineHeight: 1.5,
              margin: 0,
            }}>
              You can upload and practice speaking for free during the first 2 days of {status.monthName}.
              Pay ₹{planAmount} now to avoid upload lock starting Day 3 (midnight).
            </p>
          </div>

          {/* Right Column: Countdown blocks & Pay button */}
          <div style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.85rem",
            justifyContent: "flex-end",
          }}>
            {/* Live Countdown Display */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              background: isDark ? "rgba(0, 0, 0, 0.4)" : "#ffffff",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1.5px solid #e2e8f0",
              boxShadow: isDark ? "none" : "0 2px 8px rgba(0, 0, 0, 0.04)",
              padding: "0.45rem 0.65rem",
              borderRadius: 14,
            }}>
              {days > 0 && (
                <>
                  <div style={{ textAlign: "center", minWidth: 38 }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900, color: isDark ? "#fbbf24" : "#7c3aed", fontFamily: "monospace" }}>
                      {String(days).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: "0.58rem", color: isDark ? "var(--muted)" : "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                      DAYS
                    </div>
                  </div>
                  <span style={{ color: isDark ? "#fbbf24" : "#a78bfa", fontWeight: 800, fontSize: "0.9rem" }}>:</span>
                </>
              )}

              <div style={{ textAlign: "center", minWidth: 38 }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 900, color: isDark ? "#fbbf24" : "#7c3aed", fontFamily: "monospace" }}>
                  {String(hours).padStart(2, "0")}
                </div>
                <div style={{ fontSize: "0.58rem", color: isDark ? "var(--muted)" : "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                  HOURS
                </div>
              </div>

              <span style={{ color: isDark ? "#fbbf24" : "#a78bfa", fontWeight: 800, fontSize: "0.9rem" }}>:</span>

              <div style={{ textAlign: "center", minWidth: 38 }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 900, color: isDark ? "#fbbf24" : "#7c3aed", fontFamily: "monospace" }}>
                  {String(minutes).padStart(2, "0")}
                </div>
                <div style={{ fontSize: "0.58rem", color: isDark ? "var(--muted)" : "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                  MINS
                </div>
              </div>

              <span style={{ color: isDark ? "#fbbf24" : "#a78bfa", fontWeight: 800, fontSize: "0.9rem" }}>:</span>

              <div style={{ textAlign: "center", minWidth: 38 }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 900, color: isDark ? "#f87171" : "#dc2626", fontFamily: "monospace" }}>
                  {String(seconds).padStart(2, "0")}
                </div>
                <div style={{ fontSize: "0.58rem", color: isDark ? "var(--muted)" : "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                  SECS
                </div>
              </div>
            </div>

            {/* Pay Button */}
            <button
              type="button"
              onClick={handlePay}
              disabled={loading}
              style={{
                background: loading
                  ? "rgba(124, 111, 255, 0.4)"
                  : "linear-gradient(135deg, #7c6fff 0%, #6366f1 100%)",
                color: "#ffffff",
                border: "none",
                borderRadius: 12,
                padding: "0.75rem 1.25rem",
                fontSize: "0.92rem",
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                boxShadow: "0 6px 18px rgba(124, 111, 255, 0.4)",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? (
                <span>Processing…</span>
              ) : (
                <>
                  <span>💳</span>
                  <span>Pay ₹{planAmount} Now</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error message if payment failed */}
        {error && (
          <div style={{
            marginTop: "0.75rem",
            background: isDark ? "rgba(248, 113, 113, 0.12)" : "#fef2f2",
            border: isDark ? "1px solid rgba(248, 113, 113, 0.35)" : "1px solid #fecaca",
            borderRadius: 10,
            padding: "0.5rem 0.85rem",
            color: isDark ? "#f87171" : "#dc2626",
            fontSize: "0.8rem",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}
      </div>
    </>
  );
}
