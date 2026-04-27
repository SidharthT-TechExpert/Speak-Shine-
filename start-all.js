import { spawn } from 'child_process';

console.log('🚀 Starting Speak & Shine - Bot + Webapp');

// Start the WhatsApp bot
const bot = spawn('node', ['--max-old-space-size=512', 'index.js'], {
  stdio: 'inherit',
  env: { ...process.env }
});

bot.on('error', (err) => {
  console.error('❌ Bot process error:', err);
});

bot.on('exit', (code) => {
  console.log(`⚠️ Bot process exited with code ${code}`);
  if (code !== 0) {
    console.log('🔄 Restarting bot in 5 seconds...');
    setTimeout(() => {
      spawn('node', ['--max-old-space-size=512', 'index.js'], {
        stdio: 'inherit',
        env: { ...process.env }
      });
    }, 5000);
  }
});

// Start the web API server
const api = spawn('node', ['api/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' }
});

api.on('error', (err) => {
  console.error('❌ API process error:', err);
});

api.on('exit', (code) => {
  console.log(`⚠️ API process exited with code ${code}`);
  if (code !== 0) {
    console.log('🔄 Restarting API in 5 seconds...');
    setTimeout(() => {
      spawn('node', ['api/server.js'], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' }
      });
    }, 5000);
  }
});

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('📴 Shutting down...');
  bot.kill();
  api.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Shutting down...');
  bot.kill();
  api.kill();
  process.exit(0);
});

console.log('✅ Both services started');
