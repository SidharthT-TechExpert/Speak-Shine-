/**
 * Authentication Service
 * Business logic for user authentication, registration, and password management
 */

import argon2 from "argon2";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt, randomUUID } from "crypto";
import Auth from "../../../models/authSchema.js";
import User from "../../../models/userSchema.js";
import PendingRegistration from "../../../models/pendingRegistrationSchema.js";
import { generateUniqueReferralCode, validateReferralCode } from "../referral/referralService.js";
import { getRedisClient, isRedisAvailable } from "../../config/redis.js";
import { validatePassword } from "../../utils/validationUtils.js";
import { findUserByPhone } from "../../utils/phoneUtils.js";
import { getISTStartOfDay } from "../../utils/dateUtils.js";
import { normalizeIndianPhone, phoneVariants } from "../../utils/phoneVariants.js";

const inFlightApprovals = new Set();

async function incrementOtpAttempts(phone, purpose, maxAttempts = 5) {
  const key = `otp:attempts:${purpose}:${phone}`;
  let attempts = 0;
  if (isRedisAvailable()) {
    const redis = getRedisClient();
    attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, OTP_TTL);
  } else {
    global._otpAttemptStore = global._otpAttemptStore || {};
    const entry = global._otpAttemptStore[key];
    if (!entry || entry.exp < Date.now()) {
      global._otpAttemptStore[key] = { count: 1, exp: Date.now() + OTP_TTL * 1000 };
      attempts = 1;
    } else {
      entry.count += 1;
      attempts = entry.count;
    }
  }
  if (attempts >= maxAttempts) {
    await deleteOTP(phone, purpose).catch(() => {});
    if (isRedisAvailable()) {
      await getRedisClient().del(key).catch(() => {});
    } else if (global._otpAttemptStore) {
      delete global._otpAttemptStore[key];
    }
    const err = new Error("Too many incorrect attempts. Request a new OTP.");
    err.statusCode = 429;
    throw err;
  }
  return attempts;
}

async function resetOtpAttempts(phone, purpose) {
  const key = `otp:attempts:${purpose}:${phone}`;
  if (isRedisAvailable()) {
    await getRedisClient().del(key).catch(() => {});
  } else if (global._otpAttemptStore) {
    delete global._otpAttemptStore[key];
  }
}

async function consumeVerifyTokenJti(jti) {
  if (!jti) return true; // legacy tokens without jti
  const key = `reg:jti:${jti}`;
  if (isRedisAvailable()) {
    const res = await getRedisClient().set(key, "1", "EX", 600, "NX");
    return res === "OK";
  }
  global._consumedRegJtis = global._consumedRegJtis || new Map();
  const now = Date.now();
  for (const [k, exp] of global._consumedRegJtis.entries()) {
    if (exp <= now) global._consumedRegJtis.delete(k);
  }
  if (global._consumedRegJtis.has(jti)) return false;
  global._consumedRegJtis.set(jti, now + 600_000);
  return true;
}

const OTP_TTL = 300; // 5 minutes
const TWO_FACTOR_KEY = process.env.TWO_FACTOR_API_KEY || null;

// Access token duration: 24 hours ("24h") default (configurable via JWT_ACCESS_EXPIRES)
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || "24h";
const ACCESS_EXPIRES_SECONDS = JWT_ACCESS_EXPIRES === "24h" ? 86400 : (JWT_ACCESS_EXPIRES === "15m" ? 900 : 86400);


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

