/**
 * Payment Controller
 * Handles Razorpay order creation, signature verification, admin paid toggle,
 * webhook events, and transaction history for users and admins.
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import User from "../../models/userSchema.js";
import Transaction from "../../models/transactionSchema.js";
import Auth from "../../models/authSchema.js";
import Status from "../../models/statusSchema.js";
import { escapeRegex, getPhoneLookupVariants } from "../utils/phoneUtils.js";
import { creditReferralRewardIfEligible, ensureUserReferralCode, getReferralRewardAmount } from "../services/referral/referralService.js";

function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error("Razorpay credentials not configured");
  }
  return new Razorpay({ key_id, key_secret });
}

// Helper: find user by phone (handles both plain and WhatsApp formats)
async function findUserByPhone(phone) {
  const candidates = [...new Set(getPhoneLookupVariants(phone))];

  for (const candidate of candidates) {
    let user = await User.findOne({ phone: candidate });
    if (user) return user;

    user = await User.findOne({
      userId: { $regex: `^${escapeRegex(candidate)}(@|:)` },
    });
    if (user) return user;
  }

  for (const candidate of candidates) {
    const user = await User.findOne({ phone: { $regex: new RegExp(`^${escapeRegex(candidate)}$`, "i") } });
    if (user) return user;
  }

  // Last resort: match userId containing the bare 10-digit number anywhere before @
  const bare = String(phone).replace(/\D/g, "").replace(/^91/, "").slice(-10);
  if (bare.length === 10) {
    const user = await User.findOne({ userId: { $regex: `^(91)?${escapeRegex(bare)}(@|:)` } });
    if (user) return user;
  }

  return null;
}

/**
 * Normalize a phone number to bare 10-digit format so webhook contact
 * strings like "+919876543210" or "919876543210" match stored records.
 * Returns original string unchanged if it doesn't look like an Indian mobile.
 */
function normalizePhone(raw = "") {
  const digits = raw.replace(/\D/g, ""); // strip all non-digits
  // Indian numbers: 12 digits starting with 91, or 13 starting with 091
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(3);
  return raw; // already bare / international non-Indian
}

/**
 * Try to resolve a user from a Razorpay contact string.
 * Attempts: raw → stripped 10-digit → WhatsApp suffix variants.
 */
async function findUserByContact(contact) {
  if (!contact) return null;
  const normalized = normalizePhone(contact);

  // Try raw contact first, then normalized
  const candidates = [...new Set([contact, normalized])];
  for (const phone of candidates) {
    const user = await findUserByPhone(phone);
    if (user) return user;
  }
  return null;
}

function getRequestPhone(rawPhone = "") {
  try {
    return decodeURIComponent(String(rawPhone)).trim();
  } catch {
    return String(rawPhone).trim();
  }
}

import { getMonthlyGracePeriodInfo } from "../utils/gracePeriodUtils.js";

async function getPaymentAmount() {
  const status = await Status.findOne().select("paymentAmount").lean();
  const amount = Number(status?.paymentAmount ?? 5);
  return Number.isFinite(amount) && amount >= 1 ? Math.round(amount * 100) / 100 : 5;
}

/**
 * GET /api/payments/config
 */
export async function getPaymentConfig(req, res) {
  try {
    const amount = await getPaymentAmount();
    const referralRewardAmount = await getReferralRewardAmount();
    const gracePeriod = getMonthlyGracePeriodInfo();
    res.json({
      amount,
      referralRewardAmount,
      currency: "INR",
      gracePeriod,
      isGracePeriod: gracePeriod.isGracePeriod,
    });
  } catch (err) {
    console.error("[Payment] config error:", err.message);
    res.status(500).json({ error: "Failed to fetch payment settings" });
  }
}

/**
 * GET /api/payments/wallet
 */
