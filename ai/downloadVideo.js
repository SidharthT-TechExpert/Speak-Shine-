import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";

export async function downloadVideo(msg, id, sock = null) {
  // Pass sock so Baileys can re-fetch media keys if needed
  // This fixes "Waiting for this message" errors on view-once / ephemeral videos
  const options = sock
    ? { logger: console, reuploadRequest: sock.updateMediaMessage }
    : {};

  // Determine media type — documentMessage needs "document" type, others use "video"
  const isDocument = !!msg.message?.documentMessage;
  const mediaType = isDocument ? "document" : "video";

  const buffer = await downloadMediaMessage(msg, "buffer", {}, options);
  const ext = isDocument ? (getDocExt(msg.message.documentMessage.fileName) || "mp4") : "mp4";
  const filePath = path.resolve(`./tmp/video_${id}.${ext}`);
  fs.mkdirSync("./tmp", { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function getDocExt(fileName) {
  if (!fileName) return "mp4";
  const match = fileName.match(/\.(\w+)$/);
  return match ? match[1].toLowerCase() : "mp4";
}
