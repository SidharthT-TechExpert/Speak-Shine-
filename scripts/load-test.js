/**
 * Load Testing Script for Speak & Shine
 * Tests concurrent user capacity and video processing queue
 * 
 * Usage:
 *   node scripts/load-test.js --users 10 --concurrent 5
 *   node scripts/load-test.js --users 50 --concurrent 10
 *   node scripts/load-test.js --users 100 --concurrent 20
 */

import fetch from 'node-fetch';
import fs from 'fs';
import { performance } from 'perf_hooks';

// Configuration
const API_URL = process.env.API_URL || 'https://speak-shine.up.railway.app';
const TEST_VIDEO_PATH = process.argv.find(arg => arg.startsWith('--video='))?.split('=')[1] || null;
const NUM_USERS = parseInt(process.argv.find(arg => arg.startsWith('--users='))?.split('=')[1] || '10');
const CONCURRENT = parseInt(process.argv.find(arg => arg.startsWith('--concurrent='))?.split('=')[1] || '5');

// Test credentials (can be passed via command line or environment)
const TEST_PHONE = process.argv.find(arg => arg.startsWith('--phone='))?.split('=')[1] || process.env.TEST_PHONE || '9999999999';
const TEST_PASSWORD = process.argv.find(arg => arg.startsWith('--password='))?.split('=')[1] || process.env.TEST_PASSWORD || 'test123';

let authToken = null;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// Login to get auth token
async function login() {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE, password: TEST_PASSWORD }),
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    authToken = data.accessToken;
    log(colors.green, '✅ Logged in successfully');
    return true;
  } catch (error) {
    log(colors.red, '❌ Login failed:', error.message);
    log(colors.yellow, '\n💡 Create a test account first:');
    log(colors.yellow, `   node scripts/create-admin-account.js ${TEST_PHONE} ${TEST_PASSWORD} "Load Test User"`);
    return false;
  }
}

// Get presigned URL for upload
async function getPresignedUrl(filename) {
  const response = await fetch(
    `${API_URL}/api/video/presign?filename=${filename}&mimeType=video/mp4`,
    {
      headers: { 'Authorization': `Bearer ${authToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Presign failed: ${response.status}`);
  }

  return await response.json();
}

// Upload video to R2
async function uploadToR2(uploadUrl, videoBuffer) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: videoBuffer,
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed: ${response.status}`);
  }
}

// Confirm upload and start analysis
async function confirmUpload(key, publicUrl) {
  const response = await fetch(`${API_URL}/api/video/confirm`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key,
      publicUrl,
      mimeType: 'video/mp4',
      isPublic: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Confirm failed: ${response.status}`);
  }

  return await response.json();
}

// Simulate a single user uploading a video
async function simulateUserUpload(userId, videoBuffer) {
  const start = performance.now();
  
  try {
    // Step 1: Get presigned URL
    const presign = await getPresignedUrl(`load-test-${userId}-${Date.now()}.mp4`);
    
    // Step 2: Upload to R2
    await uploadToR2(presign.uploadUrl, videoBuffer);
    
    // Step 3: Confirm and start analysis
    const result = await confirmUpload(presign.key, presign.publicUrl);
    
    const elapsed = performance.now() - start;
    log(colors.green, `✅ User ${userId}: Uploaded in ${elapsed.toFixed(0)}ms - Report ID: ${result.reportId}`);
    
    return {
      success: true,
      userId,
      elapsed,
      reportId: result.reportId,
    };
  } catch (error) {
    const elapsed = performance.now() - start;
    log(colors.red, `❌ User ${userId}: Failed after ${elapsed.toFixed(0)}ms - ${error.message}`);
    
    return {
      success: false,
      userId,
      elapsed,
      error: error.message,
    };
  }
}

// Check queue status
async function checkQueueStatus() {
  try {
    const response = await fetch(`${API_URL}/api/video/queue-stats`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });

    if (response.ok) {
      const stats = await response.json();
      return stats;
    }
  } catch (error) {
    // Queue stats endpoint might not exist
  }
  return null;
}

