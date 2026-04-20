import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";

export async function downloadVideo(msg, id, sock = null) {
  // Pass sock so Baileys can re-fetch media keys if needed
  // This fixes "Waiting for this message" errors on view-once / ephemeral videos
  const options = sock
    ? { logger: console, reuploadRequest: sock.updateMediaMessage }
    : {};

  const buffer = await downloadMediaMessage(msg, "buffer", {}, options);
  const filePath = path.resolve(`./tmp/video_${id}.mp4`);
  fs.mkdirSync("./tmp", { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
