#!/usr/bin/env node

/**
 * Automated deployment script for Speak & Shine
 * Handles Railway deployment with environment variables
 */

import { execSync } from 'child_process';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🚀 Speak & Shine Deployment Script');
console.log('=====================================\n');

// Check if Railway CLI is installed
try {
  execSync('railway --version', { stdio: 'pipe' });
  console.log('✅ Railway CLI is installed');
} catch (error) {
  console.log('❌ Railway CLI not found. Installing...');
  execSync('npm install -g @railway/cli', { stdio: 'inherit' });
  console.log('✅ Railway CLI installed');
}

// Check if user is logged in
try {
  execSync('railway whoami', { stdio: 'pipe' });
  console.log('✅ Already logged in to Railway');
} catch (error) {
  console.log('🔐 Please login to Railway...');
  console.log('Run: railway login');
  console.log('Then run this script again.');
  process.exit(1);
}

// Environment variables to set
const envVars = {
  'NODE_ENV': 'production',
  'MONGO_URI': process.env.MONGO_URI,
  'JWT_SECRET': process.env.JWT_SECRET,
  'GROQ_API_KEY': process.env.GROQ_API_KEY,
  'GROQ_API_KEYS': process.env.GROQ_API_KEYS,
  'REDIS_URL': process.env.REDIS_URL,
  'R2_ACCOUNT_ID': process.env.R2_ACCOUNT_ID,
  'R2_ACCESS_KEY_ID': process.env.R2_ACCESS_KEY_ID,
  'R2_SECRET_ACCESS_KEY': process.env.R2_SECRET_ACCESS_KEY,
  'R2_BUCKET_NAME': process.env.R2_BUCKET_NAME,
  'R2_PUBLIC_URL': process.env.R2_PUBLIC_URL,
  'R2_ENDPOINT': process.env.R2_ENDPOINT,
  'LIVEKIT_URL': process.env.LIVEKIT_URL,
  'LIVEKIT_API_KEY': process.env.LIVEKIT_API_KEY,
  'LIVEKIT_API_SECRET': process.env.LIVEKIT_API_SECRET,
  'TRANSCRIBE_TIMEOUT_MS': process.env.TRANSCRIBE_TIMEOUT_MS || '240000',
  'SPEECH_TIMEOUT_MS': process.env.SPEECH_TIMEOUT_MS || '120000',
  'VISUAL_TIMEOUT_MS': process.env.VISUAL_TIMEOUT_MS || '240000',
  'MAX_USERS': process.env.MAX_USERS || '20'
};

console.log('🔧 Setting environment variables...');

// Set environment variables
for (const [key, value] of Object.entries(envVars)) {
  if (value) {
    try {
      execSync(`railway variables set ${key}="${value}"`, { stdio: 'pipe' });
      console.log(`✅ Set ${key}`);
    } catch (error) {
      console.log(`⚠️  Failed to set ${key}: ${error.message}`);
    }
  } else {
    console.log(`⚠️  Skipping ${key} (not set in .env)`);
  }
}

console.log('\n📦 Building and deploying...');

try {
  // Deploy to Railway
  execSync('railway up', { stdio: 'inherit' });
  
  console.log('\n🎉 Deployment successful!');
  
  // Get the deployment URL
  try {
    const domain = execSync('railway domain', { encoding: 'utf8' }).trim();
    console.log(`🌐 Your app is live at: ${domain}`);
    
    // Update ALLOWED_ORIGINS
    if (domain) {
      execSync(`railway variables set ALLOWED_ORIGINS="${domain}"`, { stdio: 'pipe' });
      console.log('✅ Updated ALLOWED_ORIGINS with deployment URL');
    }
  } catch (error) {
    console.log('ℹ️  Run "railway domain" to get your app URL');
  }
  
  console.log('\n📋 Next steps:');
  console.log('1. Test your app functionality');
  console.log('2. Set up custom domain (optional)');
  console.log('3. Monitor logs with: railway logs');
  
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  console.log('\n🔍 Troubleshooting:');
  console.log('1. Check railway logs');
  console.log('2. Verify all environment variables are set');
  console.log('3. Ensure your .env file has all required values');
  process.exit(1);
}