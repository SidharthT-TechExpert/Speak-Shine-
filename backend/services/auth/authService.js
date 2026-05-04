/**
 * Authentication Service
 * Business logic for user authentication, registration, and password management
 */

import argon2 from "argon2";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt } from "crypto";
import Auth from "../../../models/authSchema.js";
import User from "../../../models/userSchema.js";
import { getRedisClient, isRedisAvailable } from "../../../redis.js";
import { validatePassword } from "../../utils/validationUtils.js";

const OTP_TTL = 300; // 5 minutes
const TWO_FACTOR_KEY = process.env.TWO_FACTOR_API_KEY || null;

// ── JWT Secret Helper ────────────────────────────────────────────────────────
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

// ── Security Event Logging ───────────────────────────────────────────────────
export function logSecurityEvent(event, details) {
  const timestamp = new Date().toISOString();
  console.warn(`[SECURITY] ${timestamp} ${event}:`, JSON.stringify(details));
  // TODO: Send to monitoring service (e.g., Sentry, LogRocket, Datadog)
}

// ── OTP Management ───────────────────────────────────────────────────────────
function otpKey(phone, purpose) { 
  return `otp:${purpose}:${phone}`; 
}

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

// ── WhatsApp User Helpers ────────────────────────────────────────────────────
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

// ── Authentication Services ──────────────────────────────────────────────────

/**
 * Login user with phone and password
 */
export async function loginUser(phone, password, ipAddress) {
  // Validation
  if (!phone || !password) {
    throw new Error("phone and password are required");
  }
  if (typeof phone !== "string" || typeof password !== "string") {
    throw new Error("Invalid input");
  }
  if (password.length > 128) {
    throw new Error("Invalid credentials");
  }

  // Try multiple phone formats
  const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
  const auth = await Auth.findOne({ 
    phone: { $in: [phone, stripped, `91${stripped}`] } 
  });

  if (!auth) {
    console.log(`[Login] No auth found for phone: ${phone}`);
    throw new Error("Invalid credentials");
  }

  if (!auth.isActive) {
    console.log(`[Login] Account disabled for phone: ${phone}`);
    const error = new Error("Account disabled");
    error.statusCode = 403;
    throw error;
  }

  // Check if account is locked
  if (auth.lockUntil && auth.lockUntil > Date.now()) {
    const minutesLeft = Math.ceil((auth.lockUntil - Date.now()) / 60000);
    const error = new Error(`Account locked due to too many failed attempts. Try again in ${minutesLeft} minutes.`);
    error.statusCode = 423;
    throw error;
  }

  // Verify password (support both bcrypt and argon2)
  let valid = false;
  const isBcrypt = auth.password.startsWith("$2b$") || auth.password.startsWith("$2a$");
  
  if (isBcrypt) {
    valid = await bcrypt.compare(password, auth.password);
    if (valid) {
      // Upgrade hash to argon2
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
    logSecurityEvent('FAILED_LOGIN', { phone, attempts: auth.failedLoginAttempts, ip: ipAddress });

    // Lock account after 5 failed attempts
    if (auth.failedLoginAttempts >= 5) {
      auth.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
      await auth.save();
      logSecurityEvent('ACCOUNT_LOCKED', { phone, reason: 'too_many_failed_attempts', ip: ipAddress });
      const error = new Error("Too many failed login attempts. Account locked for 30 minutes.");
      error.statusCode = 423;
      throw error;
    }

    await auth.save();
    throw new Error("Invalid credentials");
  }

  // Reset failed attempts on successful login
  auth.failedLoginAttempts = 0;
  auth.lockUntil = null;

  await autoLinkPhone(auth.phone);

  // Generate tokens
  const accessToken = jwt.sign(
    { id: auth._id, phone: auth.phone, role: auth.role, name: auth.name, type: 'access' },
    getJwtSecret(),
    { expiresIn: "15m" }
  );

  const refreshToken = jwt.sign(
    { id: auth._id, phone: auth.phone, type: 'refresh' },
    getJwtSecret(),
    { expiresIn: "7d" }
  );

  // Store refresh token
  const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  auth.refreshTokens = auth.refreshTokens || [];
  auth.refreshTokens.push({
    token: refreshToken,
    expiresAt: refreshTokenExpiry,
  });

  // Keep only 5 most recent tokens
  if (auth.refreshTokens.length > 5) {
    auth.refreshTokens = auth.refreshTokens.slice(-5);
  }

  await auth.save();

  return {
    accessToken,
    refreshToken,
    expiresIn: 900,
    role: auth.role,
    name: auth.name,
    phone: auth.phone
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken, ipAddress) {
  if (!refreshToken) {
    const error = new Error("Refresh token required");
    error.statusCode = 401;
    throw error;
  }

  // Verify refresh token
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, getJwtSecret());
  } catch (err) {
    const error = new Error("Invalid or expired refresh token");
    error.statusCode = 401;
    throw error;
  }

  // Check token type
  if (decoded.type !== 'refresh') {
    const error = new Error("Invalid token type");
    error.statusCode = 401;
    throw error;
  }

  // Find user
  const auth = await Auth.findById(decoded.id);
  if (!auth || !auth.isActive) {
    const error = new Error("Invalid refresh token");
    error.statusCode = 401;
    throw error;
  }

  // Check if refresh token exists
  const tokenRecord = auth.refreshTokens?.find(
    rt => rt.token === refreshToken && rt.expiresAt > Date.now()
  );

  if (!tokenRecord) {
    // Token reuse detected - revoke all tokens
    auth.refreshTokens = [];
    await auth.save();
    logSecurityEvent('REFRESH_TOKEN_REUSE', { 
      userId: auth._id, 
      phone: auth.phone, 
      ip: ipAddress 
    });
    const error = new Error("Invalid refresh token. Please login again.");
    error.statusCode = 401;
    throw error;
  }

  // Remove old refresh token (rotation)
  auth.refreshTokens = auth.refreshTokens.filter(rt => rt.token !== refreshToken);

  // Issue new tokens
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

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: 900
  };
}

