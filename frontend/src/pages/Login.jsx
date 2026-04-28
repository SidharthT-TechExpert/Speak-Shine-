import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";

const META = {
  admin:   { title: "Admin Portal",   icon: "🛡️", sub: "Manage Speak & Shine" },
  trainer: { title: "Trainer Portal", icon: "🎓", sub: "Coach your students" },
  user:    { title: "Speak & Shine",  icon: "🗣️", sub: "Track your progress" },
};

export default function Login({ loginFor = "user", showRegister = false }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState({ phone: "", password: "" });
  const meta = META[loginFor] || META.user;

  // Preload the likely destination chunk while user fills in the form
  useEffect(() => {
    if (loginFor === "admin")        import("./AdminDashboard.jsx");
    else if (loginFor === "trainer") import("./TrainerDashboard.jsx");
    else                             import("./UserDashboard.jsx");
  }, [loginFor]);

  const validate = () => {
    const errs = { phone: "", password: "" };
    if (!form.phone.trim()) errs.phone = "Phone number is required";
    if (!form.password)     errs.password = "Password is required";
    setFieldError(errs);
    return !errs.phone && !errs.password;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", form);
      if (loginFor === "admin" && data.role !== "admin") {
        setError("Admin credentials required.");
        return;
      }
      if (loginFor === "trainer" && !["trainer", "admin"].includes(data.role)) {
        setError("Trainer credentials required.");
        return;
      }
      login(data.token, { phone: data.phone, role: data.role, name: data.name });
      if (data.role === "admin") navigate("/admin", { replace: true });
      else if (data.role === "trainer") navigate("/trainer", { replace: true });
      else navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "Invalid phone or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clearFieldError = (field) => setFieldError(p => ({ ...p, [field]: "" }));

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">{meta.icon}</div>
        <h1 className="auth-title">{meta.title}</h1>
        <p className="auth-sub">{meta.sub}</p>

        {/* Global error banner */}
        {error && (
          <div style={{
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.35)",
            borderRadius: 10,
            padding: "0.7rem 1rem",
            marginBottom: "1rem",
            color: "#f87171",
            fontSize: "0.875rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}>
            ❌ {error}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. 918848096746"
              value={form.phone}
              onChange={e => { setForm({ ...form, phone: e.target.value }); clearFieldError("phone"); setError(""); }}
              style={fieldError.phone ? { borderColor: "var(--danger)" } : {}}
              autoComplete="username"
            />
            {fieldError.phone && (
              <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: "0.3rem" }}>
                {fieldError.phone}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="Enter password"
              value={form.password}
              onChange={e => { setForm({ ...form, password: e.target.value }); clearFieldError("password"); setError(""); }}
              style={fieldError.password ? { borderColor: "var(--danger)" } : {}}
              autoComplete="current-password"
            />
            {fieldError.password && (
              <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: "0.3rem" }}>
                {fieldError.password}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: "100%", marginTop: "0.5rem", position: "relative" }}
            disabled={loading}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                Signing in…
              </span>
            ) : "Sign In"}
          </button>
        </form>

        {showRegister && (
          <p className="auth-link">No account? <Link to="/register">Register</Link></p>
        )}

        {loginFor === "user" && (
          <div className="auth-portals">
            <Link to="/admin/login">Admin Portal →</Link>
            <Link to="/trainer/login">Trainer Portal →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