// ── Per-phone OTP rate limiting ──────────────────────────────────────────────
// Max 3 OTPs per phone per hour — prevents targeted flooding
async function checkPhoneOtpRateLimit(phone) {
  const key = `otp:rate:${phone}`;
  if (isRedisAvailable()) {
    const redis = getRedisClient();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 3600); // 1 hour window
    if (count > 3) {
      const ttl = await redis.ttl(key);
      const mins = Math.ceil(ttl / 60);
      const error = new Error(`Too many OTP requests for this number. Try again in ${mins} minute${mins > 1 ? "s" : ""}.`);
      error.statusCode = 429;
      throw error;
    }
  } else {
    // In-memory fallback
    global._phoneOtpRate = global._phoneOtpRate || {};
    const entry = global._phoneOtpRate[phone];
    const now = Date.now();
    if (!entry || entry.exp < now) {
      global._phoneOtpRate[phone] = { count: 1, exp: now + 3600_000 };
    } else {
      entry.count++;
      if (entry.count > 3) {
        const mins = Math.ceil((entry.exp - now) / 60000);
        const error = new Error(`Too many OTP requests for this number. Try again in ${mins} minute${mins > 1 ? "s" : ""}.`);
        error.statusCode = 429;
        throw error;
      }
    }
  }
}

// ── WhatsApp daily cap — protect normal WA Business number from ban ───────────
// Max 20 WA OTPs per day total across all users
const WA_DAILY_CAP = 20;
const WA_COOLDOWN_SECONDS = 30; // min gap between WA messages to same number

async function checkWhatsAppOtpLimits(phone) {
  if (!isRedisAvailable()) return true; // skip in dev without Redis

  const redis = getRedisClient();
  const todayKey = `wa:otp:daily:${new Date().toISOString().slice(0, 10)}`;
  const cooldownKey = `wa:otp:cooldown:${phone}`;

  // Check cooldown for this specific number
  const onCooldown = await redis.get(cooldownKey);
  if (onCooldown) {
    const ttl = await redis.ttl(cooldownKey);
    const error = new Error(`Please wait ${ttl}s before requesting another OTP.`);
    error.statusCode = 429;
    throw error;
  }

  // Check daily global cap
  const dailyCount = await redis.incr(todayKey);
  if (dailyCount === 1) await redis.expire(todayKey, 86400);
  if (dailyCount > WA_DAILY_CAP) {
    console.warn(`[OTP] ⚠️ WhatsApp daily cap reached (${dailyCount}). Falling back to SMS.`);
    return false; // signal: skip WA, use SMS
  }

  // Set cooldown for this number
  await redis.set(cooldownKey, "1", "EX", WA_COOLDOWN_SECONDS);
  return true; // WA is allowed
}

