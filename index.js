const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cron = require('cron');

// Import modules
const config = require('./config/config');
const BinanceAPI = require('./src/exchanges/BinanceAPI');
const BinanceFuturesAPI = require('./src/exchanges/BinanceFuturesAPI');
const MarketAnalyzer = require('./src/analysis/MarketAnalyzer');
const AIAnalyzer = require('./src/analysis/AIAnalyzer');
const RiskManager = require('./src/risk/RiskManager');
const TradingBot = require('./src/core/TradingBot');
const FuturesStrategy = require('./src/strategies/FuturesStrategy');
const TelegramBot = require('./src/notifications/TelegramBot');
const WebServer = require('./src/web/WebServer');

// Configure Winston logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'crypto-trading-bot' },
    transports: [
        new winston.transports.File({ 
            filename: path.join(__dirname, 'logs', 'error.log'), 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: path.join(__dirname, 'logs', 'combined.log') 
        }),
        new winston.transports.File({ 
            filename: path.join(__dirname, 'logs', 'trading.log'),
            level: 'info'
        })
    ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

class CryptoTradingBot {
    constructor() {
        this.app = express();
        this.server = null;
        this.isRunning = false;
        
        // Core components
        this.binanceAPI = null;
        this.binanceFuturesAPI = null;
        this.marketAnalyzer = null;
        this.aiAnalyzer = null;
        this.riskManager = null;
        this.tradingBot = null;
        this.futuresStrategy = null;
        this.telegramBot = null;
        this.webServer = null;
        
        // Trading state
        this.tradingPairs = config.TRADING_PAIRS || ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
        this.activeTrades = new Map();
        this.marketData = new Map();
        this.config = config;
        
        // Performance metrics
        this.performanceMetrics = {
            totalTrades: 0,
            successfulTrades: 0,
            totalProfit: 0,
            totalLoss: 0,
            startTime: Date.now(),
            uptime: 0
        };
        
        // Initialize components
        this.initializeComponents();
    }

    async initializeComponents() {
        try {
            logger.info('🚀 Initializing Crypto Trading Bot...');
            
            // Validate environment
            await this.validateEnvironment();
            
            // Ensure logs directory exists
            const logsDir = path.join(__dirname, 'logs');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
                logger.info('📁 Created logs directory');
            }

            // Initialize Binance APIs
            if (config.BINANCE_API_KEY && config.BINANCE_SECRET_KEY) {
                logger.info('📡 Initializing Binance APIs...');
                
                this.binanceAPI = new BinanceAPI({
                    apiKey: config.BINANCE_API_KEY,
                    secretKey: config.BINANCE_SECRET_KEY,
                    useTestnet: config.USE_TESTNET || false
                });

                this.binanceFuturesAPI = new BinanceFuturesAPI({
                    apiKey: config.BINANCE_API_KEY,
                    secretKey: config.BINANCE_SECRET_KEY,
                    useTestnet: config.USE_TESTNET || false
                });
                
                // Test API connection
                await this.testAPIConnection();
                logger.info('✅ Binance APIs initialized successfully');
            } else {
                logger.warn('⚠️ Binance API credentials not found - running in demo mode');
                this.binanceAPI = this.createMockBinanceAPI();
                this.binanceFuturesAPI = this.createMockBinanceFuturesAPI();
            }

            // Initialize Market Analyzer
            logger.info('📊 Initializing Market Analyzer...');
            this.marketAnalyzer = new MarketAnalyzer(this.binanceAPI);
            logger.info('✅ Market Analyzer initialized');

            // Initialize AI Analyzer (if enabled)
            if (config.ENABLE_AI_ANALYSIS) {
                logger.info('🤖 Initializing AI Analyzer...');
                this.aiAnalyzer = new AIAnalyzer();
                await this.aiAnalyzer.initialize();
                logger.info('✅ AI Analyzer initialized');
            } else {
                logger.info('⚠️ AI Analysis disabled in configuration');
                this.aiAnalyzer = null;
            }

            // Initialize Risk Manager
            logger.info('🛡️ Initializing Risk Manager...');
            this.riskManager = new RiskManager(config);
            logger.info('✅ Risk Manager initialized');

            // Initialize Trading Bot
            logger.info('🤖 Initializing Trading Bot...');
            this.tradingBot = new TradingBot({
                binanceAPI: this.binanceAPI,
                marketAnalyzer: this.marketAnalyzer,
                aiAnalyzer: this.aiAnalyzer,
                riskManager: this.riskManager,
                config: config
            });
            logger.info('✅ Trading Bot initialized');

            // Initialize Futures Strategy (if enabled)
            if (config.ENABLE_FUTURES_TRADING) {
                logger.info('⚡ Initializing Futures Strategy...');
                this.futuresStrategy = new FuturesStrategy({
                    binanceFuturesAPI: this.binanceFuturesAPI,
                    marketAnalyzer: this.marketAnalyzer,
                    aiAnalyzer: this.aiAnalyzer,
                    riskManager: this.riskManager,
                    config: config
                });
                logger.info('✅ Futures Strategy initialized');
            } else {
                logger.info('⚠️ Futures trading disabled in configuration');
            }

            // Initialize Telegram Bot (if enabled)
            if (config.TELEGRAM_BOT_TOKEN) {
                logger.info('📱 Initializing Telegram Bot...');
                this.telegramBot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID);
                await this.telegramBot.initialize();
                logger.info('✅ Telegram Bot initialized');
            } else {
                logger.info('⚠️ Telegram notifications disabled');
            }

            // Initialize Web Server
            logger.info('🌐 Initializing Web Server...');
            this.webServer = new WebServer(this);
            logger.info('✅ Web Server initialized');

            // Setup Express middleware
            this.setupExpress();

            // Setup cron jobs
            this.setupCronJobs();

            // Setup event listeners
            this.setupEventListeners();

            logger.info('🎉 All components initialized successfully!');
            
        } catch (error) {
            logger.error('❌ Failed to initialize components:', error);
            throw error;
        }
    }

    async validateEnvironment() {
        try {
            logger.info('🔍 Validating environment configuration...');
            
            // Check required environment variables
            const requiredVars = ['NODE_ENV'];
            const missingVars = requiredVars.filter(varName => !process.env[varName]);
            
            if (missingVars.length > 0) {
                logger.warn(`⚠️ Missing environment variables: ${missingVars.join(', ')}`);
            }

            // Validate numeric configurations
            const numericConfigs = [
                'FUTURES_LEVERAGE',
                'FUTURES_QTY_USDT',
                'RSI_LONG_THRESHOLD',
                'RSI_SHORT_THRESHOLD',
                'DAILY_MAX_LOSS_PERCENT'
            ];

            for (const configKey of numericConfigs) {
                if (config[configKey] && isNaN(parseFloat(config[configKey]))) {
                    throw new Error(`Invalid numeric value for ${configKey}: ${config[configKey]}`);
                }
            }

            // Validate API key formats (basic validation)
            if (config.BINANCE_API_KEY && config.BINANCE_API_KEY.length < 10) {
                throw new Error('Binance API key appears to be invalid (too short)');
            }

            if (config.BINANCE_SECRET_KEY && config.BINANCE_SECRET_KEY.length < 10) {
                throw new Error('Binance secret key appears to be invalid (too short)');
            }

            // Validate Telegram token format
            if (config.TELEGRAM_BOT_TOKEN) {
                const tokenRegex = /^\d+:[A-Za-z0-9_-]{35}$/;
                if (!tokenRegex.test(config.TELEGRAM_BOT_TOKEN)) {
                    throw new Error('Telegram bot token format is invalid');
                }
            }

            logger.info('✅ Environment validation successful');
            
        } catch (error) {
            logger.error('❌ Environment validation failed:', error.message);
            throw error;
        }
    }

    async testAPIConnection() {
        try {
            logger.info('🔗 Testing API connection...');
            
            if (this.binanceAPI) {
                const accountInfo = await this.binanceAPI.getAccountInfo();
                if (accountInfo && accountInfo.canTrade) {
                    logger.info('✅ Binance API connection successful');
                } else {
                    logger.warn('⚠️ Binance API connected but trading not enabled');
                }
            }

            if (this.binanceFuturesAPI) {
                const futuresAccountInfo = await this.binanceFuturesAPI.getAccountInfo();
                if (futuresAccountInfo) {
                    logger.info('✅ Binance Futures API connection successful');
                }
            }
            
        } catch (error) {
            logger.error('❌ API connection test failed:', error.message);
            if (error.message.includes('API-key')) {
                throw new Error('Invalid API credentials. Please check your Binance API key and secret.');
            }
            throw error;
        }
    }

    createMockBinanceAPI() {
        return {
            getAccountInfo: async () => ({ canTrade: false, balances: [] }),
            getSymbolInfo: async (symbol) => ({ symbol, status: 'TRADING' }),
            getKlines: async (symbol, interval, limit) => [],
            get24hrStats: async (symbol) => ({ symbol, priceChangePercent: '0.00' }),
            getOrderBook: async (symbol) => ({ bids: [], asks: [] }),
            newOrder: async () => { throw new Error('Demo mode - trading disabled'); }
        };
    }

    createMockBinanceFuturesAPI() {
        return {
            getAccountInfo: async () => ({ totalWalletBalance: '0.00' }),
            getPositions: async () => [],
            newOrder: async () => { throw new Error('Demo mode - futures trading disabled'); }
        };
    }

    setupExpress() {
        logger.info('⚙️ Setting up Express middleware...');
        
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors());
        
        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path} - ${req.ip}`);
            next();
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: process.version,
                environment: process.env.NODE_ENV || 'development'
            });
        });

        // API routes
        this.app.get('/api/status', (req, res) => {
            res.json({
                isRunning: this.isRunning,
                activeTrades: this.activeTrades.size,
                performanceMetrics: this.performanceMetrics,
                tradingPairs: this.tradingPairs
            });
        });

        this.app.get('/api/trades', (req, res) => {
            const trades = Array.from(this.activeTrades.values());
            res.json(trades);
        });

        this.app.get('/api/market-data', (req, res) => {
            const marketData = {};
            for (const [symbol, data] of this.marketData.entries()) {
                marketData[symbol] = data;
            }
            res.json(marketData);
        });

        // Error handling middleware
        this.app.use((error, req, res, next) => {
            logger.error('Express error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: error.message || 'Something went wrong'
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not found',
                message: 'The requested resource was not found'
            });
        });
    }

    setupCronJobs() {
        logger.info('⏰ Setting up cron jobs...');
        
        // Market analysis every 5 minutes
        const marketAnalysisJob = new cron.CronJob('*/5 * * * *', async () => {
            try {
                await this.performPeriodicAnalysis();
            } catch (error) {
                logger.error('Market analysis cron job failed:', error);
            }
        });

        // Performance metrics update every hour
        const performanceJob = new cron.CronJob('0 * * * *', async () => {
            try {
                await this.updatePerformanceMetrics();
            } catch (error) {
                logger.error('Performance update cron job failed:', error);
            }
        });

        // Daily report at 9 AM
        const dailyReportJob = new cron.CronJob('0 9 * * *', async () => {
            try {
                await this.generateDailyReport();
            } catch (error) {
                logger.error('Daily report cron job failed:', error);
            }
        });

        // Start cron jobs
        marketAnalysisJob.start();
        performanceJob.start();
        dailyReportJob.start();

        logger.info('✅ Cron jobs started successfully');
    }

    setupEventListeners() {
        logger.info('📡 Setting up event listeners...');
        
        // Trading bot events
        if (this.tradingBot) {
            this.tradingBot.on('trade_opened', (trade) => {
                this.handleTradeOpened(trade);
            });

            this.tradingBot.on('trade_closed', (trade) => {
                this.handleTradeClosed(trade);
            });

            this.tradingBot.on('error', (error) => {
                logger.error('Trading bot error:', error);
            });
        }

        // Market analyzer events
        if (this.marketAnalyzer) {
            this.marketAnalyzer.on('market_update', (data) => {
                this.handleMarketUpdate(data);
            });

            this.marketAnalyzer.on('signal_generated', (signal) => {
                this.handleTradingSignal(signal);
            });
        }

        // Process events
        process.on('SIGINT', () => {
            logger.info('Received SIGINT, shutting down gracefully...');
            this.shutdown();
        });

        process.on('SIGTERM', () => {
            logger.info('Received SIGTERM, shutting down gracefully...');
            this.shutdown();
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            this.shutdown();
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

        logger.info('✅ Event listeners set up successfully');
    }

    async handleTradeOpened(trade) {
        this.activeTrades.set(trade.id, trade);
        this.performanceMetrics.totalTrades++;
        
        logger.info(`🟢 Trade opened: ${trade.symbol} - ${trade.side}`, trade);
        
        if (this.telegramBot) {
            await this.telegramBot.sendTradeNotification(trade, 'opened');
        }
    }

    async handleTradeClosed(trade) {
        this.activeTrades.delete(trade.id);
        
        if (trade.profit > 0) {
            this.performanceMetrics.successfulTrades++;
            this.performanceMetrics.totalProfit += trade.profit;
        } else {
            this.performanceMetrics.totalLoss += Math.abs(trade.profit);
        }
        
        logger.info(`🔴 Trade closed: ${trade.symbol} - Profit: ${trade.profit}`, trade);
        
        if (this.telegramBot) {
            await this.telegramBot.sendTradeNotification(trade, 'closed');
        }
    }

    async handleMarketUpdate(data) {
        this.marketData.set(data.symbol, data);
        
        // Update performance metrics
        this.performanceMetrics.uptime = Date.now() - this.performanceMetrics.startTime;
    }

    async handleTradingSignal(signal) {
        logger.info(`📊 Trading signal received: ${signal.symbol} - ${signal.action}`, signal);
        
        if (this.tradingBot && this.isRunning) {
            try {
                await this.tradingBot.processSignal(signal);
            } catch (error) {
                logger.error('Failed to process trading signal:', error);
            }
        }
    }

    async performPeriodicAnalysis() {
        try {
            if (!this.marketAnalyzer) {
                logger.warn('Market analyzer not available for periodic analysis');
                return;
            }

            logger.info('🔍 Performing periodic market analysis...');
            
            for (const symbol of this.tradingPairs) {
                try {
                    await this.marketAnalyzer.analyzeSymbol(symbol);
                } catch (error) {
                    logger.error(`Failed to analyze ${symbol}:`, error.message);
                    continue;
                }
            }
            
            logger.info('✅ Periodic analysis completed');
            
        } catch (error) {
            logger.error('Periodic analysis failed:', error.message);
        }
    }

    async updatePerformanceMetrics() {
        try {
            this.performanceMetrics.uptime = Date.now() - this.performanceMetrics.startTime;
            
            // Calculate success rate
            const successRate = this.performanceMetrics.totalTrades > 0 ? 
                (this.performanceMetrics.successfulTrades / this.performanceMetrics.totalTrades) * 100 : 0;
            
            // Calculate net profit
            const netProfit = this.performanceMetrics.totalProfit - this.performanceMetrics.totalLoss;
            
            logger.info(`📊 Performance Update - Trades: ${this.performanceMetrics.totalTrades}, Success Rate: ${successRate.toFixed(2)}%, Net Profit: ${netProfit.toFixed(2)}`);
            
        } catch (error) {
            logger.error('Failed to update performance metrics:', error);
        }
    }

    async generateDailyReport() {
        try {
            const report = {
                date: new Date().toISOString().split('T')[0],
                totalTrades: this.performanceMetrics.totalTrades,
                successfulTrades: this.performanceMetrics.successfulTrades,
                successRate: this.performanceMetrics.totalTrades > 0 ? 
                    (this.performanceMetrics.successfulTrades / this.performanceMetrics.totalTrades) * 100 : 0,
                totalProfit: this.performanceMetrics.totalProfit,
                totalLoss: this.performanceMetrics.totalLoss,
                netProfit: this.performanceMetrics.totalProfit - this.performanceMetrics.totalLoss,
                activeTrades: this.activeTrades.size,
                uptime: this.performanceMetrics.uptime
            };
            
            logger.info('📈 Daily Report Generated:', report);
            
            if (this.telegramBot) {
                await this.telegramBot.sendDailyReport(report);
            }
            
        } catch (error) {
            logger.error('Failed to generate daily report:', error);
        }
    }

    async start() {
        try {
            logger.info('🚀 Starting Crypto Trading Bot...');
            
            // Start web server
            const port = config.PORT || 3000;
            this.server = this.app.listen(port, () => {
                logger.info(`🌐 Web server running on port ${port}`);
            });
            
            // Start trading bot
            if (this.tradingBot) {
                await this.tradingBot.start();
            }
            
            // Start futures strategy
            if (this.futuresStrategy) {
                await this.futuresStrategy.start();
            }
            
            // Start market analyzer
            if (this.marketAnalyzer) {
                await this.marketAnalyzer.start();
            }
            
            this.isRunning = true;
            logger.info('🎉 Crypto Trading Bot started successfully!');
            
            // Send startup notification
            if (this.telegramBot) {
                await this.telegramBot.sendMessage('🚀 Crypto Trading Bot started successfully!');
            }
            
        } catch (error) {
            logger.error('❌ Failed to start bot:', error);
            throw error;
        }
    }

    async shutdown() {
        try {
            logger.info('🛑 Shutting down Crypto Trading Bot...');
            
            this.isRunning = false;
            
            // Stop trading bot
            if (this.tradingBot) {
                await this.tradingBot.stop();
            }
            
            // Stop futures strategy
            if (this.futuresStrategy) {
                await this.futuresStrategy.stop();
            }
            
            // Stop market analyzer
            if (this.marketAnalyzer) {
                await this.marketAnalyzer.stop();
            }
            
            // Close web server
            if (this.server) {
                this.server.close();
            }
            
            // Send shutdown notification
            if (this.telegramBot) {
                await this.telegramBot.sendMessage('🛑 Crypto Trading Bot shut down');
            }
            
            logger.info('✅ Bot shut down successfully');
            process.exit(0);
            
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Create and start bot instance
const bot = new CryptoTradingBot();

// Start the bot
bot.start().catch(error => {
    logger.error('💥 Failed to start bot:', error);
    process.exit(1);
});

module.exports = CryptoTradingBot;
