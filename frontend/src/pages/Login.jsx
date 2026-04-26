import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";

const META = {
  admin:   { title: "Admin Portal",   icon: "🛡️", sub: "Manage Speak & Shine", accent: "#7c6fff" },
  trainer: { title: "Trainer Portal", icon: "🎓", sub: "Coach your students",   accent: "#fbbf24" },
  user:    { title: "Speak & Shine",  icon: "🗣️", sub: "Track your progress",  accent: "#7c6fff" },
};

export default function Login({ loginFor = "user", showRegister = false }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const meta = META[loginFor] || META.user;

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/login", form);
      if (loginFor === "admin" && data.role !== "admin") { setError("Admin credentials required."); return; }
      if (loginFor === "trainer" && !["trainer","admin"].includes(data.role)) { setError("Trainer credentials required."); return; }
      login(data.token, { phone: data.phone, role: data.role, name: data.name });
      if (data.role === "admin") navigate("/admin");
      else if (data.role === "trainer") navigate("/trainer");
      else navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a14] px-4"
      style={{ background: "radial-gradient(ellipse at 50% 0%, #1a1040 0%, #0a0a14 60%)" }}>
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-[#16162a] border border-[#252545] rounded-3xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">{meta.icon}</div>
            <h1 className="text-2xl font-bold text-[#e8e8f4]">{meta.title}</h1>
            <p className="text-sm text-[#8888aa] mt-1">{meta.sub}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#8888aa] mb-1.5">Phone Number</label>
              <input
                type="text"
                placeholder="e.g. 918848096746"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                required
                className="w-full bg-[#111122] border border-[#252545] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm placeholder-[#444466] focus:border-[#7c6fff] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#8888aa] mb-1.5">Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
                className="w-full bg-[#111122] border border-[#252545] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm placeholder-[#444466] focus:border-[#7c6fff] transition-colors"
              />
            </div>

            {error && (
              <div className="bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl px-4 py-2.5 text-[#f87171] text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all duration-200 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${meta.accent}, #5544cc)` }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          {showRegister && (
            <p className="text-center text-sm text-[#8888aa] mt-5">
              No account?{" "}
              <Link to="/register" className="text-[#7c6fff] font-medium hover:underline">Register</Link>
            </p>
          )}

          {loginFor === "user" && (
            <div className="flex justify-center gap-4 mt-4 pt-4 border-t border-[#252545]">
              <Link to="/admin/login" className="text-xs text-[#8888aa] hover:text-[#7c6fff] transition-colors">Admin Portal →</Link>
              <Link to="/trainer/login" className="text-xs text-[#8888aa] hover:text-[#fbbf24] transition-colors">Trainer Portal →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
