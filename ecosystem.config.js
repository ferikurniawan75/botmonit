module.exports = {
  apps: [{
    name: 'crypto-trading-bot',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Restart policy
    min_uptime: '10s',
    max_restarts: 10,
    
    // Advanced PM2 features
    listen_timeout: 8000,
    kill_timeout: 5000,
    
    // Monitoring
    pmx: true,
    
    // Cluster mode settings (if needed)
    exec_mode: 'fork',
    
    // Environment variables override
    env_file: '.env',
    
    // Interpreter options
    node_args: '--max_old_space_size=1024',
    
    // Source map support
    source_map_support: true,
    
    // Graceful shutdown
    wait_ready: true,
    
    // Health check
    health_check_grace_period: 3000,
    
    // Auto-restart conditions
    restart_delay: 4000,
    
    // Ignore watch on these paths
    ignore_watch: [
      'node_modules',
      'logs',
      'models',
      '.git',
      '.env'
    ],
    
    // Watch options (only if watch: true)
    watch_options: {
      followSymlinks: false,
      usePolling: false,
      interval: 1000,
      binaryInterval: 5000
    }
  }],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'https://github.com/yourusername/crypto-trading-bot.git',
      path: '/var/www/crypto-trading-bot',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production'
      }
    },
    
    staging: {
      user: 'deploy',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'https://github.com/yourusername/crypto-trading-bot.git',
      path: '/var/www/crypto-trading-bot-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging'
      }
    }
  }
};