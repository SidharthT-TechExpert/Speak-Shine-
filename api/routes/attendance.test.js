import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import attendanceRoutes from "./attendance.js";
import Attendance from "../../models/attendanceSchema.js";
import User from "../../models/userSchema.js";

// Mock the models
vi.mock("../../models/attendanceSchema.js");
vi.mock("../../models/userSchema.js");

const JWT_SECRET = process.env.JWT_SECRET || "speakshine_secret_2024";

// Create test app
const app = express();
app.use(express.json());
app.use("/api/attendance", attendanceRoutes);

// Helper to generate valid JWT token
function generateToken(role = "trainer", phone = "919876543210") {
  return jwt.sign({ id: "test-id", phone, role, name: "Test User" }, JWT_SECRET, { expiresIn: "1h" });
}

describe("POST /api/attendance/mark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when no token provided", async () => {
    const res = await request(app)
      .post("/api/attendance/mark")
      .send({ studentPhone: "918848096746", date: "2024-01-15", status: "present" });
    
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No token provided");
  });

  it("should return 403 when user is not trainer or admin", async () => {
    const token = generateToken("user");
    
    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentPhone: "918848096746", date: "2024-01-15", status: "present" });
    
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Access denied");
  });

  it("should return 400 when required fields are missing", async () => {
    const token = generateToken("trainer");
    
    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentPhone: "918848096746" }); // missing date and status
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing required fields");
  });

  it("should return 400 when status is invalid", async () => {
    const token = generateToken("trainer");
    
    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentPhone: "918848096746", date: "2024-01-15", status: "maybe" });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid status");
  });

  it("should return 400 when date format is invalid", async () => {
    const token = generateToken("trainer");
    
    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentPhone: "918848096746", date: "invalid-date", status: "present" });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid date format");
  });

  it("should return 404 when student not found", async () => {
    const token = generateToken("trainer");
    
    // Mock User.findOne to return null (student not found)
    User.findOne = vi.fn().mockResolvedValue(null);
    
    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentPhone: "918848096746", date: "2024-01-15", status: "present" });
    
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Student not found");
    expect(res.body.phone).toBe("918848096746");
  });

  it("should create new attendance record when none exists", async () => {
    const token = generateToken("trainer", "919876543210");
    
    // Mock User.findOne to return a student
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      userId: "918848096746@s.whatsapp.net",
      phone: "8848096746",
      name: "Test Student"
    });
    
    // Mock Attendance.findOneAndUpdate to return new record
    const mockRecord = {
      _id: "attendance-id",
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
      markedAt: new Date()
    };
    Attendance.findOneAndUpdate = vi.fn().mockResolvedValue(mockRecord);
    
    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentPhone: "918848096746", date: "2024-01-15", status: "present" });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.record).toBeDefined();
    expect(res.body.record.status).toBe("present");
    expect(Attendance.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        studentPhone: "918848096746",
        activityType: "daily_video"
      }),
      expect.objectContaining({
        status: "present",
        markedBy: "919876543210"
      }),
      expect.objectContaining({
        upsert: true,
        new: true
      })
    );
  });

  it("should update existing attendance record", async () => {
    const token = generateToken("admin", "919876543210");
    
    // Mock User.findOne to return a student
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      phone: "8848096746"
    });
    
    // Mock Attendance.findOneAndUpdate to return updated record
    const mockRecord = {
      _id: "attendance-id",
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "absent",
      markedBy: "919876543210",
      markedAt: new Date()
    };
    Attendance.findOneAndUpdate = vi.fn().mockResolvedValue(mockRecord);
    
    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentPhone: "918848096746", date: "2024-01-15", status: "absent" });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.record.status).toBe("absent");
  });

  it("should use default activityType when not provided", async () => {
    const token = generateToken("trainer", "919876543210");
    
    User.findOne = vi.fn().mockResolvedValue({ _id: "student-id", phone: "8848096746" });
    Attendance.findOneAndUpdate = vi.fn().mockResolvedValue({
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210"
    });
    
    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentPhone: "918848096746", date: "2024-01-15", status: "present" });
    
    expect(res.status).toBe(200);
    expect(Attendance.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: "daily_video"
      }),
      expect.anything(),
      expect.anything()
    );
  });

  it("should normalize date to UTC midnight", async () => {
    const token = generateToken("trainer", "919876543210");
    
    User.findOne = vi.fn().mockResolvedValue({ _id: "student-id", phone: "8848096746" });
    Attendance.findOneAndUpdate = vi.fn().mockResolvedValue({
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210"
    });
    
    const res = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentPhone: "918848096746", date: "2024-01-15T14:30:00.000Z", status: "present" });
    
    expect(res.status).toBe(200);
    // Verify the date was normalized to midnight
    const callArgs = Attendance.findOneAndUpdate.mock.calls[0][0];
    expect(callArgs.date.getUTCHours()).toBe(0);
    expect(callArgs.date.getUTCMinutes()).toBe(0);
    expect(callArgs.date.getUTCSeconds()).toBe(0);
  });
});

