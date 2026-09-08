import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Status from "../models/statusSchema.js";
import { sendDailyPosterToGroup } from "../backend/services/whatsapp/whatsappService.js";

async function testSendPosterLocal() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/speak-shine");
  console.log("Connected to MongoDB. Fetching status...");
  const status = await Status.findOne().lean();
  console.log("Current DB Status:", {
    topic: status?.todayTopic,
    question: status?.todayQuestion,
    category: status?.todayCategory,
    contentType: status?.todayContentType,
  });

  console.log("Testing sendDailyPosterToGroup locally...");
  try {
    const res = await sendDailyPosterToGroup();
    console.log("✅ Dispatch Result:", res);
  } catch (err) {
    console.error("❌ Dispatch Error:", err.message);
  }

  process.exit(0);
}

testSendPosterLocal();
