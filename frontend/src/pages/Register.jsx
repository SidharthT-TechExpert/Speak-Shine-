import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: "", password: "", name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/register", form);
      login(data.token, { phone: data.phone, role: data.role, name: data.name });
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a14] px-4"
      style={{ background: "radial-gradient(ellipse at 50% 0%, #1a1040 0%, #0a0a14 60%)" }}>
      <div className="w-full max-w-sm">
        <div className="bg-[#16162a] border border-[#252545] rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🗣️</div>
            <h1 className="text-2xl font-bold text-[#e8e8f4]">Create Account</h1>
            <p className="text-sm text-[#8888aa] mt-1">Join Speak & Shine</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {[
              { key: "name",     label: "Full Name",     type: "text",     placeholder: "Your name" },
              { key: "phone",    label: "Phone Number",  type: "text",     placeholder: "e.g. 918848096746" },
              { key: "password", label: "Password",      type: "password", placeholder: "Create a password" },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-[#8888aa] mb-1.5">{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  required
                  className="w-full bg-[#111122] border border-[#252545] rounded-xl px-4 py-3 text-[#e8e8f4] text-sm placeholder-[#444466] focus:border-[#7c6fff] transition-colors"
                />
              </div>
            ))}

            {error && (
              <div className="bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl px-4 py-2.5 text-[#f87171] text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-[#7c6fff] to-[#5544cc] hover:opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-[#8888aa] mt-5">
            Already have an account?{" "}
            <Link to="/login" className="text-[#7c6fff] font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
