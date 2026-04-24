/**
 * Bug Condition Exploration Test for visual-analysis-failure-fix
 *
 * Task 1: Write bug condition exploration property test
 * Feature: visual-analysis-failure-fix
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * Property 1: Bug Condition - Too Many Frames Cause API Rejection
 *
 * The Groq Vision API enforces a maximum of 5 images per request.
 * The original code used FRAME_COUNT = 8 (previously 6), causing HTTP 400.
 * The fix reduces FRAME_COUNT to 5.
 *
 * This test encodes the expected behavior after the fix.
 * On unfixed code (FRAME_COUNT > 5) it will FAIL, confirming the bug.
 * After the fix (FRAME_COUNT = 5) it will PASS.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import { exec } from 'child_process';

// Mock modules before importing analyzeVideo
vi.mock('fs');
vi.mock('child_process');
vi.mock('node-fetch');

// Mock FrameCache (MongoDB model used by current architecture)
vi.mock('../models/frameCacheSchema.js', () => {
  const mockCreate = vi.fn();
  const mockFind = vi.fn();
  const mockDeleteMany = vi.fn();

  const FrameCache = {
    create: mockCreate,
    find: mockFind,
    deleteMany: mockDeleteMany,
  };

  return { default: FrameCache };
});

// Import after mocking
const { analyzeVideo } = await import('./analyzeVideo.js');
const fetch = (await import('node-fetch')).default;
const FrameCache = (await import('../models/frameCacheSchema.js')).default;

/**
 * Builds a mock FrameCache.find() chain that returns frameDocs.
 * Supports .sort().lean() chaining.
 */
function mockFindChain(frameDocs) {
  const chain = { sort: vi.fn(), lean: vi.fn() };
  chain.sort.mockReturnValue(chain);
  chain.lean.mockResolvedValue(frameDocs);
  FrameCache.find.mockReturnValue(chain);
}

/**
 * Sets up exec mock: ffprobe returns `duration`, ffmpeg succeeds.
 */
function mockExec(duration = 60) {
  exec.mockImplementation((cmd, callback) => {
    if (cmd.includes('ffprobe')) {
      callback(null, `${duration}\n`, '');
    } else {
      // ffmpeg frame extraction — always succeeds
      callback(null, '', '');
    }
  });
}

/**
 * Sets up fs mocks so the video file exists and frame files exist after ffmpeg.
 */
function mockFs(videoPath) {
  fs.existsSync.mockImplementation((p) => {
    if (p === videoPath) return true;
    if (p.includes('_frame_')) return true;
    return false;
  });
  // Return a buffer large enough to pass the 1000-byte check
  fs.readFileSync.mockReturnValue(Buffer.alloc(2000, 0xff));
  fs.unlinkSync.mockImplementation(() => {});
}

/**
 * Sets up FrameCache mocks.
 * create() stores a fake doc and returns an _id.
 * find() returns frameDocs built from the stored frames.
 * deleteMany() resolves immediately.
 */
function mockFrameCache(videoPath) {
  let storedFrames = [];

  FrameCache.create.mockImplementation(async ({ videoId, frameIndex, timestamp, base64 }) => {
    const id = `id_${frameIndex}`;
    storedFrames.push({ _id: id, videoId, frameIndex, timestamp, base64 });
    return { _id: id };
  });

  // find() returns whatever was stored, sorted by frameIndex
  FrameCache.find.mockImplementation(() => {
    const sorted = [...storedFrames].sort((a, b) => a.frameIndex - b.frameIndex);
    const chain = {
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(sorted),
    };
    return chain;
  });

  FrameCache.deleteMany.mockResolvedValue({});

  return { getStored: () => storedFrames };
}

describe('Bug Condition Exploration - Frame Count Exceeds Groq Vision API Limit', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-api-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 1 (scoped PBT): For any valid video path, analyzeVideo() must:
   *   - Send ≤ 5 images to the Groq Vision API
   *   - Receive HTTP 200
   *   - Return a valid visual analysis object (not null)
   *
   * UNFIXED code (FRAME_COUNT = 8): sends 8 images → HTTP 400 → returns null → FAILS
   * FIXED code  (FRAME_COUNT = 5): sends 5 images → HTTP 200 → returns object → PASSES
   */
  it('Property 1: analyzeVideo sends ≤5 frames and returns valid result (fails on unfixed code)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }).map(s => `test_${s}.mp4`),
        async (videoPath) => {
          mockExec(60);
          mockFs(videoPath);
          mockFrameCache(videoPath);

          let imageCount = 0;

          fetch.mockImplementation(async (url, options) => {
            if (url.includes('api.groq.com')) {
              const body = JSON.parse(options.body);
              const content = body.messages[0].content;
              imageCount = content.filter(item => item.type === 'image_url').length;

              if (imageCount > 5) {
                return {
                  ok: false,
                  status: 400,
                  text: async () => 'Bad Request: Maximum 5 images per request allowed',
                };
              }

              return {
                ok: true,
                status: 200,
                json: async () => ({
                  choices: [{
                    message: {
                      content: JSON.stringify({
                        eyeContact: 7,
                        bodyLanguage: 8,
                        facialExpression: 6,
                        overallPresence: 7,
                        eyeContactNote: 'Good engagement',
                        bodyLanguageNote: 'Confident posture',
                        expressionNote: 'Natural expressions',
                        visualSuggestions: ['Maintain eye contact'],
                        visualStrengths: ['Strong presence'],
                      }),
                    },
                  }],
                }),
              };
            }
          });

          const result = await analyzeVideo(videoPath);

          // After fix: ≤5 images sent, result is a valid object
          expect(imageCount).toBeLessThanOrEqual(5);
          expect(result).not.toBeNull();
          expect(result).toHaveProperty('eyeContact');
          expect(result).toHaveProperty('bodyLanguage');
          expect(result).toHaveProperty('facialExpression');
          expect(result).toHaveProperty('overallPresence');
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Concrete case: explicit verification that exactly 5 frames are sent.
   */
  it('Concrete case: exactly 5 frames are sent to Groq Vision API after fix', async () => {
    const videoPath = 'test_video.mp4';

    mockExec(60);
    mockFs(videoPath);
    mockFrameCache(videoPath);

    let capturedBody = null;

    fetch.mockImplementation(async (url, options) => {
      if (url.includes('api.groq.com')) {
        capturedBody = JSON.parse(options.body);
        const content = capturedBody.messages[0].content;
        const imageCount = content.filter(item => item.type === 'image_url').length;

        if (imageCount > 5) {
          return {
            ok: false,
            status: 400,
            text: async () => 'Bad Request: Maximum 5 images per request allowed',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  eyeContact: 7,
                  bodyLanguage: 8,
                  facialExpression: 6,
                  overallPresence: 7,
                  eyeContactNote: 'Good',
                  bodyLanguageNote: 'Good',
                  expressionNote: 'Good',
                  visualSuggestions: ['tip'],
                  visualStrengths: ['strength'],
                }),
              },
            }],
          }),
        };
      }
    });

    const result = await analyzeVideo(videoPath);

    expect(capturedBody).not.toBeNull();
    const imageCount = capturedBody.messages[0].content.filter(
      item => item.type === 'image_url'
    ).length;

    // After fix: exactly 5 images (FRAME_COUNT = 5)
    expect(imageCount).toBe(5);
    expect(result).not.toBeNull();
    expect(result.eyeContact).toBe(7);
    expect(result.bodyLanguage).toBe(8);
  });
});
