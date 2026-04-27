import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import cron from "node-cron";
import dotenv from "dotenv";
import { connectDB, safeDB, startDBHealthCheck } from "./db.js";
import User from "./models/userSchema.js";
import Question from "./models/questionSchema.js";
import Status from "./models/statusSchema.js";
import GrammarSettings from "./models/grammarSettingsSchema.js";
import UserStats from "./models/userStatsSchema.js";
import generateVoice from "./generateVoice.js";
import generatePoster from "./poster.js";
import { resetStatus } from "./resetStatus.js";
import { generateFeedback } from "./ai/feedback.js";
import { chunkMessage, sendChunks as _sendChunks } from "./helpers.js";
import { hashBuffer, markProcessing, storeResult, getCacheEntry, evict } from "./ai/dedupCache.js";
import { processMessage, formatResponse } from "./grammar/processor.js";
import { isOnCooldown, setCooldown, getRemainingCooldown } from "./grammar/cooldown.js";
import { generateAndInsertQuestions, humanizeAllDbQuestions } from "./ai/questionGenerator.js";
import fs from "fs";
import { exec } from "child_process";
import pino from "pino";

dotenv.config();
connectDB();

// ---------------------------------------------------------------------------
// Suppress libsignal / Baileys Signal protocol session noise.
// libsignal uses console.info() for "Closing session", "Opening session" etc.
// Baileys uses console.log() for key material dumps (pubKey, privKey, etc.)
// These are harmless internal cryptographic session management logs.
// ---------------------------------------------------------------------------
const _noisePatterns = [
  "Closing session", "Opening session", "Closing open session",
  "Session already", "pubKey", "privKey", "ephemeralKeyPair",
  "lastRemoteEphemeralKey", "rootKey", "registrationId",
  "remoteIdentityKey", "baseKeyType", "pendingPreKey",
  "previousCounter", "_chains", "chainKey", "chainType",
  "messageKeys", "indexInfo", "currentRatchet",
  "prekey bundle", "incoming prekey",
  // libsignal Bad MAC / session decrypt errors — Baileys handles these internally
  "Bad MAC", "Session error:", "Failed to decrypt message",
  "decryptWithSessions", "doDecryptWhisperMessage", "verifyMAC",
];
const _isBaileysNoise = (args) => {
  const first = args[0];
  if (typeof first === "string") {
    return _noisePatterns.some(p => first.includes(p));
  }
  // Also suppress when first arg is an object with session-like keys
  if (first && typeof first === "object" && ("_chains" in first || "currentRatchet" in first)) {
    return true;
  }
  return false;
};
const _origInfo = console.info.bind(console);
const _origWarn = console.warn.bind(console);
const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
console.info = (...args) => { if (!_isBaileysNoise(args)) _origInfo(...args); };
console.warn = (...args) => { if (!_isBaileysNoise(args)) _origWarn(...args); };
console.log = (...args) => { if (!_isBaileysNoise(args)) _origLog(...args); };
console.error = (...args) => { if (!_isBaileysNoise(args)) _origError(...args); };

const TARGET_GROUP = process.env.TARGET_GROUP;
const OWNER = process.env.OWNER_NUMBER;
const TIMEZONE = "Asia/Kolkata";
let sock = null; // module-level so crons always use the latest connection
let cronsRegistered = false; // ensure crons only register once
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
  // Strip device suffix (e.g. "918848096746:10@s.whatsapp.net" → "918848096746")
  return userId.split("@")[0].split(":")[0];
};

// Returns the phone number for use in @mention text.
// Text must contain @<phone_number>, mentions[] must contain the JID.
// WhatsApp then shows it as a blue tappable mention with the contact's name.
const getMentionName = (userRecord) => {
  if (!userRecord) return "Unknown";
  return getName(userRecord.userId);
};

// Returns just the phone number for a proper tappable @mention in WhatsApp.
// Use this in message text — WhatsApp renders it as the contact's saved name.
const getMentionPhone = (userRecord) => {
  if (!userRecord?.userId) return "unknown";
  return userRecord.userId.split("@")[0].split(":")[0];
};

/**
 * Fetches the group participant map: phone → actual JID.
 * WhatsApp mentions only work with the exact JID from groupMetadata.
 * Cached per call — pass the result around rather than calling multiple times.
 */
async function getParticipantMap(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const map = {};
    for (const p of meta.participants) {
      const phone = p.id.split("@")[0].split(":")[0];
      map[phone] = p.id;
    }
    return map;
  } catch (_) {
    return {};
  }
}

/**
 * Resolves a stored userId to the actual group participant JID.
 * Falls back to phone@s.whatsapp.net if not found in group.
 */
function resolveJid(userId, participantMap) {
  const phone = userId.split("@")[0].split(":")[0];
  return participantMap[phone] || `${phone}@s.whatsapp.net`;
}

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

// Wrapper that binds the local safeSend implementation
const sendChunks = (sock, jid, chunks, mentions = []) =>
  _sendChunks(sock, jid, chunks, mentions, safeSend);

// Parses fluency/grammar/confidence/vocabulary scores from a feedback message string
const parseFeedbackScores = (text) => {
  const extract = (label) => {
    const m = text.match(new RegExp(`${label}:[^\\d]*(\\d+)/10`));
    return m ? parseInt(m[1]) : null;
  };
  const fluency = extract("Fluency");
  const grammar = extract("Grammar");
  const confidence = extract("Confidence");
  const vocabulary = extract("Vocabulary");
  if (fluency == null && grammar == null) return null;
  return { fluency, grammar, confidence, vocabulary };
};


