require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./src/config/config');
const logger = require('./src/utils/logger');

// Core components
const BinanceAPI = require('./src/exchange/BinanceAPI');
const BinanceFuturesAPI = require('./src/exchange/BinanceFuturesAPI');
const MarketAnalyzer = require('./src/analysis/MarketAnalyzer');
const AIAnalyzer = require('./src/analysis/AIAnalyzer');
const TradingBot = require('./src/core/TradingBot');
const RiskManager = require('./src/core/RiskManager');
const TelegramBot = require('./src/telegram/TelegramBot');
const FuturesStrategy = require('./src/strategies/FuturesStrategy');

class CryptoTradingBot {
    constructor() {
        this.app = express();
        this.server = null;
        
        // Core components
        this.binanceAPI = null;
        this.binanceFuturesAPI = null;
        this.marketAnalyzer = null;
        this.aiAnalyzer = null;
        this.tradingBot = null;
        this.riskManager = null;
        this.telegramBot = null;
        this.futuresStrategy = null;
        
        // State management
        this.isInitialized = false;
        this.isRunning = false;
        this.startTime = Date.now();
        
        this.setupExpress();
        this.setupGlobalErrorHandlers();
    }

    setupExpress() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            const healthStatus = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                isInitialized: this.isInitialized,
                isRunning: this.isRunning,
                components: {
                    binanceSpot: this.binanceAPI ? 'connected' : 'disconnected',
                    binanceFutures: this.binanceFuturesAPI ? 'connected' : 'disconnected',
                    telegram: this.telegramBot ? 'connected' : 'disconnected',
                    trading: this.tradingBot?.isRunning ? 'active' : 'inactive',
                    futures: this.futuresStrategy?.isRunning ? 'active' : 'inactive'
                }
            };
            res.json(healthStatus);
        });

        // API endpoints
        this.setupAPIRoutes();
    }

    setupAPIRoutes() {
        // System status
        this.app.get('/api/status', (req, res) => {
            res.json({
                timestamp: Date.now(),
                uptime: Date.now() - this.startTime,
                trading: this.tradingBot ? this.tradingBot.getStatus() : null,
                futures: this.futuresStrategy ? this.futuresStrategy.getStatus() : null,
                market: this.marketAnalyzer ? this.marketAnalyzer.getMarketSummary() : null,
                ai: this.aiAnalyzer ? this.aiAnalyzer.getStatus() : null
            });
        });

        // Futures endpoints
        this.app.get('/api/futures/status', (req, res) => {
            if (!this.futuresStrategy) {
                return res.status(503).json({ error: 'Futures strategy not initialized' });
            }
            
            res.json({
                status: this.futuresStrategy.getStatus(),
                positions: this.futuresStrategy.getActivePositions(),
                dailyStats: this.futuresStrategy.getDailyStats()
            });
        });

        this.app.post('/api/futures/start', async (req, res) => {
            try {
                if (!this.futuresStrategy) {
                    return res.status(503).json({ error: 'Futures strategy not initialized' });
                }
                
                if (this.futuresStrategy.isRunning) {
                    return res.status(400).json({ error: 'Futures strategy already running' });
                }

                await this.futuresStrategy.start();
                res.json({ success: true, message: 'Futures strategy started' });
            } catch (error) {
                logger.error('Error starting futures strategy:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/futures/stop', async (req, res) => {
            try {
                if (!this.futuresStrategy) {
                    return res.status(503).json({ error: 'Futures strategy not initialized' });
                }
                
                if (!this.futuresStrategy.isRunning) {
                    return res.status(400).json({ error: 'Futures strategy not running' });
                }

                await this.futuresStrategy.stop();
                res.json({ success: true, message: 'Futures strategy stopped' });
            } catch (error) {
                logger.error('Error stopping futures strategy:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            logger.error('Express error:', err);
            res.status(500).json({ 
                error: 'Internal server error',
                timestamp: Date.now()
            });
        });
    }

    setupGlobalErrorHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            logger.error('Stack:', error.stack);
            
            // Graceful shutdown
            this.gracefulShutdown('UNCAUGHT_EXCEPTION');
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise);
            logger.error('Reason:', reason);
            
            // Don't exit immediately for unhandled rejections
            // Log and continue
        });

        // Handle process termination
        process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    }

    async validateEnvironment() {
        logger.info('🔍 Validating environment configuration...');

        const requiredEnvVars = [
            'TELEGRAM_BOT_TOKEN',
            'ADMIN_USER_IDS',
            'BINANCE_API_KEY',
            'BINANCE_SECRET_KEY'
        ];

        const missingVars = [];
        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                missingVars.push(envVar);
            }
        }

        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Validate API key formats
        if (process.env.BINANCE_API_KEY.length < 60) {
            throw new Error('Invalid Binance API Key format (too short)');
        }

        if (process.env.BINANCE_SECRET_KEY.length < 60) {
            throw new Error('Invalid Binance Secret Key format (too short)');
        }

        // Validate Telegram Bot Token format
        if (!process.env.TELEGRAM_BOT_TOKEN.match(/^\d+:[A-Za-z0-9_-]+$/)) {
            throw new Error('Invalid Telegram Bot Token format');
        }

        // Validate Admin User IDs
        const adminIds = process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim()));
        if (adminIds.some(id => isNaN(id) || id <= 0)) {
            throw new Error('Invalid Admin User IDs format');
        }

        // Validate numeric configurations
        const numericConfigs = [
            'FUTURES_LEVERAGE',
            'FUTURES_QTY_USDT',
            'FUTURES_TP_PERCENT',
            'FUTURES_SL_PERCENT',
            'RSI_LONG_THRESHOLD',
            'RSI_SHORT_THRESHOLD'
        ];

        for (const configKey of numericConfigs) {
            if (process.env[configKey] && isNaN(parseFloat(process.env[configKey]))) {
                throw new Error(`Invalid numeric value for ${configKey}: ${process.env[configKey]}`);
            }
        }

        logger.info('✅ Environment validation successful');
    }

