#!/bin/bash
echo "🚀 Starting Crypto Trading Bot..."

# Validate configuration first
echo "📋 Validating configuration..."
npm run test:config

if [ $? -ne 0 ]; then
    echo "❌ Configuration validation failed!"
    exit 1
fi

# Start the bot
echo "🎯 Starting bot..."
npm start
