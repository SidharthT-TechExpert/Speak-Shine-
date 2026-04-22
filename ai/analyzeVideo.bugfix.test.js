/**
 * Bug Condition Exploration Test for visual-analysis-failure-fix
 * 
 * Task 1: Write bug condition exploration property test
 * Feature: visual-analysis-failure-fix
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * DO NOT attempt to fix the test or the code when it fails
 * 
 * Property 1: Bug Condition - Six Frames Cause API Rejection
 * 
 * This test encodes the expected behavior after the fix. On unfixed code,
 * it will fail because the code sends 6 frames and gets HTTP 400.
 * After the fix, it will pass because the code sends 5 frames and succeeds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import { exec } from 'child_process';

// We need to mock the modules before importing analyzeVideo
vi.mock('fs');
vi.mock('child_process');
vi.mock('node-fetch');

// Import after mocking
const { analyzeVideo } = await import('./analyzeVideo.js');
const fetch = (await import('node-fetch')).default;

describe('Bug Condition Exploration - Six Frames Cause API Rejection', () => {
  beforeEach(() => {
    // Set up environment
    process.env.GROQ_API_KEY = 'test-api-key';
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 1: Bug Condition - Six Frames Cause API Rejection
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
   * 
   * SCOPED PBT: This is a deterministic bug (frameCount=6 always fails).
   * We scope the property to the concrete failing case: frameCount=6 with any valid video.
   * 
   * EXPECTED BEHAVIOR (after fix):
   * - extractFrames should be called with frameCount <= 5
   * - API request should contain <= 5 images
   * - API should return HTTP 200 with valid JSON
   * - Function should return visual analysis object (not null)
   * 
   * CURRENT BEHAVIOR (unfixed code):
   * - extractFrames is called with frameCount = 6
   * - API request contains 6 images
   * - API returns HTTP 400 "Maximum 5 images per request"
   * - Function logs error and returns null
   * 
   * This test will FAIL on unfixed code, confirming the bug exists.
   */
  it('Property 1: analyzeVideo with 6 frames should succeed (fails on unfixed code)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a valid video path
        fc.string({ minLength: 1, maxLength: 50 }).map(s => `test_video_${s}.mp4`),
        async (videoPath) => {
          // Mock fs.existsSync to return true for the video file
          fs.existsSync.mockImplementation((path) => {
            if (path === videoPath) return true;
            return false; // Frame files don't exist (will be cleaned up)
          });

          // Mock ffprobe to return a valid duration
          exec.mockImplementation((cmd, callback) => {
            if (cmd.includes('ffprobe')) {
              callback(null, '60.0\n', '');
            } else if (cmd.includes('ffmpeg')) {
              // Mock ffmpeg frame extraction
              const frameMatch = cmd.match(/frame_(\d+)\.jpg/);
              if (frameMatch) {
                const timestamp = frameMatch[1];
                const framePath = `${videoPath}_frame_${timestamp}.jpg`;
                
                // Simulate frame file creation
                setTimeout(() => {
                  fs.existsSync.mockImplementation((path) => {
                    if (path === videoPath) return true;
                    if (path === framePath) return true;
                    return false;
                  });
                }, 0);
                
                callback(null, '', '');
              }
            }
          });

          // Mock fs.readFileSync to return valid frame data
          fs.readFileSync.mockReturnValue(Buffer.from('fake-jpeg-data-' + 'x'.repeat(1000)));

          // Mock fs.unlinkSync (cleanup)
          fs.unlinkSync.mockImplementation(() => {});

          // Count how many images are sent to the API
          let imageCount = 0;
          
          // Mock fetch to simulate Groq API behavior
          fetch.mockImplementation(async (url, options) => {
            if (url.includes('api.groq.com')) {
              const body = JSON.parse(options.body);
              const userContent = body.messages[0].content;
              
              // Count image_url entries
              imageCount = userContent.filter(item => item.type === 'image_url').length;
              
              // UNFIXED CODE: sends 6 images → HTTP 400
              // FIXED CODE: sends 5 images → HTTP 200
              if (imageCount > 5) {
                // Simulate API rejection (current buggy behavior)
                return {
                  ok: false,
                  status: 400,
                  text: async () => 'Bad Request: Maximum 5 images per request allowed'
                };
              } else {
                // Simulate successful API response (expected after fix)
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
                          eyeContactNote: "Good engagement",
                          bodyLanguageNote: "Confident posture",
                          expressionNote: "Natural expressions",
                          visualSuggestions: ["Maintain eye contact"],
                          visualStrengths: ["Strong presence"]
                        })
                      }
                    }]
                  })
                };
              }
            }
          });

          // Call analyzeVideo
          const result = await analyzeVideo(videoPath);

          // EXPECTED BEHAVIOR (after fix):
          // - Should send <= 5 images to API
          // - Should receive HTTP 200
          // - Should return valid visual analysis object
          expect(imageCount).toBeLessThanOrEqual(5);
          expect(result).not.toBeNull();
          expect(result).toHaveProperty('eyeContact');
          expect(result).toHaveProperty('bodyLanguage');
          expect(result).toHaveProperty('facialExpression');
          expect(result).toHaveProperty('overallPresence');
          
          // UNFIXED CODE BEHAVIOR:
          // - Sends 6 images
          // - Gets HTTP 400
          // - Returns null
          // This test will FAIL, confirming the bug exists
        }
      ),
      { numRuns: 10 } // Run 10 times with different video paths
    );
  });

  /**
   * Additional verification: Explicitly test the 6-frame scenario
   * 
   * This is a concrete unit test that demonstrates the exact bug condition.
   * It will FAIL on unfixed code, showing the counterexample clearly.
   */
  it('Concrete case: 6 frames cause HTTP 400 (fails on unfixed code)', async () => {
    const videoPath = 'test_video.mp4';
    
    // Mock fs.existsSync
    fs.existsSync.mockImplementation((path) => {
      if (path === videoPath) return true;
      if (path.includes('_frame_')) return true;
      return false;
    });

    // Mock ffprobe to return 60 second duration
    exec.mockImplementation((cmd, callback) => {
      if (cmd.includes('ffprobe')) {
        callback(null, '60.0\n', '');
      } else if (cmd.includes('ffmpeg')) {
        callback(null, '', '');
      }
    });

    // Mock fs.readFileSync to return valid frame data
    fs.readFileSync.mockReturnValue(Buffer.from('fake-jpeg-data-' + 'x'.repeat(1000)));
    fs.unlinkSync.mockImplementation(() => {});

    let apiRequestBody = null;
    
    // Mock fetch to capture the request
    fetch.mockImplementation(async (url, options) => {
      if (url.includes('api.groq.com')) {
        apiRequestBody = JSON.parse(options.body);
        const userContent = apiRequestBody.messages[0].content;
        const imageCount = userContent.filter(item => item.type === 'image_url').length;
        
        if (imageCount > 5) {
          return {
            ok: false,
            status: 400,
            text: async () => 'Bad Request: Maximum 5 images per request allowed'
          };
        } else {
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
                    eyeContactNote: "Good",
                    bodyLanguageNote: "Good",
                    expressionNote: "Good",
                    visualSuggestions: ["tip"],
                    visualStrengths: ["strength"]
                  })
                }
              }]
            })
          };
        }
      }
    });

    // Call analyzeVideo
    const result = await analyzeVideo(videoPath);

    // Verify the API request
    expect(apiRequestBody).not.toBeNull();
    const userContent = apiRequestBody.messages[0].content;
    const imageCount = userContent.filter(item => item.type === 'image_url').length;

    // EXPECTED BEHAVIOR (after fix): <= 5 images, result is not null
    expect(imageCount).toBeLessThanOrEqual(5);
    expect(result).not.toBeNull();
    
    // UNFIXED CODE: sends 6 images, result is null
    // This assertion will FAIL on unfixed code, confirming the bug
  });
});