export async function getUserWallet(req, res) {
  try {
    let phone = req.user.phone;
    let user = phone ? await findUserByPhone(phone) : null;
    if (!user && req.user.id) {
      const auth = await Auth.findById(req.user.id).select("phone").lean();
      if (auth?.phone) user = await findUserByPhone(auth.phone);
    }

    const referralRewardAmount = await getReferralRewardAmount();

    if (!user) {
      return res.json({
        success: true,
        walletBalance: 0,
        walletHistory: [],
        referralCode: null,
        referralCount: 0,
        referralEarnings: 0,
        referralRewardAmount,
      });
    }

    if (!user.referralCode) {
      await ensureUserReferralCode(user);
    }

    return res.json({
      success: true,
      walletBalance: user.walletBalance || 0,
      walletHistory: user.walletHistory || [],
      referralCode: user.referralCode || null,
      referralCount: user.referralCount || 0,
      referralEarnings: user.referralEarnings || 0,
      referralRewardAmount,
    });
  } catch (err) {
    console.error("[Payment] getUserWallet error:", err.message);
    res.status(500).json({ error: "Failed to fetch wallet information" });
  }
}

/**
 * POST /api/payments/create-order
 */
export async function createOrder(req, res) {
  try {
    const totalFee = await getPaymentAmount();

    // Find user to check wallet balance
    let phone = req.user.phone;
    let user = phone ? await findUserByPhone(phone) : null;
    if (!user && req.user.id) {
      const auth = await Auth.findById(req.user.id).select("phone name").lean();
      if (auth?.phone) {
        phone = auth.phone;
        user = await findUserByPhone(phone);
      }
    }

    const currentWallet = user ? Math.max(0, Number(user.walletBalance) || 0) : 0;

    // CASE 1: 100% Wallet Balance Cover (walletBalance >= totalFee)
    if (user && currentWallet >= totalFee && totalFee > 0) {
      const newBalance = currentWallet - totalFee;
      user.walletBalance = newBalance;
      user.paid = true;
      user.paidAt = new Date();
      if (!Array.isArray(user.walletHistory)) user.walletHistory = [];
      user.walletHistory.push({
        type: "debit",
        amount: totalFee,
        reason: "💳 Subscription Activated (100% Wallet Balance Covered)",
        balanceAfter: newBalance,
        date: new Date(),
      });
      await user.save();

      // Log successful transaction
      await Transaction.create({
        phone: user.phone || phone,
        name: user.name || req.user.name || null,
        userId: user.userId || null,
        razorpayOrderId: `wallet_${Date.now()}`,
        razorpayPaymentId: `wallet_pay_${Date.now()}`,
        amount: totalFee,
        status: "success",
        method: "wallet",
        source: "wallet",
        note: "Activated 100% using Wallet Balance",
      }).catch(() => {});

      // Socket broadcast
      const io = req.app?.get("io");
      if (io) {
        io.emit("user:paid_status", { phone: user.phone || phone, paid: true, paidAt: user.paidAt, name: user.name });
        io.emit("payment:recorded", { phone: user.phone || phone, name: user.name, amount: totalFee, razorpayPaymentId: "wallet_pay", createdAt: new Date() });
      }

      // Credit referral reward (₹5) to referrer if eligible
      await creditReferralRewardIfEligible(user, io);

      console.log(`[Payment] ⚡ 100% Wallet Cover Activated for ${user.phone}. Fee: ₹${totalFee}, New balance: ₹${newBalance}`);
      return res.json({
        success: true,
        walletCovered: true,
        message: `Subscription activated 100% using your wallet balance (₹${totalFee} deducted)!`,
        totalFee,
        walletDiscountApplied: totalFee,
        netPayableINR: 0,
        walletBalance: newBalance,
      });
    }

    // CASE 2: Partial Wallet Discount or Standard Gateway Checkout
    const walletDiscountApplied = Math.min(currentWallet, totalFee);
    const netPayableINR = Math.max(0, totalFee - walletDiscountApplied);
    const amountPaise = Math.round(netPayableINR * 100);

    if (amountPaise < 100) {
      return res.status(400).json({ error: "Net payable amount must be at least ₹1 (100 paise)" });
    }

    const razorpay = getRazorpay();
    const shortId = String(req.user.id).slice(-8);
    const shortTs = String(Date.now()).slice(-8);
    const receipt = `r_${shortId}_${shortTs}`;

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        userId: String(req.user.id || ""),
        phone: String(req.user.phone || phone || ""),
        name: String(req.user.name || ""),
        totalFee: String(totalFee),
        walletDiscountApplied: String(walletDiscountApplied),
      },
    });

    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      totalFee,
      walletDiscountApplied,
      netPayableINR,
      walletBalance: currentWallet,
    });
  } catch (err) {
    const razorpayMsg = err?.error?.description || err?.message || "Failed to create payment order";
    console.error("[Payment] create-order error:", razorpayMsg, err?.error || "");
    res.status(500).json({ error: razorpayMsg });
  }
}

