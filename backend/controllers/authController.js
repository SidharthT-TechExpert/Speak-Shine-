/**
 * Authentication Controller
 * Handles HTTP requests for authentication endpoints
 */

import * as authService from "../services/auth/authService.js";

// ── Cookie helpers ───────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === "production";
// 24 hours (86,400,000 ms) default (or process.env.ACCESS_TOKEN_MAX_AGE)
const ACCESS_TOKEN_MAX_AGE = process.env.ACCESS_TOKEN_MAX_AGE
  ? Number(process.env.ACCESS_TOKEN_MAX_AGE)
  : 24 * 60 * 60 * 1000;

function setAuthCookies(res, accessToken, refreshToken) {
  // Access token cookie — 24 hours
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: "/",
  });
  // Refresh token cookie — 30 days, httpOnly
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/",
  });
}

function clearAuthCookies(res) {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });
}

/**
 * POST /api/auth/login
 */
export async function login(req, res, next) {
  try {
    const { phone, password } = req.body;
    const result = await authService.loginUser(phone, password, req.ip);
    // Set tokens as httpOnly cookies
    setAuthCookies(res, result.accessToken, result.refreshToken);
    // Return user info (no tokens in body — they're in cookies)
    res.json({
      success: true,
      role: result.role,
      name: result.name,
      phone: result.phone,
      paid: result.paid,
      expiresIn: result.expiresIn,
      theme: result.theme,
      isDark: result.isDark,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    console.error("[Login] Error:", error.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
}

/**
 * POST /api/auth/refresh
 * Reads refresh token from cookie, issues new tokens as cookies.
 */
export async function refresh(req, res, next) {
  try {
    // Accept from cookie first, fall back to body (for backward compat during migration)
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    if (!refreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({ error: "No refresh token provided" });
    }
    const result = await authService.refreshAccessToken(refreshToken, req.ip);
    // Rotate both cookies
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ success: true, expiresIn: result.expiresIn });
  } catch (error) {
    clearAuthCookies(res);
    const status = error.statusCode || (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" || error.name === "CastError" ? 401 : 500);
    if (status !== 500) {
      return res.status(status).json({ error: error.message || "Invalid or expired session" });
    }
    console.error("[Refresh] Error:", error.message);
    res.status(500).json({ error: "Token refresh failed" });
  }
}

/**
 * POST /api/auth/logout
 */
export async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    await authService.logoutUser(refreshToken);
    clearAuthCookies(res);
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    clearAuthCookies(res);
    res.json({ success: true, message: "Logged out" });
  }
}

/**
 * POST /api/auth/forgot/send-otp
 */
export async function sendPasswordResetOTP(req, res, next) {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone is required" });
    const result = await authService.sendPasswordResetOTP(phone);
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    res.status(500).json({ error: "Failed to send OTP. Please try again." });
  }
}

/**
 * POST /api/auth/forgot/verify-otp
 */
export async function verifyPasswordResetOTP(req, res, next) {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP are required" });
    const result = await authService.verifyPasswordResetOTP(phone, otp);
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
}

/**
 * POST /api/auth/forgot/reset
 */
export async function resetPassword(req, res, next) {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) return res.status(400).json({ error: "resetToken and newPassword are required" });
    const result = await authService.resetPassword(resetToken, newPassword);
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    res.status(500).json({ error: "Password reset failed. Please try again." });
  }
}

// ── Registration endpoints ────────────────────────────────────────────────────

/**
 * POST /api/auth/send-otp  — Step 1: send SMS OTP for registration
 */
export async function sendRegistrationOTP(req, res) {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone is required" });
    const result = await authService.sendRegistrationOTP(phone);
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    res.status(400).json({ error: error.message });
  }
}

/**
 * POST /api/auth/verify-otp  — Step 2: verify OTP, get verifyToken
 */
export async function verifyRegistrationOTP(req, res) {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP are required" });
    const result = await authService.verifyRegistrationOTP(phone, otp);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * POST /api/auth/register  — Step 3: submit name + password → pending approval
 */
export async function register(req, res) {
  try {
    const { verifyToken, name, password } = req.body;
    if (!verifyToken || !name || !password) {
      return res.status(400).json({ error: "verifyToken, name, and password are required" });
    }
    const result = await authService.submitRegistration(verifyToken, name, password);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// ── Admin registration management ─────────────────────────────────────────────

/**
 * GET /api/auth/pending  — list pending registrations (admin only)
 */
export async function listPending(req, res) {
  try {
    const result = await authService.listPendingRegistrations();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/auth/pending/:id/approve  — approve a registration (admin only)
 */
export async function approvePending(req, res) {
  try {
    const result = await authService.approvePendingRegistration(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * DELETE /api/auth/pending/:id  — reject a registration (admin only)
 */
export async function rejectPending(req, res) {
  try {
    const result = await authService.rejectPendingRegistration(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
