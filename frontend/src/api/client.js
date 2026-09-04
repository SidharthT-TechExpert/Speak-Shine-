import axios from "axios";
import { reconnectSocketWithNewToken } from "../hooks/useSocket";

// Dev: set VITE_API_URL=http://localhost:3001/api in frontend/.env.local
// Production: API and frontend are on the same origin, so /api works
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // always send cookies (access_token, refresh_token)
});

// Simple in-memory GET cache — avoids duplicate requests within 30s
const cache = new Map();
const CACHE_TTL = 30_000;
const CACHEABLE = ["/dashboard", "/dashboard/me", "/users", "/questions", "/live-sessions"];

// Track if we're currently refreshing to avoid multiple refresh calls
let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed() {
  refreshSubscribers.forEach(cb => cb());
  refreshSubscribers = [];
}

async function refreshAccessToken() {
  // Token is in httpOnly cookie — just call /refresh, server rotates both cookies
  try {
    await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
    // Reconnect socket after token rotation
    try { reconnectSocketWithNewToken(); } catch {}
    return true;
  } catch (error) {
    // Refresh failed — clear any stale localStorage leftovers
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    throw error;
  }
}

api.interceptors.request.use((config) => {
  // Legacy: still send Authorization header if token is in localStorage
  // (supports old sessions during migration — can remove after all users re-login)
  const legacyToken = localStorage.getItem("token");
  if (legacyToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${legacyToken}`;
  }

  // Serve from cache for GET requests on cacheable endpoints
  if (config.method === "get") {
    const key = config.url + JSON.stringify(config.params || {});
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL && CACHEABLE.some(p => config.url.startsWith(p))) {
      config._cached = hit.data;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => {
    // Store GET responses in cache
    if (res.config.method === "get") {
      const key = res.config.url + JSON.stringify(res.config.params || {});
      if (CACHEABLE.some(p => res.config.url.startsWith(p))) {
        cache.set(key, { data: res, ts: Date.now() });
      }
    }
    return res;
  },
  async (err) => {
    const originalRequest = err.config;

    // If token expired — try silent refresh
    // Handle both TOKEN_EXPIRED code and plain 401 Unauthorized (e.g. from video upload)
    if (err.response?.status === 401 &&
        !originalRequest._retry &&
        !originalRequest.url?.includes("/auth/refresh")) {

      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh(() => {
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await refreshAccessToken();
        isRefreshing = false;
        onTokenRefreshed();
        // Remove stale legacy header so cookie is used on retry
        delete originalRequest.headers.Authorization;
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        return Promise.reject(refreshError);
      }
    }

    // Other 401 after retry failed — session truly gone, clear auth
    if (err.response?.status === 401 && originalRequest._retry) {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      // Only redirect to login if currently on an explicitly protected path
      const path = window.location.pathname;
      const isPublicPath = ["/", "/dashboard", "/record", "/video-analysis", "/community", "/login", "/register", "/forgot-password"].includes(path) || path.startsWith("/admin/login") || path.startsWith("/trainer/login");
      if (!isPublicPath) {
        window.location.href = "/login";
      }
    }

    // Account disabled by admin
    if (err.response?.status === 403 && err.response?.data?.code === "ACCOUNT_DISABLED") {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      window.location.href = "/login?reason=disabled";
    }

    return Promise.reject(err);
  }
);

/**
 * Proactively ensure a valid session on app boot.
 * With cookie-based tokens the server handles expiry — just try /auth/refresh
 * if the legacy localStorage token looks expired or missing.
 * Returns true if session is valid, false if user needs to log in.
 */
export async function ensureFreshToken() {
  // If we have a legacy localStorage token, check if it's still valid
  const legacyToken = localStorage.getItem("token");
  if (legacyToken) {
    try {
      const payload = legacyToken.split(".")[1];
      const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      // If still valid for >60s, keep using it (migration period)
      if (exp * 1000 - Date.now() > 60_000) return legacyToken;
    } catch {}
    // Token expired or invalid — clear it and fall through to cookie-based refresh
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
  }

  // Try silent refresh using the httpOnly refresh_token cookie
  try {
    await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
    return true;
  } catch {
    return null; // no valid session
  }
}

// Call this after any mutation to bust stale cache entries
export function bustCache(urlPrefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(urlPrefix)) cache.delete(key);
  }
}

export default api;

/**
 * Get a valid auth token for use in XHR headers / query strings.
 * Prefers the legacy localStorage token (migration period).
 * Falls back to requesting a fresh short-lived token via /auth/token endpoint.
 * For cookie-only sessions, returns null — callers should use withCredentials instead.
 */
export async function getAuthToken() {
  const legacy = localStorage.getItem("token");
  if (legacy) {
    try {
      const { exp } = JSON.parse(atob(legacy.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (exp * 1000 - Date.now() > 30_000) return legacy; // still valid
    } catch {}
  }
  // Cookie-based session — no token in localStorage
  // The server accepts cookies via withCredentials, so return null
  return null;
}
