import { useState, useEffect } from "react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Already installed (running as standalone)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    // Dismissed before — don't show again for 3 days
    const dismissed = localStorage.getItem("pwa-dismissed");
    if (dismissed && Date.now() - parseInt(dismissed) < 3 * 24 * 60 * 60 * 1000) return;

    // iOS detection
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (ios) {
      setIsIOS(true);
      setShow(true);
      return;
    }

    // Android / Desktop — capture beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Detect successful install
    window.addEventListener("appinstalled", () => {
      setShow(false);
      setInstalled(true);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShow(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-dismissed", Date.now().toString());
    setShow(false);
  };

  if (!show || installed) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "1.25rem",
      left: "50%",
      transform: "translateX(-50%)",
      width: "calc(100% - 2rem)",
      maxWidth: 420,
      background: "linear-gradient(135deg, #1a1a2e 0%, #16162a 100%)",
      border: "1.5px solid rgba(124,111,255,0.4)",
      borderRadius: 16,
      padding: "1.25rem",
      zIndex: 9999,
      boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,111,255,0.1)",
      display: "flex",
      flexDirection: "column",
      gap: "0.85rem",
      animation: "slideUp 0.3s ease",
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(100px); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Close */}
      <button onClick={handleDismiss} style={{
        position: "absolute", top: "0.75rem", right: "0.75rem",
        background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%",
        width: 28, height: 28, cursor: "pointer", color: "#8888aa",
        fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center",
      }}>×</button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: "linear-gradient(135deg, #7c6fff, #4f46e5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.6rem", flexShrink: 0,
          boxShadow: "0 4px 12px rgba(124,111,255,0.4)",
        }}>🗣️</div>
        <div>
          <div style={{ fontWeight: 700, color: "#fff", fontSize: "1rem" }}>Install Speak &amp; Shine</div>
          <div style={{ color: "#8888aa", fontSize: "0.8rem", marginTop: "0.15rem" }}>Add to home screen for the best experience</div>
        </div>
      </div>

      {/* Features */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {["⚡ Fast", "📴 Works Offline", "🔔 Notifications", "📱 App-like"].map(f => (
          <span key={f} style={{
            background: "rgba(124,111,255,0.12)", border: "1px solid rgba(124,111,255,0.2)",
            borderRadius: 20, padding: "0.25rem 0.65rem",
            fontSize: "0.75rem", color: "#a89fff",
          }}>{f}</span>
        ))}
      </div>

      {/* iOS instructions */}
      {isIOS ? (
        <div style={{
          background: "rgba(124,111,255,0.08)", border: "1px solid rgba(124,111,255,0.2)",
          borderRadius: 10, padding: "0.85rem", fontSize: "0.85rem", color: "#c4c4e0", lineHeight: 1.6,
        }}>
          Tap <strong style={{ color: "#fff" }}>Share</strong> <span style={{ fontSize: "1rem" }}>⎙</span> then{" "}
          <strong style={{ color: "#fff" }}>"Add to Home Screen"</strong> to install the app.
        </div>
      ) : (
        <button onClick={handleInstall} style={{
          background: "linear-gradient(135deg, #7c6fff 0%, #4f46e5 100%)",
          color: "#fff", border: "none", borderRadius: 12,
          padding: "0.85rem", fontSize: "0.95rem", fontWeight: 700,
          cursor: "pointer", width: "100%",
          boxShadow: "0 4px 16px rgba(124,111,255,0.35)",
          transition: "all 0.2s ease",
        }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
        >
          📲 Install App — It's Free!
        </button>
      )}

      <div style={{ textAlign: "center", fontSize: "0.75rem", color: "#555577" }}>
        No app store needed · Installs in seconds
      </div>
    </div>
  );
}
