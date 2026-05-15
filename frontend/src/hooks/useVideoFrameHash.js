/**
 * useVideoFrameHash Hook
 * Extracts 16 frames from video for:
 * 1. Hash generation (duplicate detection)
 * 2. Visual analysis (Gemini AI - eye contact, body language)
 */

import { useState, useCallback } from "react";

/**
 * Simple hash function for frame data
 */
async function hashFrameData(frameDataArray) {
  const combined = frameDataArray.join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract 16 evenly-spaced frames from video
 * Returns both hash (for caching) and full frames (for AI analysis)
 */
async function extractFramesAndHash(videoFile, quality = 'high') {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const frames = [];
    const frameBlobs = []; // Full-quality frames for AI
    let currentFrame = 0;
    const totalFrames = 16;
    
    video.preload = 'metadata';
    video.muted = true;
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };
    
    // Timeout if metadata never loads (can happen with some recorded blobs)
    const metadataTimeout = setTimeout(() => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Video metadata load timeout'));
    }, 10000);
    
    video.onloadedmetadata = () => {
      clearTimeout(metadataTimeout);
      const duration = video.duration;
      const interval = duration / (totalFrames + 1); // Skip first and last frame
      
      // Set canvas size based on quality
      if (quality === 'high') {
        // Use video dimensions but cap at 720p for reasonable size
        const maxDimension = 720;
        const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
      } else {
        // Low quality for hashing only
        canvas.width = 32;
        canvas.height = 32;
      }
      
      const captureFrame = () => {
        if (currentFrame >= totalFrames) {
          URL.revokeObjectURL(video.src);
          
          // Generate hash from low-res data
          hashFrameData(frames)
            .then(hash => resolve({ 
              hash, 
              duration,
              frames: frameBlobs, // Full-quality frames
              width: canvas.width,
              height: canvas.height
            }))
            .catch(reject);
          return;
        }
        
        const time = interval * (currentFrame + 1);
        video.currentTime = time;
        
        // If seek doesn't fire within 3s, skip this frame and move on
        seekTimeout = setTimeout(() => {
          console.warn(`[VideoHash] Seek timeout for frame ${currentFrame}, skipping`);
          currentFrame++;
          captureFrame();
        }, 3000);
      };
      
      // Timeout per seek — some browsers hang on seek for recorded blobs
      let seekTimeout = null;
      
      video.onseeked = () => {
        clearTimeout(seekTimeout);
        try {
          // Draw frame to canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // For hashing: Get low-res perceptual hash
          if (quality === 'low' || quality === 'both') {
            const imageData = ctx.getImageData(0, 0, 32, 32);
            const data = imageData.data;
            
            let blockHash = '';
            for (let y = 0; y < 32; y += 4) {
              for (let x = 0; x < 32; x += 4) {
                let sum = 0;
                for (let by = 0; by < 4; by++) {
                  for (let bx = 0; bx < 4; bx++) {
                    const idx = ((y + by) * 32 + (x + bx)) * 4;
                    sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                  }
                }
                const avg = Math.floor(sum / 16);
                blockHash += avg.toString(16).padStart(2, '0');
              }
            }
            frames.push(blockHash);
          }
          
          // For AI: Get high-quality frame as blob
          if (quality === 'high' || quality === 'both') {
            canvas.toBlob((blob) => {
              if (blob) {
                frameBlobs.push(blob);
              }
              currentFrame++;
              captureFrame();
            }, 'image/jpeg', 0.85); // 85% quality JPEG
            return; // Wait for blob callback
          }
          
          currentFrame++;
          captureFrame();
        } catch (err) {
          URL.revokeObjectURL(video.src);
          reject(err);
        }
      };
      
      captureFrame();
    };
    
    video.src = URL.createObjectURL(videoFile);
  });
}

/**
 * Check if video hash exists in cache
 */
function checkCache(hash) {
  try {
    const cache = localStorage.getItem('videoSecurityCache');
    if (!cache) return null;
    
    const parsed = JSON.parse(cache);
    const entry = parsed[hash];
    
    if (!entry) return null;
    
    // Cache expires after 7 days
    const age = Date.now() - entry.timestamp;
    if (age > 7 * 24 * 60 * 60 * 1000) {
      return null;
    }
    
    return entry;
  } catch {
    return null;
  }
}

/**
 * Save video hash to cache
 */
function saveToCache(hash, result) {
  try {
    const cache = localStorage.getItem('videoSecurityCache');
    const parsed = cache ? JSON.parse(cache) : {};
    
    parsed[hash] = {
      result,
      timestamp: Date.now(),
    };
    
    // Keep only last 50 entries to avoid localStorage bloat
    const entries = Object.entries(parsed);
    if (entries.length > 50) {
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const keep = Object.fromEntries(entries.slice(0, 50));
      localStorage.setItem('videoSecurityCache', JSON.stringify(keep));
    } else {
      localStorage.setItem('videoSecurityCache', JSON.stringify(parsed));
    }
  } catch (err) {
    console.warn('[VideoCache] Failed to save to cache:', err);
  }
}

/**
 * Clear old cache entries
 */
function clearOldCache() {
  try {
    const cache = localStorage.getItem('videoSecurityCache');
    if (!cache) return;
    
    const parsed = JSON.parse(cache);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    
    const filtered = Object.fromEntries(
      Object.entries(parsed).filter(([_, entry]) => {
        return (now - entry.timestamp) < maxAge;
      })
    );
    
    localStorage.setItem('videoSecurityCache', JSON.stringify(filtered));
  } catch {
    // Ignore errors
  }
}

export function useVideoFrameHash() {
  const [isHashing, setIsHashing] = useState(false);
  const [hashProgress, setHashProgress] = useState(0);
  const [hashError, setHashError] = useState(null);
  
  /**
   * Generate hash and extract frames for AI
   * Returns: { hash, cached, cachedResult, duration, frames, width, height }
   */
  const generateHashAndFrames = useCallback(async (videoFile) => {
    setIsHashing(true);
    setHashProgress(0);
    setHashError(null);
    
    try {
      // Clear old entries on each use
      clearOldCache();
      
      setHashProgress(10);
      
      // Extract frames (both hash and full-quality for AI)
      const result = await extractFramesAndHash(videoFile, 'both');
      
      setHashProgress(80);
      
      // Check cache
      const cached = checkCache(result.hash);
      
      setHashProgress(100);
      setIsHashing(false);
      
      return {
        hash: result.hash,
        cached: !!cached,
        cachedResult: cached?.result || null,
        duration: result.duration,
        frames: result.frames, // Array of Blob objects for AI
        width: result.width,
        height: result.height,
      };
    } catch (err) {
      console.error('[VideoHash] Error:', err);
      setHashError(err.message);
      setIsHashing(false);
      throw err;
    }
  }, []);
  
  /**
   * Save result to cache after successful upload
   */
  const cacheResult = useCallback((hash, result) => {
    saveToCache(hash, result);
  }, []);
  
  return {
    generateHashAndFrames,
    cacheResult,
    isHashing,
    hashProgress,
    hashError,
  };
}
