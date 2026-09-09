import { describe, it, expect, vi, beforeEach } from "vitest";
import Auth from "../../../models/authSchema.js";
import User from "../../../models/userSchema.js";
import { updateUserTheme } from "./userService.js";

vi.mock("../../../models/authSchema.js", () => ({
  default: {
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock("../../../models/userSchema.js", () => ({
  default: {
    updateMany: vi.fn(),
  },
}));

describe("User Theme Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes light mode correctly and updates Auth and User documents", async () => {
    const mockAuth = {
      _id: "user123",
      phone: "919876543210",
      theme: "light",
      isDark: false,
    };

    Auth.findByIdAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockAuth),
      }),
    });
    User.updateMany.mockResolvedValue({ acknowledged: true });

    const result = await updateUserTheme("user123", { theme: "light", isDark: false });

    expect(result).toEqual({ theme: "light", isDark: false });
    expect(Auth.findByIdAndUpdate).toHaveBeenCalledWith(
      "user123",
      { $set: { theme: "light", isDark: false } },
      { new: true }
    );
    expect(User.updateMany).toHaveBeenCalledWith(
      { $or: [{ phone: "919876543210" }, { phone: "9876543210" }, { phone: "919876543210" }, { phone: "+919876543210" }] },
      { $set: { theme: "light", isDark: false } }
    );
  });

  it("normalizes dark mode correctly when isDark is true", async () => {
    const mockAuth = {
      _id: "user456",
      phone: "9876543210",
      theme: "dark",
      isDark: true,
    };

    Auth.findByIdAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockAuth),
      }),
    });
    User.updateMany.mockResolvedValue({ acknowledged: true });

    const result = await updateUserTheme("user456", { theme: "dark", isDark: true });

    expect(result).toEqual({ theme: "dark", isDark: true });
    expect(Auth.findByIdAndUpdate).toHaveBeenCalledWith(
      "user456",
      { $set: { theme: "dark", isDark: true } },
      { new: true }
    );
  });

  it("throws 404 when auth record is not found", async () => {
    Auth.findByIdAndUpdate.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(updateUserTheme("nonexistent", { theme: "light" })).rejects.toThrow("User not found");
  });
});
