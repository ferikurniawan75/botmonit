const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    // Environment
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT) || 3000,
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    
    // API Configuration
    BINANCE_API_KEY: process.env.BINANCE_API_KEY,
    BINANCE_SECRET_KEY: process.env.BINANCE_SECRET_KEY,
    USE_TESTNET: process.env.USE_TESTNET === 'true',
    
    // Trading Configuration
    TRADING_PAIRS: (process.env.TRADING_PAIRS || 'BTCUSDT,ETHUSDT,BNBUSDT').split(','),
    FUTURES_LEVERAGE: parseFloat(process.env.FUTURES_LEVERAGE) || 3,
    FUTURES_QTY_USDT: parseFloat(process.env.FUTURES_QTY_USDT) || 20,
    DAILY_MAX_LOSS_PERCENT: parseFloat(process.env.DAILY_MAX_LOSS_PERCENT) || 3,
    
    // Technical Analysis
    RSI_LONG_THRESHOLD: parseFloat(process.env.RSI_LONG_THRESHOLD) || 30,
    RSI_SHORT_THRESHOLD: parseFloat(process.env.RSI_SHORT_THRESHOLD) || 70,
    
    // Features
    ENABLE_AI_ANALYSIS: process.env.ENABLE_AI_ANALYSIS === 'true',
    ENABLE_FUTURES_TRADING: process.env.ENABLE_FUTURES_TRADING === 'true',
    ENABLE_NOTIFICATIONS: !!process.env.TELEGRAM_BOT_TOKEN,
    
    // Telegram
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    
    // Risk Management
    MAX_OPEN_POSITIONS: parseInt(process.env.MAX_OPEN_POSITIONS) || 3,
    STOP_LOSS_PERCENT: parseFloat(process.env.STOP_LOSS_PERCENT) || 2,
    TAKE_PROFIT_PERCENT: parseFloat(process.env.TAKE_PROFIT_PERCENT) || 4
};