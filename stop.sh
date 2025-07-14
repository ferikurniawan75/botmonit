#!/bin/bash
echo "🛑 Stopping Crypto Trading Bot..."
npm run pm2:stop || pkill -f "node index.js"
echo "✅ Bot stopped"
