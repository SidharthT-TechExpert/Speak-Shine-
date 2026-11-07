# Speak & Shine V2

> Enterprise AI-Powered Speech Coaching & Class Management Monorepo

Speak & Shine V2 is a unified speech coaching platform designed to elevate communication and public speaking skills through structured video assignments, automated AI evaluation, live trainer classrooms, and gamified streak rewards.

---

## Architecture Overview

Speak & Shine V2 is architected as a high-performance **Monolithic Monorepo** managed with Turborepo and npm/pnpm workspaces. A single unified NestJS backend powers three decoupled web portals and a cross-platform mobile application.

```
speak-shine-v2/
├── .github/workflows/          # Automated CI/CD pipelines (Lint, Test, Docker Build)
├── apps/
│   ├── backend/                # NestJS Modular Monolith API (/api/v1/*)
│   ├── web-student/            # React 18 + Vite (speak-shine.online)
│   ├── web-trainer/            # React 18 + Vite + PWA (trainer.speak-shine.online)
│   ├── web-admin/              # React 18 + Vite + PWA (admin.speak-shine.online)
│   └── mobile-student/         # React Native + Expo (iOS & Android)
│
├── packages/
│   ├── shared-types/           # Shared TypeScript interfaces & DTO contracts
│   ├── validation-schemas/     # Zod validation schemas shared across frontends
│   ├── ui-kit/                 # Shared Tailwind design tokens and UI components
│   └── tsconfig/               # Shared strict TypeScript base configs
│
├── docker-compose.yml          # Local orchestration (NestJS, MongoDB 7, Redis 7)
├── Dockerfile                  # Multi-stage production container build for backend
├── pnpm-workspace.yaml         # Monorepo workspace configuration
└── turbo.json                  # Turborepo build cache pipeline
```

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Monorepo Engine** | Turborepo, npm/pnpm Workspaces |
| **Backend API** | NestJS (TypeScript), Express adapter, class-validator, Swagger OpenAPI |
| **Database & Cache** | MongoDB 7 (Mongoose schemas), Redis (ioredis for caching & rate limiting) |
| **Web Frontends** | React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, PWA |
| **Mobile App** | React Native, Expo SDK, TypeScript |
| **Validation** | Zod (client validation), Class-Validator & Class-Transformer (backend DTOs) |
| **AI & Media** | Groq (Whisper + Llama Vision), ElevenLabs, Cloudflare R2 (presigned direct uploads) |
| **Realtime & Video**| LiveKit WebRTC (interactive video rooms), Socket.io |
| **Security & Auth** | JWT with HttpOnly cookies, Argon2 password hashing, RBAC Guards |

---

## Core Roles & Workflows

### 1. Trainer Portal (`trainer.speak-shine.online`)
- **Signup & Admin Verification**: Trainers register with professional qualifications and experience; accounts remain `PENDING` until approved by an Admin.
- **Class Management**: Active trainers create cohorts with auto-generated unique class codes (e.g. `SHINE-XXXX`).
- **Student Enrollment**: Trainers can share the class code for student self-enrollment or pre-enroll students directly by email/phone.
- **Assignment & Task Management**: Create daily speech tasks, vocabulary challenges, and Sunday reflection prompts.
- **Financial Rewards**: Trainers award cash prizes and incentives directly to top-performing student wallets.
- **Live Classroom**: Host interactive WebRTC live training rooms powered by LiveKit.

### 2. Student Experience (`speak-shine.online` & Mobile App)
- **Dual Onboarding Flows**:
  - *Self-Enrollment*: Sign up directly using a trainer's Class Code (`SHINE-XXXX`).
  - *Pre-Enrolled Student Activation*: Students added by a trainer use the **Forgot Password / Activation** flow to verify their email/phone OTP and set their password.
- **Video Submission**: Record in-browser or on mobile, then upload directly to Cloudflare R2 storage via presigned S3 URLs.
- **AI Analysis**: Comprehensive automated evaluation of fluency, grammar, vocabulary, pronunciation, eye contact, and confidence.
- **Gamified Rewards & Wallet**: Daily streaks, badge milestones, and cash prize balances with withdrawal requests.

### 3. Admin Portal (`admin.speak-shine.online`)
- **Trainer Governance**: Review and verify trainer applications (`ACTIVE`, `REJECTED`).
- **Platform Overview**: System-wide analytics on student growth, video submission velocity, and retention.
- **Financial Controls**: Audit wallet transactions, ledger categories, and approve cash prize payouts.
- **Help Desk**: Centralized ticket management for student and trainer inquiries.

