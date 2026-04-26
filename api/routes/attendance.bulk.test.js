/**
 * Integration tests for bulk attendance endpoint
 * 
 * Task 2.2 — Implement bulk attendance marking endpoint
 * Feature: trainer-admin-management
 * Validates: Requirements 2.4, 2.5
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import Attendance from "../../models/attendanceSchema.js";
import User from "../../models/userSchema.js";
import Auth from "../../models/authSchema.js";
import attendanceRoutes from "./attendance.js";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Test App Setup
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET || "speakshine_secret_2024";

// Generate test JWT token
const testToken = jwt.sign(
  {
    phone: "919876543210",
    role: "trainer"
  },
  JWT_SECRET,
  { expiresIn: "1h" }
);

const app = express();
app.use(express.json());
app.use("/api/attendance", attendanceRoutes);

// ---------------------------------------------------------------------------
// Test Database Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await mongoose.connect("mongodb://127.0.0.1:27017/test-attendance-bulk");
  
  // Create test users
  await User.create({
    phone: "918848096746",
    userId: "918848096746@s.whatsapp.net",
    name: "Test Student 1",
    role: "user"
  });
  
  await User.create({
    phone: "919999999999",
    userId: "919999999999@s.whatsapp.net",
    name: "Test Student 2",
    role: "user"
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Attendance.deleteMany({});
});

// ---------------------------------------------------------------------------
// Bulk Attendance Tests
// ---------------------------------------------------------------------------

describe("POST /api/attendance/bulk — bulk attendance marking", () => {
  it("should successfully process multiple valid entries", async () => {
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        entries: [
          {
            studentPhone: "918848096746",
            date: "2024-01-15",
            status: "present"
          },
          {
            studentPhone: "919999999999",
            date: "2024-01-15",
            status: "absent"
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(2);
    expect(response.body.updated).toBe(0);
    expect(response.body.failed).toBe(0);
    expect(response.body.errors).toHaveLength(0);

    // Verify records were created
    const records = await Attendance.find({});
    expect(records).toHaveLength(2);
  });

  it("should track created vs updated records correctly", async () => {
    // Create initial record
    await Attendance.create({
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210"
    });

    // Bulk update with one existing and one new
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        entries: [
          {
            studentPhone: "918848096746",
            date: "2024-01-15",
            status: "absent" // Update existing
          },
          {
            studentPhone: "919999999999",
            date: "2024-01-15",
            status: "present" // Create new
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(1);
    expect(response.body.updated).toBe(1);
    expect(response.body.failed).toBe(0);
  });

  it("should process entries independently and collect errors", async () => {
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        entries: [
          {
            studentPhone: "918848096746",
            date: "2024-01-15",
            status: "present" // Valid
          },
          {
            studentPhone: "9188888888", // Non-existent student
            date: "2024-01-15",
            status: "present"
          },
          {
            studentPhone: "919999999999",
            date: "2024-01-15",
            status: "invalid_status" // Invalid status
          },
          {
            studentPhone: "919999999999",
            date: "2024-01-15",
            status: "absent" // Valid
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(2);
    expect(response.body.updated).toBe(0);
    expect(response.body.failed).toBe(2);
    expect(response.body.errors).toHaveLength(2);
    
    // Check error details
    expect(response.body.errors[0].index).toBe(1);
    expect(response.body.errors[0].error).toContain("Student not found");
    expect(response.body.errors[1].index).toBe(2);
    expect(response.body.errors[1].error).toContain("Invalid status");
  });

  it("should reject empty entries array", async () => {
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        entries: []
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("entries");
  });

  it("should reject missing entries field", async () => {
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("entries");
  });

  it("should validate required fields for each entry", async () => {
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        entries: [
          {
            studentPhone: "918848096746",
            // Missing date and status
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(0);
    expect(response.body.failed).toBe(1);
    expect(response.body.errors[0].error).toContain("Missing required fields");
  });

  it("should validate date format for each entry", async () => {
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        entries: [
          {
            studentPhone: "918848096746",
            date: "invalid-date",
            status: "present"
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(0);
    expect(response.body.failed).toBe(1);
    expect(response.body.errors[0].error).toContain("Invalid date format");
  });

  it("should use default activityType when not provided", async () => {
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        entries: [
          {
            studentPhone: "918848096746",
            date: "2024-01-15",
            status: "present"
            // activityType not provided
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(1);

    const record = await Attendance.findOne({ studentPhone: "918848096746" });
    expect(record.activityType).toBe("daily_video");
  });

  it("should accept custom activityType", async () => {
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        entries: [
          {
            studentPhone: "918848096746",
            date: "2024-01-15",
            status: "present",
            activityType: "workshop"
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(1);

    const record = await Attendance.findOne({ studentPhone: "918848096746" });
    expect(record.activityType).toBe("workshop");
  });

  it("should set markedBy from authenticated user", async () => {
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        entries: [
          {
            studentPhone: "918848096746",
            date: "2024-01-15",
            status: "present"
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(1);

    const record = await Attendance.findOne({ studentPhone: "918848096746" });
    expect(record.markedBy).toBe("919876543210");
  });

  it("should normalize dates to UTC midnight", async () => {
    const response = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", `Bearer ${testToken}`)
      .send({
        entries: [
          {
            studentPhone: "918848096746",
            date: "2024-01-15",
            status: "present"
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.created).toBe(1);

    const record = await Attendance.findOne({ studentPhone: "918848096746" });
    expect(record.date.toISOString()).toBe("2024-01-15T00:00:00.000Z");
  });
});
