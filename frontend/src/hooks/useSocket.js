/**
 * Shared Socket.io singleton hook.
 * All chat components share one socket connection per token.
 */
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

// Derive the socket server URL:
// - Dev: strip /api from VITE_API_URL → e.g. http://localhost:3001
// - Prod: same origin as the page (API + frontend served together)
function getSocketUrl() {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    // Dev mode — VITE_API_URL is set explicitly
    return apiUrl.replace(/\/api\/?$/, "");
  }
  // Production — same origin, no path needed
  return window.location.origin;
}

const SOCKET_URL = getSocketUrl();

// Module-level singleton — one socket per browser session
let _socket = null;
let _currentToken = null;

export function getSharedSocket(token) {
  // If token changed (e.g. re-login), tear down old socket
  if (_socket && _currentToken !== token) {
    _socket.disconnect();
    _socket = null;
    _currentToken = null;
  }

  if (!_socket || _socket.disconnected) {
    _socket = io(SOCKET_URL, {
      auth: { token },
      // In production (same origin), path must match what the server mounts on
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: 15,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      timeout: 10000,
      withCredentials: true,
    });
    _currentToken = token;

    // Debug logging in dev
    if (import.meta.env.DEV) {
      _socket.on("connect", () => console.log("[Socket] Connected:", _socket.id));
      _socket.on("disconnect", r => console.log("[Socket] Disconnected:", r));
      _socket.on("connect_error", e => console.error("[Socket] Error:", e.message));
    }
  }

  return _socket;
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
