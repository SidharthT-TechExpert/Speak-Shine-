# Video Upload Fixes - Complete Documentation

## Issue 1: CSP Blocking R2 Video Uploads ✅ FIXED
**Status**: Resolved  
**Date**: 2026-04-30

### Problem
Content Security Policy (CSP) was blocking:
1. R2 presigned URL uploads (connect-src)
2. Google Fonts loading (font-src, style-src)
3. Video recording in browser

### Root Cause
R2 presigned URLs use the pattern: `https://bucket.account-id.r2.cloudflarestorage.com`
- The bucket name is dynamic
- The account ID is fixed: `95507d8602ddb955795f0d78ed3d2df5`
- Required specific wildcard pattern in CSP
- CSP wildcards only match ONE level: `*.example.com` matches `sub.example.com` but NOT `sub.sub.example.com`

### Solution
Updated CSP in `api/server.js`:
```javascript
"connect-src": [
  "'self'",
  "https://*.95507d8602ddb955795f0d78ed3d2df5.r2.cloudflarestorage.com", // R2 presigned URLs
  "https://pub-1c5ce667ea4445fb98d667349b649704.r2.dev", // R2 public URL
  // ... other domains
],
"font-src": ["'self'", "https://fonts.gstatic.com"],
"style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
```

### Verification
- ✅ R2 uploads work without CSP errors
- ✅ MIME type validation handles `video/webm;codecs=vp9,opus` correctly (splits on `;`)
- ✅ Google Fonts load properly

---

## Issue 2: Express 5 Wildcard Route Crash ✅ FIXED
**Status**: Resolved  
**Date**: 2026-04-30

### Problem
Server crashed immediately on startup with:
```
PathError: Missing parameter name at index 1: *
```

### Root Cause
Express 5 with newer `path-to-regexp` doesn't support wildcard routes:
- `app.get("*")` → Error at index 1
- `app.get("/*")` → Error at index 2

### Solution
Changed from route handler to middleware pattern in `api/server.js` (line ~433):
```javascript
// OLD (broken in Express 5):
app.get("*", (req, res) => { ... });

// NEW (Express 5 compatible):
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    return res.sendFile(path.join(distPath, "index.html"));
  }
  next();
});
```

### Verification
- ✅ Server starts successfully
- ✅ SPA routing works correctly
- ✅ API routes not affected

---

## Issue 3: JWT_SECRET Module Initialization Order ✅ FIXED
**Status**: Resolved  
**Date**: 2026-04-30

### Problem
Server failed to start locally with:
```
❌ FATAL: JWT_SECRET environment variable is not set.
```
Even though `.env` file existed and contained `JWT_SECRET`.

### Root Cause
ES6 module initialization order issue:
1. `api/server.js` imports route files at the top
2. Route files (`auth.js`, `users.js`) import `auth.js` middleware
3. These files check `process.env.JWT_SECRET` **during import time**
4. This happens **before** `dotenv.config()` runs in `server.js`

The environment loading logs never appeared because the code crashed during module import, before any code in `server.js` could execute.

### Solution
Replaced eager initialization with lazy getter pattern in:
- `api/middleware/auth.js`
- `api/routes/auth.js`
- `api/routes/users.js`

```javascript
// OLD (broken - checks at import time):
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET environment variable is not set.");
  process.exit(1);
}

// NEW (works - checks at runtime):
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

// Usage:
jwt.sign(payload, getJwtSecret(), options);
jwt.verify(token, getJwtSecret());
```

### Verification
Server logs now show:
```
[ENV] JWT_SECRET loaded: true
✅ MongoDB Connected
✅ Speak & Shine API running on port 3001
```

---

## Issue 4: FFmpeg Missing in Railway Deployment ⚠️ IN PROGRESS
**Status**: Investigating  
**Date**: 2026-04-30

### Problem
Video processing fails with:
```
[ffprobe] failed: spawn ffprobe ENOENT
[Queue] failed: Could not read video duration
```

### Root Cause
`ffprobe` (part of ffmpeg) not found in Railway container PATH.

### Attempted Solutions
1. ✅ Updated `nixpacks.webapp.toml` to use `ffmpeg-full` instead of `ffmpeg`
2. ✅ Removed invalid `aptPkgs` (Nixpacks doesn't support apt, only nix packages)
3. ✅ Added verification commands to check ffmpeg installation during build

### Current Configuration (`nixpacks.webapp.toml`)
```toml
[phases.setup]
nixPkgs = ["nodejs_22", "ffmpeg-full", "vips"]

[phases.install]
cmds = [
  "echo '=== Verifying ffmpeg installation ==='",
  "which ffmpeg || echo 'WARNING: ffmpeg not found in PATH'",
  "which ffprobe || echo 'WARNING: ffprobe not found in PATH'",
  "ffmpeg -version || echo 'WARNING: ffmpeg not executable'",
  "ffprobe -version || echo 'WARNING: ffprobe not executable'",
  # ... npm install commands
]
```

### Next Steps
1. ⏳ Wait for Railway rebuild to complete
2. 🔍 Check build logs for ffmpeg verification output
3. If ffmpeg is installed but not in PATH, may need to:
   - Set PATH environment variable in Railway
   - Use absolute path to ffmpeg in code
   - Try different nixpkg package name (e.g., `ffmpeg_6-full`)

### Affected Code
- `ai/webVideoProcessor.js` - `getVideoDuration()` function uses `ffprobe`
- `api/routes/videoAnalysis.js` - Video upload route calls `getVideoDuration()`

---

## Summary

| Issue | Status | Impact |
|-------|--------|--------|
| CSP blocking R2 uploads | ✅ Fixed | High - Users can upload videos |
| Express 5 wildcard crash | ✅ Fixed | Critical - Server starts |
| JWT_SECRET initialization | ✅ Fixed | Critical - Local development works |
| FFmpeg missing | ⚠️ In Progress | High - Video processing fails |

## Files Modified
- `api/server.js` - CSP config, Express 5 routing, dotenv loading
- `api/middleware/auth.js` - Lazy JWT_SECRET getter
- `api/routes/auth.js` - Lazy JWT_SECRET getter
- `api/routes/users.js` - Lazy JWT_SECRET getter
- `nixpacks.webapp.toml` - ffmpeg installation and verification

## Environment Notes
- **Railway**: Uses environment variables from dashboard, not `.env` file
- **Local**: Uses `.env` file loaded by `dotenv.config()`
- **Security features**: All optional features remain disabled by default
  - `ENABLE_CODEC_VALIDATION=false`
  - `ENABLE_VIRUS_SCAN=false`
  - `ENABLE_CONTENT_MODERATION=false`

## Testing Checklist

### Local Testing
- [x] Server starts without JWT_SECRET error
- [x] Environment variables load correctly from `.env`
- [ ] Video recording works with webcam
- [ ] Upload progress shows correctly
- [ ] Video analysis completes successfully

### Railway Deployment Testing
- [x] Server starts successfully
- [x] No Express 5 wildcard route errors
- [x] CSP allows R2 uploads
- [ ] FFmpeg/ffprobe available in container
- [ ] Video processing completes successfully