async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 1000,
    logger: pino({ level: "silent" }),
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
          } catch (_) { }

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
      // Check if already sent today — only block if truly sent, not on failure
      const statusCheck = await Status.findOne();
      if (statusCheck?.questionSentToday) {
        console.log("🚫 Blocked: already sent today");
        return;
      }

      // ── Ensure there are questions — generate if needed (blocking) ──────
      let count = await Question.countDocuments();

      if (count === 0) {
        console.log("[Questions] Bank empty — generating 14 before sending...");
        await safeSend(sock, OWNER, {
          text: `🚨 *Question Bank Empty!*\n\n⏳ _Auto-generating 14 new questions…_`,
        });
        try {
          const { inserted, totalInDb } = await generateAndInsertQuestions(14);
          count = totalInDb;
          await safeSend(sock, OWNER, {
            text: `✅ *Auto-generated ${inserted.length} questions!*\n📊 Total in DB: ${totalInDb}`,
          });
        } catch (genErr) {
          console.log("❌ Auto-generate failed:", genErr.message);
          await safeSend(sock, OWNER, {
            text: `❌ *Auto-generation failed:* _${genErr.message}_`,
          });
          return;
        }
      } else if (count <= 7) {
        // Low stock — refill in background, don't block today's question
        console.log(`[Questions] Low stock (${count} left) — auto-generating 14 more in background`);
        generateAndInsertQuestions(14)
          .then(({ inserted, totalInDb }) => {
            console.log(`[Questions] Auto-generated ${inserted.length} questions. Total: ${totalInDb}`);
            safeSend(sock, OWNER, {
              text: `🔄 *Auto-refill:* Added ${inserted.length} new questions _(${count} were left)_\n📊 Total in DB: ${totalInDb}`,
            });
          })
          .catch(err => {
            console.log("❌ Background auto-generate failed:", err.message);
            safeSend(sock, OWNER, {
              text: `⚠️ *Low stock (${count} left)* — auto-refill failed: _${err.message}_`,
            });
          });
      }

      // ── Pick a question ──────────────────────────────────────────────────
      const statusDoc = await Status.findOne();
      const recentCategories = statusDoc?.recentCategories || [];

      let q = null;

      // Prefer a category not used in last 7 days
      if (recentCategories.length > 0) {
        const fresh = await Question.aggregate([
          { $match: { category: { $nin: recentCategories } } },
          { $sample: { size: 1 } },
        ]);
        if (fresh?.length) q = fresh;
      }

      // Fallback: any random question
      if (!q || !q.length) {
        q = await Question.aggregate([{ $sample: { size: 1 } }]);
      }

      if (!q || !q.length) {
        console.log("❌ No question available after generation");
        return;
      }

      const question = q[0];

      // ── Generate & send poster ───────────────────────────────────────────
      let imageBuffer = null;
      try {
        imageBuffer = await generatePoster(question);
      } catch (posterErr) {
        console.log("Poster generation failed:", posterErr.message);
      }
      if (!TARGET_GROUP) {
        console.log("TARGET_GROUP not set");
        return;
      }
      let sent = false;
      if (imageBuffer) {
        sent = await safeSend(sock, TARGET_GROUP, {
          image: imageBuffer,
          mimetype: "image/png",
        });
      } else {
        console.log("[sendQuestion] Canvas unavailable, sending text fallback");
        sent = await safeSend(sock, TARGET_GROUP, {
          text: "Speak & Shine - Daily Challenge\n\nCategory: " + (question.category || "General") + "\n\nTopic: " + (question.topic || "") + "\n\nQuestion: " + question.question + "\n\nSend your 1-min speaking video!",
        });
      }

      if (sent) {
        await Question.findByIdAndDelete(question._id);

        const updatedRecent = question.category
          ? [...new Set([...recentCategories, question.category])].slice(-7)
          : recentCategories;

        // ✅ Mark as sent ONLY after successful delivery
        await Status.updateOne({}, {
          $set: {
            questionSentToday: true,
            todayTopic: question.topic || null,
            todayQuestion: question.question || null,
            todayCategory: question.category || null,
            todayPosterImage: imageBuffer ? ("data:image/png;base64," + imageBuffer.toString("base64")) : null,
            posterExpiresAt: imageBuffer ? new Date(Date.now() + 15 * 60 * 60 * 1000) : null,
            recentCategories: updatedRecent,
          }
        });

        console.log(`✅ Question sent | Category: ${question.category || "N/A"} | Recent: [${updatedRecent.join(", ")}]`);
      } else {
        console.log("❌ Poster send failed — will retry next cron tick");
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

      // Build phone → actual group JID map from live group metadata
      let participantMap = {};
      try {
        const meta = await sock.groupMetadata(TARGET_GROUP);
        for (const p of meta.participants) {
          const phone = p.id.split("@")[0].split(":")[0];
          participantMap[phone] = p.id;
        }
      } catch (_) { }

      // Deduplicate by phone number
      const getPhone = (id) => id ? id.replace(/@s\.whatsapp\.net|@lid|@c\.us/g, "").split(":")[0] : null;
      const seen = new Map();
      for (const u of pending) {
        const phone = getPhone(u.userId);
        if (!phone) continue;
        if (!seen.has(phone) || u.userId?.includes("@s.whatsapp.net")) {
          seen.set(phone, u);
        }
      }
      const uniquePending = [...seen.values()];

      let msg = `${title}\n━━━━━━━━━━━━━━━\n\n`;
      msg += `📌 *${uniquePending.length} member(s) yet to submit:*\n\n`;

      const mentionJids = [];
      uniquePending.forEach((u) => {
        const phone = u.userId.split("@")[0].split(":")[0];
        const actualJid = participantMap[phone] || `${phone}@s.whatsapp.net`;
        mentionJids.push(actualJid);
        msg += `▪ @${phone}\n`;
      });
      msg += `\n🎬 _Send your 1-min+ speaking video now!_`;

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: mentionJids,
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

      const pMap = await getParticipantMap(sock, TARGET_GROUP);

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
        text: `🚨 *FINAL WARNING!*\n\n━━━━━━━━━━━━━━━\n⏳ Deadline is almost here!\n\n${pending.map((u) => { const num = u.userId.split("@")[0].split(":")[0]; return `▪ @${num}`; }).join("\n")}\n\n📹 _Submit your speaking video RIGHT NOW or a fine will be applied!_ 💸`,
        mentions: pending.map((u) => resolveJid(u.userId, pMap)),
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
        userId: { $exists: true, $nin: [null, ""] }
      }));

      // Filter out the bot's own account from all reports
      const botPhone = sock.user?.id?.split(":")[0].split("@")[0] ?? "";
      const filteredUsers = botPhone
        ? users.filter(u => !u.userId.includes(botPhone))
        : users;

      const completed = filteredUsers.filter((u) => u.completed);
      const pending = filteredUsers.filter((u) => !u.completed);

      console.log(`📊 Report: ${completed.length} submitted, ${pending.length} pending`);

      // Get actual participant JIDs for proper mentions
      const pMap = await getParticipantMap(sock, TARGET_GROUP);

      let totalTodayFine = 0;

      // Apply fine to pending users (only once per day)
      if (pending.length && !status.fineAppliedToday) {
        await User.updateMany(
          { userId: { $in: pending.map((u) => u.userId) } },
          { $inc: { fine: FINE_AMOUNT, weeklyFine: FINE_AMOUNT } }
        );

        pending.forEach((u) => {
          u.fine = (u.fine || 0) + FINE_AMOUNT;
          totalTodayFine += FINE_AMOUNT;
        });

        status.fineAppliedToday = true;
        await status.save();
      }

      // ── Streak tracking ──────────────────────────────────────────────────
      // Increment streak for completed users, reset for pending
      if (completed.length) {
        await User.updateMany(
          { userId: { $in: completed.map((u) => u.userId) } },
          { $inc: { streak: 1 } }
        );
        completed.forEach((u) => { u.streak = (u.streak || 0) + 1; });
      }
      if (pending.length) {
        await User.updateMany(
          { userId: { $in: pending.map((u) => u.userId) } },
          { $set: { streak: 0 } }
        );
        pending.forEach((u) => { u.streak = 0; });
      }

      // ── 7-day streak reward: deduct ₹5 from fine ─────────────────────────
      const STREAK_REWARD_DAYS = 7;
      const STREAK_REWARD_AMOUNT = 5;
      const streakRewardUsers = completed.filter(u => u.streak > 0 && u.streak % STREAK_REWARD_DAYS === 0);

      if (streakRewardUsers.length > 0) {
        const bulkOps = [];
        for (const u of streakRewardUsers) {
          const deduct = Math.min(u.fine || 0, STREAK_REWARD_AMOUNT);
          if (deduct > 0) {
            bulkOps.push({ updateOne: { filter: { userId: u.userId }, update: { $inc: { fine: -deduct } } } });
            u.fine = Math.max(0, (u.fine || 0) - deduct);
          }
        }
        if (bulkOps.length > 0) await User.bulkWrite(bulkOps);
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
          const streak = u.streak || 0;
          const streakBadge = streak >= 7 ? `🔥` : streak >= 3 ? `⚡` : `📅`;
          msg += `✅ @${getMentionPhone(u)} ${streakBadge} ${streak} day streak\n`;
        });
      }

      // Streak reward announcement
      if (streakRewardUsers.length > 0) {
        msg += `\n━━━━━━━━━━━━━━━\n`;
        msg += `🎁 *7-Day Streak Reward!*\n`;
        msg += `_Incredible discipline — 7 days straight! As a reward, ₹${STREAK_REWARD_AMOUNT} has been deducted from your fine. Keep going!_ 💪\n\n`;
        streakRewardUsers.forEach((u) => {
          const deducted = Math.min((u.fine || 0) + STREAK_REWARD_AMOUNT, STREAK_REWARD_AMOUNT);
          msg += `🏆 @${getMentionPhone(u)} — *${u.streak} day streak!* ₹${deducted} fine removed 🎉\n`;
        });
      }

      if (pending.length) {
        msg += `\n━━━━━━━━━━━━━━━\n`;
        msg += `⚠️ *Missed Today — Fined ₹${FINE_AMOUNT}:*\n`;
        pending.forEach((u) => {
          msg += `❌ @${getMentionPhone(u)} _(Total fine: ₹${u.fine})_\n`;
        });
        msg += `\n💡 _Don't let it pile up — submit tomorrow and stay consistent!_`;
      }

      if (!pending.length) {
        msg += `\n\n🎉 _Everyone submitted today — great work!_ 🙌`;
      }

      msg += `\n━━━━━━━━━━━━━━━
🔥 _Consistency builds champions._
💡 _7 days in a row = ₹5 fine reduction. Keep your streak alive!_`;

      const allMentions = filteredUsers.map((u) => resolveJid(u.userId, pMap)).filter(Boolean);

      await safeSend(sock, TARGET_GROUP, {
        text: msg,
        mentions: allMentions,
      });

      // NOTE: reset is done separately at 12:00 AM by dailyReset()

    } catch (err) {
      console.log("❌ Report error:", err);
    }
  };

  // ================= DAILY RESET (12:00 AM) =================
  const dailyReset = async () => {
    try {
      // Reset all users for next day
      await User.updateMany({}, { completed: false });

      // On Sunday (day 0) reset weekly submissions
      const dayOfWeek = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", weekday: "short" });
      if (dayOfWeek === "Sun") {
        await User.updateMany({}, { weeklySubmissions: 0, weeklyFine: 0 });
        console.log("🔄 Weekly submissions + fines reset (Sunday)");
      }

      // On 1st of month reset monthly submissions
      const dayOfMonth = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", day: "numeric" });
      if (dayOfMonth === "1") {
        await User.updateMany({}, { monthlySubmissions: 0 });
        console.log("🔄 Monthly submissions reset (1st of month)");
      }

      // Reset daily flags
      await resetStatus();

      console.log("🔄 Daily reset done");
    } catch (err) {
      console.log("❌ Reset error:", err);
    }
  };

  // ================= WEEKLY SUMMARY =================
  const weeklySummary = async () => {
    try {
      const users = await safeDB(() => User.find({
        userId: { $exists: true, $nin: [null, ""] }
      }));

      const botPhone = sock.user?.id?.split(":")[0].split("@")[0] ?? "";
      const filtered = botPhone ? users.filter(u => !u.userId.includes(botPhone)) : users;

      if (!filtered.length) return;

      const pMap = await getParticipantMap(sock, TARGET_GROUP);

      // Sort by weeklySubmissions desc, then streak desc
      const sorted = [...filtered].sort((a, b) =>
        (b.weeklySubmissions || 0) - (a.weeklySubmissions || 0) ||
        (b.streak || 0) - (a.streak || 0)
      );

      const topStreaks = [...filtered]
        .filter(u => (u.streak || 0) > 0)
        .sort((a, b) => (b.streak || 0) - (a.streak || 0))
        .slice(0, 3);

      const totalFines = filtered.reduce((sum, u) => sum + (u.weeklyFine || 0), 0);

      // Week date range
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 6);
      const fmt = (d) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

      let msg = `╔══════════════════╗\n🏆 *WEEKLY SUMMARY*\n╚══════════════════╝\n\n`;
      msg += `📅 _Week of ${fmt(weekStart)} – ${fmt(now)}_\n`;
      msg += `━━━━━━━━━━━━━━━\n\n`;

      // Most consistent
      msg += `🥇 *Most Consistent:*\n`;
      const medals = ["🥇", "🥈", "🥉"];
      sorted.slice(0, 5).forEach((u, i) => {
        const days = u.weeklySubmissions || 0;
        const badge = days === 7 ? "🔥" : days >= 5 ? "⚡" : days >= 3 ? "💪" : "📅";
        msg += `${medals[i] || `${i + 1}.`} @${getMentionPhone(u)} — *${days}/7 days* ${badge}\n`;
      });

      // Top streaks
      if (topStreaks.length) {
        msg += `\n🔥 *Top Streaks:*\n`;
        topStreaks.forEach((u) => {
          msg += `@${getMentionPhone(u)} — ${u.streak} day streak\n`;
        });
      }

      msg += `\n💸 *Total Fines This Week:* ₹${totalFines}\n`;
      msg += `━━━━━━━━━━━━━━━\n`;
      msg += `🎯 _New week starts tomorrow. Stay consistent!_`;

      const allMentions = filtered.map((u) => resolveJid(u.userId, pMap)).filter(Boolean);

      await safeSend(sock, TARGET_GROUP, { text: msg, mentions: allMentions });
      console.log("📊 Weekly summary sent");
    } catch (err) {
      console.log("❌ Weekly summary error:", err);
    }
  };

  // ================= MESSAGE HANDLER =================
  const processedMsgIds = new Set();

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (!messages || !messages.length) return;

      const msg = messages[0];
      if (!msg || !msg.message) return;

      const chatId = msg.key.remoteJid;

      // Allow "append" type only for owner self-DM commands (messages sent to yourself)
      // All other non-notify events (history sync, etc.) are ignored
      if (type !== "notify") {
        const selfText =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          "";
        const ownerNum = (process.env.OWNER_NUMBER || "").replace("@s.whatsapp.net", "").replace(/:.*/, "");
        const chatNum = chatId.replace("@s.whatsapp.net", "").replace(/:.*/, "");
        const isSelfOwnerCmd = msg.key.fromMe && chatNum === ownerNum && selfText.startsWith("/");
        if (!isSelfOwnerCmd) return;
      }

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
      const ownerNumber = OWNER.replace("@s.whatsapp.net", "").replace("@lid", "").replace(/:.*/, "");
      const chatPhone = chatId.replace("@s.whatsapp.net", "").replace("@lid", "").replace(/:.*/, "");
      const isOwnerDM = !chatId.includes("@g.us") && (
        chatId === OWNER ||
        chatPhone === ownerNumber ||
        chatId.includes(ownerNumber) ||
        (msg.key.fromMe && dmVideo)
      );

      // Block fromMe messages EXCEPT:
      // - Owner DM videos (for testing feedback)
      // - Owner DM text commands (fromMe can happen when bot and owner share a session)
      if (msg.key.fromMe && !(isOwnerDM && (dmVideo || text.startsWith("/")))) return;

      const msgId = msg.key.id;
      if (processedMsgIds.has(msgId)) return;
      processedMsgIds.add(msgId);
      setTimeout(() => processedMsgIds.delete(msgId), 60000);
      if (isOwnerDM && dmVideo) {
        const ownerStatus = await getStatus();

        // Dedup check for owner DM — include sender ID so forwarded videos don't collide
        const ownerHash = hashBuffer(Buffer.from(`${OWNER}:${dmVideo.fileSha256 || dmVideo.mediaKey || msg.key.id}`));
        const ownerCacheEntry = await getCacheEntry(ownerHash);
        if (ownerCacheEntry === 'processing') {
          safeSend(sock, OWNER, { text: `⏳ _Your video is already being processed! Please wait._` });
          return;
        }
        if (typeof ownerCacheEntry === 'string') {
          const ownerChunks = chunkMessage(ownerCacheEntry);
          sendChunks(sock, OWNER, ownerChunks);
          return;
        }

        await markProcessing(ownerHash);

        const ownerProgressSent = await sock.sendMessage(OWNER, {
          text: `⏳ _Analysing your video…_`,
        });
        const ownerProgressMsgKey = ownerProgressSent?.key;

        const ownerOnProgress = async (stage) => {
          if (!ownerProgressMsgKey) return;
          try {
            await sock.sendMessage(OWNER, {
              text: `⏳ _${stage}_`,
              edit: ownerProgressMsgKey,
            });
          } catch (_) { }
        };

        generateFeedback(msg, OWNER, dmVideo.seconds || 60, ownerStatus?.todayTopic || null, ownerStatus?.todayQuestion || null, sock, { onProgress: ownerOnProgress })
          .then((feedbackText) => {
            storeResult(ownerHash, feedbackText);
            const ownerChunks = chunkMessage(feedbackText);
            // Edit the progress message with the first chunk, send rest as new messages
            if (ownerProgressMsgKey && ownerChunks.length > 0) {
              sock.sendMessage(OWNER, {
                text: ownerChunks[0],
                edit: ownerProgressMsgKey,
              }).catch(() => safeSend(sock, OWNER, { text: ownerChunks[0] }));
              for (let i = 1; i < ownerChunks.length; i++) {
                safeSend(sock, OWNER, { text: ownerChunks[i] });
              }
            } else {
              sendChunks(sock, OWNER, ownerChunks);
            }
          })
          .catch((err) => {
            evict(ownerHash);
            console.log("❌ Owner test feedback error:", err.message);
            if (ownerProgressMsgKey) {
              sock.sendMessage(OWNER, {
                text: `❌ _Feedback failed: ${err.message}_`,
                edit: ownerProgressMsgKey,
              }).catch(() => safeSend(sock, OWNER, { text: `❌ Feedback failed: ${err.message}` }));
            } else {
              safeSend(sock, OWNER, { text: `❌ Feedback failed: ${err.message}` });
            }
          });
        return;
      }

      if (chatId !== TARGET_GROUP) {
        // ── Owner DM text commands ──────────────────────────────────────────
        if (isOwnerDM && !dmVideo) {
          const ownerCmd = text.trim().toLowerCase();
          console.log(`[OwnerDM] cmd="${ownerCmd}"`);

          // /genq [count] — generate AI questions
          // Examples: /genq  /genq 14  /genq 21
          if (ownerCmd.startsWith("/genq")) {
            const parts = ownerCmd.split(/\s+/);
            const count = parseInt(parts[1] ?? "7");
            const total = isNaN(count) || count <= 0 ? 7 : count;

            await safeSend(sock, OWNER, {
              text: `🤖 _Generating ${total} new questions… this may take 10-15 seconds._`,
            });

            try {
              const { inserted, skipped, totalInDb } = await generateAndInsertQuestions(total);

              let reply = `✅ *Questions Generated!*\n\n━━━━━━━━━━━━━━━\n`;
              reply += `📥 *Added:* ${inserted.length} new questions\n`;
              if (skipped.length > 0) reply += `⚠️ *Skipped:* ${skipped.length} (duplicates/invalid)\n`;
              reply += `📊 *Total in DB:* ${totalInDb}\n\n`;

              if (inserted.length > 0) {
                reply += `📋 *Preview:*\n`;
                inserted.slice(0, 5).forEach((q, i) => {
                  reply += `\n${i + 1}. [${q.category}]\n`;
                  reply += `   📌 ${q.topic}\n`;
                  reply += `   ❓ ${q.question}\n`;
                });
                if (inserted.length > 5) {
                  reply += `\n_...and ${inserted.length - 5} more_`;
                }
              }

              await safeSend(sock, OWNER, { text: reply });
            } catch (err) {
              console.log("❌ /genq error:", err.message);
              await safeSend(sock, OWNER, {
                text: `❌ *Question generation failed:*\n_${err.message}_`,
              });
            }
            return;
          }

          // /qcount — show how many questions are left in DB
          if (ownerCmd === "/qcount") {
            const count = await Question.countDocuments();
            await safeSend(sock, OWNER, {
              text: `📊 *Questions in DB:* ${count}\n\n💡 _Use /genq to add more._`,
            });
            return;
          }

          // /qlist — show all pending questions
          if (ownerCmd === "/qlist") {
            const qs = await Question.find().lean();
            if (qs.length === 0) {
              await safeSend(sock, OWNER, { text: `📭 No questions in DB. Use /genq to generate some.` });
              return;
            }
            let msg = `📋 *All Questions (${qs.length}):*\n━━━━━━━━━━━━━━━\n`;
            qs.forEach((q, i) => {
              msg += `\n${i + 1}. [${q.category}]\n📌 ${q.topic}\n❓ ${q.question}\n`;
            });
            const chunks = chunkMessage(msg);
            for (const chunk of chunks) {
              await safeSend(sock, OWNER, { text: chunk });
            }
            return;
          }

          // /humanizedb — rewrite all existing DB questions to sound human
          if (ownerCmd === "/humanizedb") {
            const total = await Question.countDocuments();
            if (total === 0) {
              await safeSend(sock, OWNER, { text: `📭 No questions in DB to humanize.` });
              return;
            }
            await safeSend(sock, OWNER, {
              text: `🤖 *Humanizing ${total} questions...*\n\n⏳ _Detecting AI patterns and rewriting. This may take a minute._`,
            });
            try {
              const { updated, skipped, total: tot } = await humanizeAllDbQuestions();
              await safeSend(sock, OWNER, {
                text: `✅ *Humanize Complete!*\n\n━━━━━━━━━━━━━━━\n✍️ *Rewritten:* ${updated}\n⏭️ *Already natural:* ${skipped}\n📊 *Total:* ${tot}`,
              });
            } catch (err) {
              await safeSend(sock, OWNER, { text: `❌ *Humanize failed:* _${err.message}_` });
            }
            return;
          }

          // /clearscore <phone> — clear all feedback scores for a user
          // Example: /clearscore 918848096746
          if (ownerCmd.startsWith("/clearscore")) {
            const parts = ownerCmd.split(/\s+/);
            const phone = parts[1]?.replace(/\D/g, "");
            if (!phone) {
              await safeSend(sock, OWNER, { text: `❌ Usage: /clearscore <phone>\nExample: /clearscore 918848096746` });
              return;
            }
            const target = await User.findOne({ userId: { $regex: phone } });
            if (!target) {
              await safeSend(sock, OWNER, { text: `❌ No user found with phone: ${phone}` });
              return;
            }
            await User.updateOne(
              { _id: target._id },
              { $set: { feedbackScores: [] } }
            );
            const name = target.name || phone;
            await safeSend(sock, OWNER, {
              text: `✅ *Scores cleared for ${name}*\n\n_Fluency, Grammar, Confidence, Vocabulary reset to —_`,
            });
            return;
          }
        }

        // ── Member DM commands (any user) ──────────────────────────────────
        const dmCmd = text.trim().toLowerCase();

        if (dmCmd === "/mystats") {
          const senderJid = msg.key.remoteJid; // in a DM, remoteJid is the sender
          const dbUser = await User.findOne({ userId: { $regex: senderJid.split("@")[0].split(":")[0] } });

          if (!dbUser) {
            return safeSend(sock, senderJid, {
              text: `❌ _You're not registered in the group yet. Join the group first!_`,
            });
          }

          const streak = dbUser.streak || 0;
          const streakBadge = streak >= 7 ? `🔥` : streak >= 3 ? `⚡` : `📅`;
          const totalFine = dbUser.fine || 0;
          const monthSubs = dbUser.monthlySubmissions || 0;
          const scores = dbUser.feedbackScores || [];

          // Compute averages from last 30 feedback entries
          let avgLine = `_No feedback scores yet — submit a video to get scored!_`;
          if (scores.length > 0) {
            const avg = (key) => {
              const vals = scores.map(s => s[key]).filter(v => v != null);
              return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
            };
            avgLine =
              `🗣️ *Fluency:*    ${avg("fluency")}/10\n` +
              `📚 *Grammar:*    ${avg("grammar")}/10\n` +
              `🔥 *Confidence:* ${avg("confidence")}/10\n` +
              `🧠 *Vocabulary:* ${avg("vocabulary")}/10\n` +
              `_(avg over last ${scores.length} submission${scores.length > 1 ? "s" : ""})_`;
          }

          const name = dbUser.name || senderJid.split("@")[0].split(":")[0];

          const statsMsg =
            `╔══════════════════╗\n` +
            `📊 *MY STATS*\n` +
            `╚══════════════════╝\n\n` +
            `👤 *${name}*\n` +
            `━━━━━━━━━━━━━━━\n` +
            `${streakBadge} *Current Streak:* ${streak} day${streak !== 1 ? "s" : ""}\n` +
            `💸 *Total Fine:* ₹${totalFine}\n` +
            `📅 *Submitted This Month:* ${monthSubs} day${monthSubs !== 1 ? "s" : ""}\n` +
            `📆 *Submitted This Week:* ${dbUser.weeklySubmissions || 0}/7 days\n` +
            `━━━━━━━━━━━━━━━\n` +
            `📈 *Avg Feedback Scores:*\n` +
            `${avgLine}\n` +
            `━━━━━━━━━━━━━━━\n` +
            `💪 _Keep submitting daily to improve your scores!_`;

          return safeSend(sock, senderJid, { text: statsMsg });
        }

        return;
      }

      const user = msg.key.participant || msg.key.remoteJid;
      if (!user) return;

      // For group messages, participant must be set � remoteJid is the group, not the sender
      // EXCEPT for fromMe messages (bot's own messages) where participant may not be set
      if (chatId.includes("@g.us") && !msg.key.participant && !msg.key.fromMe) return;

      // Skip if the apparent sender is the bot itself (can happen with forwarded messages)
      // EXCEPT for group commands (allow bot to respond to its own commands)
      const botPhone = sock.user?.id?.split(":")[0].split("@")[0] ?? "";
      const isBotSelfCommand = msg.key.fromMe && chatId.includes("@g.us") && text.startsWith("/");
      if (botPhone && user.includes(botPhone) && !isBotSelfCommand) return;

      // Normalize userId - resolve @lid to real @s.whatsapp.net JID via group metadata
      const normalizeUserId = (id) => {
        if (!id) return id;
        if (id.includes("@lid") || id.includes("@c.us")) {
          // Try to resolve via cached group metadata
          const phone = id.split("@")[0].split(":")[0];
          return `${phone}@s.whatsapp.net`;
        }
        return id;
      };

      // For @lid JIDs, resolve to real JID from group metadata
      let resolvedUser = user;
      if (user.includes("@lid")) {
        try {
          const meta = await sock.groupMetadata(chatId);
          const match = meta.participants.find(p =>
            p.id === user ||
            p.id.split("@")[0].split(":")[0] === user.split("@")[0].split(":")[0]
          );
          if (match) resolvedUser = match.id;
        } catch (_) {
          resolvedUser = normalizeUserId(user);
        }
      }

      const normalizedUser = normalizeUserId(resolvedUser);

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
        const pMap = await getParticipantMap(sock, chatId);

        let totalFine = 0;
        let msgText = `╔══════════════════╗\n💰 *FINE REPORT*\n╚══════════════════╝\n\n📋 *Individual Fines:*\n━━━━━━━━━━━━━━━\n`;

        uniqueUsers.forEach((u) => {
          const fine = u.fine || 0;
          totalFine += fine;
          const phone = u.userId.split("@")[0].split(":")[0];
          msgText += `▪️ @${phone} → ₹${fine}\n`;
        });

        msgText += `\n━━━━━━━━━━━━━━━\n💵 *Total Fine Pool:* ₹${totalFine}\n\n⚠️ _Missed daily submissions result in fines._\n🔥 _Stay consistent. Avoid penalties._\n`;

        return safeSend(sock, chatId, {
          text: msgText,
          mentions: uniqueUsers.map(u => resolveJid(u.userId, pMap)),
        });
      }

      // 🏆 LEADERBOARD
      if (cmd.startsWith("/leaderboard")) {
        const users = await User.find();
        const pMap = await getParticipantMap(sock, chatId);
        let msgText = `╔══════════════════╗\n🏆  *LEADERBOARD*\n╚══════════════════╝\n\n`;

        users
          .filter((u) => u.userId)
          .sort((a, b) => b.completed - a.completed)
          .forEach((u, i) => {
            const medal = ["🥇", "🥈", "🥉"][i] || "🔹";
            const phone = u.userId.split("@")[0].split(":")[0];
            msgText += `${medal} @${phone} → ${u.completed ? "✅ Done" : "❌ Pending"}\n`;
          });
        msgText += `\n━━━━━━━━━━━━━━━\n🔥 _Keep grinding — consistency wins!_`;

        return safeSend(sock, chatId, {
          text: msgText,
          mentions: users.filter(u => u.userId).map(u => resolveJid(u.userId, pMap)),
        });
      }

      // 📊 STREAK REPORT
      if (cmd.startsWith("/report")) {
        const botJid = sock.user?.id?.replace(/:.*@/, "@") ?? "";
        const users = await User.find({ userId: { $exists: true, $nin: [null, ""] } });

        // Filter out the bot itself
        const members = users.filter(u => u.userId && !u.userId.includes(botJid.split("@")[0]));

        // Get actual participant JIDs from group metadata for correct mention resolution
        let participantMap = {}; // phone → actual JID
        try {
          const meta = await sock.groupMetadata(chatId);
          for (const p of meta.participants) {
            const phone = p.id.split("@")[0].split(":")[0];
            participantMap[phone] = p.id;
          }
        } catch (_) { }

        // Sort by streak descending, then by fine ascending
        const sorted = [...members].sort((a, b) => {
          if ((b.streak || 0) !== (a.streak || 0)) return (b.streak || 0) - (a.streak || 0);
          return (a.fine || 0) - (b.fine || 0);
        });

        let msgText = `╔══════════════════╗\n📊 *STREAK REPORT*\n╚══════════════════╝\n\n`;

        const mentionJids = [];
        sorted.filter(u => u.userId).forEach((u) => {
          const phone = u.userId.split("@")[0].split(":")[0];
          const actualJid = participantMap[phone] || u.userId;
          mentionJids.push(actualJid);

          const streak = u.streak || 0;
          const streakBadge = streak >= 7 ? `🔥` : streak >= 3 ? `⚡` : `📅`;
          const fine = u.fine || 0;
          const status = u.completed ? `✅` : `❌`;
          msgText += `${status} @${phone}\n`;
          msgText += `   ${streakBadge} *${streak} day streak*  |  💸 Fine: ₹${fine}\n\n`;
        });

        msgText += `━━━━━━━━━━━━━━━\n`;
        msgText += `📅 1-2 days  ⚡ 3-6 days  🔥 7+ days\n`;
        msgText += `🎁 _Every 7-day streak = ₹5 fine removed!_`;

        const chunks = chunkMessage(msgText);
        for (const chunk of chunks) {
          await safeSend(sock, chatId, {
            text: chunk,
            mentions: mentionJids,
          });
        }
        return;
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
          const phone = userId.split("@")[0].split(":")[0];
          results.push(`@${phone} → +₹${amount}`);
        }

        return safeSend(sock, chatId, {
          text: `💸 *Fine Added!*\n\n━━━━━━━━━━━━━━━\n${results.join("\n")}\n\n✅ Fines updated successfully.`,
          mentions: userAmounts.map(ua => ua.userId), // mentionedJid from WhatsApp = already correct JID
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
          const normalizedId = normalizeUserId(userId);
          const u = await User.findOne({ userId: normalizedId });
          if (!u) continue;
          const newFine = Math.max(0, (u.fine || 0) - amount);
          await User.updateOne({ userId: normalizedId }, { fine: newFine });
          const phone = normalizedId.split("@")[0].split(":")[0];
          results.push(`@${phone} → -₹${amount} (₹${newFine} remaining)`);
        }

        if (!results.length) {
          return safeSend(sock, chatId, { text: `❌ No users found.` });
        }

        return safeSend(sock, chatId, {
          text: `💰 *Fine Removed!*\n\n━━━━━━━━━━━━━━━\n${results.join("\n")}\n\n✅ Fines updated successfully.`,
          mentions: userAmounts.map(ua => ua.userId), // mentionedJid from WhatsApp = already correct JID
        });
      }

      // 🧹 CLEAR SCORE (Admin only) — /clearscore @user or /clearscore @user1 @user2
      if (cmd.startsWith("/clearscore")) {
        if (!isAdmin) {
          return safeSend(sock, chatId, {
            text: `❌ *Access Denied*\n_Only admins can use this command._`,
          });
        }

        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

        // No mention = clear own scores
        const targets = mentioned.length > 0 ? mentioned : [normalizedUser];

        // Resolve actual group JIDs for proper tappable mentions
        const pMap = await getParticipantMap(sock, chatId);

        const results = [];
        const mentionJids = [];
        for (const userId of targets) {
          const phone = userId.split("@")[0].split(":")[0];
          const actualJid = pMap[phone] || `${phone}@s.whatsapp.net`;
          mentionJids.push(actualJid);

          const u = await User.findOne({ userId: { $regex: phone } });
          if (!u) {
            results.push(`@${phone} → ❌ not found`);
            continue;
          }
          await User.updateOne({ _id: u._id }, { $set: { feedbackScores: [] } });
          results.push(`@${phone} → ✅ scores cleared`);
        }

        return safeSend(sock, chatId, {
          text: `🧹 *Score Reset*\n\n━━━━━━━━━━━━━━━\n${results.join("\n")}\n\n_Fluency, Grammar, Confidence & Vocabulary history removed._`,
          mentions: mentionJids,
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
          mentions: users.filter(u => u.userId).map(u => {
            const phone = u.userId.split("@")[0].split(":")[0];
            return `${phone}@s.whatsapp.net`;
          }),
        });
      }

      // 🤖 GENERATE QUESTIONS (Admin only)
      if (cmd.startsWith("/genq")) {
        if (!isAdmin) return safeSend(sock, chatId, { text: `❌ *Access Denied*\n_Only admins can use this command._` });

        const parts = cmd.split(/\s+/);
        const count = parseInt(parts[1] ?? "7");
        const total = isNaN(count) || count <= 0 ? 7 : count;

        await safeSend(sock, chatId, { text: `🤖 _Generating ${total} new questions… please wait._` });

        try {
          const { inserted, skipped, totalInDb } = await generateAndInsertQuestions(total);

          let reply = `✅ *Questions Generated!*\n\n━━━━━━━━━━━━━━━\n`;
          reply += `📥 *Added:* ${inserted.length} new questions\n`;
          if (skipped.length > 0) reply += `⚠️ *Skipped:* ${skipped.length} (duplicates)\n`;
          reply += `📊 *Total in DB:* ${totalInDb}\n`;

          return safeSend(sock, chatId, { text: reply });
        } catch (err) {
          console.log("❌ /genq error:", err.message);
          return safeSend(sock, chatId, { text: `❌ *Generation failed:* _${err.message}_` });
        }
      }

      // 📊 QUESTION COUNT (Admin only)
      if (cmd === "/qcount") {
        if (!isAdmin) return safeSend(sock, chatId, { text: `❌ *Access Denied*\n_Only admins can use this command._` });

        const qCount = await Question.countDocuments();
        return safeSend(sock, chatId, {
          text: `📊 *Questions in DB:* ${qCount}\n\n💡 _Use /genq [count] to add more._`,
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
            } catch (_) { }
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
        const userRecord = await User.findOne({ userId: dbUser });
        const senderPhone = dbUser.split("@")[0].split(":")[0];

        // Find the exact participant JID from already-fetched groupMeta
        // groupMeta.participants contains the real JIDs (including device suffix like :10@s.whatsapp.net)
        const senderParticipant = groupMeta.participants.find(
          p => p.id.split("@")[0].split(":")[0] === senderPhone
        );
        const actualUserJid = senderParticipant?.id || `${senderPhone}@s.whatsapp.net`;

        // For DM: use the full JID as-is from group metadata (includes device suffix)
        // This is the only JID WhatsApp will actually deliver a DM to
        const dmJid = actualUserJid;

        if (!userRecord) {
          return safeSend(sock, chatId, {
            text: `❌ @${senderPhone} _You're not registered yet._`,
            mentions: [actualUserJid],
          });
        }

        const streak = userRecord.streak || 0;
        const streakBadge = streak >= 7 ? `🔥` : streak >= 3 ? `⚡` : `📅`;
        const totalFine = userRecord.fine || 0;
        const monthSubs = userRecord.monthlySubmissions || 0;
        const scores = userRecord.feedbackScores || [];

        let avgLine = `_No feedback scores yet — submit a video to get scored!_`;
        if (scores.length > 0) {
          const avg = (key) => {
            const vals = scores.map(s => s[key]).filter(v => v != null);
            return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
          };
          avgLine =
            `🗣️ *Fluency:*    ${avg("fluency")}/10\n` +
            `📚 *Grammar:*    ${avg("grammar")}/10\n` +
            `🔥 *Confidence:* ${avg("confidence")}/10\n` +
            `🧠 *Vocabulary:* ${avg("vocabulary")}/10\n` +
            `_(avg over last ${scores.length} submission${scores.length > 1 ? "s" : ""})_`;
        }

        const name = userRecord.name || senderPhone;

        const statsMsg =
          `╔══════════════════╗\n` +
          `📊 *MY STATS*\n` +
          `╚══════════════════╝\n\n` +
          `👤 *${name}*\n` +
          `━━━━━━━━━━━━━━━\n` +
          `${streakBadge} *Current Streak:* ${streak} day${streak !== 1 ? "s" : ""}\n` +
          `💸 *Total Fine:* ₹${totalFine}\n` +
          `📅 *Submitted This Month:* ${monthSubs} day${monthSubs !== 1 ? "s" : ""}\n` +
          `📆 *Submitted This Week:* ${userRecord.weeklySubmissions || 0}/7 days\n` +
          `━━━━━━━━━━━━━━━\n` +
          `📈 *Avg Feedback Scores:*\n` +
          `${avgLine}\n` +
          `━━━━━━━━━━━━━━━\n` +
          `💪 _Keep submitting daily to improve your scores!_`;

        // Send full stats privately to the user's DM
        console.log(`[/mystats] Sending DM to: ${dmJid} (actualUserJid: ${actualUserJid})`);
        const dmSent = await safeSend(sock, dmJid, { text: statsMsg });
        console.log(`[/mystats] DM sent result: ${dmSent}`);

        if (!dmSent) {
          // DM failed — send stats in group as a reply instead
          console.log(`[/mystats] DM failed, sending in group as fallback`);
          await safeSend(sock, chatId, { text: statsMsg, mentions: [actualUserJid] });
          return safeSend(sock, chatId, {
            text: `⚠️ @${senderPhone} _Couldn't send to your DM. Stats posted above — only you can see the details._`,
            mentions: [actualUserJid],
          });
        }

        // Acknowledge in group with proper tappable mention
        return safeSend(sock, chatId, {
          text: `📊 @${senderPhone} _Your stats have been sent to your DM!_ 👆`,
          mentions: [actualUserJid],
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
          { completed: true, $inc: { weeklySubmissions: 1 } },
          { upsert: true },
        );

        // Save push name on upsert too (new user submitting first video)
        if (pushName) {
          await User.updateOne({ userId: dbUser }, { $set: { name: pushName } });
        }

        const userPhone = dbUser.split("@")[0].split(":")[0];

        // Get actual group JID for proper tappable mention
        let actualUserJid = dbUser;
        try {
          const meta = await sock.groupMetadata(chatId);
          const participant = meta.participants.find(p =>
            p.id.split("@")[0].split(":")[0] === userPhone
          );
          if (participant) actualUserJid = participant.id;
        } catch (_) { }

        await safeSend(sock, chatId, {
          text: `🔥 *Great work, @${userPhone}!*\n\n✅ Submission received!\n\n💪 _Keep showing up every day — consistency is what separates the best from the rest. You're on the right track!_ 🚀`,
          mentions: [actualUserJid],
        });

        // Fetch today's topic for AI relevance check
        const todayStatus = await getStatus();

        // Compute content hash for dedup — include sender so forwarded videos
        // (same fileSha256, different sender) are treated as separate submissions.
        const hash = hashBuffer(Buffer.from(`${dbUser}:${video.fileSha256 || video.mediaKey || msg.key.id}`));
        const cacheEntry = await getCacheEntry(hash);

        if (cacheEntry === 'processing') {
          await safeSend(sock, chatId, {
            text: `⏳ _Your video is already being processed! Please wait._`,
            mentions: [actualUserJid],
          });
          return;
        }

        if (typeof cacheEntry === 'string') {
          const cachedChunks = chunkMessage(cacheEntry);
          await sendChunks(sock, chatId, cachedChunks, [actualUserJid]);
          return;
        }

        await markProcessing(hash);

        // Send initial progress message and capture its key
        const progressSent = await sock.sendMessage(chatId, {
          text: `⏳ _Analysing your video, @${userPhone}..._`,
          mentions: [actualUserJid],
        });
        const progressMsgKey = progressSent?.key;

        const onProgress = async (stage) => {
          if (!progressMsgKey) return;
          try {
            await sock.sendMessage(chatId, {
              text: `⏳ _${stage}_`,
              edit: progressMsgKey,
            });
          } catch (_) { }
        };

        // 🤖 AI Feedback (runs async, won't block submission)
        generateFeedback(msg, dbUser, video.seconds || 60, todayStatus?.todayTopic || null, todayStatus?.todayQuestion || null, sock, { onProgress, displayName: userPhone })
          .then((feedbackText) => {
            storeResult(hash, feedbackText);

            // 💾 Parse & save feedback scores for /mystats
            const scores = parseFeedbackScores(feedbackText);
            if (scores) {
              User.updateOne(
                { userId: dbUser },
                {
                  $push: { feedbackScores: { $each: [{ ...scores, date: new Date() }], $slice: -30 } },
                  $inc: { monthlySubmissions: 1 },
                }
              ).catch(() => { });
            }

            const chunks = chunkMessage(feedbackText);
            // Edit the progress message with the first chunk, send rest as new messages
            if (progressMsgKey && chunks.length > 0) {
              sock.sendMessage(chatId, {
                text: chunks[0],
                edit: progressMsgKey,
              }).catch(() => safeSend(sock, chatId, { text: chunks[0], mentions: [actualUserJid] }));
              for (let i = 1; i < chunks.length; i++) {
                safeSend(sock, chatId, { text: chunks[i], mentions: [actualUserJid] });
              }
            } else {
              sendChunks(sock, chatId, chunks, [actualUserJid]);
            }
          })
          .catch((err) => {
            evict(hash);
            console.log("❌ Feedback error:", err.message);
            const errMsg = `⚠️ _Feedback unavailable: ${err.message}_`;
            if (progressMsgKey) {
              sock.sendMessage(chatId, {
                text: errMsg,
                edit: progressMsgKey,
              }).catch(() => safeSend(sock, chatId, { text: errMsg, mentions: [actualUserJid] }));
            } else {
              safeSend(sock, chatId, { text: errMsg, mentions: [actualUserJid] });
            }
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
  if (!cronsRegistered) {
    cronsRegistered = true;
    console.log("⏰ Registering cron jobs...");

    cron.schedule("30 7 * * *", sendGoodMorning, { timezone: TIMEZONE });

    // First attempt at 8:00 AM sharp
    cron.schedule("0 8 * * *", sendQuestion, { timezone: TIMEZONE });

    // Retry every 2 min from 8:02 to 8:30 in case first attempt failed
    cron.schedule(
      "*/2 8 * * *",
      async () => {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
        const minutes = now.getMinutes();
        if (minutes < 5 || minutes > 30) return; // only retry 8:05–9:30
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

    cron.schedule("5 0 * * *", dailyReset, { timezone: TIMEZONE });

    cron.schedule("0 21 * * 0", weeklySummary, { timezone: TIMEZONE });

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

    console.log("✅ All cron jobs registered (7:30 GM, 8:00, 8:05-8:30, 15:00, 21:00, 22:30, 23:30, 00:00, 00:05, Sun 21:00)");
  } // end cronsRegistered guard

  // ================= CONNECTION =================
  let reconnecting = false;

  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "open") {
      const wasReconnecting = reconnecting;
      reconnecting = false;
      console.log("✅ Connected");

      // Start DB health check on first connect only
      if (!global._dbHealthStarted) {
        global._dbHealthStarted = true;
        startDBHealthCheck((text) => safeSend(sock, OWNER, { text }));
        console.log("💚 DB health check started (every 5 min)");
      }

      // On reconnect, notify owner that any videos sent during downtime were missed
      if (wasReconnecting) {
        safeSend(sock, OWNER, {
          text: `🔄 *Bot reconnected!*\n\n⚠️ _Any videos sent while the bot was offline were NOT processed._\n\n📹 _Ask members who sent videos during downtime to resend them._`,
        });
      }
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

      if (reconnecting) return; // prevent stacking multiple reconnect timers
      reconnecting = true;
      console.log(`⚠️ Disconnected (code: ${code}), reconnecting in 5s...`);
      setTimeout(startBot, 5000);
    }
  });
}

startBot();
