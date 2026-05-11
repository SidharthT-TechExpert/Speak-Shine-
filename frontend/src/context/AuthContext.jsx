import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/client";
import { getSharedSocket } from "../hooks/useSocket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("token") || null);

  const clearSession = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("dashboard_cache"); // clear stale dashboard data on logout
    setToken(null);
    setUser(null);
  }, []);

  const login = (accessToken, userData, refreshToken) => {
    localStorage.setItem("token", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("user", JSON.stringify(userData));
    setToken(accessToken);
    setUser(userData);
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      try { await api.post("/auth/logout", { refreshToken }); } catch {}
    }
    clearSession();
  };

  // Listen for server-pushed force:logout (e.g. admin disables account)
  useEffect(() => {
    if (!token) return;

    const socket = getSharedSocket(token);

    const onForceLogout = ({ reason } = {}) => {
      console.warn("[Auth] Force logout received:", reason);
      clearSession();
      // Small delay so the socket event is fully processed before redirect
      setTimeout(() => {
        window.location.href = "/login?reason=disabled";
      }, 100);
    };

    socket.on("force:logout", onForceLogout);
    return () => socket.off("force:logout", onForceLogout);
  }, [token, clearSession]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
