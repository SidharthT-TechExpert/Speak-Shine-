# Cache Implementation - Local Testing Guide

## Prerequisites

Before testing, ensure you have:
- ✅ MongoDB running locally or connection to remote MongoDB
- ✅ Redis running locally (optional - will fall back to in-memory cache)
- ✅ All environment variables configured in `.env`

## Step 1: Start the Application

### Terminal 1 - Backend API
```bash
npm run start:api
```

**Expected Output:**
```
[Server] Starting on port 5000...
[MongoDB] Connected successfully
[Redis] Connected successfully (or "Redis unavailable, using in-memory cache")
[Scheduler] Starting question scheduler...
[Scheduler] Starting daily reset scheduler...
[Server] ✅ Server running on http://localhost:5000
```

### Terminal 2 - Frontend (if testing UI)
```bash
cd frontend
npm run dev
```

**Expected Output:**
```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

## Step 2: Monitor Cache Logs

Watch for cache-related log messages in Terminal 1:

### Cache Hit/Miss Logs
```
[Cache] MISS dashboard:overview
[Cache] MISS dashboard:weekly
[Cache] HIT  dashboard:overview
[Cache] HIT  profile:user:919876543210
```

### Invalidation Logs
```
[Cache] Invalidated on upload for 919876543210
[Cache] Invalidated weekly + monthly reports (submission adjusted)
[Cache] Invalidated all dashboard + profile caches (midnight reset)
```

## Step 3: Test Cache Behavior

### Test 1: Dashboard Overview Cache (18h TTL)

**Using cURL:**
```bash
# Login first to get token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"YOUR_ADMIN_PHONE","password":"YOUR_PASSWORD"}'

# Save the token from response, then:
TOKEN="your_jwt_token_here"

# First request - should see MISS in logs
curl -X GET http://localhost:5000/api/dashboard \
  -H "Authorization: Bearer $TOKEN"

# Second request immediately - should see HIT in logs
curl -X GET http://localhost:5000/api/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Logs:**
```
[Cache] MISS dashboard:overview
[Cache] MISS dashboard:weekly
[Cache] MISS dashboard:monthly
[Cache] HIT  dashboard:overview
[Cache] HIT  dashboard:weekly
[Cache] HIT  dashboard:monthly
```

**Using Browser:**
1. Open http://localhost:5173 (or your frontend URL)
2. Login as admin
3. Navigate to Admin Dashboard
4. Check Terminal 1 for cache MISS logs
5. Refresh the page
6. Check Terminal 1 for cache HIT logs

### Test 2: User Profile Cache (18h TTL)

**Using cURL:**
```bash
# First request - should see MISS
curl -X GET http://localhost:5000/api/dashboard/profile \
  -H "Authorization: Bearer $TOKEN"

# Second request - should see HIT
curl -X GET http://localhost:5000/api/dashboard/profile \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Logs:**
```
[Cache] MISS profile:user:919876543210
[Cache] HIT  profile:user:919876543210
```

### Test 3: Cache Invalidation on Video Upload

**Using Browser:**
1. Login as a user
2. Go to User Dashboard
3. Upload a video
4. Check Terminal 1 for invalidation log:
   ```
   [Cache] Invalidated on upload for 919876543210
   ```
5. Refresh the dashboard
6. Check Terminal 1 for cache MISS (cache was cleared)

**Using cURL:**
```bash
# Upload a video (simplified - actual upload is multipart)
# After upload completes, check logs for:
# [Cache] Invalidated on upload for 919876543210

# Then request profile again - should see MISS
curl -X GET http://localhost:5000/api/dashboard/profile \
  -H "Authorization: Bearer $TOKEN"
```

### Test 4: Cache Invalidation on Submission Adjustment

**Using Browser:**
1. Login as admin/trainer
2. Go to Admin Dashboard → Submissions tab
3. Click +/- button to adjust a user's weekly or monthly submissions
4. Check Terminal 1 for invalidation log:
   ```
   [Cache] Invalidated weekly + monthly reports (submission adjusted)
   ```
5. Go to Reports tab
6. Check Terminal 1 for cache MISS on weekly/monthly reports

**Using cURL:**
```bash
# Adjust weekly submissions
curl -X PATCH http://localhost:5000/api/submissions/919876543210/weekly \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"delta":1}'

# Check logs for:
# [Cache] Invalidated weekly + monthly reports (submission adjusted)

# Request weekly report - should see MISS
curl -X GET http://localhost:5000/api/dashboard/report/weekly \
  -H "Authorization: Bearer $TOKEN"
```

### Test 5: Midnight Reset Invalidation

**Manual Trigger (for testing):**
```bash
# You can manually trigger the daily reset to test invalidation
# Add this temporary endpoint to api/server.js for testing:

app.post("/api/test/trigger-reset", async (req, res) => {
  const { invalidateAll } = await import("./backend/services/cache/cacheService.js");
  await invalidateAll();
  res.json({ success: true, message: "All caches cleared" });
});

