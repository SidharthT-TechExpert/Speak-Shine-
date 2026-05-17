/**
 * Shared Socket.io singleton hook.
 * All chat components share one socket connection per token.
 * When the access token is refreshed (via axios interceptor), call
 * reconnectSocketWithNewToken() to swap in the new token automatically.
 */
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

function getSocketUrl() {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) return apiUrl.replace(/\/api\/?$/, "");
  return window.location.origin;
}

const SOCKET_URL = getSocketUrl();

// Module-level singleton
let _socket = null;
let _currentToken = null;

export function getSharedSocket(token) {
  // Token changed (re-login or refresh) → tear down old socket
  if (_socket && _currentToken !== token) {
    _socket.disconnect();
    _socket = null;
    _currentToken = null;
  }

  if (!_socket || _socket.disconnected) {
    _socket = io(SOCKET_URL, {
      auth: { token },
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: 20,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      timeout: 10000,
      withCredentials: true,
    });
    _currentToken = token;

    if (import.meta.env.DEV) {
      _socket.on("connect",       () => console.log("[Socket] Connected:", _socket.id));
      _socket.on("disconnect",    r  => console.log("[Socket] Disconnected:", r));
      _socket.on("connect_error", e  => console.error("[Socket] Error:", e.message));
    }

    // If the server rejects the token (jwt expired), refresh it and reconnect
    _socket.on("connect_error", async (err) => {
      const msg = err?.message || "";
      if (msg.includes("jwt expired") || msg.includes("invalid token") || msg.includes("TokenExpiredError")) {
        console.log("[Socket] Token expired on connect — refreshing…");
        try {
          const refreshToken = localStorage.getItem("refreshToken");
          if (!refreshToken) return;
          const { default: axios } = await import("axios");
          const BASE_URL = import.meta.env.VITE_API_URL || "/api";
          const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = res.data;
          localStorage.setItem("token", accessToken);
          localStorage.setItem("refreshToken", newRefreshToken);
          // Reconnect with the fresh token
          reconnectSocketWithNewToken(accessToken);
        } catch {
          // Refresh failed — let the normal logout flow handle it
        }
      }
    });
  }

  return _socket;
}

/**
 * Called by the axios interceptor after a successful token refresh.
 * Reconnects the socket with the new token so it doesn't stay stuck
 * on an expired JWT without requiring a hard page reload.
 */
export function reconnectSocketWithNewToken(newToken) {
  if (!_socket) return; // no socket yet, nothing to do
  if (_currentToken === newToken) return; // already up to date

  console.log("[Socket] Token refreshed — reconnecting socket with new token");
  _socket.disconnect();
  _socket = null;
  _currentToken = null;
  // Re-create with the new token
  getSharedSocket(newToken);
}

/**
 * React hook that returns the shared socket and ensures cleanup on unmount.
 * Does NOT disconnect on unmount — the socket is shared across components.
 */
export function useSharedSocket(token) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    socketRef.current = getSharedSocket(token);
  }, [token]);

  return socketRef;
}
