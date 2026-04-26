/**
 * Manual test script for attendance endpoint
 * 
 * Usage:
 * 1. Start the server: npm run api
 * 2. Run this script: node api/test-attendance.js
 * 
 * Prerequisites:
 * - Server must be running
 * - You need a valid JWT token (login as trainer/admin first)
 * - Student phone must exist in the database
 */

import fetch from "node-fetch";

const API_URL = "http://localhost:3001";

// Replace with a valid JWT token from a trainer/admin account
const TOKEN = "YOUR_JWT_TOKEN_HERE";

// Replace with a valid student phone from your database
const STUDENT_PHONE = "918848096746";

async function testMarkAttendance() {
  console.log("🧪 Testing POST /api/attendance/mark\n");
  
  try {
    const response = await fetch(`${API_URL}/api/attendance/mark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        studentPhone: STUDENT_PHONE,
        date: "2024-01-15",
        status: "present",
        activityType: "daily_video"
      })
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log("\n✅ Attendance marked successfully!");
    } else {
      console.log("\n❌ Failed to mark attendance");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testInvalidStatus() {
  console.log("\n🧪 Testing invalid status (should return 400)\n");
  
  try {
    const response = await fetch(`${API_URL}/api/attendance/mark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        studentPhone: STUDENT_PHONE,
        date: "2024-01-15",
        status: "maybe" // invalid status
      })
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (response.status === 400) {
      console.log("\n✅ Validation working correctly!");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testMissingFields() {
  console.log("\n🧪 Testing missing required fields (should return 400)\n");
  
  try {
    const response = await fetch(`${API_URL}/api/attendance/mark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        studentPhone: STUDENT_PHONE
        // missing date and status
      })
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (response.status === 400) {
      console.log("\n✅ Validation working correctly!");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testBulkAttendance() {
  console.log("\n🧪 Testing POST /api/attendance/bulk\n");
  
  try {
    const response = await fetch(`${API_URL}/api/attendance/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        entries: [
          {
            studentPhone: STUDENT_PHONE,
            date: "2024-01-16",
            status: "present",
            activityType: "daily_video"
          },
          {
            studentPhone: STUDENT_PHONE,
            date: "2024-01-17",
            status: "absent",
            activityType: "daily_video"
          },
          {
            studentPhone: "9999999999", // non-existent student
            date: "2024-01-16",
            status: "present"
          }
        ]
      })
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log(`\n✅ Bulk attendance processed!`);
      console.log(`   Created: ${data.created}, Updated: ${data.updated}, Failed: ${data.failed}`);
    } else {
      console.log("\n❌ Failed to process bulk attendance");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testBulkAttendanceInvalidInput() {
  console.log("\n🧪 Testing bulk attendance with invalid input (should return 400)\n");
  
  try {
    const response = await fetch(`${API_URL}/api/attendance/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        entries: [] // empty array
      })
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (response.status === 400) {
      console.log("\n✅ Validation working correctly!");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testGetAttendanceByPhone() {
  console.log("\n🧪 Testing GET /api/attendance/:phone\n");
  
  try {
    const response = await fetch(`${API_URL}/api/attendance/${STUDENT_PHONE}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${TOKEN}`
      }
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log(`\n✅ Retrieved ${data.records.length} attendance records for ${data.name}`);
    } else {
      console.log("\n❌ Failed to retrieve attendance records");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testGetAttendanceByPhoneWithDateRange() {
  console.log("\n🧪 Testing GET /api/attendance/:phone with date range\n");
  
  try {
    const response = await fetch(`${API_URL}/api/attendance/${STUDENT_PHONE}?startDate=2024-01-15&endDate=2024-01-17`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${TOKEN}`
      }
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log(`\n✅ Retrieved ${data.records.length} attendance records for date range`);
    } else {
      console.log("\n❌ Failed to retrieve attendance records");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testGetAttendanceByDate() {
  console.log("\n🧪 Testing GET /api/attendance/date/:date\n");
  
  try {
    const response = await fetch(`${API_URL}/api/attendance/date/2024-01-15`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${TOKEN}`
      }
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log(`\n✅ Retrieved ${data.records.length} attendance records for date`);
    } else {
      console.log("\n❌ Failed to retrieve attendance records");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testGetAttendanceInvalidDate() {
  console.log("\n🧪 Testing GET /api/attendance/:phone with invalid date (should return 400)\n");
  
  try {
    const response = await fetch(`${API_URL}/api/attendance/${STUDENT_PHONE}?startDate=invalid-date`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${TOKEN}`
      }
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (response.status === 400) {
      console.log("\n✅ Validation working correctly!");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function testGetAttendanceNonExistentStudent() {
  console.log("\n🧪 Testing GET /api/attendance/:phone with non-existent student (should return 404)\n");
  
  try {
    const response = await fetch(`${API_URL}/api/attendance/9999999999`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${TOKEN}`
      }
    });
    
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));
    
    if (response.status === 404) {
      console.log("\n✅ Validation working correctly!");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

async function runTests() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Attendance Endpoint Manual Tests");
  console.log("═══════════════════════════════════════════════════════\n");
  
  if (TOKEN === "YOUR_JWT_TOKEN_HERE") {
    console.log("⚠️  Please update TOKEN variable with a valid JWT token");
    console.log("   You can get a token by logging in as trainer/admin\n");
    return;
  }
  
  // Write operations
  await testMarkAttendance();
  await testInvalidStatus();
  await testMissingFields();
  await testBulkAttendance();
  await testBulkAttendanceInvalidInput();
  
  // Read operations (new)
  await testGetAttendanceByPhone();
  await testGetAttendanceByPhoneWithDateRange();
  await testGetAttendanceByDate();
  await testGetAttendanceInvalidDate();
  await testGetAttendanceNonExistentStudent();
  
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Tests Complete");
  console.log("═══════════════════════════════════════════════════════\n");
}

runTests();
