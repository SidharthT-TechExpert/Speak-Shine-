/**
 * PaymentWall
 * Shown to unpaid users when they try to access a gated feature.
 * Handles Razorpay Standard Checkout flow end-to-end and Wallet balance payments.
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

const DEFAULT_PLAN_AMOUNT = 5; // INR fallback

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
          const bal = Number(data.walletBalance) || 0;
          setWalletBalance(bal);
          setWalletHistory(data.walletHistory || []);
          // Automatically pick UPI if wallet balance is zero
          if (bal <= 0) {
            setPaymentMethod("upi");
          }
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
    // If using wallet balance: NEVER pay silently in the background!
    // Require explicit confirmation dialog so user has full control of their cash.
    if (useWallet && isFullWalletCoverage) {
      setShowWalletConfirmModal(true);
      return;
    }

    await executeOrder({ confirmWalletPayment: false });
  };

  // Step 2: User explicitly clicked "Confirm & Pay" in confirmation modal
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
          amount: coursePrice,
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
          ? `Premium Membership (₹${order.walletDiscountApplied} Wallet Cash Applied)`
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

  // ── PAYMENT FAILED SCREEN ──────────────────────────────────────────────────
  if (failed) {
    return (
      <Layout title="Payment Failed">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 py-8 max-w-md mx-auto">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-3xl mb-4">
            ✕
          </div>
          <h2 className="text-rose-400 text-2xl font-black mb-2">
            Payment Unsuccessful
          </h2>
          <p className="text-slate-400 text-sm mb-4 leading-relaxed">
            {error || "Something went wrong while processing your transaction."}
          </p>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 mb-6">
            No money was deducted. You can retry with a different UPI app or wallet cash.
          </div>
          <button
            type="button"
            onClick={() => { setFailed(false); setError(null); }}
            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm cursor-pointer shadow-lg shadow-purple-500/25 transition-all mb-3"
          >
            🔄 Try Again
          </button>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </Layout>
    );
  }

  // ── PAYMENT SUCCESSFUL SCREEN ──────────────────────────────────────────────
  if (paid) {
    const isWallet = successTx?.isWalletCovered || successTx?.source === "wallet";

    return (
      <Layout title="Access Unlocked">
        {showInvoiceModal && (
          <Suspense fallback={null}>
            <InvoiceModal
              transaction={successTx}
              user={user}
              onClose={() => setShowInvoiceModal(false)}
            />
          </Suspense>
        )}

        <div className="max-w-xl mx-auto my-6 sm:my-12 px-4">
          <div className="relative rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-[#0e1d16] via-[#09140f] to-[#060e0a] p-6 sm:p-9 shadow-2xl text-center overflow-hidden">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-3xl shadow-lg shadow-emerald-500/20">
              ✓
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wide uppercase mb-3">
              <span>●</span> Membership Activated
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
              Welcome to the Cohort!
            </h1>
            <p className="text-slate-400 text-sm max-w-md mx-auto mb-6 leading-relaxed">
              Your 30-day Speak &amp; Shine full pass is now active. Daily AI speech evaluation, live practice rooms, and fluency metrics are unlocked.
            </p>

            {/* Receipt Summary Card */}
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 sm:p-5 text-left mb-6 space-y-3">
              <div className="flex justify-between items-center pb-2.5 border-b border-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Payment Summary</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                  {isWallet ? "Wallet Cash" : "UPI Gateway"}
                </span>
              </div>

              <div className="flex justify-between items-center text-sm text-slate-300">
                <span>Course Price</span>
                <span className="font-bold text-white">₹{coursePrice}</span>
              </div>

              {isWallet ? (
                <>
                  <div className="flex justify-between items-center text-sm text-emerald-400 font-semibold">
                    <span>Paid using Wallet Cash</span>
                    <span>-₹{coursePrice}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Remaining Wallet Balance</span>
                    <span className="font-bold text-white">₹{walletBalance}</span>
                  </div>
                </>
              ) : (
                <>
                  {taxAmount > 0 && (
                    <div className="flex justify-between items-center text-sm text-slate-400">
                      <span>Tax / GST</span>
                      <span>₹{taxAmount}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm text-white font-bold pt-1 border-t border-slate-800/80">
                    <span>Total Paid</span>
                    <span className="text-emerald-400 text-base">₹{successTx?.amount ?? totalAmount}</span>
                  </div>
                </>
              )}

              {successTx?.razorpayPaymentId && (
                <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-slate-800">
                  <span>Reference ID</span>
                  <span className="font-mono text-slate-300">{successTx.razorpayPaymentId}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleContinueToDashboard}
                className="flex-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm cursor-pointer shadow-lg shadow-purple-500/30 transition-all flex items-center justify-center gap-2"
              >
                <span>🚀</span> Start Speaking Challenges
              </button>
              <button
                type="button"
                onClick={() => setShowInvoiceModal(true)}
                className="py-3.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-sm cursor-pointer transition-colors flex items-center justify-center gap-2"
              >
                <span>📄</span> Official Invoice
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ── MAIN CHECKOUT INTERFACE ────────────────────────────────────────────────
  return (
    <Layout title="Unlock Full Access">
      {/* ── Wallet Deduction Confirmation Modal (Compact, responsive, centered, INR only) ── */}
      {showWalletConfirmModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-emerald-500/40 p-6 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-2xl">
              👛
            </div>
            <h3 className="text-lg font-bold text-white mb-1.5">
              Confirm Wallet Payment
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mb-4 leading-relaxed">
              Deduct <strong className="text-emerald-400 font-bold">₹{coursePrice}</strong> from your earned wallet cash to activate full 30-day cohort membership?
            </p>

            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 mb-5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Current Wallet Balance:</span>
                <span className="text-slate-200 font-bold">₹{walletBalance}</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-semibold">
                <span>Amount to Pay (Course Price):</span>
                <span>-₹{coursePrice}</span>
              </div>
              <div className="flex justify-between text-slate-400 pt-1.5 border-t border-slate-700/60 font-semibold">
                <span>Balance After Payment:</span>
                <span className="text-emerald-400 font-bold">₹{remainingWallet} left</span>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowWalletConfirmModal(false)}
                disabled={loading}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWalletPayment}
                disabled={loading}
                className="flex-[1.6] py-2.5 px-3 rounded-xl border-none bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-xs cursor-pointer shadow-lg shadow-emerald-500/25 transition-all"
              >
                {loading ? "Activating…" : `Confirm & Pay ₹${coursePrice}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wallet Transaction History Modal ── */}
      {showWalletHistoryModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg max-h-[85vh] rounded-2xl bg-slate-900 border border-slate-700 p-5 sm:p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">👛</span>
                <h3 className="text-base font-bold text-white">Wallet &amp; Referral History</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWalletHistoryModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm cursor-pointer border border-slate-700 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 space-y-2">
              {walletHistory.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  No wallet transactions recorded yet.
                </div>
              ) : (
                [...walletHistory].reverse().map((tx, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800">
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {tx.reason || "Wallet transaction"}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(tx.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {" · "}Balance: ₹{tx.balanceAfter}
                      </div>
                    </div>
                    <div className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                      tx.type === "credit"
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                    }`}>
                      {tx.type === "credit" ? `+₹${tx.amount}` : `-₹${tx.amount}`}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Responsive Content Container (Balanced 6xl container) ── */}
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        
        {/* Main Grid: Left Value Proposition (col-span-7) + Right Sticky Checkout (col-span-5) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">

          {/* ════════ LEFT COLUMN: Value Proposition & Membership Details ════════ */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Header / Pill */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-bold tracking-wide uppercase mb-3">
                <span>✨</span>
                <span>{graceStatus.isGracePeriod ? `${graceStatus.monthName.toUpperCase()} TRIAL ACTIVE` : "FULL MEMBERSHIP PASS"}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
                Unlock Unlimited Speech Practice &amp; AI Mentorship
              </h1>
              <p className="text-sm sm:text-base text-slate-300 mt-2 leading-relaxed">
                Elevate your English speaking confidence with daily AI video feedback, CEFR rubric scoring, live practice rooms, and mentor challenges.
              </p>
            </div>

            {/* Plan Card */}
            <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/30 via-slate-900/60 to-slate-950/80 p-6 sm:p-7 backdrop-blur-xl shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400 block mb-1">
                    Monthly Cohort Pass
                  </span>
                  <div className="text-xl font-bold text-white">
                    30-Day Intensive Cycle
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Full access to daily challenges &amp; analysis
                  </div>
                </div>

                <div className="sm:text-right bg-slate-900/80 sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-0 border-slate-800">
                  <div className="flex items-baseline gap-1.5 sm:justify-end">
                    <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">₹{coursePrice}</span>
                    <span className="text-sm font-semibold text-slate-400">/ 30 days</span>
                  </div>
                  <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                    Zero auto-debit · Cancel anytime
                  </div>
                </div>
              </div>

              {/* Features List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Daily Video AI Evaluation</div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Pronunciation, grammar, vocabulary, and 4-rubric CEFR scoring.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Interactive Live Rooms</div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Practice live with peers and trainers in interactive video audio rooms.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Streak Protection &amp; Shields</div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Earn streak freeze shields to protect your daily speaking consistency.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">Official GST Invoices</div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Downloadable GST-compliant receipts and milestone performance certificates.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Wallet Cash Value Notice (When user has wallet balance) */}
            {walletBalance > 0 && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 sm:p-5 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xl shrink-0">
                  👛
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-sm font-bold text-emerald-300">
                      You have ₹{walletBalance} in Wallet Cash
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      100% Tax-Free
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Your wallet balance is real cash earned from referrals and speaking streaks. When paying with wallet cash, tax (₹{taxAmount}) is completely waived — you only pay the course fee of ₹{coursePrice}.
                  </p>
                </div>
              </div>
            )}

            {/* Trust Pillars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <div className="text-base mb-1">🛡️</div>
                <div className="text-xs font-bold text-white">Zero Auto-Debit</div>
                <div className="text-[11px] text-slate-400 mt-0.5">One-time payment only</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <div className="text-base mb-1">⚡</div>
                <div className="text-xs font-bold text-white">Instant Activation</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Unlocked immediately</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <div className="text-base mb-1">📄</div>
                <div className="text-xs font-bold text-white">Official Tax Invoice</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Instant PDF download</div>
              </div>
            </div>

          </div>

          {/* ════════ RIGHT COLUMN: Clean Sticky Checkout ════════ */}
          <div className="lg:col-span-5 lg:sticky lg:top-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl p-6 sm:p-7 shadow-2xl space-y-5">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Checkout</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Select your payment method</p>
                </div>
                {walletBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowWalletHistoryModal(true)}
                    className="text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer transition-colors"
                  >
                    Wallet Log ({walletHistory.length})
                  </button>
                )}
              </div>

              {/* Payment Methods */}
              <div className="space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Select Payment Option
                </span>

                {/* Option 1: Pay with Wallet Cash (Shown if user has wallet balance) */}
                {walletBalance > 0 && (
                  <div
                    onClick={() => setPaymentMethod("wallet")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                      paymentMethod === "wallet"
                        ? "border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
                        : "border-slate-800 bg-slate-800/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          paymentMethod === "wallet" ? "border-emerald-500" : "border-slate-600"
                        }`}>
                          {paymentMethod === "wallet" && (
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2">
                            <span>Wallet Cash</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                              0% Tax
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            ₹{walletBalance} cash available
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-extrabold text-emerald-400">
                          ₹{coursePrice}
                        </div>
                        <div className="text-[11px] text-slate-400">wallet cash</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Option 2: Pay via UPI / QR Code */}
                <div
                  onClick={() => setPaymentMethod("upi")}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                    paymentMethod === "upi"
                      ? "border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                      : "border-slate-800 bg-slate-800/40 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        paymentMethod === "upi" ? "border-indigo-500" : "border-slate-600"
                      }`}>
                        {paymentMethod === "upi" && (
                          <div className="w-2 h-2 rounded-full bg-indigo-500" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">
                          UPI / QR Code
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Google Pay, PhonePe, Paytm, BHIM
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-extrabold text-indigo-300">
                        ₹{totalAmount}
                      </div>
                      <div className="text-[11px] text-slate-400">gateway</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Order Summary
                </span>

                {paymentMethod === "wallet" && useWallet ? (
                  /* WALLET SUMMARY */
                  <>
                    <div className="flex justify-between text-xs sm:text-sm text-slate-300">
                      <span>Course Fee</span>
                      <span className="font-semibold">₹{coursePrice}</span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm text-emerald-400 font-bold">
                      <span>Paid via Wallet Cash</span>
                      <span>-₹{isFullWalletCoverage ? coursePrice : walletDiscount}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Tax / GST</span>
                      <span className="text-emerald-400 font-semibold">Waived (₹0)</span>
                    </div>
                    <div className="border-t border-slate-700/60 pt-2.5 mt-1 flex items-center justify-between">
                      <span className="text-sm font-bold text-white">Gateway Due (UPI)</span>
                      <span className="text-lg font-black text-emerald-400">
                        ₹{netPayable}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 text-right pt-0.5">
                      ₹{coursePrice} paid from wallet (₹{remainingWallet} cash balance left)
                    </div>
                  </>
                ) : (
                  /* UPI SUMMARY (Clean, zero wallet text) */
                  <>
                    <div className="flex justify-between text-xs sm:text-sm text-slate-300">
                      <span>Course Fee</span>
                      <span className="font-semibold">₹{coursePrice}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-xs sm:text-sm text-slate-300">
                        <span>Tax / GST</span>
                        <span className="font-semibold">₹{taxAmount}</span>
                      </div>
                    )}
                    <div className="border-t border-slate-700/60 pt-2.5 mt-1 flex items-center justify-between">
                      <span className="text-sm font-bold text-white">Total Payable via UPI</span>
                      <span className="text-lg font-black text-indigo-300">
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

              {/* Action Button */}
              <div>
                <button
                  type="button"
                  onClick={handlePay}
                  disabled={loading}
                  className={`w-full py-3.5 px-6 rounded-xl font-extrabold text-sm sm:text-base text-white cursor-pointer transition-all duration-200 flex items-center justify-center gap-2 shadow-xl ${
                    loading
                      ? "opacity-60 cursor-not-allowed bg-slate-700"
                      : paymentMethod === "wallet"
                        ? "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/25 active:scale-[0.99]"
                        : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-500/25 active:scale-[0.99]"
                  }`}
                >
                  {loading ? (
                    <span>Processing…</span>
                  ) : paymentMethod === "wallet" ? (
                    <span>⚡ Pay ₹{coursePrice} using Wallet Cash</span>
                  ) : (
                    <span>📲 Pay ₹{totalAmount} via UPI</span>
                  )}
                </button>

                {/* Security info: Only show gateway text while payment option is UPI mode! */}
                {paymentMethod === "upi" ? (
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-2.5 mt-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                    <span className="text-indigo-400">🔒</span>
                    <span>256-Bit SSL Encrypted Checkout via Razorpay &amp; UPI</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-xs text-emerald-400/90 py-2.5 mt-3 bg-emerald-950/20 rounded-xl border border-emerald-500/20">
                    <span>⚡</span>
                    <span>Instant wallet deduction · Zero gateway fees &amp; 100% tax-free</span>
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>

      </div>
    </Layout>
  );
}
