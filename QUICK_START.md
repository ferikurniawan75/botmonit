# 🚀 Quick Start Guide

## Prerequisites
- Node.js 16+
- Telegram Bot Token
- Binance API Keys

## Setup Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Validate Configuration**
   ```bash
   npm run test:config
   ```

4. **Start Bot**
   ```bash
   ./start-pm2.sh
   ```

## ⚠️ Safety Rules

1. **Always start with testnet** (`USE_TESTNET=true`)
2. **Start with small amounts** (max $20 position)
3. **Set daily loss limits** (max 3% per day)
4. **Monitor 24/7** for first week

## 🆘 Emergency Stop

```bash
./stop.sh
# Or via Telegram: /stop
```

## 📊 Monitoring

```bash
npm run logs           # View logs
npm run pm2:monitor    # PM2 dashboard
curl http://localhost:3000/health  # Health check
```
