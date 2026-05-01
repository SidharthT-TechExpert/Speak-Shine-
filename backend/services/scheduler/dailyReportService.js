/**
 * Daily Report Service
 * Business logic for generating daily reports
 */

import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";
import DailyReport from "../../../models/dailyReportSchema.js";
import VideoReport from "../../../models/videoReportSchema.js";

const TIMEZONE = "Asia/Kolkata";

/**
 * Generate daily reports for all users
 * Creates a report showing yesterday's performance
 * Reports expire at 8 AM
 */
export async function generateDailyReports() {
  try {
    console.log("[DailyReport] 📊 Generating daily reports...");

    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
    const reportDate = new Date(nowIST);
    reportDate.setHours(0, 0, 0, 0);
    
    // Report expires at 8 AM today
    const expiresAt = new Date(reportDate);
    expiresAt.setHours(8, 0, 0, 0);

    // Get all users
    const users = await User.find({}).lean();
    
    // Get yesterday's date range (for finding video reports)
    const yesterdayStart = new Date(reportDate);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(reportDate);

    let reportsCreated = 0;
    const reports = [];

    for (const user of users) {
      // Find yesterday's video report
      const videoReport = await VideoReport.findOne({
        userId: user._id,
        submittedAt: { $gte: yesterdayStart, $lt: yesterdayEnd },
        status: "completed"
      }).sort({ submittedAt: -1 }).lean();

      const report = {
        userId: user._id,
        phone: user.phone,
        date: reportDate,
        submitted: !!videoReport,
        submittedAt: videoReport?.submittedAt || null,
        
        // Scores from yesterday's video
        fluency: videoReport?.analysis?.fluency || null,
        grammar: videoReport?.analysis?.grammar || null,
        confidence: videoReport?.analysis?.confidence || null,
        vocabulary: videoReport?.analysis?.vocabulary || null,
        
        // Visual scores
        eyeContact: videoReport?.analysis?.eyeContact || null,
        bodyLanguage: videoReport?.analysis?.bodyLanguage || null,
        facialExpression: videoReport?.analysis?.facialExpression || null,
        
        // Current stats
        streak: user.streak || 0,
        weeklySubmissions: user.weeklySubmissions || 0,
        monthlySubmissions: user.monthlySubmissions || 0,
        
        // Fine information
        fine: user.fine || 0,
        weeklyFine: user.weeklyFine || 0,
        fineAdded: !videoReport, // Fine was added if they didn't submit
        
        // Feedback
        overallComment: videoReport?.analysis?.overallComment || null,
        strongPoints: videoReport?.analysis?.strongPoints || [],
        suggestions: videoReport?.analysis?.suggestions || [],
        
        expiresAt,
      };

      await DailyReport.create(report);
      reports.push(report);
      reportsCreated++;
    }

    // Update status to mark reports as generated
    await Status.updateOne({}, {
      $set: {
        dailyReportGenerated: true,
        reportExpiresAt: expiresAt,
      }
    }, { upsert: true });

    console.log(`[DailyReport] ✅ Generated ${reportsCreated} daily reports (expire at 08:00)`);

    return {
      success: true,
      reportsCreated,
      expiresAt,
      reports
    };
  } catch (err) {
    console.error("[DailyReport] ❌ Daily report generation error:", err);
    throw err;
  }
}

/**
 * Get daily report for a specific user
 */
export async function getUserDailyReport(userId) {
  try {
    // Check if we're in the report window (12 AM - 8 AM)
    const status = await Status.findOne().lean();
    const now = new Date();
    
    if (!status?.dailyReportGenerated || !status?.reportExpiresAt) {
      return { report: null, showQuestion: true };
    }
    
    // If report expired, show question
    if (now >= new Date(status.reportExpiresAt)) {
      return { report: null, showQuestion: true };
    }
    
    // Get today's report
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const report = await DailyReport.findOne({
      userId,
      date: todayStart,
    }).lean();
    
    if (!report) {
      return { report: null, showQuestion: false };
    }
    
    return { 
      report,
      showQuestion: false,
      expiresAt: status.reportExpiresAt,
    };
  } catch (err) {
    console.error("[DailyReport] Get user report error:", err);
    throw err;
  }
}

/**
 * Get report history for a user
 */
export async function getUserReportHistory(userId, limit = 30) {
  try {
    const reports = await DailyReport.find({ userId })
      .sort({ date: -1 })
      .limit(limit)
      .lean();
    
    return { reports };
  } catch (err) {
    console.error("[DailyReport] Get history error:", err);
    throw err;
  }
}
