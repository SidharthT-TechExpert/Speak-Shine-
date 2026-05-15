/**
 * User Service
 * Business logic for user management
 */

import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { randomInt } from "crypto";
import User from "../../../models/userSchema.js";
import Auth from "../../../models/authSchema.js";
import Status from "../../../models/statusSchema.js";
import { getRedisClient, isRedisAvailable } from "../../config/redis.js";
import { escapeRegex } from "../../utils/phoneUtils.js";
import { validatePassword } from "../../utils/validationUtils.js";

const TWO_FACTOR_KEY = process.env.TWO_FACTOR_API_KEY || null;
const OTP_TTL = 300; // 5 minutes

// JWT Secret helper
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

// ── OTP Management ───────────────────────────────────────────────────────────
function adminOtpKey(phone) { 
  return `otp:admin-action:${phone}`; 
}

function generateOTP() { 
  return String(randomInt(100000, 1000000)); 
}

async function storeAdminOTP(phone, otp) {
  if (isRedisAvailable()) {
    await getRedisClient().set(adminOtpKey(phone), otp, "EX", OTP_TTL);
  } else {
    global._otpStore = global._otpStore || {};
    global._otpStore[adminOtpKey(phone)] = { otp, exp: Date.now() + OTP_TTL * 1000 };
  }
}

async function getAdminOTP(phone) {
  if (isRedisAvailable()) {
    return await getRedisClient().get(adminOtpKey(phone));
  }
  const entry = global._otpStore?.[adminOtpKey(phone)];
  return entry && entry.exp > Date.now() ? entry.otp : null;
}

async function deleteAdminOTP(phone) {
  if (isRedisAvailable()) {
    await getRedisClient().del(adminOtpKey(phone));
  } else {
    delete global._otpStore?.[adminOtpKey(phone)];
  }
}

async function sendSmsOTP(phone, otp) {
  if (!TWO_FACTOR_KEY) {
    console.log(`[UserService] DEV MODE — OTP for ${phone}: ${otp}`);
    return true;
  }
  const stripped = phone.replace(/^(\+91|91)/, "");
  const { default: fetch } = await import("node-fetch");
  const url = `https://2factor.in/API/V1/${TWO_FACTOR_KEY}/SMS/${stripped}/${otp}/OTP1`;
  const res = await fetch(url);
  const data = await res.json();
  return data.Status === "Success";
}

// ── User Management Services ─────────────────────────────────────────────────

/**
 * Get all users with auth info (admin/trainer)
 * Merges User collection (tracking data) with Auth collection (credentials/role).
 * Handles both WhatsApp users (userId like "91xxx@s.whatsapp.net") and
 * web-only users (userId like "web:STRIPPED_PHONE").
 */
export async function getAllUsers() {
  const users = await User.find().lean();
  const auths = await Auth.find().lean();

  // Build lookup maps for fast joining
  const authByPhone = {};
  auths.forEach(a => { authByPhone[a.phone] = a; });

  const result = users.map(u => {
    // Derive the canonical phone from the User document
    let phone = u.phone;
    if (!phone && u.userId) {
      // WhatsApp format: "918848096746@s.whatsapp.net" or "918848096746:12@s.whatsapp.net"
      phone = u.userId.split("@")[0].split(":")[0];
    }
    const stripped = phone ? phone.replace(/^(\+91|91)/, "") : null;

    // Try to find auth by exact phone, then stripped
    const auth = authByPhone[phone] || authByPhone[stripped] || {};

    return {
      ...u,
      phone: stripped || phone,
      role: auth.role || "user",
      isActive: auth.isActive ?? true,
      registeredName: auth.name || u.name,
    };
  });

  return result;
}

/**
 * Get current user's profile
 */
export async function getUserProfile(userId) {
  const auth = await Auth.findById(userId).lean();
  if (!auth) {
    const error = new Error("Not found");
    error.statusCode = 404;
    throw error;
  }

  const user = await User.findOne({ phone: auth.phone }).lean();
  return { auth, user: user || null };
}

/**
 * Get single user by phone
 */
export async function getUserByPhone(phone) {
  // Try to find by phone field first
  let user = await User.findOne({ phone }).lean();
  
  // If not found, try to find by userId pattern (WhatsApp format)
  if (!user) {
    user = await User.findOne({ 
      userId: { $regex: `^${escapeRegex(phone)}(@|:)` } 
    }).lean();
  }
  
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  return user;
}

/**
 * Update user role
 */
