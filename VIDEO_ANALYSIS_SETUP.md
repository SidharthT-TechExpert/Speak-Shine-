# 📹 Web-Based Video Analysis Setup Guide

## Overview

This feature allows users to submit videos through the website and receive AI-powered analysis reports. Reports are **automatically deleted after 12 hours** to save storage space.

## How It Works

### Architecture

```
User Browser → Upload Video → Backend API → AI Pipeline → MongoDB (12h TTL) → Display Report
                                    ↓
                            WhatsApp Bot (Independent)
```

### Key Features

1. **Web Upload**: Users can upload videos (30 sec - 5 min) directly through the website
2. **Same AI Pipeline**: Uses the exact same analysis pipeline as WhatsApp submissions
3. **Temporary Storage**: Reports stored in MongoDB with 12-hour auto-deletion
4. **Real-time Status**: Frontend polls for analysis progress
5. **Independent Systems**: Web and WhatsApp bot work completely independently

## Setup Instructions

### 1. Install Dependencies

All required dependencies are already in `api/package.json`:
- `multer` - for file uploads
- `mongoose` - for MongoDB with TTL indexes

```bash
cd api
npm install
```

### 2. Database Setup

The MongoDB TTL (Time To Live) index is automatically created by the schema. MongoDB will:
- Check the `expiresAt` field every 60 seconds
- Automatically delete documents where `expiresAt` has passed
- No manual cleanup needed!

**Verify TTL Index** (optional):
```javascript
// In MongoDB shell or Compass
db.videoreports.getIndexes()
// Should show: { "expiresAt": 1 }, { expireAfterSeconds: 0 }
```

### 3. File Storage Configuration

Create the upload directory:
```bash
mkdir -p tmp/uploads
```

Add to `.gitignore`:
```
tmp/uploads/*
```

### 4. Environment Variables

No new environment variables needed! The system uses existing:
- `MONGO_URI` - MongoDB connection
- `GROQ_API_KEY_*` - AI analysis keys
- `JWT_SECRET` - Authentication

### 5. Start the Services

**Backend API:**
```bash
cd api
npm start
```

**Frontend:**
```bash
cd frontend
npm run dev
```

**WhatsApp Bot** (separate process):
```bash
node index.js
```

## API Endpoints

### Upload Video
```http
POST /api/video/upload
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data

Body: { video: <file> } // Max 50MB

Response:
{
  "success": true,
  "reportId": "507f1f77bcf86cd799439011",
  "message": "Video uploaded successfully. Analysis in progress...",
  "estimatedTime": "2-3 minutes"
}
```

### Get Report Status
```http
GET /api/video/report/:reportId
Authorization: Bearer <jwt_token>

Response:
{
  "reportId": "507f1f77bcf86cd799439011",
  "status": "completed", // or "processing" or "failed"
  "submittedAt": "2026-04-26T10:30:00Z",
  "expiresAt": "2026-04-26T22:30:00Z",
  "analysis": { ... } // Full analysis data
}
```

### Get My Reports
```http
GET /api/video/my-reports
Authorization: Bearer <jwt_token>

Response:
{
  "reports": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "status": "completed",
      "submittedAt": "2026-04-26T10:30:00Z",
      "expiresAt": "2026-04-26T22:30:00Z",
      "videoFileName": "my-speech.mp4"
    }
  ]
}
```

### Delete Report
```http
DELETE /api/video/report/:reportId
Authorization: Bearer <jwt_token>

Response:
{
  "success": true,
  "message": "Report deleted"
}
```

## Frontend Usage

### Navigation
Users can access video analysis from the navigation menu:
- **Dashboard** → View WhatsApp submission history
- **Video Analysis** → Upload videos for instant feedback

### Upload Flow
1. Click "Choose File" and select a video (MP4, MOV, AVI, WEBM)
2. Click "Upload & Analyze"
3. Wait 2-3 minutes for processing
4. View detailed report with scores and feedback

### Report Display
Reports show:
- **Speech Scores**: Fluency, Grammar, Confidence, Vocabulary
- **Visual Scores**: Eye Contact, Body Language, Expression, Presence
- **Detailed Feedback**: Overall comment, strong points, suggestions
- **Statistics**: Duration, pace (WPM), filler words
- **Expiration Timer**: Shows time remaining before auto-deletion

## How 12-Hour Auto-Deletion Works

### MongoDB TTL Index
```javascript
expiresAt: {
  type: Date,
  default: () => new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
  index: { expires: 0 } // TTL index
}
```

### Deletion Process
1. When a report is created, `expiresAt` is set to 12 hours from now
2. MongoDB's background task checks every 60 seconds
3. Documents where `expiresAt < current time` are automatically deleted
4. No application code needed for cleanup!

