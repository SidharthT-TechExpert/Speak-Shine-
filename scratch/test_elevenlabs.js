import dotenv from "dotenv";
dotenv.config();

import fetch from "node-fetch";

const key = process.env.ELEVENLABS_API_KEY || (process.env.ELEVENLABS_API_KEYS?.split(",")[0]);
console.log("Using key:", key?.slice(0, 10) + "...");

async function testVoice(voiceId, voiceName) {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text: "Hello, this is a quick test.",
        model_id: "eleven_multilingual_v2"
      })
    });
    console.log(`Voice ${voiceName} (${voiceId}): status = ${res.status}`);
    if (!res.ok) {
      console.log("  Error:", (await res.text()).slice(0, 200));
    } else {
      const buf = await res.arrayBuffer();
      console.log("  Success! Received bytes:", buf.byteLength);
    }
  } catch (err) {
    console.log(`Voice ${voiceName} error:`, err.message);
  }
}

async function run() {
  await testVoice("pNInz6obpgDQGcFmaJgB", "Adam");
  await testVoice("21m00Tcm4TlvDq8ikWAM", "Rachel");
}

run();
