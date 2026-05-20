# 🚀 Deployment Guide: Vercel + Fly.io

This guide will help you deploy **Speak-Shine** with:
- **Frontend** on Vercel (free, instant loads)
- **Backend** on Fly.io (free tier, no cold starts)

---

## 📋 Prerequisites

1. **GitHub account** (for code hosting)
2. **Vercel account** - Sign up at [vercel.com](https://vercel.com)
3. **Fly.io account** - Sign up at [fly.io](https://fly.io)
4. **MongoDB Atlas** - Free tier at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
5. **Upstash Redis** - Free tier at [upstash.com](https://upstash.com)
6. **Cloudflare R2** - Already configured ✅
7. **Groq API Keys** - Get from [console.groq.com](https://console.groq.com)

---

## 🎯 Part 1: Deploy Backend to Fly.io

### Step 1: Install Fly CLI

**Windows (PowerShell):**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

**Mac/Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

### Step 2: Login to Fly.io

```bash
fly auth login
```

This will open your browser for authentication.

### Step 3: Create Fly.io App

```bash
# Navigate to your project root
cd C:\Users\user\OneDrive\Desktop\whatsapp-bot

# Launch the app (this will use fly.toml config)
fly launch --no-deploy

# When prompted:
# - App name: speak-shine-backend (or your choice)
# - Region: Choose closest to your users (sin = Singapore, bom = Mumbai)
# - PostgreSQL: No (we're using MongoDB)
# - Redis: No (we're using Upstash)
```

### Step 4: Set Environment Variables

```bash
# Set all your environment variables
fly secrets set MONGO_URI="your_mongodb_connection_string"
fly secrets set JWT_SECRET="your_jwt_secret"
fly secrets set GROQ_API_KEYS="key1,key2,key3,key4"
fly secrets set REDIS_URL="your_upstash_redis_url"
fly secrets set R2_ACCOUNT_ID="your_r2_account_id"
fly secrets set R2_ACCESS_KEY_ID="your_r2_access_key"
fly secrets set R2_SECRET_ACCESS_KEY="your_r2_secret_key"
fly secrets set R2_BUCKET_NAME="your_bucket_name"
fly secrets set R2_PUBLIC_URL="your_r2_public_url"
fly secrets set NODE_ENV="production"
fly secrets set PORT="8080"

# Optional: If you have Twilio for SMS
fly secrets set TWILIO_ACCOUNT_SID="your_twilio_sid"
fly secrets set TWILIO_AUTH_TOKEN="your_twilio_token"
fly secrets set TWILIO_PHONE_NUMBER="your_twilio_number"
```

### Step 5: Create Volume for Temporary Files

```bash
fly volumes create speak_shine_data --size 1 --region sin
```

### Step 6: Deploy Backend

```bash
fly deploy
```

Wait 5-10 minutes for the build and deployment.

### Step 7: Get Your Backend URL

```bash
fly status
```

Your backend URL will be: `https://speak-shine-backend.fly.dev`

### Step 8: Test Backend

```bash
curl https://speak-shine-backend.fly.dev/api/health
```

Should return: `{"status":"ok","app":"Speak & Shine 🗣️"}`

---

## 🎨 Part 2: Deploy Frontend to Vercel

### Step 1: Update Frontend API URL

Edit `frontend/.env.local`:

```env
VITE_API_URL=https://speak-shine-backend.fly.dev
```

Commit this change:

```bash
git add frontend/.env.local
git commit -m "chore: update API URL for Fly.io backend"
git push origin main
```

### Step 2: Deploy to Vercel

**Option A: Using Vercel CLI (Recommended)**

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to frontend folder
cd frontend

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

**Option B: Using Vercel Dashboard**

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Add Environment Variable:
   - `VITE_API_URL` = `https://speak-shine-backend.fly.dev`
5. Click **Deploy**

### Step 3: Get Your Frontend URL

After deployment, Vercel will give you a URL like:
- `https://speak-shine.vercel.app`

---

## ✅ Part 3: Configure CORS

Update your backend to allow requests from Vercel:

Edit `api/server.js` and update the CORS configuration:

```javascript
const allowedOrigins = [
  "https://speak-shine.vercel.app", // Your Vercel URL
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
```

Redeploy backend:

```bash
fly deploy
```

---

## 🔧 Part 4: Update Socket.io Configuration

Edit `api/server.js` Socket.io CORS:

```javascript
const io = new SocketIO(httpServer, {
  cors: {
    origin: [
      "https://speak-shine.vercel.app",
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    credentials: true,
  },
});
```

Redeploy:

```bash
fly deploy
```

---

## 📊 Monitoring & Logs

### View Backend Logs
```bash
fly logs
```

### View Backend Status
```bash
fly status
```

### View Backend Metrics
```bash
fly dashboard
```

### View Frontend Logs
Go to [vercel.com/dashboard](https://vercel.com/dashboard) → Your Project → Deployments

---

## 💰 Cost Breakdown

| Service | Free Tier | Cost |
|---------|-----------|------|
| **Vercel** | Unlimited bandwidth | $0 |
| **Fly.io** | 3 VMs (256MB each) | $0 |
| **MongoDB Atlas** | 512MB storage | $0 |
| **Upstash Redis** | 10K commands/day | $0 |
| **Cloudflare R2** | 10GB storage | $0 |
| **Groq API** | Free tier | $0 |
| **Total** | | **$0/month** |

---

## 🚨 Troubleshooting

### Backend not starting
```bash
fly logs
# Check for errors in environment variables or dependencies
```

### Frontend can't connect to backend
1. Check CORS configuration in `api/server.js`
2. Verify `VITE_API_URL` in Vercel environment variables
3. Test backend health: `curl https://your-backend.fly.dev/api/health`

### Out of memory errors
```bash
# Scale up Fly.io VM (still free tier)
fly scale memory 512
```

### Cold starts on Fly.io
Fly.io free tier doesn't have cold starts! Your app stays running.

---

## 🔄 Updating Your App

### Update Backend
```bash
git push origin main
fly deploy
```

### Update Frontend
```bash
git push origin main
# Vercel auto-deploys on push
```

---

## 🎉 You're Done!

Your app is now live:
- **Frontend**: https://speak-shine.vercel.app
- **Backend**: https://speak-shine-backend.fly.dev
- **Total Cost**: $0/month

---

## 📝 Next Steps

1. **Custom Domain** (Optional):
   - Vercel: Add custom domain in dashboard
   - Fly.io: `fly certs add yourdomain.com`

2. **Set up monitoring**:
   - Use Fly.io dashboard for backend metrics
   - Use Vercel Analytics for frontend metrics

3. **Backup your data**:
   - MongoDB Atlas has automatic backups
   - Export important data regularly

---

## 🆘 Need Help?

- Fly.io Docs: https://fly.io/docs
- Vercel Docs: https://vercel.com/docs
- GitHub Issues: Create an issue in your repo
