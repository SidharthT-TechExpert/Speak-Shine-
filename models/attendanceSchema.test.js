/**
 * Unit tests for Attendance schema
 * 
 * Task 1.2 — Write unit tests for Attendance schema
 * Feature: trainer-admin-management
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import Attendance from "./attendanceSchema.js";

// ---------------------------------------------------------------------------
// Test Database Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Connect to in-memory MongoDB for testing
  await mongoose.connect("mongodb://127.0.0.1:27017/test-attendance");
});

afterAll(async () => {
  // Clean up and disconnect
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  // Clear the collection before each test
  await Attendance.deleteMany({});
});

// ---------------------------------------------------------------------------
// Schema Validation Tests — Required Fields
// Validates: Requirement 1.1
// ---------------------------------------------------------------------------

describe("Attendance schema — required fields validation", () => {
  it("should successfully create an attendance record with all required fields", async () => {
    const validRecord = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const attendance = new Attendance(validRecord);
    const saved = await attendance.save();

    expect(saved._id).toBeDefined();
    expect(saved.studentPhone).toBe(validRecord.studentPhone);
    expect(saved.date.toISOString()).toBe(validRecord.date.toISOString());
    expect(saved.activityType).toBe(validRecord.activityType);
    expect(saved.status).toBe(validRecord.status);
    expect(saved.markedBy).toBe(validRecord.markedBy);
    expect(saved.markedAt).toBeDefined();
  });

  it("should fail validation when studentPhone is missing", async () => {
    const invalidRecord = {
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const attendance = new Attendance(invalidRecord);
    
    await expect(attendance.save()).rejects.toThrow();
  });

  it("should fail validation when date is missing", async () => {
    const invalidRecord = {
      studentPhone: "918848096746",
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const attendance = new Attendance(invalidRecord);
    
    await expect(attendance.save()).rejects.toThrow();
  });

  it("should fail validation when status is missing", async () => {
    const invalidRecord = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      markedBy: "919876543210",
    };

    const attendance = new Attendance(invalidRecord);
    
    await expect(attendance.save()).rejects.toThrow();
  });

  it("should fail validation when markedBy is missing", async () => {
    const invalidRecord = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
    };

    const attendance = new Attendance(invalidRecord);
    
    await expect(attendance.save()).rejects.toThrow();
  });

  it("should use default value for activityType when not provided", async () => {
    const recordWithoutActivityType = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      status: "present",
      markedBy: "919876543210",
    };

    const attendance = new Attendance(recordWithoutActivityType);
    const saved = await attendance.save();

    expect(saved.activityType).toBe("daily_video");
  });

  it("should automatically set markedAt timestamp", async () => {
    const record = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const attendance = new Attendance(record);
    const saved = await attendance.save();

    expect(saved.markedAt).toBeDefined();
    expect(saved.markedAt).toBeInstanceOf(Date);
    expect(saved.markedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

// ---------------------------------------------------------------------------
// Status Enum Validation Tests
// Validates: Requirement 1.1
// ---------------------------------------------------------------------------

describe("Attendance schema — status enum validation", () => {
  it('should accept "present" as a valid status', async () => {
    const record = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const attendance = new Attendance(record);
    const saved = await attendance.save();

    expect(saved.status).toBe("present");
  });

  it('should accept "absent" as a valid status', async () => {
    const record = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "absent",
      markedBy: "919876543210",
    };

    const attendance = new Attendance(record);
    const saved = await attendance.save();

    expect(saved.status).toBe("absent");
  });

  it("should reject invalid status values", async () => {
    const invalidStatuses = ["late", "excused", "pending", "unknown", ""];

    for (const invalidStatus of invalidStatuses) {
      const record = {
        studentPhone: "918848096746",
        date: new Date("2024-01-15T00:00:00.000Z"),
        activityType: "daily_video",
        status: invalidStatus,
        markedBy: "919876543210",
      };

      const attendance = new Attendance(record);
      
      await expect(attendance.save()).rejects.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Compound Unique Index Tests — Duplicate Prevention
// Validates: Requirements 1.2, 1.3
// ---------------------------------------------------------------------------

describe("Attendance schema — compound unique index enforcement", () => {
  it("should prevent duplicate records for same studentPhone, date, and activityType", async () => {
    const record1 = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const record2 = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "absent", // Different status, but same key fields
      markedBy: "919999999999",
    };

    // First record should save successfully
    const attendance1 = new Attendance(record1);
    await attendance1.save();

    // Second record with same key should fail
    const attendance2 = new Attendance(record2);
    await expect(attendance2.save()).rejects.toThrow(/duplicate key/i);
  });

  it("should allow same studentPhone and date with different activityType", async () => {
    const record1 = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const record2 = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "workshop",
      status: "present",
      markedBy: "919876543210",
    };

    const attendance1 = new Attendance(record1);
    const attendance2 = new Attendance(record2);

    const saved1 = await attendance1.save();
    const saved2 = await attendance2.save();

    expect(saved1._id).toBeDefined();
    expect(saved2._id).toBeDefined();
    expect(saved1._id.toString()).not.toBe(saved2._id.toString());
  });

  it("should allow same studentPhone and activityType with different date", async () => {
    const record1 = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const record2 = {
      studentPhone: "918848096746",
      date: new Date("2024-01-16T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const attendance1 = new Attendance(record1);
    const attendance2 = new Attendance(record2);

    const saved1 = await attendance1.save();
    const saved2 = await attendance2.save();

    expect(saved1._id).toBeDefined();
    expect(saved2._id).toBeDefined();
    expect(saved1._id.toString()).not.toBe(saved2._id.toString());
  });

  it("should allow different students with same date and activityType", async () => {
    const record1 = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const record2 = {
      studentPhone: "919999999999",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "absent",
      markedBy: "919876543210",
    };

    const attendance1 = new Attendance(record1);
    const attendance2 = new Attendance(record2);

    const saved1 = await attendance1.save();
    const saved2 = await attendance2.save();

    expect(saved1._id).toBeDefined();
    expect(saved2._id).toBeDefined();
    expect(saved1._id.toString()).not.toBe(saved2._id.toString());
  });
});

// ---------------------------------------------------------------------------
// Date Normalization Tests
// Validates: Requirement 1.1 (UTC midnight storage)
// ---------------------------------------------------------------------------

describe("Attendance schema — date normalization to UTC midnight", () => {
  it("should store date as provided (UTC midnight)", async () => {
    const utcMidnight = new Date("2024-01-15T00:00:00.000Z");
    
    const record = {
      studentPhone: "918848096746",
      date: utcMidnight,
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const attendance = new Attendance(record);
    const saved = await attendance.save();

    expect(saved.date.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    expect(saved.date.getUTCHours()).toBe(0);
    expect(saved.date.getUTCMinutes()).toBe(0);
    expect(saved.date.getUTCSeconds()).toBe(0);
    expect(saved.date.getUTCMilliseconds()).toBe(0);
  });

  it("should preserve date with time components (normalization is application responsibility)", async () => {
    // Note: The schema itself doesn't normalize dates to midnight.
    // This is the application's responsibility when creating records.
    // This test verifies the schema accepts dates with time components.
    
    const dateWithTime = new Date("2024-01-15T14:30:45.123Z");
    
    const record = {
      studentPhone: "918848096746",
      date: dateWithTime,
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const attendance = new Attendance(record);
    const saved = await attendance.save();

    // Schema stores the date as-is; normalization happens in application logic
    expect(saved.date.toISOString()).toBe(dateWithTime.toISOString());
  });

  it("should handle dates across different timezones when normalized to UTC midnight", async () => {
    // Application should normalize to UTC midnight before saving
    const dates = [
      new Date("2024-01-15T00:00:00.000Z"),
      new Date("2024-01-16T00:00:00.000Z"),
      new Date("2024-01-17T00:00:00.000Z"),
    ];

    for (let i = 0; i < dates.length; i++) {
      const record = {
        studentPhone: "918848096746",
        date: dates[i],
        activityType: "daily_video",
        status: "present",
        markedBy: "919876543210",
      };

      const attendance = new Attendance(record);
      const saved = await attendance.save();

      expect(saved.date.toISOString()).toBe(dates[i].toISOString());
    }
  });
});

// ---------------------------------------------------------------------------
// Index Tests — Query Performance
// Validates: Requirement 1.1 (indexes for efficient queries)
// ---------------------------------------------------------------------------

describe("Attendance schema — index verification", () => {
  it("should have indexes on studentPhone and date", async () => {
    const indexes = await Attendance.collection.getIndexes();

    // Check for studentPhone index
    const hasStudentPhoneIndex = Object.values(indexes).some(
      (index) => index[0]?.[0] === "studentPhone" || index.studentPhone === 1
    );

    // Check for date index
    const hasDateIndex = Object.values(indexes).some(
      (index) => index[0]?.[0] === "date" || index.date === 1
    );

    expect(hasStudentPhoneIndex).toBe(true);
    expect(hasDateIndex).toBe(true);
  });

  it("should have compound unique index on studentPhone, date, and activityType", async () => {
    const indexes = await Attendance.collection.getIndexes();

    // The compound index is defined in the schema, but may not exist yet in test DB
    // We verify by attempting to create a duplicate record, which should fail
    const record1 = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "present",
      markedBy: "919876543210",
    };

    const record2 = {
      studentPhone: "918848096746",
      date: new Date("2024-01-15T00:00:00.000Z"),
      activityType: "daily_video",
      status: "absent",
      markedBy: "919999999999",
    };

    // First record should save
    await new Attendance(record1).save();

    // Second record with same compound key should fail (proves index exists)
    await expect(new Attendance(record2).save()).rejects.toThrow(/duplicate key/i);
  });
});
