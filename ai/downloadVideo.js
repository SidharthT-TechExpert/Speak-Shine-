import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

export async function downloadVideo(msg, id, sock = null) {
  // Pass sock so Baileys can re-fetch media keys if needed
  const options = sock
    ? { logger: console, reuploadRequest: sock.updateMediaMessage }
    : {};

  const isDocument = !!msg.message?.documentMessage;
  const mediaType = isDocument ? "document" : "video";
  const ext = isDocument ? (getDocExt(msg.message.documentMessage.fileName) || "mp4") : "mp4";
  const filePath = path.resolve(`./tmp/video_${id}.${ext}`);
  fs.mkdirSync("./tmp", { recursive: true });

  // Stream directly to disk — avoids loading the entire file into memory
  const stream = await downloadMediaMessage(msg, "stream", {}, options);
  await pipeline(stream, fs.createWriteStream(filePath));

  return filePath;
}

function getDocExt(fileName) {
  if (!fileName) return "mp4";
  const match = fileName.match(/\.(\w+)$/);
  return match ? match[1].toLowerCase() : "mp4";
}