export async function updateUserRole(phone, role) {
  if (!["user", "trainer", "admin", "viewer"].includes(role)) {
    const error = new Error("Invalid role");
    error.statusCode = 400;
    throw error;
  }
  
  const auth = await Auth.findOneAndUpdate(
    { phone }, 
    { role }, 
    { new: true }
  );
  
  if (!auth) {
    const error = new Error("Auth record not found");
    error.statusCode = 404;
    throw error;
  }
  
  return { success: true, role: auth.role };
}

/**
 * Toggle user active status
 * When disabling: revoke all refresh tokens so the user is forced out immediately,
 * and push a real-time force:logout event via Socket.io if they are online.
 * When re-enabling: reset consecutiveSkips so they don't get auto-disabled again immediately.
 */
export async function toggleUserStatus(phone) {
  const auth = await Auth.findOne({ phone });
  if (!auth) {
    const error = new Error("Not found");
    error.statusCode = 404;
    throw error;
  }
  
  auth.isActive = !auth.isActive;

  if (!auth.isActive) {
    // Revoke all refresh tokens — next token refresh will fail
    auth.refreshTokens = [];
    console.log(`[UserService] Revoked all tokens for disabled user: ${phone}`);

    // Push real-time logout to the user's active socket (if connected)
    const { forceLogoutUser } = await import("../../sockets/chatSocket.js");
    forceLogoutUser(phone);
  } else {
    // Re-enabling: reset the consecutive skip counter so they start fresh
    await User.updateOne(
      { phone: { $in: [phone, phone.replace(/^(\+91|91)/, "")] } },
      { $set: { consecutiveSkips: 0 } }
    );
    console.log(`[UserService] Re-enabled user ${phone} — consecutiveSkips reset`);
  }

  await auth.save();
  
  return { success: true, isActive: auth.isActive };
}

/**
 * Toggle user's submission status for today
 */
export async function toggleSubmissionStatus(phone) {
  // Try to find by phone field first
  let user = await User.findOne({ phone });
  
  // If not found, try to find by userId pattern (WhatsApp format)
  if (!user) {
    user = await User.findOne({ 
      userId: { $regex: `^${escapeRegex(phone)}(@|:)` } 
    });
  }
  
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  user.completed = !user.completed;
  await user.save();
  
  return { success: true, completed: user.completed };
}

/**
 * Delete user
 */
export async function deleteUser(phone) {
  await Auth.deleteOne({ phone });
  return { success: true };
}

/**
 * Adjust user fine
 */
export async function adjustUserFine(phone, amount) {
  // Try to find by phone field first
  let user = await User.findOne({ phone });
  
  // If not found, try to find by userId pattern (WhatsApp format)
  if (!user) {
    user = await User.findOne({ 
      userId: { $regex: `^${escapeRegex(phone)}(@|:)` } 
    });
  }
  
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  
  user.fine = (user.fine || 0) + amount;
  await user.save();
  
  return { success: true, fine: user.fine };
}

/**
 * Reset weekly submissions for all users
 */
export async function resetWeeklySubmissions() {
  await User.updateMany({}, { $set: { weeklySubmissions: 0, weeklyFine: 0 } });
  return { success: true, message: "Weekly submissions and fines reset for all users" };
}

/**
 * Reset monthly submissions for all users
 */
export async function resetMonthlySubmissions() {
  await User.updateMany({}, { $set: { monthlySubmissions: 0 } });
  return { success: true, message: "Monthly submissions reset for all users" };
}

/**
 * Reset daily submissions and status flags
 */
export async function resetDailySubmissions() {
  await User.updateMany({}, { $set: { completed: false } });
  await Status.updateOne({}, {
    $set: {
      questionSentToday: false,
      notifiedEmpty: false,
      notifiedLast: false,
      fineAppliedToday: false,
      todayTopic: null,
      todayQuestion: null,
      todayCategory: null,
      todayPosterImage: null,
      posterExpiresAt: null,
    }
  }, { upsert: true });
  
  return { success: true, message: "Daily submissions and status reset for all users" };
}

/**
 * Reset all fines to 0
 */
export async function resetAllFines() {
  await User.updateMany({}, { $set: { fine: 0, weeklyFine: 0 } });
  return { success: true, message: "All fines reset to 0" };
}

/**
 * Send OTP to admin's phone for verification
 */
