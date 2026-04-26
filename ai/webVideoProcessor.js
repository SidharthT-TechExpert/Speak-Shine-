/**
 * Web Video Processor - Adapts the WhatsApp feedback pipeline for web uploads
 * This module creates a bridge between web uploads and the existing AI pipeline
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { generateFeedback } from "./feedback.js";

/**
 * Process a web-uploaded video using the existing AI pipeline
 * @param {string} videoPath - Path to the uploaded video file
 * @param {string} userId - User ID from JWT token
 * @param {string} phone - User's phone number
 * @param {string} displayName - User's display name
 * @param {Function} onProgress - Progress callback function
 * @returns {Promise<object>} Structured analysis result
 */
export async function processWebVideo(videoPath, userId, phone, displayName, onProgress = () => {}) {
  try {
    // Validate video file exists
    if (!fs.existsSync(videoPath)) {
      throw new Error("Video file not found");
    }

    // Get video duration using ffprobe
    const duration = await getVideoDuration(videoPath);
    
    if (duration < 30) {
      throw new Error("Video must be at least 30 seconds long");
    }

    if (duration > 300) {
      throw new Error("Video must be less than 5 minutes long");
    }

    // Create a mock WhatsApp message object for the existing pipeline
    const mockMessage = {
      key: { 
        id: `web_${Date.now()}_${userId}`,
        remoteJid: `${phone}@s.whatsapp.net`
      },
      message: {
        videoMessage: {
          url: videoPath, // Local file path instead of WhatsApp URL
          seconds: duration,
          mimetype: "video/mp4"
        }
      },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };

    // Run the existing feedback pipeline
    const feedbackText = await generateFeedback(
      mockMessage,
      `${phone}@s.whatsapp.net`,
      duration,
      null, // questionTopic - web uploads don't use daily questions
      null, // questionText
      null, // sock - not needed for local files
      {
        displayName,
        onProgress,
        // Slightly longer timeouts for web processing
        transcribeTimeout: 240000, // 4 minutes
        speechTimeout: 120000,     // 2 minutes  
        visualTimeout: 240000,     // 4 minutes
      }
    );

    // Parse the formatted feedback text into structured data
    const structuredAnalysis = parseFeedbackToStructure(feedbackText);

    return {
      success: true,
      analysis: structuredAnalysis,
      rawFeedback: feedbackText,
      duration,
      processedAt: new Date()
    };

  } catch (error) {
    console.error("[WebVideoProcessor] Error:", error);
    throw error;
  }
}

/**
 * Get video duration using ffprobe
 */
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      (err, stdout) => {
        if (err) {
          return reject(new Error("Failed to read video metadata"));
        }
        
        const duration = parseFloat((stdout || "").trim());
        if (isNaN(duration) || duration <= 0) {
          return reject(new Error("Invalid video duration"));
        }
        
        resolve(Math.round(duration));
      }
    );
  });
}

/**
 * Parse the formatted feedback text back into structured data for web display
 * This extracts scores, comments, and suggestions from the WhatsApp-formatted text
 */
