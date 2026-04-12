import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import cron from "node-cron";
import dotenv from "dotenv";
import { connectDB } from "./db.js";
import User from "./models/userSchema.js";
import Question from "./models/questionSchema.js";

dotenv.config();
connectDB();

const TARGET_GROUP = process.env.TARGET_GROUP;
const TEST_MODE = process.env.TEST_MODE === "true";

// ✅ SAFE SEND (retry + timeout fix)
const safeSend = async (sock, jid, msg) => {
  try {
    await sock.sendMessage(jid, msg);
  } catch (err) {
    console.log("❌ Send failed, retrying...", err?.message);

    setTimeout(async () => {
      try {
        await sock.sendMessage(jid, msg);
      } catch {
        console.log("❌ Retry failed");
      }
    }, 2000);
  }
};

// 🔥 LOAD USERS
async function loadGroup(sock) {
  try {
    const meta = await sock.groupMetadata(TARGET_GROUP);
    const myId = sock.user.id;

    for (let p of meta.participants) {
      if (p.id === myId) continue;
      await User.findOneAndUpdate({ userId: p.id }, {}, { upsert: true });
    }

    console.log("👥 Users synced:", meta.participants.length);
  } catch {
    setTimeout(() => loadGroup(sock), 5000);
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],

    // 🔥 IMPORTANT FIXES
    keepAliveIntervalMs: 60000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
  });

  sock.ev.on("creds.update", saveCreds);

  // =============================
  // 📩 MESSAGE HANDLER
  // =============================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const chatId = msg.key.remoteJid;
    if (chatId !== TARGET_GROUP) return;
    if (!msg.key.participant) return;

    const user = msg.key.participant;

    const content =
      msg.message?.ephemeralMessage?.message ||
      msg.message?.viewOnceMessage?.message ||
      msg.message;

    if (!content) return;

    const text =
      content?.conversation ||
      content?.extendedTextMessage?.text ||
      content?.imageMessage?.caption ||
      "";

    console.log("📩 TEXT:", text);

    const groupMeta = await sock.groupMetadata(TARGET_GROUP);
    const isAdmin = groupMeta.participants.find(
      (p) => p.id === user && p.admin,
    );

    // =============================
    // 🧠 COMMANDS
    // =============================

    if (text?.trim() === "/fine") {
      const users = await User.find();

      if (users.length === 0) {
        return safeSend(sock, chatId, {
          text: "⚠️ No users found!",
        });
      }

      let msgText = "💰 *Fine Report:*\n\n";

      users.forEach((u) => {
        msgText += `@${u.userId.split("@")[0]} → ₹${u.fine}\n`;
      });

      return safeSend(sock, chatId, {
        text: msgText,
        mentions: users.map((u) => u.userId),
      });
    }

    if (text?.trim() === "/reset") {
      if (!isAdmin) {
        return safeSend(sock, chatId, {
          text: "❌ Only admin can reset",
        });
      }

      await User.deleteMany({});
      return safeSend(sock, chatId, { text: "🧹 All data reset!" });
    }

    if (text?.trim() === "/resetday") {
      if (!isAdmin) {
        return safeSend(sock, chatId, {
          text: "❌ Only admin can reset day",
        });
      }

      await User.updateMany({}, { completed: false });
      return safeSend(sock, chatId, {
        text: "🔄 Today's attendance reset!",
      });
    }

    if (text?.trim() === "/resetweek") {
      if (!isAdmin) {
        return safeSend(sock, chatId, {
          text: "❌ Only admin can reset week",
        });
      }

      await User.updateMany({}, { fine: 0 });
      return safeSend(sock, chatId, {
        text: "💰 Weekly fines reset!",
      });
    }

    // =============================
    // 🎥 VIDEO LOGIC
    // =============================

    const video =
      content?.videoMessage ||
      content?.ephemeralMessage?.message?.videoMessage ||
      content?.viewOnceMessage?.message?.videoMessage;

    if (!video) return;

    const duration = video.seconds || 0;

    if (duration < 60) {
      return safeSend(sock, chatId, {
        text: `❌ @${user.split("@")[0]} video must be at least 1 minute!`,
        mentions: [user],
      });
    }

    const existing = await User.findOne({ userId: user });

    if (existing?.completed) {
      return safeSend(sock, chatId, {
        text: `⚠️ @${user.split("@")[0]} already submitted`,
        mentions: [user],
      });
    }

    await User.findOneAndUpdate(
      { userId: user },
      { completed: true },
      { upsert: true },
    );

    await safeSend(sock, chatId, {
      text: `✅ @${user.split("@")[0]} completed task`,
      mentions: [user],
    });
  });

  // =============================
  // ⏰ REMINDER
  // =============================
  cron.schedule(TEST_MODE ? "*/2 * * * *" : "30 3,7,11,15 * * *", async () => {
    const users = await User.find();
    const notDone = users.filter((u) => !u.completed);
    if (notDone.length === 0) return;

    let msg = "⏰ *Reminder! Submit your video 🎥*\n\n";

    notDone.forEach((u) => {
      msg += `@${u.userId.split("@")[0]}\n`;
    });

    await safeSend(sock, TARGET_GROUP, {
      text: msg,
      mentions: notDone.map((u) => u.userId),
    });
  });

  // =============================
  // 🚨 FINAL REPORT
  // =============================
  cron.schedule(TEST_MODE ? "*/3 * * * *" : "30 6 * * *", async () => {
    const users = await User.find();
    const notDone = users.filter((u) => !u.completed);

    let msg = "";

    if (notDone.length === 0) {
      msg = "🎉 Everyone completed today's task!";
    } else {
      msg = "❌ *Final Report:*\n\n";

      for (let u of notDone) {
        if (!TEST_MODE) {
          u.fine += 2;
          await u.save();
        }

        msg += `@${u.userId.split("@")[0]} → ₹${u.fine}\n`;
      }
    }

    for (let u of users) {
      u.completed = false;
      await u.save();
    }

    await safeSend(sock, TARGET_GROUP, {
      text: msg,
      mentions: notDone.map((u) => u.userId),
    });
  });

  // =============================
  // 🧠 DAILY QUESTION (11 AM IST)
  // =============================
  cron.schedule(TEST_MODE ? "*/1 * * * *" : "30 5 * * *", async () => {
    console.log("📢 Daily Question...");

    const count = await Question.countDocuments();

    if (count === 0) {
      return safeSend(sock, TARGET_GROUP, {
        text: "🎉 All questions finished!",
      });
    }

    const random = Math.floor(Math.random() * count);
    const question = await Question.findOne().skip(random);

    if (!question) return;

    await Question.findByIdAndDelete(question._id);

    const msg =
      `🧠 *Daily Speaking Question*\n\n` +
      `💬 "${question.quote}"\n\n` +
      `👉 ${question.question}`;

    await safeSend(sock, TARGET_GROUP, { text: msg });
  });

  // =============================
  // 🔗 CONNECTION
  // =============================
  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("✅ Connected (Stable)");
      setTimeout(() => loadGroup(sock), 3000);
    }

    if (connection === "close") {
      console.log("⚠️ Reconnecting...");
      startBot();
    }
  });

  if (sock.authState?.creds?.me?.id) {
    console.log("🔐 Session restored");
  }

  sock.ev.on("connection.update", ({ qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
  });
}

startBot();