/**
 * POST /api/payments/verify
 */
export async function verifyPayment(req, res) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) return res.status(500).json({ error: "Razorpay not configured" });

    // Verify HMAC-SHA256 signature using constant-time comparison (prevents timing attacks)
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", key_secret)
      .update(body)
      .digest("hex");

    let sigValid = false;
    try {
      sigValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(razorpay_signature, "hex")
      );
    } catch {
      // Buffer lengths differ if signature is malformed — treat as invalid
      sigValid = false;
    }

    if (!sigValid) {
      console.warn("[Payment] Signature mismatch for order:", razorpay_order_id);

      // Log failed transaction
      await Transaction.create({
        phone: req.user.phone || "unknown",
        name:  req.user.name  || null,
        razorpayOrderId:   razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        amount: 0,
        status: "failed",
        source: "razorpay",
      }).catch(() => {});

      return res.status(400).json({ error: "Payment verification failed — signature mismatch" });
    }

    // Find user — use phone from auth context, fall back to Auth DB lookup by JWT id
    let phone = req.user.phone;
    const authId = req.user.id;

    console.log(`[Payment] Verify - phone: ${phone}, authId: ${authId}, orderId: ${razorpay_order_id}`);

    let user = null;

    if (phone) {
      user = await findUserByPhone(phone);
    }

    // Fallback: resolve phone from Auth document using JWT id
    if (!user && authId) {
      const auth = await Auth.findById(authId).select("phone name").lean();
      if (auth?.phone) {
        console.log(`[Payment] Resolved phone from Auth doc: ${auth.phone}`);
        phone = auth.phone;
        req.user.phone = auth.phone;
        req.user.name  = req.user.name || auth.name;
        user = await findUserByPhone(phone);
      }
    }

    if (!user) {
      console.error(`[Payment] ❌ User not found — phone: ${phone}, authId: ${authId}`);
      return res.status(404).json({ error: "User record not found. Please contact support." });
    }

    // ── Idempotent guard ──────────────────────────────────────────
    // If webhook already processed this exact Razorpay order ID, ensure user is marked paid and return success.
    const existing = await Transaction.findOne({
      razorpayOrderId: razorpay_order_id,
      status: "success",
    }).lean();
    if (existing) {
      console.log(`[Payment] Order ${razorpay_order_id} was already recorded as success (e.g. via webhook)`);
      if (!user.paid) {
        user.paid = true;
        user.razorpayOrderId = razorpay_order_id;
        user.razorpayPaymentId = razorpay_payment_id;
        user.paidAt = user.paidAt || new Date();
        await user.save();
      }
      return res.json({ success: true, message: "Payment verified successfully!", alreadyProcessed: true });
    }

    // Fetch amount from Razorpay for accurate logging
    let amountINR = 0;
    try {
      const rzp = getRazorpay();
      const orderDetails = await rzp.orders.fetch(razorpay_order_id);
      amountINR = orderDetails.amount / 100;
    } catch { /* non-critical */ }

    // Deduct applied wallet discount from user balance if discount was used
    const currentWallet = Math.max(0, Number(user.walletBalance) || 0);
    const totalFee = await getPaymentAmount();
    const discountUsed = Math.min(currentWallet, Math.max(0, totalFee - amountINR));

    if (discountUsed > 0) {
      const newBalance = Math.max(0, currentWallet - discountUsed);
      user.walletBalance = newBalance;
      if (!Array.isArray(user.walletHistory)) user.walletHistory = [];
      user.walletHistory.push({
        type: "debit",
        amount: discountUsed,
        reason: `💳 Applied Wallet Discount to Subscription Payment (Paid Net ₹${amountINR} via Gateway)`,
        balanceAfter: newBalance,
        date: new Date(),
      });
      console.log(`[Payment Wallet] Deducted ₹${discountUsed} wallet discount from ${user.phone}. New wallet balance: ₹${newBalance}`);
    }

    // Mark user paid
    user.paid = true;
    user.razorpayOrderId   = razorpay_order_id;
    user.razorpayPaymentId = razorpay_payment_id;
    user.paidAt = new Date();
    await user.save();

    // Log successful transaction
    await Transaction.create({
      phone,
      name:  req.user.name || user.name || null,
      userId: user.userId || null,
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: amountINR,
      status: "success",
      source: "razorpay",
    });

    // Real-time socket broadcast to live admin dashboards
    const io = req.app?.get("io");
    if (io) {
      io.emit("user:paid_status", {
        phone: user.phone || phone,
        paid: true,
        paidAt: user.paidAt,
        name: user.name || req.user?.name,
      });
      io.emit("payment:recorded", {
        phone: user.phone || phone,
        name: user.name || req.user?.name,
        amount: amountINR,
        razorpayPaymentId: razorpay_payment_id,
        createdAt: new Date(),
      });
    }

    // Credit referral reward (₹5) to referrer if eligible
    await creditReferralRewardIfEligible(user, io);

    console.log(`[Payment] ✅ Payment verified & logged: ${phone} ₹${amountINR}`);
    res.json({ success: true, message: "Payment successful! Access granted." });
  } catch (err) {
    console.error("[Payment] verify error:", err.message);
    res.status(500).json({ error: "Payment verification failed" });
  }
}

