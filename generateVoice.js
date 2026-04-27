import fs from "fs";
import https from "https";

export default async function generateVoice(text, filePath) {
  const encodedText = encodeURIComponent(text);

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en&client=tw-ob`;

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error("Failed to fetch audio"));
          return;
        }

        res.pipe(file);

        file.on("finish", () => {
          file.close(() => resolve(true));
        });

        file.on("error", (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      },
    );

    // ⏱ timeout (30 sec - increased for slow networks)
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error("TTS request timeout after 30s"));
    });

    request.on("error", (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}
