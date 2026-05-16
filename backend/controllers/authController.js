/**
 * Authentication Controller
 * Handles HTTP requests for authentication endpoints
 */

import * as authService from "../services/auth/authService.js";

/**
 * POST /api/auth/login
 */
export async function login(req, res, next) {
  try {
    const { phone, password } = req.body;
    const result = await authService.loginUser(phone, password, req.ip);
    res.json(result);
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
 */
export async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshAccessToken(refreshToken, req.ip);
    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    res.status(500).json({ error: "Token refresh failed" });
  }
}

/**
 * POST /api/auth/logout
 */
export async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.logoutUser(refreshToken);
    res.json(result);
  } catch (error) {
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