/**
 * POST /api/payments/admin/wallet-adjust
 * Admin endpoint to manually credit, debit, or set a student's wallet balance.
 */
export async function adminAdjustWallet(req, res) {
  try {
    const { phone, actionType, amount, reason } = req.body || {};
    const cleanPhone = getRequestPhone(phone);
    if (!cleanPhone) return res.status(400).json({ error: "Student phone number is required" });

    let normalizedAction = actionType;
    if (actionType === "add") normalizedAction = "credit";
    if (actionType === "remove") normalizedAction = "debit";

    const validActions = ["credit", "debit", "set"];
    if (!validActions.includes(normalizedAction)) {
      return res.status(400).json({ error: "Invalid actionType. Must be 'credit', 'debit', or 'set'" });
    }

    const numAmount = Number(amount);
    if (normalizedAction === "set") {
      if (isNaN(numAmount) || numAmount < 0) {
        return res.status(400).json({ error: "Amount must be 0 or greater for setting wallet balance" });
      }
    } else {
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number" });
      }
    }

    const user = await findUserByPhone(cleanPhone);
    if (!user) return res.status(404).json({ error: "Student user record not found" });

    const currentBalance = Number(user.walletBalance) || 0;
    let newBalance = currentBalance;
    let transactionType = normalizedAction === "debit" ? "debit" : "credit";
    let changeAmount = numAmount;

    if (normalizedAction === "credit") {
      newBalance = currentBalance + numAmount;
    } else if (normalizedAction === "debit") {
      if (numAmount > currentBalance) {
        return res.status(400).json({ error: `Cannot debit ₹${numAmount}. Current student wallet balance is only ₹${currentBalance}` });
      }
      newBalance = currentBalance - numAmount;
    } else if (normalizedAction === "set") {
      const diff = numAmount - currentBalance;
      transactionType = diff >= 0 ? "credit" : "debit";
      changeAmount = Math.abs(diff);
      newBalance = numAmount;
    }

    user.walletBalance = newBalance;
    if (!Array.isArray(user.walletHistory)) user.walletHistory = [];
    user.walletHistory.push({
      type: transactionType,
      amount: changeAmount,
      reason: reason?.trim() ? `🛡️ Admin: ${reason.trim()}` : `🛡️ Admin Manual ${actionType.toUpperCase()}`,
      balanceAfter: newBalance,
      date: new Date(),
    });
    await user.save();

    console.log(`[Admin Wallet] ${actionType.toUpperCase()} ₹${numAmount} for ${user.phone}. New balance: ₹${newBalance}`);

    return res.json({
      success: true,
      message: `Wallet ${actionType}ed successfully for ${user.name || user.phone}!`,
      walletBalance: newBalance,
      walletHistory: user.walletHistory,
    });
  } catch (err) {
    console.error("[Admin Wallet] adminAdjustWallet error:", err.message);
    res.status(500).json({ error: "Failed to adjust wallet balance" });
  }
}

