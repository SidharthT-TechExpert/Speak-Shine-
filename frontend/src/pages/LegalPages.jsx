import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

export default function LegalPages() {
  const location = useLocation();
  const getTabFromPath = () => {
    if (location.pathname.includes("privacy")) return "privacy";
    if (location.pathname.includes("refund") || location.pathname.includes("cancellation")) return "refund";
    if (location.pathname.includes("contact")) return "contact";
    return "terms";
  };

  const [activeTab, setActiveTab] = useState(getTabFromPath);

  const tabs = [
    { id: "terms", label: "Terms of Service" },
    { id: "privacy", label: "Privacy Policy" },
    { id: "refund", label: "Refund & Cancellation" },
    { id: "contact", label: "Contact Us" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg, #05050f)",
      color: "var(--text, #f0f0ff)",
      padding: "2.5rem 1.25rem",
      display: "flex",
      justifyContent: "center"
    }}>
      <div style={{ width: "100%", maxWidth: "860px" }}>
        {/* Navigation & Header */}
        <div style={{ marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <Link to="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "var(--text)" }}>
              <span style={{ fontSize: "1.4rem" }}>🗣️</span>
              <span style={{ fontWeight: 800, fontSize: "1.2rem", letterSpacing: "-0.02em" }}>Speak &amp; Shine</span>
            </Link>
            <div style={{ fontSize: "0.8rem", color: "var(--muted, #8c87a2)", marginTop: "0.2rem" }}>
              AI English Fluency Lab • Founded by Sidharth T
            </div>
          </div>
          <Link
            to="/login"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              background: "rgba(124,111,255,0.15)",
              color: "#a78bfa",
              fontWeight: 600,
              fontSize: "0.85rem",
              textDecoration: "none",
              border: "1px solid rgba(124,111,255,0.3)"
            }}
          >
            ← Back to App
          </Link>
        </div>

        {/* Tab Buttons */}
        <div style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "1px solid var(--border, rgba(255,255,255,0.1))",
          paddingBottom: "0.75rem",
          marginBottom: "1.75rem",
          overflowX: "auto"
        }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "0.6rem 1.1rem",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.88rem",
                background: activeTab === t.id ? "linear-gradient(135deg, #7c6fff, #4f46e5)" : "transparent",
                color: activeTab === t.id ? "#fff" : "var(--muted, #8c87a2)",
                transition: "all 0.2s ease"
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Card Content */}
        <div style={{
          background: "var(--card-bg, #0d0d1e)",
          border: "1px solid var(--border, rgba(255,255,255,0.08))",
          borderRadius: "16px",
          padding: "2rem",
          lineHeight: "1.7",
          fontSize: "0.92rem",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)"
        }}>
          {/* TERMS OF SERVICE */}
          {activeTab === "terms" && (
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>Terms of Service</h1>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: "1.5rem" }}>Last updated: November 2026</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>1. Acceptance of Terms</h2>
              <p>Welcome to <strong>Speak &amp; Shine</strong> (https://speak-shine.sidhartht.online), operated and maintained by <strong>Sidharth T</strong>. By accessing or registering for our website and speech coaching services, you agree to comply with and be bound by these Terms of Service.</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>2. Description of Services</h2>
              <p>Speak &amp; Shine provides automated speech analysis, voice recording assessments, daily practice challenges, native shadowing exercises, and English language communication coaching powered by AI.</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>3. User Accounts &amp; Conduct</h2>
              <p>Users must provide accurate phone numbers and credentials during registration. You are responsible for maintaining the confidentiality of your account. Users agree not to upload inappropriate, offensive, copyright-infringing, or malicious material.</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>4. Subscription &amp; Payments</h2>
              <p>Platform access or course fees are processed securely via verified payment gateways (including Razorpay). Prices are listed transparently in Indian Rupees (INR) or applicable local currency prior to payment confirmation.</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>5. Contact &amp; Governance</h2>
              <p>These terms are governed by the laws of India. For any questions or legal inquiries, please contact <strong>sidhartht900@gmail.com</strong>.</p>
            </div>
          )}

          {/* PRIVACY POLICY */}
          {activeTab === "privacy" && (
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>Privacy Policy</h1>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: "1.5rem" }}>Last updated: November 2026</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>1. Information We Collect</h2>
              <p>We collect only the information necessary to provide you with effective speaking feedback: your name, phone number, practice recordings, transcripts, and progress milestones.</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>2. How We Use Voice Recordings</h2>
              <p>Voice recordings are submitted by users solely for the purpose of automated speech-to-text transcription, fluency evaluation, grammatical assessment, and trainer coaching. We do not sell, rent, or trade student audio to third-party advertisers or unauthorized data brokers.</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>3. Data Storage &amp; Security</h2>
              <p>Audio recordings and user credentials are encrypted using industry-standard protocols (TLS/HTTPS, Argon2/Bcrypt password hashing, secure cloud object storage). Strict access controls prevent unauthorized access.</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>4. User Rights</h2>
              <p>You may request account deletion, data download, or correction of your profile information at any time by contacting our support team at <strong>sidhartht900@gmail.com</strong>.</p>
            </div>
          )}

          {/* REFUND POLICY */}
          {activeTab === "refund" && (
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>Refund &amp; Cancellation Policy</h1>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: "1.5rem" }}>Last updated: November 2026</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>1. Cancellation Policy</h2>
              <p>Students can discontinue their monthly subscription or practice plan at any time without penalty. No future renewal charges will be applied once cancelled.</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>2. 7-Day Refund Guarantee</h2>
              <p>If you are not satisfied with Speak &amp; Shine within the first 7 days of enrolling or renewing your course subscription, you are entitled to a full refund of your course fee.</p>

              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "1.25rem", color: "#a78bfa" }}>3. How to Request a Refund</h2>
              <p>To request a refund, please send an email to <strong>sidhartht900@gmail.com</strong> with your registered phone number and payment transaction ID. Approved refunds are processed back to the original payment source within 5 to 7 working days via our payment partner (Razorpay).</p>
            </div>
          )}

          {/* CONTACT US */}
          {activeTab === "contact" && (
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>Contact Us</h1>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: "1.5rem" }}>We're here to help you on your English speaking journey</p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", marginTop: "1.5rem" }}>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>📧 Official Support Email</div>
                  <div style={{ fontWeight: 700, color: "#a78bfa" }}>sidhartht900@gmail.com</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.3rem" }}>Typical response time: under 24 hours</div>
                </div>

                <div style={{ background: "rgba(255,255,255,0.03)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>👨‍💻 Founder &amp; Developer</div>
                  <div style={{ fontWeight: 700, color: "#38bdf8" }}>Sidharth T</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.3rem" }}>Website: https://sidhartht.online</div>
                </div>

                <div style={{ background: "rgba(255,255,255,0.03)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>📍 Location</div>
                  <div style={{ fontWeight: 700, color: "#34d399" }}>Kerala, India</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.3rem" }}>Serving global English learners</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div style={{ textAlign: "center", marginTop: "2rem", color: "var(--muted)", fontSize: "0.78rem" }}>
          © {new Date().getFullYear()} Speak &amp; Shine by Sidharth T. All rights reserved.
        </div>
      </div>
    </div>
  );
}
