import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import cron from "node-cron";
import dotenv from "dotenv";
import { connectDB, safeDB } from "./db.js";
import User from "./models/userSchema.js";
import Question from "./models/questionSchema.js";
import Status from "./models/statusSchema.js";
import GrammarSettings from "./models/grammarSettingsSchema.js";
import UserStats from "./models/userStatsSchema.js";
import generateVoice from "./generateVoice.js";
import generatePoster from "./poster.js";
import { resetStatus } from "./resetStatus.js";
import { generateFeedback } from "./ai/feedback.js";
import { processMessage, formatResponse } from "./grammar/processor.js";
import { isOnCooldown, setCooldown, getRemainingCooldown } from "./grammar/cooldown.js";
import fs from "fs";
import { exec } from "child_process";

dotenv.config();
connectDB();

const TARGET_GROUP = process.env.TARGET_GROUP;
const OWNER = process.env.OWNER_NUMBER;
const TIMEZONE = "Asia/Kolkata";
const FINE_AMOUNT = Number(process.env.FINE_AMOUNT) || 2;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;

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

// Returns saved name from DB record, falls back to phone number
const getDisplayName = (userRecord) => {
  if (!userRecord) return "Unknown";
  return userRecord.name || getName(userRecord.userId);
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
    syncFullHistory: false,
    markOnlineOnConnect: false,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 1000,
    logger: { level: "silent", log: () => {}, info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {}, child: () => ({ level: "silent", log: () => {}, info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {}, child: () => ({}) }) },
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("group-participants.update", async (data) => {
    try {
      if (data.id !== TARGET_GROUP) return;

      // ================= NEW USER ADDED =================
      if (data.action === "add") {
        for (const id of data.participants) {
          // Always store as @s.whatsapp.net — never @lid
          const normalizedId = id.includes("@lid")
            ? id.replace("@lid", "@s.whatsapp.net")
            : id;

          // Try to get push name from group metadata
          let pushName = null;
          try {
            const meta = await sock.groupMetadata(TARGET_GROUP);
            const participant = meta.participants.find(p =>
              p.id === normalizedId || p.id === id
            );
            pushName = participant?.notify || participant?.name || null;
          } catch (_) {}

          await User.updateOne(
            { userId: normalizedId },
            {
              $setOnInsert: { userId: normalizedId, completed: false, fine: 0 },
              ...(pushName ? { $set: { name: pushName } } : {}),
            },
            { upsert: true }
          );

          // Welcome Message
          await safeSend(sock, TARGET_GROUP, {
            text:
              `🎉 *New Member Added!*\n\n` +
              `Welcome to the group @${getName(id)} 👋\n\n` +
              `🔥 Stay active, complete daily speaking challenges, and keep improving every day!`,
            mentions: [id],
          });

          console.log(`✅ New member added: ${id}`);
        }
      }

      // ================= USER REMOVED =================
      if (data.action === "remove") {
        for (const id of data.participants) {
          await User.deleteOne({ userId: id });

          // Removed Message
          await safeSend(sock, TARGET_GROUP, {
            text:
              `⚠️ *Member Removed*\n\n` +
              `@${getName(id)} has left or was removed from the group.`,
            mentions: [id],
          });

          console.log(`❌ Member removed: ${id}`);
        }
      }
    } catch (error) {
      console.log("Participant update error:", error);
    }
  });

  // ================= STATUS =================
  const getStatus = async () => {
    let s = await safeDB(() => Status.findOne());
    if (!s) s = await safeDB(() => Status.create({}));
    return s;
  };

  // ================= DAILY QUESTION =================
  const sendQuestion = async () => {
    try {
      const status = await safeDB(() => getStatus());

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
      });

      // ✅ Success
      if (sent) {
        await Question.findByIdAndDelete(question._id);

        status.questionSentToday = true;
        // Save today's topic so AI feedback can check relevance
        status.todayTopic = question.topic || null;
        status.todayQuestion = question.question || null;
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
      const users = await safeDB(() => User.find());
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
      const users = await safeDB(() => User.find());
      const pending = users.filter((u) => !u.completed);

      console.log(`📱 DM Reminder: ${pending.length} pending users at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);

      if (pending.length === 0) {
        console.log("✅ No DMs sent - all users completed");
        return;
      }

      for (const u of pending) {
        await safeSend(sock, u.userId, {
          text: `⏰ *Hey! Don't forget today's task.*\n\n━━━━━━━━━━━━━━━\n📹 You haven't submitted your speaking video yet.\n\n🕐 _Time is running out — send it before midnight!_ 💪`,
        });
        console.log(`📱 DM sent to ${u.name || getName(u.userId)}`);
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
      const users = await safeDB(() => User.find());
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
      let status = await safeDB(() => Status.findOne());
      if (!status) status = await safeDB(() => Status.create({}));

      const users = await safeDB(() => User.find({
        userId: { $ne: null, $exists: true, $ne: "" }
      }));

      const completed = users.filter((u) => u.completed);
      const pending = users.filter((u) => !u.completed);

      console.log(`📊 Report: ${completed.length} submitted, ${pending.length} pending`);

      let totalTodayFine = 0;

      // Apply fine to pending users (only once per day)
      if (pending.length && !status.fineAppliedToday) {
        await User.updateMany(
          { userId: { $in: pending.map((u) => u.userId) } },
          { $inc: { fine: FINE_AMOUNT } }
        );

        pending.forEach((u) => {
          u.fine = (u.fine || 0) + FINE_AMOUNT;
          totalTodayFine += FINE_AMOUNT;
        });

        status.fineAppliedToday = true;
        await status.save();
      }

      let msg = `╔══════════════════╗
📊 *DAILY REPORT*
╚══════════════════╝

✅ *Submitted:* ${completed.length}
❌ *Missed:* ${pending.length}
💸 *Today's Fine Collected:* ₹${totalTodayFine}
━━━━━━━━━━━━━━━`;

      if (completed.length) {
        msg += `\n\n🏅 *Today's Submissions:*\n`;
        completed.forEach((u) => {
          msg += `✅ @${getName(u.userId)}\n`;
        });
      }

      if (pending.length) {
        msg += `\n⚠️ *Missed & Fined ₹${FINE_AMOUNT}:*\n`;
        pending.forEach((u) => {
          msg += `❌ @${getName(u.userId)} _(Total fine: ₹${u.fine})_\n`;
        });
      }

      if (!pending.length) {
        msg += `\n\n🎉 _Everyone submitted today — great work!_ 🙌`;
      }

      msg += `\n━━━━━━━━━━━━━━━
🔥 _Consistency builds champions._`;

      const allMentions = users.map((u) => u.userId).filter(Boolean);

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: allMentions,
      });

      // Reset all users for next day
      await User.updateMany({}, { completed: false });

      // Reset daily flags
      await resetStatus();

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
      if (!msg || !msg.message) return;

      const chatId = msg.key.remoteJid;

      // Helper: check if a documentMessage is a video file
      const docMsg = msg.message?.documentMessage;
      const docIsVideo = docMsg && (
        docMsg.mimetype?.startsWith("video/") ||
        docMsg.fileName?.match(/\.(mp4|mov|mkv|avi|3gp|webm)$/i)
      );

      // Extract video from all possible message types including view-once and document
      const dmVideo =
        msg.message?.videoMessage ||
        msg.message?.ephemeralMessage?.message?.videoMessage ||
        msg.message?.viewOnceMessage?.message?.videoMessage ||
        msg.message?.viewOnceMessageV2?.message?.videoMessage ||
        msg.message?.viewOnceMessageV2Extension?.message?.videoMessage ||
        (docIsVideo ? docMsg : null);

      // Get message text early
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      // Match owner by phone number since WhatsApp may use @lid format
      const ownerNumber = OWNER.replace("@s.whatsapp.net", "").replace("@lid", "");
      const isOwnerDM = chatId === OWNER ||
        chatId.includes(ownerNumber) ||
        (msg.key.fromMe && dmVideo && !chatId.includes("@g.us"));

      // Block fromMe except owner DM videos
      if (msg.key.fromMe && !(isOwnerDM && dmVideo)) return;

      const msgId = msg.key.id;
      if (processedMsgIds.has(msgId)) return;
      processedMsgIds.add(msgId);
      setTimeout(() => processedMsgIds.delete(msgId), 60000);
      if (isOwnerDM && dmVideo) {
        const ownerStatus = await getStatus();
        generateFeedback(msg, OWNER, dmVideo.seconds || 60, ownerStatus?.todayTopic || null, ownerStatus?.todayQuestion || null, sock)
          .then((feedbackText) => {
            safeSend(sock, OWNER, { text: feedbackText });
          })
          .catch((err) => {
            console.log("❌ Owner test feedback error:", err.message);
            safeSend(sock, OWNER, { text: `❌ Feedback failed: ${err.message}` });
          });
        return;
      }

      if (chatId !== TARGET_GROUP) return;

      const user = msg.key.participant || msg.key.remoteJid;
      if (!user) return;

      // Normalize userId - always use @s.whatsapp.net format
      const normalizeUserId = (id) => {
        if (!id) return id;
        // Convert @lid to @s.whatsapp.net by stripping the lid suffix
        if (id.includes("@lid")) {
          return id.replace("@lid", "@s.whatsapp.net");
        }
        return id;
      };

      const normalizedUser = normalizeUserId(user);

      const cmd = text.trim().toLowerCase();

      const groupMeta = await sock.groupMetadata(chatId);

      const isAdmin = groupMeta.participants.some(
        (p) => (p.id === normalizedUser || p.id === user) && p.admin,
      );

      // Use normalizedUser for all DB operations
      const dbUser = normalizedUser;

      // Save push name whenever we see a message — most reliable way to capture names
      const pushName = msg.pushName || null;
      if (pushName) {
        await User.updateOne(
          { userId: dbUser },
          { $set: { name: pushName } },
          { upsert: false } // only update existing records, don't create
        );
      }

      // 📋 REMAINING
      if (cmd.startsWith("/remaining")) {
        return sendReminder(
          `⏰ *Remaining*\n\n🗣️ _Don't forget to submit your speaking video today!_`,
        );
      }

      // 💰 FINE
      if (cmd.startsWith("/fine")) {
        const users = await User.find();

        // Normalize userId to phone number for dedup comparison
        const getPhone = (id) => id ? id.replace(/@s\.whatsapp\.net|@lid|@c\.us/g, "").split(":")[0] : null;

        // Merge duplicate userIds (same phone, different JID format) — sum fines, prefer @s.whatsapp.net
        const merged = new Map();
        for (const u of users) {
          const phone = getPhone(u.userId);
          if (!phone) continue;
          if (merged.has(phone)) {
            const existing = merged.get(phone);
            existing.fine = (existing.fine || 0) + (u.fine || 0);
            if (u.userId?.includes("@s.whatsapp.net")) existing.userId = u.userId;
            if (u.name) existing.name = u.name;
          } else {
            merged.set(phone, { userId: u.userId, name: u.name || null, fine: u.fine || 0 });
          }
        }
        const uniqueUsers = [...merged.values()];

        let totalFine = 0;
        let msgText = `╔══════════════════╗\n💰 *FINE REPORT*\n╚══════════════════╝\n\n📋 *Individual Fines:*\n━━━━━━━━━━━━━━━\n`;

        uniqueUsers.forEach((u) => {
          const fine = u.fine || 0;
          totalFine += fine;
          const display = u.name || getName(u.userId);
          msgText += `▪️ ${display} → ₹${fine}\n`;
        });

        msgText += `\n━━━━━━━━━━━━━━━\n💵 *Total Fine Pool:* ₹${totalFine}\n\n⚠️ _Missed daily submissions result in fines._\n🔥 _Stay consistent. Avoid penalties._\n`;

        return safeSend(sock, chatId, {
          text: msgText,
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

      // 🔄 RESET (FULL RESET)
      if (cmd.startsWith("/reset") && !cmd.startsWith("/resetday") && !cmd.startsWith("/resetstatus") && !cmd.startsWith("/resetfine")) {
        if (!isAdmin)
          return safeSend(sock, chatId, {
            text: `❌ *Access Denied*\n_Only admins can use this command._`,
          });

        await User.updateMany({}, { completed: false, fine: 0 });

        return safeSend(sock, chatId, {
          text: `🔄 *Full Reset Done!*\n\n━━━━━━━━━━━━━━━\n✅ All statuses reset to pending\n✅ All fines cleared to ₹0\n\n💡 _Use /resetday or /resetfine for partial resets._`,
        });
      }

      if (cmd.startsWith("/addfine")) {
        if (!isAdmin) {
          return safeSend(sock, chatId, {
            text: "❌ Only admins can use this command",
          });
        }

        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const parts = text.trim().split(/\s+/);
        const userAmounts = [];
        
        if (mentioned.length === 0) {
          // No mentions - apply to self
          const lastPart = parts[parts.length - 1];
          const amount = !isNaN(lastPart) && lastPart !== "" ? parseInt(lastPart) : FINE_AMOUNT;
          userAmounts.push({ userId: user, amount });
        } else {
          // Check if last part is a number (applies to all without individual amounts)
          const lastPart = parts[parts.length - 1];
          const defaultAmount = !isNaN(lastPart) && lastPart !== "" ? parseInt(lastPart) : FINE_AMOUNT;
          
          // Parse mentions and individual amounts
          let mentionIndex = 0;
          
          for (let i = 1; i < parts.length && mentionIndex < mentioned.length; i++) {
            const part = parts[i];
            
            // If part starts with @, it's a mention
            if (part.startsWith("@")) {
              const userId = mentioned[mentionIndex];
              
              // Check if next part is a number (and not the last part which is default)
              let amount = defaultAmount;
              if (i + 1 < parts.length - 1 && !isNaN(parts[i + 1]) && parts[i + 1] !== "") {
                amount = parseInt(parts[i + 1]);
                i++; // Skip the number
              }
              
              userAmounts.push({ userId, amount });
              mentionIndex++;
            }
          }
          
          // If we didn't parse all mentions, add remaining with default amount
          while (mentionIndex < mentioned.length) {
            userAmounts.push({ userId: mentioned[mentionIndex], amount: defaultAmount });
            mentionIndex++;
          }
        }

        // Apply fines
        const results = [];
        for (const { userId, amount } of userAmounts) {
          await User.updateOne(
            { userId },
            { $inc: { fine: amount } },
            { upsert: true }
          );
          results.push(`@${getName(userId)} → +₹${amount}`);
        }

        return safeSend(sock, chatId, {
          text: `💸 *Fine Added!*\n\n━━━━━━━━━━━━━━━\n${results.join("\n")}\n\n✅ Fines updated successfully.`,
          mentions: userAmounts.map(ua => ua.userId),
        });
      }

      // 💸 REMOVE FINE
      if (cmd.startsWith("/removefine")) {
        if (!isAdmin) {
          return safeSend(sock, chatId, {
            text: "❌ Only admins can use this command",
          });
        }

        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const parts = text.trim().split(/\s+/);
        const userAmounts = [];
        
        if (mentioned.length === 0) {
          // No mentions - apply to self
          const lastPart = parts[parts.length - 1];
          const amount = !isNaN(lastPart) && lastPart !== "" ? parseInt(lastPart) : FINE_AMOUNT;
          userAmounts.push({ userId: user, amount });
        } else {
          // Check if last part is a number (applies to all without individual amounts)
          const lastPart = parts[parts.length - 1];
          const defaultAmount = !isNaN(lastPart) && lastPart !== "" ? parseInt(lastPart) : FINE_AMOUNT;
          
          // Parse mentions and individual amounts
          let mentionIndex = 0;
          
          for (let i = 1; i < parts.length && mentionIndex < mentioned.length; i++) {
            const part = parts[i];
            
            // If part starts with @, it's a mention
            if (part.startsWith("@")) {
              const userId = mentioned[mentionIndex];
              
              // Check if next part is a number (and not the last part which is default)
              let amount = defaultAmount;
              if (i + 1 < parts.length - 1 && !isNaN(parts[i + 1]) && parts[i + 1] !== "") {
                amount = parseInt(parts[i + 1]);
                i++; // Skip the number
              }
              
              userAmounts.push({ userId, amount });
              mentionIndex++;
            }
          }
          
          // If we didn't parse all mentions, add remaining with default amount
          while (mentionIndex < mentioned.length) {
            userAmounts.push({ userId: mentioned[mentionIndex], amount: defaultAmount });
            mentionIndex++;
          }
        }

        // Remove fines
        const results = [];
        for (const { userId, amount } of userAmounts) {
          const u = await User.findOne({ userId });
          if (!u) continue;
          const newFine = Math.max(0, (u.fine || 0) - amount);
          await User.updateOne({ userId }, { fine: newFine });
          results.push(`@${getName(userId)} → -₹${amount} (₹${newFine} remaining)`);
        }

        if (!results.length) {
          return safeSend(sock, chatId, { text: `❌ No users found.` });
        }

        return safeSend(sock, chatId, {
          text: `💰 *Fine Removed!*\n\n━━━━━━━━━━━━━━━\n${results.join("\n")}\n\n✅ Fines updated successfully.`,
          mentions: userAmounts.map(ua => ua.userId),
        });
      }

      if (cmd === "/cleanusers") {
        if (!isAdmin) {
          return safeSend(sock, chatId, {
            text: "❌ Only admins can use this command",
          });
        }

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

      // 🧪 TEST REPORT (Admin only - triggers daily report immediately)
      if (cmd === "/testreport") {
        if (!isAdmin) return safeSend(sock, chatId, { text: `❌ *Access Denied*\n_Only admins can use this command._` });

        await safeSend(sock, chatId, { text: `🧪 _Running test report... (fines will NOT be applied in test mode)_` });
        
        const users = await User.find({ userId: { $ne: null, $exists: true } });
        const completed = users.filter((u) => u.completed);
        const pending = users.filter((u) => !u.completed);

        let msg = `╔══════════════════╗\n📊 *TEST REPORT*\n╚══════════════════╝\n\n`;
        msg += `✅ *Submitted:* ${completed.length}\n`;
        msg += `❌ *Missed:* ${pending.length}\n`;
        msg += `💸 *Fine would be:* ₹${pending.length * FINE_AMOUNT}\n`;
        msg += `━━━━━━━━━━━━━━━`;

        if (completed.length) {
          msg += `\n\n🏅 *Submitted:*\n`;
          completed.forEach((u) => { msg += `✅ @${getName(u.userId)}\n`; });
        }

        if (pending.length) {
          msg += `\n\n⚠️ *Would be fined ₹${FINE_AMOUNT}:*\n`;
          pending.forEach((u) => { msg += `❌ @${getName(u.userId)} _(Current fine: ₹${u.fine || 0})_\n`; });
        }

        msg += `\n━━━━━━━━━━━━━━━\n⚠️ _This is a TEST — no fines applied, no status reset._`;

        return safeSend(sock, chatId, {
          text: msg,
          mentions: users.map((u) => u.userId).filter(Boolean),
        });
      }

      // 🔄 RESET STATUS
      if (cmd.startsWith("/resetstatus")) {
        if (!isAdmin) return safeSend(sock, chatId, { text: `❌ *Access Denied*\n_Only admins can use this command._` });

        await resetStatus();

        return safeSend(sock, chatId, {
          text: `🔄 *Status Reset Done!*\n\n━━━━━━━━━━━━━━━\n✅ All daily flags have been cleared.`,
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
          text: `🔄 *Today's Status Reset!*\n\n━━━━━━━━━━━━━━━\n✅ All members marked as pending for today.\n\n💡 _Fines remain unchanged. Use /resetfine to clear fines._`,
        });
      }

      // 💰 RESET FINE
      if (cmd.startsWith("/resetfine")) {
        if (!isAdmin)
          return safeSend(sock, chatId, {
            text: `❌ *Access Denied*\n_Only admins can use this command._`,
          });

        await User.updateMany({}, { fine: 0 });

        return safeSend(sock, chatId, {
          text: `💰 *All Fines Cleared!*\n\n━━━━━━━━━━━━━━━\n✅ All member fines have been reset to ₹0.\n\n💡 _Daily status unchanged. Use /resetday to reset status._`,
        });
      }

      // ✏️ SET NAME — manually set a member's display name
      // Usage: /setname @mention Name Here
      if (cmd.startsWith("/setname")) {
        if (!isAdmin)
          return safeSend(sock, chatId, { text: `❌ *Access Denied*\n_Only admins can use this command._` });

        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (!mentioned.length) {
          return safeSend(sock, chatId, { text: `❌ Usage: /setname @mention Name\nExample: /setname @628xxx Sinan` });
        }

        // Name is everything after the command and mention
        const rawText = text.trim();
        const nameMatch = rawText.replace(/\/setname\s*/i, "").replace(/@\S+\s*/g, "").trim();
        if (!nameMatch) {
          return safeSend(sock, chatId, { text: `❌ Please provide a name. Usage: /setname @mention Name` });
        }

        const results = [];
        for (const userId of mentioned) {
          const normalizedId = userId.includes("@lid")
            ? userId.replace("@lid", "@s.whatsapp.net")
            : userId;
          await User.updateOne({ userId: normalizedId }, { $set: { name: nameMatch } });
          results.push(`@${getName(normalizedId)} → *${nameMatch}*`);
        }

        return safeSend(sock, chatId, {
          text: `✅ *Name Updated!*\n\n━━━━━━━━━━━━━━━\n${results.join("\n")}`,
          mentions: mentioned,
        });
      }

      // 👥 SYNC USERS — add all current group members to DB (for members who joined before bot)
      if (cmd.startsWith("/syncusers")) {
        if (!isAdmin)
          return safeSend(sock, chatId, { text: `❌ *Access Denied*\n_Only admins can use this command._` });

        try {
          const meta = await sock.groupMetadata(TARGET_GROUP);
          let added = 0;

          for (const p of meta.participants) {
            const normalizedId = p.id.includes("@lid")
              ? p.id.replace("@lid", "@s.whatsapp.net")
              : p.id;
            const pName = p.notify || p.name || null;

            const result = await User.updateOne(
              { userId: normalizedId },
              {
                $setOnInsert: { userId: normalizedId, completed: false, fine: 0 },
                ...(pName ? { $set: { name: pName } } : {}),
              },
              { upsert: true }
            );
            if (result.upsertedCount > 0) added++;
          }

          return safeSend(sock, chatId, {
            text: `✅ *Users Synced!*\n\n━━━━━━━━━━━━━━━\n➕ Added *${added}* new member(s) to DB.\n📦 Total tracked: *${meta.participants.length}*`,
          });
        } catch (err) {
          return safeSend(sock, chatId, { text: `❌ Sync failed: ${err.message}` });
        }
      }

      // 🔄 SYNC NAMES — bulk fetch push names from group metadata
      if (cmd.startsWith("/syncnames")) {
        if (!isAdmin)
          return safeSend(sock, chatId, { text: `❌ *Access Denied*\n_Only admins can use this command._` });

        try {
          const meta = await sock.groupMetadata(TARGET_GROUP);
          let updated = 0;

          for (const p of meta.participants) {
            // Baileys stores push name in p.notify (from contact store) or p.name
            const pName = p.notify || p.name || null;
            if (!pName) continue;

            const normalizedId = p.id.includes("@lid")
              ? p.id.replace("@lid", "@s.whatsapp.net")
              : p.id;

            const result = await User.updateOne(
              { userId: normalizedId },
              { $set: { name: pName } }
            );
            if (result.modifiedCount > 0) updated++;
          }

          // Also check contacts store via sock.store if available
          const users = await User.find({ name: null });
          let fromStore = 0;
          for (const u of users) {
            try {
              // Try fetching contact info
              const contact = await sock.onWhatsApp(u.userId.replace("@s.whatsapp.net", ""));
              if (contact?.[0]?.notify) {
                await User.updateOne({ _id: u._id }, { $set: { name: contact[0].notify } });
                fromStore++;
              }
            } catch (_) {}
          }

          return safeSend(sock, chatId, {
            text: `✅ *Names Synced!*\n\n━━━━━━━━━━━━━━━\n🔄 From group metadata: *${updated}*\n📇 From contact store: *${fromStore}*\n\n💡 _Names will auto-update as members send messages._`,
          });
        } catch (err) {
          return safeSend(sock, chatId, { text: `❌ Sync failed: ${err.message}` });
        }
      }

      // 🧹 DEDUP — remove duplicate userId records from DB
      if (cmd.startsWith("/dedup")) {
        if (!isAdmin)
          return safeSend(sock, chatId, { text: `❌ *Access Denied*\n_Only admins can use this command._` });

        const users = await User.find();

        // Normalize userId to phone number only for comparison
        const getPhone = (id) => id ? id.replace(/@s\.whatsapp\.net|@lid|@c\.us/g, "").split(":")[0] : null;

        // Step 1: Fix @lid records that have no duplicate — just rename them
        let migrated = 0;
        for (const u of users) {
          if (u.userId?.includes("@lid")) {
            const fixed = u.userId.replace("@lid", "@s.whatsapp.net");
            // Only rename if no @s.whatsapp.net version already exists
            const exists = await User.findOne({ userId: fixed });
            if (!exists) {
              await User.updateOne({ _id: u._id }, { userId: fixed });
              migrated++;
            }
          }
        }

        // Step 2: Re-fetch and group by phone number to find true duplicates
        const fresh = await User.find();
        const phoneMap = new Map();
        for (const u of fresh) {
          const phone = getPhone(u.userId);
          if (!phone) { await User.deleteOne({ _id: u._id }); continue; }
          if (!phoneMap.has(phone)) phoneMap.set(phone, []);
          phoneMap.get(phone).push(u);
        }

        let removed = 0;
        for (const [, records] of phoneMap) {
          if (records.length <= 1) continue;

          // Keep @s.whatsapp.net version, or highest fine
          records.sort((a, b) => {
            const aP = a.userId?.includes("@s.whatsapp.net") ? 1 : 0;
            const bP = b.userId?.includes("@s.whatsapp.net") ? 1 : 0;
            if (aP !== bP) return bP - aP;
            return (b.fine || 0) - (a.fine || 0);
          });

          const keep = records[0];
          const totalFine = records.reduce((sum, r) => sum + (r.fine || 0), 0);
          await User.updateOne({ _id: keep._id }, { fine: totalFine });

          for (const dup of records.slice(1)) {
            await User.deleteOne({ _id: dup._id });
            removed++;
          }
        }

        return safeSend(sock, chatId, {
          text: `🧹 *Dedup Complete!*\n\n━━━━━━━━━━━━━━━\n✅ Removed *${removed}* duplicate(s)\n🔄 Migrated *${migrated}* @lid record(s)\n📦 Unique members: *${phoneMap.size}*`,
        });
      }

      // ✍️ GRAMMAR COMMANDS
      if (cmd === "/grammar on") {
        if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Only admins can use this command" });
        
        await GrammarSettings.updateOne(
          { groupId: chatId },
          { grammarEnabled: true },
          { upsert: true }
        );
        
        return safeSend(sock, chatId, {
          text: "✅ *Grammar Assistant Enabled!*\n\n📝 I'll now help members improve their English.",
        });
      }

      if (cmd === "/grammar off") {
        if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Only admins can use this command" });
        
        await GrammarSettings.updateOne(
          { groupId: chatId },
          { grammarEnabled: false },
          { upsert: true }
        );
        
        return safeSend(sock, chatId, {
          text: "⏸️ *Grammar Assistant Disabled*\n\n📝 I won't analyze messages anymore.",
        });
      }

      if (cmd === "/grammar status") {
        const settings = await GrammarSettings.findOne({ groupId: chatId }) || {
          grammarEnabled: true,
          tenseEnabled: true,
          vocabEnabled: true,
          cooldownMinutes: 2,
        };
        
        return safeSend(sock, chatId, {
          text: `📊 *Grammar Assistant Status*\n\n` +
                `✍️ Grammar: ${settings.grammarEnabled ? "✅ ON" : "❌ OFF"}\n` +
                `⏰ Tense Check: ${settings.tenseEnabled ? "✅ ON" : "❌ OFF"}\n` +
                `📚 Vocab: ${settings.vocabEnabled ? "✅ ON" : "❌ OFF"}\n` +
                `⏱️ Cooldown: ${settings.cooldownMinutes} minutes`,
        });
      }

      if (cmd === "/tense on") {
        if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Only admins can use this command" });
        await GrammarSettings.updateOne({ groupId: chatId }, { tenseEnabled: true }, { upsert: true });
        return safeSend(sock, chatId, { text: "✅ Tense checking enabled!" });
      }

      if (cmd === "/tense off") {
        if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Only admins can use this command" });
        await GrammarSettings.updateOne({ groupId: chatId }, { tenseEnabled: false }, { upsert: true });
        return safeSend(sock, chatId, { text: "⏸️ Tense checking disabled!" });
      }

      if (cmd === "/vocab on") {
        if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Only admins can use this command" });
        await GrammarSettings.updateOne({ groupId: chatId }, { vocabEnabled: true }, { upsert: true });
        return safeSend(sock, chatId, { text: "✅ Vocabulary suggestions enabled!" });
      }

      if (cmd === "/vocab off") {
        if (!isAdmin) return safeSend(sock, chatId, { text: "❌ Only admins can use this command" });
        await GrammarSettings.updateOne({ groupId: chatId }, { vocabEnabled: false }, { upsert: true });
        return safeSend(sock, chatId, { text: "⏸️ Vocabulary suggestions disabled!" });
      }

      if (cmd === "/mystats") {
        const stats = await UserStats.findOne({ userId: dbUser, groupId: chatId });
        
        if (!stats || stats.totalCorrections === 0) {
          return safeSend(sock, chatId, {
            text: `📊 *Your English Stats*\n\n` +
                  `@${getName(dbUser)}, you haven't received any corrections yet!\n\n` +
                  `💬 Keep chatting in English to get feedback.`,
            mentions: [dbUser],
          });
        }
        
        return safeSend(sock, chatId, {
          text: `📊 *Your English Stats*\n\n` +
                `👤 @${getName(dbUser)}\n` +
                `✍️ Total Corrections: ${stats.totalCorrections}\n` +
                `📈 Grammar Score: ${stats.grammarScore}/100\n` +
                `🔥 Streak: ${stats.streakDays} days\n\n` +
                `💪 Keep improving!`,
          mentions: [dbUser],
        });
      }

      if (cmd === "/toplearners") {
        const topUsers = await UserStats.find({ groupId: chatId })
          .sort({ totalCorrections: -1 })
          .limit(5);
        
        if (!topUsers.length) {
          return safeSend(sock, chatId, {
            text: "📊 *Top Learners*\n\nNo stats yet! Start chatting in English.",
          });
        }
        
        let msg = "🏆 *Top English Learners*\n\n";
        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
        
        topUsers.forEach((u, i) => {
          msg += `${medals[i]} @${getName(u.userId)} - ${u.totalCorrections} corrections\n`;
        });
        
        return safeSend(sock, chatId, {
          text: msg,
          mentions: topUsers.map(u => u.userId),
        });
      }

      // 🎥 VIDEO CHECK
      const video =
        msg.message?.videoMessage ||
        msg.message?.ephemeralMessage?.message?.videoMessage ||
        msg.message?.viewOnceMessage?.message?.videoMessage ||
        msg.message?.viewOnceMessageV2?.message?.videoMessage ||
        msg.message?.viewOnceMessageV2Extension?.message?.videoMessage ||
        (docIsVideo ? docMsg : null);

      if (video) {
        // Documents don't have a seconds field — skip duration check, Whisper will measure it
        const isDocument = video === docMsg;
        if (!isDocument && (video.seconds || 0) < 60) {
          return safeSend(sock, chatId, {
            text: `❌ *Video Too Short!*\n\n━━━━━━━━━━━━━━━\n⏱️ Minimum duration is *1 minute*.\n\n🔁 _Please re-record and send again._`,
          });
        }

        const existing = await User.findOne({ userId: dbUser });

        if (existing?.completed) {
          return safeSend(sock, chatId, {
            text: `⚠️ *Already Submitted!*\n\n━━━━━━━━━━━━━━━\n✅ You've already sent your video for today.\n\n😎 _Sit back and relax — see you tomorrow!_`,
          });
        }
   
        await User.findOneAndUpdate(
          { userId: dbUser },
          { completed: true },
          { upsert: true },
        );

        const username = getName(dbUser);
        await safeSend(sock, chatId, {
          text: `🔥 *Great work, @${username}!*\n\n✅ Submission received!\n\n💪 _Keep showing up every day — consistency is what separates the best from the rest. You're on the right track!_ 🚀`,
          mentions: [dbUser],
        });

        await safeSend(sock, chatId, {
          text: `🤖 ⏳ _Analyzing your video... feedback coming shortly!_`,
          mentions: [dbUser],
        });

        // Fetch today's topic for AI relevance check
        const todayStatus = await getStatus();

        // 🤖 AI Feedback (runs async, won't block submission)
        generateFeedback(msg, dbUser, video.seconds || 60, todayStatus?.todayTopic || null, todayStatus?.todayQuestion || null, sock)
          .then((feedbackText) => {
            safeSend(sock, chatId, { text: feedbackText, mentions: [dbUser] });
          })
          .catch((err) => {
            console.log("❌ Feedback error:", err.message);
            safeSend(sock, chatId, { text: `⚠️ _Feedback unavailable: ${err.message}_`, mentions: [dbUser] });
          });

        return; // Done with video
      }

      // ✍️ GRAMMAR ANALYSIS - DISABLED
      // To re-enable, remove the return below and use /grammar on command
      return;

      /* GRAMMAR ANALYSIS FOR TEXT MESSAGES
      if (!text || text.trim().length === 0) return;

      const grammarSettings = await GrammarSettings.findOne({ groupId: chatId }) || {
        grammarEnabled: true,
        tenseEnabled: true,
        vocabEnabled: true,
        cooldownMinutes: 2,
      };

      if (!grammarSettings.grammarEnabled) return;

      console.log(`✍️ Analyzing: "${text}" from ${getName(dbUser)}`);
      const grammarResult = await processMessage(text, grammarSettings, OPENAI_API_KEY);

      if (grammarResult) {
        await UserStats.updateOne(
          { userId: dbUser, groupId: chatId },
          { $inc: { totalCorrections: 1 }, $set: { lastMessageTime: new Date() } },
          { upsert: true }
        );

        const response = formatResponse(grammarResult, getName(dbUser));
        await safeSend(sock, chatId, { text: response, mentions: [dbUser] });
        console.log(`✍️ Grammar feedback sent to ${getName(dbUser)}`);
      } else {
        console.log(`✅ No corrections needed for ${getName(dbUser)}`);
      }
      */

    } catch (err) {
      console.log("❌ Message error:", err);
    }
  });

  // ================= CRON =================
  cron.schedule("30 7 * * *", sendGoodMorning, { timezone: TIMEZONE });

  cron.schedule("0 9 * * *", sendQuestion, { timezone: TIMEZONE });

  cron.schedule(
    "*/2 9 * * *",
    async () => {
      const now = new Date();
      const minutes = now.getMinutes();

      if (minutes > 30) return; // stop after 8:20

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

  // ================= TEST CRON (sends question to owner every min, no delete) =================
  if (false) {
    cron.schedule("* * * * *", async () => {
      try {
        const q = await Question.aggregate([{ $sample: { size: 1 } }]);
        if (!q || !q.length) return;
        const question = q[0];

        await generatePoster(question);

        await safeSend(sock, OWNER, {
          image: { url: "./daily.png" },
        });

        console.log("🧪 Test question sent to owner");
      } catch (err) {
        console.log("❌ Test cron error:", err);
      }
    }, { timezone: TIMEZONE });
  }

  // ================= CONNECTION =================
  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "open") {
      console.log("✅ Connected");
    }

    if (connection === "close") {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || "";

      if (code === DisconnectReason.loggedOut) {
        console.log("❌ Logged out. Delete auth folder and restart.");
        return;
      }

      if (
        code === DisconnectReason.connectionReplaced ||
        reason.includes("conflict") ||
        reason.includes("replaced")
      ) {
        console.log("⚠️ Conflict: another instance took over. Stopping this one.");
        process.exit(0);
      }

      console.log(`⚠️ Disconnected (code: ${code}), reconnecting in 5s...`);
      setTimeout(startBot, 5000);
    }
  });
}

startBot();
