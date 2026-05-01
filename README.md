# Speak & Shine - AI-Powered Speech Analysis Platform

**Version:** 2.0.0  
**Architecture:** MVC (Model-View-Controller)  
**Status:** Production Ready ✅

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Security](#security)

---

## 🎯 Overview

Speak & Shine is a comprehensive AI-powered speech analysis platform designed to help users improve their communication skills through:
- Video-based speech analysis
- Real-time feedback on fluency, grammar, confidence, and vocabulary
- Visual analysis (eye contact, body language, facial expressions)
- Daily questions and challenges
- Progress tracking and reporting
- Live video sessions with trainers

---

## ✨ Features

### Core Features
- **Video Analysis** - AI-powered speech and visual analysis
- **Daily Questions** - Personalized daily speaking challenges
- **Progress Tracking** - Detailed reports and statistics
- **Live Sessions** - Real-time video sessions with trainers (LiveKit)
- **Chat System** - Group chat and direct messaging
- **Attendance Tracking** - Session attendance management
- **Fine System** - Automated fine calculation for missed submissions
- **Streak Rewards** - 7-day streak rewards

### Technical Features
- **MVC Architecture** - Clean, maintainable codebase
- **R2 Storage** - Cloudflare R2 for video storage
- **Redis Caching** - Fast data access and session management
- **MongoDB** - Flexible document database
- **Socket.io** - Real-time communication
- **JWT Authentication** - Secure user authentication
- **Rate Limiting** - API protection
- **Security Headers** - Helmet.js security

---

## 🏗️ Architecture

### MVC Structure

```
backend/
├── config/          # Configuration (database, redis, storage)
├── services/        # Business logic
│   ├── ai/          # AI processing services
│   ├── auth/        # Authentication services
│   ├── video/       # Video processing services
│   ├── user/        # User management services
│   ├── dashboard/   # Dashboard services
│   ├── questions/   # Question bank services
│   ├── attendance/  # Attendance services
│   ├── chat/        # Chat services
│   ├── liveSessions/# Live session services
│   ├── scheduler/   # Scheduled task services
│   └── monitoring/  # System monitoring services
├── controllers/     # HTTP request handlers
├── routes/          # URL mapping
├── middleware/      # Auth and validation middleware
├── sockets/         # Socket.io handlers
├── utils/           # Utility functions
└── jobs/            # Background jobs

api/
├── server.js        # Main server file
├── scheduler.js     # Cron job orchestration
├── videoQueue.js    # Video processing queue
└── posterGenerator.js # Poster generation

models/              # MongoDB schemas
frontend/            # React application
```

### Tech Stack

**Backend:**
- Node.js + Express.js
- MongoDB + Mongoose
- Redis (ioredis)
- Socket.io
- JWT authentication
- Cloudflare R2 storage

**Frontend:**
- React 18
- Vite
- TailwindCSS
- Socket.io client
- LiveKit client

**AI/ML:**
- Groq API (speech analysis)
- Custom grammar analysis
- Visual analysis algorithms

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB
- Redis (optional, falls back to in-memory)
- Cloudflare R2 account (for video storage)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd speak-shine
```

2. **Install dependencies**
```bash
# Install API dependencies
cd api
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

3. **Configure environment variables**

Create `.env` file in root:
```env
# Database
MONGODB_URI=mongodb://localhost:27017/speak-shine

# Redis (optional)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key-here

# R2 Storage
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://your-bucket.r2.dev

# Groq API
GROQ_API_KEY_1=your-groq-key-1
GROQ_API_KEY_2=your-groq-key-2
GROQ_API_KEY_3=your-groq-key-3

# LiveKit (optional)
LIVEKIT_API_KEY=your-livekit-key
LIVEKIT_API_SECRET=your-livekit-secret
LIVEKIT_URL=wss://your-livekit-url

# App Settings
PORT=3001
NODE_ENV=development
FINE_AMOUNT=2
```

4. **Start the application**

**Development:**
```bash
# Start API server
cd api
npm start

# Start frontend (in another terminal)
cd frontend
npm run dev
```

**Production:**
```bash
# Build frontend
npm run build

# Start server (serves both API and frontend)
npm start
```

5. **Access the application**
- Frontend: http://localhost:5173 (dev) or http://localhost:3001 (prod)
- API: http://localhost:3001/api
- Health check: http://localhost:3001/api/health

---

## 📁 Project Structure

```
speak-shine/
├── api/                    # API server
│   ├── server.js           # Main server
│   ├── scheduler.js        # Cron jobs
│   ├── videoQueue.js       # Video processing
│   └── posterGenerator.js  # Poster generation
│
├── backend/                # MVC backend
│   ├── config/             # Configuration
│   ├── services/           # Business logic (9 modules)
│   ├── controllers/        # HTTP handlers (9 modules)
│   ├── routes/             # URL mapping (9 modules)
│   ├── middleware/         # Auth middleware
│   ├── sockets/            # Socket.io handlers
│   ├── utils/              # Utilities
│   └── jobs/               # Background jobs
│
├── models/                 # MongoDB schemas (12 models)
│
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── context/        # React context
│   │   ├── hooks/          # Custom hooks
│   │   └── api/            # API client
│   └── public/             # Static assets
│
├── scripts/                # Utility scripts
├── docker/                 # Docker configurations
├── .env                    # Environment variables
└── README.md               # This file
```

---

## 📡 API Documentation

### Authentication Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/request-reset` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/verify-otp` - Verify OTP

### User Endpoints
- `GET /api/users/me` - Get current user
- `PUT /api/users/me` - Update current user
- `GET /api/users` - Get all users (admin)
- `POST /api/users` - Create user (admin)
- `PUT /api/users/:id` - Update user (admin)
- `DELETE /api/users/:id` - Delete user (admin)

### Video Endpoints
- `POST /api/video/upload` - Upload video
- `GET /api/video/reports` - Get video reports
- `GET /api/video/reports/:id` - Get specific report
- `POST /api/video/retry/:id` - Retry failed video
- `GET /api/video/progress/:id` - Get processing progress (SSE)

### Dashboard Endpoints
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/dashboard/settings` - Get settings (admin)
- `PUT /api/dashboard/settings` - Update settings (admin)

### Question Endpoints
- `GET /api/questions/today` - Get today's question
- `GET /api/questions/bank` - Get question bank (admin)
- `POST /api/questions/bank` - Add questions (admin)
- `DELETE /api/questions/bank/:id` - Delete question (admin)

### Attendance Endpoints
- `POST /api/attendance/mark` - Mark attendance
- `GET /api/attendance/my` - Get my attendance
- `GET /api/attendance/all` - Get all attendance (admin)

### Chat Endpoints
- `GET /api/chat/users` - Get chat users
- `GET /api/chat/history/:peerPhone` - Get chat history

### Live Session Endpoints
- `POST /api/live-sessions/create` - Create session (trainer)
- `GET /api/live-sessions` - Get sessions
- `POST /api/live-sessions/:id/join` - Join session
- `POST /api/live-sessions/:id/end` - End session (trainer)

### Monitoring Endpoints
- `GET /api/monitoring` - Get system metrics (admin)

---

## 🚢 Deployment

### Railway Deployment

1. **Connect repository to Railway**
2. **Set environment variables** in Railway dashboard
3. **Deploy** - Railway will automatically build and deploy

### Docker Deployment

```bash
# Build image
docker build -t speak-shine .

# Run container
docker run -p 3001:3001 --env-file .env speak-shine
```

### Manual Deployment

```bash
# Build frontend
npm run build

# Start server
NODE_ENV=production npm start
```

---

## 🔒 Security

### Implemented Security Features

1. **Authentication**
   - JWT-based authentication
   - Secure password hashing (Argon2)
   - Token refresh mechanism
   - OTP verification

2. **Authorization**
   - Role-based access control (user, trainer, admin)
   - Route-level permissions
   - Resource ownership validation

3. **API Security**
   - Rate limiting (200 req/min general, 5 uploads/hour)
   - Helmet.js security headers
   - CORS configuration
   - Input validation
   - SQL injection prevention (MongoDB)

4. **Data Security**
   - Encrypted passwords
   - Secure file uploads
   - Video expiration (24 hours)
   - Presigned URLs for R2

5. **Infrastructure**
   - HTTPS enforcement (production)
   - Trust proxy configuration
   - Error handling without stack traces (production)

---

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:3001/api/health
```

### System Monitoring (Admin)
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/monitoring
```

Returns:
- Active users
- CPU and memory usage
- Video processing stats
- Queue status
- API performance metrics

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📝 License

Proprietary - All rights reserved

---

## 📞 Support

For support, contact the development team.

---

**Built with ❤️ by the Speak & Shine Team**
