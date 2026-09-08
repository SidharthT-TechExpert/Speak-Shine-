import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Status from "../models/statusSchema.js";
import { generateSVGPoster, generatePNGPosterBuffer } from "../api/posterGenerator.js";
import sharp from "sharp";

async function testPosterXml() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/speak-shine");
  const status = await Status.findOne().lean();
  console.log("Status topic:", status?.todayTopic);
  console.log("Status question:", status?.todayQuestion);
  console.log("Status contentType:", status?.todayContentType);
  console.log("Status vocabulary:", status?.todayVocabulary);

  const svgDataUri = generateSVGPoster({
    topic: status?.todayTopic || "Speaking Practice",
    question: status?.todayQuestion || "",
    category: status?.todayCategory || "General",
    contentType: status?.todayContentType || "question",
    vocabulary: status?.todayVocabulary || [],
    vocabRequiredCount: 3,
  });

  const base64 = svgDataUri.replace("data:image/svg+xml;base64,", "");
  const svgText = Buffer.from(base64, "base64").toString("utf-8");
  console.log("SVG Text length:", svgText.length);

  try {
    const png = await sharp(Buffer.from(svgText, "utf-8"), { density: 150 }).png().toBuffer();
    console.log("✅ Sharp successfully rendered PNG, length:", png.length);
  } catch (err) {
    console.error("❌ Sharp failed with error:", err.message);
    // Find line numbers in svgText
    const lines = svgText.split("\n");
    console.log("Total lines in SVG:", lines.length);
    lines.forEach((line, idx) => {
      if (line.includes("&") && !line.includes("&amp;") && !line.includes("&lt;") && !line.includes("&gt;") && !line.includes("&quot;")) {
        console.log(`Potential bad entity at line ${idx + 1}:`, line);
      }
    });
  }

  process.exit(0);
}

testPosterXml();
