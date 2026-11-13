/**
 * PaymentWall — full-width single view, no side gaps, no scroll
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
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const DEFAULT = 5;

export default function PaymentWall({ onSuccess }) {
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState(null);
  const [paid,    setPaid]      = useState(false);
  const [successTx, setSuccessTx]               = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [failed,  setFailed]    = useState(false);
  const [graceStatus]           = useState(() => getMonthlyGracePeriodStatus());
  const navigate                = useNavigate();
  const { updateUser, user }    = useAuth();

  const [walletBalance, setWalletBalance]       = useState(0);
  const [walletHistory, setWalletHistory]       = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [paymentMethod, setPaymentMethod]       = useState("wallet");
  const [pricing, setPricing] = useState({ coursePrice: DEFAULT, taxAmount: 0, totalAmount: DEFAULT });

  useEffect(() => {
    api.get("/payments/config").then(({ data }) => {
      const cp  = Number(data?.coursePrice ?? data?.amount ?? DEFAULT);
      const tx  = Number(data?.taxAmount ?? 0);
      const tot = Number(data?.totalAmount ?? (cp + tx));
      setPricing({ coursePrice: cp, taxAmount: tx, totalAmount: tot });
    }).catch(() => {});
    api.get("/payments/wallet").then(({ data }) => {
      if (data?.success) {
        const bal = Number(data.walletBalance) || 0;
        setWalletBalance(bal);
        setWalletHistory(data.walletHistory || []);
        if (bal <= 0) setPaymentMethod("upi");
      }
    }).catch(() => {});
  }, []);

  const { coursePrice, taxAmount, totalAmount } = pricing;
  const useWallet      = paymentMethod === "wallet" && walletBalance > 0;
  const isFullWallet   = useWallet && walletBalance >= coursePrice;
  const walletDiscount = useWallet ? Math.round(Math.min(walletBalance, coursePrice) * 100) / 100 : 0;
  const netPayable     = isFullWallet ? 0 : useWallet
    ? Math.round(Math.max(0, coursePrice - walletDiscount + taxAmount) * 100) / 100
    : totalAmount;
  const remainingWallet = isFullWallet
    ? Math.round(Math.max(0, walletBalance - coursePrice) * 100) / 100
    : Math.round(Math.max(0, walletBalance - walletDiscount) * 100) / 100;

  const handlePay = async () => {
    setError(null);
    if (useWallet && isFullWallet) { setShowConfirmModal(true); return; }
    await executeOrder({ confirmWalletPayment: false });
  };
  const handleConfirmWallet = async () => {
    setShowConfirmModal(false);
    await executeOrder({ confirmWalletPayment: true });
  };
  const executeOrder = async ({ confirmWalletPayment = false } = {}) => {
    setError(null); setLoading(true);
    try {
      const { data: order } = await api.post("/payments/create-order", { useWallet, paymentMethod, confirmWalletPayment });
      if (order.requiresConfirmation && !confirmWalletPayment) { setLoading(false); setShowConfirmModal(true); return; }
      if (order.walletCovered) {
        const tx = { name: user?.name || user?.registeredName || "Student Member", phone: user?.phone, amount: coursePrice, totalFee: order.totalFee || coursePrice, coursePrice: order.coursePrice || coursePrice, taxAmount: 0, walletDiscountApplied: order.walletDiscountApplied || coursePrice, isWalletCovered: true, razorpayOrderId: "wallet_payment", razorpayPaymentId: "wallet_covered", status: "success", source: "wallet", createdAt: new Date().toISOString() };
        setSuccessTx(tx); setPaid(true);
        const nb = order.walletBalance ?? remainingWallet;
        setWalletBalance(nb);
        if (updateUser) updateUser({ paid: true, walletBalance: nb });
        setLoading(false); return;
      }
      const ok = await loadRazorpayScript();
      if (!ok) { setError("Payment system failed to load."); setLoading(false); return; }
      const options = {
        key: order.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount, currency: order.currency,
        name: "Speak & Shine",
        description: order.walletDiscountApplied > 0 ? `Premium Membership (₹${order.walletDiscountApplied} Wallet Applied)` : "Premium Membership",
        image: "/icons/icon-192.png", order_id: order.order_id,
        config: { display: { blocks: { upiBlock: { name: "Pay via UPI / QR Code", instruments: [{ method: "upi" }] } }, sequence: ["block.upiBlock"], preferences: { show_default_blocks: false } } },
        method: { upi: true, card: false, netbanking: false, wallet: false, emi: false, paylater: false },
        handler: async (response) => {
          try {
            await api.post("/payments/verify", { razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature });
            const tx = { name: user?.name || user?.registeredName || "Student Member", phone: user?.phone, amount: order.netPayableINR ?? Math.max(0, totalAmount - (order.walletDiscountApplied || 0)), totalFee: order.totalFee || totalAmount, coursePrice, taxAmount, walletDiscountApplied: order.walletDiscountApplied || 0, isWalletCovered: false, razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, status: "success", source: "razorpay", createdAt: new Date().toISOString() };
            setSuccessTx(tx); setPaid(true); if (updateUser) updateUser({ paid: true });
          } catch (ve) {
            const st = ve?.response?.status, msg = ve?.response?.data?.error || "";
            if (st === 409 || msg.includes("already been processed")) {
              const tx = { name: user?.name || user?.registeredName || "Student Member", phone: user?.phone, amount: order.netPayableINR ?? Math.max(0, totalAmount - (order.walletDiscountApplied || 0)), totalFee: order.totalFee || totalAmount, coursePrice, taxAmount, walletDiscountApplied: order.walletDiscountApplied || 0, isWalletCovered: false, razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, status: "success", source: "razorpay", createdAt: new Date().toISOString() };
              setSuccessTx(tx); setPaid(true); if (updateUser) updateUser({ paid: true });
            } else { setError(msg || "Verification failed. Contact support."); }
          } finally { setLoading(false); }
        },
        modal: { ondismiss: () => { setLoading(false); setError("Payment cancelled. Try again anytime."); } },
        prefill: { name: user?.name || "", contact: user?.phone || "" },
        theme: { color: "#8B5CF6" },
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (r) => { setLoading(false); setFailed(true); setError(r.error?.description || "Payment failed."); });
      rzp.open();
    } catch (err) { setError(err?.response?.data?.error || "Could not initiate payment."); setLoading(false); }
  };

  const handleContinue = () => {
    if (updateUser) updateUser({ paid: true });
    if (onSuccess) onSuccess(); else navigate("/video-analysis", { replace: true });
  };

  const isWalletSelected = paymentMethod === "wallet";

  // ── FAILED ────────────────────────────────────────────────────────────────
  if (failed) return (
    <Layout title="Payment Failed">
      <div style={{ height:"calc(100vh - 56px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem" }}>
        <div style={{ textAlign:"center", maxWidth:300 }}>
          <div style={{ width:52,height:52,borderRadius:14,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,margin:"0 auto 1rem" }}>✕</div>
          <h2 style={{ color:"var(--text)",fontSize:"1.3rem",fontWeight:900,marginBottom:"0.4rem" }}>Payment Unsuccessful</h2>
          <p style={{ color:"var(--text2)",fontSize:"0.83rem",marginBottom:"1.25rem",lineHeight:1.7 }}>{error||"No money was deducted. You can safely retry."}</p>
          <button type="button" onClick={()=>{setFailed(false);setError(null);}} style={{ width:"100%",padding:"0.875rem",borderRadius:11,background:"var(--primary)",border:"none",color:"#fff",fontWeight:800,fontSize:"0.875rem",cursor:"pointer",marginBottom:"0.5rem" }}>Try Again</button>
          <button type="button" onClick={()=>navigate("/dashboard")} style={{ background:"none",border:"none",color:"var(--muted)",fontSize:"0.75rem",cursor:"pointer" }}>Return to Dashboard</button>
        </div>
      </div>
    </Layout>
  );

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  if (paid) {
    const isWalletPay = successTx?.isWalletCovered || successTx?.source === "wallet";
    return (
      <Layout title="Access Unlocked">
        {showInvoiceModal && <Suspense fallback={null}><InvoiceModal transaction={successTx} user={user} onClose={()=>setShowInvoiceModal(false)} /></Suspense>}
        <div style={{ height:"calc(100vh - 56px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem" }}>
          <div style={{ width:"100%",maxWidth:400,borderRadius:20,border:"1px solid rgba(34,197,94,0.2)",background:"var(--card)",padding:"2rem",boxShadow:"var(--shadow-lg)",textAlign:"center",position:"relative",overflow:"hidden" }}>
            <div style={{ position:"absolute",top:0,left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba(34,197,94,0.5),transparent)" }} />
            <div style={{ width:52,height:52,borderRadius:14,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:"#22c55e",margin:"0 auto 0.875rem" }}>✓</div>
            <h1 style={{ fontFamily:"'Playfair Display',serif",color:"var(--text)",fontSize:"1.4rem",fontWeight:900,marginBottom:"0.35rem" }}>Welcome to the Cohort!</h1>
            <p style={{ color:"var(--text2)",fontSize:"0.82rem",lineHeight:1.7,marginBottom:"1.25rem" }}>Your 30-day pass is active. AI evaluations, live rooms &amp; fluency metrics unlocked.</p>
            <div style={{ borderRadius:10,border:"1px solid var(--border)",background:"var(--card2)",padding:"0.75rem 0.875rem",textAlign:"left",marginBottom:"1.125rem",display:"flex",flexDirection:"column",gap:"0.4rem" }}>
              <R label="Course Price" value={`₹${coursePrice}`} />
              {isWalletPay ? <R label="Paid via Wallet" value={`−₹${coursePrice}`} green /> : <R label="Total Paid" value={`₹${successTx?.amount??totalAmount}`} green />}
              {successTx?.razorpayPaymentId && <R label="Ref" value={successTx.razorpayPaymentId} mono />}
            </div>
            <div style={{ display:"flex",gap:"0.5rem" }}>
              <button type="button" onClick={handleContinue} style={{ flex:1,padding:"0.875rem",borderRadius:11,background:"var(--cta)",border:"none",color:"#fff",fontWeight:800,fontSize:"0.875rem",cursor:"pointer",boxShadow:"0 4px 16px rgba(255,122,24,0.3)" }}>🚀 Start Speaking</button>
              <button type="button" onClick={()=>setShowInvoiceModal(true)} style={{ padding:"0.875rem 1rem",borderRadius:11,background:"var(--card2)",border:"1px solid var(--border)",color:"var(--text2)",fontWeight:700,cursor:"pointer" }}>📄</button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ── CHECKOUT ──────────────────────────────────────────────────────────────
  return (
    <Layout title="Unlock Full Access">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .pw-page {
          height: calc(100vh - 56px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg);
        }
        /* Scrollable middle section */
        .pw-mid {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-width: none;
        }
        .pw-mid::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div style={{ position:"fixed",inset:0,zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem",background:"rgba(8,7,17,0.8)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)" }}>
          <div style={{ width:"100%",maxWidth:320,borderRadius:18,background:"var(--card2)",border:"1px solid rgba(34,197,94,0.3)",padding:"1.5rem",boxShadow:"0 24px 60px rgba(0,0,0,0.6)",textAlign:"center" }}>
            <div style={{ fontSize:"1.5rem",marginBottom:"0.5rem" }}>👛</div>
            <h3 style={{ color:"var(--text)",fontSize:"0.95rem",fontWeight:900,marginBottom:"0.3rem" }}>Confirm Wallet Payment</h3>
            <p style={{ color:"var(--text2)",fontSize:"0.8rem",marginBottom:"0.875rem",lineHeight:1.65 }}>Deduct <strong style={{ color:"#4ade80" }}>₹{coursePrice}</strong> to activate 30-day membership?</p>
            <div style={{ background:"var(--bg)",border:"1px solid var(--border)",borderRadius:9,padding:"0.625rem 0.75rem",marginBottom:"0.875rem",display:"flex",flexDirection:"column",gap:"0.35rem" }}>
              {[["Wallet Balance",`₹${walletBalance}`,"var(--text)"],["Deduction",`−₹${coursePrice}`,"#4ade80"],["Tax / GST","Waived · ₹0","#4ade80"],["Balance After",`₹${remainingWallet}`,"#4ade80"]].map(([l,v,c])=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",fontSize:"0.775rem" }}>
                  <span style={{ color:"var(--text2)" }}>{l}</span><span style={{ fontWeight:700,color:c }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex",gap:"0.5rem" }}>
              <button type="button" onClick={()=>setShowConfirmModal(false)} disabled={loading} style={{ flex:1,padding:"0.7rem",borderRadius:9,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text2)",fontWeight:700,fontSize:"0.82rem",cursor:"pointer" }}>Cancel</button>
              <button type="button" onClick={handleConfirmWallet} disabled={loading} style={{ flex:1.6,padding:"0.7rem",borderRadius:9,border:"none",background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",fontWeight:800,fontSize:"0.82rem",cursor:"pointer" }}>
                {loading?"Activating…":`Pay ₹${coursePrice}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div style={{ position:"fixed",inset:0,zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem",background:"rgba(8,7,17,0.8)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)" }}>
          <div style={{ width:"100%",maxWidth:400,maxHeight:"70vh",borderRadius:18,background:"var(--card2)",border:"1px solid var(--border2)",padding:"1.25rem",boxShadow:"0 24px 60px rgba(0,0,0,0.6)",display:"flex",flexDirection:"column" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:"0.625rem",borderBottom:"1px solid var(--border)",marginBottom:"0.625rem" }}>
              <div style={{ display:"flex",alignItems:"center",gap:"0.5rem" }}>
                <span>👛</span><span style={{ color:"var(--text)",fontWeight:900,fontSize:"0.9rem" }}>Wallet History</span>
              </div>
              <button type="button" onClick={()=>setShowHistoryModal(false)} style={{ width:26,height:26,borderRadius:"50%",background:"var(--card)",border:"1px solid var(--border)",color:"var(--text2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.72rem" }}>✕</button>
            </div>
            <div style={{ overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:"0.35rem" }}>
              {walletHistory.length===0
                ? <div style={{ textAlign:"center",padding:"2rem 0",color:"var(--muted)",fontSize:"0.82rem" }}>No transactions yet.</div>
                : [...walletHistory].reverse().map((tx,i)=>(
                  <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.6rem 0.75rem",borderRadius:8,background:"var(--card)",border:"1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize:"0.775rem",fontWeight:600,color:"var(--text)" }}>{tx.reason||"Transaction"}</div>
                      <div style={{ fontSize:"0.66rem",color:"var(--muted)",marginTop:1 }}>{new Date(tx.date).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                    </div>
                    <span style={{ fontSize:"0.775rem",fontWeight:800,padding:"2px 8px",borderRadius:6,border:"1px solid",color:tx.type==="credit"?"#4ade80":"#f87171",background:tx.type==="credit"?"rgba(74,222,128,0.08)":"rgba(248,113,113,0.08)",borderColor:tx.type==="credit"?"rgba(74,222,128,0.2)":"rgba(248,113,113,0.2)" }}>
                      {tx.type==="credit"?"+":"−"}₹{tx.amount}
                    </span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN LAYOUT: full width, no side gaps ── */}
      <div className="pw-page">

        {/* ── TOP: header — fixed, never scrolls ── */}
        <div style={{ flexShrink:0, padding:"1.25rem 1.5rem 1rem", borderBottom:"1px solid var(--border)", background:"var(--bg)" }}>

          {/* Row 1: badge + price */}
          <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"1rem",marginBottom:"0.875rem" }}>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:99,background:"var(--card2)",border:"1px solid var(--border2)",color:"var(--primary-light)",fontSize:"0.58rem",fontWeight:800,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:"0.5rem" }}>
                <span style={{ color:"#f59e0b" }}>✦</span>
                {graceStatus.isGracePeriod ? `${graceStatus.monthName.toUpperCase()} TRIAL` : "30-DAY COHORT PASS"}
              </div>
              <h1 style={{ fontFamily:"'Playfair Display',serif",fontSize:"clamp(1.1rem,2.2vw,1.4rem)",fontWeight:900,color:"var(--text)",letterSpacing:"-0.025em",lineHeight:1.25,margin:0 }}>
                Unlock Speech Practice &amp;{" "}
                <em style={{ color:"var(--primary-light)",fontStyle:"italic" }}>AI Mentorship</em>
              </h1>
            </div>
            {/* Price — compact, top right */}
            <div style={{ textAlign:"right",flexShrink:0 }}>
              <div style={{ fontFamily:"'Playfair Display',serif",fontSize:"clamp(1.5rem,3vw,2rem)",fontWeight:900,color:"var(--text)",letterSpacing:"-0.04em",lineHeight:1 }}>₹{coursePrice}</div>
              <div style={{ fontSize:"0.58rem",color:"var(--muted)",marginTop:1 }}>/ 30 days</div>
              <div style={{ fontSize:"0.58rem",color:"var(--success)",fontWeight:700,marginTop:1 }}>One-time fee</div>
            </div>
          </div>

          {/* Row 2: wallet strip */}
          {walletBalance > 0 && (
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.55rem 0.875rem",borderRadius:9,background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.18)",gap:"0.5rem" }}>
              <div style={{ display:"flex",alignItems:"center",gap:"0.5rem" }}>
                <span style={{ fontSize:"0.9rem" }}>👛</span>
                <div>
                  <div style={{ fontSize:"0.75rem",fontWeight:700,color:"#4ade80" }}>₹{walletBalance} Wallet Cash — Tax-Free</div>
                  <div style={{ fontSize:"0.62rem",color:"var(--muted)" }}>Earned from referrals &amp; streaks</div>
                </div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:"0.625rem",flexShrink:0 }}>
                <span style={{ fontSize:"0.56rem",fontWeight:900,padding:"1px 6px",borderRadius:99,background:"rgba(34,197,94,0.1)",color:"#4ade80",border:"1px solid rgba(34,197,94,0.2)" }}>0% TAX</span>
                <button type="button" onClick={()=>setShowHistoryModal(true)}
                  style={{ background:"none",border:"none",padding:0,color:"var(--primary-light)",fontSize:"0.62rem",cursor:"pointer",display:"flex",alignItems:"center",gap:3,opacity:0.85,whiteSpace:"nowrap" }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  History
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── MIDDLE: methods + summary — flex:1, scrollable if needed ── */}
        <div className="pw-mid">

          {/* Payment methods */}
          <div style={{ padding:"1rem 1.5rem",display:"flex",flexDirection:"column",gap:"0.4rem" }}>
            <div style={{ fontSize:"0.56rem",fontWeight:800,textTransform:"uppercase",letterSpacing:"0.14em",color:"var(--muted)",marginBottom:"0.1rem" }}>Payment Method</div>

            {walletBalance > 0 && (
              <div onClick={()=>setPaymentMethod("wallet")}
                style={{ borderRadius:9,border:`1px solid ${isWalletSelected?"rgba(34,197,94,0.4)":"var(--border)"}`,background:isWalletSelected?"rgba(34,197,94,0.05)":"var(--card2)",cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",gap:"0.625rem",padding:"0.7rem 0.875rem",boxShadow:isWalletSelected?"0 0 0 1px rgba(34,197,94,0.1)":"none" }}>
                <div style={{ width:14,height:14,borderRadius:"50%",border:`2px solid ${isWalletSelected?"#4ade80":"var(--muted)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  {isWalletSelected && <div style={{ width:5,height:5,borderRadius:"50%",background:"#4ade80" }} />}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                    <span style={{ fontSize:"0.82rem",fontWeight:700,color:isWalletSelected?"var(--text)":"var(--text2)" }}>Wallet Cash</span>
                    <span style={{ fontSize:"0.55rem",fontWeight:800,padding:"1px 5px",borderRadius:99,background:"rgba(34,197,94,0.1)",color:"#4ade80",border:"1px solid rgba(34,197,94,0.2)" }}>0% TAX</span>
                  </div>
                  <div style={{ fontSize:"0.65rem",color:"var(--muted)",marginTop:1 }}>Balance: ₹{walletBalance}</div>
                </div>
                <span style={{ fontSize:"1rem",fontWeight:900,color:isWalletSelected?"#4ade80":"var(--muted)" }}>₹{coursePrice}</span>
              </div>
            )}

            <div onClick={()=>setPaymentMethod("upi")}
              style={{ borderRadius:9,border:`1px solid ${paymentMethod==="upi"?"rgba(139,92,246,0.4)":"var(--border)"}`,background:paymentMethod==="upi"?"rgba(139,92,246,0.05)":"var(--card2)",cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",gap:"0.625rem",padding:"0.7rem 0.875rem",boxShadow:paymentMethod==="upi"?"0 0 0 1px rgba(139,92,246,0.1)":"none" }}>
              <div style={{ width:14,height:14,borderRadius:"50%",border:`2px solid ${paymentMethod==="upi"?"var(--primary-light)":"var(--muted)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                {paymentMethod==="upi" && <div style={{ width:5,height:5,borderRadius:"50%",background:"var(--primary-light)" }} />}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"0.82rem",fontWeight:700,color:paymentMethod==="upi"?"var(--text)":"var(--text2)",marginBottom:3 }}>UPI / QR Code</div>
                <div style={{ display:"flex",gap:3 }}>
                  {["GPay","PhonePe","Paytm","BHIM"].map(a=>(
                    <span key={a} style={{ padding:"1px 5px",borderRadius:4,fontSize:"0.58rem",fontWeight:600,border:"1px solid",background:paymentMethod==="upi"?"rgba(139,92,246,0.08)":"var(--card3)",borderColor:paymentMethod==="upi"?"rgba(139,92,246,0.2)":"var(--border)",color:paymentMethod==="upi"?"var(--primary-light)":"var(--muted)" }}>{a}</span>
                  ))}
                </div>
              </div>
              <span style={{ fontSize:"1rem",fontWeight:900,color:paymentMethod==="upi"?"var(--text)":"var(--muted)" }}>₹{totalAmount}</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height:1,margin:"0 1.5rem",background:"var(--border)" }} />

          {/* Order Summary */}
          <div style={{ padding:"1rem 1.5rem" }}>
            <div style={{ fontSize:"0.56rem",fontWeight:800,textTransform:"uppercase",letterSpacing:"0.14em",color:"var(--muted)",marginBottom:"0.5rem" }}>Order Summary</div>
            <div style={{ borderRadius:9,border:"1px solid var(--border)",overflow:"hidden" }}>
              <div style={{ background:"var(--card2)" }}>
                {paymentMethod==="wallet" && useWallet ? (
                  <>
                    <ORow label="Course Fee" value={`₹${coursePrice}`} />
                    <ORow label="Wallet Applied" value={`−₹${isFullWallet?coursePrice:walletDiscount}`} green />
                    <ORow label="Tax / GST" value="₹0 · Waived" green last />
                  </>
                ) : (
                  <>
                    <ORow label="Course Fee" value={`₹${coursePrice}`} />
                    <ORow label="Tax / GST" value={`₹${taxAmount>0?taxAmount:0}`} last />
                  </>
                )}
              </div>
              {/* Total */}
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.75rem 0.875rem",borderTop:`1px solid ${isWalletSelected&&useWallet?"rgba(34,197,94,0.2)":"rgba(139,92,246,0.15)"}`,background:isWalletSelected&&useWallet?"rgba(34,197,94,0.05)":"rgba(139,92,246,0.05)" }}>
                <div>
                  <div style={{ fontSize:"0.82rem",fontWeight:900,color:"var(--text)" }}>{isWalletSelected&&useWallet?"Gateway Due":"Total Payable"}</div>
                  <div style={{ fontSize:"0.62rem",color:"var(--muted)",marginTop:1 }}>{isWalletSelected&&useWallet?`₹${coursePrice} from wallet · ₹${remainingWallet} left`:"via UPI · Razorpay"}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:"'Playfair Display',serif",fontSize:"clamp(1.5rem,3vw,1.875rem)",fontWeight:900,color:isWalletSelected&&useWallet?"#4ade80":"var(--text)",letterSpacing:"-0.04em",lineHeight:1 }}>
                    ₹{isWalletSelected&&useWallet?netPayable:totalAmount}
                  </div>
                  {isWalletSelected&&useWallet&&netPayable===0&&(
                    <div style={{ fontSize:"0.55rem",fontWeight:900,color:"#16a34a",textTransform:"uppercase",letterSpacing:"0.1em",marginTop:1 }}>Fully Covered</div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>{/* pw-mid */}

        {/* ── BOTTOM: CTA — fixed, always visible ── */}
        <div style={{ flexShrink:0,padding:"0.875rem 1.5rem 1.125rem",borderTop:"1px solid var(--border)",background:"var(--bg)" }}>
          {error && (
            <div style={{ padding:"0.55rem 0.7rem",borderRadius:8,background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.2)",color:"#f87171",fontSize:"0.73rem",lineHeight:1.5,marginBottom:"0.625rem" }}>{error}</div>
          )}
          <button type="button" onClick={handlePay} disabled={loading}
            style={{ width:"100%",padding:"0.95rem",borderRadius:12,border:"none",background:loading?"var(--card3)":isWalletSelected?"linear-gradient(135deg,#22c55e,#16a34a)":"linear-gradient(135deg,var(--cta),#e86a0a)",color:"#fff",fontWeight:900,fontSize:"0.925rem",cursor:loading?"not-allowed":"pointer",opacity:loading?0.55:1,boxShadow:loading?"none":isWalletSelected?"0 4px 18px rgba(34,197,94,0.32)":"0 4px 18px rgba(255,122,24,0.36)",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.375rem",transition:"opacity 0.15s,transform 0.15s" }}
            onMouseEnter={e=>{if(!loading)e.currentTarget.style.transform="translateY(-1px)";}}
            onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";}}
          >
            {loading
              ? <><svg style={{ width:13,height:13,animation:"spin 1s linear infinite" }} viewBox="0 0 24 24" fill="none"><circle style={{ opacity:.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path style={{ opacity:.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Processing…</>
              : isWalletSelected
                ? <><span>⚡</span> Pay ₹{coursePrice} via Wallet Cash</>
                : <><span>📲</span> Pay ₹{totalAmount} via UPI</>
            }
          </button>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginTop:"0.5rem",fontSize:"0.62rem",color:"var(--muted)" }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            256-Bit SSL · Secured by Razorpay &amp; UPI
          </div>

          <div style={{ textAlign: "center", marginTop: "0.75rem", fontSize: "0.68rem", color: "var(--muted)", lineHeight: 1.6 }}>
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text2)", textDecoration: "underline", margin: "0 0.3rem" }}>Terms</a> ·
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text2)", textDecoration: "underline", margin: "0 0.3rem" }}>Privacy</a> ·
            <a href="/refund" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text2)", textDecoration: "underline", margin: "0 0.3rem" }}>Refund Policy</a> ·
            <a href="/contact" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text2)", textDecoration: "underline", margin: "0 0.3rem" }}>Contact Support</a>
          </div>
        </div>

      </div>{/* pw-page */}
    </Layout>
  );
}

function ORow({ label, value, green, last }) {
  return (
    <div style={{ display:"flex",justifyContent:"space-between",padding:"0.475rem 0.75rem",fontSize:"0.75rem",...(last?{}:{borderBottom:"1px solid var(--border)"}),...(green?{background:"rgba(34,197,94,0.03)"}:{}) }}>
      <span style={{ color:green?"#4ade80":"var(--text2)",fontWeight:green?600:400 }}>{label}</span>
      <span style={{ fontWeight:green?700:600,color:green?"#4ade80":"var(--text)" }}>{value}</span>
    </div>
  );
}

function R({ label, value, green, mono }) {
  return (
    <div style={{ display:"flex",justifyContent:"space-between",fontSize:"0.775rem",marginBottom:"0.3rem" }}>
      <span style={{ color:"var(--text2)" }}>{label}</span>
      <span style={{ fontWeight:green?700:600,color:green?"#4ade80":"var(--text)",fontFamily:mono?"monospace":undefined,fontSize:mono?"0.68rem":undefined }}>{value}</span>
    </div>
  );
}
