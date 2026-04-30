/**
 * Sync Auth accounts to Users collection
 * Creates User records for Auth accounts that don't have corresponding User entries
 * Usage: node scripts/sync-auth-to-users.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, "../.env") });

// Import schemas
const authSchema = new mongoose.Schema({
  phone: String,
  name: String,
  role: String,
  isActive: Boolean,
});

const userSchema = new mongoose.Schema({
  userId: String,
  name: String,
  phone: String,
  completed: { type: Boolean, default: false },
  streak: { type: Number, default: 0 },
  fine: { type: Number, default: 0 },
  weeklySubmissions: { type: Number, default: 0 },
  monthlySubmissions: { type: Number, default: 0 },
  weeklyFine: { type: Number, default: 0 },
  feedbackScores: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now },
});

const Auth = mongoose.model("Auth", authSchema);
const User = mongoose.model("User", userSchema);

async function syncAuthToUsers() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("❌ MONGODB_URI or MONGO_URI not found in environment variables");
      process.exit(1);
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // Get all auth accounts
    const auths = await Auth.find({ isActive: true }).lean();
    console.log(`📋 Found ${auths.length} active auth accounts\n`);

    let created = 0;
    let skipped = 0;

    for (const auth of auths) {
      // Check if user already exists
      const existingUser = await User.findOne({ phone: auth.phone });
      
      if (existingUser) {
        console.log(`⏭️  Skipped: ${auth.name} (${auth.phone}) - User record already exists`);
        skipped++;
        continue;
      }

      // Create new user record
      const newUser = new User({
        userId: `${auth.phone}@webapp.local`, // Fake userId for webapp-only users
        name: auth.name || "User",
        phone: auth.phone,
        completed: false,
        streak: 0,
        fine: 0,
        weeklySubmissions: 0,
        monthlySubmissions: 0,
        weeklyFine: 0,
        feedbackScores: [],
        createdAt: new Date(),
      });

      await newUser.save();
      console.log(`✅ Created: ${auth.name} (${auth.phone})`);
      created++;
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Created: ${created} user records`);
    console.log(`   ⏭️  Skipped: ${skipped} (already exist)`);
    console.log(`   📈 Total: ${created + skipped} accounts processed`);

    if (created > 0) {
      console.log(`\n🎉 Success! Dashboard should now show user data.`);
    } else {
      console.log(`\n✨ All auth accounts already have user records.`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

syncAuthToUsers();
