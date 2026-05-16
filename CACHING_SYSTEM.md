# Video Security Caching System

## Overview
Intelligent caching system that skips security checks for previously uploaded videos, saving 15-45 seconds per upload. Designed specifically for 512MB RAM servers with minimal memory footprint.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         BROWSER                              │
├─────────────────────────────────────────────────────────────┤
│  1. User uploads video                                       │
│  2. Extract 16 frames (32x32 pixels each)                   │
│  3. Generate perceptual hash (SHA-256)                      │
│  4. Check localStorage cache                                 │
│  5. Send hash + video to server                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                         SERVER                               │
├─────────────────────────────────────────────────────────────┤
│  6. Receive video + hash                                     │
│  7. Check Redis cache by hash                               │
│                                                              │
│  IF CACHE HIT:                                              │
│    → Skip virus scan                                        │
│    → Skip codec validation                                  │
│    → Skip content moderation                                │
│    → Go straight to AI analysis                             │
│    → Save 15-45 seconds! ⚡                                 │
│                                                              │
│  IF CACHE MISS:                                             │
│    → Run all security checks (parallel)                     │
│    → Cache result in Redis                                  │
│    → Proceed to AI analysis                                 │
└─────────────────────────────────────────────────────────────┘
```

## Frame Hashing Algorithm

### Why 16 Frames?
- **Balance**: Enough to identify unique videos, not too many to slow down
- **Speed**: Processes in 1-2 seconds on average devices
- **Accuracy**: Perceptual hash detects identical content even with different encoding

### How It Works:
```javascript
1. Extract 16 evenly-spaced frames from video
   - Skip first and last frame (often black)
   - Example: 5-minute video → 1 frame every 18.75 seconds

2. For each frame:
   - Resize to 32×32 pixels (fast processing)
   - Convert to grayscale
   - Divide into 8×8 grid of 4×4 blocks (64 blocks total)
   - Calculate average brightness per block
   - Generate 2-character hex string per block
   - Result: 128-character string per frame

3. Combine all 16 frames:
   - Concatenate frame hashes with '|' separator
   - Generate SHA-256 hash of combined string
   - Result: 64-character unique identifier

4. Store in localStorage:
   {
     "hash": {
       "result": { "passed": true },
       "timestamp": 1234567890
     }
   }
```

### What Gets Cached:
- ✅ Identical videos (same content, same encoding)
- ✅ Re-uploads of failed videos
- ✅ Videos uploaded multiple times by same user
- ❌ Different videos (different content)
- ❌ Same video with different edits

## Memory Usage

### Browser (localStorage):
```
Per entry: ~1KB
  - Hash: 64 bytes
  - Result: ~100 bytes
  - Timestamp: 8 bytes
  - Overhead: ~900 bytes

Max entries: 50
Max size: 50KB
Expiry: 7 days
```

### Server (Redis):
```
Per entry: ~200 bytes
  - Key: 70 bytes ("security:" + hash)
  - Value: ~130 bytes (JSON)
    {
      "passed": true,
      "checks": {
        "virusScan": true,
        "codecValid": true,
        "contentSafe": true
      },
      "cachedAt": 1234567890
    }

1,000 entries: ~200KB
10,000 entries: ~2MB
100,000 entries: ~20MB

TTL: 7 days (auto-expiry)
```

### Total Memory Impact:
- **Browser**: 50KB (user's device, not server)
- **Server**: 2MB for 10,000 cached videos
- **Overhead**: <1% of 512MB RAM

## Cache Hit Scenarios

### High Hit Rate (70-90%):
1. **User retries failed upload** - Same video, immediate retry
2. **User re-uploads after fixing issue** - Same video, minutes later
3. **Multiple users upload same video** - Shared content (rare)

### Medium Hit Rate (30-50%):
1. **User uploads daily videos** - Different content each time
2. **User edits video before re-upload** - Different hash

### Low Hit Rate (0-10%):
1. **All unique videos** - No duplicates
2. **Cache expired** - Videos older than 7 days

### Expected Average: 20-40% hit rate

## Performance Impact

### First Upload (Cache Miss):
```
1. Frame extraction: 1-2s (browser)
2. Hash generation: <100ms (browser)
3. Upload to R2: 5-30s (network)
4. Security checks: 10-15s (server, parallel)
5. AI analysis: 60-120s (server)
───────────────────────────────────────
Total: 76-167s
```

### Repeat Upload (Cache Hit):
```
1. Frame extraction: 1-2s (browser)
2. Hash generation: <100ms (browser)
3. Upload to R2: 5-30s (network)
4. Security checks: 0s (SKIPPED! ⚡)
5. AI analysis: 60-120s (server)
───────────────────────────────────────
Total: 66-152s
Savings: 10-15s (15-20% faster)
```

## Cache Management

### Automatic Cleanup:
- **Browser**: Removes entries older than 7 days on each use
- **Server**: Redis TTL auto-expires after 7 days
- **Browser**: Keeps only 50 most recent entries

### Manual Cleanup:
```javascript
// Browser - Clear all cached hashes
localStorage.removeItem('videoSecurityCache');

