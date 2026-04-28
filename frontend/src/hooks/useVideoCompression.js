/**
 * useVideoCompression Hook
 * Compresses videos using FFmpeg.wasm before upload
 * Reduces file size by 50-70% while maintaining quality for speech analysis
 */

import { useState, useRef, useCallback } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export function useVideoCompression() {
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [compressionError, setCompressionError] = useState(null);
  const ffmpegRef = useRef(null);
  const loadedRef = useRef(false);

  /**
   * Load FFmpeg.wasm (only once)
   */
  const loadFFmpeg = useCallback(async () => {
    if (loadedRef.current) return true;

    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      // Progress callback
      ffmpeg.on("progress", ({ progress }) => {
        setCompressionProgress(Math.round(progress * 100));
      });

      // Load FFmpeg core
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      loadedRef.current = true;
      return true;
    } catch (err) {
      console.error("[FFmpeg] Load failed:", err);
      setCompressionError("Failed to load video compressor");
      return false;
    }
  }, []);

  /**
   * Compress video file
   * @param {File} file - Original video file
   * @returns {Promise<File>} - Compressed video file
   */
  const compressVideo = useCallback(async (file) => {
    setIsCompressing(true);
    setCompressionProgress(0);
    setCompressionError(null);

    try {
      // Load FFmpeg if not already loaded
      const loaded = await loadFFmpeg();
      if (!loaded) {
        throw new Error("FFmpeg not loaded");
      }

      const ffmpeg = ffmpegRef.current;
      const inputName = "input.mp4";
      const outputName = "output.mp4";

      // Write input file to FFmpeg virtual filesystem
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      // Compress video with optimized settings for speech analysis
      // - Scale to max 720p (maintains aspect ratio)
      // - 1 Mbps video bitrate (good quality, small size)
      // - 96 kbps audio bitrate (clear speech)
      // - Fast preset (quick encoding)
      await ffmpeg.exec([
        "-i", inputName,
        "-vf", "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease",
        "-c:v", "libx264",
        "-b:v", "1M",
        "-maxrate", "1.5M",
        "-bufsize", "2M",
        "-c:a", "aac",
        "-b:a", "96k",
        "-preset", "fast",
        "-movflags", "+faststart",  // Enable streaming
        outputName
      ]);

      // Read compressed file
      const data = await ffmpeg.readFile(outputName);
      const compressedBlob = new Blob([data.buffer], { type: "video/mp4" });

      // Create File object with original name
      const compressedFile = new File(
        [compressedBlob],
        file.name.replace(/\.\w+$/, ".mp4"),
        { type: "video/mp4" }
      );

      // Clean up
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      // Calculate compression ratio
      const originalSize = file.size / 1024 / 1024;
      const compressedSize = compressedFile.size / 1024 / 1024;
      const savings = ((1 - compressedSize / originalSize) * 100).toFixed(0);

      console.log(
        `[Compression] ${originalSize.toFixed(1)}MB → ${compressedSize.toFixed(1)}MB (${savings}% smaller)`
      );

      setIsCompressing(false);
      setCompressionProgress(100);
      return compressedFile;

    } catch (err) {
      console.error("[Compression] Error:", err);
      setCompressionError(err.message || "Compression failed");
      setIsCompressing(false);
      throw err;
    }
  }, [loadFFmpeg]);

  /**
   * Check if compression is supported
   */
  const isSupported = useCallback(() => {
    return typeof SharedArrayBuffer !== "undefined";
  }, []);

  return {
    compressVideo,
    isCompressing,
    compressionProgress,
    compressionError,
    isSupported,
  };
}
