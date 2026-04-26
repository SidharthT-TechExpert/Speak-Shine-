/**
 * Manual test script for submission routes
 * Run with: node api/test-submissions.js
 */

import fetch from "node-fetch";

const API_BASE = "http://localhost:3001/api";

// Test credentials - replace with actual trainer/admin credentials
const TEST_PHONE = "8848096746"; // Student phone to test with
let authToken = "";

async function login() {
  console.log("\n🔐 Logging in...");
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: "9876543210", // Replace with trainer/admin phone
      password: "test123"   // Replace with actual password
    })
  });
  
  const data = await res.json();
  if (data.token) {
    authToken = data.token;
    console.log("✅ Login successful");
    return true;
  } else {
    console.error("❌ Login failed:", data);
    return false;
  }
}

async function testGetWeekly() {
  console.log("\n📊 Testing GET /api/submissions/:phone/weekly");
  const res = await fetch(`${API_BASE}/submissions/${TEST_PHONE}/weekly`, {
    headers: { "Authorization": `Bearer ${authToken}` }
  });
  
  const data = await res.json();
  console.log(`Status: ${res.status}`);
  console.log("Response:", data);
  return data;
}

async function testPatchWeekly(delta) {
  console.log(`\n✏️ Testing PATCH /api/submissions/:phone/weekly (delta: ${delta})`);
  const res = await fetch(`${API_BASE}/submissions/${TEST_PHONE}/weekly`, {
    method: "PATCH",
    headers: { 
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ delta })
  });
  
  const data = await res.json();
  console.log(`Status: ${res.status}`);
  console.log("Response:", data);
  return data;
}

async function testNotFound() {
  console.log("\n🔍 Testing 404 - non-existent student");
  const res = await fetch(`${API_BASE}/submissions/9999999999/weekly`, {
    headers: { "Authorization": `Bearer ${authToken}` }
  });
  
  const data = await res.json();
  console.log(`Status: ${res.status}`);
  console.log("Response:", data);
}

async function testUnauthorized() {
  console.log("\n🚫 Testing 401 - no token");
  const res = await fetch(`${API_BASE}/submissions/${TEST_PHONE}/weekly`);
  
  const data = await res.json();
  console.log(`Status: ${res.status}`);
  console.log("Response:", data);
}

async function testInvalidDelta() {
  console.log("\n⚠️ Testing 400 - invalid delta");
  const res = await fetch(`${API_BASE}/submissions/${TEST_PHONE}/weekly`, {
    method: "PATCH",
    headers: { 
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ delta: "not-a-number" })
  });
  
  const data = await res.json();
  console.log(`Status: ${res.status}`);
  console.log("Response:", data);
}

async function testFloorAtZero() {
  console.log("\n🔢 Testing floor at zero");
  
  // First, get current value
  const current = await testGetWeekly();
  const currentValue = current.weeklySubmissions;
  
  // Try to decrement below zero
  const largeNegative = -(currentValue + 10);
  await testPatchWeekly(largeNegative);
  
  // Verify it's at 0
  const result = await testGetWeekly();
  if (result.weeklySubmissions === 0) {
    console.log("✅ Floor at zero works correctly");
  } else {
    console.log("❌ Floor at zero failed - value is:", result.weeklySubmissions);
  }
  
  // Reset to original value
  await testPatchWeekly(currentValue);
}

async function testGetMonthly() {
  console.log("\n📊 Testing GET /api/submissions/:phone/monthly");
  const res = await fetch(`${API_BASE}/submissions/${TEST_PHONE}/monthly`, {
    headers: { "Authorization": `Bearer ${authToken}` }
  });
  
  const data = await res.json();
  console.log(`Status: ${res.status}`);
  console.log("Response:", data);
  return data;
}

async function testPatchMonthly(delta) {
  console.log(`\n✏️ Testing PATCH /api/submissions/:phone/monthly (delta: ${delta})`);
  const res = await fetch(`${API_BASE}/submissions/${TEST_PHONE}/monthly`, {
    method: "PATCH",
    headers: { 
      "Authorization": `Bearer ${authToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ delta })
  });
  
  const data = await res.json();
  console.log(`Status: ${res.status}`);
  console.log("Response:", data);
  return data;
}

async function testMonthlyFloorAtZero() {
  console.log("\n🔢 Testing monthly floor at zero");
  
  // First, get current value
  const current = await testGetMonthly();
  const currentValue = current.monthlySubmissions;
  
  // Try to decrement below zero
  const largeNegative = -(currentValue + 10);
  await testPatchMonthly(largeNegative);
  
  // Verify it's at 0
  const result = await testGetMonthly();
  if (result.monthlySubmissions === 0) {
    console.log("✅ Monthly floor at zero works correctly");
  } else {
    console.log("❌ Monthly floor at zero failed - value is:", result.monthlySubmissions);
  }
  
  // Reset to original value
  await testPatchMonthly(currentValue);
}

async function runTests() {
  console.log("🧪 Submission Routes Test Suite");
  console.log("================================");
  
  // Login first
  const loggedIn = await login();
  if (!loggedIn) {
    console.error("\n❌ Cannot proceed without authentication");
    return;
  }
  
  // Run weekly tests
  console.log("\n--- Weekly Submission Tests ---");
  await testUnauthorized();
  await testGetWeekly();
  await testPatchWeekly(1);  // Increment
  await testPatchWeekly(-1); // Decrement
  await testNotFound();
  await testInvalidDelta();
  await testFloorAtZero();
  
  // Run monthly tests
  console.log("\n--- Monthly Submission Tests ---");
  await testGetMonthly();
  await testPatchMonthly(1);  // Increment
  await testPatchMonthly(-1); // Decrement
  await testMonthlyFloorAtZero();
  
  console.log("\n✅ All tests completed");
}

runTests().catch(err => {
  console.error("\n❌ Test suite failed:", err);
  process.exit(1);
});
