/**
 * Submissions Controller
 * Handles submission count adjustments for admin dashboard
 */

import User from "../../models/userSchema.js";
import { safeDB } from "../../db.js";

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

    const user = await safeDB(async () => {
      return await User.findOneAndUpdate(
        { phone },
        { $inc: { monthlySubmissions: delta } },
        { new: true, runValidators: true }
      );
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ensure submissions don't go below 0
    if (user.monthlySubmissions < 0) {
      user.monthlySubmissions = 0;
      await user.save();
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

    const user = await safeDB(async () => {
      return await User.findOneAndUpdate(
        { phone },
        { $inc: { weeklySubmissions: delta } },
        { new: true, runValidators: true }
      );
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ensure submissions don't go below 0 or above 7
    if (user.weeklySubmissions < 0) {
      user.weeklySubmissions = 0;
      await user.save();
    } else if (user.weeklySubmissions > 7) {
      user.weeklySubmissions = 7;
      await user.save();
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