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
    if (useWallet && isFullWalletCoverage) {
      setShowWalletConfirmModal(true);
      return;
    }
    await executeOrder({ confirmWalletPayment: false });
  };

  // Step 2: User explicitly confirmed wallet deduction
  const handleConfirmWalletPayment = async () => {
    setShowWalletConfirmModal(false);
    await executeOrder({ confirmWalletPayment: true });
  };

  const executeOrder = async ({ confirmWalletPayment = false } = {}) => {
    setError(null);
    setLoading(true);

    try {
      const { data: order } = await api.post("/payments/create-order", {
        useWallet,
        paymentMethod,
        confirmWalletPayment,
      });

      // CASE A: Server requires confirmation
      if (order.requiresConfirmation && !confirmWalletPayment) {
        setLoading(false);
        setShowWalletConfirmModal(true);
        return;
      }

      // CASE B: 100% Covered by Wallet Cash
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

      // CASE C: Requires UPI / Gateway Payment
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
        theme: { color: "#8B5CF6" },
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
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-3xl mb-4 text-rose-400">
            ✕
          </div>
          <h2 className="text-white text-2xl font-black mb-2 tracking-tight">
            Payment Unsuccessful
          </h2>
          <p className="text-slate-400 text-sm mb-5 leading-relaxed">
            {error || "Something went wrong while processing your transaction."}
          </p>
          <div className="w-full p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 mb-6 leading-relaxed">
            No money was deducted. You can safely retry or use your wallet balance.
          </div>
          <button
            type="button"
            onClick={() => { setFailed(false); setError(null); }}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm cursor-pointer shadow-lg shadow-purple-500/25 transition-all mb-3"
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
          <div className="relative rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-[#111c16] via-[#0c1510] to-[#070e0a] p-6 sm:p-9 shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_40px_rgba(34,197,94,0.15)] text-center overflow-hidden">
            
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-3xl text-emerald-400 shadow-lg shadow-emerald-500/20">
              ✓
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wider uppercase mb-3">
              <span>●</span> Membership Activated
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white mb-2 tracking-tight">
              Welcome to the Cohort!
            </h1>
            <p className="text-slate-400 text-sm max-w-md mx-auto mb-6 leading-relaxed">
              Your 30-day Speak &amp; Shine full pass is now active. Daily AI speech evaluation, live practice rooms, and fluency metrics are fully unlocked.
            </p>

            {/* Receipt Summary Card */}
            <div className="rounded-2xl bg-black/40 border border-white/5 p-4 sm:p-5 text-left mb-6 space-y-3">
              <div className="flex justify-between items-center pb-2.5 border-b border-white/10">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Payment Summary</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
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
                    <span>Paid via Wallet Cash</span>
                    <span>-₹{coursePrice}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-400 pt-1 border-t border-white/5">
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
                  <div className="flex justify-between items-center text-sm text-white font-bold pt-1 border-t border-white/5">
                    <span>Total Paid</span>
                    <span className="text-emerald-400 text-base">₹{successTx?.amount ?? totalAmount}</span>
                  </div>
                </>
              )}

              {successTx?.razorpayPaymentId && (
                <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-white/5">
                  <span>Reference ID</span>
                  <span className="font-mono text-purple-300">{successTx.razorpayPaymentId}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleContinueToDashboard}
                className="flex-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-sm cursor-pointer shadow-lg shadow-purple-500/30 transition-all flex items-center justify-center gap-2"
              >
                <span>🚀</span> Start Speaking Challenges
              </button>
              <button
                type="button"
                onClick={() => setShowInvoiceModal(true)}
                className="py-3.5 px-5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-bold text-sm cursor-pointer transition-colors flex items-center justify-center gap-2"
              >
                <span>📄</span> Official Invoice
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ── MAIN UNIFIED CHECKOUT VIEW ─────────────────────────────────────────────
  return (
    <Layout title="Unlock Full Access">
      
      {/* ── Wallet Deduction Confirmation Modal (Compact, centered, ₹ INR only) ── */}
      {showWalletConfirmModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl bg-[#130f24] border border-emerald-500/40 p-6 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-2xl">
              👛
            </div>
            <h3 className="text-lg font-bold text-white mb-1.5 tracking-tight">
              Confirm Wallet Payment
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mb-4 leading-relaxed">
              Deduct <strong className="text-emerald-400 font-bold">₹{coursePrice}</strong> from your earned wallet cash to activate 30-day cohort membership?
            </p>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 mb-5 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Current Wallet Balance:</span>
                <span className="text-white font-bold">₹{walletBalance}</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-semibold">
                <span>Deduction (Course Price):</span>
                <span>-₹{coursePrice}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tax / GST:</span>
                <span className="text-emerald-400 font-semibold">Waived (₹0)</span>
              </div>
              <div className="flex justify-between text-slate-300 pt-2 border-t border-slate-800 font-semibold">
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
                {loading ? "Activating…" : `Confirm & Pay ₹{coursePrice}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wallet Transaction History Modal ── */}
      {showWalletHistoryModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg max-h-[85vh] rounded-2xl bg-[#130f24] border border-purple-500/30 p-5 sm:p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">👛</span>
                <h3 className="text-base font-bold text-white tracking-tight">Wallet &amp; Referral History</h3>
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
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {tx.reason || "Wallet transaction"}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(tx.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {" · "}Balance: ₹{tx.balanceAfter}
                      </div>
                    </div>
                    <div className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
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

      {/* ── Unified Master Checkout Experience ── */}
      <div className="w-full max-w-5xl mx-auto py-2 sm:py-6 px-2 sm:px-4">
        
        {/* Single Cohesive Master Glassmorphic Card */}
        <div className="relative rounded-3xl border border-purple-500/20 bg-[#100D1C] shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_40px_rgba(139,92,246,0.12)] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute top-0 left-0 w-full h-72 bg-gradient-to-b from-purple-600/10 via-indigo-600/5 to-transparent pointer-events-none" />

          {/* ════════ LEFT COLUMN: Membership Overview (7 cols) ════════ */}
          <div className="lg:col-span-7 p-6 sm:p-8 lg:p-9 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-purple-500/15 relative z-10">
            <div>
              {/* Status Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-bold tracking-wider uppercase mb-3">
                <span className="text-amber-400">✦</span>
                <span>{graceStatus.isGracePeriod ? `${graceStatus.monthName.toUpperCase()} TRIAL ACTIVE` : "30-DAY COHORT PASS"}</span>
              </div>

              {/* Title & Subtitle */}
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                Unlock Unlimited Speech Practice &amp; AI Mentorship
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
                Elevate your English speaking fluency with daily video submissions, instant CEFR AI evaluations, and live practice rooms.
              </p>

              {/* Subscription Price Banner */}
              <div className="my-5 p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900/60 to-purple-950/20 border border-purple-500/20 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-300 block">
                    Cohort Membership Fee
                  </span>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Full 30-day practice cycle
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white tracking-tight">₹{coursePrice}</span>
                    <span className="text-xs font-semibold text-slate-400">/ 30 days</span>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                    Zero auto-debit · One-time fee
                  </div>
                </div>
              </div>

              {/* Core Included Features */}
              <div className="space-y-3 my-5">
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white">Daily AI Speech Analysis</div>
                    <div className="text-xs text-slate-400 leading-relaxed mt-0.5">
                      Grammar fixes, pronunciation scoring, vocabulary enhancement, and CEFR feedback.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white">Interactive Live Speaking Rooms</div>
                    <div className="text-xs text-slate-400 leading-relaxed mt-0.5">
                      Practice live conversations with peer students and trainers in real-time.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white">Streak Protection &amp; Freeze Tokens</div>
                    <div className="text-xs text-slate-400 leading-relaxed mt-0.5">
                      Protect your consistency streaks with streak freeze shields.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white">Official Tax Invoice &amp; Certificates</div>
                    <div className="text-xs text-slate-400 leading-relaxed mt-0.5">
                      Downloadable GST-compliant receipts and milestone performance certificates.
                    </div>
                  </div>
                </div>
              </div>

              {/* Wallet Cash Highlight (Shown if user has balance) */}
              {walletBalance > 0 && (
                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between gap-3 my-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">👛</span>
                    <div>
                      <div className="text-xs font-bold text-emerald-300">
                        You have ₹{walletBalance} in Wallet Cash
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Earned from referrals &amp; streaks. 100% Tax-Free when paying via wallet!
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                    0% TAX
                  </span>
                </div>
              )}
            </div>

            {/* Bottom Trust Indicators */}
            <div className="pt-4 mt-2 border-t border-purple-500/15 flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="text-purple-400">🛡️</span> Zero Recurring Auto-Debit
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="text-amber-400">⚡</span> Instant Activation
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="text-emerald-400">📄</span> Official GST Receipt
              </span>
            </div>
          </div>

          {/* ════════ RIGHT COLUMN: Checkout & Payment Engine (5 cols) ════════ */}
          <div className="lg:col-span-5 p-6 sm:p-8 lg:p-9 flex flex-col justify-between bg-gradient-to-b from-[#141026]/90 via-[#100D1C]/95 to-[#0b0817] relative z-10">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-purple-500/15">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Checkout</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Select payment method</p>
                </div>
                {walletBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowWalletHistoryModal(true)}
                    className="text-xs text-purple-300 hover:text-white px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 cursor-pointer transition-colors shrink-0 whitespace-nowrap"
                  >
                    Wallet History
                  </button>
                )}
              </div>

              {/* Payment Methods */}
              <div className="my-5 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Select Payment Option
                </span>

                {/* Option 1: Pay with Wallet Cash (if user has wallet balance) */}
                {walletBalance > 0 && (
                  <div
                    onClick={() => setPaymentMethod("wallet")}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
                      paymentMethod === "wallet"
                        ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
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
                        <div className="text-[10px] text-slate-400">wallet cash</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Option 2: Pay via UPI / QR Code */}
                <div
                  onClick={() => setPaymentMethod("upi")}
                  className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
                    paymentMethod === "upi"
                      ? "border-purple-500 bg-purple-500/10 shadow-[0_0_20px_rgba(139,92,246,0.15)]"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        paymentMethod === "upi" ? "border-purple-500" : "border-slate-600"
                      }`}>
                        {paymentMethod === "upi" && (
                          <div className="w-2 h-2 rounded-full bg-purple-500" />
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
                      <div className="text-base font-extrabold text-purple-300">
                        ₹{totalAmount}
                      </div>
                      <div className="text-[10px] text-slate-400">gateway</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="p-4 rounded-2xl bg-black/30 border border-purple-500/15 space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Order Breakdown
                </span>

                {paymentMethod === "wallet" && useWallet ? (
                  /* WALLET BREAKDOWN */
                  <>
                    <div className="flex justify-between text-xs sm:text-sm text-slate-300">
                      <span>Course Fee</span>
                      <span className="font-semibold text-white">₹{coursePrice}</span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm text-emerald-400 font-bold">
                      <span>Paid via Wallet Cash</span>
                      <span>-₹{isFullWalletCoverage ? coursePrice : walletDiscount}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Tax / GST</span>
                      <span className="text-emerald-400 font-semibold">Waived (₹0)</span>
                    </div>
                    <div className="border-t border-purple-500/15 pt-2 mt-1 flex items-center justify-between">
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
                  /* UPI BREAKDOWN (Clean, zero wallet text) */
                  <>
                    <div className="flex justify-between text-xs sm:text-sm text-slate-300">
                      <span>Course Fee</span>
                      <span className="font-semibold text-white">₹{coursePrice}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-xs sm:text-sm text-slate-300">
                        <span>Tax / GST</span>
                        <span className="font-semibold text-white">₹{taxAmount}</span>
                      </div>
                    )}
                    <div className="border-t border-purple-500/15 pt-2 mt-1 flex items-center justify-between">
                      <span className="text-sm font-bold text-white">Total Payable via UPI</span>
                      <span className="text-lg font-black text-purple-300">
                        ₹{totalAmount}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Error Notice */}
              {error && (
                <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs leading-relaxed">
                  ⚠️ {error}
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 pt-2">
              <button
                type="button"
                onClick={handlePay}
                disabled={loading}
                className={`w-full py-4 px-6 rounded-2xl font-extrabold text-sm sm:text-base text-white cursor-pointer transition-all duration-200 flex items-center justify-center gap-2 shadow-xl ${
                  loading
                    ? "opacity-60 cursor-not-allowed bg-slate-700"
                    : paymentMethod === "wallet"
                      ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-[0_4px_24px_rgba(16,185,129,0.3)] active:scale-[0.99]"
                      : "bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-[0_4px_24px_rgba(139,92,246,0.3)] active:scale-[0.99]"
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
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-2.5 mt-3 bg-purple-500/5 rounded-xl border border-purple-500/15">
                  <span className="text-purple-400">🔒</span>
                  <span>256-Bit SSL Encrypted Checkout via Razorpay &amp; UPI</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-xs text-emerald-400 py-2.5 mt-3 bg-emerald-500/5 rounded-xl border border-emerald-500/15">
                  <span>⚡</span>
                  <span>Instant wallet deduction · Zero gateway fees &amp; 100% tax-free</span>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </Layout>
  );
}
