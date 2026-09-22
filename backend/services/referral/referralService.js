/**
 * Referral Service
 * Handles unique referral code generation, code validation,
 * and crediting ₹5 wallet rewards upon referred user's payment.
 */

import crypto from "crypto";
import User from "../../../models/userSchema.js";
import Status from "../../../models/statusSchema.js";

const DEFAULT_REFERRAL_REWARD = 5; // Default fallback: ₹5 wallet credit per referral
const BASE_PREFIX = "SPEAK";
const SAFE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // avoid ambiguous 0, O, 1, I

/**
 * Get current admin-configured referral reward amount from Status collection
 */
export async function getReferralRewardAmount() {
  try {
    const status = await Status.findOne().select("referralRewardAmount").lean();
    const amount = Number(status?.referralRewardAmount);
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : DEFAULT_REFERRAL_REWARD;
  } catch {
    return DEFAULT_REFERRAL_REWARD;
  }
}

/**
 * Generate a random alphanumeric string using crypto
 */
function getRandomCryptoString(length = 4) {
  let result = "";
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, SAFE_CHARS.length);
    result += SAFE_CHARS[idx];
  }
  return result;
}

/**
 * Generate a unique referral code:
 * Starts with 'SPEAK' + sanitized name part (up to 4 chars) + crypto random alphanumeric
 * Example: 'SPEAKRAHU7K9' or 'SPEAKJOH4P2'
 */
export async function generateUniqueReferralCode(userOrName) {
  const rawName = (typeof userOrName === "string" ? userOrName : userOrName?.name) || "";
  const cleanName = rawName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4);

  let attempts = 0;
  while (attempts < 20) {
    attempts++;
    const randomPart = getRandomCryptoString(4);
    const candidateCode = `${BASE_PREFIX}${cleanName}${randomPart}`;

    const existing = await User.findOne({ referralCode: candidateCode });
    if (!existing) {
      return candidateCode;
    }
  }

  // Fallback with timestamp hex if too many collisions
  const extraHex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${BASE_PREFIX}${cleanName}${extraHex}`;
}

/**
 * Ensures that the given user has a unique referral code.
 * If missing, generates, persists, and returns it.
 */
export async function ensureUserReferralCode(user) {
  if (!user) return null;
  if (user.referralCode) return user.referralCode;

  const code = await generateUniqueReferralCode(user);
  user.referralCode = code;
  await user.save();
  return code;
}

/**
 * Validates a referral code.
 * Returns the inviter user's public info if valid, or null.
 */
export async function validateReferralCode(rawCode) {
  if (!rawCode || typeof rawCode !== "string") return null;
  const code = rawCode.trim().toUpperCase();
  if (!code.startsWith(BASE_PREFIX)) return null;

  const inviter = await User.findOne({ referralCode: code }).select("name phone referralCode").lean();
  if (!inviter) return null;

  return {
    valid: true,
    code: inviter.referralCode,
    inviterName: inviter.name || "A Speak & Shine Member",
  };
}

/**
 * Credits ₹5 to referrer's wallet when the referred user completes their payment.
 * Strictly idempotent: executes only once per referred user.
 */
export async function creditReferralRewardIfEligible(user, io = null) {
  if (!user || !user.referredBy || user.referralRewardClaimed) {
    return { credited: false, reason: "Not eligible or already claimed" };
  }

  const referrer = await User.findById(user.referredBy);
  if (!referrer) {
    console.warn(`[Referral] Referrer ${user.referredBy} not found for user ${user._id}`);
    return { credited: false, reason: "Referrer not found" };
  }

  // Fetch dynamic referral reward amount set by admin (default ₹5)
  const rewardAmount = await getReferralRewardAmount();

  if (rewardAmount <= 0) {
    // If admin disabled referral rewards (₹0), mark claimed so it's not retried
    user.referralRewardClaimed = true;
    await user.save();
    return { credited: false, reason: "Referral reward amount is set to ₹0" };
  }

  // Calculate new balance for referrer
  const prevBalance = Number(referrer.walletBalance) || 0;
  const newBalance = prevBalance + rewardAmount;
  referrer.walletBalance = newBalance;
  referrer.referralEarnings = (Number(referrer.referralEarnings) || 0) + rewardAmount;

  if (!Array.isArray(referrer.walletHistory)) {
    referrer.walletHistory = [];
  }

  const referredDisplayName = user.name || (user.phone ? `Friend (...${user.phone.slice(-4)})` : "A friend");
  const rewardReason = `🎁 Referral Reward: ${referredDisplayName} joined & activated membership (₹${rewardAmount})`;

  referrer.walletHistory.push({
    type: "credit",
    amount: rewardAmount,
    reason: rewardReason,
    balanceAfter: newBalance,
    date: new Date(),
  });

  await referrer.save();

  // Mark referred user's reward as claimed to prevent any duplicate payouts
  user.referralRewardClaimed = true;
  await user.save();

  console.log(
    `[Referral] 🎉 Successfully credited ₹${rewardAmount} to referrer ${referrer.phone} ` +
    `for referred student ${user.phone || user.name}. New balance: ₹${newBalance}`
  );

  // Real-time notification & wallet sync via Socket.IO
  if (io) {
    try {
      io.emit("wallet:updated", {
        phone: referrer.phone,
        walletBalance: newBalance,
        creditAmount: rewardAmount,
        reason: rewardReason,
      });

      io.emit("notification:new", {
        phone: referrer.phone,
        title: "🎁 Referral Reward Credited!",
        message: `You earned ₹${rewardAmount} in your wallet! ${referredDisplayName} activated their membership.`,
        type: "wallet",
      });
    } catch (socketErr) {
      console.warn("[Referral] Socket notification failed:", socketErr.message);
    }
  }

  return {
    credited: true,
    referrerPhone: referrer.phone,
    amount: rewardAmount,
    newBalance,
  };
}

