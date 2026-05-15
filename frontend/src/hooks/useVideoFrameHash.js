/**
 * useVideoFrameHash Hook
 * Extracts 16 frames from video and generates a hash for duplicate detection
 * Caches results in localStorage to skip security checks for previously uploaded videos
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
 * Extract 16 evenly-spaced frames from video and generate hash
 */
async function extractFrameHash(videoFile) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // Small canvas for fast processing (32x32 pixels)
    canvas.width = 32;
    canvas.height = 32;
    
    const frames = [];
    let currentFrame = 0;
    const totalFrames = 16;
    
    video.preload = 'metadata';
    video.muted = true;
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };
    
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const interval = duration / (totalFrames + 1); // Skip first and last frame
      
      const captureFrame = () => {
        if (currentFrame >= totalFrames) {
          URL.revokeObjectURL(video.src);
          
          // Generate hash from all frames
          hashFrameData(frames)
            .then(hash => resolve({ hash, duration }))
            .catch(reject);
          return;
        }
        
        const time = interval * (currentFrame + 1);
        video.currentTime = time;
      };
      
      video.onseeked = () => {
        try {
          // Draw frame to canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Get image data (downsampled to 8x8 for perceptual hash)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          // Simple perceptual hash: average brightness per 4x4 block
          let blockHash = '';
          for (let y = 0; y < 32; y += 4) {
            for (let x = 0; x < 32; x += 4) {
              let sum = 0;
              for (let by = 0; by < 4; by++) {
                for (let bx = 0; bx < 4; bx++) {
                  const idx = ((y + by) * 32 + (x + bx)) * 4;
                  // Grayscale: (R + G + B) / 3
                  sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                }
              }
              const avg = Math.floor(sum / 16);
              blockHash += avg.toString(16).padStart(2, '0');
            }
          }
          
          frames.push(blockHash);
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
   * Generate hash and check cache
   * Returns: { hash, cached, cachedResult, duration }
   */
  const generateHash = useCallback(async (videoFile) => {
    setIsHashing(true);
    setHashProgress(0);
    setHashError(null);
    
    try {
      // Clear old entries on each use
      clearOldCache();
      
      setHashProgress(10);
      
      // Extract frames and generate hash
      const { hash, duration } = await extractFrameHash(videoFile);
      
      setHashProgress(80);
      
      // Check cache
      const cached = checkCache(hash);
      
      setHashProgress(100);
      setIsHashing(false);
      
      return {
        hash,
        cached: !!cached,
        cachedResult: cached?.result || null,
        duration,
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
    generateHash,
    cacheResult,
    isHashing,
    hashProgress,
    hashError,
  };
}
