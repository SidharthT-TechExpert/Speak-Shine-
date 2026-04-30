import express from "express";
import argon2 from "argon2";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt } from "crypto";
import rateLimit from "express-rate-limit";
import Auth from "../../models/authSchema.js";
import User from "../../models/userSchema.js";
import { getRedisClient, isRedisAvailable } from "../../redis.js";

const router = express.Router();

// Lazy getter for JWT_SECRET - allows dotenv to load first
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

const TWO_FACTOR_KEY = process.env.TWO_FACTOR_API_KEY || null;
const OTP_TTL = 300; // 5 minutes

// ── Security Event Logging ───────────────────────────────────────────────────
function logSecurityEvent(event, details) {
  const timestamp = new Date().toISOString();
  console.warn(`[SECURITY] ${timestamp} ${event}:`, JSON.stringify(details));
  // TODO: Send to monitoring service (e.g., Sentry, LogRocket, Datadog)
}

// ── Rate limiters ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many OTP requests. Please try again in 1 hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── OTP helpers ───────────────────────────────────────────────────────────────
function otpKey(phone, purpose) { return `otp:${purpose}:${phone}`; }

function generateOTP() {
  return String(randomInt(100000, 1000000));
}

async function storeOTP(phone, otp, purpose) {
  const key = otpKey(phone, purpose);
  if (isRedisAvailable()) {
    await getRedisClient().set(key, otp, "EX", OTP_TTL);
  } else {
    global._otpStore = global._otpStore || {};
    global._otpStore[key] = { otp, exp: Date.now() + OTP_TTL * 1000 };
  }
}

async function getStoredOTP(phone, purpose) {
  const key = otpKey(phone, purpose);
  if (isRedisAvailable()) {
    return await getRedisClient().get(key);
  }
  const entry = global._otpStore?.[key];
  return entry && entry.exp > Date.now() ? entry.otp : null;
}

async function deleteOTP(phone, purpose) {
  const key = otpKey(phone, purpose);
  if (isRedisAvailable()) {
    await getRedisClient().del(key);
  } else {
    delete global._otpStore?.[key];
  }
}

async function sendSmsOTP(phone, otp) {
  if (!TWO_FACTOR_KEY) {
    console.log(`[OTP] DEV MODE — OTP for ${phone}: ${otp}`);
    return true;
  }
  const stripped = phone.replace(/^(\+91|91)/, "");
  const { default: fetch } = await import("node-fetch");
  const url = `https://2factor.in/API/V1/${TWO_FACTOR_KEY}/SMS/${stripped}/${otp}/OTP1`;
  const res = await fetch(url);
  const data = await res.json();
  return data.Status === "Success";
}

// ── WhatsApp user helpers ─────────────────────────────────────────────────────
async function findWhatsAppUser(phone) {
  const stripped = phone.replace(/^91/, "");
  let user = await User.findOne({ phone: { $in: [phone, stripped] } });
  if (user) return user;
  user = await User.findOne({ userId: { $regex: stripped } });
  return user || null;
}

async function autoLinkPhone(phone) {
  const waUser = await findWhatsAppUser(phone);
  if (waUser && !waUser.phone) {
    const stripped = phone.replace(/^91/, "");
    await User.updateOne({ _id: waUser._id }, { $set: { phone: stripped } });
    console.log(`[Auth] Auto-linked phone ${stripped} → userId ${waUser.userId}`);
  }
  return waUser;
}

// ── Disabled public endpoints ─────────────────────────────────────────────────
router.post("/send-otp",   otpLimiter, (_req, res) => res.status(403).json({ error: "Registration is closed. Contact your admin." }));
router.post("/verify-otp", otpLimiter, (_req, res) => res.status(403).json({ error: "Registration is closed. Contact your admin." }));
router.post("/register",              (_req, res) => res.status(403).json({ error: "Registration is closed. Contact your admin." }));