---

## API Standard: `/api/v1/*`

All backend endpoints strictly follow the versioned prefix `/api/v1/<domain>`.

Interactive Swagger documentation is automatically generated and accessible locally at:
👉 **`http://localhost:3001/api/v1/docs`**

### Key Route Domains

| Domain | Base Path | Key Capabilities |
| :--- | :--- | :--- |
| **Auth** | `/api/v1/auth` | Register (Student/Trainer), Login, Refresh Token, Forgot/Reset Password |
| **Trainers** | `/api/v1/trainers` | Profile management, application status, trainer directory |
| **Classes** | `/api/v1/classes` | Class creation, unique code generation, pre-enrolling students |
| **Students** | `/api/v1/students` | Self-join class via code, enrolled class dashboard, profile |
| **Tasks** | `/api/v1/tasks` | Task creation, daily topic bank, submission queries |
| **Videos** | `/api/v1/videos` | Direct upload presigned URLs, submission finalization, AI reports |
| **Wallet** | `/api/v1/wallet` | Balance ledger, prize awards, withdrawal requests |
| **Live Sessions** | `/api/v1/live-sessions` | LiveKit token generation, session scheduling, attendee tracking |
| **Help Tickets** | `/api/v1/help-tickets` | Support ticket creation, status updates, resolutions |
| **Notifications** | `/api/v1/notifications`| User notification center, unread counters, mark as read |

---

## Getting Started

### Prerequisites
- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`
- **MongoDB**: `>= 7.0` (Running locally or via MongoDB Atlas)
- **Redis**: `>= 7.0` (Running locally or via Redis Cloud)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-org/speak-shine.git
cd speak-shine
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` at the root and fill in your secrets:
```bash
cp .env.example .env
```

Key environment variables:
```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/speak-shine
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secure-jwt-secret-key-32-chars-min
JWT_REFRESH_SECRET=your-secure-jwt-refresh-secret-key-32-chars-min

# Storage (Cloudflare R2 / AWS S3)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# AI & LiveKit (Optional for full AI pipeline & Live rooms)
GROQ_API_KEY=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

### 3. Run Development Servers

You can launch each workspace independently or run them side-by-side:

```bash
# Start NestJS Backend API (Port 3001)
npm run dev:backend

# Start Student Web Portal (Port 3000 -> speak-shine.online)
npm run dev:student

# Start Trainer Web Portal (Port 3002 -> trainer.speak-shine.online)
npm run dev:trainer

# Start Admin Web Portal (Port 3003 -> admin.speak-shine.online)
npm run dev:admin

# Start Mobile App (Expo Metro bundler)
npm run --prefix apps/mobile-student start
```

---

## Local Orchestration with Docker

Run the entire backend stack including MongoDB and Redis locally with Docker Compose:

```bash
docker compose up -d --build
```

Services exposed:
- **Backend API**: `http://localhost:3001/api/v1`
- **Swagger Docs**: `http://localhost:3001/api/v1/docs`
- **MongoDB**: `localhost:27017`
- **Redis**: `localhost:6379`

To view logs or stop services:
```bash
docker compose logs -f backend
docker compose down
```

---

## Production Build & Testing

### Run Tests
```bash
# Run Vitest unit & integration test suite
npm test
```

### Compile Workspaces
```bash
# Build shared packages
npm run build:packages

# Build NestJS backend
npm run build:backend

# Build all web frontends
npm run build:web
```

---

## Frontend Hosting on Vercel

Each frontend application is designed for independent hosting on Vercel (or Cloudflare Pages / Netlify) using separate domain bindings:

| App | Target Domain | Vercel Root Directory | Build Command | Output Directory |
| :--- | :--- | :--- | :--- | :--- |
| `apps/web-student` | `speak-shine.online` | `apps/web-student` | `npm run build` | `dist` |
| `apps/web-trainer` | `trainer.speak-shine.online` | `apps/web-trainer` | `npm run build` | `dist` |
| `apps/web-admin` | `admin.speak-shine.online` | `apps/web-admin` | `npm run build` | `dist` |

> [!NOTE]
> Since the web applications use `@speak-shine/shared-types`, `@speak-shine/validation-schemas`, and `@speak-shine/ui-kit`, Vercel builds pull from the repository root workspace. Ensure your Vercel project **Root Directory** points to the specific app folder while allowing npm to access root workspace packages.

---

## License

This project is proprietary and confidential. All rights reserved &copy; Speak & Shine.