describe("GET /api/attendance/:phone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when no token provided", async () => {
    const res = await request(app).get("/api/attendance/918848096746");
    
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No token provided");
  });

  it("should return 403 when user is not trainer or admin", async () => {
    const token = generateToken("user");
    
    const res = await request(app)
      .get("/api/attendance/918848096746")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Access denied");
  });

  it("should return 404 when student not found", async () => {
    const token = generateToken("trainer");
    
    // Mock User.findOne to return null (student not found)
    User.findOne = vi.fn().mockResolvedValue(null);
    
    const res = await request(app)
      .get("/api/attendance/918848096746")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Student not found");
    expect(res.body.phone).toBe("918848096746");
  });

  it("should return all attendance records for a student sorted by date descending", async () => {
    const token = generateToken("trainer");
    
    // Mock User.findOne to return a student
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      phone: "8848096746",
      name: "Test Student"
    });
    
    // Mock Attendance.find to return records
    const mockRecords = [
      {
        date: new Date("2024-01-17T00:00:00.000Z"),
        activityType: "daily_video",
        status: "present",
        markedBy: "919876543210",
        markedAt: new Date("2024-01-17T10:00:00.000Z")
      },
      {
        date: new Date("2024-01-16T00:00:00.000Z"),
        activityType: "daily_video",
        status: "absent",
        markedBy: "919876543210",
        markedAt: new Date("2024-01-16T10:00:00.000Z")
      },
      {
        date: new Date("2024-01-15T00:00:00.000Z"),
        activityType: "daily_video",
        status: "present",
        markedBy: "919876543210",
        markedAt: new Date("2024-01-15T10:00:00.000Z")
      }
    ];
    
    const mockQuery = {
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockRecords)
    };
    Attendance.find = vi.fn().mockReturnValue(mockQuery);
    
    const res = await request(app)
      .get("/api/attendance/918848096746")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("8848096746");
    expect(res.body.name).toBe("Test Student");
    expect(res.body.records).toHaveLength(3);
    expect(res.body.records[0].status).toBe("present");
    expect(mockQuery.sort).toHaveBeenCalledWith({ date: -1 });
  });

  it("should filter attendance records by startDate", async () => {
    const token = generateToken("trainer");
    
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      phone: "8848096746",
      name: "Test Student"
    });
    
    const mockQuery = {
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    Attendance.find = vi.fn().mockReturnValue(mockQuery);
    
    const res = await request(app)
      .get("/api/attendance/918848096746?startDate=2024-01-15")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(Attendance.find).toHaveBeenCalledWith(
      expect.objectContaining({
        studentPhone: "8848096746",
        date: expect.objectContaining({
          $gte: new Date("2024-01-15T00:00:00.000Z")
        })
      })
    );
  });

  it("should filter attendance records by endDate", async () => {
    const token = generateToken("trainer");
    
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      phone: "8848096746",
      name: "Test Student"
    });
    
    const mockQuery = {
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    Attendance.find = vi.fn().mockReturnValue(mockQuery);
    
    const res = await request(app)
      .get("/api/attendance/918848096746?endDate=2024-01-20")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(Attendance.find).toHaveBeenCalledWith(
      expect.objectContaining({
        studentPhone: "8848096746",
        date: expect.objectContaining({
          $lt: new Date("2024-01-21T00:00:00.000Z") // endDate + 1 day
        })
      })
    );
  });

  it("should filter attendance records by date range", async () => {
    const token = generateToken("admin");
    
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      phone: "8848096746",
      name: "Test Student"
    });
    
    const mockQuery = {
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    Attendance.find = vi.fn().mockReturnValue(mockQuery);
    
    const res = await request(app)
      .get("/api/attendance/918848096746?startDate=2024-01-15&endDate=2024-01-20")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(Attendance.find).toHaveBeenCalledWith(
      expect.objectContaining({
        studentPhone: "8848096746",
        date: expect.objectContaining({
          $gte: new Date("2024-01-15T00:00:00.000Z"),
          $lt: new Date("2024-01-21T00:00:00.000Z")
        })
      })
    );
  });

  it("should return 400 when startDate format is invalid", async () => {
    const token = generateToken("trainer");
    
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      phone: "8848096746"
    });
    
    const res = await request(app)
      .get("/api/attendance/918848096746?startDate=invalid-date")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid startDate format");
  });

  it("should return 400 when endDate format is invalid", async () => {
    const token = generateToken("trainer");
    
    User.findOne = vi.fn().mockResolvedValue({
      _id: "student-id",
      phone: "8848096746"
    });
    
    const res = await request(app)
      .get("/api/attendance/918848096746?endDate=invalid-date")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid endDate format");
  });
});

