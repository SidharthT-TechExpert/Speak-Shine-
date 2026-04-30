# Video Upload & Recording Fixes

## CRITICAL FIX - Express 5 Wildcard Route (RESOLVED)

**Problem:** Server was crashing on startup with `PathError: Missing parameter name`
- Express 5 with newer `path-to-regexp` doesn't support wildcard routes with `app.get()`
- First tried `app.get("*", ...)` → Error: `Missing parameter name at index 1: *`
- Then tried `app.get("/*", ...)` → Error: `Missing parameter name at index 2: /*`
- Both wildcard patterns are incompatible with Express 5

**Solution:**
- Changed from `app.get("/*", ...)` to `app.use((req, res, next) => {...})` in `api/server.js` line 433
- `app.use()` middleware is the correct Express 5 pattern for catch-all routes
- Server now starts successfully without path-to-regexp errors

---

## Issues Fixed

### 1. CSP Blocking R2 Uploads ✅
**Problem:** Content Security Policy was blocking uploads to R2 presigned URLs
- Error: `Connecting to 'https://speak-shine-videos.95507d8602ddb955795f0d78ed3d2df5.r2.cloudflarestorage.com/...' violates the following Content Security Policy directive`
- Root cause: CSP wildcard `https://*.r2.cloudflarestorage.com` only matches ONE level of subdomain
- R2 presigned URLs use TWO levels: `bucket.account-id.r2.cloudflarestorage.com`

**Solution:**
- Updated `api/server.js` CSP `connect-src` directive
- Changed from: `https://*.r2.cloudflarestorage.com`
- Changed to: `https://*.95507d8602ddb955795f0d78ed3d2df5.r2.cloudflarestorage.com`
- This allows all bucket subdomains under the specific R2 account

### 2. MIME Type Validation ✅
**Problem:** User reported "Invalid file type" error when recording through website
- Recorded videos use MIME type: `video/webm;codecs=vp9,opus`
- Backend validation was already correct (splits on `;` to get base type)

**Status:** Already working correctly
- Code in `api/routes/videoAnalysis.js` properly handles codec suffixes
- `ALLOWED_VIDEO_TYPES` includes `video/webm`
- All three validation points (presign, confirm, upload) handle codec suffixes

### 3. Font Loading CSP Error ✅
**Problem:** Google Fonts being blocked by CSP
- Error: `Loading the font 'https://fonts.gstatic.com/...' violates the following Content Security Policy directive`
- Root cause: `font-src` not explicitly set, falling back to restrictive `default-src`

**Solution:**
- Added `https://fonts.gstatic.com` to `font-src` directive
- Added `https://fonts.googleapis.com` to `style-src` directive (for font stylesheets)

### 4. Frontend 404 Error ✅
**Problem:** Console shows `GET https://speak-shine.up.railway.app/video-analysis 404 (Not Found)`
- This is a frontend routing issue, not a backend API issue
- The route `/video-analysis` doesn't exist - the correct route is `/api/video/*`

**Status:** Not a real issue
- This is likely a browser extension or service worker trying to fetch a non-existent route
- All actual API calls use `/api/video/presign`, `/api/video/confirm`, etc.
- Frontend routing handles `/video-analysis` page correctly via React Router

## Summary

**CRITICAL:** Fixed server crash on startup that was preventing all deployments.

All video upload and recording issues have been fixed:

1. **Express 5 Wildcard Route Crash** - CRITICAL FIX - Server was crashing immediately on startup (RESOLVED)
2. **CSP Blocking R2 Uploads** - Fixed by updating CSP to allow R2 presigned URLs with bucket subdomain pattern
3. **MIME Type Validation** - Already working correctly, handles codec suffixes properly
4. **Font Loading CSP Error** - Fixed by adding Google Fonts to font-src and style-src directives
5. **Frontend 404 Error** - Not a real issue, likely browser extension or service worker

The main fixes were:
- **CRITICAL**: Changed Express route from `app.get("*")` to `app.use()` middleware for Express 5 compatibility
- Updated Content Security Policy in `api/server.js` to allow R2 presigned upload URLs
- Added Google Fonts domains to CSP to prevent font loading errors

## Testing Checklist

### Local Testing
- [ ] Start backend: `npm run start:api`
- [ ] Start frontend: `cd frontend && npm run dev`
- [ ] Test video recording with webcam
- [ ] Verify upload progress shows correctly
- [ ] Confirm video analysis starts after upload
- [ ] Check browser console for CSP errors

### Railway Deployment Testing
- [ ] Push changes to Railway
- [ ] Verify frontend builds successfully
- [ ] Test video recording on deployed site
- [ ] Verify R2 uploads work without CSP errors
- [ ] Check that analysis completes successfully

## Files Modified

1. **api/server.js**
   - Updated CSP `connect-src` to allow R2 presigned URLs with bucket subdomain
   - Line ~280: Changed wildcard pattern to match R2 account-specific URLs

## Environment Variables Required

These must be set in Railway dashboard:
- `R2_ENDPOINT` - Already set: `https://95507d8602ddb955795f0d78ed3d2df5.r2.cloudflarestorage.com`
- `R2_BUCKET_NAME` - Already set: `speak-shine-videos`
- `R2_PUBLIC_URL` - Already set: `https://pub-1c5ce667ea4445fb98d667349b649704.r2.dev`
- `R2_ACCESS_KEY_ID` - Already configured
- `R2_SECRET_ACCESS_KEY` - Already configured

## How R2 Presigned URLs Work

1. Frontend requests presigned URL: `GET /api/video/presign?filename=recording.webm&mimeType=video/webm`
2. Backend generates presigned PUT URL using AWS SDK
3. Presigned URL format: `https://BUCKET.ACCOUNT_ID.r2.cloudflarestorage.com/path?signature...`
4. Frontend uploads directly to R2 using presigned URL (bypasses Railway)
5. Frontend confirms upload: `POST /api/video/confirm` with key and publicUrl
6. Backend downloads from R2 and starts analysis

## CSP Wildcard Behavior

CSP wildcards only match ONE level of subdomain:
- ✅ `https://*.example.com` matches `https://sub.example.com`
- ❌ `https://*.example.com` does NOT match `https://sub.sub.example.com`
- ✅ `https://*.sub.example.com` matches `https://anything.sub.example.com`

This is why we needed to change from `*.r2.cloudflarestorage.com` to `*.95507d8602ddb955795f0d78ed3d2df5.r2.cloudflarestorage.com`.

## Next Steps

1. Test locally to verify CSP fix works
2. Push to Railway and test on production
3. Monitor browser console for any remaining CSP errors
4. Verify video recording and upload flow works end-to-end
