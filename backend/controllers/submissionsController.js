/**
 * Submissions Controller
 * Handles submission count adjustments for admin dashboard
 */

import User from "../../models/userSchema.js";
import { safeDB } from "../../db.js";
import { escapeRegex } from "../utils/phoneUtils.js";

/**
 * Adjust monthly submissions count
 */
export const adjustMonthlySubmissions = async (req, res) => {
  try {
    const { phone } = req.params;
    const { delta } = req.body;

    if (!delta || typeof delta !== 'number') {
      return res.status(400).json({ error: "Delta must be a number" });
    }

    // Bound delta to prevent abuse (max ±31 — one month's worth)
    if (delta < -31 || delta > 31) {
      return res.status(400).json({ error: "Delta must be between -31 and 31" });
    }

    const user = await safeDB(async () => {
      // Try to find by phone field first
      let user = await User.findOne({ phone });
      
      // If not found, try to find by userId pattern (WhatsApp format)
      if (!user) {
        user = await User.findOne({ 
          userId: { $regex: `^${escapeRegex(phone)}(@|:)` } 
        });
      }
      
      if (!user) {
        return null;
      }

      // Update the user
      user.monthlySubmissions = (user.monthlySubmissions || 0) + delta;
      
      // Ensure submissions don't go below 0
      if (user.monthlySubmissions < 0) {
        user.monthlySubmissions = 0;
      }
      
      await user.save();
      return user;
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      monthlySubmissions: user.monthlySubmissions,
      message: `Monthly submissions ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)}`
    });

  } catch (error) {
    console.error('[Submissions] Adjust monthly error:', error);
    res.status(500).json({ error: "Failed to adjust monthly submissions" });
  }
};

/**
 * Adjust weekly submissions count
 */
export const adjustWeeklySubmissions = async (req, res) => {
  try {
    const { phone } = req.params;
    const { delta } = req.body;

    if (!delta || typeof delta !== 'number') {
      return res.status(400).json({ error: "Delta must be a number" });
    }

    // Bound delta to ±7 (one week's worth)
    if (delta < -7 || delta > 7) {
      return res.status(400).json({ error: "Delta must be between -7 and 7" });
    }

    const user = await safeDB(async () => {
      // Try to find by phone field first
      let user = await User.findOne({ phone });
      
      // If not found, try to find by userId pattern (WhatsApp format)
      if (!user) {
        user = await User.findOne({ 
          userId: { $regex: `^${escapeRegex(phone)}(@|:)` } 
        });
      }
      
      if (!user) {
        return null;
      }

      // Update the user
      user.weeklySubmissions = (user.weeklySubmissions || 0) + delta;
      
      // Ensure submissions don't go below 0 or above 7
      if (user.weeklySubmissions < 0) {
        user.weeklySubmissions = 0;
      } else if (user.weeklySubmissions > 7) {
        user.weeklySubmissions = 7;
      }
      
      await user.save();
      return user;
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      weeklySubmissions: user.weeklySubmissions,
      message: `Weekly submissions ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)}`
    });

  } catch (error) {
    console.error('[Submissions] Adjust weekly error:', error);
    res.status(500).json({ error: "Failed to adjust weekly submissions" });
  }
};

/**
 * Adjust daily submissions count
 */
export const adjustDailySubmissions = async (req, res) => {
  try {
    const { phone } = req.params;
    const { delta } = req.body;

    if (!delta || typeof delta !== 'number') {
      return res.status(400).json({ error: "Delta must be a number" });
    }

    // Bound delta to ±3 (reasonable daily adjustment)
    if (delta < -3 || delta > 3) {
      return res.status(400).json({ error: "Delta must be between -3 and 3" });
    }

    const user = await safeDB(async () => {
      return await User.findOneAndUpdate(
        { phone },
        { $inc: { dailySubmissions: delta } },
        { new: true, runValidators: true }
      );
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ensure submissions don't go below 0
    if (user.dailySubmissions < 0) {
      user.dailySubmissions = 0;
      await user.save();
    }

    res.json({
      success: true,
      dailySubmissions: user.dailySubmissions,
      message: `Daily submissions ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)}`
    });

  } catch (error) {
    console.error('[Submissions] Adjust daily error:', error);
    res.status(500).json({ error: "Failed to adjust daily submissions" });
  }
};