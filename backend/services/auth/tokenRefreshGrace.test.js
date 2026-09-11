import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

// Mock Auth model and environment before importing authService
const mockAuth = {
  _id: "507f1f77bcf86cd799439011",
  role: "user",
  phone: "919061181938",
  isActive: true,
  refreshTokens: [],
  save: vi.fn().mockResolvedValue(true),
};

vi.mock("../../../models/authSchema.js", () => ({
  default: {
    findById: vi.fn().mockImplementation(() => Promise.resolve(mockAuth)),
    findOne: vi.fn().mockImplementation(() => Promise.resolve(mockAuth)),
  },
}));

vi.mock("../../../models/userSchema.js", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ paid: true }) }) }),
  },
}));

process.env.JWT_SECRET = "test-secret-key-12345678901234567890";

import { refreshAccessToken } from "./authService.js";

describe("Refresh Token Grace Period & Concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.refreshTokens = [];
  });

  it("rotates refresh token and sets rotatedAt timestamp", async () => {
    const originalToken = jwt.sign(
      { id: mockAuth._id, type: "refresh" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    mockAuth.refreshTokens.push({
      token: originalToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      rotatedAt: null,
      replacedBy: null,
    });

    const result = await refreshAccessToken(originalToken, "127.0.0.1");

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshToken).not.toBe(originalToken);

    // Original token should still exist in record marked with rotatedAt
    const oldRecord = mockAuth.refreshTokens.find(rt => rt.token === originalToken);
    expect(oldRecord).toBeDefined();
    expect(oldRecord.rotatedAt).toBeInstanceOf(Date);
    expect(oldRecord.replacedBy).toBe(result.refreshToken);
  });

  it("handles duplicate concurrent refresh within 60s grace window without logging user out", async () => {
    const originalToken = jwt.sign(
      { id: mockAuth._id, type: "refresh", jti: "orig-token-1" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );
    const newActiveToken = jwt.sign(
      { id: mockAuth._id, type: "refresh", jti: "active-token-2" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Simulate token rotated 5 seconds ago (race condition during server update)
    mockAuth.refreshTokens.push({
      token: originalToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 5000),
      rotatedAt: new Date(Date.now() - 5000), // 5 seconds ago
      replacedBy: newActiveToken,
    });
    mockAuth.refreshTokens.push({
      token: newActiveToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 5000),
      rotatedAt: null,
      replacedBy: null,
    });

    // Presentation of originalToken within grace period must succeed!
    const result = await refreshAccessToken(originalToken, "127.0.0.1");

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBe(newActiveToken);
    // Refresh tokens array must NOT be cleared
    expect(mockAuth.refreshTokens.length).toBeGreaterThan(0);
  });

  it("revokes all tokens if rotated token is reused past the 60-second grace window", async () => {
    const expiredRotatedToken = jwt.sign(
      { id: mockAuth._id, type: "refresh", jti: "expired-token-3" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Rotated 2 minutes ago (beyond 60s window)
    mockAuth.refreshTokens.push({
      token: expiredRotatedToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 120_000),
      rotatedAt: new Date(Date.now() - 120_000),
      replacedBy: "some-replacement-token",
    });

    await expect(refreshAccessToken(expiredRotatedToken, "127.0.0.1")).rejects.toThrow(
      "Invalid refresh token. Please login again."
    );

    // Truly re-used token beyond grace window should revoke all tokens
    expect(mockAuth.refreshTokens).toEqual([]);
  });
});
