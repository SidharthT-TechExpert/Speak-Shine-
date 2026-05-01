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
    const { posterSendTime, questionGenerateTime } = req.body;
    const result = await dashboardService.updateSettings(posterSendTime, questionGenerateTime);
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
 * POST /api/dashboard/demo-weekly-reflection - Force weekly reflection mode (admin)
 */
export async function enableWeeklyReflection(req, res) {
  try {
    const result = await dashboardService.enableWeeklyReflection();
    res.json(result);
  } catch (error) {
    console.error("[Dashboard] Enable weekly reflection error:", error.message);
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
