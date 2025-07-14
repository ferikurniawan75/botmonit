#!/bin/bash
echo "🚀 Starting Crypto Trading Bot with PM2..."

# Validate configuration
npm run test:config
if [ $? -ne 0 ]; then
    echo "❌ Configuration validation failed!"
    exit 1
fi

# Start with PM2
npm run pm2:start
echo "✅ Bot started with PM2"
echo "📊 Monitor: npm run pm2:logs"
