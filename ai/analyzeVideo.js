import { exec } from "child_process";
import fs from "fs";
import fetch from "node-fetch";

function getVideoDuration(videoPath) {
  return new Promise((resolve) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      (err, stdout) => {
        if (err) { console.log("ffprobe error:", err.message); return resolve(60); }
        const dur = parseFloat((stdout || "").trim());
        console.log(`Video duration: ${dur}s`);
        resolve(isNaN(dur) || dur <= 0 ? 60 : dur);
      }
    );
  });
}

function extractFrame(videoPath, timestamp) {
  return new Promise((resolve) => {
    const framePath = `${videoPath}_frame_${timestamp}.jpg`;
    exec(
      `ffmpeg -ss ${timestamp} -i "${videoPath}" -frames:v 1 -q:v 3 -vf "scale=640:-1" "${framePath}" -y`,
      (err) => {
        if (err) { return resolve(null); }
        if (!fs.existsSync(framePath)) { return resolve(null); }
        try {
          const buffer = fs.readFileSync(framePath);
          fs.unlinkSync(framePath);
          if (buffer.length < 1000) { return resolve(null); }
          resolve(buffer.toString("base64"));
        } catch (e) { console.log(`Frame read error:`, e.message); resolve(null); }
      }
    );
  });
}

async function extractFrames(videoPath, frameCount = 3) {
  if (!fs.existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);
  const duration = await getVideoDuration(videoPath);
  const timestamps = [];
  for (let i = 1; i <= frameCount; i++) {
    timestamps.push(Math.max(1, Math.floor((duration * i) / (frameCount + 1))));
  }
  const results = await Promise.all(timestamps.map((ts) => extractFrame(videoPath, ts)));
  return results.filter(Boolean);
}

export async function analyzeVideo(videoPath) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) { console.log("GROQ_API_KEY not set"); return null; }

  let frames = [];
  try { frames = await extractFrames(videoPath, 3); }
  catch (err) { console.log("Visual frame extraction error:", err.message); return null; }
  if (frames.length === 0) { console.log("No frames extracted"); return null; }

  const prompt = `You are an expert public speaking coach analyzing video frames of a student giving a spoken English presentation.
Analyze these ${frames.length} frame(s) and evaluate non-verbal communication.
Return ONLY valid JSON (no markdown, no extra text):
{"eyeContact":<1-10>,"bodyLanguage":<1-10>,"facialExpression":<1-10>,"overallPresence":<1-10>,"eyeContactNote":"<observation>","bodyLanguageNote":"<observation>","expressionNote":"<observation>","visualSuggestions":["<tip>","<tip>"],"visualStrengths":["<positive>"]}`;

  const userContent = [
    { type: "text", text: prompt },
    ...frames.map((b64) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } })),
  ];

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: userContent }],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });
    if (!res.ok) { const e = await res.text(); console.log(`Groq Vision HTTP ${res.status}:`, e.slice(0,300)); return null; }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) { console.log("Groq vision returned no text"); return null; }
    console.log("Groq vision raw:", raw.slice(0, 300));
    let jsonStr = raw;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) { jsonStr = fence[1].trim(); }
    else { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); if (s !== -1 && e !== -1) jsonStr = raw.slice(s, e+1); }
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      // Response was truncated — extract numeric scores via regex as fallback
      console.log("JSON parse failed, attempting partial extraction:", parseErr.message);
      const extract = (key) => { const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`)); return m ? parseInt(m[1]) : null; };
      const eyeContact = extract("eyeContact");
      const bodyLanguage = extract("bodyLanguage");
      const facialExpression = extract("facialExpression");
      const overallPresence = extract("overallPresence");
      if (eyeContact === null && bodyLanguage === null) throw parseErr; // nothing salvageable
      parsed = { eyeContact, bodyLanguage, facialExpression, overallPresence,
        eyeContactNote: "Analysis partially available.", bodyLanguageNote: "Analysis partially available.",
        expressionNote: "Analysis partially available.", visualSuggestions: [], visualStrengths: [] };
      console.log("Partial visual data recovered:", JSON.stringify(parsed));
    }
    console.log("Visual analysis complete:", JSON.stringify(parsed).slice(0,150));
    return parsed;
  } catch (err) { console.log("Visual analysis failed:", err.message); return null; }
}
