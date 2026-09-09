/**
 * User Controller
 * Handles HTTP requests for user management endpoints
 */

import * as userService from "../services/user/userService.js";

/**
 * GET /api/users
 * Get all users (admin/trainer)
 */
export async function getAllUsers(req, res) {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error("[GetAllUsers] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/users/me
 * Get current user's profile
 */
export async function getMyProfile(req, res) {
  try {
    const result = await userService.getUserProfile(req.user.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[GetMyProfile] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/users/:phone
 * Get single user by phone (admin/trainer)
 */
export async function getUserByPhone(req, res) {
  try {
    const user = await userService.getUserByPhone(req.params.phone);
    res.json(user);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[GetUserByPhone] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PATCH /api/users/:phone/role
 * Update user role (admin)
 */
export async function updateUserRole(req, res) {
  try {
    const { role } = req.body;
    const result = await userService.updateUserRole(req.params.phone, role, req.user.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[UpdateUserRole] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PATCH /api/users/:phone/toggle
 * Toggle user active status (admin)
 */
export async function toggleUserStatus(req, res) {
  try {
    const result = await userService.toggleUserStatus(req.params.phone);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[ToggleUserStatus] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PATCH /api/users/:phone/toggle-submitted
 * Toggle user's submission status for today (admin/trainer)
 */
export async function toggleSubmissionStatus(req, res) {
  try {
    const result = await userService.toggleSubmissionStatus(req.params.phone);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[ToggleSubmissionStatus] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/users/:phone
 * Delete user (admin)
 */
export async function deleteUser(req, res) {
  try {
    const result = await userService.deleteUser(req.params.phone, req.user.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[DeleteUser] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PATCH /api/users/:phone/fine
 * Adjust user fine (admin)
 */
export async function adjustUserFine(req, res) {
  try {
    const { amount } = req.body;
    const result = await userService.adjustUserFine(req.params.phone, amount);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[AdjustUserFine] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PATCH /api/users/:phone/points
 * Adjust user monthly score/points (admin/trainer)
 * Body: { amount: number, mode?: "add" | "remove" | "set", reason?: string }
 */
export async function adjustUserPoints(req, res) {
  try {
    const { amount, mode, reason } = req.body || {};
    const io = req.app?.get("io");
    const result = await userService.adjustUserPoints(req.params.phone, { amount, mode, reason }, io);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[AdjustUserPoints] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PATCH /api/users/:phone/streak
 * Adjust user streak days (admin/trainer)
 * Body: { amount: number, mode?: "add" | "remove" | "set" | "reset" }
 */
export async function adjustUserStreak(req, res) {
  try {
    const { amount, mode } = req.body || {};
    const io = req.app?.get("io");
    const result = await userService.adjustUserStreak(req.params.phone, { amount, mode }, io);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[AdjustUserStreak] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PATCH /api/users/:phone/freeze
 * Adjust user streak freeze shields (admin/trainer)
 * Body: { amount: number, mode?: "add" | "remove" | "set" }
 */
export async function adjustUserFreeze(req, res) {
  try {
    const { amount, mode } = req.body || {};
    const io = req.app?.get("io");
    const result = await userService.adjustUserFreeze(req.params.phone, { amount, mode }, io);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[AdjustUserFreeze] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/users/reset/weekly
 * Reset weekly submissions (admin/trainer)
 */
export async function resetWeeklySubmissions(req, res) {
  try {
    const result = await userService.resetWeeklySubmissions();
    res.json(result);
  } catch (error) {
    console.error("[ResetWeekly] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/users/reset/monthly
 * Reset monthly submissions (admin/trainer)
 */
export async function resetMonthlySubmissions(req, res) {
  try {
    const result = await userService.resetMonthlySubmissions();
    res.json(result);
  } catch (error) {
    console.error("[ResetMonthly] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/users/reset/day
 * Reset daily submissions (admin/trainer)
 */
export async function resetDailySubmissions(req, res) {
  try {
    const result = await userService.resetDailySubmissions();
    res.json(result);
  } catch (error) {
    console.error("[ResetDaily] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/users/reset/fines
 * Reset all fines (admin)
 */
export async function resetAllFines(req, res) {
  try {
    const result = await userService.resetAllFines();
    res.json(result);
  } catch (error) {
    console.error("[ResetFines] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/users/admin-send-otp
 * Send OTP to admin's phone (admin)
 */
export async function sendAdminOTP(req, res) {
  try {
    const result = await userService.sendAdminOTP(req.user.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[AdminSendOTP] Error:", error.message);
    res.status(500).json({ error: "Failed to send OTP. Please try again." });
  }
}

/**
 * POST /api/users/admin-verify-otp
 * Verify admin OTP (admin)
 */
export async function verifyAdminOTP(req, res) {
  try {
    const { otp } = req.body;
    const result = await userService.verifyAdminOTP(req.user.id, otp);
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[AdminVerifyOTP] Error:", error.message);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
}

/**
 * POST /api/users/admin-create
 * Create new user account (admin)
 */
export async function createUserAccount(req, res) {
  try {
    const { phone, password, name, role = "user", actionToken } = req.body;
    
    const result = await userService.createUserAccount(
      phone,
      password,
      name,
      role,
      actionToken,
      req.user.id
    );
    
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[AdminCreate] Error:", error.message);
    res.status(500).json({ error: "Failed to create account. Please try again." });
  }
}

/**
 * PATCH /api/users/me/theme
 * Update current user's theme preference
 */
export async function updateMyTheme(req, res) {
  try {
    const { theme, isDark } = req.body;
    const result = await userService.updateUserTheme(req.user.id, { theme, isDark });
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error("[UpdateMyTheme] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
