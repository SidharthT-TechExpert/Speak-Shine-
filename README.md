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

### Video Recording & Analysis
- **Advanced Recording** — Record or upload videos with intelligent camera/microphone selection
- **AI Background Blur** — Real-time background blur using MediaPipe Selfie Segmentation with adjustable strength (5-40px)
- **AI Noise Cancellation** — RNNoise WASM-based audio enhancement for clearer recordings
- **Browser Frame Extraction** — 16 frames extracted in-browser before upload, saving 93% server RAM and speeding up visual analysis
- **AI Scoring** — Comprehensive analysis of fluency, grammar, confidence, vocabulary, eye contact, body language, and facial expression
- **Smart Compression** — Automatic video optimization with quality preservation (up to 500MB frontend, 200MB backend processing)

### Processing & Performance
- **Concurrent Queue** — Up to 15 videos processed simultaneously (configurable via `VIDEO_QUEUE_CONCURRENCY`)
- **Security Caching** — Redis caches security check results; repeat uploads skip virus/codec/content checks entirely
- **Submit Gate** — Pre-submission validation with real-time feedback on video quality requirements
- **Progress Tracking** — SSE-based real-time progress updates during video processing

### Learning & Engagement
- **Daily Questions** — Scheduled questions published each morning; special questions on Sundays, month-start, and month-end
- **Weekly Reflections** — Dedicated Sunday reflection prompts with 6 guided questions
- **Vocabulary Generator** — AI extracts and explains advanced vocabulary from user submissions
- **Community Feed** — Public video sharing with reactions, comments, and engagement tracking
- **Progress Tracking** — Daily reports, streaks, weekly/monthly submission counters, fine system for missed days

### Communication & Collaboration
- **Live Sessions** — Trainer-hosted video rooms via LiveKit with real-time attendance tracking
- **Group Chat** — Real-time group messaging via Socket.io
- **Direct Messaging** — One-on-one chat between users
- **Notifications** — In-app notification system with unread tracking
- **Attendance** — Session attendance tracking and reporting

### Admin & Monitoring
- **Admin Dashboard** — Real-time monitoring, queue stats, user management, question bank
- **Trainer Dashboard** — Student progress tracking, attendance management, live session hosting
- **User Dashboard** — Personal progress, submission history, streak tracking, vocabulary library

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
│       ├── pages/          # VideoAnalysis, AdminDashboard, UserDashboard, TrainerDashboard…
│       ├── components/     # Layout, Chat, LiveRoom, Modal, NotificationBell…
│       ├── hooks/          # useBackgroundBlur, useNoiseCancellation, useVideoFrameHash…
│       ├── context/        # AuthContext
│       └── api/            # client.js (axios instance)
│
└── scripts/
    └── reset-admin-password.js
```

---

## Using Infisical for Environment Variables (Optional)

[Infisical](https://infisical.com/) is a secure way to manage environment variables across development and production environments without storing secrets in `.env` files.

### Setup Infisical

#### 1. Install Infisical CLI

```bash
# macOS/Linux
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
sudo apt-get update && sudo apt-get install -y infisical

# Or using npm
npm install -g @infisical/cli

# Or using Homebrew (macOS)
brew install infisical/get-cli/infisical
```

#### 2. Login to Infisical

```bash
infisical login
```

Select **Infisical Cloud (US Region)** and complete login in browser.

#### 3. Initialize Project

In your project directory:

```bash
infisical init
```

Select your organization, project, and environment (e.g., `development`, `production`).

This creates/updates `.infisical.json` with your workspace configuration.

#### 4. Add Secrets to Infisical Dashboard

Go to [app.infisical.com](https://app.infisical.com/) and add all environment variables from `.env.example`:

- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `GROQ_API_KEY`
- `R2_*` variables
- etc.

Create separate environments:
- **development** — for local development
- **production** — for production server

### Using Infisical in Development

Instead of using `.env` file:

```bash
# Start backend with Infisical
infisical run --env=development -- npm run dev:api

# Or set as default environment
infisical run -- npm run dev:api
```

This automatically injects all secrets from Infisical into your application.

### Using Infisical in Production

#### Option 1: GitHub Actions (Automated)

The deployment workflow automatically pulls production secrets if Infisical CLI is installed on the server:

```bash
# On your EC2/production server, install Infisical CLI
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
sudo apt-get update && sudo apt-get install -y infisical

# Login with service token (for CI/CD)
infisical login
```

The GitHub Actions workflow will automatically run:
```bash
infisical export --env=production --format=dotenv > .env
```

#### Option 2: Manual Sync on Server

SSH into your production server:

```bash
cd /path/to/Speak-Shine-
infisical export --env=production --format=dotenv > .env
docker compose restart app
```

#### Option 3: Service Tokens (Recommended for CI/CD)

1. Create a service token in Infisical dashboard
2. Add it as a GitHub secret: `INFISICAL_TOKEN`
3. Update GitHub Actions workflow:

```yaml
- name: Pull Infisical secrets
  run: |
    infisical export --token=${{ secrets.INFISICAL_TOKEN }} --env=production --format=dotenv > .env
