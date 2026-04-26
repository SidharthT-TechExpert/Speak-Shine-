import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import submissionRoutes from "./submissions.js";
import User from "../../models/userSchema.js";
import Auth from "../../models/authSchema.js";

// Mock the models
vi.mock("../../models/userSchema.js");
vi.mock("../../models/authSchema.js");

const JWT_SECRET = process.env.JWT_SECRET || "speakshine_secret_2024";

// Create test app
const app = express();
app.use(express.json());
app.use("/api/submissions", submissionRoutes);

// Helper to generate valid JWT token
function generateToken(role = "trainer", phone = "919876543210") {
  return jwt.sign({ id: "test-id", phone, role, name: "Test User" }, JWT_SECRET, { expiresIn: "1h" });
}

describe("GET /api/submissions/:phone/weekly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return weekly submission count for trainer", async () => {
    const token = generateToken("trainer");
    
    // Mock User.findOne to return a student
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      phone: "918888888888",
      weeklySubmissions: 5
    });
    
    const res = await request(app)
      .get("/api/submissions/918888888888/weekly")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("weeklySubmissions", 5);
    expect(res.body).toHaveProperty("phone");
  });

  it("should return weekly submission count for admin", async () => {
    const token = generateToken("admin");
    
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      phone: "918888888888",
      weeklySubmissions: 5
    });
    
    const res = await request(app)
      .get("/api/submissions/918888888888/weekly")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("weeklySubmissions", 5);
  });

  it("should return 403 for non-trainer/admin", async () => {
    const token = generateToken("user");
    
    const res = await request(app)
      .get("/api/submissions/918888888888/weekly")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("should return 404 for non-existent student", async () => {
    const token = generateToken("trainer");
    
    // Mock User.findOne to return null
    User.findOne = vi.fn().mockResolvedValue(null);
    
    const res = await request(app)
      .get("/api/submissions/919999999999/weekly")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error", "Student not found");
  });
});

describe("PATCH /api/submissions/:phone/weekly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should increment weekly submissions", async () => {
    const token = generateToken("trainer");
    
    const mockStudent = {
      _id: "student-id",
      phone: "918888888888",
      weeklySubmissions: 5,
      save: vi.fn().mockResolvedValue(true)
    };
    User.findOne = vi.fn().mockResolvedValue(mockStudent);
    
    const res = await request(app)
      .patch("/api/submissions/918888888888/weekly")
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(res.body).toHaveProperty("weeklySubmissions", 7);
    expect(mockStudent.save).toHaveBeenCalled();
  });

  it("should decrement weekly submissions", async () => {
    const token = generateToken("trainer");
    
    const mockStudent = {
      _id: "student-id",
      phone: "918888888888",
      weeklySubmissions: 5,
      save: vi.fn().mockResolvedValue(true)
    };
    User.findOne = vi.fn().mockResolvedValue(mockStudent);
    
    const res = await request(app)
      .patch("/api/submissions/918888888888/weekly")
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: -2 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("weeklySubmissions", 3);
  });

  it("should floor at zero when result would be negative", async () => {
    const token = generateToken("trainer");
    
    const mockStudent = {
      _id: "student-id",
      phone: "918888888888",
      weeklySubmissions: 5,
      save: vi.fn().mockResolvedValue(true)
    };
    User.findOne = vi.fn().mockResolvedValue(mockStudent);
    
    const res = await request(app)
      .patch("/api/submissions/918888888888/weekly")
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: -10 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("weeklySubmissions", 0);
  });

  it("should return 400 for invalid delta", async () => {
    const token = generateToken("trainer");
    
    const res = await request(app)
      .patch("/api/submissions/918888888888/weekly")
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: "invalid" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Delta must be a number");
  });

  it("should return 403 for non-trainer/admin", async () => {
    const token = generateToken("user");
    
    const res = await request(app)
      .patch("/api/submissions/918888888888/weekly")
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: 1 });

    expect(res.status).toBe(403);
  });

  it("should return 404 for non-existent student", async () => {
    const token = generateToken("trainer");
    
    User.findOne = vi.fn().mockResolvedValue(null);
    
    const res = await request(app)
      .patch("/api/submissions/919999999999/weekly")
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: 1 });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error", "Student not found");
  });
});