# Then call it:
curl -X POST http://localhost:5000/api/test/trigger-reset
```

**Expected Logs:**
```
[Cache] Invalidated all dashboard + profile caches (midnight reset)
```

**Next requests should all be MISS:**
```
[Cache] MISS dashboard:overview
[Cache] MISS dashboard:weekly
[Cache] MISS dashboard:monthly
[Cache] MISS profile:user:919876543210
```

## Step 4: Test Redis vs In-Memory Fallback

### With Redis Running
```bash
# Start Redis
redis-server

# Start your app
npm run start:api

# Expected log:
[Redis] Connected successfully
```

### Without Redis
```bash
# Stop Redis
redis-cli shutdown

# Start your app
npm run start:api

# Expected log:
[Redis] Redis unavailable, using in-memory cache
```

**Test that caching still works:**
- Make requests to dashboard endpoints
- Should still see HIT/MISS logs
- Cache should work using in-memory Map

## Step 5: Verify Cache TTL (18 hours)

Since 18 hours is too long to wait, you can temporarily modify the TTL for testing:

**Temporary Change for Testing:**
```javascript
// In backend/services/cache/cacheService.js
export const TTL_18H = 60; // Change to 60 seconds for testing
```

**Test:**
1. Make a request → Cache MISS
2. Make same request → Cache HIT
3. Wait 61 seconds
4. Make same request → Cache MISS (expired)

**Remember to change it back to 18 hours after testing!**

## Step 6: Test Cache Keys

### Check Redis Keys (if using Redis)
```bash
# Connect to Redis CLI
redis-cli

# List all cache keys
KEYS dashboard:*
KEYS profile:*

# Check a specific key
GET dashboard:overview
GET profile:user:919876543210

# Check TTL (time to live in seconds)
TTL dashboard:overview
# Should return ~64800 (18 hours in seconds)

# Manually delete a key to test invalidation
DEL dashboard:overview

# Exit Redis CLI
exit
```

## Step 7: Load Testing (Optional)

Test cache performance under load:

```bash
# Install Apache Bench (if not installed)
# macOS: brew install httpd
# Ubuntu: sudo apt-get install apache2-utils

# Test dashboard endpoint (100 requests, 10 concurrent)
ab -n 100 -c 10 -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/dashboard

# Check results:
# - First request: slower (cache miss)
# - Subsequent 99 requests: much faster (cache hits)
```

## Expected Results Summary

### ✅ Success Indicators

1. **Cache Hits**: After first request, subsequent requests show HIT logs
2. **Cache Misses**: First request and after invalidation show MISS logs
3. **Invalidation Works**: 
   - Video upload clears user profile + overview + community
   - Submission adjustment clears weekly + monthly reports
   - Midnight reset clears all caches
4. **Fallback Works**: App works with or without Redis
5. **Performance**: Cached requests are significantly faster

### ❌ Failure Indicators

1. **Always MISS**: Cache not storing values (check Redis connection)
2. **No Invalidation Logs**: Invalidation functions not being called
3. **Stale Data**: Cache not being cleared when it should be
4. **Errors**: Check for import errors or missing functions

## Troubleshooting

### Issue: Cache always shows MISS
**Solution:**
- Check Redis connection
- Verify `isRedisAvailable()` returns true
- Check for errors in cache service

### Issue: Invalidation not working
**Solution:**
- Verify invalidation functions are imported correctly
- Check that `.catch(() => {})` isn't hiding errors
- Add console.log to confirm functions are called

### Issue: Redis connection fails
**Solution:**
- Check Redis is running: `redis-cli ping` (should return PONG)
- Verify REDIS_URL in .env
- Check Redis logs: `redis-cli INFO`

### Issue: Cache not expiring
**Solution:**
- Check TTL is set correctly
- Verify Redis TTL: `redis-cli TTL dashboard:overview`
- Ensure `EX` parameter is passed to Redis SET command

## Clean Up After Testing

```bash
# Clear all cache keys in Redis
redis-cli FLUSHDB

# Or clear specific patterns
redis-cli --scan --pattern "dashboard:*" | xargs redis-cli DEL
redis-cli --scan --pattern "profile:*" | xargs redis-cli DEL

# Restart the app to clear in-memory cache
# Ctrl+C in Terminal 1, then npm run start:api
```

## Next Steps

Once local testing is successful:
1. ✅ Verify all cache operations work correctly
2. ✅ Confirm invalidation triggers at the right times
3. ✅ Test with and without Redis
4. ✅ Check performance improvements
5. 🚀 Deploy to production with confidence!

## Quick Test Checklist

- [ ] App starts without errors
- [ ] First dashboard request shows MISS logs
- [ ] Second dashboard request shows HIT logs
- [ ] Video upload triggers invalidation
- [ ] Submission adjustment triggers invalidation
- [ ] Cache works with Redis
- [ ] Cache works without Redis (in-memory fallback)
- [ ] No errors in console
- [ ] Performance is noticeably faster on cache hits

---

**Ready to test?** Start with Step 1 and work through each test case. Report any issues you encounter!