// QUICK FIX FOR index.js
// Replace the initializeComponents method in your index.js with this:

async initializeComponents() {
    try {
        logger.info('🚀 Initializing Crypto Trading Bot...');

        // Validate environment first
        await this.validateEnvironment();

        // Initialize Binance APIs with correct parameter structure
        logger.info('📡 Initializing Binance APIs...');
        
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

        // Initialize Market Analyzer
        logger.info('📊 Initializing Market Analyzer...');
        this.marketAnalyzer = new MarketAnalyzer(this.binanceAPI);

        // Initialize AI Analyzer (if enabled)
        if (config.ENABLE_AI_ANALYSIS) {
            logger.info('🤖 Initializing AI Analyzer...');
            this.aiAnalyzer = new AIAnalyzer();
            await this.aiAnalyzer.initialize();
        } else {
            logger.info('⚠️ AI Analysis disabled in configuration');
        }

        // Initialize Risk Manager
        logger.info('🛡️ Initializing Risk Manager...');
this.riskManager = new RiskManager(config);
        // Initialize Trading Bot
        logger.info('🤖 Initializing Trading Bot...');
        this.tradingBot = new TradingBot({
            binanceAPI: this.binanceAPI,
            marketAnalyzer: this.marketAnalyzer,
            aiAnalyzer: this.aiAnalyzer,
            riskManager: this.riskManager,
            config: config
        });

        // Initialize Futures Strategy (if API keys are available)
        if (config.BINANCE_API_KEY && config.BINANCE_SECRET_KEY) {
            logger.info('⚡ Initializing Futures Strategy...');
            this.futuresStrategy = new FuturesStrategy({
                binanceFuturesAPI: this.binanceFuturesAPI,
                marketAnalyzer: this.marketAnalyzer,
                aiAnalyzer: this.aiAnalyzer,
                riskManager: this.riskManager
            });
        } else {
            logger.warn('⚠️ Futures Strategy not initialized - missing API keys');
        }

        // Initialize Telegram Bot
logger.info('📱 Initializing Telegram Bot...');

// Use direct environment variable
this.telegramBot = new TelegramBot({
    token: process.env.TELEGRAM_BOT_TOKEN,  // <-- Direct env var
    adminUserIds: config.ADMIN_USER_IDS,
    tradingBot: this.tradingBot,
    futuresStrategy: this.futuresStrategy,
    marketAnalyzer: this.marketAnalyzer,
    aiAnalyzer: this.aiAnalyzer
});

        this.isInitialized = true;
        logger.info('✅ All components initialized successfully');

    } catch (error) {
        logger.error('❌ Failed to initialize components:', error);
        throw error;
    }
}