describe("GET /api/attendance/date/:date", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when no token provided", async () => {
    const res = await request(app).get("/api/attendance/date/2024-01-15");
    
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No token provided");
  });

  it("should return 403 when user is not trainer or admin", async () => {
    const token = generateToken("user");
    
    const res = await request(app)
      .get("/api/attendance/date/2024-01-15")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Access denied");
  });

  it("should return 400 when date format is invalid", async () => {
    const token = generateToken("trainer");
    
    const res = await request(app)
      .get("/api/attendance/date/invalid-date")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid date format");
  });

  it("should return all attendance records for a specific date with student names", async () => {
    const token = generateToken("trainer");
    
    // Mock Attendance.find to return records
    const mockRecords = [
      {
        studentPhone: "918848096746",
        status: "present",
        activityType: "daily_video",
        markedBy: "919876543210",
        markedAt: new Date("2024-01-15T10:00:00.000Z")
      },
      {
        studentPhone: "919876543211",
        status: "absent",
        activityType: "daily_video",
        markedBy: "919876543210",
        markedAt: new Date("2024-01-15T10:05:00.000Z")
      }
    ];
    
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockRecords)
    };
    Attendance.find = vi.fn().mockReturnValue(mockQuery);
    
    // Mock User.findOne to return different students for each call
    User.findOne = vi.fn()
      .mockResolvedValueOnce({
        _id: "student-1",
        phone: "8848096746",
        name: "Student One"
      })
      .mockResolvedValueOnce({
        _id: "student-2",
        phone: "9876543211",
        name: "Student Two"
      });
    
    const res = await request(app)
      .get("/api/attendance/date/2024-01-15")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.date).toBeDefined();
    expect(res.body.records).toHaveLength(2);
    expect(res.body.records[0].studentPhone).toBe("918848096746");
    expect(res.body.records[0].studentName).toBe("Student One");
    expect(res.body.records[0].status).toBe("present");
    expect(res.body.records[1].studentPhone).toBe("919876543211");
    expect(res.body.records[1].studentName).toBe("Student Two");
    expect(res.body.records[1].status).toBe("absent");
    expect(Attendance.find).toHaveBeenCalledWith({
      date: new Date("2024-01-15T00:00:00.000Z")
    });
  });

  it("should handle missing student gracefully with 'Unknown' name", async () => {
    const token = generateToken("admin");
    
    const mockRecords = [
      {
        studentPhone: "918848096746",
        status: "present",
        activityType: "daily_video",
        markedBy: "919876543210",
        markedAt: new Date("2024-01-15T10:00:00.000Z")
      }
    ];
    
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockRecords)
    };
    Attendance.find = vi.fn().mockReturnValue(mockQuery);
    
    // Mock User.findOne to return null (student not found)
    User.findOne = vi.fn().mockResolvedValue(null);
    
    const res = await request(app)
      .get("/api/attendance/date/2024-01-15")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].studentName).toBe("Unknown");
  });

  it("should return empty array when no attendance records exist for date", async () => {
    const token = generateToken("trainer");
    
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    Attendance.find = vi.fn().mockReturnValue(mockQuery);
    
    const res = await request(app)
      .get("/api/attendance/date/2024-01-15")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(0);
  });

  it("should normalize date to UTC midnight", async () => {
    const token = generateToken("trainer");
    
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    };
    Attendance.find = vi.fn().mockReturnValue(mockQuery);
    
    const res = await request(app)
      .get("/api/attendance/date/2024-01-15")
      .set("Authorization", `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(Attendance.find).toHaveBeenCalledWith({
      date: new Date("2024-01-15T00:00:00.000Z")
    });
  });
});
