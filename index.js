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
    keepAliveIntervalMs: 30000,
  });

  sock.ev.on("creds.update", saveCreds);

  // 📩 MESSAGE HANDLER
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    const chatId = msg.key.remoteJid;
    if (chatId !== TARGET_GROUP) return;
    if (!msg.key.participant) return;

    const user = msg.key.participant;

    const content =
      msg.message?.ephemeralMessage?.message ||
      msg.message?.viewOnceMessage?.message ||
      msg.message;

    if (!content) return;

    // ✅ FIXED TEXT PARSER
    const text =
      content?.conversation ||
      content?.extendedTextMessage?.text ||
      content?.imageMessage?.caption ||
      "";

    console.log("📩 TEXT:", text);

    // 🔥 GROUP META
    const groupMeta = await sock.groupMetadata(TARGET_GROUP);
    const isAdmin = groupMeta.participants.find(
      (p) => p.id === user && p.admin,
    );

    // =============================
    // 🧠 COMMANDS
    // =============================

    // ✅ /fine
    if (text?.trim() === "/fine") {
      const users = await User.find();

      if (users.length === 0) {
        return sock.sendMessage(chatId, {
          text: "⚠️ No users found!",
        });
      }

      let msgText = "💰 *Fine Report:*\n\n";

      users.forEach((u) => {
        msgText += `@${u.userId.split("@")[0]} → ₹${u.fine}\n`;
      });

      return sock.sendMessage(chatId, {
        text: msgText,
        mentions: users.map((u) => u.userId),
      });
    }

    // ✅ /reset
    if (text?.trim() === "/reset") {
      if (!isAdmin) {
        return sock.sendMessage(chatId, {
          text: "❌ Only admin can reset",
        });
      }

      await User.deleteMany({});

      return sock.sendMessage(chatId, {
        text: "🧹 All data reset!",
      });
    }

    // ✅ /resetday
    if (text?.trim() === "/resetday") {
      if (!isAdmin) {
        return sock.sendMessage(chatId, {
          text: "❌ Only admin can reset day",
        });
      }

      await User.updateMany({}, { completed: false });

      return sock.sendMessage(chatId, {
        text: "🔄 Today's attendance reset!",
      });
    }

    // ✅ /resetweek
    if (text?.trim() === "/resetweek") {
      if (!isAdmin) {
        return sock.sendMessage(chatId, {
          text: "❌ Only admin can reset week",
        });
      }

      await User.updateMany({}, { fine: 0 });

      return sock.sendMessage(chatId, {
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
      return sock.sendMessage(chatId, {
        text: `❌ @${user.split("@")[0]} video must be at least 1 minute!`,
        mentions: [user],
      });
    }

    const existing = await User.findOne({ userId: user });

    if (existing?.completed) {
      return sock.sendMessage(chatId, {
        text: `⚠️ @${user.split("@")[0]} already submitted`,
        mentions: [user],
      });
    }

    await User.findOneAndUpdate(
      { userId: user },
      { completed: true },
      { upsert: true },
    );

    await sock.sendMessage(chatId, {
      text: `✅ @${user.split("@")[0]} completed task`,
      mentions: [user],
    });
  });

  // ⏰ REMINDER
  cron.schedule(TEST_MODE ? "*/2 * * * *" : "30 3,7,11,15 * * *", async () => {
    const users = await User.find();
    const notDone = users.filter((u) => !u.completed);

    if (notDone.length === 0) return;

    let msg = "⏰ *Reminder! Submit your video 🎥*\n\n";

    notDone.forEach((u) => {
      msg += `@${u.userId.split("@")[0]}\n`;
    });

    await sock.sendMessage(TARGET_GROUP, {
      text: msg,
      mentions: notDone.map((u) => u.userId),
    });
  });

  // 🚨 FINAL REPORT
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

    await sock.sendMessage(TARGET_GROUP, {
      text: msg,
      mentions: notDone.map((u) => u.userId),
    });
  });

  // 🧠 DAILY QUESTION (11 AM IST)
  cron.schedule(TEST_MODE ? "*/1 * * * *" : "30 5 * * *", async () => {
    console.log("📢 Daily Question...");

    const count = await Question.countDocuments();

    if (count === 0) {
      return sock.sendMessage(TARGET_GROUP, {
        text: "🎉 All questions finished!",
      });
    }

    const random = Math.floor(Math.random() * count);
    const question = await Question.findOne().skip(random);

    if (!question) return;

    // ❌ DELETE permanently
    await Question.findByIdAndDelete(question._id);

    const msg =
      `🧠 *Daily Speaking Question*\n\n` +
      `💬 "${question.quote}"\n\n` +
      `👉 ${question.question}`;

    await sock.sendMessage(TARGET_GROUP, { text: msg });
  });

  // 🔗 CONNECTION
  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("✅ Stable connection established");
    }

    if (connection === "close") {
      console.log("⚠️ Reconnecting...");
      startBot();
    }
  });
}

startBot();
