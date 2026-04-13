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
import statusSchema from "./models/statusSchema.js";

dotenv.config();
connectDB();

const TARGET_GROUP = process.env.TARGET_GROUP;
const TIMEZONE = "Asia/Kolkata";
const OWNER = process.env.OWNER_NUMBER;

let questionSentToday = false;
let notifiedEmpty = false;

// =============================
// ✅ SAFE SEND (RELIABLE)
// =============================
const safeSend = async (sock, jid, msg) => {
  try {
    if (!sock?.user) {
      console.log("⚠️ Socket not ready");
      return false;
    }

    await sock.sendMessage(jid, msg);
    console.log("✅ Message sent");
    return true;
  } catch (err) {
    console.log("❌ Send failed:", err);
    return false;
  }
};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  // =============================
  // 📩 MESSAGE HANDLER
  // =============================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
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

      const cmd = text.trim().toLowerCase();

      console.log("📩 MESSAGE:", cmd);

      const groupMeta = await sock.groupMetadata(TARGET_GROUP);
      const isAdmin = groupMeta.participants.find(
        (p) => p.id === user && p.admin,
      );

      // =============================
      // 🧠 COMMANDS
      // =============================

      if (cmd.startsWith("/remaining")) {
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

      if (cmd.startsWith("/fine")) {
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

      if (cmd.startsWith("/leaderboard")) {
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

      if (cmd.startsWith("/reset")) {
        if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Admin only" });

        await User.updateMany({}, { fine: 0, completed: false });

        return safeSend(sock, chatId, { text: "🔄 Reset done!" });
      }

      if (cmd.startsWith("/resetday")) {
        if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Admin only" });

        await User.updateMany({}, { completed: false });

        return safeSend(sock, chatId, { text: "🔄 Day reset!" });
      }

      // =============================
      // 🎥 VIDEO LOGIC
      // =============================
      const video =
        content?.videoMessage ||
        content?.ephemeralMessage?.message?.videoMessage;

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
    } catch (err) {
      console.log("❌ MESSAGE ERROR:", err);
    }
  });

  // =============================
  // 🧠 DAILY QUESTION (SAFE)
  // =============================

  const getStatus = async () => {
    let status = await statusSchema.findOne();

    if (!status) {
      status = await statusSchema.create({});
    }

    return status;
  };

  const sendQuestion = async () => {
    try {
      const status = await getStatus();

      // ❌ Already sent
      if (status.questionSentToday) {
        console.log("⛔ Already sent today");
        return;
      }

      console.log("🔥 Sending Question...");

      const count = await Question.countDocuments();

      // 🚨 No questions
      if (count === 0 && !status.notifiedEmpty) {
        await safeSend(sock, OWNER, {
          text: "🚨 No questions left!",
        });

        status.notifiedEmpty = true;
        await status.save();
        return;
      }

      const randomIndex = Math.floor(Math.random() * count);
      const q = await Question.findOne().skip(randomIndex);
      if (!q) return;

      const sent = await safeSend(sock, TARGET_GROUP, {
        text: `🧠 Daily Question\n\n💬 "${q.quote}"\n\n👉 ${q.question}`,
      });

      if (sent) {
        await Question.findByIdAndDelete(q._id);

        status.questionSentToday = true;
        await status.save();

        console.log("✅ Status updated in DB");
      }
    } catch (err) {
      console.log("❌ QUESTION ERROR:", err);
    }
  };

  // ⏰ MAIN TIME
  cron.schedule("20 10 * * *", sendQuestion, { timezone: TIMEZONE });

  // 🔁 RECOVERY (FULL WINDOW)
  cron.schedule("*/2 * * * *", async () => {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: TIMEZONE }),
    );

    console.log("⏰ IST Time:", now.getHours(), now.getMinutes());

    if (now.getHours() === 11 && now.getMinutes() <= 59) {
      console.log("⚡ Recovery check...");
      await sendQuestion();
    }
    console.log("Flag:", questionSentToday);
    console.log(now);
  });

  // =============================
  // 🌙 RESET
  // =============================
  cron.schedule(
    "0 0 * * *",
    async () => {
      const status = await Status.findOne();

      if (status) {
        status.questionSentToday = false;
        status.notifiedEmpty = false;
        await status.save();
      }

      console.log("🌙 Daily status reset");
    },
    { timezone: TIMEZONE },
  );

  // =============================
  // 🔄 CONNECTION
  // =============================
  sock.ev.on("connection.update", async ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });

    const que = await Question.countDocuments();
    console.log(`📊 Questions in DB: ${que}`);

    if (connection === "open") {
      console.log("✅ Bot connected");
    }

    if (connection === "close") {
      console.log("🔄 Reconnecting...");
      startBot();
    }
  });
}

startBot();
