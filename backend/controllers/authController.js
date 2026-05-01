/**
 * Authentication Controller
 * Handles HTTP requests for authentication endpoints
 */

import * as authService from "../services/auth/authService.js";

/**
 * POST /api/auth/login
 * Login with phone and password
 */
export async function login(req, res, next) {
  try {
    const { phone, password } = req.body;
    const ipAddress = req.ip;
    
    const result = await authService.loginUser(phone, password, ipAddress);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Login] Error:", error.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
}

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
export async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const ipAddress = req.ip;
    
    const result = await authService.refreshAccessToken(refreshToken, ipAddress);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Refresh] Error:", error.message);
    res.status(500).json({ error: "Token refresh failed" });
  }
}

/**
 * POST /api/auth/logout
 * Logout by revoking refresh token
 */
export async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    
    const result = await authService.logoutUser(refreshToken);
    res.json(result);
  } catch (error) {
    console.error("[Logout] Error:", error.message);
    res.json({ success: true, message: "Logged out" });
  }
}

/**
 * POST /api/auth/forgot/send-otp
 * Send OTP for password reset
 */
export async function sendPasswordResetOTP(req, res, next) {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }
    
    const result = await authService.sendPasswordResetOTP(phone);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[ForgotSendOTP] Error:", error.message);
    res.status(500).json({ error: "Failed to send OTP. Please try again." });
  }
}

/**
 * POST /api/auth/forgot/verify-otp
 * Verify OTP and get reset token
 */
export async function verifyPasswordResetOTP(req, res, next) {
  try {
    const { phone, otp } = req.body;
    
    if (!phone || !otp) {
      return res.status(400).json({ error: "Phone and OTP are required" });
    }
    
    const result = await authService.verifyPasswordResetOTP(phone, otp);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[ForgotVerifyOTP] Error:", error.message);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
}

/**
 * POST /api/auth/forgot/reset
 * Reset password using reset token
 */
export async function resetPassword(req, res, next) {
  try {
    const { resetToken, newPassword } = req.body;
    
    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: "resetToken and newPassword are required" });
    }
    
    const result = await authService.resetPassword(resetToken, newPassword);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[ForgotReset] Error:", error.message);
    res.status(500).json({ error: "Password reset failed. Please try again." });
  }
}

/**
 * Disabled endpoints (registration closed)
 */
export function registrationClosed(req, res) {
  res.status(403).json({ error: "Registration is closed. Contact your admin." });
}
