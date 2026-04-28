import { useState, useEffect } from "react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    const dismissed = localStorage.getItem("pwa-dismissed");
    if (dismissed && Date.now() - parseInt(dismissed) < 3 * 24 * 60 * 60 * 1000) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (ios) {
      setIsIOS(true);
      setTimeout(() => setShow(true), 2000);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShow(true), 2000);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => { setShow(false); setInstalled(true); });
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setInstalling(false);
    if (outcome === "accepted") setShow(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-dismissed", Date.now().toString());
    setShow(false);
  };

  if (!show || installed) return null;

  return (
    <>
      <style>{`
        @keyframes slideUpIn {
          from { transform: translateX(-50%) translateY(120px); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0);     opacity: 1; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>

      <div style={{
        position: "fixed",
        bottom: "1.25rem",
        left: "50%",
        transform: "translateX(-50%)",
        width: "calc(100% - 2rem)",
        maxWidth: 400,
        background: "linear-gradient(145deg, #13132a 0%, #1a1a35 100%)",
        border: "1.5px solid rgba(124,111,255,0.35)",
        borderRadius: 20,
        padding: "1.25rem",
        zIndex: 9999,
        boxShadow: "0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,111,255,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
        animation: "slideUpIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
      }}>

        {/* Dismiss */}
        <button onClick={handleDismiss} style={{
          position: "absolute", top: "0.85rem", right: "0.85rem",
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "50%", width: 26, height: 26, cursor: "pointer",
          color: "#666688", fontSize: "0.85rem", lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
        }}>✕</button>

        {/* App info row */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem", marginBottom: "1rem" }}>
          {/* Icon with pulse ring */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              position: "absolute", inset: -4, borderRadius: 18,
              border: "2px solid rgba(124,111,255,0.5)",
              animation: "pulse-ring 2s ease-out infinite",
            }} />
            <img
              src="/icons/icon-192.png"
              alt="Speak & Shine"
              style={{ width: 52, height: 52, borderRadius: 14, display: "block" }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.95rem", marginBottom: "0.15rem" }}>
              Speak &amp; Shine
            </div>
            <div style={{ color: "#7777aa", fontSize: "0.75rem" }}>
              speakandshine.app · Free
            </div>
            {/* Star rating */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", marginTop: "0.2rem" }}>
              {[1,2,3,4,5].map(i => (
                <svg key={i} width="10" height="10" viewBox="0 0 10 10" fill="#fbbf24">
                  <polygon points="5,1 6.2,3.8 9.5,4.1 7.2,6.2 7.9,9.5 5,7.8 2.1,9.5 2.8,6.2 0.5,4.1 3.8,3.8" />
                </svg>
              ))}
              <span style={{ color: "#7777aa", fontSize: "0.7rem", marginLeft: "0.2rem" }}>Daily Speaking App</span>
            </div>
          </div>
        </div>

        {/* Feature pills */}
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {["⚡ Fast", "📴 Offline", "🔔 Alerts", "📱 App-like"].map(f => (
            <span key={f} style={{
              background: "rgba(124,111,255,0.1)", border: "1px solid rgba(124,111,255,0.2)",
              borderRadius: 20, padding: "0.2rem 0.6rem",
              fontSize: "0.72rem", color: "#9988ff",
            }}>{f}</span>
          ))}
        </div>

        {/* iOS instructions */}
        {isIOS ? (
          <div style={{
            background: "rgba(124,111,255,0.08)", border: "1px solid rgba(124,111,255,0.2)",
            borderRadius: 12, padding: "0.85rem", fontSize: "0.83rem",
            color: "#b0b0d0", lineHeight: 1.6, marginBottom: "0.75rem",
          }}>
            Tap <strong style={{ color: "#fff" }}>Share ⎙</strong> at the bottom of Safari, then tap{" "}
            <strong style={{ color: "#fff" }}>"Add to Home Screen"</strong>
          </div>
        ) : (
          /* Download / Install button */
          <button
            onClick={handleInstall}
            disabled={installing}
            style={{
              width: "100%",
              background: installing
                ? "rgba(124,111,255,0.4)"
                : "linear-gradient(135deg, #7c6fff 0%, #5b4fe8 50%, #4338ca 100%)",
              backgroundSize: "200% auto",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "0.9rem 1rem",
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor: installing ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.6rem",
              boxShadow: "0 4px 20px rgba(124,111,255,0.4)",
              transition: "all 0.25s ease",
              marginBottom: "0.6rem",
              animation: installing ? "none" : "shimmer 3s linear infinite",
            }}
            onMouseEnter={e => { if (!installing) e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {/* Download arrow icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {installing ? "Installing…" : "Install App"}
          </button>
        )}

        <div style={{ textAlign: "center", fontSize: "0.7rem", color: "#44445a" }}>
          No app store · No storage · Installs in 2 seconds
        </div>
      </div>
    </>
  );
}
