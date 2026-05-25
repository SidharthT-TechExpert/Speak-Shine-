/**
 * PM2 Ecosystem Configuration
 * This ensures PM2 properly loads environment variables from .env file
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs
 *   pm2 reload ecosystem.config.cjs
 */

module.exports = {
  apps: [{
    name: 'speak-shine',
    script: './api/server.js',
    instances: 1,
    exec_mode: 'fork',
    // 12 GB server — allow Node up to 4 GB heap (video queue + uploads)
    node_args: '--max-old-space-size=4096 --expose-gc',

    // Environment configuration
    env: {
      NODE_ENV: 'production',
    },
    
    // Load .env file
    env_file: '.env',
    
    // Auto-restart configuration
    autorestart: true,
    watch: false,
    max_memory_restart: '4G',
    
    // Logging
    error_file: '~/.pm2/logs/speak-shine-error.log',
    out_file: '~/.pm2/logs/speak-shine-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Process management
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Restart on file changes (optional - set to true for development)
    ignore_watch: [
      'node_modules',
      'logs',
      '.git',
      'tmp',
      'uploads'
    ],
    
    // Exponential backoff restart delay
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    min_uptime: '10s',
  }]
};
