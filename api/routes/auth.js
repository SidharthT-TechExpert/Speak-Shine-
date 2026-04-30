import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { randomInt } from "crypto";
import rateLimit from "express-rate-limit";
import Auth from "../../models/authSchema.js";
import User from "../../models/userSchema.js";
import { getRedisClient, isRedisAvailable } from "../../redis.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET environment variable is not set. Refusing to start.");
  process.exit(1);
}
const MAX_USERS = parseInt(process.env.MAX_USERS || "20", 10);
const TWO_FACTOR_KEY = process.env.TWO_FACTOR_API_KEY || null;
const OTP_TTL = 300; // 5 minutes in seconds

// ── Rate limiters ────────────────────────────────────────────────────────────
// Login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP send: max 5 per hour per IP (prevent SMS spam)
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many OTP requests. Please try again in 1 hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── OTP helpers ─────────────────────────────────────────────────────────────

function otpKey(phone) { return `otp:${phone}`; }

function generateOTP() {
  // Cryptographically secure 6-digit OTP
  return String(randomInt(100000, 1000000));
}

async function sendOTP(phone, otp) {
  // If no API key configured, log OTP for dev/testing
  if (!TWO_FACTOR_KEY) {
    console.log(`[OTP] DEV MODE — OTP for ${phone}: ${otp}`);
    return true;
  }
  const stripped = phone.replace(/^(\+91|91)/, "");
  const url = `https://2factor.in/API/V1/${TWO_FACTOR_KEY}/SMS/${stripped}/${otp}/OTP1`;
  const res = await fetch(url);
  const data = await res.json();
  return data.Status === "Success";
}

// POST /api/auth/send-otp — send OTP to phone before registration
router.post("/send-otp", otpLimiter, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone is required" });

    const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
    if (!/^[6-9]\d{9}$/.test(stripped))
      return res.status(400).json({ error: "Enter a valid 10-digit Indian mobile number" });

    // Check if already registered
    const exists = await Auth.findOne({ phone: { $in: [phone, stripped, `91${stripped}`] } });
    if (exists) return res.status(409).json({ error: "Phone already registered" });

    // Check user limit before sending OTP
    const userCount = await Auth.countDocuments({ role: "user" });
    if (userCount >= MAX_USERS)
      return res.status(403).json({ error: `Registration closed — group is full (max ${MAX_USERS} members)` });

    const otp = generateOTP();

    // Store in Redis with TTL
    if (isRedisAvailable()) {
      const redis = getRedisClient();
      await redis.set(otpKey(stripped), otp, "EX", OTP_TTL);
    } else {
      // Fallback: store in memory (dev only)
      global._otpStore = global._otpStore || {};
      global._otpStore[stripped] = { otp, exp: Date.now() + OTP_TTL * 1000 };
    }

    const sent = await sendOTP(stripped, otp);
    if (!sent) return res.status(500).json({ error: "Failed to send OTP. Try again." });

    res.json({ success: true, message: `OTP sent to ${stripped.slice(0, 5)}XXXXX` });
  } catch (err) {
    console.error("[SendOTP] Error:", err.message);
    res.status(500).json({ error: "Failed to send OTP. Please try again." });
  }
});

