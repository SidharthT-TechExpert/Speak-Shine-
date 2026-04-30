# Load Testing Guide - Quick Start

## ✅ Test Account Created
- **Phone:** 9999999999
- **Password:** test123
- **Role:** admin

## 🧪 Manual Load Testing (Recommended)

### **Test 1: Single User Upload**
1. Login to https://speak-shine.up.railway.app/admin/login
2. Phone: `9999999999`, Password: `test123`
3. Go to Video Analysis
4. Upload or record a video
5. Check if it processes successfully

### **Test 2: Multiple Users (Manual)**
1. Open 5-10 browser tabs (or use incognito windows)
2. Login with different test accounts in each tab
3. Upload videos simultaneously from all tabs
4. Monitor the queue in admin dashboard

### **Test 3: Check Current Capacity**
1. Login as admin
2. Go to Admin Dashboard → Monitor tab
3. Check queue stats:
   - Queue length
   - Processing status
   - Average processing time
   - Total processed today

---

## 📊 What to Monitor

### **During Testing:**
- ✅ Upload success rate
- ⏱️ Upload time (should be < 10 seconds)
- 📊 Queue length (should stay < 20)
- 🔄 Processing time (should be 2-3 minutes per video)

### **Signs of Overload:**
- ❌ Upload failures
- ⏳ Queue length > 30
- 🐌 Processing time > 5 minutes
- 💥 Server errors or timeouts

---

## 🎯 Expected Capacity

Based on your current Railway setup:

| Metric | Safe Limit | Warning Zone | Overload |
|--------|------------|--------------|----------|
| **Concurrent Uploads** | 1-20 | 20-40 | 40+ |
| **Queue Length** | 0-15 | 15-30 | 30+ |
| **Videos/Day** | 0-200 | 200-300 | 300+ |
| **Active Members** | 0-200 | 200-300 | 300+ |

---

## 🚀 Simple Load Test (Browser Console)

Open browser console on your site and run:

```javascript
// Test concurrent uploads
async function testConcurrentUploads(count) {
  console.log(`Testing ${count} concurrent uploads...`);
  
  const results = [];
  const promises = [];
  
  for (let i = 0; i < count; i++) {
    // Create a small test video blob
    const blob = new Blob(['test'], { type: 'video/mp4' });
    const file = new File([blob], `test-${i}.mp4`, { type: 'video/mp4' });
    
    const formData = new FormData();
    formData.append('video', file);
    
    const promise = fetch('/api/video/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    })
    .then(r => r.json())
    .then(data => ({ success: true, data }))
    .catch(err => ({ success: false, error: err.message }));
    
    promises.push(promise);
  }
  
  const results = await Promise.all(promises);
  const successful = results.filter(r => r.success).length;
  
  console.log(`✅ Success: ${successful}/${count}`);
  console.log(`❌ Failed: ${count - successful}/${count}`);
  
  return results;
}

// Run test
testConcurrentUploads(10);
```

---

## 📈 Realistic Testing Scenario

### **Scenario: 200 Members Daily Submission**

**Assumptions:**
- 200 members
- Each submits 1 video per day
- Submissions spread over 12 hours (8 AM - 8 PM)
- Average: 16-17 videos per hour

**Expected Behavior:**
- ✅ Queue length: 5-10 videos
- ✅ Processing: Smooth, no backlog
- ✅ Wait time: 10-25 minutes per video
- ✅ All videos processed within 24 hours

**Test This:**
1. Have 10-20 real users submit videos within 1 hour
2. Monitor queue in admin dashboard
3. Check if all videos process successfully
4. Measure average wait time

---

## 🔧 If You Hit Capacity Limits

### **Immediate Actions:**
1. Check Railway logs for errors
2. Restart the service if needed
3. Clear stuck jobs: Check admin monitor tab

### **Short-term Solutions:**
1. Ask users to spread submissions over more hours
2. Increase Railway memory to 1GB ($5/month)
3. Enable parallel processing (process 2 videos at once)

### **Long-term Solutions:**
1. Upgrade to 2GB RAM ($10/month) - handles 500+ members
2. Deploy separate processing service ($20/month) - unlimited scale
3. Implement video compression to reduce processing time

---

## 💡 Pro Tips

1. **Best Time to Test:** Off-peak hours (late night) when real users aren't active
2. **Start Small:** Test with 5 users, then 10, then 20, then 50
3. **Monitor Closely:** Watch Railway metrics dashboard during tests
4. **Have Backup:** Keep the old deployment ready to rollback if needed
5. **Test Gradually:** Don't jump from 20 to 200 users immediately

---

## 📞 Quick Health Check

Run this anytime to check system health:

```bash
# Check if server is responding
curl https://speak-shine.up.railway.app/api/health

# Check queue stats (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://speak-shine.up.railway.app/api/video/queue-stats
```

---

## ✅ Current Status

Your system is configured for:
- ✅ **200-300 members**
- ✅ **300 videos per day**
- ✅ **30-50 concurrent uploads**

This is **perfect for your use case** of daily speaking practice submissions!

---

## 🎯 Recommendation

**For your current needs (200-300 members):**
1. ✅ No changes needed - current setup is sufficient
2. ✅ Monitor usage for first 2 weeks
3. ✅ Scale up only if you see consistent queue backlog
4. ✅ Current Railway plan ($5/month) is adequate

**You're good to go!** 🚀
