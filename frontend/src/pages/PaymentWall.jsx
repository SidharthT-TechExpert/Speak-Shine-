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
      {/* Scoped CSS for responsive 2-column layout and animations */}
      <style>{`
        .pw-container {
          max-width: 1060px;
          margin: 1.5rem auto 3rem;
          padding: 0 1.25rem;
          box-sizing: border-box;
        }
        .pw-grid {
          display: grid;
          grid-template-columns: 1.12fr 0.98fr;
          gap: 2rem;
          align-items: start;
        }
        @media (max-width: 880px) {
          .pw-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
          .pw-container {
            margin: 1rem auto 2rem;
            padding: 0 1rem;
          }
        }
        .pw-card {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-sizing: border-box;
        }
        .pw-option-card {
          border: 1.5px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.02);
          border-radius: 14px;
          padding: 0.95rem 1.1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pw-option-card:hover {
          border-color: rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.04);
        }
        .pw-option-active-wallet {
          border-color: #10b981 !important;
          background: rgba(16, 185, 129, 0.08) !important;
          box-shadow: 0 0 20px rgba(16, 185, 129, 0.12);
        }
        .pw-option-active-upi {
          border-color: #7c6fff !important;
          background: rgba(124, 111, 255, 0.08) !important;
          box-shadow: 0 0 20px rgba(124, 111, 255, 0.12);
        }
        .pw-btn-primary {
          width: 100%;
          border: none;
          border-radius: 14px;
          padding: 0.95rem 1.5rem;
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: 0.02em;
          color: #ffffff;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .pw-btn-primary:active {
          transform: scale(0.99);
        }
      `}</style>

      {/* ── Wallet Deduction Confirmation Modal ── */}
      {showWalletConfirmModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          width: "100vw", height: "100vh",
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          boxSizing: "border-box",
        }}>
          <div style={{
            background: "#0f172a",
            border: "1px solid rgba(74, 222, 128, 0.35)",
            borderRadius: 20,
            width: "100%",
            maxWidth: 370,
            margin: "auto",
            padding: "1.6rem",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.8), 0 0 25px rgba(74, 222, 128, 0.12)",
            textAlign: "center",
            boxSizing: "border-box",
            maxHeight: "90vh",
            overflowY: "auto",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: "rgba(74, 222, 128, 0.12)",
              border: "1px solid rgba(74, 222, 128, 0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.75rem", margin: "0 auto 1rem",
            }}>
              👛
            </div>
            <h3 style={{ margin: "0 0 0.4rem", fontSize: "1.2rem", fontWeight: 800, color: "#ffffff" }}>
              Confirm Wallet Payment
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
              Pay <strong style={{ color: "#4ade80" }}>₹{coursePrice}</strong> from your wallet balance to activate full membership access?
            </p>

            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 12,
              padding: "0.65rem 0.95rem",
              marginBottom: "1.25rem",
              fontSize: "0.82rem",
            }}>
              <span style={{ color: "#94a3b8" }}>Wallet: ₹{walletBalance}</span>
              <span style={{ color: "rgba(255, 255, 255, 0.2)" }}>→</span>
              <span style={{ color: "#4ade80", fontWeight: 700 }}>₹{remainingWallet} remaining</span>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setShowWalletConfirmModal(false)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  borderRadius: 12,
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(255, 255, 255, 0.05)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWalletPayment}
                disabled={loading}
                style={{
                  flex: 1.35,
                  padding: "0.75rem",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: "0.88rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 18px rgba(16, 185, 129, 0.35)",
                }}
              >
                {loading ? "Activating…" : `Confirm ₹${coursePrice}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wallet Transaction History Modal ── */}
      {showWalletHistoryModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0, 0, 0, 0.8)", backdropFilter: "blur(8px)",
          zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1rem", boxSizing: "border-box",
        }}>
          <div style={{
            background: "#0f172a", border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "80vh",
            overflowY: "auto", padding: "1.5rem", boxShadow: "0 25px 60px rgba(0,0,0,0.8)",
            boxSizing: "border-box",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", paddingBottom: "0.75rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#ffffff", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>👛</span> Wallet Activity
              </h3>
              <button
                type="button"
                onClick={() => setShowWalletHistoryModal(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.1)", border: "none", color: "#fff",
                  borderRadius: "50%", width: 28, height: 28, fontSize: "0.9rem", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            {walletHistory.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--muted)", padding: "1.75rem 1rem", fontSize: "0.85rem", margin: 0 }}>
                No wallet transactions recorded yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {[...walletHistory].reverse().map((tx, idx) => (
                  <div key={idx} style={{
                    background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 12, padding: "0.75rem 0.9rem", display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.2rem" }}>
                        {tx.reason || "Wallet transaction"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                        {new Date(tx.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {" · "}Balance after: ₹{tx.balanceAfter}
                      </div>
                    </div>
                    <div style={{
                      fontWeight: 800, fontSize: "0.88rem",
                      color: tx.type === "credit" ? "#4ade80" : "#f87171",
                      background: tx.type === "credit" ? "rgba(74, 222, 128, 0.1)" : "rgba(248, 113, 113, 0.1)",
                      padding: "0.2rem 0.55rem", borderRadius: 8,
                      border: `1px solid ${tx.type === "credit" ? "rgba(74, 222, 128, 0.3)" : "rgba(248, 113, 113, 0.3)"}`,
                    }}>
                      {tx.type === "credit" ? `+₹${tx.amount}` : `-₹${tx.amount}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main Layout: Responsive 2-Column Desktop Grid ── */}
      <div className="pw-container">
        <div className="pw-grid">
          
          {/* ════════ COLUMN 1: Value Proposition & Membership Benefits ════════ */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            
            {/* Header Badge & Title */}
            <div>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                background: "rgba(124, 111, 255, 0.12)",
                border: "1px solid rgba(124, 111, 255, 0.28)",
                borderRadius: 99,
                padding: "0.3rem 0.85rem",
                fontSize: "0.74rem",
                fontWeight: 800,
                color: "#a78bfa",
                letterSpacing: "0.04em",
                marginBottom: "0.75rem",
              }}>
                <span>✨</span>
                <span>{graceStatus.isGracePeriod ? `${graceStatus.monthName.toUpperCase()} TRIAL WINDOW ACTIVE` : "PREMIUM MEMBERSHIP"}</span>
              </div>
              <h1 style={{
                fontSize: "1.65rem",
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.25,
                margin: "0 0 0.5rem",
                letterSpacing: "-0.01em",
              }}>
                {graceStatus.isGracePeriod
                  ? `Unlock Full ${graceStatus.monthName} Membership`
                  : "Unlock Full AI Fluency Practice"}
              </h1>
              <p style={{
                color: "#94a3b8",
                fontSize: "0.9rem",
                lineHeight: 1.55,
                margin: 0,
              }}>
                {graceStatus.isGracePeriod
                  ? `Day ${graceStatus.dayOfMonth} of 2 free access is running. Lock in your monthly membership now for seamless speaking practice all month.`
                  : "Practice speaking every day, get instant AI pronunciation and grammar scores, and interact in live cohort practice rooms."}
              </p>
            </div>

            {/* Plan Overview Card */}
            <div className="pw-card" style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem" }}>
                <div>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
                    Selected Plan
                  </div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#ffffff" }}>
                    Speak &amp; Shine Cohort Access
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "1.6rem", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.02em" }}>
                    ₹{coursePrice}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8", marginLeft: "0.25rem" }}>
                    /month
                  </span>
                </div>
              </div>

              {/* Benefits Checklist */}
              <div style={{
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                paddingTop: "1.1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.8rem",
              }}>
                {[
                  "Daily video practice submission & AI evaluation",
                  "Instant fluency, grammar & confidence scoring",
                  "CEFR level benchmark & detailed feedback",
                  "Interactive Live Practice Rooms & cohort feed",
                  "Daily streak tracking & leaderboard rankings",
                ].map((feature, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.65rem", fontSize: "0.87rem", color: "#e2e8f0" }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%",
                      background: "rgba(74, 222, 128, 0.15)",
                      color: "#4ade80", fontSize: "0.72rem", fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      ✓
                    </div>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust Badges */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
              padding: "0.75rem 1rem",
              borderRadius: 14,
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              fontSize: "0.75rem",
              color: "#94a3b8",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span>🔒</span> 256-Bit Encrypted
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span>⚡</span> Instant Activation
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span>🛡️</span> Zero Auto-Deductions
              </span>
            </div>

          </div>

          {/* ════════ COLUMN 2: Checkout Panel & Payment Actions ════════ */}
          <div className="pw-card" style={{ padding: "1.6rem" }}>
            
            {/* Checkout Header */}
            <div style={{ marginBottom: "1.25rem", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "0.85rem" }}>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff" }}>
                Checkout
              </div>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                Select your payment method to proceed
              </div>
            </div>

            {/* Wallet Balance Strip (If user has wallet balance) */}
            {walletBalance > 0 && (
              <div style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.22)",
                borderRadius: 12,
                padding: "0.7rem 0.95rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "1.1rem" }}>👛</span>
                  <div>
                    <span style={{ fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "block" }}>
                      Wallet Balance
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 900, color: "#4ade80" }}>
                      ₹{walletBalance}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowWalletHistoryModal(true)}
                  style={{
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#cbd5e1",
                    borderRadius: 8,
                    padding: "0.35rem 0.65rem",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  History {walletHistory.length > 0 ? `(${walletHistory.length})` : ""}
                </button>
              </div>
            )}

            {/* Payment Method Selector (Shown when user has wallet money) */}
            {walletBalance > 0 && (
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.65rem" }}>
                  Payment Method
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                  {/* Option 1: Wallet */}
                  <div
                    onClick={() => setPaymentMethod("wallet")}
                    className={`pw-option-card ${paymentMethod === "wallet" ? "pw-option-active-wallet" : ""}`}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        border: paymentMethod === "wallet" ? "5px solid #10b981" : "2px solid rgba(255, 255, 255, 0.3)",
                        background: "#000", flexShrink: 0,
                      }} />
                      <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#ffffff", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                        <span>💰 Pay with Wallet</span>
                        <span style={{ fontSize: "0.7rem", background: "rgba(16, 185, 129, 0.18)", color: "#4ade80", padding: "0.15rem 0.45rem", borderRadius: 6, fontWeight: 700 }}>
                          ₹{walletBalance}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#4ade80" }}>
                      {isFullWalletCoverage ? "₹0" : `₹${netPayable}`}
                    </div>
                  </div>

                  {/* Option 2: UPI / QR Code */}
                  <div
                    onClick={() => setPaymentMethod("upi")}
                    className={`pw-option-card ${paymentMethod === "upi" ? "pw-option-active-upi" : ""}`}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        border: paymentMethod === "upi" ? "5px solid #7c6fff" : "2px solid rgba(255, 255, 255, 0.3)",
                        background: "#000", flexShrink: 0,
                      }} />
                      <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#ffffff" }}>
                        <span>📲 Pay via UPI / QR Code</span>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#a5b4fc" }}>
                      ₹{totalAmount}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Summary */}
            <div style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 14,
              padding: "1rem",
              marginBottom: "1.25rem",
            }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.65rem" }}>
                Payment Summary
              </div>

              {paymentMethod === "wallet" && useWallet ? (
                /* WALLET SUMMARY */
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                    <span>Course Price:</span>
                    <span>₹{coursePrice}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#4ade80", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                    <span>Wallet Deduction:</span>
                    <span>-₹{isFullWalletCoverage ? coursePrice : walletDiscount}</span>
                  </div>
                  {!isFullWalletCoverage && taxAmount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                      <span>Tax / GST:</span>
                      <span>₹{taxAmount}</span>
                    </div>
                  )}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingTop: "0.6rem",
                    marginTop: "0.2rem",
                  }}>
                    <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "#ffffff" }}>
                      Total Due:
                    </span>
                    <span style={{ fontSize: "1.15rem", fontWeight: 900, color: netPayable === 0 ? "#4ade80" : "#38bdf8" }}>
                      ₹{netPayable}
                    </span>
                  </div>
                </>
              ) : (
                /* UPI SUMMARY (Clean, zero wallet mentions) */
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                    <span>Course Price:</span>
                    <span>₹{coursePrice}</span>
                  </div>
                  {taxAmount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                      <span>Tax / GST:</span>
                      <span>₹{taxAmount}</span>
                    </div>
                  )}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingTop: "0.6rem",
                    marginTop: "0.2rem",
                  }}>
                    <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "#ffffff" }}>
                      Total Due:
                    </span>
                    <span style={{ fontSize: "1.15rem", fontWeight: 900, color: "#a5b4fc" }}>
                      ₹{totalAmount}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Error Notification */}
            {error && (
              <div style={{
                background: "rgba(248, 113, 113, 0.12)",
                border: "1px solid rgba(248, 113, 113, 0.3)",
                borderRadius: 12,
                padding: "0.75rem 0.95rem",
                marginBottom: "1rem",
                color: "#f87171",
                fontSize: "0.82rem",
                lineHeight: 1.45,
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* Primary Action Button */}
            <button
              onClick={handlePay}
              disabled={loading}
              className="pw-btn-primary"
              style={{
                background: loading
                  ? "rgba(124, 111, 255, 0.4)"
                  : netPayable === 0
                    ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                    : "linear-gradient(135deg, #7c6fff 0%, #6366f1 100%)",
                boxShadow: loading ? "none" : netPayable === 0 ? "0 6px 20px rgba(16, 185, 129, 0.35)" : "0 6px 20px rgba(124, 111, 255, 0.35)",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <span>Processing…</span>
              ) : netPayable === 0 ? (
                <span>⚡ Activate Membership (₹0)</span>
              ) : paymentMethod === "upi" ? (
                <span>📲 Pay ₹{totalAmount} via UPI</span>
              ) : (
                <span>💳 Pay ₹{netPayable}</span>
              )}
            </button>

            {/* Security subtext */}
            <div style={{ textAlign: "center", color: "#64748b", fontSize: "0.74rem", marginTop: "0.85rem" }}>
              Secure payment via Razorpay &amp; UPI. Instant access activated upon confirmation.
            </div>

          </div>

        </div>
      </div>
    </Layout>
  );
}
