import dotenv from "dotenv";
import { connectDB } from "./db.js";
import Status from "./models/statusSchema.js";

export async function resetStatus() {
  await Status.updateOne({}, {
    $set: {
      questionSentToday: false,
      notifiedEmpty: false,
      notifiedLast: false,
      fineAppliedToday: false,
      todayTopic: null,
      todayQuestion: null,
      todayCategory: null,
      todayPosterImage: null,
      posterExpiresAt: null,
    }
  });
}

// Allow running directly: node resetStatus.js
if (process.argv[1].includes("resetStatus")) {
  dotenv.config();
  await connectDB();
  await resetStatus();
  console.log("✅ Status reset done");
  process.exit(0);
}
