import { useRef, useCallback, useEffect, useState } from 'react';

/**
 * useBackgroundBlur
 * 
 * AI-powered background blur using MediaPipe Selfie Segmentation.
 * Detects the person in real-time and blurs only the background.
 * 
 * @param {number} blurStrength - Blur intensity in pixels (default: 20)
 * @returns {Object} - { applyBlur, cleanupBlur, blurStatus, blurError }
 */
export function useBackgroundBlur(blurStrength = 20) {
  const [blurStatus, setBlurStatus] = useState('idle'); // idle | loading | active | fallback | error
  const [blurError, setBlurError] = useState(null);
  
  const segmenterRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const animationFrameRef = useRef(null);
  const inputVideoRef = useRef(null);
  const outputStreamRef = useRef(null);
  const blurStrengthRef = useRef(blurStrength);
  const originalStreamRef = useRef(null); // Store original stream for toggling
  const isBlurEnabledRef = useRef(true); // Track if blur should be applied

  // Update blur strength dynamically
  useEffect(() => {
    blurStrengthRef.current = blurStrength;
  }, [blurStrength]);

  // Cleanup function
  const cleanupBlur = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (outputStreamRef.current) {
      outputStreamRef.current.getTracks().forEach(track => track.stop());
      outputStreamRef.current = null;
    }
    
    if (inputVideoRef.current) {
      if (inputVideoRef.current.srcObject) {
        try {
          inputVideoRef.current.srcObject.getTracks?.().forEach(track => track.stop());
        } catch {}
      }
      inputVideoRef.current.srcObject = null;
      inputVideoRef.current = null;
    }
    
    if (segmenterRef.current) {
      segmenterRef.current.close?.();
      segmenterRef.current = null;
    }
    
    if (canvasRef.current) {
      canvasRef.current = null;
      ctxRef.current = null;
    }
    
    if (originalStreamRef.current) {
      try {
        originalStreamRef.current.getTracks?.().forEach(track => track.stop());
      } catch {}
      originalStreamRef.current = null;
    }
    isBlurEnabledRef.current = true;
    
    setBlurStatus('idle');
    setBlurError(null);
  }, []);

  // Toggle blur on/off during recording
  const toggleBlur = useCallback((enabled) => {
    isBlurEnabledRef.current = enabled;
    if (enabled) {
      setBlurStatus('active');
    } else {
      setBlurStatus('idle');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupBlur();
  }, [cleanupBlur]);

  /**
   * Apply background blur to a MediaStream
   * @param {MediaStream} originalStream - The input video stream
   * @returns {Promise<MediaStream>} - Returns blurred stream or original on fallback
   */
  const applyBlur = useCallback(async (originalStream) => {
    try {
      setBlurStatus('loading');
      setBlurError(null);

      console.log('[BackgroundBlur] Starting initialization...');

      // Check browser support
      if (!HTMLCanvasElement.prototype.captureStream) {
        console.warn('[BackgroundBlur] Canvas.captureStream() not supported');
        setBlurStatus('fallback');
        return originalStream;
      }

      // Wait for MediaPipe to load (script tag loads async)
      // Check multiple times with delays to handle race condition
      let SelfieSegmentation = window.SelfieSegmentation;
      let attempts = 0;
      const maxAttempts = 20; // Increased from 10 to 20 (6 seconds total)
      
      while (!SelfieSegmentation && attempts < maxAttempts) {
        console.log(`[BackgroundBlur] Waiting for MediaPipe... (attempt ${attempts + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 300)); // Wait 300ms
        SelfieSegmentation = window.SelfieSegmentation;
        attempts++;
      }
      
      if (SelfieSegmentation && typeof SelfieSegmentation === 'function') {
        console.log('[BackgroundBlur] ✅ MediaPipe loaded from window object');
      } else {
        // MediaPipe is loaded via CDN script tag in index.html (window.SelfieSegmentation)
        // If it's still not available after waiting, the CDN script may have failed to load
        console.error('[BackgroundBlur] ❌ window.SelfieSegmentation not available — CDN script may have failed');
      }
      
      // Final validation
      if (!SelfieSegmentation || typeof SelfieSegmentation !== 'function') {
        console.error('[BackgroundBlur] ❌ MediaPipe not available');
        console.error('[BackgroundBlur] window.SelfieSegmentation:', typeof window.SelfieSegmentation);
        setBlurStatus('fallback');
        setBlurError('MediaPipe not loaded');
        return originalStream;
      }
      
      console.log('[BackgroundBlur] ✅ MediaPipe ready');

      // Create hidden video element to read frames from original stream
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.width = 640;
      video.height = 480;
      video.srcObject = originalStream;
      inputVideoRef.current = video;
      originalStreamRef.current = originalStream;

      // Wait for video to load
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = (e) => reject(new Error('Video element error: ' + e));
        setTimeout(() => reject(new Error('Video load timeout')), 5000);
      });
      await video.play();

      console.log('[BackgroundBlur] Video element ready:', video.videoWidth, 'x', video.videoHeight);

      // Create canvas for drawing blurred output
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      canvasRef.current = canvas;
      ctxRef.current = ctx;

      console.log('[BackgroundBlur] Canvas created:', canvas.width, 'x', canvas.height);

      // Initialize MediaPipe Selfie Segmentation with fallback CDN
      let segmenter;
      try {
        segmenter = new SelfieSegmentation({
          locateFile: (file) => {
            // Try unpkg CDN first (more reliable)
            const cdnUrl = `https://unpkg.com/@mediapipe/selfie_segmentation@0.1.1675465747/${file}`;
            console.log('[BackgroundBlur] Loading file from CDN:', cdnUrl);
            return cdnUrl;
          }
        });

        segmenter.setOptions({
          modelSelection: 1, // 0 = general (faster), 1 = landscape (more accurate)
        });

        console.log('[BackgroundBlur] Segmenter initialized');
      } catch (segErr) {
        console.error('[BackgroundBlur] Segmenter init error:', segErr);
        throw segErr;
      }

      segmenterRef.current = segmenter;

      // Temporal smoothing: store previous mask for blending
      let previousMask = null;
      const TEMPORAL_SMOOTH_FACTOR = 0.7; // 70% current, 30% previous
      const EDGE_FEATHER_RADIUS = 3; // Pixels to feather at edges

      // Process each frame
      let isProcessing = false;
      let lastFrameTime = 0;
      const TARGET_FPS = 30;
      const FRAME_INTERVAL = 1000 / TARGET_FPS;
      
      const onResults = (results) => {
        if (!canvasRef.current || !ctxRef.current) return;

        const now = performance.now();
        if (now - lastFrameTime < FRAME_INTERVAL) {
          isProcessing = false;
          return; // Skip frame to maintain target FPS
        }
        lastFrameTime = now;

        const ctx = ctxRef.current;
        const canvas = canvasRef.current;
        const width = canvas.width;
        const height = canvas.height;

        try {
          ctx.clearRect(0, 0, width, height);

          // If blur is disabled, just draw the original image
          if (!isBlurEnabledRef.current) {
            ctx.drawImage(results.image, 0, 0, width, height);
            isProcessing = false;
            return;
          }

          // Step 1: Get the segmentation mask
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = width;
          maskCanvas.height = height;
          const maskCtx = maskCanvas.getContext('2d');
          maskCtx.drawImage(results.segmentationMask, 0, 0, width, height);
          const rawMaskData = maskCtx.getImageData(0, 0, width, height);
          const maskData = rawMaskData.data;

          // Step 2: Apply temporal smoothing (blend with previous frame)
          if (previousMask) {
            for (let i = 0; i < maskData.length; i += 4) {
              maskData[i] = maskData[i] * TEMPORAL_SMOOTH_FACTOR + previousMask[i] * (1 - TEMPORAL_SMOOTH_FACTOR);
            }
          }
          
          // Store current mask for next frame
          previousMask = new Uint8ClampedArray(maskData);

          // Step 3: Apply edge feathering (Gaussian-like blur on mask edges)
          const smoothedMask = new Uint8ClampedArray(maskData.length);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = (y * width + x) * 4;
              let sum = 0;
              let count = 0;
              
              // Sample surrounding pixels for feathering
              for (let dy = -EDGE_FEATHER_RADIUS; dy <= EDGE_FEATHER_RADIUS; dy++) {
                for (let dx = -EDGE_FEATHER_RADIUS; dx <= EDGE_FEATHER_RADIUS; dx++) {
                  const nx = x + dx;
                  const ny = y + dy;
                  
                  if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nidx = (ny * width + nx) * 4;
                    sum += maskData[nidx];
                    count++;
                  }
                }
              }
              
              smoothedMask[idx] = sum / count;
            }
          }

          // Step 4: Draw the original image
          ctx.drawImage(results.image, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;

          // Step 5: Create blurred background
          const blurCanvas = document.createElement('canvas');
          blurCanvas.width = width;
          blurCanvas.height = height;
          const blurCtx = blurCanvas.getContext('2d');
          blurCtx.filter = `blur(${blurStrengthRef.current}px)`;
          blurCtx.drawImage(results.image, 0, 0, width, height);
          const blurredData = blurCtx.getImageData(0, 0, width, height).data;

          // Step 6: Composite using smoothed mask
          for (let i = 0; i < data.length; i += 4) {
            const maskValue = smoothedMask[i] / 255; // Normalized to 0-1
            
            // Blend original (person) and blurred (background) based on mask
            data[i]     = data[i] * maskValue + blurredData[i] * (1 - maskValue);     // R
            data[i + 1] = data[i + 1] * maskValue + blurredData[i + 1] * (1 - maskValue); // G
            data[i + 2] = data[i + 2] * maskValue + blurredData[i + 2] * (1 - maskValue); // B
          }

          // Step 7: Put the composited image back
          ctx.putImageData(imageData, 0, 0);
        } catch (err) {
          console.warn('[BackgroundBlur] Frame processing error:', err);
        }

        isProcessing = false;
      };

      segmenter.onResults(onResults);

      // Error handler for segmenter
      segmenter.onError = (error) => {
        console.error('[BackgroundBlur] Segmenter error:', error);
      };

      // Start processing loop
      const processFrame = async () => {
        if (!segmenterRef.current || !inputVideoRef.current || !canvasRef.current) {
          return;
        }

        if (!isProcessing && inputVideoRef.current.readyState === 4) {
          isProcessing = true;
          try {
            await segmenter.send({ image: inputVideoRef.current });
          } catch (err) {
            console.error('[BackgroundBlur] Frame send error:', err);
            isProcessing = false;
          }
        }

        animationFrameRef.current = requestAnimationFrame(processFrame);
      };

      // Wait for segmenter to initialize and load models
      console.log('[BackgroundBlur] Waiting for model to load...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start processing
      console.log('[BackgroundBlur] Starting frame processing...');
      processFrame();

      // Create output stream from canvas
      const fps = 30;
      const outputStream = canvas.captureStream(fps);
      
      // Add audio track from original stream
      const audioTracks = originalStream.getAudioTracks();
      audioTracks.forEach(track => outputStream.addTrack(track));

      outputStreamRef.current = outputStream;
      setBlurStatus('active');

      console.log('[BackgroundBlur] ✅ AI background blur active');
      return outputStream;

    } catch (err) {
      console.error('[BackgroundBlur] Failed to initialize:', err);
      setBlurError(err.message);
      setBlurStatus('error');
      cleanupBlur();
      
      // Fallback to original stream
      return originalStream;
    }
  }, [cleanupBlur]);

  return {
    applyBlur,
    cleanupBlur,
    toggleBlur,
    blurStatus,
    blurError,
  };
}
