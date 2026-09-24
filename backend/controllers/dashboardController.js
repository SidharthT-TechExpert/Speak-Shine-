/**
 * Dashboard Controller
 * HTTP request handlers for dashboard endpoints
 */

import * as dashboardService from "../services/dashboard/dashboardService.js";

/**
 * GET /api/dashboard - Today's overview (all roles)
 */
export async function getTodayOverview(req, res) {
  try {
    const result = await dashboardService.getTodayOverview();
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Get today overview error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/dashboard/report/weekly - Weekly summary (admin/trainer)
 */
export async function getWeeklyReport(req, res) {
  try {
    const result = await dashboardService.getWeeklyReport();
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Get weekly report error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/dashboard/report/monthly - Monthly summary (admin/trainer)
 */
export async function getMonthlyReport(req, res) {
  try {
    const result = await dashboardService.getMonthlyReport();
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Get monthly report error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/dashboard/me - Full profile for logged-in user
 */
export async function getUserProfile(req, res) {
  try {
    const phone = req.user.phone;
    const result = await dashboardService.getUserProfile(phone);
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Get user profile error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/dashboard/scores/:phone - Feedback score history
 */
export async function getUserScores(req, res) {
  try {
    // Users can only see their own scores; trainers/admins can see all
    if (req.user.role === "user" && req.user.phone !== req.params.phone) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const result = await dashboardService.getUserScores(req.params.phone);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Dashboard] Get user scores error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PATCH /api/dashboard/today-question - Manually set today's question (admin)
 */
export async function setTodayQuestion(req, res) {
  try {
    const { topic, question, category } = req.body;
    const result = await dashboardService.setTodayQuestion(topic, question, category);
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Set today question error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/dashboard/settings - Get bot schedule settings (admin)
 */
export async function getSettings(req, res) {
  try {
    const result = await dashboardService.getSettings();
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Get settings error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PATCH /api/dashboard/settings - Update bot schedule settings (admin)
 */
export async function updateSettings(req, res) {
  try {
    const result = await dashboardService.updateSettings(req.body);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Dashboard] Update settings error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/dashboard/debug-report - Debug daily report status (admin)
 */
export async function getDebugReport(req, res) {
  try {
    const result = await dashboardService.getDebugReport();
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Get debug report error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/dashboard/generate-report-now - Manually trigger report generation (admin)
 */
export async function generateReportNow(req, res) {
  try {
    const result = await dashboardService.generateReportNow();
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Generate report now error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/dashboard/demo-monthly-reflection - Force monthly reflection mode (admin)
 */
export async function enableMonthlyReflection(req, res) {
  try {
    const result = await dashboardService.enableMonthlyReflection();
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Enable monthly reflection error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/dashboard/demo-monthly-goals - Force monthly goals mode (admin)
 */
export async function enableMonthlyGoals(req, res) {
  try {
    const result = await dashboardService.enableMonthlyGoals();
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Enable monthly goals error:", error.message);
    res.status(500).json({ error: error.message });
  }
}


/**
 * POST /api/dashboard/demo-story-summary - Force story summary mode (admin)
 */
export async function enableStorySummaryDemo(req, res) {
  try {
    const result = await dashboardService.enableStorySummaryDemo();
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[Dashboard] Enable story summary demo error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/dashboard/demo-monthly-reflection-off - Turn off all special modes (admin)
 */
export async function disableSpecialModes(req, res) {
  try {
    const result = await dashboardService.disableSpecialModes();
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Disable special modes error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/dashboard/prize-info - Public prize pool info (all authenticated users)
 * Returns prize amounts & month info only — no winner names/phones for privacy.
 */
export async function getPrizeInfo(req, res) {
  try {
    const { getMonthEndPrizeReportSummary } = await import("../services/whatsapp/whatsappService.js");
    const summary = await getMonthEndPrizeReportSummary({});

    // Expose prize amounts + first name only (no phone/userId for privacy)
    const prizes = (summary.winners || []).map((w, i) => {
      const fullName = w.name || "";
      const firstName = fullName.split(" ")[0] || null; // only first name
      return {
        rank: w.rank || i + 1,
        label: w.rank === 1 ? "🥇 1st Place" : w.rank === 2 ? "🥈 2nd Place" : w.rank === 3 ? "🥉 3rd Place" : `🏅 ${w.rank}th Place`,
        amount: w.amount ?? null,
        percentage: w.percentage ?? null,
        currentLeader: firstName,  // first name only — safe to show
        streak: w.streak || 0,
        monthlyScore: w.monthlyScore || 0,
      };
    });

    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const month = nowIST.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

    return res.json({
      success: true,
      month,
      monthName: summary.monthName,
      year: summary.year,
      totalCollection: summary.totalCollection,
      distributedTotal: summary.distributedTotal,
      prizes,
    });
  } catch (err) {
    console.error("[Dashboard] getPrizeInfo error:", err.message);
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const month = nowIST.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    return res.json({
      success: true,
      month,
      prizes: [
        { rank: 1, label: "🥇 1st Place", amount: null, percentage: null, currentLeader: null },
        { rank: 2, label: "🥈 2nd Place", amount: null, percentage: null, currentLeader: null },
        { rank: 3, label: "🥉 3rd Place", amount: null, percentage: null, currentLeader: null },
      ],
    });
  }
}
