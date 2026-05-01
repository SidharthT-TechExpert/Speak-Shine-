# 🚀 Deployment Guide - Speak & Shine

Your application is ready for deployment! Here are multiple deployment options:

## 🛤️ Option 1: Railway (Recommended - Already Configured)

### Prerequisites
- Railway account (sign up at [railway.app](https://railway.app))
- Railway CLI installed ✅ (already done)

### Steps:
1. **Login to Railway**
   ```bash
   railway login
   ```
   This will open your browser for authentication.

2. **Initialize Railway Project**
   ```bash
   railway init
   ```
   Choose "Create new project" and give it a name like "speak-shine"

3. **Set Environment Variables**
   ```bash
   # Copy your .env variables to Railway
   railway variables set MONGO_URI="mongodb+srv://sidharthT:Sidharth%4023@cluster0.72fiywx.mongodb.net/whatsappBot"
   railway variables set JWT_SECRET="edb6a5817ba8fb3647aa26fbcd61acd6a8f82c7d5e4d750e814f4c88be0dd8f9f827448420fd04c8247db16376433ce1"
   railway variables set GROQ_API_KEY="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"
   railway variables set GROQ_API_KEYS="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,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,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,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"
   railway variables set REDIS_URL="rediss://default:gQAAAAAAAXAdAAIgcDI5MmM2ODIwYmI2MmE0YzQxOWI5OWE5ZTg0ZDUxNDAzYw@noble-mako-94237.upstash.io:6379"
   railway variables set R2_ACCOUNT_ID="95507d8602ddb955795f0d78ed3d2df5"
   railway variables set R2_ACCESS_KEY_ID="406dc50c2f97bc807b7141c621bc7e30"
   railway variables set R2_SECRET_ACCESS_KEY="2d9f2d2a6a6eea1ec52094e68cb75939b6257d67a342aa09030425566c734bf7"
   railway variables set R2_BUCKET_NAME="speak-shine-videos"
   railway variables set R2_PUBLIC_URL="https://pub-1c5ce667ea4445fb98d667349b649704.r2.dev"
   railway variables set R2_ENDPOINT="https://95507d8602ddb955795f0d78ed3d2df5.r2.cloudflarestorage.com"
   railway variables set LIVEKIT_URL="wss://speak-shine-0itwld31.livekit.cloud"
   railway variables set LIVEKIT_API_KEY="APIDbgtWtihGVMp"
   railway variables set LIVEKIT_API_SECRET="etflzye5t04WTEqZQsVWAQw792rUUl3ZdvmUf8CNJSSD"
   ```

4. **Deploy**
   ```bash
   railway up
   ```

5. **Get Your URL**
   ```bash
   railway domain
   ```

---

## 🐳 Option 2: Docker Deployment

### Local Docker Test:
```bash
# Build the image
docker build -t speak-shine .

# Run locally (test)
docker run -p 3001:3001 --env-file .env speak-shine
```

### Deploy to any Docker platform:
- **DigitalOcean App Platform**
- **Google Cloud Run**
- **AWS ECS/Fargate**
- **Azure Container Instances**

---

## ☁️ Option 3: Vercel (Frontend + Serverless API)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Configure environment variables in Vercel dashboard

---

## 🌐 Option 4: Netlify + Backend Hosting

1. **Frontend on Netlify:**
   - Connect your GitHub repo
   - Build command: `cd frontend && npm run build`
   - Publish directory: `frontend/dist`

2. **Backend on Railway/Heroku/DigitalOcean**

---

## 📋 Pre-Deployment Checklist

✅ **Environment Variables Set**
- Database connection (MongoDB)
- API keys (Groq, LiveKit)
- Storage credentials (Cloudflare R2)
- JWT secret

✅ **Build Process Verified**
- Frontend builds successfully
- No compilation errors
- All dependencies installed

✅ **Security Configured**
- CORS origins set for production domain
- Rate limiting enabled
- Helmet security headers active

---

## 🔧 Post-Deployment Steps

1. **Update CORS Origins**
   After getting your deployment URL, update the `ALLOWED_ORIGINS` environment variable:
   ```
   ALLOWED_ORIGINS=https://your-app.railway.app,https://your-custom-domain.com
   ```

2. **Test Core Features**
   - User registration/login
   - Video upload and analysis
   - Chat functionality
   - Live sessions

3. **Monitor Logs**
   ```bash
   railway logs  # For Railway
   ```

---

## 🚨 Troubleshooting

### Common Issues:
1. **Build fails**: Check Node.js version (requires 22+)
2. **Database connection**: Verify MongoDB URI and network access
3. **File uploads fail**: Check R2 credentials and CORS settings
4. **Video processing fails**: Ensure FFmpeg is available

### Debug Commands:
```bash
# Check deployment status
railway status

# View logs
railway logs

# Connect to shell
railway shell
```

---

## 🎯 Recommended: Railway Deployment

Railway is the easiest option because:
- ✅ Already configured (`railway.webapp.toml`)
- ✅ Automatic builds with Nixpacks
- ✅ Built-in database and Redis options
- ✅ Easy environment variable management
- ✅ Automatic HTTPS and custom domains

**Next Step**: Run `railway login` in your terminal to start!