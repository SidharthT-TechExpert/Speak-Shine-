import express from "express";
import User from "../../models/userSchema.js";
import Status from "../../models/statusSchema.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /api/dashboard — today's overview (all roles)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const status = await Status.findOne().lean();
    const users = await User.find().lean();

    const completed = users.filter(u => u.completed);
    const pending = users.filter(u => !u.completed);
    const totalFines = users.reduce((s, u) => s + (u.fine || 0), 0);
    const topStreak = [...users].sort((a, b) => (b.streak || 0) - (a.streak || 0)).slice(0, 5);

    res.json({
      today: {
        questionSent: status?.questionSentToday || false,
        topic: status?.todayTopic || null,
        question: status?.todayQuestion || null,
        posterImage: status?.todayPosterImage || null,
      },
      stats: {
        total: users.length,
        completed: completed.length,
        pending: pending.length,
        totalFines,
      },
      topStreak: topStreak.map(u => ({
        name: u.name,
        userId: u.userId,
        streak: u.streak || 0,
        weeklySubmissions: u.weeklySubmissions || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/report/weekly — weekly summary
router.get("/report/weekly", authMiddleware, requireRole("admin", "trainer"), async (req, res) => {
  try {
    const users = await User.find().lean();
    const sorted = [...users].sort((a, b) => (b.weeklySubmissions || 0) - (a.weeklySubmissions || 0));
    res.json(sorted.map(u => ({
      name: u.name,
      userId: u.userId,
      weeklySubmissions: u.weeklySubmissions || 0,
      weeklyFine: u.weeklyFine || 0,
      streak: u.streak || 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/report/monthly — monthly summary
router.get("/report/monthly", authMiddleware, requireRole("admin", "trainer"), async (req, res) => {
  try {
    const users = await User.find().lean();
    const sorted = [...users].sort((a, b) => (b.monthlySubmissions || 0) - (a.monthlySubmissions || 0));
    res.json(sorted.map(u => ({
      name: u.name,
      userId: u.userId,
      monthlySubmissions: u.monthlySubmissions || 0,
      fine: u.fine || 0,
      streak: u.streak || 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/me — full profile for the logged-in user
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const phone = req.user.phone;

    // Match by phone field first (most reliable), then fallback to userId regex
    let user = await User.findOne({ phone: { $in: [phone, phone.replace(/^91/, "")] } }).lean();
    if (!user) {
      // fallback: try matching userId which may contain the phone
      user = await User.findOne({
        userId: { $regex: phone.replace(/^91/, "") }
      }).lean();
    }

    const status = await Status.findOne().lean();
    const allUsers = await User.find().lean();
    const completed = allUsers.filter(u => u.completed).length;
    const totalFines = allUsers.reduce((s, u) => s + (u.fine || 0), 0);
    const topStreak = [...allUsers]
      .sort((a, b) => (b.streak || 0) - (a.streak || 0))
      .slice(0, 5)
      .map(u => ({ name: u.name, userId: u.userId, streak: u.streak || 0, weeklySubmissions: u.weeklySubmissions || 0 }));

    res.json({
      profile: user ? {
        name: user.name,
        feedbackScores: user.feedbackScores || [],
        streak: user.streak || 0,
        fine: user.fine || 0,
        completed: user.completed || false,
        weeklySubmissions: user.weeklySubmissions || 0,
        monthlySubmissions: user.monthlySubmissions || 0,
        linkedPhone: user.phone || null,
      } : null,
      today: {
        questionSent: status?.questionSentToday || false,
        topic: status?.todayTopic || null,
        question: status?.todayQuestion || null,
        posterImage: status?.todayPosterImage || null,
      },
      stats: {
        total: allUsers.length,
        completed,
        pending: allUsers.length - completed,
        totalFines,
      },
      topStreak,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/scores/:phone — feedback score history for a user (trainer/admin use)
router.get("/scores/:phone", authMiddleware, async (req, res) => {
  try {
    // Users can only see their own scores; trainers/admins can see all
    if (req.user.role === "user" && req.user.phone !== req.params.phone) {
      return res.status(403).json({ error: "Access denied" });
    }
    const phone = req.params.phone;
    const user = await User.findOne({ userId: { $regex: `^${phone}` } }).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      name: user.name,
      feedbackScores: user.feedbackScores || [],
      streak: user.streak || 0,
      fine: user.fine || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
