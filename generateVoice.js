import googleTTS from "google-tts-api";
import fs from "fs";
import https from "https";

export default async function generateVoice(text, filePath) {
  const url = googleTTS.getAudioUrl(text, {
    lang: "en",
    slow: false,
    host: "https://translate.google.com",
  });

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error("Failed to fetch audio"));
        return;
      }

      response.pipe(file);

      file.on("finish", () => {
        file.close(() => {
          resolve(true); // ✅ resolve only after file fully ready
        });
      });

      file.on("error", (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    }).on("error", (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}