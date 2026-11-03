import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrder, getPaymentPricing } from "./paymentController.js";
import User from "../../models/userSchema.js";
import Status from "../../models/statusSchema.js";
import Auth from "../../models/authSchema.js";
import Transaction from "../../models/transactionSchema.js";

vi.mock("razorpay", () => {
  return {
    default: class MockRazorpay {
      constructor() {
        this.orders = {
          create: vi.fn().mockResolvedValue({
            id: "order_123456",
            amount: 300,
            currency: "INR",
          }),
        };
      }
    },
  };
});

vi.mock("../../models/userSchema.js", () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock("../../models/statusSchema.js", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ coursePrice: 100, taxAmount: 18, paymentAmount: 118 }),
      }),
    }),
  },
}));

vi.mock("../../models/transactionSchema.js", () => ({
  default: {
    create: vi.fn().mockResolvedValue({}),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock("../../models/authSchema.js", () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock("../utils/phoneUtils.js", () => ({
  findUserByPhone: vi.fn(),
  getPhoneLookupVariants: vi.fn().mockReturnValue(["9876543210"]),
  escapeRegex: vi.fn(),
}));

import { findUserByPhone } from "../utils/phoneUtils.js";

describe("Payment Controller - Wallet vs Direct Gateway Options", () => {
  let req, res;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = "rzp_test_key";
    process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
    req = {
      user: { id: "user123", phone: "9876543210", name: "Test User" },
      body: {},
      app: { get: vi.fn() },
    };
    res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
  });

  it("should create partial wallet order when useWallet is true and walletBalance > 0", async () => {
    const mockUser = {
      phone: "9876543210",
      walletBalance: 20,
      walletHistory: [],
      save: vi.fn(),
    };
    findUserByPhone.mockResolvedValue(mockUser);

    req.body = { useWallet: true, paymentMethod: "wallet" };
    await createOrder(req, res);

    expect(res.json).toHaveBeenCalled();
    const response = res.json.mock.calls[0][0];
    expect(response.totalFee).toBe(118);
    expect(response.coursePrice).toBe(100);
    expect(response.taxAmount).toBe(18);
    expect(response.walletDiscountApplied).toBe(20);
    expect(response.netPayableINR).toBe(98); // (100 - 20) + 18
    expect(response.useWallet).toBe(true);
  });

  it("should bypass wallet deduction and order full fee when useWallet is false", async () => {
    const mockUser = {
      phone: "9876543210",
      walletBalance: 150,
      walletHistory: [],
      save: vi.fn(),
    };
    findUserByPhone.mockResolvedValue(mockUser);

    req.body = { useWallet: false, paymentMethod: "upi" };
    await createOrder(req, res);

    expect(res.json).toHaveBeenCalled();
    const response = res.json.mock.calls[0][0];
    expect(response.totalFee).toBe(118);
    expect(response.coursePrice).toBe(100);
    expect(response.taxAmount).toBe(18);
    expect(response.walletDiscountApplied).toBe(0);
    expect(response.netPayableINR).toBe(118);
    expect(response.useWallet).toBe(false);
  });

  it("should require confirmation without auto-debiting when wallet balance >= coursePrice", async () => {
    const mockUser = {
      phone: "9876543210",
      walletBalance: 120,
      walletHistory: [],
      paid: false,
      save: vi.fn(),
    };
    findUserByPhone.mockResolvedValue(mockUser);

    // Initial visit / createOrder without confirmWalletPayment
    req.body = { useWallet: true, paymentMethod: "wallet" };
    await createOrder(req, res);

    expect(res.json).toHaveBeenCalled();
    const response = res.json.mock.calls[0][0];
    expect(response.walletCovered).toBe(true);
    expect(response.requiresConfirmation).toBe(true);
    expect(response.walletRequiredAmount).toBe(100); // Only coursePrice, tax waived!
    expect(mockUser.save).not.toHaveBeenCalled(); // 🛡️ Did NOT auto-debit!
    expect(mockUser.paid).toBe(false);
  });

  it("should only deduct coursePrice (exempt tax) and activate when confirmWalletPayment is true", async () => {
    const mockUser = {
      phone: "9876543210",
      walletBalance: 120,
      walletHistory: [],
      paid: false,
      save: vi.fn().mockResolvedValue(true),
    };
    findUserByPhone.mockResolvedValue(mockUser);

    req.body = { useWallet: true, paymentMethod: "wallet", confirmWalletPayment: true };
    await createOrder(req, res);

    expect(res.json).toHaveBeenCalled();
    const response = res.json.mock.calls[0][0];
    expect(response.walletCovered).toBe(true);
    expect(response.confirmed).toBe(true);
    expect(mockUser.walletBalance).toBe(20); // 120 - 100 coursePrice (tax of 18 was waived!)
    expect(mockUser.paid).toBe(true);
    expect(mockUser.save).toHaveBeenCalled();
    expect(mockUser.walletHistory.length).toBe(1);
    expect(mockUser.walletHistory[0].amount).toBe(100);
  });
});
