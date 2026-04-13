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
import generateVoice from "./generateVoice.js";
import fs from "fs";

dotenv.config();
connectDB();

const TARGET_GROUP = process.env.TARGET_GROUP;
const OWNER = process.env.OWNER_NUMBER;
const TIMEZONE = "Asia/Kolkata";

// ================= SAFE SEND =================
const safeSend = async (sock, jid, msg) => {
  try {
    if (!sock?.user) return false;
    await sock.sendMessage(jid, msg);
    return true;
  } catch (err) {
    console.log("❌ Send error:", err);
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

  // ================= STATUS =================
  const getStatus = async () => {
    let s = await Status.findOne();
    if (!s) s = await Status.create({});
    return s;
  };

  // ================= DAILY QUESTION =================
  const sendQuestion = async () => {
    try {
      const status = await getStatus();
      if (status.questionSentToday) return;

      const count = await Question.countDocuments();

      // 🚨 NO QUESTIONS
      if (count === 0) {
        if (!status.notifiedEmpty) {
          await safeSend(sock, OWNER, {
            text: "🚨 No questions left!",
          });

          status.notifiedEmpty = true;
          await status.save();
        }
        return;
      }

      // ⚠️ ONLY 1 QUESTION LEFT (NEW)
      if (count === 1 && !status.notifiedLast) {
        await safeSend(sock, OWNER, {
          text: "⚠️ Only 1 question remaining in DB!",
        });

        status.notifiedLast = true;
        await status.save();
      }

      const q = await Question.aggregate([{ $sample: { size: 1 } }]);
      if (!q || !q.length) return;

      const question = q[0];

      const sent = await safeSend(sock, TARGET_GROUP, {
        text: `🧠 Daily Question\n\n💬 "${question.quote}"\n\n👉 ${question.question}`,
      });

      if (sent) {
        await Question.findByIdAndDelete(question._id);
        status.questionSentToday = true;
        await status.save();
      }
    } catch (err) {
      console.log("❌ Question error:", err);
    }
  };

  // ================= REMINDER =================
  const sendReminder = async (title) => {
    try {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);

      if (!pending.length) {
        await safeSend(sock, TARGET_GROUP, {
          text: "🎉 All completed!",
        });
        return;
      }

      let msg = `${title}\n\n`;
      pending.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]}\n`;
      });

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: pending.map((u) => u.userId),
      });
    } catch (err) {
      console.log("❌ Reminder error:", err);
    }
  };

  // ================= DM REMINDER =================
  const sendDMReminder = async () => {
    try {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);

      for (const u of pending) {
        await safeSend(sock, u.userId, {
          text: "⏰ Please submit your video today!",
        });
      }
    } catch (err) {
      console.log("❌ DM error:", err);
    }
  };

  // ================= FINAL WARNING =================
  const finalWarning = async () => {
    try {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);

      console.log(`⏰ Final Warning - Pending: ${pending.length}`);

      if (!pending.length) return;

      const filePath = "./warning.mp3";

      await generateVoice(
        "Final warning. Please submit your speaking video before deadline.",
        filePath,
      );

      if (!fs.existsSync(filePath)) {
        console.log("❌ Voice file missing");
        return;
      }

      const audioBuffer = fs.readFileSync(filePath);

      await safeSend(sock, TARGET_GROUP, {
        text: "🚨 Final Warning! Submit before deadline!",
        mentions: pending.map((u) => u.userId),
      });

      await sock.sendMessage(TARGET_GROUP, {
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        ptt: true,
      });

      fs.unlinkSync(filePath);

      console.log("🎤 Voice sent");
    } catch (err) {
      console.log("❌ Voice error:", err);
    }
  };

  // ================= DAILY REPORT =================
  const dailyReport = async () => {
    try {
      const users = await User.find();
      const completed = users.filter((u) => u.completed);
      const pending = users.filter((u) => !u.completed);

      let msg = `📊 *Daily Report*\n\n`;
      msg += `✅ Completed: ${completed.length}\n`;
      msg += `❌ Pending: ${pending.length}\n\n`;

      pending.forEach((u) => {
        msg += `👉 @${u.userId.split("@")[0]}\n`;
      });

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: pending.map((u) => u.userId),
      });

      await User.updateMany({}, { completed: false });

      const status = await Status.findOne();
      if (status) {
        status.questionSentToday = false;
        status.notifiedEmpty = false;
        await status.save();
      }
    } catch (err) {
      console.log("❌ Report error:", err);
    }
  };

  // ================= MESSAGE HANDLER =================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      if (!messages || !messages.length) return;

      const msg = messages[0];
      if (!msg || !msg.message || msg.key.fromMe) return;

      const chatId = msg.key.remoteJid;
      if (chatId !== TARGET_GROUP) return;

      const user = msg.key.participant;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      const cmd = text.trim().toLowerCase();

      const groupMeta = await sock.groupMetadata(chatId);

      const isAdmin = groupMeta.participants.some(
        (p) => p.id === user && p.admin,
      );

      // 📋 REMAINING
      if (cmd.startsWith("/remaining")) {
        return sendReminder("📋 Remaining Users");
      }

      // 💰 FINE
      if (cmd.startsWith("/fine")) {
        const users = await User.find();
        let msgText = "💰 *Fine Report*\n\n";

        users.forEach((u) => {
          msgText += `👉 @${u.userId.split("@")[0]} → ₹${u.fine || 0}\n`;
        });

        return safeSend(sock, chatId, {
          text: msgText,
          mentions: users.map((u) => u.userId),
        });
      }

      // 🏆 LEADERBOARD
      if (cmd.startsWith("/leaderboard")) {
        const users = await User.find();
        let msgText = "🏆 *Leaderboard*\n\n";

        users
          .sort((a, b) => b.completed - a.completed)
          .forEach((u, i) => {
            const medal = ["🥇", "🥈", "🥉"][i] || "🔹";
            msgText += `${medal} @${u.userId.split("@")[0]} → ${
              u.completed ? "✅" : "❌"
            }\n`;
          });

        return safeSend(sock, chatId, {
          text: msgText,
          mentions: users.map((u) => u.userId),
        });
      }

      // 🔄 RESET
      if (cmd.startsWith("/reset")) {
        if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Admin only" });

        await User.updateMany({}, { completed: false, fine: 0 });

        return safeSend(sock, chatId, { text: "🔄 Full reset done!" });
      }

      // 🔄 RESET DAY
      if (cmd.startsWith("/resetday")) {
        if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Admin only" });

        await User.updateMany({}, { completed: false });

        return safeSend(sock, chatId, {
          text: "🔄 Today's status reset!",
        });
      }

      // 🎥 VIDEO CHECK
      const video =
        msg.message?.videoMessage ||
        msg.message?.ephemeralMessage?.message?.videoMessage;

      if (!video) return;

      if ((video.seconds || 0) < 60) {
        return safeSend(sock, chatId, {
          text: "❌ Minimum 1 minute video",
        });
      }

      const existing = await User.findOne({ userId: user });

      if (existing?.completed) {
        return safeSend(sock, chatId, {
          text: "⚠️ Already submitted",
        });
      }

      await User.findOneAndUpdate(
        { userId: user },
        { completed: true },
        { upsert: true },
      );

      await safeSend(sock, chatId, {
        text: "✅ Completed",
      });
    } catch (err) {
      console.log("❌ Message error:", err);
    }
  });

  // ================= CRON =================
  cron.schedule("0 8 * * *", sendQuestion, { timezone: TIMEZONE });

  cron.schedule("0 9,13,17 * * *", () => sendReminder("⏰ Reminder"), {
    timezone: TIMEZONE,
  });

  cron.schedule("0 21,22 * * *", () => sendReminder("🌙 Night Reminder"), {
    timezone: TIMEZONE,
  });

  cron.schedule("0 23 * * *", sendDMReminder, { timezone: TIMEZONE });

  cron.schedule("42 16 * * *", finalWarning, { timezone: TIMEZONE });

  cron.schedule("0 0 * * *", dailyReport, { timezone: TIMEZONE });

  cron.schedule(
    "0 13,18,20 * * *",
    async () => {
      const count = await Question.countDocuments();

      if (count === 1) {
        await safeSend(sock, OWNER, {
          text: "⚠️ Reminder: Only 1 question left in DB!",
        });
      }
    },
    { timezone: TIMEZONE },
  );

  // ================= CONNECTION =================
  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "open") console.log("✅ Connected");
    if (connection === "close") startBot();
  });
}

startBot();
