import mongoose from "mongoose";

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,  // 10s to find a server
  socketTimeoutMS: 45000,           // 45s socket timeout
  heartbeatFrequencyMS: 10000,      // check connection every 10s
  maxPoolSize: 10,
  retryWrites: true,
  retryReads: true,
};

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, MONGO_OPTIONS);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.log("❌ DB initial connection error:", err.message);
    // Retry after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

// Auto-reconnect on disconnect
mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB disconnected — reconnecting in 5s...");
  setTimeout(connectDB, 5000);
});

mongoose.connection.on("error", (err) => {
  console.log("❌ MongoDB error:", err.message);
  if (err.name === "MongoTopologyClosedError" || err.name === "MongoNetworkError") {
    console.log("🔄 Attempting reconnect...");
    setTimeout(connectDB, 5000);
  }
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
