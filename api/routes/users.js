import express from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { randomInt } from "crypto";
import User from "../../models/userSchema.js";
import Auth from "../../models/authSchema.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { getRedisClient, isRedisAvailable } from "../../redis.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const TWO_FACTOR_KEY = process.env.TWO_FACTOR_API_KEY || null;
const OTP_TTL = 300;

// ── OTP helpers (reused from auth.js pattern) ─────────────────────────────────
function adminOtpKey(phone) { return `otp:admin-action:${phone}`; }

function generateOTP() { return String(randomInt(100000, 1000000)); }

async function storeAdminOTP(phone, otp) {
  if (isRedisAvailable()) {
    await getRedisClient().set(adminOtpKey(phone), otp, "EX", OTP_TTL);
  } else {
    global._otpStore = global._otpStore || {};
    global._otpStore[adminOtpKey(phone)] = { otp, exp: Date.now() + OTP_TTL * 1000 };
  }
}

async function getAdminOTP(phone) {
  if (isRedisAvailable()) return await getRedisClient().get(adminOtpKey(phone));
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
    console.log(`[AdminOTP] DEV MODE — OTP for ${phone}: ${otp}`);
    return true;
  }
  const stripped = phone.replace(/^(\+91|91)/, "");
  const { default: fetch } = await import("node-fetch");
  const url = `https://2factor.in/API/V1/${TWO_FACTOR_KEY}/SMS/${stripped}/${otp}/OTP1`;
  const res = await fetch(url);
  const data = await res.json();
  return data.Status === "Success";
}

