import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const TARGET_GROUP = process.env.TARGET_GROUP;
const TEST_MODE = process.env.TEST_MODE === "true";

// 🧠 Store users
let allUsers = new Set();       // all group members
let completedUsers = new Set(); // submitted users

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    syncFullHistory: true,
  });

  sock.ev.on("creds.update", saveCreds);

  // 📩 MESSAGE HANDLER (ONLY MARK COMPLETE)
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const chatId = msg.key.remoteJid;
    if (chatId !== TARGET_GROUP) return;

    if (!msg.key.participant) return;

    const user = msg.key.participant;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text;

    // 🎥 mark completed
    if (msg.message.videoMessage || text?.toLowerCase().includes("#done132")) {
      completedUsers.add(user);

      await sock.sendMessage(chatId, {
        text: `✅ @${user.split("@")[0]} completed task`,
        mentions: [user],
      });
    }
  });

  // ⏰ REPORT SYSTEM
  cron.schedule(TEST_MODE ? "* * * * *" : "0 12 * * *", async () => {
    console.log("📊 Generating report...");

    if (allUsers.size === 0) {
      await sock.sendMessage(TARGET_GROUP, {
        text: "⚠️ No users loaded yet.",
      });
      return;
    }

    const notDone = [...allUsers].filter(
      (user) => !completedUsers.has(user)
    );

    if (notDone.length === 0) {
      await sock.sendMessage(TARGET_GROUP, {
        text: "🎉 Everyone completed today's task! 🔥",
      });
    } else {
      let message = "❌ *Not completed today's task:*\n\n";

      notDone.forEach((user) => {
        message += `@${user.split("@")[0]}\n`;
      });

      message += "\n💰 ₹2 fine applied";

      await sock.sendMessage(TARGET_GROUP, {
        text: message,
        mentions: notDone,
      });
    }

    // 🔄 RESET AFTER REPORT
    completedUsers.clear();
  });

  // 🔗 CONNECTION + LOAD MEMBERS
  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("📱 Scan QR below:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Bot connected!");

      // 🔥 LOAD ALL GROUP MEMBERS
      const meta = await sock.groupMetadata(TARGET_GROUP);

      const myId = sock.user.id;

      allUsers = new Set(
        meta.participants
          .map((p) => p.id)
          .filter((id) => id !== myId) // remove yourself
      );

      console.log("👥 Total members:", allUsers.size);
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (reason !== DisconnectReason.loggedOut) {
        startBot();
      }
    }
  });
}

startBot();