# 🚀 Render-Only Deployment Guide

## Overview

This guide will help you deploy **both frontend and backend** on Render (no Vercel needed). This is simpler and avoids CSP issues since everything is on the same domain.

---

## ✅ What's Been Updated

1. **Dockerfile**: Changed `VITE_API_URL` from absolute URL to `/api` (relative path)
2. **render.yaml**: Renamed service from `speak-shine-backend` to `speak-shine` (full-stack)
3. **frontend/.env.local**: Updated API URL to `/api` for local development

---

## 📋 Deployment Steps

### Step 1: Update R2 CORS Configuration

Your R2 bucket needs to allow requests from your Render domain.

1. Go to **Cloudflare Dashboard**: https://dash.cloudflare.com
2. Click **R2** in the left sidebar
3. Click your bucket name
4. Go to **Settings** tab
5. Scroll to **CORS Policy**
6. Replace with this configuration:

```json
[{
  "AllowedOrigins": [
    "https://speak-shine.onrender.com",
    "http://localhost:5173"
  ],
  "AllowedMethods": [
    "GET",
    "POST",
    "PUT",
    "HEAD",
    "DELETE"
  ],
  "AllowedHeaders": [
    "Content-Type",
    "Content-Length",
    "Authorization",
    "x-amz-content-sha256",
    "x-amz-date",
    "x-amz-security-token"
  ],
  "ExposeHeaders": [
    "ETag"
  ],
  "MaxAgeSeconds": 3600
}]
```

7. Click **Save**

### Step 2: Delete Old Render Service (if exists)

If you have an existing `speak-shine-backend` service:

1. Go to **Render Dashboard**: https://dashboard.render.com
2. Click on `speak-shine-backend` service
3. Go to **Settings** (bottom of left sidebar)
4. Scroll to bottom
5. Click **Delete Web Service**
6. Confirm deletion

### Step 3: Create New Render Service

#### Option A: Using render.yaml (Recommended)

1. Go to https://dashboard.render.com
2. Click **New** → **Blueprint**
3. Connect your GitHub repository
4. Render will automatically detect `render.yaml`
5. Click **Apply**

#### Option B: Manual Setup

1. Go to https://dashboard.render.com
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `speak-shine`
   - **Region**: Singapore (or closest to you)
   - **Branch**: `main`
   - **Runtime**: Docker
   - **Plan**: Free
   - **Docker Command**: (leave empty, uses Dockerfile CMD)

### Step 4: Set Environment Variables

In your Render service settings, add these environment variables:

```bash
NODE_ENV=production
MONGO_URI=<your-mongodb-uri>
JWT_SECRET=<your-jwt-secret>
GROQ_API_KEYS=<your-groq-keys>
REDIS_URL=<your-redis-url>
R2_ACCOUNT_ID=<your-r2-account-id>
R2_ACCESS_KEY_ID=<your-r2-access-key>
R2_SECRET_ACCESS_KEY=<your-r2-secret-key>
R2_BUCKET_NAME=speak-shine-videos
R2_PUBLIC_URL=https://pub-1c5ce667ea4445fb98d667349b649704.r2.dev
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
ENABLE_CODEC_VALIDATION=true
ENABLE_VIRUS_SCAN=true
ENABLE_CONTENT_MODERATION=true
LIVEKIT_URL=<your-livekit-url>
LIVEKIT_API_KEY=<your-livekit-key>
LIVEKIT_API_SECRET=<your-livekit-secret>
ALLOWED_ORIGINS=https://speak-shine.onrender.com
```

### Step 5: Deploy

1. Click **Manual Deploy** → **Deploy latest commit**
2. Wait 5-10 minutes for build to complete
3. Render will:
   - Install dependencies
   - Build frontend (Vite)
   - Build Docker image
   - Start the server

### Step 6: Verify Deployment

1. Open your Render URL: `https://speak-shine.onrender.com`
2. You should see the login page (not API response)
3. Check these URLs:
   - Frontend: `https://speak-shine.onrender.com/` ✅
   - API Health: `https://speak-shine.onrender.com/api/health` ✅
   - Login: `https://speak-shine.onrender.com/login` ✅

---

## 🔧 Update Custom Domain (Optional)

If you want to use your custom domain `speak-shine.sidhartht.online`:

