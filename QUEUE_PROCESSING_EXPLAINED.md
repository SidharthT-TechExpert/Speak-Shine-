# Video Queue Processing - Sequential vs Concurrent

## 🔍 Current Implementation

### **Your system currently processes videos ONE AT A TIME (Sequential)**

---

## 📊 How It Works Now

### Current Queue System (FIFO - First In, First Out):

```javascript
// From backend/services/video/videoQueue.js

const queue = [];           // Array of waiting videos
let activeJob = null;       // Currently processing video (ONLY ONE!)
let isProcessing = false;   // Flag to prevent concurrent processing
```

### Processing Flow:

```
User 1 uploads → Starts processing immediately
User 2 uploads → Enters queue (position 1)
User 3 uploads → Enters queue (position 2)
User 4 uploads → Enters queue (position 3)

Timeline:
0:00 - User 1 processing (60s)
1:00 - User 1 done, User 2 starts (60s)
2:00 - User 2 done, User 3 starts (60s)
3:00 - User 3 done, User 4 starts (60s)
4:00 - User 4 done

Total time: 4 minutes for 4 videos
```

### Key Code:

```javascript
async function processNext() {
  if (isProcessing || queue.length === 0) return; // ← BLOCKS concurrent processing
  
  isProcessing = true;  // ← Only ONE video at a time
  activeJob = queue.shift();
  
  // Process video...
  
  isProcessing = false; // ← Allow next video
  processNext();        // ← Process next in queue
}
```

---

## ⚡ Why Sequential Processing?

### Original Design Reason:

```javascript
/**
 * Video Queue Service
 * Manages video processing queue (FIFO)
 * Processes videos one at a time to prevent OOM  ← THIS!
 */
```

**The comment says: "to prevent OOM" (Out Of Memory)**

This was designed for the **OLD system** that used **125MB per video**:
- 512MB RAM ÷ 125MB = ~4 videos max
- Sequential processing was safer to avoid crashes

---

## 🚀 With Optimizations: You Can Process Concurrently!

### New Memory Usage:

```
Old system: 125MB per video → Only 2-4 concurrent safe
New system:  16MB per video → 15-18 concurrent safe! ✅
```

### Concurrent Processing Benefits:

```
Sequential (Current):
User 1: 0:00 - 1:00 (done at 1:00)
User 2: 1:00 - 2:00 (done at 2:00)
User 3: 2:00 - 3:00 (done at 3:00)
User 4: 3:00 - 4:00 (done at 4:00)
Total: 4 minutes

Concurrent (Possible):
User 1: 0:00 - 1:00 (done at 1:00)
User 2: 0:00 - 1:00 (done at 1:00) ← Same time!
User 3: 0:00 - 1:00 (done at 1:00) ← Same time!
User 4: 0:00 - 1:00 (done at 1:00) ← Same time!
Total: 1 minute (4× faster!)
```

---

## 🔧 How to Enable Concurrent Processing

### Option 1: Simple Concurrent Queue (Recommended)

Replace the queue logic with concurrent processing:

