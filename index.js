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
import Status from "./models/statusSchema.js";

dotenv.config();
connectDB();

const TARGET_GROUP = process.env.TARGET_GROUP;
const TIMEZONE = "Asia/Kolkata";
const OWNER = process.env.OWNER_NUMBER;

// =============================
// ✅ SAFE SEND
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

      const groupMeta = await sock.groupMetadata(TARGET_GROUP);
      const isAdmin = groupMeta.participants.find(
        (p) => p.id === user && p.admin,
      );

      if (cmd.startsWith("/remaining")) {
        const users = await User.find();
        const pending = users.filter((u) => !u.completed);

        if (!pending.length) {
          return safeSend(sock, chatId, {
            text: "🎉 All completed!",
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

      if (cmd.startsWith("/reset")) {
        if (!isAdmin) return;

        await User.updateMany({}, { completed: false, fine: 0 });

        return safeSend(sock, chatId, {
          text: "🔄 Reset done!",
        });
      }

      // 🎥 VIDEO
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
          text: `⚠️ Already submitted`,
        });
      }

      await User.findOneAndUpdate(
        { userId: user },
        { completed: true },
        { upsert: true },
      );

      await safeSend(sock, chatId, {
        text: `✅ Completed`,
      });
    } catch (err) {
      console.log("❌ MESSAGE ERROR:", err);
    }
  });

  // =============================
  // 🧠 STATUS
  // =============================
  const getStatus = async () => {
    let status = await Status.findOne();
    if (!status) status = await Status.create({});
    return status;
  };

  // =============================
  // 🧠 SEND QUESTION
  // =============================
  const sendQuestion = async () => {
    try {
      const status = await getStatus();

      if (status.questionSentToday) {
        console.log("⛔ Already sent today");
        return;
      }

      const count = await Question.countDocuments();

      if (count === 0 && !status.notifiedEmpty) {
        await safeSend(sock, OWNER, {
          text: "🚨 No questions left!",
        });

        status.notifiedEmpty = true;
        await status.save();
        return;
      }

      const q = await Question.aggregate([{ $sample: { size: 1 } }]);
      const question = q[0];
      if (!question) return;

      const sent = await safeSend(sock, TARGET_GROUP, {
        text: `🧠 Daily Question\n\n💬 "${question.quote}"\n\n👉 ${question.question}`,
      });

      if (sent) {
        await Question.findByIdAndDelete(question._id);

        status.questionSentToday = true;
        await status.save();

        console.log("✅ Question sent + status saved");
      }
    } catch (err) {
      console.log("❌ QUESTION ERROR:", err);
    }
  };

  // ⏰ MAIN
  cron.schedule("0 8 * * *", sendQuestion, { timezone: TIMEZONE });

  // 🔁 RECOVERY
  cron.schedule("*/2 * * * *", async () => {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: TIMEZONE }),
    );

    if (now.getHours() === 8 && now.getMinutes() <= 20) {
      console.log("⚡ Recovery...");
      await sendQuestion();
    }
  });

  // 🌙 RESET
  cron.schedule(
    "0 0 * * *",
    async () => {
      const status = await Status.findOne();
      if (status) {
        status.questionSentToday = false;
        status.notifiedEmpty = false;
        await status.save();
      }
      console.log("🌙 Reset done");
    },
    { timezone: TIMEZONE },
  );

  // 🔄 CONNECTION
  sock.ev.on("connection.update", async ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });

    const count = await Question.countDocuments();
    console.log(`📊 Questions: ${count}`);

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
