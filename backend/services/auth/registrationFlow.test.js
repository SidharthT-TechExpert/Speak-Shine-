import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import {
  normalizeIndianPhone,
  phoneVariants,
  phoneInQuery,
  resolveOnlineSocketId,
} from "../../utils/phoneVariants.js";

const mockAuthFindOne = vi.fn();
const mockUserFindOne = vi.fn();
const mockPendingCountDocuments = vi.fn();
const mockPendingFindOneAndUpdate = vi.fn();

vi.mock("../../../models/authSchema.js", () => ({
  default: {
    findOne: (...args) => mockAuthFindOne(...args),
  },
}));

vi.mock("../../../models/userSchema.js", () => ({
  default: {
    findOne: (...args) => mockUserFindOne(...args),
  },
}));

vi.mock("../../../models/pendingRegistrationSchema.js", () => ({
  default: {
    countDocuments: (...args) => mockPendingCountDocuments(...args),
    findOneAndUpdate: (...args) => mockPendingFindOneAndUpdate(...args),
  },
}));

vi.mock("../../config/redis.js", () => ({
  isRedisAvailable: () => false,
  getRedisClient: () => null,
}));

vi.mock("../whatsapp/whatsappService.js", () => ({
  getStatus: () => ({ isConnected: false }),
  sendAdminDirectMessage: vi.fn(),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-12345678901234567890";

import {
  sendRegistrationOTP,
  verifyRegistrationOTP,
  submitRegistration,
} from "./authService.js";

describe("phoneVariants & normalizeIndianPhone", () => {
  it("preserves 10-digit numbers starting with 91 while stripping country-code prefixes", () => {
    expect(normalizeIndianPhone("9123456789")).toBe("9123456789");
    expect(normalizeIndianPhone("919123456789")).toBe("9123456789");
    expect(normalizeIndianPhone("+91 9876543210")).toBe("9876543210");
  });

  it("builds unique DB query variants and resolves socket ids across formats", () => {
    const variants = phoneVariants("+91 9876543210");
    expect(variants).toContain("9876543210");
    expect(variants).toContain("919876543210");
    expect(variants).toContain("+919876543210");
    expect(phoneInQuery("9876543210")).toEqual({ $in: expect.arrayContaining(["9876543210", "919876543210"]) });

    const onlineUsers = new Map([["919876543210", "sock-42"]]);
    expect(resolveOnlineSocketId(onlineUsers, "9876543210")).toBe("sock-42");
  });
});

describe("Registration flow security & validation fixes", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    global._otpStore = {};
    global._otpAttemptStore = {};
    global._otpRateStore = {};
    global._usedVerifyTokens = {};
    mockAuthFindOne.mockResolvedValue(null);
    mockPendingCountDocuments.mockResolvedValue(0);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("throws and cleans up OTP in production when all OTP delivery channels fail", async () => {
    process.env.NODE_ENV = "production";
    await expect(sendRegistrationOTP("9876543210")).rejects.toThrow("Failed to send OTP");
    expect(global._otpStore["otp:register:9876543210"]).toBeUndefined();
  });

  it("rejects dev master OTP 112233 in production", async () => {
    process.env.NODE_ENV = "production";
    await expect(verifyRegistrationOTP("9876543210", "112233")).rejects.toThrow("OTP expired or not found");
  });

  it("rejects self-referral by phone match without consuming verifyToken", async () => {
    mockUserFindOne
      .mockReturnValueOnce({
        select: () => ({
          lean: async () => ({
            _id: "user-1",
            name: "Self User",
            phone: "919876543210",
            referralCode: "SELF123",
          }),
        }),
      })
      .mockReturnValueOnce({
        select: () => ({
          lean: async () => null,
        }),
      });

    const token = jwt.sign(
      { phone: "9876543210", purpose: "register", jti: "verify-jti-1" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    await expect(
      submitRegistration(token, "Self User", "StrongPass!1", "SELF123")
    ).rejects.toThrow("You cannot use your own referral code.");
    expect(mockPendingFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
