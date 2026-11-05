import mongoose from "mongoose";

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 30000,  // 30s to find a server (tolerates brief network drops)
  socketTimeoutMS: 60000,           // 60s socket timeout
  heartbeatFrequencyMS: 30000,      // check connection every 30s (less aggressive)
  connectTimeoutMS: 30000,          // 30s to establish initial connection
  maxPoolSize: 10,
  retryWrites: true,
  retryReads: true,
};

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, MONGO_OPTIONS);
    console.log("✅ MongoDB Connected");
    await dropLegacyQuestionIndexes();
  } catch (err) {
    console.log("❌ DB initial connection error:", err.message);
    // Retry after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

/**
 * Drops legacy global unique indexes on question text/topic if they lack partialFilterExpression,
 * allowing manual challenge setups (shadowing, story, picture) to reuse standard prompt text.
 */
async function dropLegacyQuestionIndexes() {
  try {
    const coll = mongoose.connection.collection("questions");
    const indexes = await coll.indexes();
    for (const idx of indexes) {
      if ((idx.name === "question_1" || idx.name === "topic_1") && !idx.partialFilterExpression) {
        console.log(`[DB] Dropping legacy global unique index on questions: ${idx.name}`);
        await coll.dropIndex(idx.name);
      }
    }
  } catch (err) {
    // Non-critical, ignore if collection does not exist yet or index already dropped
  }
}

// Mongoose handles reconnection automatically — just log events, don't call connectDB() again
// as that creates duplicate connections and causes the connect/disconnect loop.
mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB disconnected — Mongoose will reconnect automatically...");
});

mongoose.connection.on("error", (err) => {
  console.log("❌ MongoDB error:", err.message);
});

mongoose.connection.on("reconnected", () => {
  console.log("✅ MongoDB reconnected");
});

/**
 * Safe DB operation wrapper — retries up to 3 times with backoff if topology is closed.
 */
export async function safeDB(fn, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isNetworkErr =
        err.name === "MongoTopologyClosedError" ||
        err.name === "MongoNetworkError" ||
        err.message?.includes("Topology is closed") ||
        err.message?.includes("connection timed out") ||
        err.message?.includes("ECONNRESET");

      if (isNetworkErr && attempt < retries) {
        const delay = attempt * 2000; // 2s, 4s
        console.log(`⚠️ DB error (attempt ${attempt}/${retries}) — retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Periodic DB health check — logs state every 5 minutes.
 * Call this once after connectDB().
 */
export function startDBHealthCheck(notifyOwner) {
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  setInterval(async () => {
    const state = mongoose.connection.readyState;
    // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    const labels = ["disconnected", "connected", "connecting", "disconnecting"];
    const label = labels[state] ?? "unknown";

    if (state !== 1) {
      console.log(`🔴 DB Health: ${label} (state=${state})`);
      if (notifyOwner) {
        try { await notifyOwner(`🔴 *DB Health Alert*\n_MongoDB is ${label}. Attempting reconnect..._`); } catch (_) {}
      }
    } else {
      console.log(`💚 DB Health: ${label}`);
    }
  }, INTERVAL_MS);
}
