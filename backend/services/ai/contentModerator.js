/**
 * contentModerator.js — AI-based content moderation for videos
 * Detects inappropriate content using frame analysis
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import Groq from "groq-sdk";

const execFileAsync = promisify(execFile);

let groq = null;

function getGroqClient() {
  if (!groq && process.env.GROQ_API_KEY) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groq;
}

/**
 * Extract frames from video for content analysis
 * @param {string} videoPath - Path to video file
 * @param {number} numFrames - Number of frames to extract (default: 5)
 * @returns {Promise<string[]>} - Array of frame file paths
 */
async function extractFrames(videoPath, numFrames = 5) {
  const tempDir = './tmp/moderation';
  fs.mkdirSync(tempDir, { recursive: true });
  
  const framePattern = path.join(tempDir, `frame-${Date.now()}-%03d.jpg`);
  
  try {
    // Extract frames at regular intervals
    // -vf fps=1/N extracts 1 frame every N seconds
    await execFileAsync('ffmpeg', [
      '-i', videoPath,
      '-vf', `select='not(mod(n\\,${Math.floor(100/numFrames)}))'`,
      '-vsync', 'vfr',
      '-frames:v', String(numFrames),
      '-q:v', '2', // High quality
      framePattern,
      '-y'
    ], { timeout: 30000 });

    // Get list of extracted frames
    const files = fs.readdirSync(tempDir)
      .filter(f => f.startsWith('frame-') && f.endsWith('.jpg'))
      .map(f => path.join(tempDir, f));

    return files;
  } catch (err) {
    console.error('[ContentModerator] Frame extraction failed:', err.message);
    return [];
  }
}

/**
 * Analyze frame for inappropriate content using vision AI
 * @param {string} framePath - Path to frame image
 * @returns {Promise<{safe: boolean, categories: string[], confidence: number}>}
 */
async function analyzeFrame(framePath) {
  try {
    // Read frame as base64
    const imageBuffer = fs.readFileSync(framePath);
    const base64Image = imageBuffer.toString('base64');

    // Use Groq's vision model for content analysis
    const groqClient = getGroqClient();
    if (!groqClient) {
      throw new Error('Groq API key not configured');
    }
    
    const response = await groqClient.chat.completions.create({
      model: "llama-3.2-90b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image for inappropriate content. Check for:
- Violence or gore
- Nudity or sexual content
- Hate symbols or offensive gestures
- Illegal activities
- Self-harm content

Respond with JSON only:
{
  "safe": true/false,
  "categories": ["category1", "category2"],
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || '{}';
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { safe: true, categories: [], confidence: 0, reason: 'Parse error' };
    }
    
    const result = JSON.parse(jsonMatch[0]);
    return {
      safe: result.safe !== false, // Default to safe if unclear
      categories: result.categories || [],
      confidence: result.confidence || 0,
      reason: result.reason || '',
    };

  } catch (err) {
    console.error('[ContentModerator] Frame analysis error:', err.message);
    // On error, default to safe (don't block legitimate content)
    return { safe: true, categories: [], confidence: 0, error: err.message };
  }
}

/**
 * Moderate video content
 * @param {string} videoPath - Path to video file
 * @returns {Promise<{approved: boolean, flags: string[], confidence: number, details: object}>}
 */
export async function moderateVideo(videoPath) {
  const startTime = Date.now();
  
  try {
    // Extract sample frames
    console.log('[ContentModerator] Extracting frames...');
    const frames = await extractFrames(videoPath, 5);
    
    if (frames.length === 0) {
      console.warn('[ContentModerator] No frames extracted - skipping moderation');
      return {
        approved: true,
        flags: [],
        confidence: 0,
        skipped: true,
        reason: 'Frame extraction failed'
      };
    }

    // Analyze each frame
    console.log(`[ContentModerator] Analyzing ${frames.length} frames...`);
    const analyses = await Promise.all(
      frames.map(frame => analyzeFrame(frame))
    );

    // Clean up frames
    frames.forEach(frame => {
      try { fs.unlinkSync(frame); } catch {}
    });

    // Aggregate results
    const unsafeFrames = analyses.filter(a => !a.safe);
    const allCategories = [...new Set(analyses.flatMap(a => a.categories))];
    const avgConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;

    const approved = unsafeFrames.length === 0;
    const moderationTime = Date.now() - startTime;

    console.log(`[ContentModerator] Result: ${approved ? 'APPROVED' : 'REJECTED'} (${moderationTime}ms)`);

    return {
      approved,
      flags: allCategories,
      confidence: avgConfidence,
      unsafeFrameCount: unsafeFrames.length,
      totalFrames: frames.length,
      moderationTime,
      details: {
        analyses: analyses.map((a, i) => ({
          frame: i + 1,
          safe: a.safe,
          categories: a.categories,
          reason: a.reason,
        }))
      }
    };

  } catch (err) {
    console.error('[ContentModerator] Error:', err.message);
    // On error, default to approved (don't block legitimate content)
    return {
      approved: true,
      flags: [],
      confidence: 0,
      error: err.message,
      moderationTime: Date.now() - startTime,
    };
  }
}

/**
 * Quick moderation check (single frame)
 * Faster but less thorough than full moderation
 */
export async function quickModerateVideo(videoPath) {
  try {
    const frames = await extractFrames(videoPath, 1);
    if (frames.length === 0) {
      return { approved: true, skipped: true };
    }

    const result = await analyzeFrame(frames[0]);
    
    // Clean up
    try { fs.unlinkSync(frames[0]); } catch {}

    return {
      approved: result.safe,
      flags: result.categories,
      confidence: result.confidence,
      reason: result.reason,
    };
  } catch (err) {
    console.error('[ContentModerator] Quick check error:', err.message);
    return { approved: true, error: err.message };
  }
}

/**
 * Check if content moderation is available
 */
export async function isModerationAvailable() {
  return !!process.env.GROQ_API_KEY;
}
