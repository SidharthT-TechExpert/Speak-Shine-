import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Modal from "../components/Modal.jsx";
import api from "../api/client.js";

// Validates Indian mobile: optional +91/91 prefix + 10 digits starting 6-9
function validatePhone(raw) {
  const stripped = raw.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
  if (!stripped) return "Phone number is required";
  if (!/^\d+$/.test(stripped)) return "Phone number must contain only digits";
  if (stripped.length !== 10) return `Must be 10 digits (you entered ${stripped.length})`;
  if (!/^[6-9]/.test(stripped)) return "Must start with 6, 7, 8, or 9";
  return null; // valid
}

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "", name: "" });
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setForm({ ...form, phone: val });
    setPhoneError(val ? (validatePhone(val) || "") : "");
  };

  const submit = async (e) => {
    e.preventDefault();
    const err = validatePhone(form.phone);
    if (err) { setPhoneError(err); return; }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", form);
      login(data.token, { phone: data.phone, role: data.role, name: data.name });
      setModal({
        type: "alert",
        title: "Welcome! 🎉",
        message: `Account created successfully. Welcome to Speak & Shine, ${data.name || ""}!`,
        confirmText: "Let's Go",
        onConfirm: () => { setModal(null); navigate("/dashboard", { replace: true }); },
      });
    } catch (err) {
      const msg = err.response?.data?.error || "Registration failed. Please try again.";
      setModal({ type: "danger", title: "Registration Failed", message: msg, confirmText: "OK", onConfirm: () => setModal(null) });
    } finally {
      setLoading(false);
    }
  };

  const phoneOk = !phoneError && form.phone.length > 0;

  return (
    <div className="auth-page">
      {modal && (
        <Modal
          type={modal.type}
          title={modal.title}
          message={modal.message}
          confirmText={modal.confirmText}
          onConfirm={modal.onConfirm}
        />
      )}
      <div className="auth-card">
        <div className="auth-logo">🗣️</div>
        <h1 className="auth-title">Create Account</h1>
        <p className="auth-sub">Join Speak & Shine</p>

        <form onSubmit={submit}>
          {/* Name */}
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" type="text" placeholder="Your name"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>

          {/* Phone with live validation */}
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <div style={{ position: "relative" }}>
              <input
                className={`form-input ${phoneError ? "input-error" : phoneOk ? "input-ok" : ""}`}
                type="tel"
                placeholder="9876543210"
                value={form.phone}
                onChange={handlePhoneChange}
                required
                maxLength={13}
              />
              {phoneOk && (
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#22c55e", fontSize: 16 }}>✓</span>
              )}
            </div>
            {phoneError && (
              <p className="input-error-msg">⚠ {phoneError}</p>
            )}
            {!phoneError && !phoneOk && (
              <p className="input-hint">Enter 10-digit number (with or without +91)</p>
            )}
          </div>

          {/* Password */}
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Create a password"
              value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} />
          </div>

          <button type="submit" className="btn-primary"
            style={{ width: "100%", marginTop: "0.5rem" }}
            disabled={loading || !!phoneError}>
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="auth-link">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
