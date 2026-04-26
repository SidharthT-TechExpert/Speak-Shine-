# Temp File Cleanup Flow

## Complete File Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ 1. VIDEO UPLOAD                                             │
│    POST /api/video/upload                                   │
│    ↓                                                         │
│    Multer saves to: tmp/uploads/[random-name]               │
│    Variable: videoPath                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. VALIDATION (api/routes/videoAnalysis.js)                │
│                                                              │
│    ✅ Duration check with ffprobe                           │
│    ❌ If fails → DELETE videoPath immediately (line 121)    │
│                                                              │
│    ✅ Check < 60s                                           │
│    ❌ If too short → DELETE videoPath (line 126)            │
│                                                              │
│    ✅ Check > 300s                                          │
│    ❌ If too long → DELETE videoPath (line 130)             │
│                                                              │
│    ❌ Any error → DELETE videoPath (line 174)               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. CREATE REPORT & RESPOND                                  │
│    ✅ Report created in MongoDB                             │
│    ✅ Response sent to client                               │
│    ⚠️  videoPath still exists in tmp/uploads/               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. BACKGROUND PROCESSING                                    │
│    processInBackground(reportId, videoPath, ...)            │
│                                                              │
│    ┌──────────────────────────────────────────┐            │
│    │ A. Extract Audio                         │            │
│    │    → Creates: tmp/audio-[id].wav         │            │
│    │    → Deleted by: webVideoProcessor.js    │            │
│    │       (line 201: finally block)          │            │
│    └──────────────────────────────────────────┘            │
│                                                              │
│    ┌──────────────────────────────────────────┐            │
│    │ B. Transcription + Visual Analysis       │            │
│    │    → Uses: videoPath (read-only)         │            │
│    └──────────────────────────────────────────┘            │
│                                                              │
│    ┌──────────────────────────────────────────┐            │
│    │ C. Upload to R2 Cloud Storage            │            │
│    │    → Reads: videoPath                    │            │
│    │    → Uploads to: Cloudflare R2           │            │
│    │    → Stores URL in MongoDB               │            │
│    │    ⚠️  videoPath still in tmp/uploads/   │            │
│    └──────────────────────────────────────────┘            │
│                                                              │
│    ┌──────────────────────────────────────────┐            │
│    │ D. Update Report Status                  │            │
│    │    → status: "completed"                 │            │
│    │    → analysis: {...}                     │            │
│    │    → videoUrl: R2 URL                    │            │
│    └──────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. CLEANUP (ALWAYS RUNS)                                    │
│    finally block in processInBackground()                   │
│    (api/routes/videoAnalysis.js line 345)                   │
│                                                              │
│    🗑️  DELETE tmp/uploads/[random-name]                     │
│        fs.unlinkSync(videoPath)                             │
│                                                              │
│    ✅ Runs on success                                       │
│    ✅ Runs on failure                                       │
│    ✅ Runs on timeout                                       │
│    ✅ Runs on any error                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. FINAL STATE                                              │
│                                                              │
│    ✅ Video stored in: Cloudflare R2 (permanent)            │
│    ✅ Video URL in: MongoDB VideoReport                     │
│    ✅ Analysis in: MongoDB VideoReport                      │
│    ✅ Local temp file: DELETED                              │
│                                                              │
│    📊 Storage breakdown:                                    │
│       • tmp/uploads/: EMPTY (cleaned up)                    │
│       • Cloudflare R2: Video file (12 hours)                │
│       • MongoDB: Report + analysis (12 hours)               │
└─────────────────────────────────────────────────────────────┘
```

## Cleanup Locations in Code

### 1. Early Validation Failures
**File:** `api/routes/videoAnalysis.js`

```javascript
// Line 121 - Duration check fails
if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);

// Line 126 - Video too short
if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);

// Line 130 - Video too long
if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);

// Line 174 - Any upload error
if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
```

### 2. After Processing (Success or Failure)
**File:** `api/routes/videoAnalysis.js`

```javascript
// Line 345 - Always runs in finally block
async function processInBackground(reportId, videoPath, ...) {
  try {
    // ... processing ...
  } catch (err) {
    // ... error handling ...
  } finally {
    // ✅ ALWAYS DELETE - runs no matter what
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  }
}
```

### 3. Audio File Cleanup
**File:** `ai/webVideoProcessor.js`

```javascript
// Line 201 - Audio file cleanup
export async function processWebVideo(videoPath, ...) {
  let audioPath = null;
  try {
    // ... extract audio ...
    audioPath = extracted.audioPath;
    // ... processing ...
  } finally {
    // ✅ Delete audio file
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    // NOTE: videoPath is cleaned up by the caller (videoAnalysis route)
  }
}
```

## Why This Design?

### ✅ Advantages:
1. **Guaranteed Cleanup** - `finally` block always runs
2. **No Orphaned Files** - Even on crashes/timeouts
3. **Efficient Storage** - Only R2 stores long-term
4. **Fast Processing** - Local file access during analysis
5. **Error Recovery** - Cleanup happens even on failure

### 📊 Storage Timeline:
```
Upload → tmp/uploads (0-5 min) → R2 Cloud (12 hours) → Deleted
         ↑                        ↑
         Local temp               Permanent storage
         (processing only)        (user access)
```

## Verification

### Check if cleanup is working:
```bash
# On Railway, check tmp/uploads directory
ls -la tmp/uploads/

# Should only contain .gitkeep
# No video files should remain after processing
```

### Monitor cleanup:
```bash
# Check logs for cleanup confirmation
grep "unlinkSync" logs

# Should see deletions after each processing
```

## Edge Cases Handled

1. ✅ **Processing fails** → finally block deletes
2. ✅ **R2 upload fails** → finally block still deletes (non-fatal)
3. ✅ **Timeout occurs** → finally block deletes
4. ✅ **Server crashes** → Railway restarts, tmp/ is ephemeral
5. ✅ **Validation fails** → Immediate deletion before processing

## Summary

**Temp files are deleted in 2 places:**

1. **Immediately on validation failure** (lines 121, 126, 130, 174)
   - Before processing even starts
   - If duration check fails, video too short/long, or any error

2. **After processing completes** (line 345)
   - In `finally` block of `processInBackground()`
   - Runs whether processing succeeds or fails
   - Guaranteed cleanup

**Result:** No temp files accumulate. All videos are uploaded to R2 for permanent storage, and local copies are always deleted.
