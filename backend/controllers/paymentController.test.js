import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrder } from "./paymentController.js";
import User from "../../models/userSchema.js";
import Status from "../../models/statusSchema.js";
import Auth from "../../models/authSchema.js";

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
        lean: vi.fn().mockResolvedValue({ paymentAmount: 5 }),
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
  getPhoneLookupVariants: vi.fn(),
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
      walletBalance: 2,
      walletHistory: [],
      save: vi.fn(),
    };
    findUserByPhone.mockResolvedValue(mockUser);

    req.body = { useWallet: true };
    await createOrder(req, res);

    expect(res.json).toHaveBeenCalled();
    const response = res.json.mock.calls[0][0];
    expect(response.totalFee).toBe(5);
    expect(response.walletDiscountApplied).toBe(2);
    expect(response.netPayableINR).toBe(3);
    expect(response.useWallet).toBe(true);
  });

  it("should bypass wallet deduction and order full fee when useWallet is false", async () => {
    const mockUser = {
      phone: "9876543210",
      walletBalance: 10,
      walletHistory: [],
      save: vi.fn(),
    };
    findUserByPhone.mockResolvedValue(mockUser);

    req.body = { useWallet: false, paymentMethod: "upi" };
    await createOrder(req, res);

    expect(res.json).toHaveBeenCalled();
    const response = res.json.mock.calls[0][0];
    expect(response.totalFee).toBe(5);
    expect(response.walletDiscountApplied).toBe(0);
    expect(response.netPayableINR).toBe(5);
    expect(response.useWallet).toBe(false);
  });
});
