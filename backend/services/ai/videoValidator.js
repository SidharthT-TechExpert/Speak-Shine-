/**
 * videoValidator.js — Video codec and metadata validation
 * Validates video codecs to prevent exploitation of ffmpeg vulnerabilities
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Whitelist of safe video codecs
const ALLOWED_VIDEO_CODECS = [
  'h264',      // H.264/AVC
  'hevc',      // H.265/HEVC
  'vp8',       // VP8 (WebM)
  'vp9',       // VP9 (WebM)
  'av1',       // AV1
  'mpeg4',     // MPEG-4
  'mjpeg',     // Motion JPEG
];

// Whitelist of safe audio codecs
const ALLOWED_AUDIO_CODECS = [
  'aac',       // AAC
  'mp3',       // MP3
  'opus',      // Opus (WebM)
  'vorbis',    // Vorbis (WebM)
  'pcm_s16le', // PCM
  'flac',      // FLAC
];

/**
 * Validate video codecs using ffprobe
 * @param {string} videoPath - Path to video file
 * @returns {Promise<{valid: boolean, videoCodec: string, audioCodec: string, error?: string}>}
 */
export async function validateVideoCodecs(videoPath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      videoPath
    ], { timeout: 30000 });

    const info = JSON.parse(stdout);
    
    if (!info.streams || info.streams.length === 0) {
      return { valid: false, error: 'No streams found in video file' };
    }

    // Find video and audio streams
    const videoStream = info.streams.find(s => s.codec_type === 'video');
    const audioStream = info.streams.find(s => s.codec_type === 'audio');

    if (!videoStream) {
      return { valid: false, error: 'No video stream found' };
    }

    const videoCodec = videoStream.codec_name?.toLowerCase();
    const audioCodec = audioStream?.codec_name?.toLowerCase();

    // Validate video codec
    if (!videoCodec || !ALLOWED_VIDEO_CODECS.includes(videoCodec)) {
      return {
        valid: false,
        videoCodec,
        audioCodec,
        error: `Unsupported video codec: ${videoCodec}. Allowed: ${ALLOWED_VIDEO_CODECS.join(', ')}`
      };
    }

    // Validate audio codec (if present)
    if (audioStream && audioCodec && !ALLOWED_AUDIO_CODECS.includes(audioCodec)) {
      return {
        valid: false,
        videoCodec,
        audioCodec,
        error: `Unsupported audio codec: ${audioCodec}. Allowed: ${ALLOWED_AUDIO_CODECS.join(', ')}`
      };
    }

    // Additional security checks
    const securityChecks = performSecurityChecks(info);
    if (!securityChecks.valid) {
      return { valid: false, videoCodec, audioCodec, error: securityChecks.error };
    }

    return {
      valid: true,
      videoCodec,
      audioCodec: audioCodec || 'none',
    };

  } catch (err) {
    console.error('[VideoValidator] Error:', err.message);
    return {
      valid: false,
      error: 'Failed to validate video codecs: ' + err.message
    };
  }
}

/**
 * Perform additional security checks on video metadata
 */
function performSecurityChecks(info) {
  // Check for suspicious metadata
  const format = info.format || {};
  
  // Check for excessively large metadata
  if (format.tags) {
    const metadataSize = JSON.stringify(format.tags).length;
    if (metadataSize > 10000) { // 10KB limit
      return { valid: false, error: 'Video metadata is suspiciously large' };
    }
  }

  // Check for reasonable stream count (prevent zip bomb-like attacks)
  if (info.streams.length > 10) {
    return { valid: false, error: 'Too many streams in video file' };
  }

  // Check for reasonable resolution (prevent memory exhaustion)
  const videoStream = info.streams.find(s => s.codec_type === 'video');
  if (videoStream) {
    const width = parseInt(videoStream.width) || 0;
    const height = parseInt(videoStream.height) || 0;
    
    if (width > 3840 || height > 2160) { // 4K max
      return { valid: false, error: 'Video resolution too high (max 4K)' };
    }
    
    if (width < 320 || height < 240) {
      return { valid: false, error: 'Video resolution too low (min 320x240)' };
    }
  }

  // Check for reasonable bitrate (prevent DoS)
  const bitrate = parseInt(format.bit_rate) || 0;
  if (bitrate > 50000000) { // 50 Mbps max
    return { valid: false, error: 'Video bitrate too high' };
  }

  return { valid: true };
}

/**
 * Get detailed video metadata for logging
 */
export async function getVideoMetadata(videoPath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath
    ], { timeout: 30000 });

    const info = JSON.parse(stdout);
    const videoStream = info.streams?.find(s => s.codec_type === 'video');
    const audioStream = info.streams?.find(s => s.codec_type === 'audio');

    return {
      duration: parseFloat(info.format?.duration) || 0,
      size: parseInt(info.format?.size) || 0,
      bitrate: parseInt(info.format?.bit_rate) || 0,
      videoCodec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      width: parseInt(videoStream?.width) || 0,
      height: parseInt(videoStream?.height) || 0,
      fps: eval(videoStream?.r_frame_rate || '0/1'),
      format: info.format?.format_name,
    };
  } catch (err) {
    console.error('[VideoMetadata] Error:', err.message);
    return null;
  }
}
