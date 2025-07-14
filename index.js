require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./src/utils/logger');
const TradingBot = require('./src/core/TradingBot');
const TelegramBot = require('./src/telegram/TelegramBot');
const BinanceAPI = require('./src/exchange/BinanceAPI');
const BinanceFuturesAPI = require('./src/exchange/BinanceFuturesAPI');
const MarketAnalyzer = require('./src/analysis/MarketAnalyzer');
const AIAnalyzer = require('./src/analysis/AIAnalyzer');
const RiskManager = require('./src/core/RiskManager');
const FuturesStrategy = require('./src/strategies/FuturesStrategy');
const config = require('./src/config/config');

class CryptoTradingBot {
    constructor() {
        this.app = express();
        this.setupExpress();
        this.initializeComponents();
    }

    setupExpress() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        this.app.get('/health', (req, res) => {
            res.json({
                status: 'OK',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: require('./package.json').version
            });
        });

        this.app.get('/status', (req, res) => {
            res.json({
                spot: this.tradingBot ? this.tradingBot.getStatus() : null,
                futures: this.futuresStrategy ? this.futuresStrategy.getStatus() : null,
                market: this.marketAnalyzer ? this.marketAnalyzer.getMarketSummary() : null,
                ai: this.aiAnalyzer ? this.aiAnalyzer.getStatus() : null
            });
        });

        this.app.get('/futures/status', (req, res) => {
            res.json({
                status: this.futuresStrategy ? this.futuresStrategy.getStatus() : null,
                positions: this.futuresStrategy ? this.futuresStrategy.getActivePositions() : [],
                dailyStats: this.futuresStrategy ? this.futuresStrategy.getDailyStats() : null
            });
        });

        this.app.post('/futures/start', async (req, res) => {
            try {
                if (this.futuresStrategy && !this.futuresStrategy.isRunning) {
                    await this.futuresStrategy.start();
                    res.json({ success: true, message: 'Futures strategy started' });
                } else {
                    res.status(400).json({ success: false, message: 'Strategy already running or not available' });
                }
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/futures/stop', async (req, res) => {
            try {
                if (this.futuresStrategy && this.futuresStrategy.isRunning) {
                    await this.futuresStrategy.stop();
                    res.json({ success: true, message: 'Futures strategy stopped' });
                } else {
                    res.status(400).json({ success: false, message: 'Strategy not running or not available' });
                }
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.use((err, req, res, next) => {
            logger.error('Express error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    async initializeComponents() {
        try {
            logger.info('🚀 Initializing Crypto Trading Bot...');

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

            this.marketAnalyzer = new MarketAnalyzer(this.binanceAPI);
            this.aiAnalyzer = new AIAnalyzer();
            this.riskManager = new RiskManager(config);

            this.tradingBot = new TradingBot({
                binanceAPI: this.binanceAPI,
                marketAnalyzer: this.marketAnalyzer,
                aiAnalyzer: this.aiAnalyzer,
                riskManager: this.riskManager,
                config: config
            });

            this.futuresStrategy = new FuturesStrategy(this.binanceFuturesAPI, this.marketAnalyzer);
            this.tradingBot.futuresStrategy = this.futuresStrategy;
            this.tradingBot.futuresAPI = this.binanceFuturesAPI;

            this.telegramBot = new TelegramBot({
                token: config.TELEGRAM_BOT_TOKEN,
                adminUserIds: config.ADMIN_USER_IDS,
                tradingBot: this.tradingBot
            });

            await this.testConnections();

            logger.info('✅ All components initialized successfully');
        } catch (error) {
            logger.error('❌ Failed to initialize components:', error);
            process.exit(1);
        }
    }

    async testConnections() {
        logger.info('🔍 Testing connections...');

        try {
            await this.binanceAPI.testConnection();
            logger.info('✅ Binance Spot API connection successful');
        } catch (error) {
            logger.error('❌ Binance Spot API connection failed:', error.message);
        }

        try {
            await this.binanceFuturesAPI.testConnectivity();
            logger.info('✅ Binance Futures API connection successful');
        } catch (error) {
            logger.error('❌ Binance Futures API connection failed:', error.message);
        }

        try {
            await this.telegramBot.testConnection();
            logger.info('✅ Telegram Bot connection successful');
        } catch (error) {
            logger.error('❌ Telegram Bot connection failed:', error.message);
        }
    }

    async start() {
        try {
            await this.marketAnalyzer.startDataStream();

            if (config.ENABLE_AI_ANALYSIS) {
                await this.aiAnalyzer.initialize();
            }

            await this.tradingBot.start();

            if (config.BINANCE_API_KEY && config.BINANCE_SECRET_KEY) {
                logger.info('Futures strategy initialized - use Telegram commands to start');
            }

            await this.telegramBot.start();

            const port = config.PORT || 3000;
            this.server = this.app.listen(port, () => {
                logger.info(`🌐 Web server running on port ${port}`);
            });

            logger.info('🎯 Crypto Trading Bot is fully operational!');
            logger.info('📱 Send /help to your Telegram bot to see available commands');
            logger.info('⚡ Use /futures to access futures trading features');

            this.setupGracefulShutdown();
        } catch (error) {
            logger.error('❌ Failed to start bot:', error);
            process.exit(1);
        }
    }

    setupGracefulShutdown() {
        const gracefulShutdown = async (signal) => {
            logger.info(`📡 Received ${signal}. Starting graceful shutdown...`);

            try {
                if (this.futuresStrategy) {
                    await this.futuresStrategy.stop();
                }

                if (this.tradingBot) {
                    await this.tradingBot.stop();
                }

                if (this.marketAnalyzer) {
                    await this.marketAnalyzer.stopDataStream();
                }

                if (this.telegramBot) {
                    await this.telegramBot.stop();
                }

                if (this.server) {
                    this.server.close();
                }

                logger.info('✅ Graceful shutdown completed');
                process.exit(0);
            } catch (error) {
                logger.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon
    }
}

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

const bot = new CryptoTradingBot();
bot.start().catch(error => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
});
