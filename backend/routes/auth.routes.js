/**
 * Authentication Routes
 */

import express from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/authController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// ── Local Development Detection ──────────────────────────────────────────────
function isLocalRequest(req) {
  if (process.env.NODE_ENV !== "production") return true;
  const ip = req?.ip || req?.connection?.remoteAddress || "";
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return true;
  return false;
}

// Passthrough middleware in local/dev to completely disable limits
const localBypass = (limiter) => (req, res, next) => {
  if (isLocalRequest(req)) return next();
  return limiter(req, res, next);
};

// ── Rate Limiters ────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true, legacyHeaders: false,
  skip: (req) => isLocalRequest(req),
});

const sendOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5, // 5 per IP per hour (per-phone 3/hr enforced in service)
  message: { error: "Too many OTP requests. Please try again in 1 hour." },
  standardHeaders: true, legacyHeaders: false,
  skip: (req) => isLocalRequest(req),
});

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15, // per-phone attempt cap also enforced in service
  message: { error: "Too many OTP verification attempts. Please try again in 15 minutes." },
  standardHeaders: true, legacyHeaders: false,
  skip: (req) => isLocalRequest(req),
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  message: { error: "Too many token refresh requests. Please try again later." },
  standardHeaders: true, legacyHeaders: false,
  skip: (req) => isLocalRequest(req),
});

// ── Auth ─────────────────────────────────────────────────────────────────────
router.post("/login",   localBypass(loginLimiter),   authController.login);
router.post("/refresh", localBypass(refreshLimiter), authController.refresh);
router.post("/logout",                               authController.logout);

// ── Password Reset ────────────────────────────────────────────────────────────
router.post("/forgot/send-otp",   localBypass(sendOtpLimiter),   authController.sendPasswordResetOTP);
router.post("/forgot/verify-otp", localBypass(verifyOtpLimiter), authController.verifyPasswordResetOTP);
router.post("/forgot/reset",                                     authController.resetPassword);

// ── Registration (SMS OTP → pending approval) ─────────────────────────────────
router.post("/send-otp",   localBypass(sendOtpLimiter),   authController.sendRegistrationOTP);
router.post("/verify-otp", localBypass(verifyOtpLimiter), authController.verifyRegistrationOTP);
router.post("/register",                            authController.register);
router.get("/validate-referral/:code",              authController.validateReferral);

// ── Admin: manage pending registrations ──────────────────────────────────────
router.get("/pending",              authMiddleware, requireRole("admin", "trainer"), authController.listPending);
router.post("/pending/:id/approve", authMiddleware, requireRole("admin", "trainer"), authController.approvePending);
router.delete("/pending/:id",       authMiddleware, requireRole("admin", "trainer"), authController.rejectPending);

export default router;
