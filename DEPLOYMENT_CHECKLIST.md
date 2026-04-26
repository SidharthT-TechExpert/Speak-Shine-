# 🚀 Video Analysis Deployment Checklist

## Pre-Deployment Setup

### 1. Dependencies
- [ ] `multer` installed in `api/package.json` ✅ (already included)
- [ ] All new files created:
  - [ ] `models/videoReportSchema.js` ✅
  - [ ] `api/routes/videoAnalysis.js` ✅
  - [ ] `ai/webVideoProcessor.js` ✅
  - [ ] `frontend/src/pages/VideoAnalysis.jsx` ✅

### 2. Database Setup
- [ ] MongoDB connection working
- [ ] TTL index will be auto-created by Mongoose
- [ ] Test with: `node test-video-analysis.js`

### 3. File System
- [ ] Create upload directory: `mkdir -p tmp/uploads`
- [ ] Add to `.gitignore`: `tmp/uploads/*`
- [ ] Ensure write permissions on `tmp/` directory

### 4. Environment Variables
No new environment variables needed! Uses existing:
- [ ] `MONGO_URI` - MongoDB connection string
- [ ] `GROQ_API_KEY_*` - AI analysis keys  
- [ ] `JWT_SECRET` - Authentication
- [ ] `NODE_ENV` - Environment (production/development)

## Deployment Steps

### Backend (API)
```bash
cd api
npm install
npm start
```

### Frontend
```bash
cd frontend
npm install
npm run build  # for production
npm run dev    # for development
```

### WhatsApp Bot (Independent)
```bash
node index.js
```

## Testing Checklist

### 1. API Endpoints
- [ ] `POST /api/video/upload` - Upload video
- [ ] `GET /api/video/report/:id` - Get report
- [ ] `GET /api/video/my-reports` - List reports
- [ ] `DELETE /api/video/report/:id` - Delete report

### 2. Frontend
- [ ] Navigation shows "Video Analysis" link
- [ ] Upload form accepts video files
- [ ] Progress indicator shows during processing
- [ ] Report displays scores and feedback
- [ ] Reports list shows recent submissions
- [ ] Expiration timer counts down correctly

### 3. Integration
- [ ] Video upload triggers AI analysis
- [ ] Analysis results saved to database
- [ ] Reports auto-delete after 12 hours
- [ ] Error handling works for failed uploads
- [ ] File cleanup works (no orphaned videos)

## Production Considerations

### 1. File Upload Limits
Current settings:
- Max file size: 350MB
- Min file size: No minimum (accepts any size)
- Allowed formats: MP4, MOV, AVI, WEBM, MPEG, 3GP, FLV, WMV
- Max duration: 5 minutes
- Min duration: 1 minute (60 seconds)

### 2. Storage Management
- Videos are **never stored permanently**
- Only text analysis stored (< 10KB per report)
- Auto-deletion after 12 hours via MongoDB TTL
- No manual cleanup needed

### 3. Performance
- Video processing is CPU-intensive (2-3 minutes per video)
- Consider using worker queues for high volume
- Monitor Groq API rate limits
- Each upload uses temporary disk space during processing

### 4. Security
- JWT authentication required for all endpoints
- File type validation (MIME type checking)
- User can only access their own reports
- Videos deleted immediately after processing

## Monitoring

### 1. Database
Monitor MongoDB for:
- TTL index working correctly
- Storage usage (should be minimal)
- Report creation/deletion rates

### 2. API Performance
Monitor for:
- Upload success/failure rates
- Processing times
- Error rates
- Disk space usage in `tmp/uploads/`

### 3. User Experience
Monitor for:
- Upload completion rates
- User feedback on analysis quality
- Report viewing patterns

## Troubleshooting

### Common Issues

**Upload fails:**
- Check file size and format
- Verify `tmp/uploads/` directory exists and is writable
- Check disk space

**Processing stuck:**
- Check Groq API keys and rate limits
- Verify ffmpeg/ffprobe installed
- Check backend logs for errors

**Reports not auto-deleting:**
- Verify TTL index: `db.videoreports.getIndexes()`
- Check MongoDB version (requires 2.2+)
- Wait up to 60 seconds (MongoDB background task)

**Frontend not updating:**
- Check browser console for errors
- Verify API endpoints are accessible
- Check CORS configuration

## Rollback Plan

If issues occur, you can safely disable the feature:

1. **Remove navigation link** in `Layout.jsx`
2. **Comment out route** in `App.jsx`
3. **Disable API routes** in `server.js`

The WhatsApp bot will continue working normally - the systems are completely independent.

## Success Metrics

After deployment, verify:
- [ ] Users can upload videos successfully
- [ ] Analysis completes within 3 minutes
- [ ] Reports display correctly
- [ ] Auto-deletion works after 12 hours
- [ ] No impact on WhatsApp bot functionality
- [ ] Database storage remains minimal

## Support

For issues:
1. Check backend logs for processing errors
2. Monitor MongoDB for TTL index issues
3. Verify Groq API key status and rate limits
4. Check frontend browser console for client errors

🎉 **Ready to deploy!** The video analysis system is fully integrated and ready for production use.