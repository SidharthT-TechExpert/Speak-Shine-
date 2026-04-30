/**
 * Create admin account script
 * Usage: node scripts/create-admin-account.js <phone> <password> <name>
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

async function createAdmin() {
  const phone = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || "Admin";

  if (!phone || !password) {
    console.error("Usage: node scripts/create-admin-account.js <phone> <password> <name>");
    console.error("Example: node scripts/create-admin-account.js 8848096746 admin123 \"Sidharth T\"");
    process.exit(1);
  }

  if (password.length < 6) {
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

    // Check if account already exists
    const existing = await Auth.findOne({ phone });
    if (existing) {
      console.error(`❌ Account already exists with phone: ${phone}`);
      console.log(`   Name: ${existing.name}`);
      console.log(`   Role: ${existing.role}`);
      console.log("\n💡 Use reset-admin-password.js to change the password instead");
      process.exit(1);
    }

    // Create new admin account
    console.log("\n🔐 Creating admin account...");
    const hashedPassword = await argon2.hash(password);

    const auth = new Auth({
      phone,
      password: hashedPassword,
      name,
      role: "admin",
      isActive: true,
      failedLoginAttempts: 0,
    });

    await auth.save();

    console.log("✅ Admin account created successfully!");
    console.log(`\n🎉 Login credentials:`);
    console.log(`   Phone: ${phone}`);
    console.log(`   Password: ${password}`);
    console.log(`   Name: ${name}`);
    console.log(`   Role: admin`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

createAdmin();