```

### Infisical Best Practices

✅ **Do:**
- Use separate environments (development, staging, production)
- Rotate service tokens regularly
- Use role-based access control for team members
- Keep `.infisical.json` in version control (it's safe, contains no secrets)

❌ **Don't:**
- Commit `.env` files (add to `.gitignore`)
- Share service tokens in Slack/email
- Use the same secrets across dev and production
- Store Infisical personal access tokens in code

### Fallback to .env

If Infisical is not available, the app falls back to reading `.env` file. This ensures:
- Local development works without Infisical
- Production can use either Infisical OR `.env`
- No breaking changes for existing deployments

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

# LiveKit (optional - required for live video sessions)
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=wss://...

# App
PORT=3001
NODE_ENV=production
FINE_AMOUNT=5
ALLOWED_ORIGINS=https://your-domain.com

# Feature flags (all default false)
ENABLE_VIRUS_SCAN=false
ENABLE_CODEC_VALIDATION=false
ENABLE_CONTENT_MODERATION=false

# Queue & Processing
VIDEO_QUEUE_CONCURRENCY=15    # default 15, safe for 512 MB RAM
MAX_VIDEO_SIZE_MB=200          # backend processing limit
MAX_FRONTEND_SIZE_MB=500       # frontend upload limit before compression
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

### MCP & ChatGPT Integration
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mcp/sse` | MCP SSE transport connection endpoint |
| POST | `/api/mcp/messages` | MCP JSON-RPC message endpoint |
| GET | `/api/mcp/openapi.json` | OpenAPI 3.0 specification for ChatGPT Custom Actions |
| GET | `/api/users/me/api-key` | Generate permanent personal Student API Key (`sk_user_...`) |
| GET | `/api/mcp/wallet` | Check student wallet balance and transaction ledger |
| POST | `/api/mcp/points` | Manage student points (Add/Deduct/Set) — Admin |
| POST | `/api/mcp/streak` | Update student streak count — Admin |
| POST | `/api/mcp/streak/freeze` | Freeze student streak — Admin |
| POST | `/api/mcp/wallet` | Credit or Debit student wallet — Admin |
| POST | `/api/mcp/lockout/reset` | Reset locked out student login attempts — Admin |
| POST | `/api/mcp/submission-status` | Toggle student submission status (`submitted`) — Admin |
| POST | `/api/mcp/paid-status` | Toggle student paid membership status (`paid`) — Admin |
| POST | `/api/mcp/weekly-reset` | Execute weekly reset across students — Admin |
| POST | `/api/mcp/whatsapp/broadcast` | Broadcast Rich Media (Text, Image, Audio) to WhatsApp Group — Admin |

---

## MCP Server & ChatGPT Custom Actions Setup

The Speak & Shine backend includes an integrated **Model Context Protocol (MCP)** server and an **OpenAPI 3.0 Gateway** for ChatGPT Custom Actions, Claude Desktop, and Cursor.

### Environment Variables & Keys

| Variable | Description |
|----------|-------------|
| `MCP_SECRET_KEY` | System-wide Admin Key for administrative MCP/ChatGPT operations. If not explicitly set, falls back to `JWT_SECRET`. |
| Student API Key | Generated per-user via `GET /api/users/me/api-key`. Format: `sk_user_<64_hex_chars>`. Does not expire. |

### Role-Based Access Control & Privacy Safeguards

1. **Admin Key (`MCP_SECRET_KEY`)**:
   - Full access to read and update student points, streaks, wallets, lockouts, payment statuses, weekly resets, and send WhatsApp group broadcasts.
2. **Student Personal API Key (`sk_user_...`)**:
   - Permanently tied to the requesting student (`user` role).
   - Can inspect personal wallet balance and report details.
   - **Privacy Protection**: Phone numbers are automatically masked (`+91 ****** 9012`) for non-admin callers. Passwords are never retrieved or returned under any circumstances.
   - **Admin Action Blocking**: Blocked from modifying user scores, streaks, wallets, resetting lockouts, or sending broadcasts (`403 Forbidden`).

---

### Setup Instructions for ChatGPT Custom Actions

Follow these steps to connect ChatGPT directly to your Speak & Shine backend:

