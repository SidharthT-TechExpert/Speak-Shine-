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
import PendingRegistration from "../../../models/pendingRegistrationSchema.js";
import { getRedisClient, isRedisAvailable } from "../../config/redis.js";
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

// ── Registration Flow ────────────────────────────────────────────────────────

/**
 * Step 1 — Send OTP to phone for registration (SMS only, never voice)
 */
export async function sendRegistrationOTP(phone) {
  const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");

  if (!/^[6-9]\d{9}$/.test(stripped)) {
    throw new Error("Enter a valid 10-digit Indian mobile number");
  }

  // Block if already a full account
  const existing = await Auth.findOne({ phone: { $in: [stripped, `91${stripped}`] } });
  if (existing) {
    throw new Error("An account with this number already exists. Please log in.");
  }

  const otp = generateOTP();
  await storeOTP(stripped, otp, "register");
  const sent = await sendSmsOTP(stripped, otp);

  if (!sent) {
    throw new Error("Failed to send OTP. Please try again.");
  }

  return { success: true, message: `OTP sent to +91 ${stripped.slice(0, 5)}XXXXX` };
}

/**
 * Step 2 — Verify OTP, return a short-lived verifyToken
 */
export async function verifyRegistrationOTP(phone, otp) {
  const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
  const stored = await getStoredOTP(stripped, "register");

  if (!stored) {
    throw new Error("OTP expired or not found. Request a new one.");
  }
  if (stored !== String(otp).trim()) {
    throw new Error("Incorrect OTP. Please try again.");
  }

  await deleteOTP(stripped, "register");

  const verifyToken = jwt.sign(
    { phone: stripped, purpose: "register" },
    getJwtSecret(),
    { expiresIn: "10m" }
  );

  return { success: true, verifyToken };
}

/**
 * Step 3 — Submit registration details → stored as PendingRegistration
 * Admin must approve before the user can log in.
 */
export async function submitRegistration(verifyToken, name, password) {
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
  if (!name || name.trim().length < 2) {
    throw new Error("Name must be at least 2 characters.");
  }
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.errors.join(". "));
  }

  // Block duplicates
  const existing = await Auth.findOne({ phone: { $in: [phone, `91${phone}`] } });
  if (existing) {
    throw new Error("An account with this number already exists.");
  }

  // Upsert pending registration (replace if they re-registered)
  const hashed = await argon2.hash(password);
  await PendingRegistration.findOneAndUpdate(
    { phone },
    { phone, name: name.trim(), password: hashed, createdAt: new Date() },
    { upsert: true, new: true }
  );

  return {
    success: true,
    message: "Registration submitted! An admin will review and approve your account within 24 hours.",
  };
}

/**
 * Admin — list all pending registrations
 */
export async function listPendingRegistrations() {
  const pending = await PendingRegistration.find().sort({ createdAt: -1 }).lean();
  return pending.map(p => ({
    id: p._id,
    phone: p.phone,
    name: p.name,
    createdAt: p.createdAt,
    expiresAt: new Date(new Date(p.createdAt).getTime() + 24 * 60 * 60 * 1000),
  }));
}

/**
 * Admin — approve a pending registration → creates Auth + User records
 */
export async function approvePendingRegistration(pendingId) {
  const pending = await PendingRegistration.findById(pendingId);
  if (!pending) {
    throw new Error("Pending registration not found or already processed.");
  }

  // Check not already approved
  const existing = await Auth.findOne({ phone: { $in: [pending.phone, `91${pending.phone}`] } });
  if (existing) {
    await PendingRegistration.findByIdAndDelete(pendingId);
    throw new Error("An account with this phone already exists.");
  }

  // Create the Auth record
  await Auth.create({
    phone: pending.phone,
    name: pending.name,
    password: pending.password,
    role: "user",
    isActive: true,
  });

  // Create the User tracking record (same as admin-create flow for role "user")
  // Try to link to an existing WhatsApp user first
  const stripped = pending.phone;
  let waUser = await User.findOne({ phone: { $in: [stripped, `91${stripped}`] } });
  if (!waUser) {
    // Try matching by userId JID pattern
    waUser = await User.findOne({ userId: new RegExp(stripped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  }

  if (!waUser) {
    // No existing WhatsApp record — create a fresh User document
    await User.create({
      userId: `web:${stripped}`,
      name: pending.name,
      phone: stripped,
      fine: 0,
      completed: false,
      streak: 0,
      weeklySubmissions: 0,
      weeklyFine: 0,
      monthlySubmissions: 0,
      feedbackScores: [],
    });
  } else {
    // Sync name/phone to existing WhatsApp user if missing
    const updates = {};
    if (!waUser.name) updates.name = pending.name;
    if (!waUser.phone) updates.phone = stripped;
    if (Object.keys(updates).length > 0) {
      await User.updateOne({ _id: waUser._id }, { $set: updates });
    }
  }

  // Remove from pending
  await PendingRegistration.findByIdAndDelete(pendingId);

  console.log(`[Auth] Approved registration for ${pending.name} (${pending.phone})`);
  return { success: true, message: `${pending.name} approved. They can now log in.` };
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
