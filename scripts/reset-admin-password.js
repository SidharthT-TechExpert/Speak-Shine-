/**
 * Reset admin password script
 * Usage: node scripts/reset-admin-password.js <phone> <newPassword>
 */

import mongoose from "mongoose";
import argon2 from "argon2";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, "../.env") });

// Import Auth model
const authSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  role: { type: String, enum: ["user", "trainer", "admin"], default: "user" },
  isActive: { type: Boolean, default: true },
  refreshTokens: [{
    token: String,
    expiresAt: Date,
  }],
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  createdAt: { type: Date, default: Date.now },
});

const Auth = mongoose.model("Auth", authSchema);

async function resetPassword() {
  const phone = process.argv[2];
  const newPassword = process.argv[3];

  if (!phone || !newPassword) {
    console.error("Usage: node scripts/reset-admin-password.js <phone> <newPassword>");
    console.error("Example: node scripts/reset-admin-password.js 8848096746 newpass123");
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error("❌ Password must be at least 6 characters");
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("❌ MONGODB_URI or MONGO_URI not found in environment variables");
      process.exit(1);
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Find user
    const auth = await Auth.findOne({ phone });
    if (!auth) {
      console.error(`❌ No account found with phone: ${phone}`);
      console.log("\n📋 Available accounts:");
      const allAuths = await Auth.find({}, "phone name role").lean();
      allAuths.forEach(a => {
        console.log(`   - ${a.phone} (${a.name || "No name"}) - ${a.role}`);
      });
      process.exit(1);
    }

    console.log(`\n👤 Found account:`);
    console.log(`   Phone: ${auth.phone}`);
    console.log(`   Name: ${auth.name || "No name"}`);
    console.log(`   Role: ${auth.role}`);
    console.log(`   Active: ${auth.isActive}`);

    // Hash new password
    console.log("\n🔐 Hashing new password...");
    auth.password = await argon2.hash(newPassword);
    
    // Reset failed attempts and unlock
    auth.failedLoginAttempts = 0;
    auth.lockUntil = null;
    
    await auth.save();

    console.log("✅ Password updated successfully!");
    console.log(`\n🎉 You can now login with:`);
    console.log(`   Phone: ${phone}`);
    console.log(`   Password: ${newPassword}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

resetPassword();