1. In Render Dashboard, go to your service
2. Click **Settings** → **Custom Domain**
3. Click **Add Custom Domain**
4. Enter: `speak-shine.sidhartht.online`
5. Render will show you DNS records to add
6. Go to your domain registrar (Namecheap, GoDaddy, etc.)
7. Add the CNAME record:
   ```
   Type: CNAME
   Name: speak-shine
   Value: speak-shine.onrender.com
   ```
8. Wait 5-10 minutes for DNS propagation
9. Your app will be available at `https://speak-shine.sidhartht.online`

### Update CORS After Custom Domain

If you add a custom domain, update R2 CORS and `ALLOWED_ORIGINS`:

**R2 CORS**:
```json
{
  "AllowedOrigins": [
    "https://speak-shine.onrender.com",
    "https://speak-shine.sidhartht.online",
    "http://localhost:5173"
  ],
  ...
}
```

**Render Environment Variable**:
```
ALLOWED_ORIGINS=https://speak-shine.onrender.com,https://speak-shine.sidhartht.online
```

---

## 🧪 Testing

After deployment, test these features:

- [ ] Login/Register
- [ ] Dashboard loads with data
- [ ] Video upload works
- [ ] Live sessions work
- [ ] Chat functionality works
- [ ] WebSocket connections work
- [ ] Admin panel accessible

---

## 💰 Cost

- **Render Free Tier**: 750 hours/month (enough for 1 service 24/7)
- **MongoDB Atlas**: Free tier (512MB)
- **Upstash Redis**: Free tier (10K commands/day)
- **Cloudflare R2**: Free tier (10GB storage)
- **Total**: **$0/month** 🎉

---

## ⚠️ Known Limitations

### Render Free Tier

- **Cold starts**: App spins down after 15 minutes of inactivity
- **First request after sleep**: Takes ~30 seconds to wake up
- **Solution**: Use https://uptimerobot.com (free) to ping every 14 minutes

### How to Set Up Keep-Alive

1. Go to https://uptimerobot.com
2. Sign up (free)
3. Add New Monitor:
   - Type: HTTP(s)
   - URL: `https://speak-shine.onrender.com/api/health`
   - Monitoring Interval: 14 minutes
4. Save
5. Your app stays awake 24/7!

---

## 🆘 Troubleshooting

### Build Fails

**Check Render logs**:
1. Go to Render Dashboard
2. Click your service
3. Click **Logs** tab
4. Look for errors

**Common issues**:
- Missing environment variables
- Docker build errors
- Out of memory (upgrade to paid plan)

### Frontend Not Loading

**Check if dist folder was built**:
Look for this in logs:
```
📁 Dist contents: [ 'index.html', 'assets', ... ]
📦 Serving frontend from: /app/frontend/dist
```

If missing, check Dockerfile build stage.

### API Works But Frontend Doesn't

**Check CORS**:
- Open browser console (F12)
- Look for CORS errors
- Update `ALLOWED_ORIGINS` in Render

### WebSocket Not Connecting

**Check Socket.IO configuration**:
- Ensure `ALLOWED_ORIGINS` includes your domain
- Check browser console for connection errors
- Verify WebSocket is not blocked by firewall

---

## 📚 Architecture

```
┌─────────────────────────────────────────┐
│         Render (speak-shine)            │
│  ┌───────────────────────────────────┐  │
│  │  Frontend (React + Vite)          │  │
│  │  Served as static files           │  │
│  │  URL: /                            │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  Backend (Express + Socket.IO)    │  │
│  │  API: /api/*                       │  │
│  │  WebSocket: /socket.io/*           │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
           │
           ├─── MongoDB Atlas (Database)
           ├─── Upstash Redis (Cache)
           ├─── Cloudflare R2 (Video Storage)
           └─── LiveKit (Video Calls)
```

---

## ✅ Advantages of Render-Only Deployment

1. **No CSP Issues**: Frontend and backend on same domain
2. **Simpler Setup**: One service instead of two
3. **No CORS Complexity**: Same-origin requests
4. **Easier Debugging**: All logs in one place
5. **Free Tier**: Completely free hosting

---

## 🎉 You're Done!

Your app is now deployed on Render with both frontend and backend on the same domain. No more CSP or CORS issues!

**Your URLs**:
- **App**: https://speak-shine.onrender.com
- **API**: https://speak-shine.onrender.com/api/health
- **Custom Domain** (optional): https://speak-shine.sidhartht.online

Enjoy your free, fully-functional deployment! 🚀