### Manual Deletion
Users can also delete reports manually before expiration:
```javascript
await VideoReport.deleteOne({ _id: reportId });
```

## Differences: Web vs WhatsApp

| Feature | WhatsApp Bot | Web Upload |
|---------|-------------|------------|
| **Submission** | Send video to WhatsApp group | Upload through website |
| **Storage** | Permanent (saved to user profile) | Temporary (12 hours only) |
| **Daily Tracking** | Yes (counts toward streak/fine) | No (practice only) |
| **Question Context** | Uses today's question | No question context |
| **Feedback Format** | WhatsApp message | Web dashboard |
| **Access** | WhatsApp users only | All registered users |

## Storage Optimization

### Why 12 Hours?
- Long enough for users to review their feedback
- Short enough to prevent database bloat
- Automatic cleanup requires no maintenance

### Disk Space
Videos are **never stored permanently**:
1. Upload → `tmp/uploads/` (temporary)
2. Process → AI analysis
3. Delete video file immediately after processing
4. Store only text analysis (< 10KB per report)
5. Auto-delete analysis after 12 hours

### Estimated Storage
- 100 reports/day × 10KB = 1MB/day
- Auto-deleted after 12 hours = ~500KB average storage
- Minimal database impact!

## Testing

### Test Video Upload
```bash
# Using curl
curl -X POST http://localhost:3001/api/video/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "video=@test-video.mp4"
```

### Test Report Retrieval
```bash
curl http://localhost:3001/api/video/report/REPORT_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Verify TTL Deletion
```javascript
// Create a test report with 1-minute expiration
const testReport = await VideoReport.create({
  userId: "test123",
  phone: "1234567890",
  expiresAt: new Date(Date.now() + 60 * 1000), // 1 minute
  status: "completed"
});

// Wait 2 minutes, then check if it's deleted
setTimeout(async () => {
  const found = await VideoReport.findById(testReport._id);
  console.log(found ? "Still exists" : "Auto-deleted ✅");
}, 120000);
```

## Troubleshooting

### Video Upload Fails
- Check file size (max 100MB)
- Verify file format (MP4, MOV, AVI, WEBM)
- Ensure `tmp/uploads/` directory exists
- Check disk space

### Analysis Stuck on "Processing"
- Check backend logs for errors
- Verify Groq API keys are valid
- Check if ffmpeg/ffprobe are installed
- Ensure video file is valid

### Reports Not Auto-Deleting
- Verify TTL index exists: `db.videoreports.getIndexes()`
- Check MongoDB version (TTL requires 2.2+)
- Wait up to 60 seconds (MongoDB background task interval)
- Check `expiresAt` field is set correctly

### Frontend Not Updating
- Check browser console for errors
- Verify JWT token is valid
- Check API endpoint URLs
- Ensure CORS is configured

## Production Deployment

### Railway/Heroku
1. Ensure `tmp/uploads/` is writable (ephemeral storage is fine)
2. Set environment variables
3. Deploy backend and frontend separately
4. Configure CORS for production domain

### MongoDB Atlas
- TTL indexes work automatically
- No special configuration needed
- Monitor storage usage in Atlas dashboard

### Scaling Considerations
- Video processing is CPU-intensive (consider worker queues for high volume)
- Use Redis for job queues if needed
- Consider separate video processing service

## Security

### File Upload Security
- File type validation (MIME type check)
- File size limits (100MB max)
- Virus scanning (optional, for production)
- User authentication required

### Access Control
- Users can only view their own reports
- JWT authentication on all endpoints
- Report ownership verification

### Data Privacy
- Videos deleted immediately after processing
- Reports auto-deleted after 12 hours
- No permanent video storage
- Compliant with data retention policies

## Future Enhancements

### Possible Improvements
1. **Email Notifications**: Send report link via email
2. **Longer Storage**: Premium users get 7-day retention
3. **Video Playback**: Store video temporarily for review
4. **Batch Upload**: Upload multiple videos at once
5. **Comparison View**: Compare multiple reports side-by-side
6. **Export PDF**: Download report as PDF
7. **Share Link**: Generate shareable report link

## Summary

✅ **What's Working:**
- Users can upload videos through the website
- Same AI analysis as WhatsApp bot
- Reports auto-delete after 12 hours
- No manual cleanup needed
- Minimal storage impact

✅ **What's Independent:**
- WhatsApp bot continues working normally
- Web submissions don't affect daily tracking
- Separate authentication systems
- Different use cases (practice vs daily submission)

✅ **What's Efficient:**
- Videos never stored permanently
- Text-only reports (< 10KB each)
- Automatic MongoDB TTL cleanup
- No background jobs needed

🎉 **Ready to use!** Users can now practice their speaking skills anytime through the website, while the WhatsApp bot handles daily submissions and tracking.