#### Step 1: Create or Edit a Custom GPT
1. Open [ChatGPT](https://chatgpt.com/) and navigate to **My GPTs** -> **Create a GPT** (or edit an existing one).
2. Go to the **Configure** tab.

#### Step 2: Add Actions
1. Click **Add Actions** at the bottom of the configuration page.
2. Under **Schema**, paste the OpenAPI JSON or import it from your live API URL:
   `https://<your-domain>/api/mcp/openapi.json`

#### Step 3: Configure Authentication
1. Click the ⚙️ gear icon next to **Authentication**.
2. Select **API Key**.
3. Set **Auth Type** to **Bearer**.
4. Paste your key:
   - For **Admin Access**: Paste your `MCP_SECRET_KEY` (or `JWT_SECRET`).
   - For **Student Access**: Paste a personal Student API key (`sk_user_...`).
5. Save the configuration.

#### Step 4: Interact with ChatGPT in Plain English
You can now speak to ChatGPT to manage student records and broadcast notifications:

* **Manage Points**: *"Add 50 points to student 9876543210 for extra effort."*
* **Freeze Streak**: *"Freeze streak for phone 9876543210."*
* **Wallet Credit/Debit**: *"Credit $20 to student 9876543210's wallet with note 'Bonus'."*
* **Reset Failed Login Attempts**: *"Reset login lock for student 9876543210."*
* **Check Wallet**: *"Show wallet balance and transactions for 9876543210."*
* **Status Updates**: *"Mark student 9876543210 as paid and submitted."*
* **Weekly Reset**: *"Execute weekly reset."*
* **WhatsApp Group Broadcasts (Rich Media)**:
  - **Text Announcement**: *"Send WhatsApp group message: Evening session starts at 7 PM."*
  - **Poster Image**: *"Broadcast poster image https://example.com/poster.jpg to WhatsApp group with caption 'Special Workshop'."*
  - **Voice Note / Audio**: *"Send audio message https://example.com/audio.mp3 to WhatsApp group."*

---

### Setup Instructions for MCP Clients (Claude Desktop / Cursor)

#### Connecting via SSE
Connect your MCP client to the Server-Sent Events (SSE) endpoint:

```text
GET https://<your-domain>/api/mcp/sse?apiKey=<YOUR_API_KEY>
```

#### Sample `claude_desktop_config.json`
```json
{
  "mcpServers": {
    "speak-shine": {
      "url": "https://your-domain.com/api/mcp/sse?apiKey=YOUR_MCP_SECRET_KEY",
      "transport": "sse"
    }
  }
}
```

---

### Automatic WhatsApp Reconnection

If WhatsApp disconnects due to session expiry or server restart, the server automatically executes `ensureWhatsAppConnected()` on message send attempts using stored credentials, preventing message failures without manual intervention.

---

---

## New Features & Enhancements

### Camera & Audio Controls
- **Device Selection** — Choose specific camera and microphone devices from dropdowns
- **Exact Device Enforcement** — Uses `exact` constraints to ensure selected devices are used during recording
- **Device Logging** — Console logging helps verify correct device usage

### AI-Powered Enhancements
- **Background Blur** — MediaPipe Selfie Segmentation with:
  - Adjustable blur strength (5-40px slider)
  - Temporal smoothing (70% current / 30% previous frame) to reduce flickering
  - Edge feathering (3-pixel Gaussian blur) for smooth boundaries
  - Live toggle during recording
- **Noise Cancellation** — RNNoise WASM processing with real-time status indicators

### Video Quality & Compression
- **Smart Compression** — Browser-based video compression with:
  - Preserved audio pitch and duration
  - Capped bitrates (1.1 Mbps video / 96 kbps audio)
  - Memory-efficient processing with proper cleanup
  - Increased thresholds (500MB frontend, 200MB backend)

### Password Security
- **Strong Password Enforcement** — All registrations require:
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - At least 1 special character
  - Real-time validation feedback

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

## Deployment (GitHub Actions → Docker)

The project uses GitHub Actions for continuous deployment:

1. **Push to GitHub** — Deployment triggers on push to `main` branch
2. **Docker Build** — Single `Dockerfile` builds frontend and backend
3. **Environment Variables** — Set all required variables in your deployment platform (Railway, Render, etc.)

### GitHub Deployment Workflow

The `.github/workflows/deploy.yml` automatically:
- Builds the Docker image
- Installs dependencies
- Builds the React frontend
- Starts the Node.js API server

### Key Deployment Settings

- **Start command:** `node api/server.js`
- **Health check:** `GET /api/health`
- **RAM:** 512 MB minimum (sufficient for concurrent video processing)
- **Ports:** Exposes port 3001 (or value from `PORT` env variable)

### Deployment Platforms

**Railway / Render:**
1. Connect your GitHub repository
2. Set environment variables in the dashboard
3. Deploy will trigger automatically on push to `main`

**Manual Docker Deployment:**
```bash
docker build -t speak-shine .
docker run -p 3001:3001 --env-file .env speak-shine
```

### Adjusting Performance

To adjust queue concurrency without redeploying, change `VIDEO_QUEUE_CONCURRENCY` in your platform's environment variables and restart the service.

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
