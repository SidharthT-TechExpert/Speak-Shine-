import express from "express";
import bcrypt from "bcryptjs";
import User from "../../models/userSchema.js";
import Auth from "../../models/authSchema.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

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

export default router;
