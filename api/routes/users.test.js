import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import userRoutes from "./users.js";
import Auth from "../../models/authSchema.js";

// Mock the models
vi.mock("../../models/authSchema.js");
vi.mock("../../models/userSchema.js");

const JWT_SECRET = process.env.JWT_SECRET || "speakshine_secret_2024";

// Create test app
const app = express();
app.use(express.json());
app.use("/api/users", userRoutes);

// Helper to generate valid JWT token
function generateToken(role = "admin", phone = "919876543210") {
  return jwt.sign({ id: "test-id", phone, role, name: "Test User" }, JWT_SECRET, { expiresIn: "1h" });
}

describe("PATCH /api/users/:phone/role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should change user role to trainer (admin)", async () => {
    const token = generateToken("admin");
    
    // Mock Auth.findOneAndUpdate to return updated auth
    Auth.findOneAndUpdate = vi.fn().mockResolvedValue({
      _id: "auth-id",
      phone: "917777777774",
      role: "trainer",
      name: "Target User"
    });
    
    const res = await request(app)
      .patch("/api/users/917777777774/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "trainer" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("role", "trainer");
    expect(Auth.findOneAndUpdate).toHaveBeenCalledWith(
      { phone: "917777777774" },
      { role: "trainer" },
      { new: true }
    );
  });

  it("should change user role to admin (admin)", async () => {
    const token = generateToken("admin");
    
    Auth.findOneAndUpdate = vi.fn().mockResolvedValue({
      _id: "auth-id",
      phone: "917777777774",
      role: "admin",
      name: "Target User"
    });
    
    const res = await request(app)
      .patch("/api/users/917777777774/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("role", "admin");
  });

  it("should change user role back to user (admin)", async () => {
    const token = generateToken("admin");
    
    Auth.findOneAndUpdate = vi.fn().mockResolvedValue({
      _id: "auth-id",
      phone: "917777777774",
      role: "user",
      name: "Target User"
    });
    
    const res = await request(app)
      .patch("/api/users/917777777774/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "user" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("role", "user");
  });

  it("should return 400 for invalid role value", async () => {
    const token = generateToken("admin");
    
    const res = await request(app)
      .patch("/api/users/917777777774/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "superadmin" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Invalid role");
  });

  it("should return 400 for missing role value", async () => {
    const token = generateToken("admin");
    
    const res = await request(app)
      .patch("/api/users/917777777774/role")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Invalid role");
  });

  it("should return 403 for non-admin (trainer)", async () => {
    const token = generateToken("trainer");
    
    const res = await request(app)
      .patch("/api/users/917777777774/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "trainer" });

    expect(res.status).toBe(403);
  });

  it("should return 403 for non-admin (user)", async () => {
    const token = generateToken("user");
    
    const res = await request(app)
      .patch("/api/users/917777777774/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });

    expect(res.status).toBe(403);
  });

  it("should return 404 for non-existent user", async () => {
    const token = generateToken("admin");
    
    // Mock Auth.findOneAndUpdate to return null
    Auth.findOneAndUpdate = vi.fn().mockResolvedValue(null);
    
    const res = await request(app)
      .patch("/api/users/919999999999/role")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "trainer" });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error", "Auth record not found");
  });

  it("should return 401 for missing token", async () => {
    const res = await request(app)
      .patch("/api/users/917777777774/role")
      .send({ role: "trainer" });

    expect(res.status).toBe(401);
  });
});
