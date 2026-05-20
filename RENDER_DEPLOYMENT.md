# 🚀 Render + Vercel Deployment Guide

Deploy **Speak-Shine** completely FREE with:
- **Backend** on Render (750 hours/month free)
- **Frontend** on Vercel (unlimited free)

**Total Cost: $0/month**

---

## 📋 What You Need

Have these ready from your `.env` file:
- MongoDB URI
- JWT Secret
- Groq API Keys
- Redis URL
- Cloudflare R2 credentials
- LiveKit credentials

---

## 🎯 Part 1: Deploy Backend to Render (10 minutes)

### Step 1: Sign Up for Render

1. Go to https://render.com
2. Click **"Get Started"**
3. Sign up with GitHub (recommended)

### Step 2: Create New Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository: `SidharthT-TechExpert/Speak-Shine-`
3. Click **"Connect"**

### Step 3: Configure Service

**Basic Settings:**
- **Name**: `speak-shine-backend`
- **Region**: `Singapore` (or closest to you)
- **Branch**: `main`
- **Root Directory**: Leave empty
- **Runtime**: `Docker`
- **Instance Type**: `Free`

### Step 4: Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these one by one:

```
MONGO_URI = mongodb+srv://sidharthT:XksrtVkcKn6Jo0sQ@cluster0.72fiywx.mongodb.net/whatsappBot

JWT_SECRET = d592d319cda254e2a58941f2503e04cbe5e9348a017faf7db5dd77e353bf680ff6785699ed5c2f193d2fd3058d391bfce838b9efbb652dd2844ddb6a86334745

GROQ_API_KEYS = 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,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,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,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

REDIS_URL = rediss://default:gQAAAAAAAXAdAAIgcDI5MmM2ODIwYmI2MmE0YzQxOWI5OWE5ZTg0ZDUxNDAzYw@noble-mako-94237.upstash.io:6379

R2_ACCOUNT_ID = 95507d8602ddb955795f0d78ed3d2df5

R2_ACCESS_KEY_ID = 406dc50c2f97bc807b7141c621bc7e30

R2_SECRET_ACCESS_KEY = 2d9f2d2a6a6eea1ec52094e68cb75939b6257d67a342aa09030425566c734bf7

R2_BUCKET_NAME = speak-shine-videos

R2_PUBLIC_URL = https://pub-1c5ce667ea4445fb98d667349b649704.r2.dev

NODE_ENV = production

ENABLE_CODEC_VALIDATION = true

ENABLE_VIRUS_SCAN = true

ENABLE_CONTENT_MODERATION = true

LIVEKIT_URL = wss://speak-shine-0itwld31.livekit.cloud

LIVEKIT_API_KEY = APIDbgtWtihGVMp

LIVEKIT_API_SECRET = etflzye5t04WTEqZQsVWAQw792rUUl3ZdvmUf8CNJSSD
```

### Step 5: Deploy

1. Click **"Create Web Service"**
2. Wait 10-15 minutes for the build
3. Watch the logs for any errors

### Step 6: Get Your Backend URL

Once deployed, you'll see:
```
Your service is live at https://speak-shine-backend.onrender.com
```

**Copy this URL!** You'll need it for the frontend.

### Step 7: Test Backend

Open in browser or use curl:
```
https://speak-shine-backend.onrender.com/api/health
```

Should return: `{"status":"ok","app":"Speak & Shine 🗣️"}`

---

## 🎨 Part 2: Deploy Frontend to Vercel (5 minutes)

### Step 1: Update API URL

Edit `frontend/.env.local`:

```env
VITE_API_URL=https://speak-shine-backend.onrender.com
```

Commit this change:
```powershell
git add frontend/.env.local
git commit -m "chore: update API URL for Render backend"
git push origin main
```

### Step 2: Sign Up for Vercel

1. Go to https://vercel.com
2. Click **"Sign Up"**
3. Sign up with GitHub

### Step 3: Import Project

1. Click **"Add New..."** → **"Project"**
2. Import your GitHub repo: `SidharthT-TechExpert/Speak-Shine-`
3. Click **"Import"**

### Step 4: Configure Project

**Framework Preset**: Vite (auto-detected)

**Root Directory**: `frontend`

**Build Settings:**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

**Environment Variables:**
Click **"Add"** and add:
```
VITE_API_URL = https://speak-shine-backend.onrender.com
```

### Step 5: Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes
3. Get your URL: `https://speak-shine.vercel.app`

---

## ✅ Part 3: Update CORS (Important!)

### Step 1: Edit Server CORS

Edit `api/server.js` around line 70:

```javascript
const allowedOrigins = [
  "https://speak-shine.vercel.app", // Your Vercel URL
  "http://localhost:5173",
  "http://localhost:3000",
];
```

### Step 2: Update Socket.io CORS

Edit `api/server.js` around line 100:

```javascript
const io = new SocketIO(httpServer, {
  cors: {
    origin: [
      "https://speak-shine.vercel.app", // Your Vercel URL
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    credentials: true,
  },
});
```

### Step 3: Commit and Push

```powershell
git add api/server.js
git commit -m "chore: update CORS for Vercel frontend"
git push origin main
```

Render will auto-deploy the changes (takes ~10 minutes).

---

## 🎉 You're Live!

**Your URLs:**
- Frontend: `https://speak-shine.vercel.app`
- Backend: `https://speak-shine-backend.onrender.com`

**Cost:** $0/month

---

## ⚠️ Important Notes

### Cold Starts on Render Free Tier

Render free tier **spins down after 15 minutes of inactivity**. First request after sleep takes ~30 seconds to wake up.

**Solutions:**
1. **Keep-alive service** (free): Use https://uptimerobot.com to ping your backend every 14 minutes
2. **Accept cold starts**: Fine for low-traffic apps
3. **Upgrade to paid**: $7/month for always-on

### Setting Up Keep-Alive (Optional)

1. Go to https://uptimerobot.com
2. Sign up (free)
3. Add monitor:
   - Type: HTTP(s)
   - URL: `https://speak-shine-backend.onrender.com/api/health`
   - Interval: 14 minutes
4. Your backend stays awake!

---

## 🔧 Troubleshooting

### Backend Build Fails
- Check Render logs
- Verify all environment variables are set
- Check Dockerfile syntax

### Frontend Can't Connect
- Verify `VITE_API_URL` in Vercel dashboard
- Check CORS in `api/server.js`
- Test backend: `curl https://your-backend.onrender.com/api/health`

### Out of Memory
- Render free tier has 512MB RAM
- Reduce `VIDEO_QUEUE_CONCURRENCY` to 3-5
- Disable virus scanning if needed

---

## 📊 Monitoring

### Render Dashboard
- View logs: https://dashboard.render.com
- Check metrics
- Monitor deployments

### Vercel Dashboard
- View deployments: https://vercel.com/dashboard
- Check analytics
- Review build logs

---

## 🚀 Next Steps

1. Test all features
2. Set up UptimeRobot (optional)
3. Add custom domain (optional)
4. Monitor performance
5. Share with users!

---

## 💡 Tips

- **Auto-deploy**: Both Render and Vercel auto-deploy on git push
- **Logs**: Check Render logs for backend errors
- **Performance**: First load after sleep is slow (cold start)
- **Scaling**: Upgrade to paid tier when you have consistent traffic

---

## 🆘 Need Help?

- Render Docs: https://render.com/docs
- Vercel Docs: https://vercel.com/docs
- Check logs in both dashboards