async function sendSmsOTP(phone, otp) {
  // Log OTP only in non-production environments
  if (process.env.NODE_ENV !== "production") {
    console.log("\n=======================================================");
    console.log(`📱 [OTP] AUTH / REGISTRATION OTP`);
    console.log(`📞 Phone: +91 ${phone}`);
    console.log(`🔑 OTP CODE: ${otp}`);
    console.log("=======================================================\n");
  }

  // ── Try WhatsApp first if connected + within limits ──────────────────────
  try {
    const { getStatus, sendAdminDirectMessage } = await import("../whatsapp/whatsappService.js");
    const waStatus = getStatus();
    if (waStatus?.isConnected) {
      const waAllowed = await checkWhatsAppOtpLimits(phone).catch(() => false);
      if (waAllowed) {
        const waMessage =
          `🔐 *Speak & Shine OTP*\n\n` +
          `Your verification code is:\n\n` +
          `*${otp}*\n\n` +
          `⏱ Valid for 5 minutes. Do not share this with anyone.`;
        const result = await sendAdminDirectMessage(waMessage, { phone });
        if (result?.success) {
          console.log(`[OTP] ✅ Sent via WhatsApp to ${phone}`);
          return { sent: true, channel: "whatsapp" };
        }
      }
      console.warn(`[OTP] WhatsApp unavailable/capped, falling back to SMS`);
    }
  } catch (waErr) {
    console.warn(`[OTP] WhatsApp error, falling back to SMS:`, waErr.message);
  }

  // ── Fallback: 2Factor SMS ────────────────────────────────────────────────
  if (!TWO_FACTOR_KEY) {
    if (process.env.NODE_ENV !== "production") {
      return { sent: true, channel: "sms" };
    }
    console.error("[OTP] TWO_FACTOR_API_KEY not configured and WhatsApp delivery unavailable.");
    return { sent: false, channel: "sms" };
  }

  try {
    const stripped = normalizeIndianPhone(String(phone));
    const { default: fetch } = await import("node-fetch");
    const url = `https://2factor.in/API/V1/${TWO_FACTOR_KEY}/SMS/${stripped}/${otp}/OTP1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.Status !== "Success") {
      console.warn(`[OTP] 2Factor SMS response:`, data);
      if (process.env.NODE_ENV !== "production") return { sent: true, channel: "sms" };
      return { sent: false, channel: "sms" };
    }
    return { sent: true, channel: "sms" };
  } catch (err) {
    console.error(`[OTP] 2Factor SMS error:`, err.message);
    if (process.env.NODE_ENV !== "production") return { sent: true, channel: "sms" };
    return { sent: false, channel: "sms" };
  }
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

// Fixed argon2 hash used to equalize login response time when no account
// exists. Verifying against it costs the same as a real password check, so an
// attacker cannot distinguish "wrong password" from "no such account" by
// timing the response (account enumeration). Generated once, lazily.
let _dummyHash = null;
async function getDummyHash() {
  if (!_dummyHash) {
    _dummyHash = await argon2.hash("timing-attack-placeholder-password");
  }
  return _dummyHash;
}

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
    // Burn the same time a real password verification would take, so the
    // "no account" path is not detectably faster than "wrong password".
    await argon2.verify(await getDummyHash(), password).catch(() => false);
    // Check if there's a pending registration for this phone
    const pending = await PendingRegistration.findOne({
      phone: { $in: [stripped, phone] }
    });
    if (pending) {
      const error = new Error("Your registration is awaiting admin approval. You'll be notified once approved.");
      error.statusCode = 403;
      error.code = "PENDING_APPROVAL";
      throw error;
    }
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

  // Lock window has elapsed — clear stale lockout state so the user gets a
  // fresh set of attempts instead of being re-locked on the first wrong try.
  if (auth.lockUntil && auth.lockUntil <= Date.now()) {
    auth.failedLoginAttempts = 0;
    auth.lockUntil = null;
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
  // Keep the JWT payload minimal: id + role only. PII (phone/name) is resolved
  // server-side from the DB so it never travels inside the token.
  const accessToken = jwt.sign(
    { id: auth._id, role: auth.role, type: 'access' },
    getJwtSecret(),
    { expiresIn: JWT_ACCESS_EXPIRES }
  );

  const refreshToken = jwt.sign(
    { id: auth._id, type: 'refresh', jti: randomUUID() },
    getJwtSecret(),
    { expiresIn: "30d" }
  );

  // Store refresh token (30 days)
  const refreshTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  auth.refreshTokens = auth.refreshTokens || [];
  auth.refreshTokens.push({
    token: refreshToken,
    expiresAt: refreshTokenExpiry,
  });

  // Keep up to 15 most recent tokens
  if (auth.refreshTokens.length > 15) {
    auth.refreshTokens = auth.refreshTokens.slice(-15);
  }

  await auth.save();

  // Fetch paid status from User tracking document
  let paid = false;
  try {
    const userDoc = await findUserByPhone(auth.phone);
    paid = userDoc?.paid ?? false;
  } catch { /* non-critical — default false */ }

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_EXPIRES_SECONDS,
    role: auth.role,
    name: auth.name,
    phone: auth.phone,
    paid,
    theme: auth.theme || "dark",
    isDark: auth.isDark ?? (auth.theme !== "light"),
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
  let auth;
  try {
    auth = await Auth.findById(decoded.id);
  } catch {
    const error = new Error("Invalid refresh token");
    error.statusCode = 401;
    throw error;
  }
  if (!auth || !auth.isActive) {
    const error = new Error("Invalid refresh token");
    error.statusCode = 401;
    throw error;
  }

  // 1. Check if token is an active (unrotated) valid token
  const tokenRecord = auth.refreshTokens?.find(
    rt => rt.token === refreshToken && rt.expiresAt > Date.now() && !rt.rotatedAt
  );

  if (!tokenRecord) {
    // 2. Check if this token was recently rotated within a 60-second grace window
    // (Protects against concurrent requests, network retries, and server restarts)
    const recentlyRotated = auth.refreshTokens?.find(
      rt => rt.token === refreshToken && rt.rotatedAt && (Date.now() - new Date(rt.rotatedAt).getTime() < 60_000)
    );

    if (recentlyRotated) {
      const activeRt = auth.refreshTokens?.find(rt => rt.token === recentlyRotated.replacedBy && !rt.rotatedAt)
        || auth.refreshTokens?.find(rt => !rt.rotatedAt && rt.expiresAt > Date.now());

      const fallbackRt = activeRt ? activeRt.token : refreshToken;
      const newAccessToken = jwt.sign(
        { id: auth._id, role: auth.role, type: 'access' },
        getJwtSecret(),
        { expiresIn: JWT_ACCESS_EXPIRES }
      );

      return {
        accessToken: newAccessToken,
        refreshToken: fallbackRt,
        expiresIn: ACCESS_EXPIRES_SECONDS,
      };
    }

    // Truly invalid or reused beyond the 60s grace window
    const oldRotated = auth.refreshTokens?.find(rt => rt.token === refreshToken && rt.rotatedAt);
    if (oldRotated) {
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

    const error = new Error("Invalid refresh token");
    error.statusCode = 401;
    throw error;
  }

  // Issue new tokens
  const newAccessToken = jwt.sign(
    { id: auth._id, role: auth.role, type: 'access' },
    getJwtSecret(),
    { expiresIn: JWT_ACCESS_EXPIRES }
  );

  const newRefreshToken = jwt.sign(
    { id: auth._id, type: 'refresh', jti: randomUUID() },
    getJwtSecret(),
    { expiresIn: "30d" }
  );

  // Mark old token as rotated with timestamp and pointer to replacement
  tokenRecord.rotatedAt = new Date();
  tokenRecord.replacedBy = newRefreshToken;

  // Store new refresh token (30 days)
  const refreshTokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  auth.refreshTokens.push({
    token: newRefreshToken,
    expiresAt: refreshTokenExpiry,
  });

  // Clean up tokens that are expired or rotated more than 5 minutes ago
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  auth.refreshTokens = auth.refreshTokens.filter(rt => {
    if (rt.expiresAt <= Date.now()) return false;
    if (rt.rotatedAt && new Date(rt.rotatedAt).getTime() < fiveMinAgo) return false;
    return true;
  });

  // Keep up to 15 recent tokens
  if (auth.refreshTokens.length > 15) {
    auth.refreshTokens = auth.refreshTokens.slice(-15);
  }

  await auth.save();

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_EXPIRES_SECONDS,
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

  // Per-phone rate limit: max 3 OTPs per hour per number
  await checkPhoneOtpRateLimit(stripped);

  const auth = await Auth.findOne({ phone: { $in: [stripped, `91${stripped}`, phone] } });
  if (!auth) {
    // Silent success — don't leak whether number exists (security)
    return { success: true, message: "If this number is registered, an OTP has been sent." };
  }
  if (!auth.isActive) {
    const error = new Error("This account has been disabled. Contact your admin.");
    error.statusCode = 403;
    throw error;
  }

  const isLocal = process.env.NODE_ENV !== "production";

  // In local/dev mode: skip SMS and use master OTP 112233
  if (isLocal) {
    auth.otp = "112233";
    auth.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    auth.otpAttempts = 0;
    await auth.save();
    await storeOTP(stripped, "112233", "forgot");
    console.log(`\n=======================================================`);
    console.log(`📱 [Local Dev Forgot-Password] SMS sending skipped for ${stripped}`);
    console.log(`🔑 Master OTP allowed: 112233`);
    console.log(`=======================================================\n`);
    return {
      success: true,
      message: "Local mode: Use OTP 112233",
      devOtp: "112233",
    };
  }

  const otp = generateOTP();
  
  auth.otp = otp;
  auth.otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
  auth.otpAttempts = 0;
  await auth.save();
  
  await storeOTP(stripped, otp, "forgot");
  const sent = await sendSmsOTP(stripped, otp);

  if (!sent?.sent) {
    await deleteOTP(stripped, "forgot").catch(() => {});
    throw new Error("Failed to send OTP. Please try again.");
  }

  return { success: true, message: `OTP sent to ${stripped.slice(0, 5)}XXXXX` };
}

/**
 * Verify OTP and get reset token
 */
export async function verifyPasswordResetOTP(phone, otp) {
  const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
  const trimmedOtp = String(otp).trim();
  const isLocal = process.env.NODE_ENV !== "production";

  // In local/dev mode, always allow master OTP 112233
  if (isLocal && trimmedOtp === "112233") {
    // Verify there is a matching auth account
    const auth = await Auth.findOne({ phone: { $in: [stripped, `91${stripped}`, phone] } });
    if (!auth) throw new Error("Account not found");
    // Clear any stored OTP
    auth.otp = null;
    auth.otpExpiry = null;
    auth.otpAttempts = 0;
    await auth.save();
    await deleteOTP(stripped, "forgot").catch(() => {});
    const resetToken = jwt.sign(
      { phone: stripped, purpose: "reset" },
      getJwtSecret(),
      { expiresIn: "10m" }
    );
    return { success: true, resetToken };
  }

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

  if (stored !== trimmedOtp) {
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

// ── Registration Flow ────────────────────────────────────────────────────────

const DAILY_REGISTRATION_LIMIT = parseInt(process.env.MAX_DAILY_REGISTRATIONS || "30", 10);

/**
 * Step 1 — Send OTP to phone for registration (SMS only, never voice)
 */
export async function sendRegistrationOTP(phone) {
  if (typeof phone !== "string") {
    throw new Error("Enter a valid 10-digit Indian mobile number");
  }
  const stripped = normalizeIndianPhone(phone.trim());

  if (!/^[6-9]\d{9}$/.test(stripped)) {
    throw new Error("Enter a valid 10-digit Indian mobile number");
  }

  // Per-phone rate limit: max 3 OTPs per hour per number
  await checkPhoneOtpRateLimit(stripped);

  // Block if already a full account
  const existing = await Auth.findOne({ phone: { $in: phoneVariants(stripped) } });
  if (existing) {
    throw new Error("An account with this number already exists. Please log in.");
  }

  const isLocal = process.env.NODE_ENV !== "production";

  // Enforce daily registration limit in production using true IST midnight
  if (!isLocal) {
    const midnightIST = getISTStartOfDay();
    const todayCount = await PendingRegistration.countDocuments({ createdAt: { $gte: midnightIST } });
    if (todayCount >= DAILY_REGISTRATION_LIMIT) {
      const error = new Error(`Registration is full for today (${DAILY_REGISTRATION_LIMIT} slots). New slots open at midnight. Try again tomorrow!`);
      error.statusCode = 429;
      error.code = "DAILY_LIMIT_REACHED";
      throw error;
    }
  }

  await resetOtpAttempts(stripped, "register");

  // In local mode, skip SMS sending and store master OTP 112233
  if (isLocal) {
    await storeOTP(stripped, "112233", "register");
    console.log(`\n=======================================================`);
    console.log(`📱 [Local Dev Registration] SMS sending skipped for ${stripped}`);
    console.log(`🔑 Master OTP allowed: 112233`);
    console.log(`=======================================================\n`);
    return {
      success: true,
      message: "Local mode: Use OTP 112233",
      devOtp: "112233",
      channel: "sms",
    };
  }

  const otp = generateOTP();
  await storeOTP(stripped, otp, "register");
  const sent = await sendSmsOTP(stripped, otp);

  if (!sent?.sent) {
    await deleteOTP(stripped, "register").catch(() => {});
    throw new Error("Failed to send OTP. Please try again.");
  }

  return {
    success: true,
    message: `OTP sent to +91 ${stripped.slice(0, 5)}XXXXX`,
    channel: sent.channel || "sms",
  };
}

/**
 * Step 2 — Verify OTP, return a short-lived single-use verifyToken
 */
export async function verifyRegistrationOTP(phone, otp) {
  if (typeof phone !== "string" || (typeof otp !== "string" && typeof otp !== "number")) {
    throw new Error("Phone and OTP are required");
  }
  const stripped = normalizeIndianPhone(phone.trim());
  if (!/^[6-9]\d{9}$/.test(stripped)) {
    throw new Error("Enter a valid 10-digit Indian mobile number");
  }
  const trimmedOtp = String(otp).trim();
  const isLocal = process.env.NODE_ENV !== "production";

  // In local mode, allow 112233 unconditionally
  if (isLocal && trimmedOtp === "112233") {
    await deleteOTP(stripped, "register").catch(() => {});
    await resetOtpAttempts(stripped, "register");
    const verifyToken = jwt.sign(
      { phone: stripped, purpose: "register", jti: randomUUID() },
      getJwtSecret(),
      { expiresIn: "10m" }
    );
    return { success: true, verifyToken };
  }

  const stored = await getStoredOTP(stripped, "register");

  if (!stored) {
    throw new Error("OTP expired or not found. Request a new one.");
  }
  if (stored !== trimmedOtp) {
    await incrementOtpAttempts(stripped, "register", 5);
    throw new Error("Incorrect OTP. Please try again.");
  }

  await deleteOTP(stripped, "register");
  await resetOtpAttempts(stripped, "register");

  const verifyToken = jwt.sign(
    { phone: stripped, purpose: "register", jti: randomUUID() },
    getJwtSecret(),
    { expiresIn: "10m" }
  );

  return { success: true, verifyToken };
}

/**
 * Step 3 — Submit registration details → stored as PendingRegistration
 * Admin must approve before the user can log in.
 */
export async function submitRegistration(verifyToken, name, password, referralCode = null) {
  // Validate token
  let decoded;
  try {
    decoded = jwt.verify(verifyToken, getJwtSecret());
  } catch {
    throw new Error("Verification expired. Please start over.");
  }
  if (decoded.purpose !== "register") {
    throw new Error("Invalid verification token.");
  }

  const phone = decoded.phone;

  // Validate inputs
  if (typeof name !== "string" || name.trim().length < 2) {
    throw new Error("Name must be at least 2 characters.");
  }
  if (typeof password !== "string" || password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
  if (password.length > 128) {
    throw new Error("Password too long (max 128 characters).");
  }

  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.errors.join(". "));
  }

  // Block duplicates before consuming token
  const existing = await Auth.findOne({ phone: { $in: phoneVariants(phone) } });
  if (existing) {
    throw new Error("An account with this number already exists.");
  }

  // Validate referral code if provided & guard against self-referral
  let validReferralCode = null;
  let referrerName = null;
  if (referralCode && typeof referralCode === "string" && referralCode.trim()) {
    const cleanCode = referralCode.trim();
    const inviter = await User.findOne({
      referralCode: { $regex: new RegExp(`^${cleanCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    }).select("_id name phone referralCode").lean();
    if (!inviter) {
      throw new Error("Invalid referral code. Please check the code or leave it blank.");
    }
    const existingWaUser = await User.findOne({ phone: { $in: phoneVariants(phone) } }).select("_id").lean();
    const inviterNorm = normalizeIndianPhone(String(inviter.phone || ""));
    if ((existingWaUser && String(existingWaUser._id) === String(inviter._id)) || (inviterNorm && inviterNorm === normalizeIndianPhone(String(phone)))) {
      throw new Error("You cannot use your own referral code.");
    }
    validReferralCode = inviter.referralCode;
    referrerName = inviter.name || null;
  }

  // Enforce single-use verifyToken
  const freshToken = await consumeVerifyTokenJti(decoded.jti);
  if (!freshToken) {
    throw new Error("Verification session already used. Please request a new OTP.");
  }

  // Upsert pending registration (replace if they re-registered)
  const hashed = await argon2.hash(password);
  await PendingRegistration.findOneAndUpdate(
    { phone },
    {
      phone,
      name: name.trim(),
      password: hashed,
      referralCode: validReferralCode,
      referrerName: referrerName,
      createdAt: new Date(),
    },
    { upsert: true, new: true }
  );

  // Notify admin via WhatsApp on configured personal number (non-blocking)
  try {
    const rawDigits = String(phone).replace(/\D/g, "");
    const cleanDisplayPhone = rawDigits.length === 10 ? `+91 ${rawDigits}` : `+${rawDigits}`;
    const timeStr = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const alertLines = [
      `🎉 *New Student Registration Received*`,
      ``,
      `👤 *Name:* ${name.trim()}`,
      `📱 *Phone:* ${cleanDisplayPhone}`,
    ];
    if (referrerName) {
      alertLines.push(`🤝 *Referred By:* ${referrerName}`);
    } else if (validReferralCode) {
      alertLines.push(`🎟️ *Referral Code:* ${validReferralCode}`);
    }
    alertLines.push(`⏰ *Time:* ${timeStr}`);
    alertLines.push(``);
    alertLines.push(`👉 Review & approve in Admin Dashboard (Registrations tab).`);

    const alertMsg = alertLines.join("\n");

    import("../whatsapp/whatsappService.js")
      .then(({ sendAdminDirectMessage }) => sendAdminDirectMessage(alertMsg))
      .then((res) => {
        if (res?.success) {
          console.log(`[Auth] 📲 Admin WhatsApp notification sent for new registration: ${name.trim()} (${cleanDisplayPhone})`);
        } else {
          console.log(`[Auth] ℹ️ WhatsApp notification skipped/failed: ${res?.message || "unknown"}`);
        }
      })
      .catch((waErr) => {
        console.warn("[Auth] Failed to send WhatsApp alert for new registration:", waErr?.message || waErr);
      });
  } catch (notifyErr) {
    console.warn("[Auth] Error preparing registration WhatsApp alert:", notifyErr?.message || notifyErr);
  }

  return {
    success: true,
    message: "Registration submitted! An admin will review and approve your account shortly.",
  };
}



