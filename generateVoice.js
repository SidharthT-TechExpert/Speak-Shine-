import fs from "fs";
import https from "https";

export default async function generateVoice(text, filePath) {
  const encodedText = encodeURIComponent(text);

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en&client=tw-ob`;

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (res) => {
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
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
  });
}