// GET /api/users — admin & trainer: all users with stats
router.get("/", authMiddleware, requireRole("admin", "trainer"), async (req, res) => {
  try {
    const users = await User.find().lean();
    const auths = await Auth.find().lean();
    const authMap = {};
    auths.forEach(a => { authMap[a.phone] = a; });

    const result = users.map(u => {
      const phone = u.userId?.split("@")[0].split(":")[0];
      const auth = authMap[phone] || {};
      return {
        ...u,
        phone,
        role: auth.role || "user",
        isActive: auth.isActive ?? true,
        registeredName: auth.name || u.name,
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/me — logged-in user's own profile
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const auth = await Auth.findById(req.user.id).lean();
    if (!auth) return res.status(404).json({ error: "Not found" });

    const user = await User.findOne({ userId: { $regex: auth.phone } }).lean();
    res.json({ auth, user: user || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:phone — single user detail (admin/trainer)
router.get("/:phone", authMiddleware, requireRole("admin", "trainer"), async (req, res) => {
  try {
    const user = await User.findOne({ userId: { $regex: req.params.phone } }).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:phone/role — admin: change role
router.patch("/:phone/role", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user", "trainer", "admin"].includes(role))
      return res.status(400).json({ error: "Invalid role" });
    const auth = await Auth.findOneAndUpdate({ phone: req.params.phone }, { role }, { new: true });
    if (!auth) return res.status(404).json({ error: "Auth record not found" });
    res.json({ success: true, role: auth.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:phone/toggle — admin: enable/disable user
router.patch("/:phone/toggle", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const auth = await Auth.findOne({ phone: req.params.phone });
    if (!auth) return res.status(404).json({ error: "Not found" });
    auth.isActive = !auth.isActive;
    await auth.save();
    res.json({ success: true, isActive: auth.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:phone/toggle-submitted — admin/trainer: toggle today's submission status
router.patch("/:phone/toggle-submitted", authMiddleware, requireRole("admin", "trainer"), async (req, res) => {
  try {
    const user = await User.findOne({ userId: { $regex: req.params.phone } });
    if (!user) return res.status(404).json({ error: "User not found" });
    user.completed = !user.completed;
    await user.save();
    res.json({ success: true, completed: user.completed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:phone — admin: remove user
router.delete("/:phone", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await Auth.deleteOne({ phone: req.params.phone });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:phone/fine — admin: manually adjust fine
router.patch("/:phone/fine", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { amount } = req.body; // positive = add, negative = deduct
    const user = await User.findOneAndUpdate(
      { userId: { $regex: req.params.phone } },
      { $inc: { fine: amount } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, fine: user.fine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/reset/weekly — admin/trainer: manually reset all weekly submissions
router.post("/reset/weekly", authMiddleware, requireRole("admin", "trainer"), async (req, res) => {
  try {
    await User.updateMany({}, { $set: { weeklySubmissions: 0, weeklyFine: 0 } });
    res.json({ success: true, message: "Weekly submissions and fines reset for all users" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/reset/monthly — admin/trainer: manually reset all monthly submissions
router.post("/reset/monthly", authMiddleware, requireRole("admin", "trainer"), async (req, res) => {
  try {
    await User.updateMany({}, { $set: { monthlySubmissions: 0 } });
    res.json({ success: true, message: "Monthly submissions reset for all users" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/reset/day — admin/trainer: reset daily submissions + status flags
router.post("/reset/day", authMiddleware, requireRole("admin", "trainer"), async (req, res) => {
  try {
    const Status = (await import("../../models/statusSchema.js")).default;
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
    res.json({ success: true, message: "Daily submissions and status reset for all users" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/reset/fines — admin: reset ALL users' fines to 0
router.post("/reset/fines", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    await User.updateMany({}, { $set: { fine: 0, weeklyFine: 0 } });
    res.json({ success: true, message: "All fines reset to 0" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/admin-send-otp — admin sends OTP to their own registered phone
// Must be authenticated as admin. Used to verify identity before creating a member.
router.post("/admin-send-otp", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const adminAuth = await Auth.findById(req.user.id).lean();
    if (!adminAuth) return res.status(404).json({ error: "Admin account not found" });

    const phone = adminAuth.phone;
    const otp = generateOTP();
    await storeAdminOTP(phone, otp);
    await sendSmsOTP(phone, otp);

    res.json({ success: true, message: `OTP sent to your registered number ${phone.slice(0, 5)}XXXXX` });
  } catch (err) {
    console.error("[AdminSendOTP] Error:", err.message);
    res.status(500).json({ error: "Failed to send OTP. Please try again." });
  }
});

// POST /api/users/admin-verify-otp — admin verifies OTP, gets a short-lived action token
router.post("/admin-verify-otp", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: "OTP is required" });

    const adminAuth = await Auth.findById(req.user.id).lean();
    if (!adminAuth) return res.status(404).json({ error: "Admin account not found" });

    const phone = adminAuth.phone;
    const stored = await getAdminOTP(phone);

    if (!stored) return res.status(400).json({ error: "OTP expired or not found. Request a new one." });
    if (stored !== String(otp).trim()) return res.status(400).json({ error: "Incorrect OTP" });

    await deleteAdminOTP(phone);

    // Issue a 10-minute action token tied to this admin
    const actionToken = jwt.sign(
      { adminId: req.user.id, purpose: "admin-create" },
      JWT_SECRET,
      { expiresIn: "10m" }
    );
    res.json({ success: true, actionToken });
  } catch (err) {
    console.error("[AdminVerifyOTP] Error:", err.message);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

// POST /api/users/admin-create — admin only: create a new member account
// Requires a valid actionToken from /admin-verify-otp
router.post("/admin-create", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const { phone, password, name, role = "user", actionToken } = req.body;

    // Verify admin OTP token
    if (!actionToken) return res.status(400).json({ error: "Admin OTP verification required. Please verify your identity first." });
    try {
      const decoded = jwt.verify(actionToken, JWT_SECRET);
      if (decoded.purpose !== "admin-create" || decoded.adminId !== String(req.user.id)) {
        return res.status(400).json({ error: "Invalid or expired action token. Please re-verify." });
      }
    } catch {
      return res.status(400).json({ error: "Action token expired. Please verify your OTP again." });
    }

    if (!phone || !password || !name)
      return res.status(400).json({ error: "phone, password and name are required" });
    if (!["user", "trainer", "admin"].includes(role))
      return res.status(400).json({ error: "Invalid role" });

    const stripped = phone.replace(/^(\+91|91)/, "").replace(/\s+/g, "");
    if (!/^[6-9]\d{9}$/.test(stripped))
      return res.status(400).json({ error: "Enter a valid 10-digit Indian mobile number" });
    if (password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });

    const exists = await Auth.findOne({ phone: { $in: [phone, stripped, `91${stripped}`] } });
    if (exists) return res.status(409).json({ error: "Phone already registered" });

    const hash = await argon2.hash(password);

    // Try to auto-link to existing WhatsApp user
    let waUser = await User.findOne({ phone: { $in: [phone, stripped] } });
    if (!waUser) waUser = await User.findOne({ userId: { $regex: stripped } });

    await Auth.create({
      phone: stripped,
      password: hash,
      name,
      role,
      userId: waUser?.userId || null,
    });

    res.json({ success: true, message: `Account created for ${name}` });
  } catch (err) {
    console.error("[AdminCreate] Error:", err.message);
    res.status(500).json({ error: "Failed to create account. Please try again." });
  }
});

export default router;