// ── POST /api/auth/refresh ───────────────────────────────────────────────────
// Refresh access token using refresh token
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token required" });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, getJwtSecret());
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    // Check token type
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: "Invalid token type" });
    }

    // Find user and verify refresh token exists in database
    const auth = await Auth.findById(decoded.id);
    if (!auth || !auth.isActive) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // Check if refresh token exists and hasn't expired
    const tokenRecord = auth.refreshTokens?.find(
      rt => rt.token === refreshToken && rt.expiresAt > Date.now()
    );

    if (!tokenRecord) {
      // Token not found or expired - possible token theft, revoke all tokens
      auth.refreshTokens = [];
      await auth.save();
      logSecurityEvent('REFRESH_TOKEN_REUSE', { 
        userId: auth._id, 
        phone: auth.phone, 
        ip: req.ip 
      });
      return res.status(401).json({ error: "Invalid refresh token. Please login again." });
    }

    // Remove old refresh token (rotation)
    auth.refreshTokens = auth.refreshTokens.filter(rt => rt.token !== refreshToken);

    // Issue new access token and refresh token
    const newAccessToken = jwt.sign(
      { id: auth._id, phone: auth.phone, role: auth.role, name: auth.name, type: 'access' },
      getJwtSecret(),
      { expiresIn: "15m" }
    );

    const newRefreshToken = jwt.sign(
      { id: auth._id, phone: auth.phone, type: 'refresh' },
      getJwtSecret(),
      { expiresIn: "7d" }
    );

    // Store new refresh token
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    auth.refreshTokens.push({
      token: newRefreshToken,
      expiresAt: refreshTokenExpiry,
    });

    // Clean up expired tokens
    auth.refreshTokens = auth.refreshTokens.filter(rt => rt.expiresAt > Date.now());

    await auth.save();

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900, // 15 minutes
    });
  } catch (err) {
    console.error("[Refresh] Error:", err.message);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
// Revoke refresh token
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.json({ success: true, message: "Logged out" });
    }

    // Decode without verification to get user ID
    const decoded = jwt.decode(refreshToken);
    if (decoded?.id) {
      const auth = await Auth.findById(decoded.id);
      if (auth) {
        // Remove this specific refresh token
        auth.refreshTokens = auth.refreshTokens?.filter(rt => rt.token !== refreshToken) || [];
        await auth.save();
      }
    }

    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("[Logout] Error:", err.message);
    res.json({ success: true, message: "Logged out" });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ error: "phone and password are required" });
    if (typeof phone !== "string" || typeof password !== "string")
      return res.status(400).json({ error: "Invalid input" });
    if (password.length > 128)
      return res.status(400).json({ error: "Invalid credentials" });

    const auth = await Auth.findOne({ phone });
    if (!auth) {
      console.log(`[Login] No auth found for phone: ${phone}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!auth.isActive) {
      console.log(`[Login] Account disabled for phone: ${phone}`);
      return res.status(403).json({ error: "Account disabled" });
    }

    // Check if account is locked
    if (auth.lockUntil && auth.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((auth.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ 
        error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minutes.` 
      });
    }

    // Support both legacy bcrypt hashes and new argon2 hashes.
    // Silently upgrade bcrypt → argon2 on successful login.
    let valid = false;
    const isBcrypt = auth.password.startsWith("$2b$") || auth.password.startsWith("$2a$");
    if (isBcrypt) {
      valid = await bcrypt.compare(password, auth.password);
      if (valid) {
        // Upgrade hash to argon2 in the background
        auth.password = await argon2.hash(password);
        await auth.save();
        console.log(`[Auth] Upgraded password hash to argon2 for ${phone}`);
      }
    } else {
      valid = await argon2.verify(auth.password, password);
    }
    
    if (!valid) {
      // Increment failed attempts
      auth.failedLoginAttempts = (auth.failedLoginAttempts || 0) + 1;
      
      // Log failed login attempt
      logSecurityEvent('FAILED_LOGIN', { phone, attempts: auth.failedLoginAttempts, ip: req.ip });
      
      // Lock account after 5 failed attempts for 30 minutes
      if (auth.failedLoginAttempts >= 5) {
        auth.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        await auth.save();
        logSecurityEvent('ACCOUNT_LOCKED', { phone, reason: 'too_many_failed_attempts', ip: req.ip });
        return res.status(423).json({ 
          error: "Too many failed login attempts. Account locked for 30 minutes." 
        });
      }
      
      await auth.save();
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Reset failed attempts on successful login
    auth.failedLoginAttempts = 0;
    auth.lockUntil = null;

    await autoLinkPhone(phone);

    // Issue short-lived access token (15 minutes) and long-lived refresh token (7 days)
    const accessToken = jwt.sign(
      { id: auth._id, phone, role: auth.role, name: auth.name, type: 'access' },
      getJwtSecret(),
      { expiresIn: "15m" }
    );
    
    const refreshToken = jwt.sign(
      { id: auth._id, phone, type: 'refresh' },
      getJwtSecret(),
      { expiresIn: "7d" }
    );
    
    // Store refresh token in database (limit to 5 active tokens per user)
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    auth.refreshTokens = auth.refreshTokens || [];
    auth.refreshTokens.push({
      token: refreshToken,
      expiresAt: refreshTokenExpiry,
    });
    
    // Keep only the 5 most recent refresh tokens
    if (auth.refreshTokens.length > 5) {
      auth.refreshTokens = auth.refreshTokens.slice(-5);
    }
    
    await auth.save();

    res.json({ 
      accessToken, 
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      role: auth.role, 
      name: auth.name, 
      phone 
    });
  } catch (err) {
    console.error("[Login] Error:", err.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ── Forgot password — Step 1: send OTP to registered phone ───────────────────
// POST /api/auth/forgot/send-otp
router.post("/forgot/send-otp", otpLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone is required" });

    const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
    if (!/^[6-9]\d{9}$/.test(stripped))
      return res.status(400).json({ error: "Enter a valid 10-digit Indian mobile number" });

    // Only send OTP if phone is actually registered
    const auth = await Auth.findOne({ phone: { $in: [stripped, `91${stripped}`, phone] } });
    if (!auth) return res.status(404).json({ error: "No account found with this phone number." });
    if (!auth.isActive) return res.status(403).json({ error: "This account has been disabled. Contact your admin." });

    const otp = generateOTP();
    
    // Set OTP expiration (5 minutes) and reset attempt counter
    auth.otp = otp;
    auth.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    auth.otpAttempts = 0;
    await auth.save();
    
    await storeOTP(stripped, otp, "forgot");
    await sendSmsOTP(stripped, otp);

    res.json({ success: true, message: `OTP sent to ${stripped.slice(0, 5)}XXXXX` });
  } catch (err) {
    console.error("[ForgotSendOTP] Error:", err.message);
    res.status(500).json({ error: "Failed to send OTP. Please try again." });
  }
});

