module.exports = {
    // Telegram Configuration
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    ADMIN_USER_IDS: process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) : [],

    // Binance API Configuration
    BINANCE_API_KEY: process.env.BINANCE_API_KEY,
    BINANCE_SECRET_KEY: process.env.BINANCE_SECRET_KEY,
    USE_TESTNET: process.env.USE_TESTNET === 'true',

    // Trading Configuration
    DEFAULT_TRADING_PAIR: process.env.DEFAULT_TRADING_PAIR || 'BTCUSDT',
    DEFAULT_TRADE_AMOUNT: parseFloat(process.env.DEFAULT_TRADE_AMOUNT) || 10,
    MAX_CONCURRENT_TRADES: parseInt(process.env.MAX_CONCURRENT_TRADES) || 5,

    // Futures Trading Configuration
    DEFAULT_FUTURES_SYMBOL: process.env.DEFAULT_FUTURES_SYMBOL || 'BTCUSDT',
    FUTURES_LEVERAGE: parseInt(process.env.FUTURES_LEVERAGE) || 10,
    FUTURES_QTY_USDT: parseFloat(process.env.FUTURES_QTY_USDT) || 20,
    FUTURES_TP_PERCENT: parseFloat(process.env.FUTURES_TP_PERCENT) || 0.6,
    FUTURES_SL_PERCENT: parseFloat(process.env.FUTURES_SL_PERCENT) || 0.3,
    
    // Signal Configuration
    RSI_LONG_THRESHOLD: parseFloat(process.env.RSI_LONG_THRESHOLD) || 30,
    RSI_SHORT_THRESHOLD: parseFloat(process.env.RSI_SHORT_THRESHOLD) || 70,
    SIGNAL_CHECK_INTERVAL: parseInt(process.env.SIGNAL_CHECK_INTERVAL) || 30,
    
    // Daily Limits
    DAILY_TARGET_PERCENT: parseFloat(process.env.DAILY_TARGET_PERCENT) || 5,
    DAILY_MAX_LOSS_PERCENT: parseFloat(process.env.DAILY_MAX_LOSS_PERCENT) || 3,
    
    // Filters
    ENABLE_NEWS_FILTER: process.env.ENABLE_NEWS_FILTER !== 'false',
    ENABLE_EMA_FILTER: process.env.ENABLE_EMA_FILTER !== 'false',
    ENABLE_BB_FILTER: process.env.ENABLE_BB_FILTER !== 'false',
    ROI_BASED_TP: process.env.ROI_BASED_TP === 'true',

    // AI Analysis Configuration
    ENABLE_AI_ANALYSIS: process.env.ENABLE_AI_ANALYSIS !== 'false',
    AI_CONFIDENCE_THRESHOLD: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.7,
    USE_TECHNICAL_INDICATORS: process.env.USE_TECHNICAL_INDICATORS !== 'false',
    USE_SENTIMENT_ANALYSIS: process.env.USE_SENTIMENT_ANALYSIS !== 'false',

    // Server Configuration
    PORT: parseInt(process.env.PORT) || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',

    // Risk Management
    MAX_LOSS_PERCENTAGE: parseFloat(process.env.MAX_LOSS_PERCENTAGE) || 2,
    MAX_PROFIT_PERCENTAGE: parseFloat(process.env.MAX_PROFIT_PERCENTAGE) || 5,
    STOP_LOSS_PERCENTAGE: parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 1,
    TAKE_PROFIT_PERCENTAGE: parseFloat(process.env.TAKE_PROFIT_PERCENTAGE) || 2,

    // Market Data Settings
    MARKET_UPDATE_INTERVAL: parseInt(process.env.MARKET_UPDATE_INTERVAL) || 30000,
    PRICE_HISTORY_LIMIT: parseInt(process.env.PRICE_HISTORY_LIMIT) || 200,
    VOLUME_THRESHOLD_USDT: parseFloat(process.env.VOLUME_THRESHOLD_USDT) || 100000,

    // Trading Modes
    TRADING_MODES: {
        conservative: {
            name: 'Conservative',
            description: 'Low risk, stable returns',
            takeProfitPercent: 1.5,
            stopLossPercent: 0.8,
            maxTradeTime: 3600, // 1 hour
            riskLevel: 'low',
            aiConfidenceThreshold: 0.8,
            technicalIndicators: ['SMA', 'RSI', 'MACD'],
            maxConcurrentTrades: 3
        },
        balanced: {
            name: 'Balanced',
            description: 'Moderate risk and returns',
            takeProfitPercent: 2.5,
            stopLossPercent: 1.5,
            maxTradeTime: 1800, // 30 minutes
            riskLevel: 'medium',
            aiConfidenceThreshold: 0.7,
            technicalIndicators: ['SMA', 'EMA', 'RSI', 'MACD', 'BB'],
            maxConcurrentTrades: 5
        },
        aggressive: {
            name: 'Aggressive',
            description: 'High risk, high potential returns',
            takeProfitPercent: 4.0,
            stopLossPercent: 2.5,
            maxTradeTime: 900, // 15 minutes
            riskLevel: 'high',
            aiConfidenceThreshold: 0.6,
            technicalIndicators: ['EMA', 'RSI', 'MACD', 'BB', 'ADX', 'STOCH'],
            maxConcurrentTrades: 8
        },
        scalping: {
            name: 'Scalping',
            description: 'Very fast trades, small profits',
            takeProfitPercent: 0.5,
            stopLossPercent: 0.3,
            maxTradeTime: 300, // 5 minutes
            riskLevel: 'very_high',
            aiConfidenceThreshold: 0.5,
            technicalIndicators: ['EMA_fast', 'RSI', 'STOCH'],
            maxConcurrentTrades: 10
        },
        futures_scalp: {
            name: 'Futures Scalping',
            description: 'Ultra-fast futures trading with leverage',
            takeProfitPercent: 0.6,
            stopLossPercent: 0.3,
            maxTradeTime: 120, // 2 minutes
            riskLevel: 'extreme',
            leverage: 20,
            aiConfidenceThreshold: 0.6,
            technicalIndicators: ['RSI', 'EMA_fast'],
            maxConcurrentTrades: 2
        }
    },

    // Supported Trading Pairs
    TRADING_PAIRS: [
        // Major pairs
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'DOTUSDT',
        'XRPUSDT', 'LTCUSDT', 'LINKUSDT', 'BCHUSDT', 'XLMUSDT',
        
        // Popular altcoins
        'SOLUSDT', 'AVAXUSDT', 'MATICUSDT', 'ALGOUSDT', 'ATOMUSDT',
        'VETUSDT', 'FILUSDT', 'TRXUSDT', 'EOSUSDT', 'XTZUSDT',
        
        // DeFi tokens
        'UNIUSDT', 'SUSHIUSDT', 'CAKEUSDT', 'COMPUSDT', 'AAVEUSDT',
        'MKRUSDT', 'YFIUSDT', 'SNXUSDT', 'CRVUSDT', '1INCHUSDT',
        
        // Meme coins
        'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT',
        
        // Layer 2
        'OPUSDT', 'ARBUSDT', 'STRKUSDT',
        
        // New trending
        'SUIUSDT', 'APTUSDT', 'NEARUSDT', 'INJUSDT', 'TIAUSDT'
    ],

    // Popular Futures Pairs (most liquid)
    FUTURES_PAIRS: [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT',
        'XRPUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
        'LINKUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'FILUSDT',
        'NEARUSDT', 'APTUSDT', 'OPUSDT', 'ARBUSDT', 'INJUSDT'
    ],

    // Market Categories
    MARKET_CATEGORIES: {
        major: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
        defi: ['UNIUSDT', 'SUSHIUSDT', 'AAVEUSDT', 'COMPUSDT', 'MKRUSDT'],
        layer1: ['ADAUSDT', 'DOTUSDT', 'SOLUSDT', 'AVAXUSDT', 'ATOMUSDT'],
        layer2: ['MATICUSDT', 'OPUSDT', 'ARBUSDT'],
        meme: ['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT'],
        gaming: ['AXSUSDT', 'SANDUSDT', 'MANAUSDT', 'ENJUSDT'],
        metaverse: ['SANDUSDT', 'MANAUSDT', 'ENJUSDT', 'CHZUSDT'],
        ai: ['FETUSDT', 'OCEANUSDT', 'AGIXUSDT', 'RNDRУСDT']
    },

    // Technical Analysis Settings
    TECHNICAL_ANALYSIS: {
        SMA_PERIODS: [10, 20, 50, 100, 200],
        EMA_PERIODS: [12, 26, 50, 100],
        RSI_PERIOD: 14,
        RSI_OVERBOUGHT: 70,
        RSI_OVERSOLD: 30,
        MACD_FAST: 12,
        MACD_SLOW: 26,
        MACD_SIGNAL: 9,
        BB_PERIOD: 20,
        BB_DEVIATION: 2,
        STOCH_K_PERIOD: 14,
        STOCH_D_PERIOD: 3,
        ADX_PERIOD: 14
    },

    // AI Analysis Settings
    AI_ANALYSIS: {
        PRICE_PREDICTION_LOOKBACK: 100,
        SENTIMENT_WEIGHT: 0.3,
        TECHNICAL_WEIGHT: 0.5,
        VOLUME_WEIGHT: 0.2,
        NEWS_ANALYSIS_ENABLED: false, // Disable for now
        SOCIAL_SENTIMENT_ENABLED: false // Disable for now
    },

    // WebSocket Settings
    WEBSOCKET: {
        RECONNECT_INTERVAL: 5000,
        MAX_RECONNECT_ATTEMPTS: 10,
        PING_INTERVAL: 30000
    },

    // Logging Configuration
    LOGGING: {
        LEVEL: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        MAX_FILES: '14d',
        MAX_SIZE: '20m'
    },

    // Position Sizing Rules
    POSITION_SIZING: {
        MAX_RISK_PER_TRADE: 2, // 2% of account per trade
        MAX_TOTAL_EXPOSURE: 20, // 20% max total exposure
        MIN_ACCOUNT_BALANCE: 50, // Minimum $50 USDT to trade
        LEVERAGE_LIMITS: {
            'BTCUSDT': 20,
            'ETHUSDT': 20,
            'BNBUSDT': 15,
            'ADAUSDT': 10,
            'SOLUSDT': 10,
            'default': 5
        }
    },

    // Emergency Settings
    EMERGENCY: {
        MAX_CONSECUTIVE_LOSSES: 5,
        EMERGENCY_STOP_LOSS_PERCENT: 10,
        COOL_DOWN_PERIOD_MINUTES: 30,
        FORCE_CLOSE_ALL_ON_ERROR: true
    }
};module.exports = {
    // Telegram Configuration
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    ADMIN_USER_IDS: process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) : [],

    // Binance API Configuration
    BINANCE_API_KEY: process.env.BINANCE_API_KEY,
    BINANCE_SECRET_KEY: process.env.BINANCE_SECRET_KEY,
    USE_TESTNET: process.env.USE_TESTNET === 'true',

    // Trading Configuration
    DEFAULT_TRADING_PAIR: process.env.DEFAULT_TRADING_PAIR || 'BTCUSDT',
    DEFAULT_TRADE_AMOUNT: parseFloat(process.env.DEFAULT_TRADE_AMOUNT) || 10,
    MAX_CONCURRENT_TRADES: parseInt(process.env.MAX_CONCURRENT_TRADES) || 5,

    // AI Analysis Configuration
    ENABLE_AI_ANALYSIS: process.env.ENABLE_AI_ANALYSIS !== 'false',
    AI_CONFIDENCE_THRESHOLD: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.7,
    USE_TECHNICAL_INDICATORS: process.env.USE_TECHNICAL_INDICATORS !== 'false',
    USE_SENTIMENT_ANALYSIS: process.env.USE_SENTIMENT_ANALYSIS !== 'false',

    // Server Configuration
    PORT: parseInt(process.env.PORT) || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',

    // Risk Management
    MAX_LOSS_PERCENTAGE: parseFloat(process.env.MAX_LOSS_PERCENTAGE) || 2,
    MAX_PROFIT_PERCENTAGE: parseFloat(process.env.MAX_PROFIT_PERCENTAGE) || 5,
    STOP_LOSS_PERCENTAGE: parseFloat(process.env.STOP_LOSS_PERCENTAGE) || 1,
    TAKE_PROFIT_PERCENTAGE: parseFloat(process.env.TAKE_PROFIT_PERCENTAGE) || 2,

    // Market Data Settings
    MARKET_UPDATE_INTERVAL: parseInt(process.env.MARKET_UPDATE_INTERVAL) || 30000,
    PRICE_HISTORY_LIMIT: parseInt(process.env.PRICE_HISTORY_LIMIT) || 200,
    VOLUME_THRESHOLD_USDT: parseFloat(process.env.VOLUME_THRESHOLD_USDT) || 100000,

    // Trading Modes
    TRADING_MODES: {
        conservative: {
            name: 'Conservative',
            description: 'Low risk, stable returns',
            takeProfitPercent: 1.5,
            stopLossPercent: 0.8,
            maxTradeTime: 3600, // 1 hour
            riskLevel: 'low',
            aiConfidenceThreshold: 0.8,
            technicalIndicators: ['SMA', 'RSI', 'MACD'],
            maxConcurrentTrades: 3
        },
        balanced: {
            name: 'Balanced',
            description: 'Moderate risk and returns',
            takeProfitPercent: 2.5,
            stopLossPercent: 1.5,
            maxTradeTime: 1800, // 30 minutes
            riskLevel: 'medium',
            aiConfidenceThreshold: 0.7,
            technicalIndicators: ['SMA', 'EMA', 'RSI', 'MACD', 'BB'],
            maxConcurrentTrades: 5
        },
        aggressive: {
            name: 'Aggressive',
            description: 'High risk, high potential returns',
            takeProfitPercent: 4.0,
            stopLossPercent: 2.5,
            maxTradeTime: 900, // 15 minutes
            riskLevel: 'high',
            aiConfidenceThreshold: 0.6,
            technicalIndicators: ['EMA', 'RSI', 'MACD', 'BB', 'ADX', 'STOCH'],
            maxConcurrentTrades: 8
        },
        scalping: {
            name: 'Scalping',
            description: 'Very fast trades, small profits',
            takeProfitPercent: 0.5,
            stopLossPercent: 0.3,
            maxTradeTime: 300, // 5 minutes
            riskLevel: 'very_high',
            aiConfidenceThreshold: 0.5,
            technicalIndicators: ['EMA_fast', 'RSI', 'STOCH'],
            maxConcurrentTrades: 10
        }
    },

    // Supported Trading Pairs
    TRADING_PAIRS: [
        // Major pairs
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'DOTUSDT',
        'XRPUSDT', 'LTCUSDT', 'LINKUSDT', 'BCHUSDT', 'XLMUSDT',
        
        // Popular altcoins
        'SOLUSDT', 'AVAXUSDT', 'MATICUSDT', 'ALGOUSDT', 'ATOMUSDT',
        'VETUSDT', 'FILUSDT', 'TRXUSDT', 'EOSUSDT', 'XTZUSDT',
        
        // DeFi tokens
        'UNIUSDT', 'SUSHIUSDT', 'CAKEUSDT', 'COMPUSDT', 'AAVEUSDT',
        'MKRUSDT', 'YFIUSDT', 'SNXUSDT', 'CRVUSDT', '1INCHUSDT',
        
        // Meme coins
        'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT',
        
        // Layer 2
        'OPUSDT', 'ARBUSDT', 'STRKUSDT',
        
        // New trending
        'SUIUSDT', 'APTUSDT', 'NEARUSDT', 'INJUSDT', 'TIAUSDT'
    ],

    // Market Categories
    MARKET_CATEGORIES: {
        major: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
        defi: ['UNIUSDT', 'SUSHIUSDT', 'AAVEUSDT', 'COMPUSDT', 'MKRUSDT'],
        layer1: ['ADAUSDT', 'DOTUSDT', 'SOLUSDT', 'AVAXUSDT', 'ATOMUSDT'],
        layer2: ['MATICUSDT', 'OPUSDT', 'ARBUSDT'],
        meme: ['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT'],
        gaming: ['AXSUSDT', 'SANDUSDT', 'MANAUSDT', 'ENJUSDT'],
        metaverse: ['SANDUSDT', 'MANAUSDT', 'ENJUSDT', 'CHZUSDT'],
        ai: ['FETUSDT', 'OCEANUSDT', 'AGIXUSDT', 'RNDRУСDT']
    },

    // Technical Analysis Settings
    TECHNICAL_ANALYSIS: {
        SMA_PERIODS: [10, 20, 50, 100, 200],
        EMA_PERIODS: [12, 26, 50, 100],
        RSI_PERIOD: 14,
        RSI_OVERBOUGHT: 70,
        RSI_OVERSOLD: 30,
        MACD_FAST: 12,
        MACD_SLOW: 26,
        MACD_SIGNAL: 9,
        BB_PERIOD: 20,
        BB_DEVIATION: 2,
        STOCH_K_PERIOD: 14,
        STOCH_D_PERIOD: 3,
        ADX_PERIOD: 14
    },

    // AI Analysis Settings
    AI_ANALYSIS: {
        PRICE_PREDICTION_LOOKBACK: 100,
        SENTIMENT_WEIGHT: 0.3,
        TECHNICAL_WEIGHT: 0.5,
        VOLUME_WEIGHT: 0.2,
        NEWS_ANALYSIS_ENABLED: false, // Disable for now
        SOCIAL_SENTIMENT_ENABLED: false // Disable for now
    },

    // WebSocket Settings
    WEBSOCKET: {
        RECONNECT_INTERVAL: 5000,
        MAX_RECONNECT_ATTEMPTS: 10,
        PING_INTERVAL: 30000
    },

    // Logging Configuration
    LOGGING: {
        LEVEL: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        MAX_FILES: '14d',
        MAX_SIZE: '20m'
    }
};