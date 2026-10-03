/**
 * requirePaid middleware
 * Blocks access to protected routes if the user has not paid.
 * Admin and trainer roles bypass the payment gate.
 * 
 * Initial 2 days rule:
 * Users can upload/record videos without payment during the initial 2 days (1st and 2nd)
 * of each month in IST. From Day 3 (00:00 IST on 3rd) onwards, payment is required.
 */

import User from "../../models/userSchema.js";
import { escapeRegex, findUserByPhone } from "../utils/phoneUtils.js";
import { isMonthlyGracePeriod, getMonthlyGracePeriodInfo } from "../utils/gracePeriodUtils.js";

export async function requirePaid(req, res, next) {
  const role = req.user?.role;

  // Admins and trainers always bypass payment gate
  if (role === "admin" || role === "admins" || role === "trainer" || role === "viewer") {
    return next();
  }

  // Initial 2 days of each month: free upload grace period for all users
  if (isMonthlyGracePeriod()) {
    return next();
  }

  const phone = req.user?.phone;
  if (!phone) {
    return res.status(403).json({
      error: "Payment required to access this feature. The 2-day free upload grace period for this month has ended.",
      code: "PAYMENT_REQUIRED",
      ...getMonthlyGracePeriodInfo(),
    });
  }

  try {
    const user = await findUserByPhone(phone);

    if (!user || !user.paid) {
      return res.status(403).json({
        error: "Payment required to access this feature. The 2-day free upload grace period for this month has ended.",
        code: "PAYMENT_REQUIRED",
        ...getMonthlyGracePeriodInfo(),
      });
    }

    next();
  } catch (err) {
    console.error("[requirePaid] DB error:", err.message);
    // Fail closed — if DB is down, block access
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
}

