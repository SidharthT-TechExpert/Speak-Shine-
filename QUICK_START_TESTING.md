# Quick Start - Testing Cache Implementation Locally

## 🚀 Fast Track Testing (5 minutes)

### Step 1: Run the Automated Test Suite

```bash
# Run the cache test script
node scripts/test-cache.js
```

**Expected Output:**
```
🧪 Cache Implementation Test Suite

ℹ️  Testing: Redis connection check
  ✅ Redis is available and responding
✅ PASS: Redis connection check

ℹ️  Testing: Cache key generation
  ✅ All cache keys generated correctly
✅ PASS: Cache key generation

ℹ️  Testing: Cache MISS on first request
  ✅ Cache MISS worked - function was called
✅ PASS: Cache MISS on first request

ℹ️  Testing: Cache HIT on second request
  ✅ Cache HIT worked - function was not called again
✅ PASS: Cache HIT on second request

ℹ️  Testing: Cache expiration after TTL
  ℹ️  Waiting 2 seconds for cache to expire...
  ✅ Cache expired correctly after TTL
✅ PASS: Cache expiration after TTL

ℹ️  Testing: invalidateOnUpload clears correct caches
  ✅ Correct caches were invalidated
✅ PASS: invalidateOnUpload clears correct caches

ℹ️  Testing: invalidateOnSubmissionChange clears reports
  ✅ Correct report caches were invalidated
✅ PASS: invalidateOnSubmissionChange clears reports

ℹ️  Testing: invalidateAll clears all caches
  ✅ All caches were invalidated
✅ PASS: invalidateAll clears all caches

ℹ️  Testing: TTL_18H constant is correct
  ✅ TTL is correctly set to 64800 seconds (18 hours)
✅ PASS: TTL_18H constant is correct

==================================================

📊 Test Results:

✅ Passed: 9
Total:  9

🎉 All tests passed! Cache implementation is working correctly.
```

### Step 2: Start the Application and Watch Logs

```bash
# Terminal 1 - Start the API server
npm run start:api

# Watch for cache logs like:
# [Cache] MISS dashboard:overview
# [Cache] HIT  dashboard:overview
# [Cache] Invalidated on upload for 919876543210
```

### Step 3: Test in Browser (Optional)

```bash
# Terminal 2 - Start the frontend
cd frontend
npm run dev
```

Then:
1. Open http://localhost:5173
2. Login as admin
3. Navigate to different tabs
4. Watch Terminal 1 for cache HIT/MISS logs

## ✅ Success Checklist

- [ ] `node scripts/test-cache.js` passes all 9 tests
- [ ] App starts without errors
- [ ] You see cache MISS logs on first request
- [ ] You see cache HIT logs on subsequent requests
- [ ] No errors in console

## 🐛 If Tests Fail

### Redis Connection Error
```bash
# Start Redis if not running
redis-server

# Or test without Redis (will use in-memory fallback)
# The tests should still pass
```

### Import Errors
```bash
# Make sure you're in the project root
cd /path/to/speak-shine-webapp

# Check Node version (should be 18+)
node --version
```

### Module Not Found
```bash
# Install dependencies
npm install
```

## 📚 Detailed Testing

For comprehensive testing with manual steps, see:
- **CACHE_TESTING_GUIDE.md** - Full testing guide with cURL examples
- **CACHE_STRATEGY.md** - Complete cache strategy documentation

## 🚀 Ready to Deploy?

Once all tests pass:
1. ✅ Automated tests pass
2. ✅ Manual testing confirms cache behavior
3. ✅ No errors in logs
4. 🎯 **You're ready to deploy!**

---

**Questions?** Check the detailed guides or review the implementation in:
- `backend/services/cache/cacheService.js`
- `backend/services/dashboard/dashboardService.js`
- `backend/controllers/submissionsController.js`
