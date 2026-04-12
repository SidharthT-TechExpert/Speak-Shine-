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
const TEST_MODE = process.env.TEST_MODE === "true";
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

// =============================
// 🔥 START BOT
// =============================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
  });

  sock.ev.on("creds.update", saveCreds);

  // =============================
  // 📩 VIDEO HANDLER
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

    const video =
      content?.videoMessage ||
      content?.ephemeralMessage?.message?.videoMessage ||
      content?.viewOnceMessage?.message?.videoMessage;

    if (!video) return;

    if ((video.seconds || 0) < 60) {
      return safeSend(sock, chatId, {
        text: `❌ @${user.split("@")[0]} Video must be 1 min`,
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
  // ⏰ DAY REMINDERS
  // =============================
  cron.schedule(
    TEST_MODE ? "*/2 * * * *" : "0 9,13,17 * * *",
    async () => {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);
      if (!pending.length) return;

      let msg = "⏰ Reminder\n\nSubmit your video 🎥\n\n";
      pending.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]}\n`;
      });

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: pending.map((u) => u.userId),
      });
    },
    { timezone: TIMEZONE },
  );

  // =============================
  // 🌙 11 PM DM (PENDING ONLY)
  // =============================
  cron.schedule(
    TEST_MODE ? "*/2 * * * *" : "0 23 * * *",
    async () => {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);
      if (!pending.length) return;

      for (let u of pending) {
        await safeSend(sock, u.userId, {
          text: "🚨 Reminder\n\n⚠️ You haven't submitted your video!\n\n⏳ Submit before 12 AM",
        });
      }

      console.log("📩 11PM DM sent");
    },
    { timezone: TIMEZONE },
  );

  // =============================
  // 🚨 11:50 PM WARNING + AI VOICE
  // =============================
  cron.schedule(
    TEST_MODE ? "*/2 * * * *" : "58 21 * * *",
    async () => {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);
      if (!pending.length) return;

      let msg = "🚨 LAST 10 MINUTES!\n\n⚠️ Submit NOW or fine will apply!\n\n";

      pending.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]}\n`;
      });

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: pending.map((u) => u.userId),
      });

      // 🔊 AI VOICE
      const filePath = "./temp-warning.mp3";

      try {
        await generateVoice(
          "Last 10 minutes. Submit your video now or fine will be applied.",
          filePath,
        );

        if (!fs.existsSync(filePath)) {
          console.log("❌ Audio file not created");
          return;
        }

        await sock.sendMessage(TARGET_GROUP, {
          audio: { url: filePath }, // ✅ IMPORTANT CHANGE
          mimetype: "audio/mpeg",
          ptt: true,
        });

        fs.unlinkSync(filePath);

        console.log("🎤 Voice sent successfully");
      } catch (err) {
        console.log("❌ Voice error:", err.message);
      }
    },
    { timezone: TIMEZONE },
  );

  // =============================
  // 📊 FINAL REPORT (12 AM)
  // =============================
  cron.schedule(
    TEST_MODE ? "*/3 * * * *" : "0 0 * * *",
    async () => {
      const users = await User.find();
      const notDone = users.filter((u) => !u.completed);

      let msg = "📊 Yesterday Report\n\n";

      msg += "🏆 Leaderboard\n\n";
      users
        .sort((a, b) => b.completed - a.completed)
        .forEach((u, i) => {
          const medal = ["🥇", "🥈", "🥉"][i] || "🔹";
          msg += `${medal} @${u.userId.split("@")[0]} → ${
            u.completed ? "✅" : "❌"
          }\n`;
        });

      msg += "\n";

      if (notDone.length) {
        msg += "❌ Not Completed\n\n";
        for (let u of notDone) {
          if (!TEST_MODE) {
            u.fine += 2;
            await u.save();
          }
          msg += `👉 @${u.userId.split("@")[0]} → ₹${u.fine}\n`;
        }
        msg += "\n";
      } else {
        msg += "🎉 Everyone completed!\n\n";
      }

      msg += "💰 Total Fines\n\n";
      users.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]} → ₹${u.fine}\n`;
      });

      for (let u of users) {
        u.completed = false;
        await u.save();
      }

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: users.map((u) => u.userId),
      });
    },
    { timezone: TIMEZONE },
  );

  // =============================
  // 🧠 DAILY QUESTION (8 AM)
  // =============================
  cron.schedule(
    TEST_MODE ? "*/1 * * * *" : "0 8 * * *",
    async () => {
      const count = await Question.countDocuments();
      if (!count) return;

      const random = Math.floor(Math.random() * count);
      const q = await Question.findOne().skip(random);
      await Question.findByIdAndDelete(q._id);

      await safeSend(sock, TARGET_GROUP, {
        text: "🧠 Daily Question\n\n" + `💬 "${q.quote}"\n\n👉 ${q.question}`,
      });
    },
    { timezone: TIMEZONE },
  );

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      console.log("⚠️ Reconnecting...");

      // 🔥 clear auth if session error
      const shouldReset = lastDisconnect?.error?.output?.statusCode !== 401;

      if (!shouldReset) {
        console.log("❌ Session corrupted. Delete auth & restart.");
      }

      startBot();
    }
  });
}

startBot();
