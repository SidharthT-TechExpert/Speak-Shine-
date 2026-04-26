import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Auth from "../../models/authSchema.js";
import User from "../../models/userSchema.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "speakshine_secret_2024";
const MAX_USERS = 20;

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
    const { phone, password, name } = req.body;
    if (!phone || !password || !name)
      return res.status(400).json({ error: "phone, password and name are required" });

    // ── Phone validation ────────────────────────────────────────────────
    // Accept: 10-digit Indian numbers (6-9 start) with optional +91 / 91 prefix
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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ error: "phone and password are required" });

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
    res.status(500).json({ error: err.message });
  }
});

export default router;