// Also add this validation method if it doesn't exist:
async validateEnvironment() {
    logger.info('🔍 Validating environment configuration...');

    const requiredEnvVars = [
        'TELEGRAM_BOT_TOKEN',
        'ADMIN_USER_IDS',
        'BINANCE_API_KEY',
        'BINANCE_SECRET_KEY'
    ];

    const missingVars = [];
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            missingVars.push(envVar);
        }
    }

    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Validate API key formats
    if (process.env.BINANCE_API_KEY.length < 60) {
        throw new Error('Invalid Binance API Key format (too short)');
    }

    if (process.env.BINANCE_SECRET_KEY.length < 60) {
        throw new Error('Invalid Binance Secret Key format (too short)');
    }

    // Validate Telegram Bot Token format
    if (!process.env.TELEGRAM_BOT_TOKEN.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        throw new Error('Invalid Telegram Bot Token format');
    }

    // Validate Admin User IDs
    const adminIds = process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim()));
    if (adminIds.some(id => isNaN(id) || id <= 0)) {
        throw new Error('Invalid Admin User IDs format');
    }

    logger.info('✅ Environment validation successful');
}

    async testConnections() {
        logger.info('🔍 Testing connections...');

        const connectionResults = {
            binanceSpot: false,
            binanceFutures: false,
            telegram: false
        };

        try {
            // Test Binance Spot API
            if (this.binanceAPI) {
                await this.binanceAPI.testConnection();
                connectionResults.binanceSpot = true;
                logger.info('✅ Binance Spot API connection successful');
            }
        } catch (error) {
            logger.error('❌ Binance Spot API connection failed:', error.message);
        }

        try {
            // Test Binance Futures API
            if (this.binanceFuturesAPI) {
                await this.binanceFuturesAPI.testConnectivity();
                connectionResults.binanceFutures = true;
                logger.info('✅ Binance Futures API connection successful');
            }
        } catch (error) {
            logger.error('❌ Binance Futures API connection failed:', error.message);
        }

        try {
            // Test Telegram Bot
            if (this.telegramBot) {
                await this.telegramBot.testConnection();
                connectionResults.telegram = true;
                logger.info('✅ Telegram Bot connection successful');
            }
        } catch (error) {
            logger.error('❌ Telegram Bot connection failed:', error.message);
        }

        // Check if critical connections are working
        const criticalConnections = ['binanceFutures', 'telegram'];
        const failedCritical = criticalConnections.filter(conn => !connectionResults[conn]);
        
        if (failedCritical.length > 0) {
            logger.warn(`⚠️ Critical connections failed: ${failedCritical.join(', ')}`);
            logger.warn('⚠️ Bot may not function properly');
        } else {
            logger.info('✅ All critical connections successful');
        }

        return connectionResults;
    }

    async validateTradingReadiness() {
        logger.info('🔍 Validating trading readiness...');

        const checks = {
            apiKeys: false,
            balance: false,
            permissions: false,
            riskSettings: false
        };

        try {
            // Check API keys and permissions
            if (this.binanceFuturesAPI) {
                const accountInfo = await this.binanceFuturesAPI.getAccountInfo();
                checks.apiKeys = true;
                
                // Check if futures trading is enabled
                if (accountInfo.canTrade) {
                    checks.permissions = true;
                    logger.info('✅ Futures trading permissions verified');
                } else {
                    logger.error('❌ Futures trading not enabled on account');
                }

                // Check balance
                const balance = parseFloat(accountInfo.totalWalletBalance);
                const minBalance = config.MIN_ACCOUNT_BALANCE || 50;
                
                if (balance >= minBalance) {
                    checks.balance = true;
                    logger.info(`✅ Account balance sufficient: ${balance} USDT`);
                } else {
                    logger.error(`❌ Insufficient balance: ${balance} USDT (minimum: ${minBalance})`);
                }
            }

            // Validate risk settings
            const riskConfig = {
                dailyLoss: config.DAILY_MAX_LOSS_PERCENT,
                positionSize: config.FUTURES_QTY_USDT,
                leverage: config.FUTURES_LEVERAGE,
                stopLoss: config.FUTURES_SL_PERCENT
            };

            const isRiskConfigValid = (
                riskConfig.dailyLoss <= 10 &&
                riskConfig.positionSize <= 100 &&
                riskConfig.leverage <= 50 &&
                riskConfig.stopLoss <= 5
            );

            if (isRiskConfigValid) {
                checks.riskSettings = true;
                logger.info('✅ Risk settings are within safe parameters');
            } else {
                logger.error('❌ Risk settings are too aggressive');
                logger.error('Risk config:', riskConfig);
            }

        } catch (error) {
            logger.error('❌ Trading readiness validation failed:', error.message);
        }

        const allChecksPass = Object.values(checks).every(check => check);
        
        if (allChecksPass) {
            logger.info('✅ Bot is ready for trading');
        } else {
            logger.error('❌ Bot is NOT ready for trading');
            logger.error('Failed checks:', Object.entries(checks).filter(([, passed]) => !passed).map(([check]) => check));
        }

        return { passed: allChecksPass, checks };
    }

    async start() {
        try {
            logger.info('🎯 Starting Crypto Trading Bot...');

            // Test all connections
            const connectionResults = await this.testConnections();

            // Validate trading readiness
            const readinessResults = await this.validateTradingReadiness();

            // Start market data stream
            if (this.marketAnalyzer) {
                await this.marketAnalyzer.startDataStream();
                logger.info('📊 Market data stream started');
            }

            // Initialize AI if enabled
            if (this.aiAnalyzer && config.ENABLE_AI_ANALYSIS) {
                logger.info('🤖 AI Analyzer ready');
            }

            // Start trading bot (but not auto-trading)
            if (this.tradingBot) {
                await this.tradingBot.start();
                logger.info('🤖 Trading Bot engine started (manual mode)');
            }

            // Start Telegram bot
            if (this.telegramBot) {
                await this.telegramBot.start();
                logger.info('📱 Telegram Bot started');
            }

            // Start web server
            const port = config.PORT || 3000;
            this.server = this.app.listen(port, () => {
                logger.info(`🌐 Web server running on port ${port}`);
            });

            this.isRunning = true;

            // Show startup summary
            this.logStartupSummary(connectionResults, readinessResults);

            // Setup graceful shutdown handlers
            this.setupGracefulShutdown();

        } catch (error) {
            logger.error('❌ Failed to start bot:', error);
            process.exit(1);
        }
    }

    logStartupSummary(connectionResults, readinessResults) {
        logger.info('');
        logger.info('🎉=== CRYPTO TRADING BOT STARTUP COMPLETE ===');
        logger.info('');
        logger.info('📊 Status Summary:');
        logger.info(`   • Environment: ${config.NODE_ENV}`);
        logger.info(`   • Testnet Mode: ${config.USE_TESTNET ? 'ENABLED' : 'DISABLED'}`);
        logger.info(`   • AI Analysis: ${config.ENABLE_AI_ANALYSIS ? 'ENABLED' : 'DISABLED'}`);
        logger.info('');
        logger.info('🔗 Connections:');
        logger.info(`   • Binance Spot: ${connectionResults.binanceSpot ? '✅' : '❌'}`);
        logger.info(`   • Binance Futures: ${connectionResults.binanceFutures ? '✅' : '❌'}`);
        logger.info(`   • Telegram: ${connectionResults.telegram ? '✅' : '❌'}`);
        logger.info('');
        logger.info('⚡ Trading Readiness:');
        logger.info(`   • API Keys: ${readinessResults.checks.apiKeys ? '✅' : '❌'}`);
        logger.info(`   • Balance: ${readinessResults.checks.balance ? '✅' : '❌'}`);
        logger.info(`   • Permissions: ${readinessResults.checks.permissions ? '✅' : '❌'}`);
        logger.info(`   • Risk Settings: ${readinessResults.checks.riskSettings ? '✅' : '❌'}`);
        logger.info('');
        
        if (config.USE_TESTNET) {
            logger.info('🧪 TESTNET MODE - Safe for testing!');
        } else {
            logger.info('🚨 LIVE MODE - Real money at risk!');
        }
        
        logger.info('');
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

    setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            logger.info(`📡 Received ${signal}. Starting graceful shutdown...`);
            
            try {
                // Stop accepting new requests
                if (this.server) {
                    this.server.close(() => {
                        logger.info('🌐 Web server closed');
                    });
                }

                // Stop trading activities
                if (this.futuresStrategy && this.futuresStrategy.isRunning) {
                    logger.info('⚡ Stopping futures strategy...');
                    await this.futuresStrategy.stop();
                }

                if (this.tradingBot && this.tradingBot.isRunning) {
                    logger.info('🤖 Stopping trading bot...');
                    await this.tradingBot.stop();
                }

                // Close market data streams
                if (this.marketAnalyzer) {
                    logger.info('📊 Closing market data streams...');
                    await this.marketAnalyzer.stop();
                }

                // Stop Telegram bot
                if (this.telegramBot) {
                    logger.info('📱 Stopping Telegram bot...');
                    await this.telegramBot.stop();
                }

                // Dispose AI resources
                if (this.aiAnalyzer) {
                    logger.info('🤖 Disposing AI resources...');
                    this.aiAnalyzer.dispose();
                }

                logger.info('✅ Graceful shutdown completed');
                process.exit(0);

            } catch (error) {
                logger.error('❌ Error during graceful shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }

    async gracefulShutdown(reason) {
        logger.info(`📡 Shutdown initiated: ${reason}`);
        
        this.isRunning = false;
        
        try {
            // Emergency: Close all open positions if configured
            if (config.FORCE_CLOSE_ALL_ON_ERROR && this.futuresStrategy) {
                logger.info('🚨 Emergency: Closing all positions...');
                await this.futuresStrategy.closeAllPositions('emergency_shutdown');
            }

            // Stop all components
            if (this.server) {
                this.server.close();
            }

            if (this.futuresStrategy) {
                await this.futuresStrategy.stop();
            }

            if (this.tradingBot) {
                await this.tradingBot.stop();
            }

            if (this.marketAnalyzer) {
                await this.marketAnalyzer.stop();
            }

            if (this.telegramBot) {
                await this.telegramBot.stop();
            }

            if (this.aiAnalyzer) {
                this.aiAnalyzer.dispose();
            }

            logger.info('✅ Shutdown completed');
            
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
        } finally {
            process.exit(reason === 'UNCAUGHT_EXCEPTION' ? 1 : 0);
        }
    }
}

// ===================================================================
// MAIN EXECUTION
// ===================================================================

async function main() {
    try {
        const bot = new CryptoTradingBot();
        await bot.initializeComponents();
        await bot.start();
    } catch (error) {
        logger.error('❌ Fatal error during bot startup:', error);
        process.exit(1);
    }
}

// Start the bot
if (require.main === module) {
    main().catch(error => {
        logger.error('❌ Unhandled error in main:', error);
        process.exit(1);
    });
}

module.exports = CryptoTradingBot;
