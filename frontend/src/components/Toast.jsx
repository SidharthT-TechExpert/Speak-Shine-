import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = "success", duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{
        position: "fixed", top: "1rem", right: "1rem",
        zIndex: 99999, display: "flex", flexDirection: "column", gap: "0.5rem",
        pointerEvents: "none",
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === "error" || t.type === "danger"
              ? "rgba(127,29,29,0.97)"
              : t.type === "warning"
              ? "rgba(120,80,0,0.97)"
              : "rgba(6,78,59,0.97)",
            border: `1px solid ${
              t.type === "error" || t.type === "danger"
                ? "rgba(248,113,113,0.4)"
                : t.type === "warning"
                ? "rgba(251,191,36,0.4)"
                : "rgba(74,222,128,0.4)"
            }`,
            color: "#fff",
            padding: "0.7rem 1.1rem",
            borderRadius: 12,
            fontSize: "0.88rem",
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            animation: "toastIn 0.25s ease",
            maxWidth: 340,
            pointerEvents: "auto",
          }}>
            {t.type === "error" || t.type === "danger" ? "❌ " : t.type === "warning" ? "⚠️ " : "✅ "}
            {t.message}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