// ── Forgot password — Step 2: verify OTP, get reset token ────────────────────
// POST /api/auth/forgot/verify-otp
router.post("/forgot/verify-otp", otpLimiter, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP are required" });

    const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
    const stored = await getStoredOTP(stripped, "forgot");

    if (!stored) return res.status(400).json({ error: "OTP expired or not found. Request a new one." });
    
    // Get auth record to check expiry and attempts
    const auth = await Auth.findOne({ phone: { $in: [stripped, `91${stripped}`, phone] } });
    if (!auth) return res.status(404).json({ error: "Account not found" });
    
    // Check OTP expiration
    if (!auth.otpExpiry || auth.otpExpiry < Date.now()) {
      await deleteOTP(stripped, "forgot");
      return res.status(400).json({ error: "OTP has expired. Request a new one." });
    }
    
    // Check attempt limit
    if (auth.otpAttempts >= 3) {
      await deleteOTP(stripped, "forgot");
      return res.status(429).json({ error: "Too many incorrect attempts. Request a new OTP." });
    }
    
    if (stored !== String(otp).trim()) {
      // Increment failed attempts
      auth.otpAttempts = (auth.otpAttempts || 0) + 1;
      await auth.save();
      return res.status(400).json({ error: "Incorrect OTP" });
    }

    // Clear OTP data on success
    auth.otp = null;
    auth.otpExpiry = null;
    auth.otpAttempts = 0;
    await auth.save();
    
    await deleteOTP(stripped, "forgot");

    // Issue a short-lived reset token
    const resetToken = jwt.sign({ phone: stripped, purpose: "reset" }, getJwtSecret(), { expiresIn: "10m" });
    res.json({ success: true, resetToken });
  } catch (err) {
    console.error("[ForgotVerifyOTP] Error:", err.message);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

// ── Forgot password — Step 3: set new password ───────────────────────────────
// POST /api/auth/forgot/reset
router.post("/forgot/reset", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword)
      return res.status(400).json({ error: "resetToken and newPassword are required" });
    if (newPassword.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    if (newPassword.length > 128)
      return res.status(400).json({ error: "Password too long" });

    let decoded;
    try {
      decoded = jwt.verify(resetToken, getJwtSecret());
    } catch {
      return res.status(400).json({ error: "Reset link expired. Please start over." });
    }

    if (decoded.purpose !== "reset")
      return res.status(400).json({ error: "Invalid reset token" });

    const auth = await Auth.findOne({
      phone: { $in: [decoded.phone, `91${decoded.phone}`] },
    });
    if (!auth) return res.status(404).json({ error: "Account not found" });
    if (!auth.isActive) return res.status(403).json({ error: "Account disabled" });

    auth.password = await argon2.hash(newPassword);
    await auth.save();

    res.json({ success: true, message: "Password updated successfully. You can now log in." });
  } catch (err) {
    console.error("[ForgotReset] Error:", err.message);
    res.status(500).json({ error: "Password reset failed. Please try again." });
  }
});

export default router;
