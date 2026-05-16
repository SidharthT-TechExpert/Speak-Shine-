/**
 * Authentication Routes
 */

import express from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/authController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// ── Rate Limiters ────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true, legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  message: { error: "Too many OTP requests. Please try again in 1 hour." },
  standardHeaders: true, legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  message: { error: "Too many token refresh requests. Please try again later." },
  standardHeaders: true, legacyHeaders: false,
});

// ── Auth ─────────────────────────────────────────────────────────────────────
router.post("/login",   loginLimiter,   authController.login);
router.post("/refresh", refreshLimiter, authController.refresh);
router.post("/logout",                  authController.logout);

// ── Password Reset ────────────────────────────────────────────────────────────
router.post("/forgot/send-otp",   otpLimiter, authController.sendPasswordResetOTP);
router.post("/forgot/verify-otp", otpLimiter, authController.verifyPasswordResetOTP);
router.post("/forgot/reset",                  authController.resetPassword);

// ── Registration (SMS OTP → pending approval) ─────────────────────────────────
router.post("/send-otp",   otpLimiter, authController.sendRegistrationOTP);
router.post("/verify-otp", otpLimiter, authController.verifyRegistrationOTP);
router.post("/register",               authController.register);

// ── Admin: manage pending registrations ──────────────────────────────────────
router.get("/pending",              authMiddleware, requireRole("admin", "trainer"), authController.listPending);
router.post("/pending/:id/approve", authMiddleware, requireRole("admin", "trainer"), authController.approvePending);
router.delete("/pending/:id",       authMiddleware, requireRole("admin", "trainer"), authController.rejectPending);

export default router;