/**
 * GET /api/payments/admin/wallet-history/:phone
 * Fetch full wallet history for a student from admin dashboard.
 */
export async function adminGetStudentWallet(req, res) {
  try {
    const cleanPhone = getRequestPhone(req.params.phone);
    if (!cleanPhone) return res.status(400).json({ error: "Phone number required" });

    let user = await findUserByPhone(cleanPhone);
    if (!user) return res.status(404).json({ error: "Student user record not found" });

    return res.json({
      success: true,
      user: {
        name: user.name || user.registeredName,
        phone: user.phone,
        walletBalance: user.walletBalance || 0,
      },
      walletHistory: user.walletHistory || [],
    });
  } catch (err) {
    console.error("[Admin Wallet] adminGetStudentWallet error:", err.message);
    res.status(500).json({ error: "Failed to fetch student wallet history" });
  }
}

/**
 * PATCH /api/payments/admin/toggle-paid/:phone
 */
export async function adminTogglePaid(req, res) {
  try {
    const phone = getRequestPhone(req.params.phone);
    const { note } = req.body || {};

    if (!phone) return res.status(400).json({ error: "Phone number is required" });

    const user = await findUserByPhone(phone);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.paid = !user.paid;
    if (user.paid && !user.paidAt) {
      user.paidAt = new Date();
    } else if (!user.paid) {
      user.paidAt = null;
    }
    await user.save();

    // Log admin manual transaction
    if (user.paid) {
      try {
        await Transaction.create({
          phone: user.phone || phone,
          name:   user.name || null,
          userId: user.userId || null,
          amount: 0,
          status: "manual",
          source: "admin",
          note:   note || "Manually activated by admin",
        });
      } catch (logErr) {
        console.warn("[Payment] manual transaction log failed:", logErr.message);
      }
    }

    // Real-time socket broadcast to live admin dashboards
    const io = req.app?.get("io");
    if (io) {
      io.emit("user:paid_status", {
        phone: user.phone || phone,
        paid: user.paid,
        paidAt: user.paidAt,
        name: user.name,
      });
      if (user.paid) {
        io.emit("payment:recorded", {
          phone: user.phone || phone,
          name: user.name,
          amount: 0,
          source: "admin",
          createdAt: new Date(),
        });
      }
    }

    // Credit referral reward (₹5) to referrer if user became paid
    if (user.paid) {
      await creditReferralRewardIfEligible(user, io);
    }

    console.log(`[Payment] Admin toggled paid=${user.paid} for ${phone}`);
    res.json({ success: true, paid: user.paid, paidAt: user.paidAt });
  } catch (err) {
    console.error("[Payment] admin toggle-paid error:", err);
    res.status(500).json({ error: err.message || "Failed to toggle payment status" });
  }
}