```javascript
// backend/services/video/videoQueue.js

// ── Queue State ──────────────────────────────────────────────────────────────
const queue = [];
const activeJobs = new Map();  // reportId → job (multiple jobs!)
const MAX_CONCURRENT = 15;     // Process up to 15 videos at once

/**
 * Enqueue video for processing
 */
export function enqueue(job) {
  queue.push({ ...job, addedAt: Date.now() });
  
  // Notify user of their queue position
  pushProgress(job.reportId, {
    status: "queued",
    position: queue.length,
    queueLength: queue.length,
    estimatedWait: estimateWait(queue.length),
  });

  processNext(); // Try to start processing
  return { position: queue.length, estimatedWait: estimateWait(queue.length) };
}

/**
 * Process next job in queue (concurrent)
 */
async function processNext() {
  // Start as many jobs as possible (up to MAX_CONCURRENT)
  while (queue.length > 0 && activeJobs.size < MAX_CONCURRENT) {
    const job = queue.shift();
    activeJobs.set(job.reportId, job);
    
    // Update queue positions for remaining jobs
    queue.forEach((j, i) => {
      pushProgress(j.reportId, {
        status: "queued",
        position: i + 1,
        queueLength: queue.length,
        estimatedWait: estimateWait(i + 1),
      });
    });
    
    // Process this job (don't await - run in parallel!)
    processJob(job).finally(() => {
      activeJobs.delete(job.reportId);
      processNext(); // Try to start next job
    });
  }
}

/**
 * Process a single job
 */
async function processJob(job) {
  const { reportId, videoPath, phone, displayName, knownDuration, browserFrames } = job;
  const startTime = Date.now();

  // 10-minute hard timeout
  const processingTimeout = setTimeout(async () => {
    console.error(`[Queue] ${reportId} TIMEOUT`);
    try {
      await VideoReport.findByIdAndUpdate(reportId, {
        status: "failed",
        errorMessage: "Processing timeout. Please try again.",
      });
      pushProgress(reportId, { status: "failed", error: "Processing timeout" });
      closeSse(reportId);
    } catch {}
    finishJob(reportId, startTime, "timeout");
  }, 10 * 60 * 1000);

  try {
    console.log(`[Queue] Processing ${reportId} (active: ${activeJobs.size}, queue: ${queue.length})`);

    const result = await processWebVideo(videoPath, displayName, async (stage) => {
      console.log(`[Queue] ${reportId}: ${stage}`);
      pushProgress(reportId, { status: "processing", stage });
    }, knownDuration, browserFrames);
    
    await VideoReport.findByIdAndUpdate(reportId, {
      status: "completed",
      analysis: result.analysis,
    });

    const { fluency, grammar, confidence, vocabulary } = result.analysis;
    if (fluency != null || grammar != null) {
      await User.findOneAndUpdate(
        { phone },
        {
          $push: {
            feedbackScores: {
              $each: [{ fluency, grammar, confidence, vocabulary, date: new Date() }],
              $slice: -30,
            },
          },
        }
      );
    }

    pushProgress(reportId, { status: "completed" });
    closeSse(reportId);
    console.log(`[Queue] ${reportId} completed`);
    finishJob(reportId, startTime, "success");

  } catch (err) {
    console.error(`[Queue] ${reportId} failed:`, err.message);

    // Fetch user info for the error log
    let userName = "Unknown";
    let userPhone = phone || "—";
    try {
      const userDoc = await User.findOne({ phone: { $in: [phone, phone?.replace(/^(\+91|91)/, "")] } }).lean();
      if (userDoc) userName = userDoc.name || userDoc.userId || phone;
    } catch {}

    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: err.message || "Analysis failed",
    });

    pushProgress(reportId, { status: "failed", error: err.message });
    closeSse(reportId);

    stats.totalFailed++;
    stats.errorsToday.push({
      reportId: String(reportId),
      error: err.message,
      userName,
      phone: userPhone,
      type: classifyError(err.message),
      at: new Date(),
    });
    if (stats.errorsToday.length > 50) stats.errorsToday.shift();

    finishJob(reportId, startTime, "error");

  } finally {
    clearTimeout(processingTimeout);
    if (videoPath && !videoPath.startsWith("http") && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    if (global.gc) global.gc();
  }
}

/**
 * Finish job and update stats
 */
function finishJob(reportId, startTime, outcome) {
  const elapsed = Date.now() - startTime;
  if (outcome === "success") {
    stats.totalProcessed++;
    stats.processingTimes.push(elapsed);
    if (stats.processingTimes.length > 20) stats.processingTimes.shift();
  }
}
```

### Option 2: Hybrid Queue (Smart Concurrency)

Process multiple videos concurrently, but limit based on available RAM:

```javascript
const MAX_CONCURRENT = 15;  // Maximum concurrent videos
const RAM_PER_VIDEO = 16;   // MB per video
const AVAILABLE_RAM = 352;  // MB available

/**
 * Calculate how many videos can process concurrently
 */
function getMaxConcurrent() {
  const ramBased = Math.floor(AVAILABLE_RAM / RAM_PER_VIDEO);
  return Math.min(ramBased, MAX_CONCURRENT);
}

async function processNext() {
  const maxConcurrent = getMaxConcurrent();
  
  while (queue.length > 0 && activeJobs.size < maxConcurrent) {
    const job = queue.shift();
    activeJobs.set(job.reportId, job);
    
    processJob(job).finally(() => {
      activeJobs.delete(job.reportId);
      processNext();
    });
  }
}
```

---

## 📊 Performance Comparison

### Sequential (Current):

```
┌─────────────────────────────────────────────────────────┐
│  Sequential Processing (ONE AT A TIME)                  │
├─────────────────────────────────────────────────────────┤
│  10 users upload at same time:                          │
│                                                          │
│  User 1:  0:00 - 1:00 (done at 1:00)                    │
│  User 2:  1:00 - 2:00 (done at 2:00)                    │
│  User 3:  2:00 - 3:00 (done at 3:00)                    │
│  User 4:  3:00 - 4:00 (done at 4:00)                    │
│  User 5:  4:00 - 5:00 (done at 5:00)                    │
│  User 6:  5:00 - 6:00 (done at 6:00)                    │
│  User 7:  6:00 - 7:00 (done at 7:00)                    │
│  User 8:  7:00 - 8:00 (done at 8:00)                    │
│  User 9:  8:00 - 9:00 (done at 9:00)                    │
│  User 10: 9:00 - 10:00 (done at 10:00)                  │
│                                                          │
│  Total time: 10 minutes                                 │
│  Throughput: 60 videos/hour                             │
│  RAM usage: 16MB (only 1 video at a time)               │
└─────────────────────────────────────────────────────────┘
```

