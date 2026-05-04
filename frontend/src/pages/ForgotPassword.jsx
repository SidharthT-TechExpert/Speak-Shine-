import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client.js";

function validatePhone(raw) {
  const stripped = raw.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
  if (!stripped) return "Phone number is required";
  if (!/^\d+$/.test(stripped)) return "Digits only";
  if (stripped.length !== 10) return `Must be 10 digits (you entered ${stripped.length})`;
  if (!/^[6-9]/.test(stripped)) return "Must start with 6, 7, 8, or 9";
  return null;
}

function passwordStrength(val) {
  if (!val) return 0;
  let s = 0;
  if (val.length >= 8)  s++;
  if (val.length >= 12) s++;
  if (/[A-Z]/.test(val)) s++;
  if (/[0-9]/.test(val)) s++;
  if (/[^A-Za-z0-9]/.test(val)) s++;
  return s;
}
const STRENGTH_LABEL = ["", "Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
const STRENGTH_COLOR = ["", "#f87171", "#fb923c", "#fbbf24", "#4ade80", "#22c55e"];

// Step 1: Enter phone → Step 2: Enter OTP → Step 3: Set new password
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [passError, setPassError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepError, setStepError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const [done, setDone] = useState(false);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const phoneOk = !phoneError && phone.length > 0;

  // Step 1 → send OTP
  const sendOTP = async (e) => {
    e?.preventDefault();
    const err = validatePhone(phone);
    if (err) { setPhoneError(err); return; }
    setStepError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot/send-otp", { phone });
      setStep(2);
      setResendTimer(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      setStepError(err.response?.data?.error || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  // OTP box handling
  const handleOtpChange = (i, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  // Step 2 → verify OTP
  const verifyOTP = async (e) => {
    e?.preventDefault();
    const code = otp.join("");
    if (code.length !== 6) return;
    setStepError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot/verify-otp", { phone, otp: code });
      setResetToken(data.resetToken);
      setStep(3);
    } catch (err) {
      setStepError(err.response?.data?.error || "Invalid OTP");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when all 6 digits entered
  useEffect(() => {
    if (step === 2 && otp.join("").length === 6) verifyOTP();
  }, [otp]);

  // Step 3 → reset password
  const resetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { setPassError("Password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(newPassword)) { setPassError("Password must contain at least one uppercase letter"); return; }
    if (!/[a-z]/.test(newPassword)) { setPassError("Password must contain at least one lowercase letter"); return; }
    if (!/[0-9]/.test(newPassword)) { setPassError("Password must contain at least one number"); return; }
    if (!/[^A-Za-z0-9]/.test(newPassword)) { setPassError("Password must contain at least one special character (!@#$%^&* etc.)"); return; }
    setPassError("");
    setStepError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot/reset", { resetToken, newPassword });
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 3000);
    } catch (err) {
      setStepError(err.response?.data?.error || "Password reset failed");
    } finally {
      setLoading(false);
    }
  };

  const strength = passwordStrength(newPassword);

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
          <h1 className="auth-title">Password Updated!</h1>
          <p className="auth-sub">Your password has been reset successfully.</p>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>Redirecting to login…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/icons/icon-192.png" alt="Speak & Shine"
            style={{ width: 80, height: 80, borderRadius: 22, boxShadow: "0 8px 32px rgba(139,92,246,0.4)" }} />
        </div>
        <h1 className="auth-title">Reset Password</h1>

        {/* Step indicators */}
        <div className="otp-steps">
          {["Phone", "Verify", "New Password"].map((label, i) => (
            <div key={i} className={`otp-step ${step === i + 1 ? "active" : step > i + 1 ? "done" : ""}`}>
              <div className="otp-step-dot">{step > i + 1 ? "✓" : i + 1}</div>
              <div className="otp-step-label">{label}</div>
            </div>
          ))}
        </div>

        {stepError && (
          <div style={{
            background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.35)",
            borderRadius: 10, padding: "0.7rem 1rem", marginBottom: "1rem",
            color: "#f87171", fontSize: "0.875rem", fontWeight: 500,
          }}>
            ❌ {stepError}
          </div>
        )}

        {/* ── Step 1: Phone ── */}
        {step === 1 && (
          <form onSubmit={sendOTP} autoComplete="off">
            <p className="auth-sub" style={{ marginBottom: 16 }}>Enter your registered phone number</p>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div style={{ position: "relative" }}>
                <input
                  className={`form-input ${phoneError ? "input-error" : phoneOk ? "input-ok" : ""}`}
                  type="tel" placeholder="9876543210" value={phone}
                  onChange={e => { setPhone(e.target.value); setPhoneError(validatePhone(e.target.value) || ""); }}
                  required maxLength={13} autoFocus
                />
                {phoneOk && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#22c55e" }}>✓</span>}
              </div>
              {phoneError && <p className="input-error-msg">⚠ {phoneError}</p>}
            </div>
            <button type="submit" className="btn-primary" style={{ width: "100%" }}
              disabled={loading || !!phoneError || !phone}>
              {loading ? "Sending OTP…" : "Send OTP →"}
            </button>
          </form>
        )}

        {/* ── Step 2: OTP ── */}
        {step === 2 && (
          <form onSubmit={verifyOTP}>
            <p className="auth-sub" style={{ marginBottom: 4 }}>OTP sent to</p>
            <p style={{ color: "#a78bfa", fontWeight: 600, marginBottom: 20, textAlign: "center" }}>
              +91 {phone.replace(/^(\+91|91)/, "")}
            </p>
            <div className="otp-boxes">
              {otp.map((digit, i) => (
                <input key={i} ref={el => (otpRefs.current[i] = el)}
                  className="otp-box" type="text" inputMode="numeric"
                  maxLength={1} value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)} />
              ))}
            </div>
            <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: 16 }}
              disabled={loading || otp.join("").length !== 6}>
              {loading ? "Verifying…" : "Verify OTP"}
            </button>
            <div style={{ textAlign: "center", marginTop: 12 }}>
              {resendTimer > 0
                ? <span className="input-hint">Resend in {resendTimer}s</span>
                : <button type="button" className="auth-link-btn" onClick={sendOTP} disabled={loading}>Resend OTP</button>}
            </div>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button type="button" className="auth-link-btn"
                onClick={() => { setStep(1); setOtp(["", "", "", "", "", ""]); setStepError(""); }}>
                ← Change number
              </button>
            </div>
          </form>
        )}

        {/* ── Step 3: New Password ── */}
        {step === 3 && (
          <form onSubmit={resetPassword} noValidate autoComplete="off">
            <p className="auth-sub" style={{ marginBottom: 16 }}>✅ Verified! Set your new password</p>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <div style={{ position: "relative" }}>
                <input
                  className="form-input"
                  type={showPass ? "text" : "password"}
                  placeholder="Min 8 chars, upper+lower+number+symbol"
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); if (passError) setPassError(""); }}
                  style={{ paddingRight: "2.5rem" }}
                  autoFocus
                />
                <button type="button" onClick={() => setShowPass(s => !s)} style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "0.85rem",
                }}>{showPass ? "🙈" : "👁️"}</button>
              </div>

              {newPassword && (
                <div style={{ marginTop: "0.4rem" }}>
                  <div style={{ display: "flex", gap: "3px", marginBottom: "0.2rem" }}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} style={{
                        flex: 1, height: 3, borderRadius: 2,
                        background: i <= strength ? STRENGTH_COLOR[strength] : "var(--border)",
                        transition: "background 0.3s",
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: STRENGTH_COLOR[strength] }}>{STRENGTH_LABEL[strength]}</div>
                </div>
              )}

              {passError && <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: "0.3rem" }}>⚠ {passError}</div>}
            </div>

            <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Updating…" : "Reset Password 🔐"}
            </button>
          </form>
        )}

        <p className="auth-link" style={{ marginTop: 16 }}>
          Remember your password? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
