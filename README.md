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

## Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | 18+ (20 or 22 recommended) |
| [MongoDB](https://www.mongodb.com/) | Local install, Docker, or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) |
| [Redis](https://redis.io/) | Optional (app works without it; uses in-memory cache) |

You also need **Groq API** and **Cloudflare R2** credentials for video upload and AI analysis.

---

## Run locally (development)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd speak-shine   # or your folder name (e.g. whatsapp-bot)

# Backend dependencies (project root)
npm install

# Frontend dependencies
cd frontend
npm install
cd ..
```

> Dependencies live at the **project root** and in **`frontend/`**. You do **not** need `cd api && npm install` for normal development — start the API with `npm run dev:api` from the root.

### 2. Environment files

**Backend** — copy the example env to the project root:

```bash
# Linux / macOS
cp .env.example .env

# Windows (PowerShell or CMD)
copy .env.example .env
```

Edit `.env` and set at least:

- `MONGODB_URI` — your MongoDB connection string  
- `JWT_SECRET` and `JWT_REFRESH_SECRET` — any long random strings  
- `GROQ_API_KEY` — from [console.groq.com](https://console.groq.com)  
- `R2_*` — Cloudflare R2 bucket credentials  

Set `NODE_ENV=development` (or leave unset) so CORS allows the Vite dev server.

**Frontend** — copy the example env for Vite:

```bash
# Linux / macOS
cp frontend/.env.example frontend/.env.local

# Windows
copy frontend\.env.example frontend\.env.local
```

Default `VITE_API_URL=/api` uses the Vite proxy to `http://localhost:3001` (see `frontend/vite.config.js`).

### 3. Start backend and frontend (two terminals)

**Terminal 1 — API (port 3001)**

```bash
# From project root
npm run dev:api
```

Wait for: `✅ Speak & Shine API running on port 3001`

**Terminal 2 — React app (port 5173)**

```bash
# From project root
npm run dev:frontend
```

Open in the browser: **http://localhost:5173**

**Health check:** http://localhost:3001/api/health

### 4. Login / admin account

Users log in with **phone + password** (accounts in MongoDB `auths` collection).

Create or reset an admin password (with MongoDB running and `.env` configured):

```bash
node scripts/reset-admin-password.js <phone> <newPassword>
```

Example:

```bash
node scripts/reset-admin-password.js 9876543210 MySecurePass123
```

---

## Local development (Windows PowerShell)

Same steps as above; use `copy` instead of `cp`:

```powershell
cd C:\path\to\speak-shine
npm install
cd frontend; npm install; cd ..

copy .env.example .env
copy frontend\.env.example frontend\.env.local
# Edit .env and frontend\.env.local in your editor

# Terminal 1
npm run dev:api

# Terminal 2
npm run dev:frontend
```

---

## Run locally (production-like, single server)

Build the frontend once, then serve it from Express:

```bash
npm install
cd frontend && npm install && npm run build && cd ..
npm run start:api
```

Open **http://localhost:3001** (API serves the built `frontend/dist` in production mode).

For this mode set `NODE_ENV=production` in `.env` only if you need production CORS/HTTPS behavior.

---

## Useful npm scripts

| Command | Description |
|---------|-------------|
| `npm run dev:api` | Start API on port 3001 (development) |
| `npm run dev:frontend` | Start Vite dev server on port 5173 |
| `npm run start:api` | Start API (same as dev, no NODE_ENV forced) |
| `npm start` | Production start with memory limits |
| `npm run build` | Install frontend deps and build to `frontend/dist` |
| `npm test` | Run Vitest (daily reset + other tests) |
| `npm run test:daily-reset` | Standalone daily-reset logic test (plain Node, no Vitest) |

**Do not run** `node backend/services/scheduler/dailyResetService.test.js` — that file needs Vitest. Use `npm test` or `npm run test:daily-reset`.

---

## Troubleshooting (local)

| Problem | Fix |
|---------|-----|
| `JWT_SECRET environment variable is not set` | Add `JWT_SECRET` to root `.env` and restart API |
| Frontend loads but API calls fail | Ensure API is running; use `VITE_API_URL=/api` in `frontend/.env.local` |
| CORS errors in production mode | Set `ALLOWED_ORIGINS=http://localhost:5173` or use `NODE_ENV=development` |
| Video upload fails | Check `R2_*` variables and bucket CORS (`node scripts/set-r2-cors.js`) |
| `[ProxyUpload] 401 Unauthorized` | Regenerate R2 API token with **Object Read & Write** on your bucket; run `node scripts/test-r2-upload.js`; restart API |
| MongoDB connection error | Verify `MONGODB_URI` and that MongoDB is running |
| Port already in use | Change `PORT` in `.env` or stop the other process on 3001 / 5173 |

---

## Quick Start (summary)

```bash
npm install && cd frontend && npm install && cd ..
cp .env.example .env && cp frontend/.env.example frontend/.env.local
# Edit .env (MongoDB, JWT, Groq, R2)

npm run dev:api      # terminal 1
npm run dev:frontend # terminal 2 → http://localhost:5173
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
