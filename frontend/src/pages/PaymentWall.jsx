/**
 * PaymentWall
 * Shown to unpaid users when they try to access a gated feature.
 * Handles Razorpay Standard Checkout flow end-to-end.
 * Features instant verification, success confirmation, and 1-click invoice download.
 */

import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client.js";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getMonthlyGracePeriodStatus } from "../utils/gracePeriodUtils.js";

const InvoiceModal = lazy(() => import("../components/InvoiceModal.jsx"));

// ── Load Razorpay checkout.js script once ────────────────────────────────────
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

const DEFAULT_PLAN_AMOUNT = 5; // INR

export default function PaymentWall({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paid, setPaid] = useState(false);
  const [successTx, setSuccessTx] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [failed, setFailed] = useState(false);
  const [planAmount, setPlanAmount] = useState(DEFAULT_PLAN_AMOUNT);
  const [graceStatus] = useState(() => getMonthlyGracePeriodStatus());
  const navigate = useNavigate();
  const { updateUser, user } = useAuth();

  const [walletBalance, setWalletBalance] = useState(0);
  const [walletHistory, setWalletHistory] = useState([]);
  const [showWalletHistoryModal, setShowWalletHistoryModal] = useState(false);
  const [showWalletConfirmModal, setShowWalletConfirmModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("wallet"); // "wallet" | "upi"
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
        setPlanAmount(tot);
      })
      .catch(() => {});

    api.get("/payments/wallet")
      .then(({ data }) => {
        if (data?.success) {
          setWalletBalance(Number(data.walletBalance) || 0);
          setWalletHistory(data.walletHistory || []);
        }
      })
      .catch(() => {});
  }, []);

  const coursePrice = pricing.coursePrice;
  const taxAmount = pricing.taxAmount;
  const totalAmount = pricing.totalAmount;

  const useWallet = paymentMethod === "wallet" && walletBalance > 0;
  // When paying with wallet: tax is waived (₹0)! Target fee is ONLY coursePrice.
  const isFullWalletCoverage = useWallet && walletBalance >= coursePrice;

  const walletDiscount = useWallet
    ? Math.round(Math.min(walletBalance, coursePrice) * 100) / 100
    : 0;

  // Direct gateway charges coursePrice + taxAmount. Wallet charges coursePrice with tax waived.
  const netPayable = isFullWalletCoverage
    ? 0
    : useWallet
      ? Math.round(Math.max(0, (coursePrice - walletDiscount) + taxAmount) * 100) / 100
      : totalAmount;

  const remainingWallet = isFullWalletCoverage
    ? Math.round(Math.max(0, walletBalance - coursePrice) * 100) / 100
    : Math.round(Math.max(0, walletBalance - walletDiscount) * 100) / 100;

  // Step 1: User clicks main action button
  const handlePay = async () => {
    setError(null);
    // If 100% wallet coverage: NEVER pay silently in the background!
    // Require explicit confirmation dialog so user has full control.
    if (useWallet && isFullWalletCoverage) {
      setShowWalletConfirmModal(true);
      return;
    }

    await executeOrder({ confirmWalletPayment: false });
  };

  // Step 2: User explicitly clicked "Confirm & Activate" in modal
  const handleConfirmWalletPayment = async () => {
    setShowWalletConfirmModal(false);
    await executeOrder({ confirmWalletPayment: true });
  };

  const executeOrder = async ({ confirmWalletPayment = false } = {}) => {
    setError(null);
    setLoading(true);

    try {
      // 1. Create order on backend (strictly honors user preference and confirmation)
      const { data: order } = await api.post("/payments/create-order", {
        useWallet,
        paymentMethod,
        confirmWalletPayment,
      });

      // CASE A: Server requires confirmation before deducting wallet balance
      if (order.requiresConfirmation && !confirmWalletPayment) {
        setLoading(false);
        setShowWalletConfirmModal(true);
        return;
      }

      // CASE B: 100% Covered by Wallet Balance and user explicitly confirmed
      if (order.walletCovered) {
        const discountApplied = order.walletDiscountApplied || order.coursePrice || coursePrice;
        const txObj = {
          name: user?.name || user?.registeredName || "Student Member",
          phone: user?.phone,
          amount: 0,
          totalFee: order.totalFee || coursePrice,
          coursePrice: order.coursePrice || coursePrice,
          taxAmount: 0,
          walletDiscountApplied: discountApplied,
          isWalletCovered: true,
          razorpayOrderId: "wallet_payment",
          razorpayPaymentId: "wallet_covered",
          status: "success",
          source: "wallet",
          createdAt: new Date().toISOString(),
        };

        setSuccessTx(txObj);
        setPaid(true);
        const newBal = order.walletBalance ?? remainingWallet;
        setWalletBalance(newBal);
        if (updateUser) {
          updateUser({ paid: true, walletBalance: newBal });
        }
        setLoading(false);
        return;
      }

      // CASE C: Requires Gateway Payment (UPI / QR Code)
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setError("Payment system failed to load. Please check your internet connection and try again.");
        setLoading(false);
        return;
      }

      const options = {
        key: order.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "Speak & Shine",
        description: order.walletDiscountApplied > 0
          ? `Premium Membership (₹${order.walletDiscountApplied} Wallet Discount Applied)`
          : "Premium Membership",
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
          upi: true, card: false, netbanking: false, wallet: false, emi: false, paylater: false,
        },
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
              coursePrice,
              taxAmount,
              walletDiscountApplied: order.walletDiscountApplied || 0,
              isWalletCovered: false,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              status: "success",
              source: "razorpay",
              createdAt: new Date().toISOString(),
            };

            setSuccessTx(txObj);
            setPaid(true);
            if (updateUser) updateUser({ paid: true });
          } catch (verifyErr) {
            const errStatus = verifyErr?.response?.status;
            const errMsg = verifyErr?.response?.data?.error || "";
            if (errStatus === 409 || errMsg.includes("already been processed")) {
              const txObj = {
                name: user?.name || user?.registeredName || "Student Member",
                phone: user?.phone,
                amount: order.netPayableINR ?? Math.max(0, totalAmount - (order.walletDiscountApplied || 0)),
                totalFee: order.totalFee || totalAmount,
                coursePrice,
                taxAmount,
                walletDiscountApplied: order.walletDiscountApplied || 0,
                isWalletCovered: false,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                status: "success",
                source: "razorpay",
                createdAt: new Date().toISOString(),
              };
              setSuccessTx(txObj);
              setPaid(true);
              if (updateUser) updateUser({ paid: true });
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
            setError("Payment cancelled. You can try again anytime.");
          },
        },
        prefill: {
          name: user?.name || "",
          contact: user?.phone || "",
        },
        theme: { color: "#7c6fff" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response) => {
        setLoading(false);
        setFailed(true);
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
    if (onSuccess) {
      onSuccess();
    } else {
      navigate("/video-analysis", { replace: true });
    }
  };

  if (failed) {
    return (
      <Layout title="Payment Failed">
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "60vh", textAlign: "center",
          padding: "2rem",
        }}>
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>❌</div>
          <h2 style={{ color: "#f87171", fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>
            Payment Failed
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: "0.5rem", maxWidth: 340, lineHeight: 1.6 }}>
            {error || "Something went wrong with your payment."}
          </p>
          <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: "2rem" }}>
            No money was deducted. You can try again safely.
          </p>
          <button
            onClick={() => { setFailed(false); setError(null); }}
            style={{
              background: "linear-gradient(135deg, #7c6fff 0%, #6d5ce7 100%)",
              color: "#fff", border: "none", borderRadius: 12,
              padding: "0.9rem 2rem", fontSize: "1rem", fontWeight: 700,
              cursor: "pointer", boxShadow: "0 6px 24px rgba(124,111,255,0.35)",
              marginBottom: "1rem",
            }}
          >
            🔄 Try Again
          </button>
          <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Contact your trainer if the problem persists.
          </p>
        </div>
      </Layout>
    );
  }

  if (paid) {
    return (
      <Layout title="Payment Successful">
        {/* Printable Official Invoice Modal */}
        {showInvoiceModal && (
          <Suspense fallback={null}>
            <InvoiceModal
              transaction={successTx}
              user={user}
              onClose={() => setShowInvoiceModal(false)}
            />
          </Suspense>
        )}

        <div style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
          {/* Main Celebration Card */}
          <div style={{
            background: "linear-gradient(135deg, #0d1e16 0%, #0a1711 100%)",
            border: "1px solid rgba(74, 222, 128, 0.35)",
            borderRadius: 24,
            padding: "2.25rem 1.75rem",
            textAlign: "center",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(74, 222, 128, 0.12)",
            position: "relative",
            overflow: "hidden",
            marginBottom: "1.25rem",
          }}>
            <div style={{ fontSize: "3.75rem", marginBottom: "0.85rem" }}>🎉</div>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "rgba(74, 222, 128, 0.15)",
              border: "1px solid rgba(74, 222, 128, 0.35)",
              color: "#4ade80",
              padding: "0.3rem 0.85rem",
              borderRadius: 20,
              fontSize: "0.82rem",
              fontWeight: 800,
              letterSpacing: "0.04em",
              marginBottom: "0.75rem",
            }}>
              <span>✓</span> PAYMENT VERIFIED &amp; UNLOCKED
            </div>

            <h1 style={{ fontSize: "1.6rem", fontWeight: 900, color: "#ffffff", marginBottom: "0.5rem" }}>
              Welcome to Speak &amp; Shine!
            </h1>
            <p style={{ color: "#94a3b8", fontSize: "0.92rem", lineHeight: 1.6, maxWidth: 440, margin: "0 auto 1.5rem" }}>
              Your payment has been verified. Daily speaking challenges, AI speech analysis, and full mentorship are now active on your account!
            </p>

            {/* Quick Receipt Summary Box */}
            <div style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 16,
              padding: "1.1rem 1.25rem",
              textAlign: "left",
              marginBottom: "1.75rem",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "0.6rem", marginBottom: "0.6rem" }}>
                <span style={{ fontSize: "0.76rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>AMOUNT PAID:</span>
                <span style={{ fontSize: "1.2rem", fontWeight: 900, color: "#4ade80" }}>
                  {successTx?.isWalletCovered || successTx?.amount === 0
                    ? "₹0 (100% Covered by Wallet)"
                    : `₹${successTx?.amount ?? netPayable}`}
                </span>
              </div>
              {successTx?.walletDiscountApplied > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "#4ade80", marginBottom: "0.4rem" }}>
                  <span style={{ color: "var(--muted)" }}>Wallet Discount:</span>
                  <span style={{ fontWeight: 700 }}>-₹{successTx.walletDiscountApplied}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "#cbd5e1", marginBottom: "0.4rem" }}>
                <span style={{ color: "var(--muted)" }}>Plan:</span>
                <span style={{ fontWeight: 600 }}>Speak &amp; Shine Full Membership</span>
              </div>
              {successTx?.razorpayPaymentId && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.76rem", color: "#cbd5e1", marginBottom: "0.4rem" }}>
                  <span style={{ color: "var(--muted)" }}>Payment ID:</span>
                  <span style={{ fontFamily: "monospace", color: "#a5b4fc" }}>{successTx.razorpayPaymentId}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.76rem", color: "#cbd5e1" }}>
                <span style={{ color: "var(--muted)" }}>Date &amp; Time:</span>
                <span>{new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={handleContinueToDashboard}
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #7c6fff 0%, #4f46e5 100%)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 14,
                  padding: "0.95rem 1.5rem",
                  fontSize: "1rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  boxShadow: "0 6px 20px rgba(124, 111, 255, 0.4)",
                  transition: "all 0.15s ease",
                }}
              >
                <span>🚀</span> Start Speaking Challenges Now
              </button>

              <button
                type="button"
                onClick={() => setShowInvoiceModal(true)}
                style={{
                  width: "100%",
                  background: "rgba(124, 111, 255, 0.12)",
                  color: "#c4b5fd",
                  border: "1px solid rgba(124, 111, 255, 0.35)",
                  borderRadius: 14,
                  padding: "0.85rem 1.5rem",
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  transition: "all 0.15s ease",
                }}
              >
                <span>📄</span> View &amp; Download Official Invoice (PDF)
              </button>
            </div>
          </div>

          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--muted)" }}>
            A receipt has been saved to your account. You can view all past invoices anytime in <a href="/payment-history" style={{ color: "#a5b4fc", textDecoration: "underline" }}>Payment History</a>.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Unlock Full Access">
      {/* ── Wallet Deduction Confirmation Modal (Responsive, clean, no dollar sign) ── */}
      {showWalletConfirmModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-emerald-500/40 p-6 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl">
              👛
            </div>
            <h3 className="text-xl font-extrabold text-white mb-1.5">
              Confirm Wallet Payment
            </h3>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              Pay <strong className="text-emerald-400 font-bold">₹{coursePrice}</strong> from your wallet balance to activate monthly cohort access?
            </p>

            <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 mb-5 text-sm">
              <span className="text-slate-400">Wallet: ₹{walletBalance}</span>
              <span className="text-slate-500">→</span>
              <span className="text-emerald-400 font-bold">₹{remainingWallet} remaining</span>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowWalletConfirmModal(false)}
                disabled={loading}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-bold text-sm cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWalletPayment}
                disabled={loading}
                className="flex-[1.4] py-3 px-4 rounded-xl border-none bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-sm cursor-pointer shadow-lg shadow-emerald-500/25 transition-all"
              >
                {loading ? "Activating…" : `Pay ₹${coursePrice} from Wallet`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wallet Transaction History Modal ── */}
      {showWalletHistoryModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg max-h-[85vh] rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">👛</span>
                <h3 className="text-lg font-bold text-white">Wallet &amp; Referral History</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWalletHistoryModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm cursor-pointer border border-slate-700 transition-colors"
              >
                ✕
              </button>
            </div>

            {walletHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No wallet transactions recorded yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {[...walletHistory].reverse().map((tx, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800 hover:border-slate-700 transition-colors">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {tx.reason || "Wallet transaction"}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {new Date(tx.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {" · "}Balance after: ₹{tx.balanceAfter}
                      </div>
                    </div>
                    <div className={`text-sm font-bold px-2.5 py-1 rounded-lg border ${
                      tx.type === "credit"
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                    }`}>
                      {tx.type === "credit" ? `+₹${tx.amount}` : `-₹${tx.amount}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main Responsive Container (Full Width & Balanced Grid) ── */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ════════ LEFT COLUMN: Value Proposition & Feature Highlights (Fills Empty Space) ════════ */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
            
            {/* Header / Hero Badge */}
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-3">
                <span>✨</span>
                <span>{graceStatus.isGracePeriod ? `${graceStatus.monthName.toUpperCase()} TRIAL WINDOW ACTIVE` : "PREMIUM AI COHORT"}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight mb-2">
                {graceStatus.isGracePeriod
                  ? `Unlock Full ${graceStatus.monthName} Membership`
                  : "Master English Fluency With Daily AI Video Feedback"}
              </h1>
              <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl">
                {graceStatus.isGracePeriod
                  ? `Day ${graceStatus.dayOfMonth} of 2 free practice is active. Complete your membership now for uninterrupted daily speech analysis all month.`
                  : "Practice speaking every day on video, get instant CEFR pronunciation & grammar scores, and connect in live audio/video cohort practice rooms."}
              </p>
            </div>

            {/* Plan Overview & Price Banner */}
            <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 backdrop-blur-xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  Included Cohort Tier
                </span>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  Full Access Monthly Speaking Pass
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Full 30-day cycle · Daily submissions · CEFR growth tracking
                </p>
              </div>

              <div className="sm:text-right shrink-0">
                <div className="text-3xl font-extrabold text-white tracking-tight">
                  ₹{coursePrice}
                  <span className="text-sm font-medium text-slate-400 ml-1">/month</span>
                </div>
                <div className="text-xs text-emerald-400 font-semibold mt-0.5">
                  Pay with wallet cash or UPI
                </div>
              </div>
            </div>

            {/* 4 Rich Feature Cards (2x2 Grid utilizing left side space) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-5 hover:border-slate-700 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl mb-3 text-indigo-400">
                  🎙️
                </div>
                <h4 className="text-base font-bold text-white mb-1.5">
                  Daily Speaking Video Practice
                </h4>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  300s daily prompts with direct in-browser recording, acoustic pitch charts, and real-time speech-to-text.
                </p>
              </div>

              <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-5 hover:border-slate-700 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl mb-3 text-emerald-400">
                  📊
                </div>
                <h4 className="text-base font-bold text-white mb-1.5">
                  Instant AI Grammar &amp; Scores
                </h4>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Word-by-word grammar correction, CEFR proficiency levels (A1 to C2), and delivery fluency benchmarks.
                </p>
              </div>

              <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-5 hover:border-slate-700 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xl mb-3 text-purple-400">
                  👥
                </div>
                <h4 className="text-base font-bold text-white mb-1.5">
                  Interactive Live Practice Rooms
                </h4>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Join live group speaking tables, debate topics with fellow students, and build conversational flow.
                </p>
              </div>

              <div className="rounded-2xl bg-slate-900/50 border border-slate-800/80 p-5 hover:border-slate-700 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl mb-3 text-amber-400">
                  🛡️
                </div>
                <h4 className="text-base font-bold text-white mb-1.5">
                  Streak Shields &amp; Rewards
                </h4>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Protect daily streaks with automated freeze shields, earn reward badges, and climb cohort leaderboards.
                </p>
              </div>
            </div>

            {/* Daily 3-Step Practice Cycle (Visual Workflow filling lower space) */}
            <div className="rounded-2xl bg-slate-900/40 border border-slate-800/60 p-5 sm:p-6">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
                <span>⚡</span>
                <span>Your Daily Routine in Speak &amp; Shine</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs sm:text-sm">
                <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-slate-800/30 border border-slate-800">
                  <span className="font-extrabold text-indigo-400">Step 1 · 08:00 AM</span>
                  <span className="font-bold text-white">Receive Daily Prompt</span>
                  <span className="text-slate-400 text-xs">Fresh speaking topic delivered with vocabulary builder notes.</span>
                </div>

                <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-slate-800/30 border border-slate-800">
                  <span className="font-extrabold text-emerald-400">Step 2 · 5 Minutes</span>
                  <span className="font-bold text-white">Record &amp; Speak</span>
                  <span className="text-slate-400 text-xs">Speak naturally on camera directly from your phone or laptop.</span>
                </div>

                <div className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-slate-800/30 border border-slate-800">
                  <span className="font-extrabold text-amber-400">Step 3 · Instant</span>
                  <span className="font-bold text-white">Review AI Feedback</span>
                  <span className="text-slate-400 text-xs">Check grammar corrections, fluency score, and maintain your streak.</span>
                </div>
              </div>
            </div>

            {/* Member Transparency Badges */}
            <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-xl bg-slate-900/30 border border-slate-800/60 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Zero Automatic Renewals</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>1:1 Real Cash Wallet Value</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Instant Account Activation</span>
              </span>
            </div>

          </div>

          {/* ════════ RIGHT COLUMN: Sticky Checkout Card (Tailwind Styled) ════════ */}
          <div className="lg:col-span-5 xl:col-span-4 sticky top-6">
            <div className="rounded-2xl bg-slate-900/90 border border-slate-700/80 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl flex flex-col gap-5">
              
              {/* Header */}
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-xl font-bold text-white tracking-tight">Checkout</h2>
                <p className="text-xs text-slate-400 mt-1">Select your preferred payment method</p>
              </div>

              {/* Wallet Cash Balance Status Strip (If user has money in wallet) */}
              {walletBalance > 0 && (
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">👛</span>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">
                        Wallet Cash Available
                      </span>
                      <span className="text-lg font-extrabold text-white">
                        ₹{walletBalance}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowWalletHistoryModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    History {walletHistory.length > 0 ? `(${walletHistory.length})` : ""}
                  </button>
                </div>
              )}

              {/* Payment Method Selector (Shown when user has wallet money) */}
              {walletBalance > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Payment Method
                  </span>

                  {/* Option 1: Pay with Wallet (Gives wallet cash full value!) */}
                  <div
                    onClick={() => setPaymentMethod("wallet")}
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                      paymentMethod === "wallet"
                        ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                        : "border-slate-800 bg-slate-800/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        paymentMethod === "wallet" ? "border-emerald-500" : "border-slate-600"
                      }`}>
                        {paymentMethod === "wallet" && (
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span>Pay with Wallet Cash</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          ₹{walletBalance} in balance
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-extrabold text-emerald-400">
                        ₹{coursePrice}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        from wallet
                      </div>
                    </div>
                  </div>

                  {/* Option 2: Pay via UPI / QR Code */}
                  <div
                    onClick={() => setPaymentMethod("upi")}
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                      paymentMethod === "upi"
                        ? "border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                        : "border-slate-800 bg-slate-800/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        paymentMethod === "upi" ? "border-indigo-500" : "border-slate-600"
                      }`}>
                        {paymentMethod === "upi" && (
                          <div className="w-2 h-2 rounded-full bg-indigo-500" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">
                          Pay via UPI / QR Code
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Google Pay, PhonePe, Paytm
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-extrabold text-indigo-300">
                        ₹{totalAmount}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        direct gateway
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Summary */}
              <div className="rounded-xl bg-slate-800/40 border border-slate-800 p-4 flex flex-col gap-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Payment Summary
                </span>

                {paymentMethod === "wallet" && useWallet ? (
                  /* WALLET SUMMARY: Celebrates the wallet cash value */
                  <>
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>Course Fee:</span>
                      <span>₹{coursePrice}</span>
                    </div>
                    <div className="flex justify-between text-sm text-emerald-400 font-bold">
                      <span>Paid via Wallet Cash:</span>
                      <span>-₹{isFullWalletCoverage ? coursePrice : walletDiscount}</span>
                    </div>
                    {!isFullWalletCoverage && taxAmount > 0 && (
                      <div className="flex justify-between text-sm text-slate-300">
                        <span>Tax / GST:</span>
                        <span>₹{taxAmount}</span>
                      </div>
                    )}
                    <div className="border-t border-slate-700/60 pt-2.5 mt-1 flex items-center justify-between">
                      <span className="text-sm font-bold text-white">Net Gateway Due:</span>
                      <span className="text-lg font-extrabold text-emerald-400">
                        ₹{netPayable}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 text-right">
                      Total ₹{coursePrice} deducted from your wallet
                    </div>
                  </>
                ) : (
                  /* UPI SUMMARY: Strictly zero wallet text */
                  <>
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>Course Fee:</span>
                      <span>₹{coursePrice}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-sm text-slate-300">
                        <span>Tax / GST:</span>
                        <span>₹{taxAmount}</span>
                      </div>
                    )}
                    <div className="border-t border-slate-700/60 pt-2.5 mt-1 flex items-center justify-between">
                      <span className="text-sm font-bold text-white">Total Due via UPI:</span>
                      <span className="text-lg font-extrabold text-indigo-300">
                        ₹{totalAmount}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Error Notice */}
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs leading-relaxed">
                  ⚠️ {error}
                </div>
              )}

              {/* Primary Action Button */}
              <button
                type="button"
                onClick={handlePay}
                disabled={loading}
                className={`w-full py-3.5 px-6 rounded-xl font-extrabold text-base text-white cursor-pointer transition-all duration-200 flex items-center justify-center gap-2 shadow-xl ${
                  loading
                    ? "opacity-60 cursor-not-allowed bg-slate-700"
                    : paymentMethod === "wallet"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/25 active:scale-[0.99]"
                      : "bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 shadow-indigo-500/25 active:scale-[0.99]"
                }`}
              >
                {loading ? (
                  <span>Processing…</span>
                ) : paymentMethod === "wallet" ? (
                  <span>⚡ Pay ₹{coursePrice} from Wallet</span>
                ) : (
                  <span>📲 Pay ₹{totalAmount} via UPI</span>
                )}
              </button>

              {/* Security info: Only show gateway text while payment option is UPI mode! */}
              {paymentMethod === "upi" ? (
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-2 px-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                  <span className="text-indigo-400">🔒</span>
                  <span>Secure 256-Bit SSL Checkout via Razorpay &amp; UPI</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-xs text-emerald-400/90 py-2 px-3 bg-emerald-950/20 rounded-xl border border-emerald-500/20">
                  <span>⚡</span>
                  <span>Instant wallet balance debit · Zero gateway redirects</span>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}
