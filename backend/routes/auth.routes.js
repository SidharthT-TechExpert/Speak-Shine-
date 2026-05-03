/**
 * Authentication Routes
 * Thin routing layer - delegates to controllers
 */

import express from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/authController.js";

const router = express.Router();

// ── Rate Limiters ────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Too many OTP requests. Please try again in 1 hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // generous but bounded — normal clients refresh every 15 min
  message: { error: "Too many token refresh requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Authentication Routes ────────────────────────────────────────────────────
router.post("/login", loginLimiter, authController.login);
router.post("/refresh", refreshLimiter, authController.refresh);
router.post("/logout", authController.logout);

// ── Password Reset Routes ────────────────────────────────────────────────────
router.post("/forgot/send-otp", otpLimiter, authController.sendPasswordResetOTP);
router.post("/forgot/verify-otp", otpLimiter, authController.verifyPasswordResetOTP);
router.post("/forgot/reset", authController.resetPassword);

// ── Disabled Routes (Registration Closed) ────────────────────────────────────
router.post("/send-otp", otpLimiter, authController.registrationClosed);
router.post("/verify-otp", otpLimiter, authController.registrationClosed);
router.post("/register", authController.registrationClosed);

export default router;
