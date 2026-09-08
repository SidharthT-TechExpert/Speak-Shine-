import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";

const META = {
  admin:   { title: "Admin Portal",   icon: "🛡️", sub: "Manage members, questions & platform insights" },
  trainer: { title: "Trainer Portal", icon: "🎓", sub: "Review recordings & coach student fluency" },
  user:    { title: "Speak & Shine",  icon: "✨", sub: "Master English speaking with daily voice AI coaching" },
};

// ── Validators ────────────────────────────────────────────────────────────────
function validatePhone(val) {
  const digits = val.replace(/\D/g, "");
  if (!digits) return "Phone number is required";
  if (digits.length !== 10) return `Must be 10 digits (you entered ${digits.length})`;
  if (!/^[6-9]/.test(digits)) return "Must start with 6, 7, 8, or 9";
  return "";
}

function validatePassword(val) {
  if (!val) return "Password is required";
  if (val.length < 6) return "At least 6 characters";
  return "";
}

function passwordStrength(val) {
  if (!val) return 0;
  let score = 0;
  if (val.length >= 6)  score++;
  if (val.length >= 10) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  return score; // 0–5
}

const STRENGTH_LABEL = ["", "Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
const STRENGTH_COLOR = ["", "#f87171", "#fb923c", "#fbbf24", "#4ade80", "#22c55e"];

// ── Modern Field component ────────────────────────────────────────────────────
function Field({ label, type = "text", placeholder, value, onChange, onBlur, error, touched, hint, showStrength, icon }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const strength = showStrength ? passwordStrength(value) : 0;
  const isValid = touched && !error && value;

  return (
    <div className="speakshine-form-group">
      <label className="speakshine-form-label">
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          {icon && <span style={{ opacity: 0.8 }}>{icon}</span>}
          {label}
        </span>
        {isValid && !isPassword && (
          <span style={{ color: "#22c55e", fontSize: "0.75rem", fontWeight: 700 }}>✓ Verified</span>
        )}
      </label>
      <div className="speakshine-input-wrap">
        <input
          className={`speakshine-input${touched && error ? " is-error" : isValid ? " is-valid" : ""}`}
          type={isPassword && show ? "text" : type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete="off"
          style={{
            paddingRight: isPassword ? "2.6rem" : undefined,
          }}
        />
        {/* show/hide toggle for password */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9490ab",
              fontSize: "0.95rem",
              padding: "0.2rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title={show ? "Hide password" : "Show password"}
          >
            {show ? "🙈" : "👁️"}
          </button>
        )}
      </div>

      {/* Password strength bar */}
      {showStrength && value && (
        <div style={{ marginTop: "0.45rem" }}>
          <div style={{ display: "flex", gap: "4px", marginBottom: "0.25rem" }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background: i <= strength ? STRENGTH_COLOR[strength] : "rgba(255, 255, 255, 0.08)",
                  transition: "background 0.3s ease",
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: "0.72rem", color: STRENGTH_COLOR[strength], fontWeight: 600 }}>
            {STRENGTH_LABEL[strength]}
          </div>
        </div>
      )}

      {/* Error or hint */}
      {touched && error ? (
        <div style={{ color: "#f87171", fontSize: "0.78rem", marginTop: "0.35rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span>⚠</span> {error}
        </div>
      ) : hint && !value ? (
        <div style={{ color: "#716c85", fontSize: "0.75rem", marginTop: "0.35rem" }}>{hint}</div>
      ) : null}
    </div>
  );
}

// ── Login page ────────────────────────────────────────────────────────────────
export default function Login({ loginFor = "user" }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const meta = META[loginFor] || META.user;

  const [form, setForm]               = useState({ phone: "", password: "" });
  const [touched, setTouched]         = useState({ phone: false, password: false });
  const [errors, setErrors]           = useState({ phone: "", password: "" });
  const [serverError, setServerError] = useState("");
  const [loading, setLoading]         = useState(false);

  // Show "account disabled" message if redirected from a disabled session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") === "disabled") {
      setServerError("Your account has been disabled. Contact your administrator.");
    }
  }, []);

  // Preload destination chunk while user is on login
  useEffect(() => {
    if (loginFor === "admin")        import("./AdminDashboard.jsx");
    else if (loginFor === "trainer") import("./TrainerDashboard.jsx");
    else                             import("./UserDashboard.jsx");
  }, [loginFor]);

  // Live validation on keystroke
  const validate = (f) => ({
    phone:    validatePhone(f.phone),
    password: validatePassword(f.password),
  });

  const handleChange = (field, val) => {
    if (field === "phone") {
      const hadPlus = val.trimStart().startsWith("+");
      let d = val.replace(/\D/g, "");
      if (hadPlus) d = d.replace(/^91/, "");
      else if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
      val = d.slice(0, 10);
    }
    const next = { ...form, [field]: val };
    setForm(next);
    setServerError("");
    if (touched[field]) {
      setErrors(validate(next));
    }
  };

  const handleBlur = (field) => {
    setTouched(p => ({ ...p, [field]: true }));
    setErrors(validate(form));
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ phone: true, password: true });
    const errs = validate(form);
    setErrors(errs);
    if (errs.phone || errs.password) return;

    setLoading(true);
    setServerError("");
    try {
      const { data } = await api.post("/auth/login", form);
      if (loginFor === "admin" && !["admin", "admins"].includes(data.role)) {
        setServerError("Admin credentials required.");
        return;
      }
      if (loginFor === "trainer" && !["trainer", "admin", "admins"].includes(data.role)) {
        setServerError("Trainer credentials required.");
        return;
      }
      login({ phone: data.phone, role: data.role, name: data.name, paid: data.paid ?? false });
      if (loginFor === "trainer" && ["admin", "admins"].includes(data.role)) navigate("/trainer", { replace: true });
      else if (data.role === "admin" || data.role === "admins") navigate("/admin", { replace: true });
      else if (data.role === "trainer") navigate("/trainer",   { replace: true });
      else                              navigate("/dashboard", { replace: true });
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "PENDING_APPROVAL") {
        setServerError("⏳ Your registration is awaiting admin approval. Please check back later.");
      } else {
        setServerError(err.response?.data?.error || "Invalid phone or password.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="speakshine-auth-page">
      <div className="speakshine-auth-card">
        {/* Brand Emblem Header */}
        <div className="speakshine-auth-brand">
          <div className="speakshine-brand-emblem">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L14.7 9.3L22 12L14.7 14.7L12 22L9.3 14.7L2 12L9.3 9.3L12 2Z"
                fill="url(#goldStarGradLogin)"
              />
              <defs>
                <linearGradient id="goldStarGradLogin" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#fbbf24" />
                  <stop offset="1" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="speakshine-auth-title">{meta.title}</h1>
          <p className="speakshine-auth-subtitle">{meta.sub}</p>
        </div>

        {/* Role Switcher Pill Tabs */}
        <div className="speakshine-role-tabs">
          <Link
            to="/login"
            className={`speakshine-role-tab${loginFor === "user" ? " active" : ""}`}
          >
            <span>👤</span>
            <span>Student</span>
          </Link>
          <Link
            to="/trainer/login"
            className={`speakshine-role-tab${loginFor === "trainer" ? " active" : ""}`}
          >
            <span>🎓</span>
            <span>Trainer</span>
          </Link>
          <Link
            to="/admin/login"
            className={`speakshine-role-tab${loginFor === "admin" ? " active" : ""}`}
          >
            <span>🛡️</span>
            <span>Admin</span>
          </Link>
        </div>

        {/* Server error banner */}
        {serverError && (
          <div style={{
            background: "rgba(248, 113, 113, 0.12)",
            border: "1px solid rgba(248, 113, 113, 0.35)",
            borderRadius: 12,
            padding: "0.75rem 1rem",
            marginBottom: "1.25rem",
            color: "#fca5a5",
            fontSize: "0.85rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            lineHeight: 1.4,
          }}>
            <span style={{ fontSize: "1rem" }}>⚠️</span>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={submit} noValidate autoComplete="off">
          <Field
            label="Phone Number"
            type="tel"
            icon="📱"
            placeholder="10-digit mobile number"
            value={form.phone}
            onChange={e => handleChange("phone", e.target.value)}
            onBlur={() => handleBlur("phone")}
            error={errors.phone}
            touched={touched.phone}
            hint="Enter your 10-digit Indian phone number"
          />

          <Field
            label="Password"
            type="password"
            icon="🔒"
            placeholder="Enter your password"
            value={form.password}
            onChange={e => handleChange("password", e.target.value)}
            onBlur={() => handleBlur("password")}
            error={errors.password}
            touched={touched.password}
            hint="Minimum 6 characters"
          />

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "-0.5rem", marginBottom: "1rem" }}>
            <Link
              to="/forgot-password"
              style={{
                color: "#a78bfa",
                fontSize: "0.8rem",
                textDecoration: "none",
                fontWeight: 500,
                transition: "color 0.2s ease",
              }}
              onMouseEnter={e => e.target.style.color = "#c4b5fd"}
              onMouseLeave={e => e.target.style.color = "#a78bfa"}
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="speakshine-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                <span style={{
                  width: 16,
                  height: 16,
                  border: "2px solid rgba(255, 255, 255, 0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 0.7s linear infinite",
                }} />
                Signing in…
              </span>
            ) : (
              <span>Sign In to Account →</span>
            )}
          </button>
        </form>

        {loginFor === "user" && (
          <div style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.85rem", color: "#8c87a2" }}>
            New to Speak &amp; Shine?{" "}
            <Link
              to="/register"
              style={{
                color: "#f97316",
                fontWeight: 600,
                textDecoration: "none",
                marginLeft: "0.25rem",
              }}
            >
              Create an account
            </Link>
          </div>
        )}

        {loginFor === "user" && (
          <Link to="/dashboard" className="speakshine-preview-btn">
            <span>👀</span>
            <span>Explore interactive demo without signing in →</span>
          </Link>
        )}
      </div>

      {/* Feature Badges Footer */}
      <div className="speakshine-feature-badges">
        <div className="speakshine-feature-badge">
          <span>⚡</span>
          <span>AI Speech Scoring</span>
        </div>
        <div className="speakshine-feature-badge">
          <span>🎙️</span>
          <span>Instant Voice Feedback</span>
        </div>
        <div className="speakshine-feature-badge">
          <span>🔥</span>
          <span>Daily Streak &amp; Rewards</span>
        </div>
      </div>
    </div>
  );
}