/**
 * Admin — list all pending registrations
 */
export async function listPendingRegistrations() {
  const pending = await PendingRegistration.find().sort({ createdAt: -1 }).lean();

  // For any pending records missing stored referrerName, decode from User collection
  const unresolvedCodes = [...new Set(pending.filter(p => p.referralCode && !p.referrerName).map(p => p.referralCode))];
  let fallbackMap = new Map();
  if (unresolvedCodes.length > 0) {
    try {
      const inviters = await User.find({ referralCode: { $in: unresolvedCodes } }).select("name referralCode").lean();
      fallbackMap = new Map(inviters.map(u => [u.referralCode, u.name]));
    } catch {}
  }
  return pending.map(p => ({
    id: p._id,
    phone: p.phone,
    name: p.name,
    referralCode: p.referralCode || null,
    referrerName: p.referrerName || (p.referralCode ? fallbackMap.get(p.referralCode) : null) || null,
    createdAt: p.createdAt,

  }));
}

/**
 * Admin — approve a pending registration → creates Auth + User records
 */
export async function approvePendingRegistration(pendingId) {
  const lockKey = String(pendingId);
  if (inFlightApprovals.has(lockKey)) {
    const err = new Error("Approval is already being processed for this registration.");
    err.statusCode = 409;
    throw err;
  }
  inFlightApprovals.add(lockKey);

  try {
    const pending = await PendingRegistration.findById(pendingId);
    if (!pending) {
      const err = new Error("Pending registration not found or already processed.");
      err.statusCode = 404;
      throw err;
    }

    const stripped = normalizeIndianPhone(pending.phone);
    // Check not already approved
    const existing = await Auth.findOne({ phone: { $in: phoneVariants(stripped) } });
    if (existing) {
      await PendingRegistration.findByIdAndDelete(pendingId);
      throw new Error("An account with this phone already exists.");
    }

    // Locate any pre-existing WhatsApp User record before Auth.create so userId links cleanly
    let waUser = await User.findOne({ phone: { $in: phoneVariants(stripped) } });
    if (!waUser) {
      waUser = await User.findOne({ userId: new RegExp(`^(91)?${stripped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(@|:|$)`) });
    }

    const targetUserId = waUser?.userId || `web:${stripped}`;

    // Resolve referrer if pending had a valid referralCode (block self-referral)
    let referrerDoc = null;
    let referredBy = null;
    let referredByCode = null;
    if (pending.referralCode) {
      const referrer = await User.findOne({ referralCode: pending.referralCode.trim().toUpperCase() });
      const isSelfReferral = referrer && (
        (waUser && String(waUser._id) === String(referrer._id)) ||
        normalizeIndianPhone(String(referrer.phone || "")) === stripped
      );
      if (referrer && !isSelfReferral) {
        referrerDoc = referrer;
        referredBy = referrer._id;
        referredByCode = referrer.referralCode;
      }
    }

    const newUserReferralCode = await generateUniqueReferralCode(pending.name);
    let newlyLinkedReferral = false;

    if (!waUser) {
      await User.create({
        userId: targetUserId,
        name: pending.name,
        phone: stripped,
        fine: 0,
        completed: false,
        streak: 0,
        weeklySubmissions: 0,
        weeklyFine: 0,
        monthlySubmissions: 0,
        feedbackScores: [],
        referralCode: newUserReferralCode,
        referredBy,
        referredByCode,
      });
      newlyLinkedReferral = Boolean(referredBy);
    } else {
      const updates = {};
      if (!waUser.name) updates.name = pending.name;
      if (!waUser.phone) updates.phone = stripped;
      if (!waUser.referralCode) updates.referralCode = newUserReferralCode;
      if (!waUser.referredBy && referredBy) {
        updates.referredBy = referredBy;
        updates.referredByCode = referredByCode;
        newlyLinkedReferral = true;
      }
      if (Object.keys(updates).length > 0) {
        await User.updateOne({ _id: waUser._id }, { $set: updates });
      }
    }

    await Auth.create({
      phone: stripped,
      name: pending.name,
      password: pending.password,
      userId: targetUserId,
      role: "user",
      isActive: true,
    });

    if (referrerDoc && newlyLinkedReferral) {
      referrerDoc.referralCount = await User.countDocuments({ referredBy: referrerDoc._id });
      await referrerDoc.save();
      console.log(`[Referral] User ${stripped} linked to referrer ${referrerDoc.phone} (${referrerDoc.referralCode})`);
    }

    await PendingRegistration.findByIdAndDelete(pendingId);

    console.log(`[Auth] Approved registration for ${pending.name} (${stripped})`);
    return { success: true, message: `${pending.name} approved. They can now log in.` };
  } finally {
    inFlightApprovals.delete(lockKey);
  }
}

/**
 * Admin — reject a pending registration
 */
export async function rejectPendingRegistration(pendingId) {
  const pending = await PendingRegistration.findByIdAndDelete(pendingId);
  if (!pending) {
    throw new Error("Pending registration not found.");
  }
  console.log(`[Auth] Rejected registration for ${pending.name} (${pending.phone})`);
  return { success: true, message: `Registration for ${pending.name} rejected.` };
}
