import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import api, { ensureFreshToken } from "../api/client";
import { getSharedSocket } from "../hooks/useSocket";
import { useTheme } from "./ThemeContext.jsx";

const AuthContext = createContext(null);

// Proactive refresh interval — refresh periodically (every 30 minutes) to keep session fresh
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Sentinel used when auth is cookie-based (no token in localStorage)
const COOKIE_AUTH_SENTINEL = "cookie-session";

export function AuthProvider({ children }) {
  const { applyTheme } = useTheme();
  // Restore user from localStorage immediately so page reloads never flash guest mode
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("speakshine_user") || localStorage.getItem("user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [booting, setBooting] = useState(true);
  // token is exposed for socket connections — uses legacy localStorage value
  // or the sentinel string when fully on cookie auth
  const [token, setToken] = useState(() => localStorage.getItem("token") || null);
  const refreshTimerRef = useRef(null);

  // Schedule a proactive silent token refresh every 30 minutes
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(async () => {
      try {
        await api.post("/auth/refresh", {});
        console.log("[Auth] 🔄 Proactive token refresh succeeded");
      } catch (err) {
        console.warn("[Auth] Proactive refresh check paused:", err?.message || err);
      }
    }, REFRESH_INTERVAL_MS);
  }, []);

  const stopRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("speakshine_user");
    localStorage.removeItem("dashboard_cache");
    stopRefresh();
    setUser(null);
    setToken(null);
  }, [stopRefresh]);

  // Boot: verify active session via access_token cookie, or fall back to silent refresh
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1. First test current session directly (browser sends access_token cookie)
        const { data } = await api.get("/users/me");
        if (!cancelled && data?.auth) {
          const userTheme = data.auth.theme || (data.auth.isDark === false ? "light" : "dark");
          const isDarkVal = data.auth.isDark ?? (userTheme !== "light");
          const userData = {
            phone: data.auth.phone,
            role:  data.auth.role,
            name:  data.auth.name,
            paid:  data.user?.paid ?? false,
            theme: userTheme,
            isDark: isDarkVal,
          };
          setUser(userData);
          try {
            localStorage.setItem("speakshine_user", JSON.stringify(userData));
          } catch {}
          if (userTheme) {
            applyTheme(userTheme);
          }
          setToken(localStorage.getItem("token") || COOKIE_AUTH_SENTINEL);
          scheduleRefresh();
          if (!cancelled) setBooting(false);
          return;
        }
      } catch (err) {
        // 2. If access_token expired (401), attempt silent refresh
        if (err.response?.status === 401) {
          try {
            const sessionValid = await ensureFreshToken();
            if (!cancelled && sessionValid) {
              const { data } = await api.get("/users/me");
              if (!cancelled && data?.auth) {
                const userTheme = data.auth.theme || (data.auth.isDark === false ? "light" : "dark");
                const isDarkVal = data.auth.isDark ?? (userTheme !== "light");
                const userData = {
                  phone: data.auth.phone,
                  role:  data.auth.role,
                  name:  data.auth.name,
                  paid:  data.user?.paid ?? false,
                  theme: userTheme,
                  isDark: isDarkVal,
                };
                setUser(userData);
                try {
                  localStorage.setItem("speakshine_user", JSON.stringify(userData));
                } catch {}
                if (userTheme) {
                  applyTheme(userTheme);
                }
                setToken(localStorage.getItem("token") || COOKIE_AUTH_SENTINEL);
                scheduleRefresh();
                if (!cancelled) setBooting(false);
                return;
              }
            }
          } catch (refreshErr) {
            console.warn("[Auth] Refresh failed on boot:", refreshErr?.message);
          }
          // Server explicitly returned 401 on both access and refresh
          if (!cancelled) {
            clearSession();
          }
        } else {
          // Temporary network failure or 5xx server restart — preserve user session from localStorage
          console.warn("[Auth] Server unavailable or network drop on boot, retaining cached session:", err?.message);
        }
      }
      if (!cancelled) setBooting(false);
    })();

    return () => { cancelled = true; };
  }, [scheduleRefresh, applyTheme, clearSession]);

  const login = useCallback((userData) => {
    // Tokens are set as httpOnly cookies by the server — store user in memory and localStorage
    setUser(userData);
    try {
      localStorage.setItem("speakshine_user", JSON.stringify(userData));
    } catch {}
    setToken(COOKIE_AUTH_SENTINEL);
    const userTheme = userData?.theme || (userData?.isDark === false ? "light" : (userData?.isDark ? "dark" : null));
    if (userTheme) {
      applyTheme(userTheme);
    }
    scheduleRefresh();
  }, [scheduleRefresh, applyTheme]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", {});
    } catch {}
    clearSession();
  }, [clearSession]);

  // Listen for server-pushed force:logout
  useEffect(() => {
    if (!user || booting) return;
    const socketToken = localStorage.getItem("token") || COOKIE_AUTH_SENTINEL;
    const socket = getSharedSocket(socketToken);

    const onForceLogout = ({ reason } = {}) => {
      console.warn("[Auth] Force logout received:", reason);
      clearSession();
      setTimeout(() => {
        window.location.href = "/login?reason=disabled";
      }, 100);
    };

    socket.on("force:logout", onForceLogout);
    return () => socket.off("force:logout", onForceLogout);
  }, [user, booting, clearSession]);

  useEffect(() => () => stopRefresh(), [stopRefresh]);

  return (
    <AuthContext.Provider value={{ user, token, booting, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
