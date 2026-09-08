import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import WhatsAppAuth from "../models/whatsAppAuthSchema.js";
import fs from "fs";
import path from "path";

async function testBatchedSync() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB Atlas.");

  const authDir = path.resolve(process.cwd(), "auth");
  const files = fs.readdirSync(authDir);
  console.log(`Found ${files.length} files in auth/`);

  // We only need creds.json, app-state*, and keys
  const operations = [];
  for (const file of files) {
    const filePath = path.join(authDir, file);
    if (fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath, "utf-8");
      operations.push({
        updateOne: {
          filter: { key: file },
          update: { $set: { value: content, updatedAt: new Date() } },
          upsert: true,
        },
      });
    }
  }

  console.log(`Executing bulkWrite for ${operations.length} operations...`);
  const startTime = Date.now();
  const chunkSize = 500;
  for (let i = 0; i < operations.length; i += chunkSize) {
    const chunk = operations.slice(i, i + chunkSize);
    await WhatsAppAuth.bulkWrite(chunk, { ordered: false });
    process.stdout.write(`.`);
  }
  console.log(`\n✅ Synced ${operations.length} files in ${Date.now() - startTime}ms!`);

  const total = await WhatsAppAuth.countDocuments();
  console.log("Total auth documents in MongoDB Atlas:", total);

  process.exit(0);
}

testBatchedSync();