/**
 * GET /api/payments/my-transactions
 * Returns the logged-in user's payment history
 */
export async function getMyTransactions(req, res) {
  try {
    let phone = req.user.phone;

    // Fallback: resolve phone from Auth doc if missing from token context
    if (!phone && req.user.id) {
      const auth = await Auth.findById(req.user.id).select("phone").lean();
      phone = auth?.phone || null;
    }

    if (!phone) return res.status(400).json({ error: "Cannot resolve user phone" });

    const transactions = await Transaction.find({ phone })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Also get current paid status from user doc
    const user = await findUserByPhone(phone);

    res.json({
      transactions,
      paid:      user?.paid      ?? false,
      paidAt:    user?.paidAt    ?? null,
      paymentId: user?.razorpayPaymentId ?? null,
    });
  } catch (err) {
    console.error("[Payment] my-transactions error:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
}

/**
 * GET /api/payments/admin/all
 * Returns all transactions for admin dashboard
 */
export async function adminGetAllTransactions(req, res) {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || "1"));
    const limit = Math.min(500, parseInt(req.query.limit || "200"));
    const skip  = (page - 1) * limit;
    const status = req.query.status; // filter by status

    const filter = status ? { status } : {};

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Transaction.countDocuments(filter),
    ]);

    // Revenue stats
    const stats = await Transaction.aggregate([
      { $match: { status: "success" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    const totalRevenue = stats[0]?.total ?? 0;
    const totalPaid    = stats[0]?.count ?? 0;
    const totalManual  = await Transaction.countDocuments({ status: "manual" });

    res.json({
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: { totalRevenue, totalPaid, totalManual },
    });
  } catch (err) {
    console.error("[Payment] admin-all error:", err.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
}

/**
 * POST /api/payments/webhook
 * Razorpay server-to-server webhook — no JWT auth, verified by HMAC signature.
 * Called by Razorpay even when the user closes the browser before the checkout
 * handler() fires.  Must respond HTTP 200 within ~5 s or Razorpay will retry.
 *
 * Setup: Razorpay Dashboard → Settings → Webhooks → Add
 *   URL:    https://<your-domain>/api/payments/webhook
 *   Events: payment.captured
 *   Secret: set RAZORPAY_WEBHOOK_SECRET in .env to the value you enter here
 */
export async function handleWebhook(req, res) {
  // ── 1. Ensure webhook secret is configured ────────────────────────────────
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Webhook] RAZORPAY_WEBHOOK_SECRET is not configured — ignoring event");
    return res.status(500).end();
  }

  // ── 2. Verify HMAC-SHA256 signature using constant-time comparison ─────────
  // req.body is a raw Buffer here (express.raw() middleware in server.js).
  const signature = req.headers["x-razorpay-signature"] || "";
  const rawBody   = req.body; // Buffer

  if (!Buffer.isBuffer(rawBody) || !rawBody.length) {
    console.warn("[Webhook] Empty or non-Buffer body — likely middleware misconfiguration");
    return res.status(400).end();
  }

  const expectedSig = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  let sigValid = false;
  try {
    sigValid = crypto.timingSafeEqual(
      Buffer.from(expectedSig, "hex"),
      Buffer.from(signature,    "hex")
    );
  } catch {
    sigValid = false; // mismatched lengths = invalid sig
  }

  if (!sigValid) {
    console.warn("[Webhook] ❌ Invalid signature — request rejected");
    return res.status(400).end();
  }

  // ── 3. Parse event ─────────────────────────────────────────────────────────
  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    console.error("[Webhook] Failed to parse JSON body");
    return res.status(400).end();
  }

  const eventType = event.event;
  console.log(`[Webhook] Received event: ${eventType}`);

  // We only care about payment.captured — acknowledge everything else silently
  if (eventType !== "payment.captured") {
    return res.status(200).json({ received: true, note: "event ignored" });
  }

  // ── 4. Extract payment entity ──────────────────────────────────────────────
  const payment   = event?.payload?.payment?.entity;
  const orderId   = payment?.order_id;
  const paymentId = payment?.id;
  const amountINR = (payment?.amount ?? 0) / 100;
  const contact   = payment?.contact || null; // phone the user entered in modal

  if (!orderId || !paymentId) {
    console.error("[Webhook] Missing order_id or payment id in payload");
    return res.status(200).json({ received: true, note: "payload incomplete" });
  }

  // ── 5. Idempotency guard — skip if already processed ──────────────────────
  try {
    const already = await Transaction.findOne({
      razorpayOrderId: orderId,
      status: "success",
    }).lean();

    if (already) {
      console.log(`[Webhook] Duplicate event ignored — order already recorded: ${orderId}`);
      return res.status(200).json({ received: true, note: "duplicate" });
    }
  } catch (err) {
    // Non-fatal — continue and let the upsert handle it
    console.warn("[Webhook] Idempotency check failed:", err.message);
  }

  // ── 6. Resolve user from notes or contact phone ──────────────────────────
  // Razorpay sends payment.contact = phone the user entered in modal, plus any
  // order notes attached during create-order.
  const notes = payment?.notes || event?.payload?.order?.entity?.notes || {};
  const notePhone = notes?.phone;
  const noteUserId = notes?.userId;

  let user = null;
  if (notePhone) {
    user = await findUserByContact(notePhone);
  }
  if (!user && contact) {
    user = await findUserByContact(contact);
  }
  if (!user && noteUserId) {
    try {
      const auth = await Auth.findById(noteUserId).select("phone").lean();
      if (auth?.phone) {
        user = await findUserByContact(auth.phone);
      }
    } catch {}
  }

  if (!user) {
    // Return 200 so Razorpay doesn't retry — but log for manual follow-up.
    console.error(
      `[Webhook] ❌ User not found for contact: ${contact} / notePhone: ${notePhone} — orderId: ${orderId}` +
      " — manual resolution needed in admin panel"
    );
    return res.status(200).json({ received: true, note: "user not found" });
  }

  // ── 7. Mark user as paid ───────────────────────────────────────────────────
  user.paid = true;
  user.razorpayOrderId   = orderId;
  user.razorpayPaymentId = paymentId;
  user.paidAt = user.paidAt || new Date(); // don't overwrite existing paidAt
  await user.save();

  // ── 8. Log transaction ─────────────────────────────────────────────────────
  try {
    await Transaction.create({
      phone:  user.phone || contact || "unknown",
      name:   user.name  || null,
      userId: user.userId || null,
      razorpayOrderId:   orderId,
      razorpayPaymentId: paymentId,
      amount: amountINR,
      status: "success",
      source: "razorpay",
      note:   "captured via webhook",
    });
  } catch (logErr) {
    // Log failure is non-critical — user is already marked paid
    console.warn("[Webhook] Transaction log failed:", logErr.message);
  }

  // Real-time socket broadcast to live admin dashboards
  const io = req.app?.get("io");
  if (io) {
    io.emit("user:paid_status", {
      phone: user.phone || contact,
      paid: true,
      paidAt: user.paidAt,
      name: user.name,
    });
    io.emit("payment:recorded", {
      phone: user.phone || contact,
      name: user.name,
      amount: amountINR,
      razorpayPaymentId: paymentId,
      createdAt: new Date(),
      source: "webhook",
    });
  }

  // Credit referral reward (₹5) to referrer if eligible
  await creditReferralRewardIfEligible(user, io);

  console.log(`[Webhook] ✅ Payment captured: ${user.phone} ₹${amountINR} (order: ${orderId})`);
  return res.status(200).json({ received: true });
}