function parseFeedbackToStructure(feedbackText) {
  const analysis = {
    stats: {},
    grammarErrors: [],
    vocabularyHighlights: { strong: [], weak: [] },
    strongPoints: [],
    suggestions: [],
    visualSuggestions: [],
    visualStrengths: []
  };

  // Extract numeric scores using regex patterns
  const scorePatterns = {
    fluency: /🗣️ \*Fluency:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    grammar: /📚 \*Grammar:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    confidence: /🔥 \*Confidence:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    vocabulary: /🧠 \*Vocabulary:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    topicRelevance: /🎯 \*On-topic:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    eyeContact: /👁️ \*Eye Contact:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    bodyLanguage: /🧍 \*Body Language:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    facialExpression: /😊 \*Expression:\*\s+[🟩⬜]+\s+(\d+)\/10/,
    overallPresence: /✨ \*Presence:\*\s+[🟩⬜]+\s+(\d+)\/10/
  };

  // Extract all scores
  for (const [key, pattern] of Object.entries(scorePatterns)) {
    const match = feedbackText.match(pattern);
    if (match) {
      analysis[key] = parseInt(match[1]);
    }
  }

  // Extract duration and speaking pace
  const durationMatch = feedbackText.match(/⏱️ \*Duration:\* ([\d:]+)/);
  if (durationMatch) analysis.stats.duration = durationMatch[1];

  const wpmMatch = feedbackText.match(/📊 \*Pace:\* (\d+) wpm/);
  if (wpmMatch) analysis.stats.wpm = parseInt(wpmMatch[1]);

  // Extract filler words
  const fillerMatch = feedbackText.match(/🗣️ \*Filler words:\* (.+)/);
  if (fillerMatch) {
    const fillerText = fillerMatch[1];
    const fillerWords = {};
    let fillerTotal = 0;
    
    // Parse "word" ×count format
    const fillerPattern = /"([^"]+)"\s*×(\d+)/g;
    let match;
    while ((match = fillerPattern.exec(fillerText)) !== null) {
      const word = match[1];
      const count = parseInt(match[2]);
      fillerWords[word] = count;
      fillerTotal += count;
    }
    
    analysis.stats.fillerWords = fillerWords;
    analysis.stats.fillerTotal = fillerTotal;
  }

  // Extract pauses
  const pauseMatch = feedbackText.match(/🔇 \*Long pauses:\* (\d+) detected/);
  if (pauseMatch) analysis.stats.pauses = parseInt(pauseMatch[1]);

  // Extract CEFR level
  const cefrMatch = feedbackText.match(/🎓 \*Level:\* ([A-C][1-2]) — _([^_]+)_/);
  if (cefrMatch) {
    analysis.stats.cefrLevel = {
      level: cefrMatch[1],
      description: cefrMatch[2]
    };
  }

  // Extract overall comment (between 📝 and next section or end)
  const commentMatch = feedbackText.match(/📝 (.+?)(?=\n━|$)/s);
  if (commentMatch) {
    analysis.overallComment = commentMatch[1].trim();
  }

  // Extract strong points
  const strongPointsMatch = feedbackText.match(/✅ \*What you did well:\*\n((?:\s*• .+\n?)+)/);
  if (strongPointsMatch) {
    analysis.strongPoints = strongPointsMatch[1]
      .split("\n")
      .filter(Boolean)
      .map(line => line.replace(/^\s*• /, "").trim())
      .filter(Boolean);
  }

  // Extract speaking suggestions
  const suggestionsMatch = feedbackText.match(/💡 \*Speaking Tips:\*\n((?:\s*• .+\n?)+)/);
  if (suggestionsMatch) {
    analysis.suggestions = suggestionsMatch[1]
      .split("\n")
      .filter(Boolean)
      .map(line => line.replace(/^\s*• /, "").trim())
      .filter(Boolean);
  }

  // Extract visual suggestions
  const visualSuggestionsMatch = feedbackText.match(/🎬 \*Presentation Tips:\*\n((?:\s*• .+\n?)+)/);
  if (visualSuggestionsMatch) {
    analysis.visualSuggestions = visualSuggestionsMatch[1]
      .split("\n")
      .filter(Boolean)
      .map(line => line.replace(/^\s*• /, "").trim())
      .filter(Boolean);
  }

  // Extract grammar errors
  const grammarSection = feedbackText.match(/❌ \*Grammar Issues:\*\n((?:\s*• .+\n?)+)/);
  if (grammarSection) {
    const errorLines = grammarSection[1].split("\n").filter(Boolean);
    for (let i = 0; i < errorLines.length; i += 2) {
      const errorLine = errorLines[i];
      const ruleLine = errorLines[i + 1];
      
      const errorMatch = errorLine.match(/• _"([^"]+)"_ → \*"([^"]+)"\*/);
      if (errorMatch) {
        const error = {
          original: errorMatch[1],
          correction: errorMatch[2],
          rule: ruleLine ? ruleLine.replace(/^\s*_\(([^)]+)\)_/, "$1") : ""
        };
        analysis.grammarErrors.push(error);
      }
    }
  }

  // Extract vocabulary highlights
  const vocStrongMatch = feedbackText.match(/💎 \*Good vocabulary used:\* (.+)/);
  if (vocStrongMatch) {
    analysis.vocabularyHighlights.strong = vocStrongMatch[1]
      .split(",")
      .map(word => word.trim())
      .filter(Boolean);
  }

  const vocWeakMatch = feedbackText.match(/📖 \*Words to upgrade:\* (.+)/);
  if (vocWeakMatch) {
    analysis.vocabularyHighlights.weak = vocWeakMatch[1]
      .split(",")
      .map(word => word.trim())
      .filter(Boolean);
  }

  // Extract visual observation notes
  const visualObservations = feedbackText.match(/📹 \*Visual Observations:\*\n((?:\s*[👁️🧍😊✅] .+\n?)+)/);
  if (visualObservations) {
    const observations = visualObservations[1];
    
    const eyeContactNote = observations.match(/👁️ (.+)/);
    if (eyeContactNote) analysis.eyeContactNote = eyeContactNote[1].trim();
    
    const bodyLanguageNote = observations.match(/🧍 (.+)/);
    if (bodyLanguageNote) analysis.bodyLanguageNote = bodyLanguageNote[1].trim();
    
    const expressionNote = observations.match(/😊 (.+)/);
    if (expressionNote) analysis.expressionNote = expressionNote[1].trim();
    
    // Extract visual strengths (✅ lines)
    const strengthMatches = observations.match(/✅ (.+)/g);
    if (strengthMatches) {
      analysis.visualStrengths = strengthMatches.map(match => 
        match.replace(/✅ /, "").trim()
      );
    }
  }

  // Extract pronunciation and rhythm notes
  const pronunciationMatch = feedbackText.match(/🗣️ \*Pronunciation:\* _([^_]+)_/);
  if (pronunciationMatch) analysis.pronunciationNote = pronunciationMatch[1];

  const rhythmMatch = feedbackText.match(/🎵 \*Rhythm:\* _([^_]+)_/);
  if (rhythmMatch) analysis.rhythmNote = rhythmMatch[1];

  const topicFeedbackMatch = feedbackText.match(/💬 _([^_]+)_/);
  if (topicFeedbackMatch) analysis.topicFeedback = topicFeedbackMatch[1];

  return analysis;
}

export { parseFeedbackToStructure };