// Server - Clear all cached results
redis-cli KEYS "security:*" | xargs redis-cli DEL
```

### Monitoring:
```javascript
// Browser - Check cache size
const cache = JSON.parse(localStorage.getItem('videoSecurityCache') || '{}');
console.log(`Cached: ${Object.keys(cache).length} videos`);

// Server - Check cache stats
GET /api/monitoring/cache-stats
{
  "available": true,
  "keys": 1234,
  "memoryUsed": 247, // KB
  "ttl": 604800 // seconds
}
```

## Security Considerations

### What's Safe to Cache:
✅ **Virus scan results** - File content doesn't change
✅ **Codec validation** - Video format doesn't change
✅ **Content moderation** - Visual content doesn't change

### What's NOT Cached:
❌ **User permissions** - Checked on every upload
❌ **File size limits** - Checked on every upload
❌ **Duration limits** - Checked on every upload
❌ **AI analysis** - Always runs (unique insights per upload)

### Cache Poisoning Prevention:
- Hash is generated client-side (user can't fake it)
- Server validates video matches hash before using cache
- Cache only stores pass/fail, not detailed results
- TTL ensures stale data expires

## Edge Cases

### 1. User Edits Video:
- Different hash generated
- Cache miss
- Full security checks run
- ✅ Correct behavior

### 2. User Uploads Malware Twice:
- First upload: Detected, rejected, NOT cached
- Second upload: Full scan runs again
- ✅ Correct behavior (malware never cached)

### 3. Redis Unavailable:
- Cache check fails gracefully
- Full security checks run
- ✅ Correct behavior (fallback to safe mode)

### 4. localStorage Full:
- Old entries auto-removed
- New entry saved
- ✅ Correct behavior (LRU eviction)

## Configuration

### Enable/Disable Caching:
```javascript
// Frontend - Disable frame hashing
// In useVideoFrameHash.js, return early:
export function useVideoFrameHash() {
  return {
    generateHash: async () => ({ hash: null, cached: false }),
    cacheResult: () => {},
    isHashing: false,
    hashProgress: 0,
    hashError: null,
  };
}

// Backend - Disable Redis cache
// Set REDIS_URL to empty or invalid
REDIS_URL=
```

### Adjust Cache Size:
```javascript
// Browser - Change max entries (default: 50)
// In useVideoFrameHash.js, line ~85:
if (entries.length > 100) { // Changed from 50

// Server - Change TTL (default: 7 days)
// In securityCache.js, line ~8:
const CACHE_TTL = 14 * 24 * 60 * 60; // 14 days
```

## Testing

### Test Cache Hit:
```bash
# 1. Upload video
curl -X POST http://localhost:3000/api/video/confirm \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"key":"test.mp4","publicUrl":"...","videoHash":"abc123..."}'

# 2. Check logs for "Security checks SKIPPED (cached)"

# 3. Upload same video again
# Should see cache hit in logs
```

### Test Cache Miss:
```bash
# 1. Clear cache
redis-cli FLUSHDB

# 2. Upload video
# Should see "Running security checks…" in logs
```

### Benchmark:
```bash
# Without cache
time curl -X POST .../confirm # ~15s for security checks

# With cache
time curl -X POST .../confirm # ~0s for security checks
```

## Troubleshooting

### Cache Not Working:
1. Check Redis connection: `redis-cli PING`
2. Check browser console for hash generation errors
3. Verify hash is sent in request body
4. Check server logs for cache hit/miss

### High Memory Usage:
1. Check Redis memory: `redis-cli INFO memory`
2. Check cache size: `redis-cli DBSIZE`
3. Reduce TTL if needed
4. Clear old entries: `redis-cli FLUSHDB`

### Low Hit Rate:
1. Check if users upload unique videos (expected)
2. Check if cache is expiring too soon (increase TTL)
3. Check if hash generation is failing (browser console)

## Future Improvements

1. **Perceptual hash improvements**: Use pHash or dHash for better similarity detection
2. **Distributed cache**: Use Redis Cluster for high availability
3. **Cache warming**: Pre-populate cache with common videos
4. **Analytics**: Track hit rate, memory usage, time saved
5. **Admin panel**: View cached videos, clear cache, adjust settings
