# ⚡ Quick Start: Deploy in 10 Minutes

## 🎯 What You'll Get
- **Frontend**: Vercel (instant loads, free forever)
- **Backend**: Fly.io (no cold starts, free tier)
- **Total Cost**: $0/month

---

## 📋 Before You Start

Have these ready:
1. ✅ MongoDB Atlas connection string
2. ✅ Upstash Redis URL
3. ✅ Groq API keys (3-4 keys)
4. ✅ Cloudflare R2 credentials
5. ✅ JWT secret (any random string)

---

## 🚀 Deploy Backend (5 minutes)

### 1. Install Fly CLI
```powershell
# Windows PowerShell
iwr https://fly.io/install.ps1 -useb | iex
```

### 2. Login & Launch
```bash
fly auth login
fly launch --no-deploy
```
Choose:
- App name: `speak-shine-backend`
- Region: `sin` (Singapore) or closest to you
- PostgreSQL: **No**
- Redis: **No**

### 3. Set Secrets (One Command)
```bash
fly secrets set \
  MONGO_URI="your_mongodb_uri" \
  JWT_SECRET="your_jwt_secret" \
  GROQ_API_KEYS="key1,key2,key3" \
  REDIS_URL="your_redis_url" \
  R2_ACCOUNT_ID="your_r2_id" \
  R2_ACCESS_KEY_ID="your_r2_key" \
  R2_SECRET_ACCESS_KEY="your_r2_secret" \
  R2_BUCKET_NAME="your_bucket" \
  R2_PUBLIC_URL="your_r2_url" \
  NODE_ENV="production" \
  PORT="8080"
```

### 4. Create Volume & Deploy
```bash
fly volumes create speak_shine_data --size 1
fly deploy
```

### 5. Get Your Backend URL
```bash
fly status
```
Copy the URL: `https://speak-shine-backend.fly.dev`

---

## 🎨 Deploy Frontend (5 minutes)

### 1. Update API URL
Edit `frontend/.env.local`:
```env
VITE_API_URL=https://speak-shine-backend.fly.dev
```

### 2. Install Vercel CLI
```bash
npm install -g vercel
```

### 3. Deploy
```bash
cd frontend
vercel login
vercel --prod
```

Copy your Vercel URL: `https://speak-shine.vercel.app`

---

## ✅ Final Step: Update CORS

Edit `api/server.js` line ~70:

```javascript
const allowedOrigins = [
  "https://speak-shine.vercel.app", // ← Add your Vercel URL
  "http://localhost:5173",
];
```

Also update Socket.io CORS (line ~100):

```javascript
const io = new SocketIO(httpServer, {
  cors: {
    origin: [
      "https://speak-shine.vercel.app", // ← Add your Vercel URL
      "http://localhost:5173",
    ],
    credentials: true,
  },
});
```

Commit and redeploy:
```bash
git add .
git commit -m "chore: update CORS for Vercel"
git push origin main
fly deploy
```

---

## 🎉 Done!

Your app is live:
- **Frontend**: https://speak-shine.vercel.app
- **Backend**: https://speak-shine-backend.fly.dev/api/health
- **Cost**: $0/month

---

## 🔧 Useful Commands

### View Backend Logs
```bash
fly logs
```

### Restart Backend
```bash
fly apps restart speak-shine-backend
```

### Scale Backend (if needed)
```bash
fly scale memory 512  # Still free!
```

### Redeploy Frontend
```bash
cd frontend
vercel --prod
```

### Check Backend Status
```bash
fly status
```

---

## 🆘 Troubleshooting

### Backend won't start
```bash
fly logs  # Check for errors
fly secrets list  # Verify all secrets are set
```

### Frontend can't connect
1. Check `VITE_API_URL` in Vercel dashboard
2. Verify CORS in `api/server.js`
3. Test: `curl https://your-backend.fly.dev/api/health`

### Out of memory
```bash
fly scale memory 512
```

---

## 📚 Full Documentation

See `DEPLOYMENT_VERCEL_FLY.md` for detailed guide.