export async function sendAdminOTP(adminId) {
  const adminAuth = await Auth.findById(adminId).lean();
  if (!adminAuth) {
    const error = new Error("Admin account not found");
    error.statusCode = 404;
    throw error;
  }

  const phone = adminAuth.phone;
  const otp = generateOTP();
  await storeAdminOTP(phone, otp);
  await sendSmsOTP(phone, otp);

  return { 
    success: true, 
    message: `OTP sent to your registered number ${phone.slice(0, 5)}XXXXX` 
  };
}

/**
 * Verify admin OTP and issue action token
 */
export async function verifyAdminOTP(adminId, otp) {
  if (!otp) {
    const error = new Error("OTP is required");
    error.statusCode = 400;
    throw error;
  }

  const adminAuth = await Auth.findById(adminId).lean();
  if (!adminAuth) {
    const error = new Error("Admin account not found");
    error.statusCode = 404;
    throw error;
  }

  const phone = adminAuth.phone;
  const stored = await getAdminOTP(phone);

  if (!stored) {
    const error = new Error("OTP expired or not found. Request a new one.");
    error.statusCode = 400;
    throw error;
  }
  
  if (stored !== String(otp).trim()) {
    const error = new Error("Incorrect OTP");
    error.statusCode = 400;
    throw error;
  }

  await deleteAdminOTP(phone);

  // Issue 10-minute action token
  const actionToken = jwt.sign(
    { adminId, purpose: "admin-create" },
    getJwtSecret(),
    { expiresIn: "10m" }
  );
  
  return { success: true, actionToken };
}

/**
 * Create new user account (admin only)
 */
export async function createUserAccount(phone, password, name, role, actionToken, adminId) {
  // Verify action token
  if (!actionToken) {
    const error = new Error("Admin OTP verification required. Please verify your identity first.");
    error.statusCode = 400;
    throw error;
  }
  
  try {
    const decoded = jwt.verify(actionToken, getJwtSecret());
    if (decoded.purpose !== "admin-create" || decoded.adminId !== String(adminId)) {
      const error = new Error("Invalid or expired action token. Please re-verify.");
      error.statusCode = 400;
      throw error;
    }
  } catch {
    const error = new Error("Action token expired. Please verify your OTP again.");
    error.statusCode = 400;
    throw error;
  }

  // Validate inputs
  if (!phone || !password || !name) {
    const error = new Error("phone, password and name are required");
    error.statusCode = 400;
    throw error;
  }
  
  if (!["user", "trainer", "admin", "viewer"].includes(role)) {
    const error = new Error("Invalid role");
    error.statusCode = 400;
    throw error;
  }

  const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
  if (!/^[6-9]\d{9}$/.test(stripped)) {
    const error = new Error("Enter a valid 10-digit Indian mobile number");
    error.statusCode = 400;
    throw error;
  }
  
  if (password.length < 6) {
    const error = new Error("Password must be at least 6 characters");
    error.statusCode = 400;
    throw error;
  }

  // Full strength validation
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) {
    const error = new Error(pwCheck.errors.join(". "));
    error.statusCode = 400;
    throw error;
  }

  // Check if phone already exists
  const exists = await Auth.findOne({ 
    phone: { $in: [phone, stripped, `91${stripped}`] } 
  });
  
  if (exists) {
    const error = new Error("Phone already registered");
    error.statusCode = 409;
    throw error;
  }

  const hash = await argon2.hash(password);

  // Try to auto-link to existing WhatsApp user
  let waUser = await User.findOne({ phone: { $in: [phone, stripped] } });
  if (!waUser) {
    waUser = await User.findOne({ userId: { $regex: escapeRegex(stripped) } });
  }

  // Create auth record
  await Auth.create({
    phone: stripped,
    password: hash,
    name,
    role,
    userId: waUser?.userId || null,
  });

  // For "user" role: ensure a User document exists so they appear in
  // the trainer dashboard, can have submissions tracked, scores stored, etc.
  // Trainers, admins, and viewers are staff — they don't need a User tracking record.
  if (role === "user" && !waUser) {
    await User.create({
      userId: `web:${stripped}`,  // synthetic userId for web-only accounts
      name,
      phone: stripped,
      fine: 0,
      completed: false,
      streak: 0,
      weeklySubmissions: 0,
      weeklyFine: 0,
      monthlySubmissions: 0,
      feedbackScores: [],
    });
  } else if (role === "user" && waUser) {
    // Sync name to existing WhatsApp user if it's missing
    if (!waUser.name) {
      await User.updateOne({ _id: waUser._id }, { $set: { name, phone: stripped } });
    }
  }

  return { success: true, message: `Account created for ${name}` };
}
