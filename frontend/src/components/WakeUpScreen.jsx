/**
 * WakeUpScreen — shown while the Render backend is cold-starting.
 * Polls /api/health every 3s. Once the server responds, calls onReady().
 */
import { useEffect, useState } from "react";

const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
  : "";

export default function WakeUpScreen({ onReady }) {
  const [dots, setDots]       = useState(".");
  const [elapsed, setElapsed] = useState(0);
  const [attempt, setAttempt] = useState(0);

  // Animated dots
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 500);
    return () => clearInterval(id);
  }, []);

  // Elapsed seconds counter
  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll /api/health every 3s
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        const res = await fetch(`${BASE}/api/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if ((res.ok || res.status === 429) && !cancelled) {
          onReady();
          return;
        }
      } catch {
        // server still sleeping — keep trying
      }
      if (!cancelled) {
        setAttempt(a => a + 1);
        setTimeout(ping, 3000);
      }
    }

    ping();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Logo / icon */}
        <div style={styles.iconWrap}>
          <span style={styles.icon}>🗣️</span>
        </div>

        <h1 style={styles.title}>Speak &amp; Shine</h1>

        {/* Spinner */}
        <div style={styles.spinnerWrap}>
          <div style={styles.spinner} />
        </div>

        <p style={styles.message}>
          Waking up the server{dots}
        </p>
        <p style={styles.sub}>
          Free hosting sleeps when idle. This takes about 30 seconds.
        </p>

        {/* Progress bar — fills over 35s */}
        <div style={styles.barTrack}>
          <div
            style={{
              ...styles.barFill,
              width: `${Math.min((elapsed / 35) * 100, 95)}%`,
            }}
          />
        </div>

        <p style={styles.timer}>{elapsed}s{attempt > 0 ? ` · attempt ${attempt + 1}` : ""}</p>
      </div>

      <style>{`
        @keyframes ss-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes ss-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        @keyframes ss-bar {
          0%   { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#05050f",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    padding: "40px 32px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "20px",
    maxWidth: "360px",
    width: "90%",
    textAlign: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #7c6fff, #a78bfa)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    animation: "ss-pulse 2s ease-in-out infinite",
  },
  icon: {
    fontSize: 36,
    lineHeight: 1,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#f0f0ff",
    letterSpacing: "-0.3px",
  },
  spinnerWrap: {
    margin: "8px 0 4px",
  },
  spinner: {
    width: 36,
    height: 36,
    border: "3px solid rgba(124,111,255,0.2)",
    borderTopColor: "#7c6fff",
    borderRadius: "50%",
    animation: "ss-spin 0.8s linear infinite",
  },
  message: {
    margin: 0,
    fontSize: 15,
    color: "#c4c4e0",
    fontWeight: 500,
    minWidth: 180,   // prevent layout shift from dots
  },
  sub: {
    margin: 0,
    fontSize: 12,
    color: "#6b6b8a",
    lineHeight: 1.5,
    maxWidth: 260,
  },
  barTrack: {
    width: "100%",
    height: 4,
    background: "rgba(255,255,255,0.08)",
    borderRadius: 99,
    overflow: "hidden",
    marginTop: 4,
  },
  barFill: {
    height: "100%",
    borderRadius: 99,
    background: "linear-gradient(90deg, #7c6fff, #a78bfa, #7c6fff)",
    backgroundSize: "200% 100%",
    animation: "ss-bar 1.5s linear infinite",
    transition: "width 1s linear",
  },
  timer: {
    margin: 0,
    fontSize: 11,
    color: "#44445a",
  },
};
