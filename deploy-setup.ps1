# Speak-Shine Deployment Setup Script (PowerShell)
# This script helps you deploy to Vercel + Fly.io

Write-Host "🚀 Speak-Shine Deployment Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if fly CLI is installed
if (-not (Get-Command fly -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Fly CLI not found. Installing..." -ForegroundColor Red
    iwr https://fly.io/install.ps1 -useb | iex
    Write-Host "✅ Fly CLI installed. Please restart PowerShell and run this script again." -ForegroundColor Green
    exit
}

# Check if vercel CLI is installed
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Vercel CLI not found. Installing..." -ForegroundColor Red
    npm install -g vercel
}

Write-Host "✅ All CLIs installed" -ForegroundColor Green
Write-Host ""

# Step 1: Fly.io Backend
Write-Host "📦 Step 1: Deploy Backend to Fly.io" -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Login to Fly.io (browser will open):"
fly auth login

Write-Host ""
Write-Host "2. Launch Fly.io app:"
fly launch --no-deploy

Write-Host ""
Write-Host "3. Set environment variables:" -ForegroundColor Cyan
Write-Host "   Copy and run these commands with your actual values:" -ForegroundColor Yellow
Write-Host ""
Write-Host '   fly secrets set MONGO_URI="your_mongodb_uri"' -ForegroundColor Gray
Write-Host '   fly secrets set JWT_SECRET="your_jwt_secret"' -ForegroundColor Gray
Write-Host '   fly secrets set GROQ_API_KEYS="key1,key2,key3"' -ForegroundColor Gray
Write-Host '   fly secrets set REDIS_URL="your_redis_url"' -ForegroundColor Gray
Write-Host '   fly secrets set R2_ACCOUNT_ID="your_r2_account_id"' -ForegroundColor Gray
Write-Host '   fly secrets set R2_ACCESS_KEY_ID="your_r2_access_key"' -ForegroundColor Gray
Write-Host '   fly secrets set R2_SECRET_ACCESS_KEY="your_r2_secret_key"' -ForegroundColor Gray
Write-Host '   fly secrets set R2_BUCKET_NAME="your_bucket_name"' -ForegroundColor Gray
Write-Host '   fly secrets set R2_PUBLIC_URL="your_r2_public_url"' -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter after setting all secrets"

Write-Host ""
Write-Host "4. Create volume for temp files:"
fly volumes create speak_shine_data --size 1

Write-Host ""
Write-Host "5. Deploy backend:"
fly deploy

Write-Host ""
Write-Host "✅ Backend deployed!" -ForegroundColor Green
$backendUrl = (fly status --json | ConvertFrom-Json).Hostname
Write-Host "   Backend URL: https://$backendUrl" -ForegroundColor Cyan
Write-Host ""

# Step 2: Vercel Frontend
Write-Host "📦 Step 2: Deploy Frontend to Vercel" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Update frontend/.env.local with backend URL"
"VITE_API_URL=https://$backendUrl" | Out-File -FilePath "frontend/.env.local" -Encoding UTF8

Write-Host ""
Write-Host "2. Login to Vercel:"
Set-Location frontend
vercel login

Write-Host ""
Write-Host "3. Deploy to Vercel:"
vercel --prod

Write-Host ""
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Update CORS in api/server.js with your Vercel URL"
Write-Host "2. Redeploy backend: fly deploy"
Write-Host "3. Test your app!"
Write-Host ""
Write-Host "📚 Full guide: See DEPLOYMENT_VERCEL_FLY.md" -ForegroundColor Yellow
