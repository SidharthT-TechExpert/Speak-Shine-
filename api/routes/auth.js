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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET environment variable is not set.");
  process.exit(1);
}

const TWO_FACTOR_KEY = process.env.TWO_FACTOR_API_KEY || null;
const OTP_TTL = 300; // 5 minutes

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
    if (!auth) return res.status(401).json({ error: "Invalid credentials" });
    if (!auth.isActive) return res.status(403).json({ error: "Account disabled" });

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
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    await autoLinkPhone(phone);

    const token = jwt.sign(
      { id: auth._id, phone, role: auth.role, name: auth.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, role: auth.role, name: auth.name, phone });
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
    if (stored !== String(otp).trim()) return res.status(400).json({ error: "Incorrect OTP" });

    await deleteOTP(stripped, "forgot");

    // Issue a short-lived reset token
    const resetToken = jwt.sign({ phone: stripped, purpose: "reset" }, JWT_SECRET, { expiresIn: "10m" });
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
      decoded = jwt.verify(resetToken, JWT_SECRET);
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
