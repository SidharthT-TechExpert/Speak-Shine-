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
import generatePoster from "./poster.js";
import fs from "fs";
import { exec } from "child_process";

dotenv.config();
connectDB();

const TARGET_GROUP = process.env.TARGET_GROUP;
const OWNER = process.env.OWNER_NUMBER;
const TIMEZONE = "Asia/Kolkata";

const convertToOgg = (input, output) => {
  return new Promise((resolve, reject) => {
    exec(`ffmpeg -i ${input} -c:a libopus -b:a 128k ${output}`, (err) => {
      if (err) {
        console.log("❌ FFmpeg error:", err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// ================= HELPERS =================
const getName = (userId) => {
  if (!userId || !userId.includes("@")) return "invalid";
  return userId.split("@")[0];
};

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

    // 🔥 IMPORTANT FIXES
    syncFullHistory: false,
    markOnlineOnConnect: true,
    defaultQueryTimeoutMs: undefined,
    retryRequestDelayMs: 500,
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

      if (status.questionSentToday) {
        console.log("🚫 Blocked: already sent today");
        return;
      }

      const count = await Question.countDocuments();

      // 🚨 No Questions
      if (count === 0) {
        if (!status.notifiedEmpty) {
          await safeSend(sock, OWNER, {
            text: `🚨 *Alert: Question Bank Empty!*\n\n━━━━━━━━━━━━━━━\n📭 No questions remaining in the database.\n\n🛠️ Please add new questions.`,
          });

          status.notifiedEmpty = true;
          await status.save();
        }
        return;
      }

      // ⚠️ Last Question Warning
      if (count === 1 && !status.notifiedLast) {
        await safeSend(sock, OWNER, {
          text: `⚠️ *Low Stock Warning!*\n\n━━━━━━━━━━━━━━━\n📦 Only *1 question* left in database.\n\n🛠️ Add more soon.`,
        });

        status.notifiedLast = true;
        await status.save();
      }

      // 🎯 Random Question
      const q = await Question.aggregate([{ $sample: { size: 1 } }]);

      if (!q || !q.length) return;

      const question = q[0];

      // 🖼 Generate Poster
      await generatePoster(question);

      // 📤 Send Image Poster
      const sent = await safeSend(sock, TARGET_GROUP, {
        image: { url: "./daily.png" },
        caption:
          `╔══════════════════╗\n` +
          `🔥 *TODAY'S CHALLENGE* 🔥\n` +
          `╚══════════════════╝\n\n` +
          `🎤 Record your answer and send a *1-min+ speaking video!*`,
      });

      // ✅ Success
      if (sent) {
        await Question.findByIdAndDelete(question._id);

        status.questionSentToday = true;
        await status.save();

        console.log("✅ Poster question sent");
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
          text: `🎉 *All Done for Today!*\n\n━━━━━━━━━━━━━━━\n✅ Every member has submitted their video.\n\n🙌 _Amazing effort from the whole team!_ 💪`,
        });
        return;
      }

      let msg = `${title}\n━━━━━━━━━━━━━━━\n\n`;
      msg += `📌 *${pending.length} member(s) yet to submit:*\n\n`;
      pending.forEach((u) => {
        msg += `▪️ @${getName(u.userId)}\n`;
      });
      msg += `\n📹 _Send your 1-min+ speaking video now!_`;

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
          text: `⏰ *Hey! Don't forget today's task.*\n\n━━━━━━━━━━━━━━━\n📹 You haven't submitted your speaking video yet.\n\n🕐 _Time is running out — send it before midnight!_ 💪`,
        });
      }
    } catch (err) {
      console.log("❌ DM error:", err);
    }
  };

  // ================= GOOD MORNING =================
  const sendGoodMorning = async () => {
    try {
      await safeSend(sock, TARGET_GROUP, {
        text: `🌅 *Good Morning Team!*\n\n━━━━━━━━━━━━━━━\n💪 _New day, new chance to improve!_\n\n🎯 Don't forget today's speaking challenge.\n\n🔥 _Stay consistent. Stay focused._`,
      });
    } catch (err) {
      console.log("❌ Good morning error:", err);
    }
  };

  // ================= FINAL WARNING =================
  const finalWarning = async () => {
    try {
      const users = await User.find();
      const pending = users.filter((u) => !u.completed);

      console.log(`⏰ Final Warning - Pending: ${pending.length}`);

      if (!pending.length) return;

      const id = Date.now();
      const mp3 = `./warning-${id}.mp3`;
      const ogg = `./warning-${id}.ogg`;

      // 🎤 Generate MP3 (ONLY ONCE ✅)
      await generateVoice(
        "Final warning. Please submit your speaking video before deadline.",
        mp3,
      );

      // ✅ Check file exists
      if (!fs.existsSync(mp3)) {
        console.log("❌ MP3 file missing");
        return;
      }

      // 🎧 Convert MP3 → OGG
      await convertToOgg(mp3, ogg);

      // ✅ Check OGG exists
      if (!fs.existsSync(ogg)) {
        console.log("❌ OGG file missing");
        return;
      }

      // 📖 Read OGG
      const audioBuffer = fs.readFileSync(ogg);

      // 📤 Send text + voice
      await safeSend(sock, TARGET_GROUP, {
        text: `🚨 *FINAL WARNING!*\n\n━━━━━━━━━━━━━━━\n⏳ Deadline is almost here!\n\n${pending.map((u) => `▪️ @${getName(u.userId)}`).join("\n")}\n\n📹 _Submit your speaking video RIGHT NOW or a fine will be applied!_ 💸`,
        mentions: pending.map((u) => u.userId),
      });

      await sock.sendMessage(TARGET_GROUP, {
        audio: audioBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
      });

      // 🗑 Clean files
      fs.unlinkSync(mp3);
      fs.unlinkSync(ogg);

      console.log("🎤 Voice sent");
    } catch (err) {
      console.log("❌ Voice error:", err);
    }
  };

  // ================= DAILY REPORT =================
  const dailyReport = async () => {
    try {
      const groupMeta = await sock.groupMetadata(TARGET_GROUP);
      const groupUsers = groupMeta.participants.map((p) => p.id);

      const users = await User.find({
        userId: { $in: groupUsers },
      });

      const completed = users.filter((u) => u.completed);
      const pending = users.filter((u) => !u.completed);
      const status = await Status.findOne();

      // Apply ₹2 fine to pending users
      if (pending.length && !status.fineAppliedToday) {
        await User.updateMany(
          { userId: { $in: pending.map((u) => u.userId) } },
          { $inc: { fine: 2 } },
        );

        status.fineAppliedToday = true;
        await status.save();
      }

      let msg = `╔══════════════════╗\n📊  *DAILY REPORT*\n╚══════════════════╝\n\n`;
      msg += `✅ *Submitted:* ${completed.length}\n`;
      msg += `❌ *Missed:* ${pending.length}\n`;
      msg += `━━━━━━━━━━━━━━━\n`;

      if (completed.length) {
        msg += `\n🏅 *Today's Submissions:*\n`;
        completed.forEach((u) => {
          msg += `✅ @${getName(u.userId)}\n`;
        });
      }

      if (pending.length) {
        msg += `\n⚠️ *Missed & Fined ₹2:*\n`;
        pending.forEach((u) => {
          msg += `❌ @${getName(u.userId)} _(Total fine: ₹${(u.fine || 0) + 2})_\n`;
        });
      }

      if (!pending.length) {
        msg += `\n🎉 _Everyone submitted today — great work!_ 🙌\n`;
      }

      const allMentions = users.map((u) => u.userId).filter(Boolean);

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: allMentions,
      });

      // Reset daily status
      await User.updateMany({}, { completed: false });

      if (status) {
        status.questionSentToday = false;
        status.notifiedEmpty = false;
        status.fineAppliedToday = false; // ✅ ADD THIS
        await status.save();
      }
    } catch (err) {
      console.log("❌ Report error:", err);
    }
  };

  // ================= MESSAGE HANDLER =================
  const processedMsgIds = new Set();

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (type !== "notify") return;
      if (!messages || !messages.length) return;

      const msg = messages[0];
      if (!msg || !msg.message || msg.key.fromMe) return;

      const msgId = msg.key.id;
      if (processedMsgIds.has(msgId)) return;
      processedMsgIds.add(msgId);
      setTimeout(() => processedMsgIds.delete(msgId), 60000);

      const chatId = msg.key.remoteJid;
      if (chatId !== TARGET_GROUP) return;

      const user = msg.key.participant;
      if (!user) return;

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
        return sendReminder(
          `⏰ *Reminder*\n\n🗣️ _Don't forget to submit your speaking video today!_`,
        );
      }

      // 💰 FINE
      if (cmd.startsWith("/fine")) {
        const users = await User.find();
        let msgText = `╔══════════════════╗\n💰  *FINE REPORT*\n╚══════════════════╝\n\n`;
        users.forEach((u) => {
          msgText += `▪️ @${getName(u.userId)} → ₹${u.fine || 0}\n`;
        });
        msgText += `\n━━━━━━━━━━━━━━━\n💡 _Fines are applied for missed submissions._`;

        return safeSend(sock, chatId, {
          text: msgText,
          mentions: users.map((u) => u.userId),
        });
      }

      // 🏆 LEADERBOARD
      if (cmd.startsWith("/leaderboard")) {
        const users = await User.find();
        let msgText = `╔══════════════════╗\n🏆  *LEADERBOARD*\n╚══════════════════╝\n\n`;

        users
          .filter((u) => u.userId)
          .sort((a, b) => b.completed - a.completed)
          .forEach((u, i) => {
            const medal = ["🥇", "🥈", "🥉"][i] || "🔹";
            msgText += `${medal} @${getName(u.userId)} → ${u.completed ? "✅ Done" : "❌ Pending"}\n`;
          });
        msgText += `\n━━━━━━━━━━━━━━━\n🔥 _Keep grinding — consistency wins!_`;

        return safeSend(sock, chatId, {
          text: msgText,
          mentions: users.map((u) => u.userId),
        });
      }

      // 🔄 RESET
      if (cmd.startsWith("/reset")) {
        if (!isAdmin)
          return safeSend(sock, chatId, {
            text: `❌ *Access Denied*\n_Only admins can use this command._`,
          });

        await User.updateMany({}, { completed: false, fine: 0 });

        return safeSend(sock, chatId, {
          text: `🔄 *Full Reset Done!*\n\n━━━━━━━━━━━━━━━\n✅ All statuses and fines have been cleared.`,
        });
      }

      if (cmd.startsWith("/addfine")) {
        if (!isAdmin) {
          return safeSend(sock, chatId, {
            text: "❌ Only admins can use this command",
          });
        }

        const mentioned =
          msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

        const parts = text.trim().split(" ");

        let targetUser;
        let amount = 2;

        // If mention exists
        if (mentioned.length > 0) {
          targetUser = mentioned[0];
          amount = parseInt(parts[2]) || 2;
        }
        // No mention = self
        else {
          targetUser = user;
          amount = parseInt(parts[1]) || 2;
        }

        await User.findOneAndUpdate(
          { userId: targetUser },
          { $inc: { fine: amount } },
          { upsert: true },
        );

        return safeSend(sock, chatId, {
          text: `💸 ₹${amount} fine added to @${targetUser.split("@")[0]}`,
          mentions: [targetUser],
        });
      }

      // 💸 REMOVE FINE
      if (cmd.startsWith("/removefine")) {
        if (!isAdmin) {
          return safeSend(sock, chatId, {
            text: "❌ Only admins can use this command",
          });
        }

        const mentioned =
          msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

        const parts = text.trim().split(" ");

        let targetUser;
        let amount = 2;

        // If mention exists → remove from mentioned user
        if (mentioned.length > 0) {
          targetUser = mentioned[0];
          amount = parseInt(parts[2]) || 2;
        }
        // No mention = self
        else {
          targetUser = user;
          amount = parseInt(parts[1]) || 2;
        }

        const existingUser = await User.findOne({ userId: targetUser });

        if (!existingUser) {
          return safeSend(sock, chatId, {
            text: "❌ User not found",
          });
        }

        const currentFine = existingUser.fine || 0;
        const newFine = Math.max(0, currentFine - amount);

        await User.updateOne(
          { userId: targetUser },
          { fine: newFine }
        );

        return safeSend(sock, chatId, {
          text: `💰 ₹${amount} fine removed from @${targetUser.split("@")[0]}\nRemaining Fine: ₹${newFine}`,
          mentions: [targetUser],
        });
      }

      if (cmd === "/cleanusers") {
        if (!isAdmin) return;

        await User.deleteMany({
          $or: [
            { userId: null },
            { userId: "" },
            { userId: { $exists: false } },
          ],
        });

        return safeSend(sock, chatId, {
          text: "🧹 Invalid users cleaned!",
        });
      }

      // 🔄 RESET DAY
      if (cmd.startsWith("/resetday")) {
        if (!isAdmin)
          return safeSend(sock, chatId, {
            text: `❌ *Access Denied*\n_Only admins can use this command._`,
          });

        await User.updateMany({}, { completed: false });

        return safeSend(sock, chatId, {
          text: `🔄 *Today's Status Reset!*\n\n━━━━━━━━━━━━━━━\n✅ All members marked as pending for today.`,
        });
      }

      // 🎥 VIDEO CHECK
      const video =
        msg.message?.videoMessage ||
        msg.message?.ephemeralMessage?.message?.videoMessage;

      if (!video) return;

      if ((video.seconds || 0) < 60) {
        return safeSend(sock, chatId, {
          text: `❌ *Video Too Short!*\n\n━━━━━━━━━━━━━━━\n⏱️ Minimum duration is *1 minute*.\n\n🔁 _Please re-record and send again._`,
        });
      }

      const existing = await User.findOne({ userId: user });

      if (existing?.completed) {
        return safeSend(sock, chatId, {
          text: `⚠️ *Already Submitted!*\n\n━━━━━━━━━━━━━━━\n✅ You've already sent your video for today.\n\n😎 _Sit back and relax — see you tomorrow!_`,
        });
      }

      await User.findOneAndUpdate(
        { userId: user },
        { completed: true },
        { upsert: true },
      );

      const username = user.split("@")[0];
      await safeSend(sock, chatId, {
        text: `🔥 *Great work, @${username}!*\n\n✅ Submission received!\n\n💪 _Keep showing up every day — consistency is what separates the best from the rest. You're on the right track!_ 🚀`,
        mentions: [user],
      });
    } catch (err) {
      console.log("❌ Message error:", err);
    }
  });

  // ================= CRON =================
  cron.schedule("30 7 * * *", sendGoodMorning, { timezone: TIMEZONE });

  cron.schedule("0 8 * * *", sendQuestion, { timezone: TIMEZONE });

  cron.schedule(
    "*/2 8 * * *",
    async () => {
      const now = new Date();
      const minutes = now.getMinutes();

      if (minutes > 20) return; // stop after 8:20

      console.log(`📢 Sending question at 9:${minutes}`);

      await sendQuestion();
    },
    { timezone: TIMEZONE },
  );

  cron.schedule(
    "0 15 * * *",
    () =>
      sendReminder(
        `⏰ *Reminder*\n\n🗣️ _Don't forget to submit your speaking video today!_`,
      ),
    {
      timezone: TIMEZONE,
    },
  );

  cron.schedule(
    "0 21 * * *",
    () =>
      sendReminder(
        `🌙 *Night Reminder*\n\n😴 _It's getting late — submit your video before midnight!_`,
      ),
    {
      timezone: TIMEZONE,
    },
  );

  cron.schedule("30 22 * * *", sendDMReminder, { timezone: TIMEZONE });

  cron.schedule("30 23 * * *", finalWarning, { timezone: TIMEZONE });

  cron.schedule("0 0 * * *", dailyReport, { timezone: TIMEZONE });

  cron.schedule(
    "0 10,13,18,20 * * *",
    async () => {
      const count = await Question.countDocuments();

      if (count === 1) {
        await safeSend(sock, OWNER, {
          text: `⚠️ *Low Stock Warning!*\n\n━━━━━━━━━━━━━━━\n📦 Only *1 question* left in the database.\n\n🛠️ _Add more questions soon to avoid interruption._`,
        });
      }
      if (count === 0) {
        await safeSend(sock, OWNER, {
          text: `🚨 *Alert: Question Bank Empty!*\n\n━━━━━━━━━━━━━━━\n📭 No questions remaining in the database.\n\n🛠️ _Please add new questions to keep the daily challenge going._`,
        });
      }
    },
    { timezone: TIMEZONE },
  );

  // ================= CONNECTION =================
  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "open") {
      console.log("✅ Connected");
    }

    if (connection === "close") {
      console.log("⚠️ Reconnecting...");
      setTimeout(startBot, 3000);
    }
  });
}

startBot();
