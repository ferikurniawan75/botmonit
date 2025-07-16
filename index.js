//tesbron  
#!/usr/bin/env node

/**
 * Crypto Trading Bot - Main Entry Point
 * Advanced cryptocurrency trading bot with AI analysis, futures trading, and Telegram integration
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

// Core Components
const config = require('./src/config/config');
const logger = require('./src/utils/logger');

// API Classes
const BinanceAPI = require('./src/exchange/BinanceAPI');
const BinanceFuturesAPI = require('./src/exchange/BinanceFuturesAPI');

// Core Trading Components
const TradingBot = require('./src/core/TradingBot');
const MarketAnalyzer = require('./src/analysis/MarketAnalyzer');
const AIAnalyzer = require('./src/analysis/AIAnalyzer');
const RiskManager = require('./src/core/RiskManager');
const FuturesStrategy = require('./src/strategies/FuturesStrategy');

// Communication
const TelegramBot = require('./src/telegram/TelegramBot');

class CryptoTradingBotApp {
    constructor() {
        this.app = express();
        this.server = null;
        this.isShuttingDown = false;
        
        // Core components
        this.binanceAPI = null;
        this.binanceFuturesAPI = null;
        this.marketAnalyzer = null;
        this.aiAnalyzer = null;
        this.riskManager = null;
        this.tradingBot = null;
        this.futuresStrategy = null;
        this.telegramBot = null;
        this.healthCheckInterval = null;
        
        // Performance tracking
        this.startTime = new Date();
        this.connectionStatus = {
            binanceSpot: false,
            binanceFutures: false,
            telegram: false
        };
        
        this.tradingReadiness = {
            apiKeys: false,
            balance: false,
            permissions: false,
            riskSettings: false
        };
        
        // Simple health monitoring (inline)
        this.healthStatus = {
            isHealthy: true,
            lastCheck: Date.now(),
            errors: []
        };
        
        this.initializeApp();
    }

    async initializeApp() {
        try {
            logger.info('🚀 Initializing Crypto Trading Bot...');
            logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`🧪 Testnet Mode: ${config.USE_TESTNET ? 'ENABLED' : 'DISABLED'}`);
            
            // Setup Express middleware
            this.setupMiddleware();
            
            // Setup API routes
            this.setupRoutes();
            
            // Initialize components
            await this.initializeComponents();
            
            // Validate system readiness
            await this.validateReadiness();
            
            logger.info('✅ Application initialization complete');
            
        } catch (error) {
            logger.error('❌ Failed to initialize application:', error);
            process.exit(1);
        }
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false
        }));
        
        // CORS configuration
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
            credentials: true
        }));
        
        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Static files
        this.app.use('/static', express.static(path.join(__dirname, 'public')));
        
        // Request logging
        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
            });
            next();
        });
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            const health = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
                environment: process.env.NODE_ENV || 'development',
                testnet: config.USE_TESTNET,
                connections: this.connectionStatus,
                tradingReadiness: this.tradingReadiness,
                version: require('./package.json').version
            };
            
            const allConnectionsHealthy = Object.values(this.connectionStatus).some(status => status === true);
            
            if (!allConnectionsHealthy) {
                health.status = 'degraded';
                res.status(503);
            }
            
            res.json(health);
        });

        // Status endpoint with detailed information
        this.app.get('/status', (req, res) => {
            const status = {
                bot: {
                    isRunning: this.tradingBot?.isRunning || false,
                    tradingMode: this.tradingBot?.tradingMode || 'unknown',
                    enabledStrategies: this.tradingBot?.enabledStrategies ? 
                        Array.from(this.tradingBot.enabledStrategies) : [],
                    activeTrades: this.tradingBot?.getActiveTrades ? this.tradingBot.getActiveTrades().length : 0
                },
                market: {
                    isStreaming: this.marketAnalyzer?.isRunning || false,
                    activeSymbols: this.marketAnalyzer?.getActiveSymbols ? this.marketAnalyzer.getActiveSymbols().length : 0
                },
                ai: {
                    isEnabled: config.ENABLE_AI_ANALYSIS,
                    isReady: this.aiAnalyzer?.isInitialized || false
                },
                connections: this.connectionStatus,
                tradingReadiness: this.tradingReadiness
            };
            res.json(status);
        });

        // Trading control endpoints
        this.app.post('/trading/start', async (req, res) => {
            try {
                if (!this.tradingBot) {
                    return res.status(400).json({ error: 'Trading bot not initialized' });
                }
                
                if (this.tradingBot.startTrading) {
                    await this.tradingBot.startTrading();
                }
                res.json({ message: 'Trading started successfully' });
            } catch (error) {
                logger.error('Failed to start trading via API:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/trading/stop', async (req, res) => {
            try {
                if (!this.tradingBot) {
                    return res.status(400).json({ error: 'Trading bot not initialized' });
                }
                
                if (this.tradingBot.stopTrading) {
                    await this.tradingBot.stopTrading();
                }
                res.json({ message: 'Trading stopped successfully' });
            } catch (error) {
                logger.error('Failed to stop trading via API:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Graceful shutdown endpoint
        this.app.post('/shutdown', async (req, res) => {
            res.json({ message: 'Shutdown initiated' });
            await this.gracefulShutdown('API_REQUEST');
        });

        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({ 
                error: 'Endpoint not found',
                availableEndpoints: ['/health', '/status', '/trading/start', '/trading/stop']
            });
        });

        // Error handler
        this.app.use((error, req, res, next) => {
            logger.error('Express error:', error);
            res.status(500).json({ 
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        });
    }

    async initializeComponents() {
        try {
            logger.info('🔧 Initializing core components...');

            // Ensure logs directory exists
            const logsDir = path.join(__dirname, 'logs');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }

            // Initialize Binance APIs
            if (config.BINANCE_API_KEY && config.BINANCE_SECRET_KEY) {
                this.binanceAPI = new BinanceAPI({
                    apiKey: config.BINANCE_API_KEY,
                    secretKey: config.BINANCE_SECRET_KEY,
                    useTestnet: config.USE_TESTNET
                });

                this.binanceFuturesAPI = new BinanceFuturesAPI({
                    apiKey: config.BINANCE_API_KEY,
                    secretKey: config.BINANCE_SECRET_KEY,
                    useTestnet: config.USE_TESTNET
                });
            } else {
                logger.warn('⚠️ Binance API credentials not found - running in demo mode');
                // Create mock API for demo mode
                this.binanceAPI = this.createMockBinanceAPI();
                this.binanceFuturesAPI = this.createMockBinanceFuturesAPI();
            }

            // Initialize market analyzer (only if binanceAPI exists)
            if (this.binanceAPI) {
                this.marketAnalyzer = new MarketAnalyzer(this.binanceAPI);
            } else {
                logger.error('❌ Cannot initialize MarketAnalyzer without BinanceAPI');
                throw new Error('BinanceAPI is required for MarketAnalyzer');
            }

            // Initialize AI analyzer
            this.aiAnalyzer = new AIAnalyzer();

            // Initialize risk manager
            this.riskManager = new RiskManager(config);

            // Initialize trading bot (only if required components exist)
            if (this.binanceAPI && this.marketAnalyzer) {
                this.tradingBot = new TradingBot({
                    binanceAPI: this.binanceAPI,
                    marketAnalyzer: this.marketAnalyzer,
                    aiAnalyzer: this.aiAnalyzer,
                    riskManager: this.riskManager,
                    config: config
                });
            } else {
                logger.error('❌ Cannot initialize TradingBot without required components');
                throw new Error('Required components missing for TradingBot');
            }

            // Initialize futures strategy (only if futures API exists)
            if (this.binanceFuturesAPI && this.marketAnalyzer) {
                this.futuresStrategy = new FuturesStrategy(this.binanceFuturesAPI, this.marketAnalyzer);
                if (this.tradingBot) {
                    this.tradingBot.futuresStrategy = this.futuresStrategy;
                    this.tradingBot.futuresAPI = this.binanceFuturesAPI;
                }
            }

            // Initialize Telegram bot (only if token exists)
            if (config.TELEGRAM_BOT_TOKEN && this.tradingBot) {
                this.telegramBot = new TelegramBot({
                    token: config.TELEGRAM_BOT_TOKEN,
                    adminUserIds: config.ADMIN_USER_IDS,
                    tradingBot: this.tradingBot
                });
                
                // Actually start the telegram bot here so it's ready for testing
                try {
                    await this.telegramBot.start();
                    logger.info('📱 Telegram Bot initialized and started');
                } catch (error) {
                    logger.warn('⚠️ Telegram bot failed to start during init:', error.message);
                }
            } else {
                logger.warn('⚠️ Telegram bot not initialized - token missing or trading bot failed');
            }

            // Test connections AFTER everything is initialized
            await this.testConnections();

            logger.info('✅ All components initialized successfully');
        } catch (error) {
            logger.error('❌ Failed to initialize components:', error);
            throw error;
        }
    }

    // Mock API methods for demo mode
    createMockBinanceAPI() {
        const EventEmitter = require('events');
        
        return Object.assign(new EventEmitter(), {
            async testConnection() {
                logger.info('Mock Binance API - connection test passed');
                return true;
            },
            async getAccountInfo() {
                return {
                    balances: [
                        { asset: 'USDT', free: '1000.00', locked: '0.00' },
                        { asset: 'BTC', free: '0.00000000', locked: '0.00000000' }
                    ]
                };
            },
            startTickerStream() {
                logger.info('Mock ticker stream started');
                // Emit mock ticker updates
                setTimeout(() => {
                    this.emit('tickerUpdate', {
                        symbol: 'BTCUSDT',
                        price: '65000.00',
                        priceChangePercent: '2.5',
                        volume: '1000.00'
                    });
                }, 1000);
            },
            startKlineStream() {
                logger.info('Mock kline stream started');
                // Emit mock kline updates
                setTimeout(() => {
                    this.emit('klineUpdate', {
                        symbol: 'BTCUSDT',
                        open: '64500.00',
                        high: '65500.00',
                        low: '64000.00',
                        close: '65000.00',
                        volume: '100.00',
                        closeTime: Date.now(),
                        isFinal: true
                    });
                }, 2000);
            },
            stopAllStreams() {
                logger.info('Mock streams stopped');
            }
        });
    }

    createMockBinanceFuturesAPI() {
        return {
            async testConnectivity() {
                logger.info('Mock Futures API - connectivity test passed');
                return true;
            },
            async getAccount() {
                return {
                    totalWalletBalance: '1000.00',
                    availableBalance: '1000.00',
                    assets: [
                        { asset: 'USDT', walletBalance: '1000.00', availableBalance: '1000.00' }
                    ]
                };
            }
        };
    }

    async testConnections() {
        logger.info('🔍 Testing connections...');

        // Test Binance Spot API
        if (this.binanceAPI) {
            try {
                await this.binanceAPI.testConnection();
                this.connectionStatus.binanceSpot = true;
                logger.info('✅ Binance Spot API connection successful');
            } catch (error) {
                this.connectionStatus.binanceSpot = false;
                logger.error('❌ Binance Spot API connection failed:', error.message);
            }
        } else {
            this.connectionStatus.binanceSpot = false;
            logger.warn('⚠️ Binance Spot API not initialized');
        }

        // Test Binance Futures API
        if (this.binanceFuturesAPI) {
            try {
                await this.binanceFuturesAPI.testConnectivity();
                this.connectionStatus.binanceFutures = true;
                logger.info('✅ Binance Futures API connection successful');
            } catch (error) {
                this.connectionStatus.binanceFutures = false;
                logger.error('❌ Binance Futures API connection failed:', error.message);
            }
        } else {
            this.connectionStatus.binanceFutures = false;
            logger.warn('⚠️ Binance Futures API not initialized');
        }

        // Test Telegram Bot (only if properly initialized and started)
        if (this.telegramBot && config.TELEGRAM_BOT_TOKEN) {
            try {
                // Check if bot is running before testing connection
                if (this.telegramBot.isRunning) {
                    await this.telegramBot.testConnection();
                    this.connectionStatus.telegram = true;
                    logger.info('✅ Telegram Bot connection successful');
                } else {
                    this.connectionStatus.telegram = false;
                    logger.warn('⚠️ Telegram Bot not running yet');
                }
            } catch (error) {
                this.connectionStatus.telegram = false;
                logger.error('❌ Telegram Bot connection failed:', error.message);
            }
        } else {
            this.connectionStatus.telegram = false;
            if (!config.TELEGRAM_BOT_TOKEN) {
                logger.warn('⚠️ Telegram Bot token not provided');
            } else {
                logger.warn('⚠️ Telegram Bot not initialized');
            }
        }

        // Check critical connections
        const criticalConnections = [];
        if (!this.connectionStatus.binanceSpot) criticalConnections.push('binance');
        // Don't treat telegram as critical since bot can work without it
        
        if (criticalConnections.length > 0) {
            logger.warn(`⚠️ Critical connections failed: ${criticalConnections.join(', ')}`);
            logger.warn('⚠️ Bot may not function properly');
        } else {
            logger.info('✅ All critical connections successful');
        }
    }

    async validateReadiness() {
        logger.info('🔍 Validating trading readiness...');

        try {
            // Check API keys
            if (config.BINANCE_API_KEY && config.BINANCE_SECRET_KEY) {
                this.tradingReadiness.apiKeys = true;
            }

            // Check account access and balance
            if (this.connectionStatus.binanceSpot) {
                try {
                    const accountInfo = await this.binanceAPI.getAccountInfo();
                    if (accountInfo) {
                        this.tradingReadiness.balance = true;
                        this.tradingReadiness.permissions = true;
                    }
                } catch (error) {
                    logger.error('Failed to get account info:', error.message);
                }
            }

            // Check risk settings
            if (this.riskManager) {
                this.tradingReadiness.riskSettings = true;
            }

            const readyChecks = Object.entries(this.tradingReadiness)
                .filter(([key, value]) => !value)
                .map(([key]) => key);

            if (readyChecks.length > 0) {
                logger.error('❌ Trading readiness validation failed:', readyChecks);
                logger.error('❌ Bot is NOT ready for trading');
                logger.error('Failed checks:', readyChecks);
            } else {
                logger.info('✅ Trading readiness validation passed');
                logger.info('✅ Bot is ready for trading');
            }

        } catch (error) {
            logger.error('❌ Trading readiness validation failed:', error.message);
        }
    }

    async start() {
        try {
            logger.info('[MARKET] Starting market data streams');
            
            // Start market data streams (only if market analyzer exists)
            if (this.marketAnalyzer && this.marketAnalyzer.startDataStream) {
                await this.marketAnalyzer.startDataStream();
                logger.info('📊 Market data stream started');
            } else {
                logger.warn('⚠️ Market analyzer not available - skipping data streams');
            }

            // Initialize and start AI analyzer
            if (config.ENABLE_AI_ANALYSIS && this.aiAnalyzer) {
                try {
                    await this.aiAnalyzer.initialize();
                    logger.info('🤖 AI Analyzer ready');
                } catch (error) {
                    logger.warn('⚠️ AI Analyzer initialization failed:', error.message);
                }
            }

            // Start trading bot
            if (this.tradingBot) {
                logger.info('[TRADE] Starting TradingBot...');
                await this.tradingBot.start();
                logger.info('🤖 Trading Bot engine started (manual mode)');
            } else {
                logger.warn('⚠️ Trading bot not available');
            }

            // Telegram bot already started in initializeComponents(), just log status
            if (this.telegramBot) {
                logger.info('📱 Telegram Bot ready (already started)');
            } else {
                logger.warn('⚠️ Telegram bot not available');
            }

            // Start health monitoring
            this.startSimpleHealthMonitoring();

            // Start web server
            const port = config.PORT || 3000;
            this.server = this.app.listen(port, () => {
                logger.info(`🌐 Web server running on port ${port}`);
            });

            // Log startup summary
            this.logStartupSummary();

            // Setup graceful shutdown handlers
            this.setupGracefulShutdown();

            // Signal PM2 that app is ready
            if (process.send) {
                process.send('ready');
            }

        } catch (error) {
            logger.error('❌ Failed to start bot:', error);
            process.exit(1);
        }
    }

    logStartupSummary() {
        logger.info('');
        logger.info('🎉=== CRYPTO TRADING BOT STARTUP COMPLETE ===');
        logger.info('');
        logger.info('📊 Status Summary:');
        logger.info(`   • Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`   • Testnet Mode: ${config.USE_TESTNET ? 'ENABLED' : 'DISABLED'}`);
        logger.info(`   • AI Analysis: ${config.ENABLE_AI_ANALYSIS ? 'ENABLED' : 'DISABLED'}`);
        logger.info('');
        logger.info('🔗 Connections:');
        logger.info(`   • Binance Spot: ${this.connectionStatus.binanceSpot ? '✅' : '❌'}`);
        logger.info(`   • Binance Futures: ${this.connectionStatus.binanceFutures ? '✅' : '❌'}`);
        logger.info(`   • Telegram: ${this.connectionStatus.telegram ? '✅' : '❌'}`);
        logger.info('');
        logger.info('⚡ Trading Readiness:');
        logger.info(`   • API Keys: ${this.tradingReadiness.apiKeys ? '✅' : '❌'}`);
        logger.info(`   • Balance: ${this.tradingReadiness.balance ? '✅' : '❌'}`);
        logger.info(`   • Permissions: ${this.tradingReadiness.permissions ? '✅' : '❌'}`);
        logger.info(`   • Risk Settings: ${this.tradingReadiness.riskSettings ? '✅' : '❌'}`);
        logger.info('');
        if (config.USE_TESTNET) {
            logger.info('🧪 TESTNET MODE - Safe for testing!');
            logger.info('');
        }
        logger.info('📱 Next Steps:');
        logger.info('   • Send /help to your Telegram bot for commands');
        logger.info('   • Use /futures to access futures trading features');
        logger.info('   • Monitor logs with: npm run logs');
        logger.info('   • Check health: curl http://localhost:3000/health');
        logger.info('');
        logger.info('🛡️ Safety Reminders:');
        logger.info('   • Start with small position sizes');
        logger.info('   • Monitor daily P&L limits');
        logger.info('   • Always use stop losses');
        logger.info('   • Have an emergency stop plan');
        logger.info('');
        logger.info('===============================================');
        logger.info('');
    }

    // Simple health monitoring methods
    startSimpleHealthMonitoring() {
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 60000); // Check every minute
    }

    stopSimpleHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    performHealthCheck() {
        try {
            this.healthStatus.lastCheck = Date.now();
            this.healthStatus.errors = [];

            // Check trading bot health
            if (this.tradingBot && !this.tradingBot.isRunning) {
                this.healthStatus.errors.push('Trading bot not running');
            }

            // Check market analyzer health
            if (this.marketAnalyzer && !this.marketAnalyzer.isRunning) {
                this.healthStatus.errors.push('Market analyzer not streaming');
            }

            // Check connection status
            if (!this.connectionStatus.binanceSpot) {
                this.healthStatus.errors.push('Binance connection failed');
            }

            this.healthStatus.isHealthy = this.healthStatus.errors.length === 0;

            if (!this.healthStatus.isHealthy) {
                logger.warn('Health check failed:', this.healthStatus.errors);
            }

        } catch (error) {
            logger.error('Health check error:', error);
            this.healthStatus.isHealthy = false;
            this.healthStatus.errors.push('Health check failed');
        }
    }

    setupGracefulShutdown() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
        
        signals.forEach(signal => {
            process.on(signal, async () => {
                await this.gracefulShutdown(signal);
            });
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            logger.error('Uncaught Exception:', error);
            await this.gracefulShutdown('UNCAUGHT_EXCEPTION');
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            await this.gracefulShutdown('UNHANDLED_REJECTION');
        });
    }

    async gracefulShutdown(signal) {
        if (this.isShuttingDown) {
            logger.warn('Shutdown already in progress...');
            return;
        }

        this.isShuttingDown = true;
        logger.info(`📡 Received ${signal}. Starting graceful shutdown...`);

        try {
            // Set shutdown timeout
            const shutdownTimeout = setTimeout(() => {
                logger.error('⏰ Shutdown timeout reached, forcing exit');
                process.exit(1);
            }, 30000); // 30 seconds

            // Stop accepting new requests
            if (this.server) {
                this.server.close();
                logger.info('🌐 Web server stopped');
            }

            // Stop health monitoring
            this.stopSimpleHealthMonitoring();
            logger.info('💚 Health monitor stopped');

            // Stop trading bot
            if (this.tradingBot && this.tradingBot.stop) {
                await this.tradingBot.stop();
                logger.info('🤖 Trading bot stopped');
            }

            // Stop market analyzer
            if (this.marketAnalyzer && this.marketAnalyzer.stopDataStream) {
                await this.marketAnalyzer.stopDataStream();
                logger.info('📊 Market analyzer stopped');
            }

            // Stop Telegram bot
            if (this.telegramBot && this.telegramBot.stop) {
                await this.telegramBot.stop();
                logger.info('📱 Telegram bot stopped');
            }

            // Stop AI analyzer
            if (this.aiAnalyzer && this.aiAnalyzer.cleanup) {
                await this.aiAnalyzer.cleanup();
                logger.info('🧠 AI analyzer stopped');
            }

            clearTimeout(shutdownTimeout);
            logger.info('✅ Graceful shutdown completed');
            process.exit(0);

        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Handle PM2 graceful reload
if (process.env.NODE_ENV === 'production') {
    process.on('SIGINT', () => {
        logger.info('Received SIGINT from PM2, shutting down gracefully');
        process.exit(0);
    });
}

// Create and start the application
const app = new CryptoTradingBotApp();

// Start the bot
app.start().catch(error => {
    logger.error('❌ Failed to start application:', error);
    process.exit(1);
});

// Export for testing
module.exports = CryptoTradingBotApp;
