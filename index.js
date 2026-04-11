import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import cron from "node-cron";
import dotenv from "dotenv";
import { connectDB } from "./db.js";
import User from "./models/userSchema.js";

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
    if (msg.key.fromMe) return; // ❌ avoid self reply

    const chatId = msg.key.remoteJid;
    if (chatId !== TARGET_GROUP) return;
    if (!msg.key.participant) return;

    const user = msg.key.participant;

    const content =
      msg.message?.ephemeralMessage?.message ||
      msg.message?.viewOnceMessage?.message ||
      msg.message;

    if (!content) return;

    const text = content?.conversation || content?.extendedTextMessage?.text;

    // 🔥 LOAD GROUP META ONCE
    const groupMeta = await sock.groupMetadata(TARGET_GROUP);
    const isAdmin = groupMeta.participants.find(
      (p) => p.id === user && p.admin,
    );

    // =============================
    // 🧠 COMMANDS (FIRST)
    // =============================

    if (text === "/fine") {
      const users = await User.find();

      let msgText = "💰 *Fine Report:*\n\n";

      users.forEach((u) => {
        msgText += `@${u.userId.split("@")[0]} → ₹${u.fine}\n`;
      });

      return sock.sendMessage(chatId, {
        text: msgText,
        mentions: users.map((u) => u.userId),
      });
    }

    if (text === "/reset") {
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

    if (text === "/resetday") {
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

    if (text === "/resetweek") {
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
    // 🎥 VIDEO LOGIC (STRICT)
    // =============================

    const video =
      content?.videoMessage ||
      content?.ephemeralMessage?.message?.videoMessage ||
      content?.viewOnceMessage?.message?.videoMessage;

    if (!video) return; // ❌ ignore non-video

    // ⏱️ duration check
    const duration = video.seconds || 0;

    if (duration < 60) {
      return sock.sendMessage(chatId, {
        text: `❌ @${user.split("@")[0]} video must be at least 1 minute!`,
        mentions: [user],
      });
    }

    // ❌ prevent duplicate
    const existing = await User.findOne({ userId: user });

    if (existing?.completed) {
      return sock.sendMessage(chatId, {
        text: `⚠️ @${user.split("@")[0]} already submitted`,
        mentions: [user],
      });
    }

    // ✅ mark completed
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

  // ⏰ REMINDER (IST)
  cron.schedule(TEST_MODE ? "*/2 * * * *" : "30 3,7,11,15 * * *", async () => {
    console.log(TEST_MODE ? "🧪 TEST Reminder..." : "⏰ Reminder...");

    const users = await User.find();
    const notDone = users.filter((u) => !u.completed);

    if (notDone.length === 0) return;

    let msg = TEST_MODE
      ? "🧪 TEST Reminder\n\n"
      : "⏰ *Reminder! Submit your video 🎥*\n\n";

    notDone.forEach((u) => {
      msg += `@${u.userId.split("@")[0]}\n`;
    });

    await sock.sendMessage(TARGET_GROUP, {
      text: msg,
      mentions: notDone.map((u) => u.userId),
    });
  });

  // 🚨 FINAL REPORT (12PM IST)
  cron.schedule(TEST_MODE ? "*/3 * * * *" : "30 6 * * *", async () => {
    console.log(TEST_MODE ? "🧪 TEST Final..." : "📊 Final report...");

    const users = await User.find();
    const notDone = users.filter((u) => !u.completed);

    let msg = "";

    if (notDone.length === 0) {
      msg = TEST_MODE
        ? "🧪 TEST: Everyone completed!"
        : "🎉 Everyone completed today's task!";
    } else {
      msg = TEST_MODE ? "🧪 TEST Final:\n\n" : "❌ *Final Report:*\n\n";

      for (let u of notDone) {
        if (!TEST_MODE) {
          u.fine += 2; // ❗ no fine in test mode
          await u.save();
        }

        msg += `@${u.userId.split("@")[0]} → ₹${u.fine}\n`;
      }
    }

    // reset attendance
    for (let u of users) {
      u.completed = false;
      await u.save();
    }

    await sock.sendMessage(TARGET_GROUP, {
      text: msg,
      mentions: notDone.map((u) => u.userId),
    });
  });

  // 🔗 CONNECTION
  sock.ev.on("connection.update", async ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "open") {
      console.log("✅ Connected!");
      setTimeout(() => loadGroup(sock), 3000);
    }

    if (connection === "close") {
      startBot();
    }
  });
}

startBot();