// POST /api/auth/verify-otp — verify OTP (used before completing registration)
router.post("/verify-otp", otpLimiter, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP are required" });

    const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
    let storedOtp = null;

    if (isRedisAvailable()) {
      const redis = getRedisClient();
      storedOtp = await redis.get(otpKey(stripped));
    } else {
      const entry = global._otpStore?.[stripped];
      if (entry && entry.exp > Date.now()) storedOtp = entry.otp;
    }

    if (!storedOtp) return res.status(400).json({ error: "OTP expired or not found. Request a new one." });
    if (storedOtp !== String(otp).trim()) return res.status(400).json({ error: "Incorrect OTP" });

    // OTP valid — issue a short-lived verification token
    const verifyToken = jwt.sign({ phone: stripped, verified: true }, JWT_SECRET, { expiresIn: "10m" });

    // Delete OTP after successful verification
    if (isRedisAvailable()) {
      await getRedisClient().del(otpKey(stripped));
    } else {
      delete global._otpStore?.[stripped];
    }

    res.json({ success: true, verifyToken });
  } catch (err) {
    console.error("[VerifyOTP] Error:", err.message);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

/**
 * Try to find the matching WhatsApp User document for a given registered phone.
 * WhatsApp stores userId as "63359844106419@s.whatsapp.net" (internal ID)
 * but also stores a separate `phone` field like "8848096746" (without country code).
 *
 * Strategy:
 * 1. Match by `phone` field directly (e.g. "8848096746" or "918848096746")
 * 2. Fallback: match userId regex with last 10 digits
 */
async function findWhatsAppUser(phone) {
  const stripped = phone.replace(/^91/, ""); // remove country code if present

  // Try phone field first (exact or without country code)
  let user = await User.findOne({ phone: { $in: [phone, stripped] } });
  if (user) return user;

  // Fallback: userId contains the last 10 digits
  user = await User.findOne({ userId: { $regex: stripped } });
  return user || null;
}

/**
 * Auto-save the registered phone into the WhatsApp User document
 * so future lookups by phone field work instantly.
 */
async function autoLinkPhone(phone) {
  const waUser = await findWhatsAppUser(phone);
  if (waUser && !waUser.phone) {
    const stripped = phone.replace(/^91/, "");
    await User.updateOne({ _id: waUser._id }, { $set: { phone: stripped } });
    console.log(`[Auth] Auto-linked phone ${stripped} → userId ${waUser.userId}`);
  }
  return waUser;
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { phone, password, name, verifyToken } = req.body;
    if (!phone || !password || !name)
      return res.status(400).json({ error: "phone, password and name are required" });

    // ── Verify OTP token ────────────────────────────────────────────────
    if (!verifyToken) {
      return res.status(400).json({ error: "Phone verification required. Please verify your OTP first." });
    }
    try {
      const decoded = jwt.verify(verifyToken, JWT_SECRET);
      const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
      if (!decoded.verified || decoded.phone !== stripped) {
        return res.status(400).json({ error: "OTP verification mismatch. Please re-verify." });
      }
    } catch {
      return res.status(400).json({ error: "OTP verification expired. Please verify again." });
    }

    // ── Phone validation ────────────────────────────────────────────────
    const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
    if (!/^[6-9]\d{9}$/.test(stripped)) {
      return res.status(400).json({
        error: "Enter a valid 10-digit Indian mobile number (e.g. 9876543210)",
      });
    }

    // Enforce 20-user limit (excluding admins/trainers)
    const userCount = await Auth.countDocuments({ role: "user" });
    if (userCount >= MAX_USERS)
      return res.status(403).json({ error: `Registration closed — group is full (max ${MAX_USERS} members)` });

    const exists = await Auth.findOne({ phone });
    if (exists) return res.status(409).json({ error: "Phone already registered" });

    const hash = await bcrypt.hash(password, 10);

    // Auto-assign admin if this is the owner number
    const ownerPhone = (process.env.OWNER_NUMBER || "")
      .replace("@s.whatsapp.net", "").replace(/:.*/, "").replace(/^91/, "");
    const incomingStripped = phone.replace(/^91/, "");
    const role = incomingStripped === ownerPhone ? "admin" : "user";

    // Auto-link to WhatsApp user and save phone field
    const waUser = await autoLinkPhone(phone);

    const auth = await Auth.create({
      phone,
      password: hash,
      name,
      role,
      userId: waUser?.userId || null,
    });

    const token = jwt.sign({ id: auth._id, phone, role, name }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, role, name, phone, linked: !!waUser });
  } catch (err) {
    console.error("[Register] Error:", err.message);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ error: "phone and password are required" });

    // Sanitise inputs
    if (typeof phone !== "string" || typeof password !== "string")
      return res.status(400).json({ error: "Invalid input" });
    if (password.length > 128)
      return res.status(400).json({ error: "Invalid credentials" });

    const auth = await Auth.findOne({ phone });
    if (!auth) return res.status(401).json({ error: "Invalid credentials" });
    if (!auth.isActive) return res.status(403).json({ error: "Account disabled" });

    const valid = await bcrypt.compare(password, auth.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    // Auto-link on every login in case it wasn't linked at register time
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

export default router;
