#!/usr/bin/env node
/**
 * Cache Testing Script
 * Tests the cache implementation locally
 * 
 * Usage: node scripts/test-cache.js
 */

import { getRedisClient, isRedisAvailable } from "../redis.js";
import {
  cached,
  userProfileKey,
  OVERVIEW_KEY,
  WEEKLY_KEY,
  MONTHLY_KEY,
  COMMUNITY_KEY,
  TTL_18H,
  invalidateOnUpload,
  invalidateOnSubmissionChange,
  invalidateAll,
} from "../backend/services/cache/cacheService.js";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const log = (msg, color = "reset") => console.log(`${colors[color]}${msg}${colors.reset}`);
const success = (msg) => log(`✅ ${msg}`, "green");
const error = (msg) => log(`❌ ${msg}`, "red");
const info = (msg) => log(`ℹ️  ${msg}`, "cyan");
const warn = (msg) => log(`⚠️  ${msg}`, "yellow");

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    info(`Testing: ${name}`);
    await fn();
    success(`PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    error(`FAIL: ${name}`);
    error(`  Error: ${err.message}`);
    testsFailed++;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  log("\n🧪 Cache Implementation Test Suite\n", "blue");

  // Test 1: Redis Connection
  await test("Redis connection check", async () => {
    if (isRedisAvailable()) {
      const client = getRedisClient();
      const pong = await client.ping();
      if (pong !== "PONG") throw new Error("Redis ping failed");
      info("  Redis is available and responding");
    } else {
      warn("  Redis not available - using in-memory fallback");
    }
  });

  // Test 2: Cache Keys
  await test("Cache key generation", async () => {
    const phone = "919876543210";
    const profileKey = userProfileKey(phone);
    if (profileKey !== `profile:user:${phone}`) {
      throw new Error(`Expected profile:user:${phone}, got ${profileKey}`);
    }
    if (OVERVIEW_KEY !== "dashboard:overview") {
      throw new Error(`Expected dashboard:overview, got ${OVERVIEW_KEY}`);
    }
    info("  All cache keys generated correctly");
  });

  // Test 3: Cache Miss
  await test("Cache MISS on first request", async () => {
    const testKey = "test:cache:miss";
    let callCount = 0;
    
    const result = await cached(testKey, 60, async () => {
      callCount++;
      return { data: "test", timestamp: Date.now() };
    });
    
    if (callCount !== 1) {
      throw new Error(`Expected function to be called once, was called ${callCount} times`);
    }
    if (!result.data) {
      throw new Error("Expected result to have data");
    }
    info("  Cache MISS worked - function was called");
  });

  // Test 4: Cache HIT
  await test("Cache HIT on second request", async () => {
    const testKey = "test:cache:hit";
    let callCount = 0;
    
    // First call - cache miss
    const result1 = await cached(testKey, 60, async () => {
      callCount++;
      return { data: "test", timestamp: Date.now() };
    });
    
    // Second call - cache hit
    const result2 = await cached(testKey, 60, async () => {
      callCount++;
      return { data: "test", timestamp: Date.now() };
    });
    
    if (callCount !== 1) {
      throw new Error(`Expected function to be called once, was called ${callCount} times`);
    }
    if (result1.timestamp !== result2.timestamp) {
      throw new Error("Expected cached result to have same timestamp");
    }
    info("  Cache HIT worked - function was not called again");
  });

  // Test 5: Cache Expiration
  await test("Cache expiration after TTL", async () => {
    const testKey = "test:cache:expire";
    let callCount = 0;
    
    // First call with 1 second TTL
    await cached(testKey, 1, async () => {
      callCount++;
      return { data: "test1" };
    });
    
    // Wait for expiration
    info("  Waiting 2 seconds for cache to expire...");
    await sleep(2000);
    
    // Second call - should be cache miss
    await cached(testKey, 1, async () => {
      callCount++;
      return { data: "test2" };
    });
    
    if (callCount !== 2) {
      throw new Error(`Expected function to be called twice, was called ${callCount} times`);
    }
    info("  Cache expired correctly after TTL");
  });

  // Test 6: Invalidate on Upload
  await test("invalidateOnUpload clears correct caches", async () => {
    const phone = "919876543210";
    
    // Populate caches
    await cached(userProfileKey(phone), 60, async () => ({ user: "test" }));
    await cached(OVERVIEW_KEY, 60, async () => ({ overview: "test" }));
    await cached(COMMUNITY_KEY, 60, async () => ({ community: "test" }));
    await cached(WEEKLY_KEY, 60, async () => ({ weekly: "test" }));
    
    // Invalidate
    await invalidateOnUpload(phone);
    
    // Check that profile, overview, and community were cleared
    let callCount = 0;
    await cached(userProfileKey(phone), 60, async () => { callCount++; return {}; });
    await cached(OVERVIEW_KEY, 60, async () => { callCount++; return {}; });
    await cached(COMMUNITY_KEY, 60, async () => { callCount++; return {}; });
    
    if (callCount !== 3) {
      throw new Error(`Expected 3 cache misses, got ${callCount}`);
    }
    
    // Check that weekly was NOT cleared
    callCount = 0;
    await cached(WEEKLY_KEY, 60, async () => { callCount++; return {}; });
    if (callCount !== 0) {
      throw new Error("Weekly cache should not have been cleared");
    }
    
    info("  Correct caches were invalidated");
  });

  // Test 7: Invalidate on Submission Change
  await test("invalidateOnSubmissionChange clears reports", async () => {
    // Populate caches
    await cached(WEEKLY_KEY, 60, async () => ({ weekly: "test" }));
    await cached(MONTHLY_KEY, 60, async () => ({ monthly: "test" }));
    await cached(OVERVIEW_KEY, 60, async () => ({ overview: "test" }));
    
    // Invalidate
    await invalidateOnSubmissionChange();
    
    // Check that weekly and monthly were cleared
    let callCount = 0;
    await cached(WEEKLY_KEY, 60, async () => { callCount++; return {}; });
    await cached(MONTHLY_KEY, 60, async () => { callCount++; return {}; });
    
    if (callCount !== 2) {
      throw new Error(`Expected 2 cache misses, got ${callCount}`);
    }
    
    // Check that overview was NOT cleared
    callCount = 0;
    await cached(OVERVIEW_KEY, 60, async () => { callCount++; return {}; });
    if (callCount !== 0) {
      throw new Error("Overview cache should not have been cleared");
    }
    
    info("  Correct report caches were invalidated");
  });

  // Test 8: Invalidate All
  await test("invalidateAll clears all caches", async () => {
    const phone = "919876543210";
    
    // Populate all caches
    await cached(userProfileKey(phone), 60, async () => ({ user: "test" }));
    await cached(OVERVIEW_KEY, 60, async () => ({ overview: "test" }));
    await cached(WEEKLY_KEY, 60, async () => ({ weekly: "test" }));
    await cached(MONTHLY_KEY, 60, async () => ({ monthly: "test" }));
    await cached(COMMUNITY_KEY, 60, async () => ({ community: "test" }));
    
    // Invalidate all
    await invalidateAll();
    
    // Check that all were cleared
    let callCount = 0;
    await cached(userProfileKey(phone), 60, async () => { callCount++; return {}; });
    await cached(OVERVIEW_KEY, 60, async () => { callCount++; return {}; });
    await cached(WEEKLY_KEY, 60, async () => { callCount++; return {}; });
    await cached(MONTHLY_KEY, 60, async () => { callCount++; return {}; });
    await cached(COMMUNITY_KEY, 60, async () => { callCount++; return {}; });
    
    if (callCount !== 5) {
      throw new Error(`Expected 5 cache misses, got ${callCount}`);
    }
    
    info("  All caches were invalidated");
  });

  // Test 9: TTL Value
  await test("TTL_18H constant is correct", async () => {
    const expected = 18 * 60 * 60; // 18 hours in seconds
    if (TTL_18H !== expected) {
      throw new Error(`Expected ${expected}, got ${TTL_18H}`);
    }
    info(`  TTL is correctly set to ${TTL_18H} seconds (18 hours)`);
  });

  // Summary
  log("\n" + "=".repeat(50), "blue");
  log(`\n📊 Test Results:\n`, "blue");
  success(`Passed: ${testsPassed}`);
  if (testsFailed > 0) {
    error(`Failed: ${testsFailed}`);
  }
  log(`Total:  ${testsPassed + testsFailed}\n`, "cyan");

  if (testsFailed === 0) {
    success("🎉 All tests passed! Cache implementation is working correctly.\n");
    process.exit(0);
  } else {
    error("❌ Some tests failed. Please review the errors above.\n");
    process.exit(1);
  }
}

// Run tests
runTests().catch((err) => {
  error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
