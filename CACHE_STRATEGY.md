# Dashboard Cache Strategy

## Overview
Simplified caching strategy for all dashboard endpoints with 18-hour TTL and smart invalidation.

## Cache Configuration

### TTL (Time To Live)
- **All dashboard caches**: 18 hours (64,800 seconds)
- Defined in: `backend/services/cache/cacheService.js`

### Cache Keys
```javascript
userProfileKey(phone)  → `profile:user:${phone}`     // Individual user profile
OVERVIEW_KEY           → `dashboard:overview`         // Today's overview (all roles)
WEEKLY_KEY             → `dashboard:weekly`           // Weekly report (admin/trainer)
MONTHLY_KEY            → `dashboard:monthly`          // Monthly report (admin/trainer)
COMMUNITY_KEY          → `dashboard:community`        // Community feed
```

## Cached Endpoints

### 1. User Profile (`getUserProfile`)
- **Cache Key**: `profile:user:${phone}`
- **TTL**: 18 hours
- **Endpoint**: `GET /api/dashboard/profile`
- **Data**: Full user profile with today's question, daily report, stats, and leaderboard

### 2. Today's Overview (`getTodayOverview`)
- **Cache Key**: `dashboard:overview`
- **TTL**: 18 hours
- **Endpoint**: `GET /api/dashboard/today`
- **Data**: Today's question, completion stats, total fines, top streaks

### 3. Weekly Report (`getWeeklyReport`)
- **Cache Key**: `dashboard:weekly`
- **TTL**: 18 hours
- **Endpoint**: `GET /api/dashboard/weekly`
- **Data**: All users sorted by weekly submissions

### 4. Monthly Report (`getMonthlyReport`)
- **Cache Key**: `dashboard:monthly`
- **TTL**: 18 hours
- **Endpoint**: `GET /api/dashboard/monthly`
- **Data**: All users sorted by monthly submissions

## Cache Invalidation

### On Video Upload (`invalidateOnUpload`)
**Triggered**: When a user uploads a video (direct or confirmed)
**Clears**:
- User's profile cache: `profile:user:${phone}`
- Overview cache: `dashboard:overview`
- Community feed cache: `dashboard:community`

**Called from**:
- `backend/services/video/videoService.js` → `confirmDirectUpload()` (after report creation)
- `backend/services/video/videoService.js` → `uploadVideo()` (after report creation)
- `backend/services/video/videoQueue.js` → `processNext()` (after video processing completes)

### On Submission Change (`invalidateOnSubmissionChange`)
**Triggered**: When admin/trainer manually adjusts submission counts
**Clears**:
- Weekly report cache: `dashboard:weekly`
- Monthly report cache: `dashboard:monthly`

**Called from**:
- `backend/controllers/submissionsController.js` → `adjustWeeklySubmissions()` (after adjustment)
- `backend/controllers/submissionsController.js` → `adjustMonthlySubmissions()` (after adjustment)

### At Midnight Reset (`invalidateAll`)
**Triggered**: Daily at 12:00 AM IST (after daily reset completes)
**Clears**:
- All dashboard caches: `dashboard:*`
- All profile caches: `profile:*`

**Called from**:
- `api/scheduler.js` → `dailyReset()` (after fines, streaks, and resets are applied)

## Implementation Files

### Cache Service
**File**: `backend/services/cache/cacheService.js`
- Exports cache keys and TTL constants
- Provides `cached()` helper for get-or-compute pattern
- Implements `invalidateOnUpload()` and `invalidateAll()`
- Redis-backed with in-memory fallback

### Dashboard Service
**File**: `backend/services/dashboard/dashboardService.js`
- All dashboard methods wrapped with `cached()` helper
- Uses 18h TTL for all endpoints

### Video Service
**File**: `backend/services/video/videoService.js`
- Calls `invalidateOnUpload()` after video upload confirmation
- Invalidates user profile + overview + community feed

### Video Queue
**File**: `backend/services/video/videoQueue.js`
- Calls `invalidateOnUpload()` after video processing completes
- Ensures community feed shows newly completed videos

### Scheduler
**File**: `api/scheduler.js`
- Calls `invalidateAll()` at midnight after daily reset
- Ensures everyone gets fresh data after counters reset

## Cache Flow Examples

### Example 1: User Uploads Video
1. User uploads video → `confirmDirectUpload()` or `uploadVideo()`
2. Report created with `status: "processing"`
3. `invalidateOnUpload(phone)` called immediately
   - Clears: `profile:user:${phone}`, `dashboard:overview`, `dashboard:community`
4. User's dashboard shows `completed: true` immediately
5. Video queued for AI processing
6. When processing completes → `invalidateOnUpload(phone)` called again
   - Ensures community feed shows the new video

### Example 2: Admin Adjusts Submissions
1. Admin/trainer adjusts weekly or monthly submission count
2. `adjustWeeklySubmissions()` or `adjustMonthlySubmissions()` updates DB
3. `invalidateOnSubmissionChange()` called
   - Clears: `dashboard:weekly`, `dashboard:monthly`
4. Next request to weekly/monthly reports fetches fresh data

### Example 3: Midnight Reset
1. Clock hits 12:00 AM IST
2. `generateDailyReports()` runs (reads current `completed` flags)
3. `dailyReset()` runs:
   - Applies fines to users who missed today
   - Updates streaks
   - Applies 7-day streak rewards
   - Increments weekly/monthly counters
   - Resets `completed` flags
   - Resets status flags
4. `invalidateAll()` called at the end
   - Clears: `dashboard:*`, `profile:*`
5. Next request gets fresh data with reset counters

### Example 4: Cache Hit
1. User A requests profile → Cache MISS → Fetch from DB → Store for 18h
2. User A requests profile again (within 18h) → Cache HIT → Return cached data
3. User A uploads video → Cache invalidated
4. User A requests profile → Cache MISS → Fetch fresh data → Store for 18h

## Benefits

### Performance
- **Reduced DB load**: Dashboard queries cached for 18 hours
- **Fast response times**: Cache hits return instantly
- **Scalability**: Can handle many concurrent users

### Consistency
- **Immediate updates**: Video uploads invalidate relevant caches
- **Daily freshness**: Midnight reset clears all caches
- **No stale data**: Smart invalidation ensures users see current state

### Simplicity
- **Single TTL**: All caches use 18h (no complex expiration logic)
- **Two invalidation points**: Upload and midnight (easy to reason about)
- **Predictable behavior**: Clear rules for when caches refresh

## Monitoring

### Cache Logs
All cache operations log to console:
```
[Cache] HIT  profile:user:919876543210
[Cache] MISS dashboard:overview
[Cache] Invalidated on upload for 919876543210
[Cache] Invalidated all dashboard + profile caches (midnight reset)
```

### Redis Fallback
If Redis is unavailable, the cache service automatically falls back to in-memory storage with the same TTL and invalidation logic.

## Future Enhancements

### Potential Optimizations
1. **Selective invalidation**: Only invalidate affected user's profile on upload (not overview)
2. **Cache warming**: Pre-populate caches after midnight reset
3. **Stale-while-revalidate**: Return cached data while fetching fresh data in background
4. **Cache versioning**: Add version keys to force invalidation on schema changes

### Monitoring Improvements
1. **Cache hit rate metrics**: Track hit/miss ratio per endpoint
2. **Invalidation frequency**: Monitor how often caches are cleared
3. **Performance metrics**: Measure response time improvement from caching
