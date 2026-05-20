#!/bin/bash

# Speak-Shine Deployment Setup Script
# This script helps you deploy to Vercel + Fly.io

echo "🚀 Speak-Shine Deployment Setup"
echo "================================"
echo ""

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Installing..."
    curl -L https://fly.io/install.sh | sh
    echo "✅ Fly CLI installed. Please restart your terminal and run this script again."
    exit 1
fi

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

echo "✅ All CLIs installed"
echo ""

# Step 1: Fly.io Backend
echo "📦 Step 1: Deploy Backend to Fly.io"
echo "===================================="
echo ""
echo "1. Login to Fly.io (browser will open):"
fly auth login

echo ""
echo "2. Launch Fly.io app:"
fly launch --no-deploy

echo ""
echo "3. Set environment variables:"
echo "   Run these commands manually with your actual values:"
echo ""
echo "   fly secrets set MONGO_URI=\"your_mongodb_uri\""
echo "   fly secrets set JWT_SECRET=\"your_jwt_secret\""
echo "   fly secrets set GROQ_API_KEYS=\"key1,key2,key3\""
echo "   fly secrets set REDIS_URL=\"your_redis_url\""
echo "   fly secrets set R2_ACCOUNT_ID=\"your_r2_account_id\""
echo "   fly secrets set R2_ACCESS_KEY_ID=\"your_r2_access_key\""
echo "   fly secrets set R2_SECRET_ACCESS_KEY=\"your_r2_secret_key\""
echo "   fly secrets set R2_BUCKET_NAME=\"your_bucket_name\""
echo "   fly secrets set R2_PUBLIC_URL=\"your_r2_public_url\""
echo ""
read -p "Press Enter after setting all secrets..."

echo ""
echo "4. Create volume for temp files:"
fly volumes create speak_shine_data --size 1

echo ""
echo "5. Deploy backend:"
fly deploy

echo ""
echo "✅ Backend deployed!"
BACKEND_URL=$(fly status --json | grep -o '"Hostname":"[^"]*"' | cut -d'"' -f4)
echo "   Backend URL: https://$BACKEND_URL"
echo ""

# Step 2: Vercel Frontend
echo "📦 Step 2: Deploy Frontend to Vercel"
echo "====================================="
echo ""
echo "1. Update frontend/.env.local with backend URL"
echo "VITE_API_URL=https://$BACKEND_URL" > frontend/.env.local

echo ""
echo "2. Login to Vercel:"
cd frontend
vercel login

echo ""
echo "3. Deploy to Vercel:"
vercel --prod

echo ""
echo "✅ Deployment Complete!"
echo ""
echo "📝 Next Steps:"
echo "1. Update CORS in api/server.js with your Vercel URL"
echo "2. Redeploy backend: fly deploy"
echo "3. Test your app!"
echo ""
echo "📚 Full guide: See DEPLOYMENT_VERCEL_FLY.md"