/**
 * Logout user by revoking refresh token
 */
export async function logoutUser(refreshToken) {
  if (!refreshToken) {
    return { success: true, message: "Logged out" };
  }

  const decoded = jwt.decode(refreshToken);
  if (decoded?.id) {
    const auth = await Auth.findById(decoded.id);
    if (auth) {
      auth.refreshTokens = auth.refreshTokens?.filter(rt => rt.token !== refreshToken) || [];
      await auth.save();
    }
  }

  return { success: true, message: "Logged out successfully" };
}

/**
 * Send OTP for password reset
 */
export async function sendPasswordResetOTP(phone) {
  const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
  
  if (!/^[6-9]\d{9}$/.test(stripped)) {
    throw new Error("Enter a valid 10-digit Indian mobile number");
  }

  const auth = await Auth.findOne({ phone: { $in: [stripped, `91${stripped}`, phone] } });
  if (!auth) {
    throw new Error("No account found with this phone number.");
  }
  if (!auth.isActive) {
    const error = new Error("This account has been disabled. Contact your admin.");
    error.statusCode = 403;
    throw error;
  }

  const otp = generateOTP();
  
  auth.otp = otp;
  auth.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
  auth.otpAttempts = 0;
  await auth.save();
  
  await storeOTP(stripped, otp, "forgot");
  await sendSmsOTP(stripped, otp);

  return { success: true, message: `OTP sent to ${stripped.slice(0, 5)}XXXXX` };
}

/**
 * Verify OTP and get reset token
 */
export async function verifyPasswordResetOTP(phone, otp) {
  const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
  const stored = await getStoredOTP(stripped, "forgot");

  if (!stored) {
    throw new Error("OTP expired or not found. Request a new one.");
  }

  const auth = await Auth.findOne({ phone: { $in: [stripped, `91${stripped}`, phone] } });
  if (!auth) {
    throw new Error("Account not found");
  }

  if (!auth.otpExpiry || auth.otpExpiry < Date.now()) {
    await deleteOTP(stripped, "forgot");
    throw new Error("OTP has expired. Request a new one.");
  }

  if (auth.otpAttempts >= 3) {
    await deleteOTP(stripped, "forgot");
    const error = new Error("Too many incorrect attempts. Request a new OTP.");
    error.statusCode = 429;
    throw error;
  }

  if (stored !== String(otp).trim()) {
    auth.otpAttempts = (auth.otpAttempts || 0) + 1;
    await auth.save();
    throw new Error("Incorrect OTP");
  }

  // Clear OTP data
  auth.otp = null;
  auth.otpExpiry = null;
  auth.otpAttempts = 0;
  await auth.save();
  
  await deleteOTP(stripped, "forgot");

  // Issue reset token
  const resetToken = jwt.sign(
    { phone: stripped, purpose: "reset" }, 
    getJwtSecret(), 
    { expiresIn: "10m" }
  );

  return { success: true, resetToken };
}

/**
 * Reset password using reset token
 */
export async function resetPassword(resetToken, newPassword) {
  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  if (newPassword.length > 128) {
    throw new Error("Password too long");
  }

  // Full strength validation
  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.errors.join(". "));
  }

  let decoded;
  try {
    decoded = jwt.verify(resetToken, getJwtSecret());
  } catch {
    throw new Error("Reset link expired. Please start over.");
  }

  if (decoded.purpose !== "reset") {
    throw new Error("Invalid reset token");
  }

  const auth = await Auth.findOne({
    phone: { $in: [decoded.phone, `91${decoded.phone}`] },
  });

  if (!auth) {
    throw new Error("Account not found");
  }
  if (!auth.isActive) {
    const error = new Error("Account disabled");
    error.statusCode = 403;
    throw error;
  }

  auth.password = await argon2.hash(newPassword);
  await auth.save();

  return { success: true, message: "Password updated successfully. You can now log in." };
}
