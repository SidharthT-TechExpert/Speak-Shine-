import { getAudioUrl } from "google-tts-api";
import fs from "fs";
import https from "https";
import { finished } from "stream/promises";

export default async function generateVoice(text, filePath) {
  // Caution: text must be under 200 characters for this specific method
  const url = getAudioUrl(text, {
    lang: "en",
    slow: false,
    host: "https://translate.google.com",
  });

  const file = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    https
      .get(url, async (response) => {
        if (response.statusCode !== 200) {
          file.destroy();
          fs.unlink(filePath, () => {});
          return reject(
            new Error(`Failed to fetch audio: ${response.statusCode}`),
          );
        }

        response.pipe(file);

        try {
          await finished(file);
          resolve(true);
        } catch (err) {
          fs.unlink(filePath, () => {});
          reject(err);
        }
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
  });
}
