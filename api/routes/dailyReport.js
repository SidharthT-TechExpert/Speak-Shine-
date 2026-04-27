import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import DailyReport from "../../models/dailyReportSchema.js";
import Status from "../../models/statusSchema.js";

const router = express.Router();

/**
 * GET /api/daily-report
 * Returns today's daily report if it exists and hasn't expired (before 8 AM)
 * Otherwise returns null
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if we're in the report window (12 AM - 8 AM)
    const status = await Status.findOne().lean();
    const now = new Date();
    
    if (!status?.dailyReportGenerated || !status?.reportExpiresAt) {
      return res.json({ report: null, showQuestion: true });
    }
    
    // If report expired, show question
    if (now >= new Date(status.reportExpiresAt)) {
      return res.json({ report: null, showQuestion: true });
    }
    
    // Get today's report
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const report = await DailyReport.findOne({
      userId,
      date: todayStart,
    }).lean();
    
    if (!report) {
      return res.json({ report: null, showQuestion: false });
    }
    
    res.json({ 
      report,
      showQuestion: false,
      expiresAt: status.reportExpiresAt,
    });
  } catch (err) {
    console.error("[DailyReport] Error:", err);
    res.status(500).json({ error: "Failed to fetch daily report" });
  }
});

/**
 * GET /api/daily-report/history
 * Returns user's past daily reports (last 30 days)
 */
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 30;
    
    const reports = await DailyReport.find({ userId })
      .sort({ date: -1 })
      .limit(limit)
      .lean();
    
    res.json({ reports });
  } catch (err) {
    console.error("[DailyReport] History error:", err);
    res.status(500).json({ error: "Failed to fetch report history" });
  }
});

export default router;
