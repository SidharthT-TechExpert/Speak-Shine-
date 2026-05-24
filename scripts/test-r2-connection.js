/**
 * Test R2 Connection Script
 * Run with: node scripts/test-r2-connection.js
 */

import { S3Client, ListBucketsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

console.log("\n=== R2 Connection Test ===\n");

// Check environment variables
console.log("1. Checking environment variables...");
const requiredVars = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME'
];

let missingVars = [];
for (const varName of requiredVars) {
  const value = process.env[varName];
  if (!value) {
    console.log(`   ❌ ${varName}: NOT SET`);
    missingVars.push(varName);
  } else {
    if (varName.includes('SECRET') || varName.includes('KEY')) {
      console.log(`   ✅ ${varName}: ${value.substring(0, 8)}... (${value.length} chars)`);
    } else {
      console.log(`   ✅ ${varName}: ${value}`);
    }
  }
}

if (missingVars.length > 0) {
  console.error("\n❌ Missing required environment variables:", missingVars.join(", "));
  process.exit(1);
}

// Create S3 client
console.log("\n2. Creating S3 client...");
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
console.log("   ✅ S3 client created");

// Test 1: List buckets
console.log("\n3. Testing bucket access...");
try {
  const listCommand = new ListBucketsCommand({});
  const response = await r2.send(listCommand);
  console.log("   ✅ Successfully connected to R2");
  console.log("   📦 Available buckets:", response.Buckets?.map(b => b.Name).join(", ") || "none");
  
  const targetBucket = process.env.R2_BUCKET_NAME;
  const bucketExists = response.Buckets?.some(b => b.Name === targetBucket);
  if (bucketExists) {
    console.log(`   ✅ Target bucket "${targetBucket}" exists`);
  } else {
    console.log(`   ⚠️  Target bucket "${targetBucket}" not found in account`);
  }
} catch (error) {
  console.error("   ❌ Failed to list buckets:", error.message);
  console.error("   Error details:", {
    name: error.name,
    code: error.code,
    statusCode: error.$metadata?.httpStatusCode
  });
  process.exit(1);
}

// Test 2: Generate presigned URL
console.log("\n4. Testing presigned URL generation...");
try {
  const testKey = `test/connection-test-${Date.now()}.txt`;
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: testKey,
    ContentType: "text/plain",
  });
  
  const url = await getSignedUrl(r2, command, { expiresIn: 900 });
  console.log("   ✅ Presigned URL generated successfully");
  console.log("   🔗 URL length:", url.length, "characters");
  console.log("   🔗 URL preview:", url.substring(0, 100) + "...");
} catch (error) {
  console.error("   ❌ Failed to generate presigned URL:", error.message);
  console.error("   Error details:", {
    name: error.name,
    code: error.code,
    message: error.message
  });
  if (error.stack) {
    console.error("   Stack trace:", error.stack.split('\n').slice(0, 5).join('\n'));
  }
  process.exit(1);
}

console.log("\n✅ All tests passed! R2 connection is working correctly.\n");
