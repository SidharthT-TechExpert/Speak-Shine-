# Speak & Shine

AI-powered speech analysis platform that helps users improve communication skills through daily video submissions, real-time feedback, and progress tracking.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express.js |
| Frontend | React 18, Vite |
| Database | MongoDB + Mongoose |
| Cache | Redis (ioredis) |
| Storage | Cloudflare R2 |
| AI | Groq API (Llama Vision, Whisper) |
| Realtime | Socket.io |
| Auth | JWT + Argon2 |

---

## Features

- **Video Analysis** — Upload or record a video; AI scores fluency, grammar, confidence, vocabulary, eye contact, body language, and facial expression
- **Browser Frame Extraction** — 16 frames extracted in-browser before upload, saving 93% server RAM and speeding up visual analysis
- **Concurrent Queue** — Up to 15 videos processed simultaneously (configurable via `VIDEO_QUEUE_CONCURRENCY`)
- **Security Caching** — Redis caches security check results; repeat uploads skip virus/codec/content checks entirely
- **Daily Questions** — Scheduled question published each morning; special questions on Sundays, month-start, and month-end
- **Progress Tracking** — Daily reports, streaks, weekly/monthly submission counters, fine system for missed days
- **Live Sessions** — Trainer-hosted video rooms via LiveKit
- **Chat** — Group chat and direct messaging via Socket.io
- **Attendance** — Session attendance tracking
- **Admin Dashboard** — Real-time monitoring, queue stats, user management, question bank

---

## Project Structure

```
speak-shine/
├── api/
│   ├── server.js           # Express app, routes, Socket.io
│   ├── scheduler.js        # Cron jobs (questions, resets, R2 cleanup)
│   ├── videoQueue.js       # Concurrent video processing queue
│   └── posterGenerator.js
│
├── backend/
│   ├── config/             # database.js, redis.js, storage.js
│   ├── controllers/        # HTTP handlers (thin layer)
│   ├── routes/             # Express routers
│   ├── services/
│   │   ├── ai/             # analyzeVideo, analyzeSpeech, transcribe, pipeline…
│   │   ├── video/          # videoService, videoQueue
│   │   ├── scheduler/      # dailyReset, dailyReport, questionScheduler, videoCleanup
│   │   └── …               # auth, user, chat, dashboard, attendance, liveSessions
│   ├── middleware/         # auth.js (JWT + role check)
│   ├── sockets/            # chatSocket.js
│   └── utils/              # dateUtils, errorUtils, validationUtils…
│
├── models/                 # Mongoose schemas
│   ├── authSchema.js
│   ├── userSchema.js
│   ├── videoReportSchema.js
│   ├── questionSchema.js
│   ├── attendanceSchema.js
│   ├── liveSessionSchema.js
│   ├── dailyReportSchema.js
│   └── …
│
├── frontend/
│   └── src/
│       ├── pages/          # VideoAnalysis, AdminDashboard, UserDashboard…
│       ├── components/     # Layout, Chat, LiveRoom, Modal…
│       ├── hooks/          # useVideoFrameHash, useNoiseCancellation…
│       └── context/        # AuthContext
│
└── scripts/
    └── reset-admin-password.js
```

---

## Environment Variables

```env
# Database
MONGODB_URI=mongodb+srv://...

# Redis
REDIS_URL=redis://...

# JWT
JWT_SECRET=
JWT_REFRESH_SECRET=

# Cloudflare R2
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=https://...

# Groq AI
GROQ_API_KEY=
GROQ_API_KEY_2=          # optional second key for rate-limit rotation

# LiveKit (optional)
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=wss://...

# App
PORT=3001
NODE_ENV=production
FINE_AMOUNT=2
ALLOWED_ORIGINS=https://your-domain.com

# Feature flags (all default false)
ENABLE_VIRUS_SCAN=false
ENABLE_CODEC_VALIDATION=false
ENABLE_CONTENT_MODERATION=false

# Queue concurrency (default 15, safe for 512 MB RAM)
VIDEO_QUEUE_CONCURRENCY=15
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install          # root (if any)
cd api && npm install
cd ../frontend && npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Development
cd api && npm start          # API on :3001
cd frontend && npm run dev   # Frontend on :5173

# 4. Production build
cd frontend && npm run build
# Then start api/server.js — it serves the built frontend too
```

---

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with phone + password |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/request-reset` | Request OTP for password reset |
| POST | `/api/auth/reset-password` | Reset password with OTP |

### Video
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/video/presign` | Get presigned R2 upload URL |
| POST | `/api/video/upload-frames` | Upload browser-extracted frames (10 MB limit) |
| POST | `/api/video/confirm` | Confirm upload, start AI analysis |
| GET | `/api/video/progress/:id` | SSE stream for processing progress |
| GET | `/api/video/report/:id` | Get completed report |
| GET | `/api/video/my-reports` | List user's reports |
| DELETE | `/api/video/report/:id` | Delete report + R2 files |
| POST | `/api/video/retry/:id` | Retry failed analysis |
| GET | `/api/video/community-feed` | Public videos from last 24 h |
| PATCH | `/api/video/report/:id/visibility` | Toggle public/private |
| POST | `/api/video/react/:id` | Like / dislike |
| POST | `/api/video/comment/:id` | Add comment |
| DELETE | `/api/video/comment/:id/:commentId` | Delete comment |

### Users / Dashboard / Questions / Attendance / Chat / Live Sessions
Standard CRUD endpoints under `/api/users`, `/api/dashboard`, `/api/questions`, `/api/attendance`, `/api/chat`, `/api/live-sessions`.

### Monitoring (admin only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/monitoring` | CPU, RAM, queue stats, recent errors |

---

## Video Processing Pipeline

```
Browser
  1. Extract 16 frames (720p JPEG) + perceptual hash   ~3–5 s
  2. Upload video → R2 (presigned PUT)                 ~5–30 s
  3. POST /upload-frames (all 16 at once, ~5.6 MB)     ~2–5 s
  4. POST /confirm → server starts async processing

Server (async, up to 15 concurrent)
  5. Check Redis security cache (hash match → skip checks)
  6. If cache miss: virus scan + codec check + content mod (parallel)
  7. Enqueue for AI
  8. Visual analysis  — Groq Llama Vision, 4 batches of 4 frames  ~6–8 s
  9. Audio analysis   — Groq Whisper + Llama (parallel with visual) ~2–4 s
 10. Merge results, save to MongoDB, push SSE "completed"

Cleanup (hourly cron)
 11. Delete expired video files + frame files from R2
```

**Memory per video:** ~9 MB (down from 125 MB before browser-frame optimisation)

---

## Deployment (Railway)

1. Push to GitHub — Railway auto-deploys on push to `webapp` branch
2. Set all environment variables in the Railway service dashboard
3. The single `Dockerfile` builds the frontend and starts the API server

Key Railway settings:
- **Start command:** `node api/server.js`
- **Health check:** `GET /api/health`
- **RAM:** 512 MB is sufficient (video processing uses ~9 MB per video)

To adjust queue concurrency without redeploying, change `VIDEO_QUEUE_CONCURRENCY` in Railway variables and redeploy (takes ~30 s).

---

## Security

- JWT access + refresh tokens, Argon2 password hashing
- Role-based access control: `user` / `trainer` / `admin`
- Rate limits: 200 req/min general, 5 video uploads/hour per user
- Helmet.js security headers, CORS allowlist
- SSRF prevention on R2 URL validation
- Magic-byte file validation on direct uploads
- Input sanitisation on all user-supplied text
- Videos and frames auto-deleted from R2 after 18 hours

---

## License

Proprietary — all rights reserved.