### Concurrent (With Changes):

```
┌─────────────────────────────────────────────────────────┐
│  Concurrent Processing (15 AT A TIME)                   │
├─────────────────────────────────────────────────────────┤
│  10 users upload at same time:                          │
│                                                          │
│  Users 1-10: 0:00 - 1:00 (ALL done at 1:00!)           │
│                                                          │
│  Total time: 1 minute                                   │
│  Throughput: 600 videos/hour (10× faster!)              │
│  RAM usage: 160MB (10 videos × 16MB)                    │
└─────────────────────────────────────────────────────────┘
```

### 100 Users Upload:

```
Sequential:
- First user done: 1 minute
- Last user done: 100 minutes (1 hour 40 minutes)
- Average wait: 50 minutes

Concurrent (15 at a time):
- First 15 users done: 1 minute
- Last user done: 7 minutes (100 ÷ 15 = 7 batches)
- Average wait: 3.5 minutes

Improvement: 14× faster for last user!
```

---

## 🎯 Recommended Configuration

### For 512MB RAM Server:

```javascript
const MAX_CONCURRENT = 15;  // Safe limit with optimizations
```

**Why 15?**
- 15 videos × 16MB = 240MB RAM used
- Leaves 112MB buffer for spikes
- Safe and efficient

### For 1GB RAM Server:

```javascript
const MAX_CONCURRENT = 35;  // More capacity
```

**Why 35?**
- 35 videos × 16MB = 560MB RAM used
- Leaves 192MB buffer
- Maximum efficiency

---

## ⚠️ Important Considerations

### 1. **AI API Rate Limits**

Groq API has rate limits:
- Free tier: 30 requests/minute
- Paid tier: Higher limits

**With concurrent processing:**
- 15 videos × 2 API calls = 30 calls/minute
- You'll hit rate limits!

**Solution:**
- Use multiple API keys (rotate)
- Add rate limiting to queue
- Implement exponential backoff

### 2. **Network Bandwidth**

Downloading frames from R2:
- 15 videos × 4MB = 60MB download
- Should complete in 5-10 seconds on good connection

### 3. **CPU Usage**

ffmpeg (audio extraction) is CPU-intensive:
- 15 concurrent ffmpeg processes
- May slow down on shared CPU
- Monitor CPU usage

---

## 🔄 Migration Strategy

### Step 1: Test with Low Concurrency

```javascript
const MAX_CONCURRENT = 3;  // Start small
```

Test with 3 concurrent videos first, monitor:
- RAM usage
- CPU usage
- API rate limits
- Error rates

### Step 2: Gradually Increase

```javascript
const MAX_CONCURRENT = 5;  // Then 5
const MAX_CONCURRENT = 10; // Then 10
const MAX_CONCURRENT = 15; // Finally 15
```

### Step 3: Monitor and Adjust

Watch for:
- ❌ OOM errors → Reduce MAX_CONCURRENT
- ❌ API rate limit errors → Add rate limiting
- ❌ High CPU usage → Reduce MAX_CONCURRENT
- ✅ Low RAM usage → Increase MAX_CONCURRENT

---

## 📊 Updated Capacity with Concurrent Processing

### Sequential (Current):

```
Throughput: 60 videos/hour
Daily capacity: 1,440 videos/day
100 users: 100 minutes to complete
```

### Concurrent (15 at a time):

```
Throughput: 900 videos/hour (15× faster!)
Daily capacity: 21,600 videos/day (theoretical)
100 users: 7 minutes to complete (14× faster!)

Practical (with API limits):
Throughput: 300 videos/hour (5× faster)
Daily capacity: 7,200 videos/day
100 users: 20 minutes to complete
```

---

## ✅ Summary

### Current System:
- ❌ **ONE video at a time** (sequential)
- ❌ Slow for multiple users
- ❌ Long wait times during peak
- ✅ Very safe (no OOM risk)
- ✅ Simple implementation

### With Concurrent Processing:
- ✅ **15 videos at a time** (concurrent)
- ✅ Fast for multiple users
- ✅ Short wait times during peak
- ⚠️ Need to monitor RAM/CPU
- ⚠️ Need to handle API rate limits
- ⚠️ More complex implementation

### Recommendation:

**Enable concurrent processing with MAX_CONCURRENT = 10-15** for much better user experience!

The optimizations make this safe now (16MB per video vs 125MB before).

---

**Would you like me to implement concurrent processing for you?** 🚀

I can update the `videoQueue.js` file to enable concurrent processing with proper rate limiting and monitoring.

---

**Last Updated**: May 15, 2026
**Version**: 1.0.0
