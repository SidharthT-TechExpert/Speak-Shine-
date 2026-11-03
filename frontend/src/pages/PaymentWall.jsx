/**
 * PaymentWall
 * Shown to unpaid users when they try to access a gated feature.
 * Unified, responsive, high-aesthetic SaaS checkout experience.
 * Fully respects wallet cash value (tax-free) and Razorpay UPI payments.
 */

import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client.js";
import Layout from "../components/Layout.jsx";
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

export default function PaymentWall({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paid, setPaid] = useState(false);
  const [successTx, setSuccessTx] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [failed, setFailed] = useState(false);
  const [graceStatus] = useState(() => getMonthlyGracePeriodStatus());
  const navigate = useNavigate();
  const { updateUser, user } = useAuth();

  const [walletBalance, setWalletBalance] = useState(0);
  const [walletHistory, setWalletHistory] = useState([]);
  const [showWalletHistoryModal, setShowWalletHistoryModal] = useState(false);
  const [showWalletConfirmModal, setShowWalletConfirmModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("wallet");
  const [pricing, setPricing] = useState({
    coursePrice: DEFAULT_PLAN_AMOUNT,
    taxAmount: 0,
    totalAmount: DEFAULT_PLAN_AMOUNT,
  });

  useEffect(() => {
    api.get("/payments/config")
      .then(({ data }) => {
        const cp = Number(data?.coursePrice ?? data?.amount ?? DEFAULT_PLAN_AMOUNT);
        const tx = Number(data?.taxAmount ?? 0);
        const tot = Number(data?.totalAmount ?? (cp + tx));
        setPricing({ coursePrice: cp, taxAmount: tx, totalAmount: tot });
      })
      .catch(() => {});

    api.get("/payments/wallet")
      .then(({ data }) => {
        if (data?.success) {
          const bal = Number(data.walletBalance) || 0;
          setWalletBalance(bal);
          setWalletHistory(data.walletHistory || []);
          if (bal <= 0) setPaymentMethod("upi");
        }
      })
      .catch(() => {});
  }, []);

  const coursePrice = pricing.coursePrice;
  const taxAmount   = pricing.taxAmount;
  const totalAmount = pricing.totalAmount;

  const useWallet           = paymentMethod === "wallet" && walletBalance > 0;
  const isFullWalletCoverage = useWallet && walletBalance >= coursePrice;
  const walletDiscount      = useWallet ? Math.round(Math.min(walletBalance, coursePrice) * 100) / 100 : 0;
  const netPayable          = isFullWalletCoverage ? 0
    : useWallet ? Math.round(Math.max(0, (coursePrice - walletDiscount) + taxAmount) * 100) / 100
    : totalAmount;
  const remainingWallet = isFullWalletCoverage
    ? Math.round(Math.max(0, walletBalance - coursePrice) * 100) / 100
    : Math.round(Math.max(0, walletBalance - walletDiscount) * 100) / 100;

  const handlePay = async () => {
    setError(null);
    if (useWallet && isFullWalletCoverage) { setShowWalletConfirmModal(true); return; }
    await executeOrder({ confirmWalletPayment: false });
  };

  const handleConfirmWalletPayment = async () => {
    setShowWalletConfirmModal(false);
    await executeOrder({ confirmWalletPayment: true });
  };

  const executeOrder = async ({ confirmWalletPayment = false } = {}) => {
    setError(null);
    setLoading(true);
    try {
      const { data: order } = await api.post("/payments/create-order", {
        useWallet, paymentMethod, confirmWalletPayment,
      });

      if (order.requiresConfirmation && !confirmWalletPayment) {
        setLoading(false); setShowWalletConfirmModal(true); return;
      }

      if (order.walletCovered) {
        const txObj = {
          name: user?.name || user?.registeredName || "Student Member",
          phone: user?.phone,
          amount: coursePrice,
          totalFee: order.totalFee || coursePrice,
          coursePrice: order.coursePrice || coursePrice,
          taxAmount: 0,
          walletDiscountApplied: order.walletDiscountApplied || order.coursePrice || coursePrice,
          isWalletCovered: true,
          razorpayOrderId: "wallet_payment",
          razorpayPaymentId: "wallet_covered",
          status: "success", source: "wallet",
          createdAt: new Date().toISOString(),
        };
        setSuccessTx(txObj); setPaid(true);
        const newBal = order.walletBalance ?? remainingWallet;
        setWalletBalance(newBal);
        if (updateUser) updateUser({ paid: true, walletBalance: newBal });
        setLoading(false); return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setError("Payment system failed to load. Please check your internet connection and try again.");
        setLoading(false); return;
      }

      const options = {
        key: order.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount, currency: order.currency,
        name: "Speak & Shine",
        description: order.walletDiscountApplied > 0
          ? `Premium Membership (₹${order.walletDiscountApplied} Wallet Cash Applied)`
          : "Premium Membership",
        image: "/icons/icon-192.png",
        order_id: order.order_id,
        config: {
          display: {
            blocks: { upiBlock: { name: "Pay via UPI / QR Code", instruments: [{ method: "upi" }] } },
            sequence: ["block.upiBlock"],
            preferences: { show_default_blocks: false },
          },
        },
        method: { upi: true, card: false, netbanking: false, wallet: false, emi: false, paylater: false },
        handler: async (response) => {
          try {
            await api.post("/payments/verify", {
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
            });
            const txObj = {
              name: user?.name || user?.registeredName || "Student Member",
              phone: user?.phone,
              amount: order.netPayableINR ?? Math.max(0, totalAmount - (order.walletDiscountApplied || 0)),
              totalFee: order.totalFee || totalAmount,
              coursePrice, taxAmount,
              walletDiscountApplied: order.walletDiscountApplied || 0,
              isWalletCovered: false,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              status: "success", source: "razorpay",
              createdAt: new Date().toISOString(),
            };
            setSuccessTx(txObj); setPaid(true);
            if (updateUser) updateUser({ paid: true });
          } catch (verifyErr) {
            const errStatus = verifyErr?.response?.status;
            const errMsg    = verifyErr?.response?.data?.error || "";
            if (errStatus === 409 || errMsg.includes("already been processed")) {
              const txObj = {
                name: user?.name || user?.registeredName || "Student Member",
                phone: user?.phone,
                amount: order.netPayableINR ?? Math.max(0, totalAmount - (order.walletDiscountApplied || 0)),
                totalFee: order.totalFee || totalAmount,
                coursePrice, taxAmount,
                walletDiscountApplied: order.walletDiscountApplied || 0,
                isWalletCovered: false,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                status: "success", source: "razorpay",
                createdAt: new Date().toISOString(),
              };
              setSuccessTx(txObj); setPaid(true);
              if (updateUser) updateUser({ paid: true });
            } else {
              setError(errMsg || "Payment verification failed. Please contact support.");
            }
          } finally { setLoading(false); }
        },
        modal: { ondismiss: () => { setLoading(false); setError("Payment cancelled. You can try again anytime."); } },
        prefill: { name: user?.name || "", contact: user?.phone || "" },
        theme: { color: "#8B5CF6" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response) => {
        setLoading(false); setFailed(true);
        setError(response.error?.description || "Payment failed. Please try a different payment method.");
      });
      rzp.open();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not initiate payment. Please try again.");
      setLoading(false);
    }
  };

  const handleContinueToDashboard = () => {
    if (updateUser) updateUser({ paid: true });
    if (onSuccess) onSuccess();
    else navigate("/video-analysis", { replace: true });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FAILED SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (failed) {
    return (
      <Layout title="Payment Failed">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center", padding: "3rem 1.5rem", maxWidth: 400, margin: "0 auto" }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, marginBottom: 24, boxShadow: "0 0 40px rgba(239,68,68,0.15)" }}>
            ✕
          </div>
          <h2 style={{ color: "var(--text)", fontSize: "1.6rem", fontWeight: 900, marginBottom: "0.75rem", letterSpacing: "-0.02em" }}>Payment Unsuccessful</h2>
          <p style={{ color: "var(--text2)", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.7 }}>
            {error || "Something went wrong while processing your transaction."}
          </p>
          <div style={{ width: "100%", padding: "1rem 1.25rem", borderRadius: 14, background: "var(--card)", border: "1px solid var(--border)", fontSize: "0.8rem", color: "var(--text2)", marginBottom: "1.75rem", lineHeight: 1.7 }}>
            No money was deducted. You can safely retry or use your wallet balance.
          </div>
          <button
            type="button"
            onClick={() => { setFailed(false); setError(null); }}
            style={{ width: "100%", padding: "1rem 1.5rem", borderRadius: 14, background: "var(--primary)", border: "none", color: "#fff", fontWeight: 800, fontSize: "0.9rem", cursor: "pointer", boxShadow: "0 6px 28px rgba(139,92,246,0.35)", marginBottom: "0.75rem", transition: "opacity 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >
            🔄 Try Again
          </button>
          <button type="button" onClick={() => navigate("/dashboard")}
            style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "0.8rem", cursor: "pointer" }}>
            Return to Dashboard
          </button>
        </div>
      </Layout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUCCESS SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (paid) {
    const isWallet = successTx?.isWalletCovered || successTx?.source === "wallet";
    return (
      <Layout title="Access Unlocked">
        {showInvoiceModal && (
          <Suspense fallback={null}>
            <InvoiceModal transaction={successTx} user={user} onClose={() => setShowInvoiceModal(false)} />
          </Suspense>
        )}
        <div style={{ maxWidth: 540, margin: "3rem auto", padding: "0 1.25rem" }}>
          <div style={{ position: "relative", borderRadius: 24, border: "1px solid rgba(34,197,94,0.2)", background: "linear-gradient(160deg, #0a1510 0%, #060c09 100%)", padding: "2.5rem", boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 60px rgba(34,197,94,0.08)", textAlign: "center", overflow: "hidden" }}>
            {/* Top shimmer */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(34,197,94,0.5), transparent)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 280, height: 280, background: "radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

            <div style={{ position: "relative" }}>
              <div style={{ width: 72, height: 72, margin: "0 auto 1.25rem", borderRadius: 20, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "#22c55e", boxShadow: "0 0 40px rgba(34,197,94,0.2)" }}>✓</div>

              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 99, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80", fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1.25rem" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", animation: "pulse 2s infinite" }} />
                Membership Activated
              </div>

              <h1 style={{ color: "var(--text)", fontSize: "1.75rem", fontWeight: 900, letterSpacing: "-0.025em", marginBottom: "0.75rem", fontFamily: "'Playfair Display', serif" }}>
                Welcome to the Cohort!
              </h1>
              <p style={{ color: "var(--text2)", fontSize: "0.875rem", lineHeight: 1.75, marginBottom: "2rem", maxWidth: 420, margin: "0 auto 2rem" }}>
                Your 30-day Speak &amp; Shine full pass is now active. Daily AI speech evaluation, live practice rooms, and fluency metrics are fully unlocked.
              </p>

              {/* Receipt card */}
              <div style={{ borderRadius: 16, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", padding: "1.25rem", textAlign: "left", marginBottom: "1.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "0.875rem", borderBottom: "1px solid var(--border)", marginBottom: "0.875rem" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)" }}>Payment Summary</span>
                  <span style={{ fontSize: "0.7rem", fontWeight: 800, padding: "4px 10px", borderRadius: 99, background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}>
                    {isWallet ? "Wallet Cash" : "UPI Gateway"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--text2)", marginBottom: "0.625rem" }}>
                  <span>Course Price</span><span style={{ fontWeight: 700, color: "var(--text)" }}>₹{coursePrice}</span>
                </div>

                {isWallet ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "#4ade80", fontWeight: 600, marginBottom: "0.625rem" }}>
                      <span>Paid via Wallet Cash</span><span>−₹{coursePrice}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted)", paddingTop: "0.625rem", borderTop: "1px solid var(--border)" }}>
                      <span>Remaining Wallet Balance</span><span style={{ fontWeight: 700, color: "var(--text)" }}>₹{walletBalance}</span>
                    </div>
                  </>
                ) : (
                  <>
                    {taxAmount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--text2)", marginBottom: "0.625rem" }}>
                        <span>Tax / GST</span><span>₹{taxAmount}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", fontWeight: 700, paddingTop: "0.625rem", borderTop: "1px solid var(--border)", color: "var(--text)" }}>
                      <span>Total Paid</span><span style={{ color: "#4ade80", fontSize: "1rem" }}>₹{successTx?.amount ?? totalAmount}</span>
                    </div>
                  </>
                )}

                {successTx?.razorpayPaymentId && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", paddingTop: "0.625rem", borderTop: "1px solid var(--border)", marginTop: "0.625rem" }}>
                    <span>Reference ID</span><span style={{ fontFamily: "monospace", color: "var(--primary-light)" }}>{successTx.razorpayPaymentId}</span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button type="button" onClick={handleContinueToDashboard}
                  style={{ flex: 1, minWidth: 160, padding: "1rem 1.5rem", borderRadius: 14, background: "var(--cta)", border: "none", color: "#fff", fontWeight: 800, fontSize: "0.9rem", cursor: "pointer", boxShadow: "0 6px 28px rgba(255,122,24,0.4)", transition: "opacity 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  🚀 Start Speaking Challenges
                </button>
                <button type="button" onClick={() => setShowInvoiceModal(true)}
                  style={{ padding: "1rem 1.25rem", borderRadius: 14, background: "var(--card2)", border: "1px solid var(--border)", color: "var(--text)", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", transition: "opacity 0.15s", display: "flex", alignItems: "center", gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  📄 Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN CHECKOUT VIEW
  // ─────────────────────────────────────────────────────────────────────────

  const isWalletSelected = paymentMethod === "wallet";
  const ctaLabel = loading ? "Processing…"
    : isWalletSelected ? `Pay ₹${coursePrice} via Wallet Cash`
    : `Pay ₹${totalAmount} via UPI`;

  return (
    <Layout title="Unlock Full Access">

      {/* ── Wallet Confirm Modal ── */}
      {showWalletConfirmModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)" }}>
          <div style={{ width: "100%", maxWidth: 380, borderRadius: 24, background: "var(--card)", border: "1px solid rgba(34,197,94,0.25)", padding: "2rem", boxShadow: "0 40px 80px rgba(0,0,0,0.8), 0 0 40px rgba(34,197,94,0.08)", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 1rem", boxShadow: "0 0 30px rgba(34,197,94,0.15)" }}>👛</div>
            <h3 style={{ color: "var(--text)", fontSize: "1.1rem", fontWeight: 900, marginBottom: "0.5rem", letterSpacing: "-0.02em" }}>Confirm Wallet Payment</h3>
            <p style={{ color: "var(--text2)", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.7 }}>
              Deduct <strong style={{ color: "#4ade80" }}>₹{coursePrice}</strong> from your earned wallet cash to activate 30-day cohort membership?
            </p>
            <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, padding: "1rem", marginBottom: "1.5rem" }}>
              {[
                ["Current Wallet Balance", `₹${walletBalance}`, "var(--text)"],
                ["Deduction (Course Price)", `−₹${coursePrice}`, "#4ade80"],
                ["Tax / GST", "Waived · ₹0", "#4ade80"],
              ].map(([label, val, color]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text2)", marginBottom: "0.5rem" }}>
                  <span>{label}</span><span style={{ fontWeight: 700, color }}>{val}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", paddingTop: "0.625rem", borderTop: "1px solid var(--border)", fontWeight: 700 }}>
                <span style={{ color: "var(--text2)" }}>Balance After Payment</span>
                <span style={{ color: "#4ade80" }}>₹{remainingWallet}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button type="button" onClick={() => setShowWalletConfirmModal(false)} disabled={loading}
                style={{ flex: 1, padding: "0.875rem", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card2)", color: "var(--text2)", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={handleConfirmWalletPayment} disabled={loading}
                style={{ flex: 1.6, padding: "0.875rem", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 800, fontSize: "0.875rem", cursor: "pointer", boxShadow: "0 4px 20px rgba(34,197,94,0.35)" }}>
                {loading ? "Activating…" : `Confirm · Pay ₹${coursePrice}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wallet History Modal ── */}
      {showWalletHistoryModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)" }}>
          <div style={{ width: "100%", maxWidth: 520, maxHeight: "85vh", borderRadius: 24, background: "var(--card)", border: "1px solid var(--border3)", padding: "1.75rem", boxShadow: "0 40px 80px rgba(0,0,0,0.8)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "1rem", marginBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "1.5rem" }}>👛</span>
                <h3 style={{ color: "var(--text)", fontWeight: 900, fontSize: "1rem", letterSpacing: "-0.01em" }}>Wallet &amp; Referral History</h3>
              </div>
              <button type="button" onClick={() => setShowWalletHistoryModal(false)}
                style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--card2)", border: "1px solid var(--border)", color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "0.875rem" }}>
                ✕
              </button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {walletHistory.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--muted)", fontSize: "0.875rem" }}>No wallet transactions recorded yet.</div>
              ) : (
                [...walletHistory].reverse().map((tx, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem", borderRadius: 12, background: "var(--card2)", border: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>{tx.reason || "Wallet transaction"}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 2 }}>
                        {new Date(tx.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {" · "}Balance: ₹{tx.balanceAfter}
                      </div>
                    </div>
                    <span style={{ fontSize: "0.8rem", fontWeight: 800, padding: "4px 10px", borderRadius: 8, border: "1px solid", color: tx.type === "credit" ? "#4ade80" : "#f87171", background: tx.type === "credit" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", borderColor: tx.type === "credit" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)" }}>
                      {tx.type === "credit" ? `+₹${tx.amount}` : `−₹${tx.amount}`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PAGE WRAPPER ── */}
      <div style={{ padding: "2rem 1.25rem 4rem", maxWidth: 1080, margin: "0 auto" }}>

        {/* Page header — matches community page style */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 99, background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--primary-light)", fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1rem" }}>
            <span style={{ color: "#f59e0b" }}>✦</span>
            {graceStatus.isGracePeriod ? `${graceStatus.monthName.toUpperCase()} TRIAL ACTIVE` : "30-DAY COHORT PASS"}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: "0.75rem" }}>
            Unlock Unlimited Speech Practice &amp;{" "}
            <span style={{ fontStyle: "italic", color: "var(--primary-light)" }}>AI Mentorship</span>
          </h1>
          <p style={{ color: "var(--text2)", fontSize: "0.925rem", lineHeight: 1.75, maxWidth: 580 }}>
            Elevate your English speaking fluency with daily video submissions, instant CEFR AI evaluations, and live practice rooms.
          </p>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.25rem" }} className="checkout-grid">
          <style>{`
            @media (min-width: 900px) {
              .checkout-grid { grid-template-columns: 1fr 400px !important; }
            }
          `}</style>

          {/* ═══════ LEFT COLUMN ═══════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* Price banner */}
            <div style={{ borderRadius: 18, border: "1px solid var(--border2)", background: "linear-gradient(135deg, var(--card2) 0%, var(--card3) 100%)", padding: "1.5rem 1.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", boxShadow: "var(--shadow)" }}>
              <div>
                <div style={{ fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--primary-light)", marginBottom: 6 }}>Cohort Membership Fee</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Full 30-day practice cycle</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                  <span style={{ fontSize: "2.6rem", fontWeight: 900, color: "var(--text)", letterSpacing: "-0.04em", lineHeight: 1, fontFamily: "'Playfair Display', serif" }}>₹{coursePrice}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600 }}>/ 30 days</span>
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--success)", fontWeight: 700, marginTop: 4 }}>Zero auto-debit · One-time fee</div>
              </div>
            </div>

            {/* Features */}
            <div style={{ borderRadius: 18, border: "1px solid var(--border)", background: "var(--card)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem", boxShadow: "var(--shadow)" }}>
              {[
                { title: "Daily AI Speech Analysis", desc: "Grammar fixes, pronunciation scoring, vocabulary enhancement, and CEFR feedback." },
                { title: "Interactive Live Speaking Rooms", desc: "Practice live conversations with peer students and trainers in real-time." },
                { title: "Streak Protection & Freeze Tokens", desc: "Protect your consistency streaks with streak freeze shields." },
                { title: "Official Tax Invoice & Certificates", desc: "Downloadable GST-compliant receipts and milestone performance certificates." },
              ].map((f) => (
                <div key={f.title} style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem", padding: "0.875rem 1rem", borderRadius: 12, background: "var(--card2)", border: "1px solid var(--border)" }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 900, flexShrink: 0, marginTop: 1 }}>✓</div>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>{f.title}</div>
                    <div style={{ fontSize: "0.775rem", color: "var(--muted)", lineHeight: 1.65 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Wallet highlight */}
            {walletBalance > 0 && (
              <div style={{ borderRadius: 16, border: "1px solid rgba(34,197,94,0.25)", background: "rgba(34,197,94,0.04)", padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>👛</span>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#4ade80" }}>You have ₹{walletBalance} in Wallet Cash</div>
                    <div style={{ fontSize: "0.725rem", color: "var(--muted)", marginTop: 2 }}>Earned from referrals &amp; streaks. 100% Tax-Free when paying via wallet!</div>
                  </div>
                </div>
                <span style={{ fontSize: "0.65rem", fontWeight: 900, padding: "4px 10px", borderRadius: 99, background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)", whiteSpace: "nowrap", letterSpacing: "0.08em" }}>0% TAX</span>
              </div>
            )}

            {/* Trust bar */}
            <div style={{ padding: "0.875rem 1.25rem", borderRadius: 14, border: "1px solid var(--border)", background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem 1.25rem" }}>
              {[["🛡️", "Zero Recurring Auto-Debit"], ["⚡", "Instant Activation"], ["📄", "Official GST Receipt"]].map(([icon, label]) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.775rem", color: "var(--muted)" }}>
                  <span>{icon}</span>{label}
                </span>
              ))}
            </div>
          </div>

          {/* ═══════ RIGHT COLUMN: CHECKOUT PANEL ═══════ */}
          <div style={{ borderRadius: 20, border: "1px solid var(--border2)", background: "var(--card)", boxShadow: "var(--shadow-lg), var(--glow-purple)", overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* Panel header */}
            <div style={{ padding: "1.5rem 1.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 4, height: 22, borderRadius: 99, background: "linear-gradient(180deg, var(--primary-light), var(--primary2))" }} />
                    <h2 style={{ color: "var(--text)", fontSize: "1.35rem", fontWeight: 900, letterSpacing: "-0.025em" }}>Checkout</h2>
                  </div>
                  <p style={{ color: "var(--muted)", fontSize: "0.775rem", paddingLeft: 12 }}>Choose your payment method</p>
                </div>
                {walletBalance > 0 && (
                  <button type="button" onClick={() => setShowWalletHistoryModal(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.725rem", fontWeight: 700, color: "var(--primary-light)", padding: "6px 12px", borderRadius: 8, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    History
                  </button>
                )}
              </div>
            </div>

            {/* Method selector */}
            <div style={{ padding: "1.25rem 1.75rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.25rem" }}>Select Method</div>

              {/* Wallet option */}
              {walletBalance > 0 && (
                <div onClick={() => setPaymentMethod("wallet")}
                  style={{ position: "relative", borderRadius: 14, border: `1px solid ${isWalletSelected ? "rgba(34,197,94,0.4)" : "var(--border)"}`, background: isWalletSelected ? "rgba(34,197,94,0.05)" : "var(--card2)", cursor: "pointer", overflow: "hidden", boxShadow: isWalletSelected ? "0 0 0 1px rgba(34,197,94,0.12), 0 8px 32px rgba(34,197,94,0.1)" : "none", transition: "all 0.2s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "0.875rem 1rem" }}>
                    {/* Radio */}
                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${isWalletSelected ? "#4ade80" : "var(--muted)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "border-color 0.2s" }}>
                      {isWalletSelected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px rgba(74,222,128,0.8)" }} />}
                    </div>
                    {/* Icon */}
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: isWalletSelected ? "rgba(34,197,94,0.15)" : "var(--card3)", color: isWalletSelected ? "#4ade80" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M16 12h.01" strokeWidth="2.5"/><path d="M2 10h20"/></svg>
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: isWalletSelected ? "var(--text)" : "var(--text2)" }}>Wallet Cash</span>
                        <span style={{ fontSize: "0.6rem", fontWeight: 900, padding: "2px 7px", borderRadius: 99, background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)", letterSpacing: "0.08em" }}>0% TAX</span>
                      </div>
                      <div style={{ fontSize: "0.725rem", color: "var(--muted)", marginTop: 2 }}>
                        Balance: <span style={{ color: isWalletSelected ? "var(--text2)" : "var(--muted)", fontWeight: 600 }}>₹{walletBalance}</span>
                      </div>
                    </div>
                    {/* Amount */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: "1.35rem", fontWeight: 900, color: isWalletSelected ? "#4ade80" : "var(--muted)", letterSpacing: "-0.02em" }}>₹{coursePrice}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: 1 }}>wallet</div>
                    </div>
                  </div>
                  {isWalletSelected && <div style={{ position: "absolute", bottom: 0, left: "1.25rem", right: "1.25rem", height: 1, background: "linear-gradient(90deg, transparent, rgba(74,222,128,0.4), transparent)" }} />}
                </div>
              )}

              {/* UPI option */}
              <div onClick={() => setPaymentMethod("upi")}
                style={{ position: "relative", borderRadius: 14, border: `1px solid ${paymentMethod === "upi" ? "rgba(139,92,246,0.4)" : "var(--border)"}`, background: paymentMethod === "upi" ? "rgba(139,92,246,0.05)" : "var(--card2)", cursor: "pointer", overflow: "hidden", boxShadow: paymentMethod === "upi" ? "0 0 0 1px rgba(139,92,246,0.12), 0 8px 32px rgba(139,92,246,0.1)" : "none", transition: "all 0.2s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "0.875rem 1rem" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${paymentMethod === "upi" ? "var(--primary-light)" : "var(--muted)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "border-color 0.2s" }}>
                    {paymentMethod === "upi" && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary-light)", boxShadow: "0 0 8px rgba(139,92,246,0.8)" }} />}
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: paymentMethod === "upi" ? "rgba(139,92,246,0.15)" : "var(--card3)", color: paymentMethod === "upi" ? "var(--primary-light)" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: paymentMethod === "upi" ? "var(--text)" : "var(--text2)", marginBottom: 6 }}>UPI / QR Code</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {["GPay", "PhonePe", "Paytm", "BHIM"].map((app) => (
                        <span key={app} style={{ padding: "2px 7px", borderRadius: 5, fontSize: "0.65rem", fontWeight: 600, border: "1px solid", background: paymentMethod === "upi" ? "rgba(139,92,246,0.1)" : "var(--card3)", borderColor: paymentMethod === "upi" ? "rgba(139,92,246,0.2)" : "var(--border)", color: paymentMethod === "upi" ? "var(--primary-light)" : "var(--muted)" }}>{app}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "1.35rem", fontWeight: 900, color: paymentMethod === "upi" ? "var(--text)" : "var(--muted)", letterSpacing: "-0.02em" }}>₹{totalAmount}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: 1 }}>gateway</div>
                  </div>
                </div>
                {paymentMethod === "upi" && <div style={{ position: "absolute", bottom: 0, left: "1.25rem", right: "1.25rem", height: 1, background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.4), transparent)" }} />}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, margin: "0 1.75rem", background: "var(--border)" }} />

            {/* Order summary */}
            <div style={{ padding: "1.25rem 1.75rem" }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--muted)", marginBottom: "0.875rem" }}>Order Summary</div>

              <div style={{ borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden" }}>
                {/* Line items */}
                <div style={{ background: "var(--card2)" }}>
                  {paymentMethod === "wallet" && useWallet ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", fontSize: "0.8rem" }}>
                        <span style={{ color: "var(--text2)" }}>Course Fee</span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>₹{coursePrice}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", fontSize: "0.8rem", background: "rgba(34,197,94,0.04)" }}>
                        <span style={{ color: "#4ade80", fontWeight: 600 }}>Wallet Cash Applied</span>
                        <span style={{ fontWeight: 700, color: "#4ade80" }}>−₹{isFullWalletCoverage ? coursePrice : walletDiscount}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", fontSize: "0.8rem" }}>
                        <span style={{ color: "var(--text2)" }}>Tax / GST</span>
                        <span style={{ fontWeight: 600, color: "#4ade80" }}>₹0 · Waived</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", fontSize: "0.8rem" }}>
                        <span style={{ color: "var(--text2)" }}>Course Fee</span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>₹{coursePrice}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", fontSize: "0.8rem" }}>
                        <span style={{ color: "var(--text2)" }}>Tax / GST</span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>₹{taxAmount > 0 ? taxAmount : 0}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Total */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", background: paymentMethod === "wallet" && useWallet ? "rgba(34,197,94,0.06)" : "rgba(139,92,246,0.06)", borderTop: `1px solid ${paymentMethod === "wallet" && useWallet ? "rgba(34,197,94,0.2)" : "rgba(139,92,246,0.15)"}` }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 900, color: "var(--text)" }}>
                      {paymentMethod === "wallet" && useWallet ? "Gateway Due" : "Total Payable"}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 2 }}>
                      {paymentMethod === "wallet" && useWallet
                        ? `₹${coursePrice} from wallet · ₹${remainingWallet} left`
                        : "via UPI · Razorpay"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "2.4rem", fontWeight: 900, color: paymentMethod === "wallet" && useWallet ? "#4ade80" : "var(--text)", letterSpacing: "-0.04em", lineHeight: 1, fontFamily: "'Playfair Display', serif" }}>
                      ₹{paymentMethod === "wallet" && useWallet ? netPayable : totalAmount}
                    </div>
                    {paymentMethod === "wallet" && useWallet && netPayable === 0 && (
                      <div style={{ fontSize: "0.6rem", fontWeight: 900, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>Fully Covered</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ margin: "0 1.75rem 0.875rem", padding: "0.875rem 1rem", borderRadius: 12, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: "0.8rem", display: "flex", alignItems: "flex-start", gap: 8 }}>
                <svg style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span style={{ lineHeight: 1.6 }}>{error}</span>
              </div>
            )}

            {/* CTA */}
            <div style={{ padding: "0.5rem 1.75rem 1.75rem", marginTop: "auto" }}>
              <div style={{ position: "relative" }}>
                {/* Glow behind button */}
                {!loading && (
                  <div style={{ position: "absolute", inset: -4, borderRadius: 18, background: isWalletSelected ? "radial-gradient(ellipse, rgba(34,197,94,0.25) 0%, transparent 70%)" : "radial-gradient(ellipse, rgba(255,122,24,0.25) 0%, transparent 70%)", filter: "blur(12px)", pointerEvents: "none" }} />
                )}
                <button
                  type="button"
                  onClick={handlePay}
                  disabled={loading}
                  style={{
                    position: "relative",
                    width: "100%",
                    padding: "1.05rem 1.5rem",
                    borderRadius: 14,
                    border: "none",
                    background: loading ? "var(--card3)"
                      : isWalletSelected
                        ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
                        : "linear-gradient(135deg, var(--cta) 0%, #e86a0a 100%)",
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: "0.975rem",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.55 : 1,
                    boxShadow: loading ? "none" : isWalletSelected
                      ? "0 6px 28px rgba(34,197,94,0.4)"
                      : "0 6px 28px rgba(255,122,24,0.45)",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    letterSpacing: "-0.01em",
                  }}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  {loading ? (
                    <>
                      <svg style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none">
                        <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Processing…
                    </>
                  ) : isWalletSelected ? (
                    <><span style={{ fontSize: "1.1rem" }}>⚡</span> {ctaLabel}</>
                  ) : (
                    <><span style={{ fontSize: "1.1rem" }}>📲</span> {ctaLabel}</>
                  )}
                </button>
              </div>

              {/* SSL line */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: "0.875rem", fontSize: "0.7rem", color: "var(--muted)" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                256-Bit SSL · Secured by Razorpay &amp; UPI
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </Layout>
  );
}
