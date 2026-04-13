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
import generateVoice from "./generateAudio.js";
import fs from "fs";

dotenv.config();
connectDB();

const TARGET_GROUP = process.env.TARGET_GROUP;
const TIMEZONE = "Asia/Kolkata";

// =============================
// ✅ SAFE SEND
// =============================
const safeSend = async (sock, jid, msg) => {
  try {
    await sock.sendMessage(jid, msg);
  } catch {
    setTimeout(() => sock.sendMessage(jid, msg), 2000);
  }
};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
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

    const user = msg.key.participant;

    const content =
      msg.message?.ephemeralMessage?.message ||
      msg.message?.viewOnceMessage?.message ||
      msg.message;

    const text =
      content?.conversation ||
      content?.extendedTextMessage?.text ||
      content?.imageMessage?.caption ||
      "";

    const groupMeta = await sock.groupMetadata(TARGET_GROUP);
    const isAdmin = groupMeta.participants.find(
      (p) => p.id === user && p.admin,
    );

    // =============================
    // 🧠 COMMANDS
    // =============================

    if (text === "/fine") {
      const users = await User.find();
      let msg = "💰 *Fine Report*\n\n";
      users.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]} → ₹${u.fine}\n`;
      });

      return safeSend(sock, chatId, {
        text: msg,
        mentions: users.map((u) => u.userId),
      });
    }

    if (text === "/leaderboard") {
      const users = await User.find();
      let msg = "🏆 *Leaderboard*\n\n";

      users
        .sort((a, b) => b.completed - a.completed)
        .forEach((u, i) => {
          const medal = ["🥇", "🥈", "🥉"][i] || "🔹";
          msg += `${medal} @${u.userId.split("@")[0]} → ${
            u.completed ? "✅" : "❌"
          }\n`;
        });

      return safeSend(sock, chatId, {
        text: msg,
        mentions: users.map((u) => u.userId),
      });
    }

    if (text === "/remaining") {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);

      if (!pending.length) {
        return safeSend(sock, chatId, {
          text: "🎉 No pending users. All completed!",
        });
      }

      let msg = "📋 *Remaining Users*\n\n";
      pending.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]}\n`;
      });

      return safeSend(sock, chatId, {
        text: msg,
        mentions: pending.map((u) => u.userId),
      });
    }

    if (text === "/reset") {
      if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Admin only" });
      await User.updateMany({}, { fine: 0, completed: false });
      return safeSend(sock, chatId, { text: "🔄 Reset done!" });
    }

    if (text === "/resetday") {
      if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Admin only" });
      await User.updateMany({}, { completed: false });
      return safeSend(sock, chatId, { text: "🔄 Day reset!" });
    }

    // =============================
    // 🎥 VIDEO LOGIC
    // =============================
    const video =
      content?.videoMessage || content?.ephemeralMessage?.message?.videoMessage;

    if (!video) return;

    if ((video.seconds || 0) < 60) {
      return safeSend(sock, chatId, {
        text: `❌ @${user.split("@")[0]} Minimum 1 min video`,
        mentions: [user],
      });
    }

    const existing = await User.findOne({ userId: user });

    if (existing?.completed) {
      return safeSend(sock, chatId, {
        text: `⚠️ @${user.split("@")[0]} Already submitted`,
        mentions: [user],
      });
    }

    await User.findOneAndUpdate(
      { userId: user },
      { completed: true },
      { upsert: true },
    );

    await safeSend(sock, chatId, {
      text: `✅ @${user.split("@")[0]} Completed`,
      mentions: [user],
    });
  });

  // =============================
  // 🧠 DAILY QUESTION
  // =============================
  cron.schedule(
  "15 9 * * *",
  async () => {
    const count = await Question.countDocuments();
    if (!count) return;

    const randomIndex = Math.floor(Math.random() * count);
    const q = await Question.findOne().skip(randomIndex);

    if (!q) return;

    await Question.findByIdAndDelete(q._id);

    safeSend(sock, TARGET_GROUP, {
      text: `🧠 Daily Question\n\n💬 "${q.quote}"\n\n👉 ${q.question}`,
    });
  },
  { timezone: TIMEZONE },
);

  // =============================
  // 🔁 REMINDER FUNCTION
  // =============================
  const sendReminder = async (title) => {
    const users = await User.find();
    const pending = users.filter((u) => !u.completed);

    if (!pending.length) {
      return safeSend(sock, TARGET_GROUP, {
        text: "🎉 All members completed today's task!",
      });
    }

    let msg = `${title}\n\n`;
    pending.forEach((u) => {
      msg += `👉 @${u.userId.split("@")[0]}\n`;
    });

    await safeSend(sock, TARGET_GROUP, {
      text: msg,
      mentions: pending.map((u) => u.userId),
    });
  };

  // Day reminders
  cron.schedule(
    "0 9,13,17 * * *",
    () => sendReminder("⏰ Reminder: Submit video 🎥"),
    { timezone: TIMEZONE },
  );

  // Night reminders
  cron.schedule("0 21,22 * * *", () => sendReminder("🌙 Night Reminder"), {
    timezone: TIMEZONE,
  });

  // =============================
  // 📩 11 PM DM
  // =============================
  cron.schedule(
    "0 23 * * *",
    async () => {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);

      if (!pending.length) {
        return safeSend(sock, TARGET_GROUP, {
          text: "🎉 All completed! No reminders needed 😄",
        });
      }

      for (let u of pending) {
        await safeSend(sock, u.userId, {
          text: "🚨 Submit before 12 AM!",
        });
      }
    },
    { timezone: TIMEZONE },
  );

  // =============================
  // 🚨 11:50 WARNING + VOICE
  // =============================
  cron.schedule(
    "50 23 * * *",
    async () => {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);

      if (!pending.length) {
        return safeSend(sock, TARGET_GROUP, {
          text: "🎉 All completed! No fines today 😄",
        });
      }

      let msg = "🚨 LAST 10 MINUTES!\n\n";
      pending.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]}\n`;
      });

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: pending.map((u) => u.userId),
      });

      const filePath = "./temp-warning.mp3";

      try {
        await generateVoice("Last 10 minutes. Submit now!", filePath);
        const buffer = fs.readFileSync(filePath);

        await sock.sendMessage(TARGET_GROUP, {
          audio: buffer,
          mimetype: "audio/mpeg",
          ptt: true,
        });

        fs.unlinkSync(filePath);
      } catch (err) {
        console.log(err);
      }
    },
    { timezone: TIMEZONE },
  );

  // =============================
  // 📊 FINAL REPORT
  // =============================
  cron.schedule(
    "0 0 * * *",
    async () => {
      const users = await User.find();

      let msg = "📊 Report\n\n";
      users.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]} → ${u.completed ? "✅" : "❌"}\n`;
      });

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: users.map((u) => u.userId),
      });

      await User.updateMany({}, { completed: false });
    },
    { timezone: TIMEZONE },
  );

  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === "close") startBot();
  });
}

startBot();
