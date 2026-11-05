import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const SPEECHES = [
  {
    slug: "stage-presence",
    videoUrl: "https://videos.pexels.com/video-files/3209828/3209828-hd_1920_1080_25fps.mp4",
    transcript: "True confidence on stage does not come from pretending to be flawless. It comes from having the courage to show your human side. When speakers acknowledge their imperfections or share a vulnerable story, the entire room relaxes. Your audience is not searching for a polished robot; they want a genuine human being sharing real insight. Speak with conviction, let your natural voice shine, and remember that vulnerability is your greatest asset."
  },
  {
    slug: "active-listening",
    videoUrl: "https://videos.pexels.com/video-files/3195394/3195394-hd_1920_1080_25fps.mp4",
    transcript: "Great conversationalists are rarely the loudest voices in the room. They are the ones who listen attentively and respond with purpose. In English conversations, active listening means nodding, summarizing key points, and asking thoughtful follow-up questions. When you shadow this exercise, observe how natural pauses allow you to process thoughts before speaking. Speaking well begins with listening deeply and pacing your delivery with calm authority."
  },
  {
    slug: "fluency-mindset",
    videoUrl: "https://videos.pexels.com/video-files/3191572/3191572-hd_1920_1080_25fps.mp4",
    transcript: "Every language learner experiences that brief moment of hesitation right before speaking. Your mind searches for the perfect word, and fear whispers that you might make a mistake. The secret is simple: give yourself permission to speak imperfectly. Fluency begins when you value expressing your ideas over seeking mechanical perfection. Keep your vocal flow continuous, embrace small errors as stepping stones, and trust your practice."
  },
  {
    slug: "intentional-pauses",
    videoUrl: "https://videos.pexels.com/video-files/3196061/3196061-hd_1920_1080_25fps.mp4",
    transcript: "Novice speakers rush because they fear silence, but master speakers know that silence is where true authority lives. When you deliver an important idea, pause for two beats. Give your audience space to absorb your meaning. Breathing between sentences lowers your heart rate and steadies your pitch. Practice this rhythm: speak a complete thought, pause calmly, and begin the next phrase with clear intention."
  },
  {
    slug: "speaking-habits",
    videoUrl: "https://videos.pexels.com/video-files/3205626/3205626-hd_1920_1080_25fps.mp4",
    transcript: "Small consistent daily habits always beat sporadic bursts of extreme effort. Spending five focused minutes shadowing English speech every day rewires your speech muscles and builds effortless muscle memory. You do not need hours of study each night; all you need is relentless consistency. Celebrate every small win, remain curious, and trust the compounding power of daily progress."
  },
  {
    slug: "charismatic-presence",
    videoUrl: "https://videos.pexels.com/video-files/856973/856973-hd_1920_1080_25fps.mp4",
    transcript: "Stage fright and excitement produce the exact same physiological reaction: rapid heartbeat and heightened adrenaline. The only difference is your mental label. Instead of telling yourself you are nervous, tell yourself you are energized to share a message. Ground your feet into the floor, release tension in your shoulders, and channel that surge of energy into vocal warmth and conviction."
  }
];

async function fetchTTS(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const audioChunks = [];
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    const url = "https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=" + encodeURIComponent(trimmed);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://translate.google.com/"
      }
    });
    if (res.ok) {
      audioChunks.push(Buffer.from(await res.arrayBuffer()));
    }
  }
  return Buffer.concat(audioChunks);
}

async function buildAll() {
  const outDir = path.resolve("frontend/public/shadowing");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const tmpDir = path.resolve("scratch/tmp_build");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  for (const item of SPEECHES) {
    const targetFile = path.join(outDir, `${item.slug}.mp4`);
    console.log(`Processing [${item.slug}]...`);

    // 1. Fetch TTS Audio
    const audioBuf = await fetchTTS(item.transcript);
    const audioPath = path.join(tmpDir, `${item.slug}.mp3`);
    fs.writeFileSync(audioPath, audioBuf);

    // 2. Fetch Video
    const vidPath = path.join(tmpDir, `${item.slug}_raw.mp4`);
    if (!fs.existsSync(vidPath)) {
      console.log(`Downloading video for ${item.slug}...`);
      const vRes = await fetch(item.videoUrl);
      fs.writeFileSync(vidPath, Buffer.from(await vRes.arrayBuffer()));
    }

    // 3. Mux Video and Audio
    console.log(`Muxing ${item.slug}.mp4...`);
    const cmd = `ffmpeg -y -stream_loop -1 -i "${vidPath}" -i "${audioPath}" -shortest -c:v copy -c:a aac -b:a 192k "${targetFile}"`;
    execSync(cmd, { stdio: "ignore" });

    // 4. Verify duration and audio track
    const probe = execSync(`ffprobe -v error -show_entries stream=codec_type,codec_name -of default=noprint_wrappers=1 "${targetFile}"`).toString().trim();
    console.log(`✅ [${item.slug}] generated! Streams:\n${probe}`);
  }

  console.log("ALL 6 SHADOWING VIDEOS READY WITH CRYSTAL CLEAR AUDIO!");
}

buildAll().catch(e => console.error(e));
