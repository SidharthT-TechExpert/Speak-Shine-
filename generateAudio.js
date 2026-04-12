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

    https
      .get(url, (response) => {
        response.pipe(file);

        file.on("finish", () => {
          file.close(() => {
            // ✅ wait properly
            setTimeout(resolve, 500);
          });
        });
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
  });
}
