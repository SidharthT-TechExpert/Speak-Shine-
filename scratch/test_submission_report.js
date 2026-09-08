import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { getSubmissionReportSummary } from "../backend/services/whatsapp/whatsappService.js";
import User from "../models/userSchema.js";

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const summary = await getSubmissionReportSummary();
  console.log("📊 Live Submission Report Summary for Paid Users:");
  console.log(JSON.stringify(summary, null, 2));

  const totalPaid = await User.countDocuments({ paid: true });
  const totalUsers = await User.countDocuments({});
  console.log(`Total users in DB: ${totalUsers}`);
  console.log(`Total paid users: ${totalPaid}`);

  await mongoose.disconnect();
  console.log("Disconnected.");
}

test().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
