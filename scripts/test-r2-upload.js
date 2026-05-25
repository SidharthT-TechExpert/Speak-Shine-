/**
 * Test actual R2 upload (PutObject) with the current credentials
 * node scripts/test-r2-upload.js
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL } = process.env;

console.log("\n=== R2 Upload Test ===\n");
console.log("Endpoint:", R2_ENDPOINT);
console.log("Bucket:", R2_BUCKET_NAME);
console.log("Key ID:", R2_ACCESS_KEY_ID?.substring(0, 8) + "...");
console.log("Secret length:", R2_SECRET_ACCESS_KEY?.length);

// Test 1: PutObjectCommand directly
console.log("\n--- Test 1: PutObjectCommand (direct) ---");
try {
  const s3 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: `test/upload-test-${Date.now()}.txt`,
    Body: Buffer.from("hello r2"),
    ContentType: "text/plain",
  }));
  console.log("✅ PutObjectCommand SUCCESS");
} catch (e) {
  console.log("❌ PutObjectCommand FAILED:", e.message);
}

// Test 2: Upload (multipart) class
console.log("\n--- Test 2: Upload class (multipart) ---");
try {
  const s3 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: R2_BUCKET_NAME,
      Key: `test/upload-test-multipart-${Date.now()}.txt`,
      Body: Buffer.from("hello r2 multipart"),
      ContentType: "text/plain",
    },
  });
  await upload.done();
  console.log("✅ Upload (multipart) SUCCESS");
} catch (e) {
  console.log("❌ Upload (multipart) FAILED:", e.message);
}

// Test 3: PutObjectCommand with requestChecksumCalculation disabled
console.log("\n--- Test 3: PutObjectCommand (checksum disabled) ---");
try {
  const s3 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "when_required",
    responseChecksumValidation: "when_required",
  });
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: `test/upload-test-nochecksum-${Date.now()}.txt`,
    Body: Buffer.from("hello r2 no checksum"),
    ContentType: "text/plain",
  }));
  console.log("✅ PutObjectCommand (no checksum) SUCCESS");
} catch (e) {
  console.log("❌ PutObjectCommand (no checksum) FAILED:", e.message);
}

console.log("\nDone.\n");