describe("GET /api/submissions/:phone/monthly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return monthly submission count for trainer", async () => {
    const token = generateToken("trainer");
    
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      phone: "918888888888",
      monthlySubmissions: 20
    });
    
    const res = await request(app)
      .get("/api/submissions/918888888888/monthly")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("monthlySubmissions", 20);
  });

  it("should return 403 for non-trainer/admin", async () => {
    const token = generateToken("user");
    
    const res = await request(app)
      .get("/api/submissions/918888888888/monthly")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/submissions/:phone/monthly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should increment monthly submissions", async () => {
    const token = generateToken("trainer");
    
    const mockStudent = {
      _id: "student-id",
      phone: "918888888888",
      monthlySubmissions: 20,
      save: vi.fn().mockResolvedValue(true)
    };
    User.findOne = vi.fn().mockResolvedValue(mockStudent);
    
    const res = await request(app)
      .patch("/api/submissions/918888888888/monthly")
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("monthlySubmissions", 23);
  });

  it("should floor at zero when result would be negative", async () => {
    const token = generateToken("trainer");
    
    const mockStudent = {
      _id: "student-id",
      phone: "918888888888",
      monthlySubmissions: 20,
      save: vi.fn().mockResolvedValue(true)
    };
    User.findOne = vi.fn().mockResolvedValue(mockStudent);
    
    const res = await request(app)
      .patch("/api/submissions/918888888888/monthly")
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: -30 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("monthlySubmissions", 0);
  });

  it("should return 400 for invalid delta", async () => {
    const token = generateToken("trainer");
    
    const res = await request(app)
      .patch("/api/submissions/918888888888/monthly")
      .set("Authorization", `Bearer ${token}`)
      .send({ delta: null });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/submissions/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return all students for trainer", async () => {
    const token = generateToken("trainer");
    
    // Mock User.find to return students
    const mockQuery = {
      lean: vi.fn().mockResolvedValue([
        {
          _id: "student-1",
          phone: "918888888888",
          name: "Test Student",
          weeklySubmissions: 5,
          monthlySubmissions: 20,
          streak: 3,
          fine: 100,
          completed: true
        }
      ])
    };
    User.find = vi.fn().mockReturnValue(mockQuery);
    
    // Mock Auth.find to return auth records
    const mockAuthQuery = {
      lean: vi.fn().mockResolvedValue([
        {
          phone: "918888888888",
          role: "user",
          isActive: true,
          name: "Test Student"
        }
      ])
    };
    Auth.find = vi.fn().mockReturnValue(mockAuthQuery);
    
    const res = await request(app)
      .get("/api/submissions/overview")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    
    const student = res.body[0];
    expect(student).toHaveProperty("name");
    expect(student).toHaveProperty("phone");
    expect(student).toHaveProperty("role");
    expect(student).toHaveProperty("streak");
    expect(student).toHaveProperty("weeklySubmissions");
    expect(student).toHaveProperty("monthlySubmissions");
    expect(student).toHaveProperty("fine");
    expect(student).toHaveProperty("completed");
    expect(student).toHaveProperty("isActive");
  });

  it("should filter by search query (name)", async () => {
    const token = generateToken("trainer");
    
    const mockQuery = {
      lean: vi.fn().mockResolvedValue([
        {
          _id: "student-1",
          phone: "918888888888",
          name: "Test Student",
          weeklySubmissions: 5,
          monthlySubmissions: 20,
          streak: 3,
          fine: 100,
          completed: true
        }
      ])
    };
    User.find = vi.fn().mockReturnValue(mockQuery);
    
    const mockAuthQuery = {
      lean: vi.fn().mockResolvedValue([
        {
          phone: "918888888888",
          role: "user",
          isActive: true,
          name: "Test Student"
        }
      ])
    };
    Auth.find = vi.fn().mockReturnValue(mockAuthQuery);
    
    const res = await request(app)
      .get("/api/submissions/overview?search=Test")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].name.toLowerCase()).toContain("test");
  });

  it("should sort by streak ascending", async () => {
    const token = generateToken("trainer");
    
    const mockQuery = {
      lean: vi.fn().mockResolvedValue([
        {
          _id: "student-1",
          phone: "918888888881",
          name: "Student 1",
          streak: 1,
          weeklySubmissions: 5,
          monthlySubmissions: 20,
          fine: 0,
          completed: false
        },
        {
          _id: "student-2",
          phone: "918888888882",
          name: "Student 2",
          streak: 5,
          weeklySubmissions: 3,
          monthlySubmissions: 15,
          fine: 0,
          completed: false
        }
      ])
    };
    User.find = vi.fn().mockReturnValue(mockQuery);
    
    const mockAuthQuery = {
      lean: vi.fn().mockResolvedValue([
        { phone: "918888888881", role: "user", isActive: true },
        { phone: "918888888882", role: "user", isActive: true }
      ])
    };
    Auth.find = vi.fn().mockReturnValue(mockAuthQuery);
    
    const res = await request(app)
      .get("/api/submissions/overview?sortBy=streak&sortOrder=asc")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].streak).toBeLessThanOrEqual(res.body[1].streak);
  });

  it("should return 403 for non-trainer/admin", async () => {
    const token = generateToken("user");
    
    const res = await request(app)
      .get("/api/submissions/overview")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
