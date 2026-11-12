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
    const totalFrames = 12; // 12 frames = faster upload, still accurate for vision AI
    
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
      const rawDur = video.duration;
      const seekableEnd = video.seekable?.length > 0 ? video.seekable.end(video.seekable.length - 1) : 0;
      const duration = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : (Number.isFinite(seekableEnd) && seekableEnd > 0 ? seekableEnd : null);

      if (!duration) {
        URL.revokeObjectURL(video.src);
        resolve({ hash: null, duration: null, frames: [], width: 0, height: 0 });
        return;
      }

      const interval = duration / (totalFrames + 1); // Skip first and last frame

      // Set high-quality canvas size when frames are requested for AI
      if (quality === 'high' || quality === 'both') {
        const maxDimension = 720;
        const scale = Math.min(1, maxDimension / Math.max(video.videoWidth || 1, video.videoHeight || 1));
        canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 480) * scale));
      } else {
        canvas.width = 32;
        canvas.height = 32;
      }

      // Dedicated 32x32 canvas ensures full-frame perceptual hash even when main canvas is 720p
      const hashCanvas = document.createElement('canvas');
      hashCanvas.width = 32;
      hashCanvas.height = 32;
      const hashCtx = hashCanvas.getContext('2d', { willReadFrequently: true });

      let seekTimeout = null;
      let activeSeekId = 0;

      const captureFrame = () => {
        if (currentFrame >= totalFrames) {
          URL.revokeObjectURL(video.src);
          hashFrameData(frames)
            .then(hash => resolve({
              hash,
              duration,
              frames: frameBlobs,
              width: canvas.width,
              height: canvas.height
            }))
            .catch(reject);
          return;
        }

        const seekId = ++activeSeekId;
        const time = interval * (currentFrame + 1);
        video.currentTime = time;

        seekTimeout = setTimeout(() => {
          if (seekId !== activeSeekId) return;
          activeSeekId++;
          console.warn(`[VideoHash] Seek timeout for frame ${currentFrame}, skipping`);
          currentFrame++;
          captureFrame();
        }, 2000);
      };

      video.onseeked = () => {
        const seekId = activeSeekId;
        clearTimeout(seekTimeout);
        activeSeekId++;
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          if (quality === 'low' || quality === 'both') {
            hashCtx.drawImage(video, 0, 0, 32, 32);
            const imageData = hashCtx.getImageData(0, 0, 32, 32);
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

          if (quality === 'high' || quality === 'both') {
            canvas.toBlob((blob) => {
              if (blob) {
                frameBlobs.push(blob);
              }
              currentFrame++;
              captureFrame();
            }, 'image/jpeg', 0.85);
            return;
          }

          if (seekId >= 0) {
            currentFrame++;
            captureFrame();
          }
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
