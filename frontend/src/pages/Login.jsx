import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";

const META = {
  admin:   { title: "Admin Portal",   icon: "🛡️", sub: "Manage Speak & Shine" },
  trainer: { title: "Trainer Portal", icon: "🎓", sub: "Coach your students" },
  user:    { title: "Speak & Shine",  icon: "🗣️", sub: "Track your progress" },
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

// ── Field component ───────────────────────────────────────────────────────────
function Field({ label, type = "text", placeholder, value, onChange, onBlur, error, touched, hint, showStrength }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const strength = showStrength ? passwordStrength(value) : 0;
  const isValid = touched && !error && value;

  return (
    <div className="form-group" style={{ marginBottom: "1.1rem" }}>
      <label className="form-label">{label}</label>
      <div style={{ position: "relative" }}>
        <input
          className="form-input"
          type={isPassword && show ? "text" : type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete="off"
          style={{
            borderColor: touched
              ? error ? "var(--danger)" : isValid ? "#22c55e" : undefined
              : undefined,
            paddingRight: isPassword ? "2.5rem" : isValid ? "2.5rem" : undefined,
            transition: "border-color 0.2s",
          }}
        />
        {/* show/hide toggle for password */}
        {isPassword && (
          <button type="button" onClick={() => setShow(s => !s)} style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted)", fontSize: "0.85rem", padding: "0.2rem",
          }}>
            {show ? "🙈" : "👁️"}
          </button>
        )}
        {/* green tick when valid */}
        {!isPassword && isValid && (
          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#22c55e", fontSize: "0.9rem" }}>✓</span>
        )}
      </div>

      {/* Password strength bar */}
      {showStrength && value && (
        <div style={{ marginTop: "0.4rem" }}>
          <div style={{ display: "flex", gap: "3px", marginBottom: "0.2rem" }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: i <= strength ? STRENGTH_COLOR[strength] : "var(--border)",
                transition: "background 0.3s",
              }} />
            ))}
          </div>
          <div style={{ fontSize: "0.72rem", color: STRENGTH_COLOR[strength] }}>
            {STRENGTH_LABEL[strength]}
          </div>
        </div>
      )}

      {/* Error or hint */}
      {touched && error ? (
        <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: "0.3rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
          ⚠ {error}
        </div>
      ) : hint && !value ? (
        <div style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: "0.3rem" }}>{hint}</div>
      ) : null}
    </div>
  );
}

// ── Login page ────────────────────────────────────────────────────────────────
export default function Login({ loginFor = "user" }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const meta = META[loginFor] || META.user;

  const [form, setForm]       = useState({ phone: "", password: "" });
  const [touched, setTouched] = useState({ phone: false, password: false });
  const [errors, setErrors]   = useState({ phone: "", password: "" });
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  // Show "account disabled" message if redirected from a disabled session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") === "disabled") {
      setServerError("Your account has been disabled. Contact your admin.");
    }
  }, []);

  // Preload destination chunk while user types
  useEffect(() => {
    if (loginFor === "admin")        import("./AdminDashboard.jsx");
    else if (loginFor === "trainer") import("./TrainerDashboard.jsx");
    else                             import("./UserDashboard.jsx");
  }, [loginFor]);

  // Live validation on every keystroke
  const validate = (f) => ({
    phone:    validatePhone(f.phone),
    password: validatePassword(f.password),
  });

  const handleChange = (field, val) => {
    // Phone field: digits only, 10 max. Drop a +91/91 country code.
    if (field === "phone") {
      const hadPlus = val.trimStart().startsWith("+");
      let d = val.replace(/\D/g, "");
      if (hadPlus) d = d.replace(/^91/, "");                 // explicit +91 → strip
      else if (d.length > 10 && d.startsWith("91")) d = d.slice(2); // 91XXXXXXXXXX → strip
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

  const isFormValid = !errors.phone && !errors.password && form.phone && form.password;

  const submit = async (e) => {
    e.preventDefault();
    // Touch all fields to show errors
    setTouched({ phone: true, password: true });
    const errs = validate(form);
    setErrors(errs);
    if (errs.phone || errs.password) return;

    setLoading(true);
    setServerError("");
    try {
      const { data } = await api.post("/auth/login", form);
      if (loginFor === "admin" && data.role !== "admin") {
        setServerError("Admin credentials required.");
        return;
      }
      if (loginFor === "trainer" && !["trainer", "admin"].includes(data.role)) {
        setServerError("Trainer credentials required.");
        return;
      }      // Store both access token and refresh token
      login(data.accessToken, { phone: data.phone, role: data.role, name: data.name }, data.refreshToken);
      if (data.role === "admin")        navigate("/admin",     { replace: true });
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
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img
            src="/icons/icon-192.png"
            alt="Speak & Shine"
            style={{ width: 80, height: 80, borderRadius: 22, boxShadow: "0 8px 32px rgba(139,92,246,0.4)" }}
          />
        </div>
        <h1 className="auth-title">{meta.title}</h1>
        <p className="auth-sub">{meta.sub}</p>

        {/* Server error banner */}
        {serverError && (
          <div style={{
            background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.35)",
            borderRadius: 10, padding: "0.7rem 1rem", marginBottom: "1rem",
            color: "#f87171", fontSize: "0.875rem", fontWeight: 500,
            display: "flex", alignItems: "center", gap: "0.5rem",
          }}>
            ❌ {serverError}
          </div>
        )}

        <form onSubmit={submit} noValidate autoComplete="off">
          <Field
            label="Phone Number"
            type="tel"
            placeholder="e.g. 919876543210"
            value={form.phone}
            onChange={e => handleChange("phone", e.target.value)}
            onBlur={() => handleBlur("phone")}
            error={errors.phone}
            touched={touched.phone}
            hint="Enter your registered phone number"
          />
          <Field
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={e => handleChange("password", e.target.value)}
            onBlur={() => handleBlur("password")}
            error={errors.password}
            touched={touched.password}
            hint="Minimum 6 characters"
          />

          <button
            type="submit"
            className="btn-primary"
            style={{ width: "100%", marginTop: "0.25rem", opacity: loading ? 0.8 : 1 }}
            disabled={loading}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                <span style={{ width: 15, height: 15, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                Signing in…
              </span>
            ) : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "0.75rem" }}>
          <Link to="/forgot-password" style={{ color: "var(--muted)", fontSize: "0.82rem", textDecoration: "none" }}>
            Forgot password?
          </Link>
        </div>

        {loginFor === "user" && (
          <div className="auth-portals">
            <Link to="/admin/login">Admin Portal →</Link>
            <Link to="/trainer/login">Trainer Portal →</Link>
          </div>
        )}
        {loginFor === "user" && (
          <p className="auth-link" style={{ marginTop: "0.5rem" }}>
            New here? <Link to="/register">Create an account</Link>
          </p>
        )}
      </div>
    </div>
  );
}