// Main load test function
async function runLoadTest() {
  log(colors.cyan, '\n🧪 ═══════════════════════════════════════════════════════');
  log(colors.cyan, '   SPEAK & SHINE - LOAD TEST');
  log(colors.cyan, '   ═══════════════════════════════════════════════════════\n');
  
  log(colors.blue, `📊 Configuration:`);
  log(colors.blue, `   API URL: ${API_URL}`);
  log(colors.blue, `   Total Users: ${NUM_USERS}`);
  log(colors.blue, `   Concurrent: ${CONCURRENT}`);
  log(colors.blue, `   Test Video: ${TEST_VIDEO_PATH || 'Generated dummy video'}\n`);

  // Login
  const loggedIn = await login();
  if (!loggedIn) {
    process.exit(1);
  }

  // Load or generate test video
  let videoBuffer;
  if (TEST_VIDEO_PATH && fs.existsSync(TEST_VIDEO_PATH)) {
    log(colors.blue, `📹 Loading test video: ${TEST_VIDEO_PATH}`);
    videoBuffer = fs.readFileSync(TEST_VIDEO_PATH);
    log(colors.blue, `   Size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB\n`);
  } else {
    log(colors.yellow, '⚠️  No test video provided, using dummy data (will fail analysis)');
    log(colors.yellow, '   Use --video=path/to/video.mp4 for realistic testing\n');
    // Create a small dummy buffer
    videoBuffer = Buffer.alloc(1024 * 1024); // 1MB dummy
  }

  // Run load test
  log(colors.cyan, `🚀 Starting load test...\n`);
  const testStart = performance.now();
  const results = [];
  
  // Process in batches
  const batches = Math.ceil(NUM_USERS / CONCURRENT);
  
  for (let batch = 0; batch < batches; batch++) {
    const batchStart = batch * CONCURRENT;
    const batchEnd = Math.min(batchStart + CONCURRENT, NUM_USERS);
    const batchSize = batchEnd - batchStart;
    
    log(colors.blue, `📦 Batch ${batch + 1}/${batches}: Users ${batchStart + 1}-${batchEnd}`);
    
    const batchPromises = [];
    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(simulateUserUpload(i + 1, videoBuffer));
    }
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Check queue status
    const queueStats = await checkQueueStatus();
    if (queueStats) {
      log(colors.yellow, `   📊 Queue: ${queueStats.queueLength} waiting, ${queueStats.isProcessing ? 'Processing' : 'Idle'}`);
    }
    
    // Wait 2 seconds between batches
    if (batch < batches - 1) {
      log(colors.blue, `   ⏳ Waiting 2s before next batch...\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  const testEnd = performance.now();
  const totalTime = testEnd - testStart;
  
  // Calculate statistics
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const avgTime = results.reduce((sum, r) => sum + r.elapsed, 0) / results.length;
  const minTime = Math.min(...results.map(r => r.elapsed));
  const maxTime = Math.max(...results.map(r => r.elapsed));
  
  // Print results
  log(colors.cyan, '\n\n📊 ═══════════════════════════════════════════════════════');
  log(colors.cyan, '   LOAD TEST RESULTS');
  log(colors.cyan, '   ═══════════════════════════════════════════════════════\n');
  
  log(colors.green, `✅ Successful: ${successful.length}/${NUM_USERS} (${(successful.length / NUM_USERS * 100).toFixed(1)}%)`);
  log(colors.red, `❌ Failed: ${failed.length}/${NUM_USERS} (${(failed.length / NUM_USERS * 100).toFixed(1)}%)`);
  
  log(colors.blue, `\n⏱️  Timing:`);
  log(colors.blue, `   Total test time: ${(totalTime / 1000).toFixed(1)}s`);
  log(colors.blue, `   Average upload: ${avgTime.toFixed(0)}ms`);
  log(colors.blue, `   Fastest upload: ${minTime.toFixed(0)}ms`);
  log(colors.blue, `   Slowest upload: ${maxTime.toFixed(0)}ms`);
  
  if (failed.length > 0) {
    log(colors.red, `\n❌ Failed uploads:`);
    failed.forEach(f => {
      log(colors.red, `   User ${f.userId}: ${f.error}`);
    });
  }
  
  // Final queue check
  const finalQueue = await checkQueueStatus();
  if (finalQueue) {
    log(colors.yellow, `\n📊 Final Queue Status:`);
    log(colors.yellow, `   Queue length: ${finalQueue.queueLength}`);
    log(colors.yellow, `   Processing: ${finalQueue.isProcessing ? 'Yes' : 'No'}`);
    log(colors.yellow, `   Total processed: ${finalQueue.totalProcessed}`);
    log(colors.yellow, `   Total failed: ${finalQueue.totalFailed}`);
    if (finalQueue.avgProcessingMin) {
      log(colors.yellow, `   Avg processing time: ${finalQueue.avgProcessingMin} min`);
    }
  }
  
  // Recommendations
  log(colors.cyan, `\n💡 Recommendations:`);
  if (successful.length === NUM_USERS) {
    log(colors.green, `   ✅ System handled ${NUM_USERS} concurrent users successfully!`);
    log(colors.green, `   ✅ Try increasing load with --users=${NUM_USERS * 2}`);
  } else if (successful.length / NUM_USERS >= 0.9) {
    log(colors.yellow, `   ⚠️  ${(failed.length / NUM_USERS * 100).toFixed(1)}% failure rate - approaching capacity`);
    log(colors.yellow, `   ⚠️  Consider scaling if you need more than ${NUM_USERS} concurrent users`);
  } else {
    log(colors.red, `   🔴 High failure rate - system is overloaded`);
    log(colors.red, `   🔴 Current capacity: ~${successful.length} concurrent users`);
    log(colors.red, `   🔴 Recommendation: Upgrade Railway memory or reduce concurrent load`);
  }
  
  log(colors.cyan, '\n═══════════════════════════════════════════════════════\n');
}

// Run the test
runLoadTest().catch(error => {
  log(colors.red, '\n❌ Load test failed:', error.message);
  process.exit(1);
});
