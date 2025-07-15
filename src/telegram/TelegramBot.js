const TelegramBotAPI = require('node-telegram-bot-api');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const config = require('../config/config');

class TelegramBot extends EventEmitter {
    constructor({ token, adminUserIds, tradingBot }) {
        super();
        
        this.token = token;
        this.adminUserIds = adminUserIds;
        this.tradingBot = tradingBot;
        this.bot = null;
        this.isRunning = false;
        this.authorizedChats = new Set();
        
        this.commands = new Map();
        this.setupCommands();
    }

    async start() {
        if (this.isRunning) {
            logger.telegram('Bot already running');
            return;
        }

        try {
            this.bot = new TelegramBotAPI(this.token, { polling: true });
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Set up trading bot event listeners
            this.setupTradingBotListeners();
            
            this.isRunning = true;
            logger.telegram('Telegram bot started successfully');
            
        } catch (error) {
            logger.error('Failed to start Telegram bot:', error);
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning || !this.bot) {
            return;
        }

        try {
            await this.bot.stopPolling();
            this.bot = null;
            this.isRunning = false;
            logger.telegram('Telegram bot stopped');
        } catch (error) {
            logger.error('Error stopping Telegram bot:', error);
        }
    }

    async testConnection() {
        try {
            if (!this.bot) throw new Error("Bot not initialized"); const me = await this.bot.getMe();
            logger.telegram('Bot connection test successful', { username: me.username });
            return true;
        } catch (error) {
            logger.error('Bot connection test failed:', error);
            throw error;
        }
    }

    setupCommands() {
        // Basic commands
        this.commands.set('/start', this.handleStart.bind(this));
        this.commands.set('/help', this.handleHelp.bind(this));
        this.commands.set('/status', this.handleStatus.bind(this));
        this.commands.set('/balance', this.handleBalance.bind(this));
        
        // Trading commands
        this.commands.set('/trades', this.handleTrades.bind(this));
        this.commands.set('/stats', this.handleStats.bind(this));
        this.commands.set('/starttrading', this.handleStartTrading.bind(this));
        this.commands.set('/stoptrading', this.handleStopTrading.bind(this));
        this.commands.set('/close', this.handleCloseTrade.bind(this));
        this.commands.set('/closeall', this.handleCloseAll.bind(this));
        
        // Market commands
        this.commands.set('/market', this.handleMarket.bind(this));
        this.commands.set('/top', this.handleTopCoins.bind(this));
        this.commands.set('/trending', this.handleTrending.bind(this));
        this.commands.set('/analyze', this.handleAnalyze.bind(this));
        
        // AI & Analysis commands
        this.commands.set('/ai', this.handleAIStatus.bind(this));
        this.commands.set('/signals', this.handleSignals.bind(this));
        this.commands.set('/risk', this.handleRisk.bind(this));
        
        // Settings commands
        this.commands.set('/settings', this.handleSettings.bind(this));
        this.commands.set('/mode', this.handleTradingMode.bind(this));
        this.commands.set('/strategy', this.handleStrategy.bind(this));
        
        // Futures commands
        this.commands.set('/futures', this.handleFutures.bind(this));
        this.commands.set('/futuresstatus', this.handleFuturesStatus.bind(this));
        this.commands.set('/futuresstart', this.handleFuturesStart.bind(this));
        this.commands.set('/futuresstop', this.handleFuturesStop.bind(this));
        this.commands.set('/dailystats', this.handleDailyStats.bind(this));
        this.commands.set('/positions', this.handlePositions.bind(this));
        this.commands.set('/closeposition', this.handleClosePosition.bind(this));
        this.commands.set('/emergency', this.handleEmergency.bind(this));
        this.commands.set('/leverage', this.handleLeverage.bind(this));
        this.commands.set('/symbol', this.handleSymbol.bind(this));
        this.commands.set('/rsi', this.handleRSI.bind(this));
        this.commands.set('/filters', this.handleFilters.bind(this));
    }

    setupEventHandlers() {
        this.bot.on('message', this.handleMessage.bind(this));
        this.bot.on('callback_query', this.handleCallbackQuery.bind(this));
        this.bot.on('error', this.handleError.bind(this));
        this.bot.on('polling_error', this.handlePollingError.bind(this));
    }

    setupTradingBotListeners() {
        if (!this.tradingBot) return;

        this.tradingBot.on('tradeOpened', (trade) => {
            this.notifyAdmins(`🟢 *Trade Opened*\n\n` +
                `Symbol: ${trade.symbol}\n` +
                `Side: ${trade.side}\n` +
                `Quantity: ${trade.quantity}\n` +
                `Entry Price: ${trade.entryPrice}\n` +
                `Strategy: ${trade.strategy}\n` +
                `Confidence: ${(trade.confidence * 100).toFixed(1)}%\n` +
                `Stop Loss: ${trade.stopLoss?.toFixed(6) || 'N/A'}\n` +
                `Take Profit: ${trade.takeProfit?.toFixed(6) || 'N/A'}`,
                this.createTradeKeyboard(trade.id)
            );
        });

        this.tradingBot.on('tradeClosed', (trade) => {
            const pnlEmoji = trade.pnl > 0 ? '🟢' : '🔴';
            const pnlText = trade.pnl > 0 ? 'PROFIT' : 'LOSS';
            
            this.notifyAdmins(`${pnlEmoji} *Trade Closed - ${pnlText}*\n\n` +
                `Symbol: ${trade.symbol}\n` +
                `Side: ${trade.side}\n` +
                `Entry: ${trade.entryPrice}\n` +
                `Exit: ${trade.exitPrice}\n` +
                `P&L: ${trade.pnl.toFixed(2)}% (${trade.pnlUSDT > 0 ? '+' : ''}${trade.pnlUSDT.toFixed(2)})\n` +
                `Duration: ${this.formatDuration(trade.duration)}\n` +
                `Reason: ${trade.closeReason}\n` +
                `Strategy: ${trade.strategy}`
            );
        });

        // Futures strategy events
        if (this.tradingBot.futuresStrategy) {
            this.tradingBot.futuresStrategy.on('notification', (message) => {
                this.notifyAdmins(message);
            });

            this.tradingBot.futuresStrategy.on('started', () => {
                this.notifyAdmins('🚀 *Futures Strategy Started*\n\nBot is now monitoring signals every 30 seconds.');
            });

            this.tradingBot.futuresStrategy.on('stopped', () => {
                this.notifyAdmins('⏹️ *Futures Strategy Stopped*\n\nSignal monitoring has been disabled.');
            });
        }

        // Risk management events
        if (this.tradingBot.riskManager) {
            this.tradingBot.riskManager.on('riskWarning', (warning) => {
                this.notifyAdmins(`⚠️ *Risk Warning*\n\n` +
                    `Type: ${warning.type}\n` +
                    `Current: ${warning.current?.toFixed(2)}%\n` +
                    `Limit: ${warning.limit}%\n\n` +
                    `Please review your positions.`
                );
            });

            this.tradingBot.riskManager.on('emergencyStop', (event) => {
                this.notifyAdmins(`🚨 *EMERGENCY STOP*\n\n` +
                    `Reason: ${event.type}\n` +
                    `Trading has been automatically stopped!\n\n` +
                    `Current Loss: ${event.current?.toFixed(2)}%\n` +
                    `Limit: ${event.limit}%`
                );
            });
        }
    }

    async handleMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        // Check authorization
        if (!this.isAuthorized(userId)) {
            await this.bot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
            return;
        }

        // Add to authorized chats
        this.authorizedChats.add(chatId);

        // Handle commands
        if (text?.startsWith('/')) {
            const command = text.split(' ')[0];
            const args = text.split(' ').slice(1);
            
            if (this.commands.has(command)) {
                try {
                    await this.commands.get(command)(chatId, args, msg);
                } catch (error) {
                    logger.error(`Error handling command ${command}:`, error);
                    await this.bot.sendMessage(chatId, '❌ An error occurred while processing your command.');
                }
            } else {
                await this.bot.sendMessage(chatId, '❓ Unknown command. Use /help to see available commands.');
            }
        }
    }

    async handleCallbackQuery(query) {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;

        if (!this.isAuthorized(userId)) {
            await this.bot.answerCallbackQuery(query.id, 'Not authorized');
            return;
        }

        try {
            await this.bot.answerCallbackQuery(query.id);
            
            // MAIN MENU CALLBACKS
            if (data === 'refresh_status') {
                await this.handleStatus(chatId);
            } else if (data === 'futures_overview') {
                await this.handleFutures(chatId);
            } else if (data === 'refresh_trades') {
                await this.handleTrades(chatId);
            } else if (data === 'market') {
                await this.handleMarket(chatId);
            }
            
            // FUTURES CALLBACKS
            else if (data === 'futures_start') {
                await this.handleFuturesStart(chatId);
            } else if (data === 'futures_stop') {
                await this.handleFuturesStop(chatId);
            } else if (data === 'futures_positions') {
                await this.handlePositions(chatId);
            } else if (data === 'futures_stats') {
                await this.handleDailyStats(chatId);
            } else if (data === 'futures_settings') {
                await this.sendFuturesSettings(chatId);
            } else if (data === 'futures_emergency') {
                await this.handleEmergency(chatId);
            } else if (data === 'confirm_emergency') {
                await this.executeEmergencyClose(chatId);
            } else if (data === 'cancel_emergency') {
                await this.bot.editMessageText('❌ Emergency close cancelled', {
                    chat_id: chatId,
                    message_id: query.message.message_id
                });
            }
            
            // MARKET CALLBACKS
            else if (data === 'top_coins') {
                await this.handleTopCoins(chatId);
            } else if (data === 'trending_coins') {
                await this.handleTrending(chatId);
            } else if (data === 'analyze_menu') {
                await this.bot.sendMessage(chatId, 'Use /analyze [SYMBOL] to analyze a specific coin.\n\nExample: /analyze BTCUSDT');
            }
            
            // TRADING CALLBACKS
            else if (data.startsWith('close_trade_')) {
                const tradeId = data.replace('close_trade_', '');
                await this.closeTrade(chatId, tradeId);
            } else if (data.startsWith('mode_')) {
                const mode = data.replace('mode_', '');
                await this.setTradingMode(chatId, mode);
            } else if (data.startsWith('strategy_')) {
                const action = data.replace('strategy_', '');
                await this.toggleStrategy(chatId, action);
            } else if (data === 'close_all_trades') {
                await this.handleCloseAll(chatId);
            } else if (data === 'trading_stats') {
                await this.handleStats(chatId);
            }
            
            // UNKNOWN CALLBACK
            else {
                logger.error('Unknown callback data:', data);
                await this.bot.sendMessage(chatId, '❓ Unknown action. Please try again.');
            }
            
        } catch (error) {
            logger.error('Error handling callback query:', error);
            await this.bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
        }
    }

    handleError(error) {
        logger.error('Telegram bot error:', error);
    }

    handlePollingError(error) {
        logger.error('Telegram polling error:', error);
    }

    isAuthorized(userId) {
        return this.adminUserIds.includes(userId);
    }

    createTradeKeyboard(tradeId) {
        return [
            [{ text: '❌ Close Trade', callback_data: `close_trade_${tradeId}` }]
        ];
    }

    createModeKeyboard() {
        return [
            [
                { text: 'Conservative', callback_data: 'mode_conservative' },
                { text: 'Balanced', callback_data: 'mode_balanced' }
            ],
            [
                { text: 'Aggressive', callback_data: 'mode_aggressive' },
                { text: 'Scalping', callback_data: 'mode_scalping' }
            ]
        ];
    }

    createStrategyKeyboard() {
        return [
            [
                { text: 'AI Signals', callback_data: 'strategy_ai_signals' },
                { text: 'Technical', callback_data: 'strategy_technical_analysis' }
            ],
            [
                { text: 'Momentum', callback_data: 'strategy_momentum' },
                { text: 'Sentiment', callback_data: 'strategy_sentiment_analysis' }
            ]
        ];
    }

    // BASIC COMMAND HANDLERS

    async handleStart(chatId) {
        const welcome = `🤖 *Crypto Trading Bot*\n\n` +
            `Welcome to the advanced cryptocurrency trading bot!\n\n` +
            `This bot features:\n` +
            `• AI-powered market analysis\n` +
            `• Multiple trading strategies\n` +
            `• Futures trading with RSI signals\n` +
            `• Risk management\n` +
            `• Real-time notifications\n\n` +
            `Use /help to see all available commands.`;

        const keyboard = [
            [
                { text: '📊 Status', callback_data: 'refresh_status' },
                { text: '⚡ Futures', callback_data: 'futures_overview' }
            ],
            [
                { text: '💼 Trades', callback_data: 'refresh_trades' },
                { text: '📈 Market', callback_data: 'market' }
            ]
        ];

        await this.bot.sendMessage(chatId, welcome, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    async handleHelp(chatId) {
        const help_text = (
            "*Available Commands:*\n\n" +
            "*Basic Commands:*\n" +
            "/start - Start the bot\n" +
            "/help - Show this help message\n" +
            "/status - Show bot status\n" +
            "/balance - Show account balance\n\n" +
            "*Spot Trading Commands:*\n" +
            "/trades - Show active trades\n" +
            "/stats - Show trading statistics\n" +
            "/starttrading - Start trading\n" +
            "/stoptrading - Stop trading\n" +
            "/close [tradeId] - Close specific trade\n" +
            "/closeall - Close all trades\n\n" +
            "*Futures Trading Commands:*\n" +
            "/futures - Futures overview & controls\n" +
            "/futuresstatus - Detailed futures status\n" +
            "/futuresstart - Start futures strategy\n" +
            "/futuresstop - Stop futures strategy\n" +
            "/positions - Show active positions\n" +
            "/dailystats - Show daily P&L stats\n" +
            "/emergency - Emergency close all positions\n\n" +
            "*Futures Settings:*\n" +
            "/symbol [SYMBOL] - Change trading pair\n" +
            "/leverage [1-125] - Set leverage\n" +
            "/rsi [long] [short] - Set RSI thresholds\n" +
            "/filters [filter] [on/off] - Toggle filters\n\n" +
            "*Market Commands:*\n" +
            "/market - Market overview\n" +
            "/top - Top volume coins\n" +
            "/trending - Trending coins\n" +
            "/analyze [symbol] - Analyze specific coin\n\n" +
            "*AI & Analysis:*\n" +
            "/ai - AI analyzer status\n" +
            "/signals - Current trading signals\n" +
            "/risk - Risk assessment\n\n" +
            "*Settings:*\n" +
            "/settings - Bot settings\n" +
            "/mode [mode] - Set trading mode\n" +
            "/strategy [strategy] - Toggle strategy\n\n" +
            "💡 *Futures Strategy Info:*\n" +
            "• Checks signals every 30 seconds\n" +
            "• Long: RSI < 30 + Green candle\n" +
            "• Short: RSI > 70 + Red candle\n" +
            "• Auto TP/SL with precise positioning\n" +
            "• Daily profit/loss limits\n" +
            "• News hours filter (12,14,16,20 UTC)"
        );
        
        await this.bot.sendMessage(chatId, help_text, { parse_mode: 'Markdown' });
    }

    async handleStatus(chatId) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            const status = this.tradingBot.getStatus();
            
            const statusMessage = `📊 *Bot Status*\n\n` +
                `Status: ${status.isRunning ? '🟢 Running' : '🔴 Stopped'}\n` +
                `Trading Mode: ${status.tradingMode || 'balanced'}\n` +
                `Active Trades: ${status.activeTrades || 0}\n` +
                `Total Trades: ${status.totalTrades || 0}\n` +
                `Win Rate: ${status.winRate?.toFixed(1) || '0'}%\n` +
                `Total P&L: ${status.totalPnL?.toFixed(2) || '0'}%\n` +
                `Max Drawdown: ${status.maxDrawdown?.toFixed(2) || '0'}%\n\n` +
                `*Enabled Strategies:*\n` +
                `${status.enabledStrategies?.map(s => `• ${s}`).join('\n') || 'None'}\n\n` +
                `*System Info:*\n` +
                `Uptime: ${this.formatDuration(process.uptime() * 1000)}\n` +
                `Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`;

            const keyboard = [
                [
                    { text: '🔄 Refresh', callback_data: 'refresh_status' },
                    { text: '💼 Trades', callback_data: 'refresh_trades' }
                ],
                [
                    { text: '⚙️ Settings', callback_data: 'settings_menu' },
                    { text: '📊 Stats', callback_data: 'trading_stats' }
                ]
            ];

            await this.bot.sendMessage(chatId, statusMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Error in handleStatus:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get bot status');
        }
    }

    async handleBalance(chatId) {
        try {
            if (!this.tradingBot || !this.tradingBot.binanceAPI) {
                await this.bot.sendMessage(chatId, '❌ No API connection available');
                return;
            }

            const balance = await this.tradingBot.getAccountBalance();
            
            if (!balance) {
                await this.bot.sendMessage(chatId, '❌ Failed to get account balance');
                return;
            }

            let balanceMessage = `💰 *Account Balance*\n\n`;
            
            if (balance.balances) {
                const significantBalances = balance.balances
                    .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
                    .slice(0, 10);

                if (significantBalances.length > 0) {
                    significantBalances.forEach(bal => {
                        const free = parseFloat(bal.free);
                        const locked = parseFloat(bal.locked);
                        const total = free + locked;
                        
                        if (total > 0.001) {
                            balanceMessage += `*${bal.asset}*: ${total.toFixed(6)}\n`;
                            if (locked > 0) {
                                balanceMessage += `  Free: ${free.toFixed(6)} | Locked: ${locked.toFixed(6)}\n`;
                            }
                        }
                    });
                } else {
                    balanceMessage += `No significant balances found`;
                }
            } else {
                balanceMessage += `Unable to retrieve balance details`;
            }

            await this.bot.sendMessage(chatId, balanceMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Error in handleBalance:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get account balance');
        }
    }

    async handleTrades(chatId) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            const activeTrades = this.tradingBot.getActiveTrades();
            
            let tradesMessage = `💼 *Active Trades*\n\n`;
            
            if (activeTrades.length === 0) {
                tradesMessage += `No active trades\n\n`;
                tradesMessage += `*Trading Status:*\n`;
                tradesMessage += `Bot: ${this.tradingBot.isRunning ? '🟢 Running' : '🔴 Stopped'}\n`;
                tradesMessage += `Mode: ${this.tradingBot.tradingMode || 'balanced'}\n`;
                tradesMessage += `Strategies: ${this.tradingBot.enabledStrategies?.size || 0} enabled`;
            } else {
                tradesMessage += `Total: ${activeTrades.length} trades\n\n`;
                
                activeTrades.forEach((trade, index) => {
                    const pnlEmoji = (trade.pnl || 0) >= 0 ? '🟢' : '🔴';
                    const duration = trade.openTime ? Date.now() - trade.openTime : 0;
                    
                    tradesMessage += `${pnlEmoji} *Trade ${index + 1}*\n`;
                    tradesMessage += `Symbol: ${trade.symbol}\n`;
                    tradesMessage += `Side: ${trade.side}\n`;
                    tradesMessage += `Entry: ${trade.entryPrice}\n`;
                    tradesMessage += `Current: ${trade.currentPrice || 'Loading...'}\n`;
                    tradesMessage += `P&L: ${trade.pnl ? trade.pnl.toFixed(2) + '%' : 'Calculating...'}\n`;
                    tradesMessage += `Strategy: ${trade.strategy}\n`;
                    tradesMessage += `Duration: ${this.formatDuration(duration)}\n\n`;
                });
            }

            const keyboard = [
                [
                    { text: '🔄 Refresh', callback_data: 'refresh_trades' },
                    { text: '📊 Stats', callback_data: 'trading_stats' }
                ]
            ];

            if (activeTrades.length > 0) {
                keyboard.push([
                    { text: '❌ Close All', callback_data: 'close_all_trades' }
                ]);
            }

            await this.bot.sendMessage(chatId, tradesMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Error in handleTrades:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get trades data. Try /trades command directly.');
        }
    }

    async handleMarket(chatId) {
        try {
            let marketMessage = `📈 *Market Overview*\n\n`;
            
            // Get market data from analyzer if available
            if (this.tradingBot && this.tradingBot.marketAnalyzer) {
                try {
                    const marketSummary = this.tradingBot.marketAnalyzer.getMarketSummary();
                    
                    if (marketSummary) {
                        marketMessage += `*Top Gainers:*\n`;
                        if (marketSummary.topGainers && marketSummary.topGainers.length > 0) {
                            marketSummary.topGainers.slice(0, 5).forEach((coin, index) => {
                                marketMessage += `${index + 1}. ${coin.symbol}: +${coin.priceChangePercent?.toFixed(2)}%\n`;
                            });
                        } else {
                            marketMessage += `No data available\n`;
                        }
                        
                        marketMessage += `\n*Top Losers:*\n`;
                        if (marketSummary.topLosers && marketSummary.topLosers.length > 0) {
                            marketSummary.topLosers.slice(0, 5).forEach((coin, index) => {
                                marketMessage += `${index + 1}. ${coin.symbol}: ${coin.priceChangePercent?.toFixed(2)}%\n`;
                            });
                        } else {
                            marketMessage += `No data available\n`;
                        }
                        
                        marketMessage += `\n*Top Volume:*\n`;
                        if (marketSummary.topVolume && marketSummary.topVolume.length > 0) {
                            marketSummary.topVolume.slice(0, 5).forEach((coin, index) => {
                                marketMessage += `${index + 1}. ${coin.symbol}: $${parseFloat(coin.quoteVolume || 0).toLocaleString()}\n`;
                            });
                        } else {
                            marketMessage += `No data available\n`;
                        }
                    } else {
                        marketMessage += `📊 Loading market data...\n\n`;
                        marketMessage += `*Major Pairs:*\n`;
                        marketMessage += `• BTCUSDT\n`;
                        marketMessage += `• ETHUSDT\n`;
                        marketMessage += `• BNBUSDT\n`;
                        marketMessage += `• ADAUSDT\n`;
                        marketMessage += `• SOLUSDT\n\n`;
                        marketMessage += `Use /analyze [symbol] for detailed analysis`;
                    }
                } catch (error) {
                    logger.error('Error getting market summary:', error);
                    marketMessage += `❌ Failed to load market data\n\n`;
                    marketMessage += `Try:\n`;
                    marketMessage += `• /analyze BTCUSDT - Bitcoin analysis\n`;
                    marketMessage += `• /analyze ETHUSDT - Ethereum analysis\n`;
                    marketMessage += `• /top - Top volume coins\n`;
                    marketMessage += `• /trending - Trending coins`;
                }
            } else {
                marketMessage += `📊 Market analyzer not available\n\n`;
                marketMessage += `Available commands:\n`;
                marketMessage += `• /analyze [SYMBOL] - Analyze specific coin\n`;
                marketMessage += `• /top - Top volume coins\n`;
                marketMessage += `• /trending - Trending coins`;
            }

            const keyboard = [
                [
                    { text: '🔄 Refresh', callback_data: 'market' },
                    { text: '📊 Top Coins', callback_data: 'top_coins' }
                ],
                [
                    { text: '📈 Trending', callback_data: 'trending_coins' },
                    { text: '🎯 Analyze', callback_data: 'analyze_menu' }
                ]
            ];

            await this.bot.sendMessage(chatId, marketMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Error in handleMarket:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get market data. Try /market command directly.');
        }
    }

    async handleStats(chatId) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            const stats = this.tradingBot.getStatistics();
            const recentTrades = this.tradingBot.getTradeHistory(10);
            
            let statsMessage = `📊 *Trading Statistics*\n\n`;
            
            statsMessage += `*Overall Performance:*\n`;
            statsMessage += `Total Trades: ${stats.totalTrades || 0}\n`;
            statsMessage += `Winning Trades: ${stats.winningTrades || 0}\n`;
            statsMessage += `Losing Trades: ${stats.losingTrades || 0}\n`;
            statsMessage += `Win Rate: ${stats.winRate?.toFixed(1) || '0'}%\n`;
            statsMessage += `Total P&L: ${stats.totalPnL?.toFixed(2) || '0'}%\n`;
            statsMessage += `Average Return: ${stats.averageReturn?.toFixed(2) || '0'}%\n`;
            statsMessage += `Max Drawdown: ${stats.maxDrawdown?.toFixed(2) || '0'}%\n`;
            statsMessage += `Sharpe Ratio: ${stats.sharpeRatio?.toFixed(2) || '0'}\n\n`;
            
            if (recentTrades.length > 0) {
                statsMessage += `*Recent Trades (Last ${recentTrades.length}):*\n`;
                recentTrades.forEach((trade, index) => {
                    const pnlEmoji = trade.pnl > 0 ? '🟢' : '🔴';
                    statsMessage += `${pnlEmoji} ${trade.symbol} ${trade.side}: ${trade.pnl?.toFixed(2) || '0'}%\n`;
                });
            } else {
                statsMessage += `*Recent Trades:*\nNo completed trades yet`;
            }

            await this.bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Error in handleStats:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get trading statistics');
        }
    }

    async handleTopCoins(chatId) {
        try {
            let topMessage = `📊 *Top Volume Coins*\n\n`;
            
            if (this.tradingBot && this.tradingBot.marketAnalyzer) {
                const marketSummary = this.tradingBot.marketAnalyzer.getMarketSummary();
                
                if (marketSummary && marketSummary.topVolume) {
                    marketSummary.topVolume.slice(0, 10).forEach((coin, index) => {
                        const volume = parseFloat(coin.quoteVolume || 0);
                        const change = parseFloat(coin.priceChangePercent || 0);
                        const changeEmoji = change >= 0 ? '🟢' : '🔴';
                        
                        topMessage += `${index + 1}. ${changeEmoji} *${coin.symbol}*\n`;
                        topMessage += `   Price: ${parseFloat(coin.price || 0).toLocaleString()}\n`;
                        topMessage += `   Change: ${change.toFixed(2)}%\n`;
                        topMessage += `   Volume: ${volume.toLocaleString()}\n\n`;
                    });
                } else {
                    topMessage += `Unable to load volume data\n\n`;
                    topMessage += `Try /market for market overview`;
                }
            } else {
                topMessage += `Market analyzer not available\n\n`;
                topMessage += `Use /analyze [SYMBOL] to analyze specific coins`;
            }

            await this.bot.sendMessage(chatId, topMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Error in handleTopCoins:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get top coins data');
        }
    }

    async handleTrending(chatId) {
        try {
            let trendingMessage = `📈 *Trending Coins*\n\n`;
            
            if (this.tradingBot && this.tradingBot.marketAnalyzer) {
                const marketSummary = this.tradingBot.marketAnalyzer.getMarketSummary();
                
                if (marketSummary && marketSummary.topGainers) {
                    trendingMessage += `*Top Gainers:*\n`;
                    marketSummary.topGainers.slice(0, 5).forEach((coin, index) => {
                        trendingMessage += `${index + 1}. 🟢 ${coin.symbol}: +${coin.priceChangePercent?.toFixed(2)}%\n`;
                    });
                }
                
                if (marketSummary && marketSummary.topLosers) {
                    trendingMessage += `\n*Top Losers:*\n`;
                    marketSummary.topLosers.slice(0, 5).forEach((coin, index) => {
                        trendingMessage += `${index + 1}. 🔴 ${coin.symbol}: ${coin.priceChangePercent?.toFixed(2)}%\n`;
                    });
                }
            } else {
                trendingMessage += `Market analyzer not available\n\n`;
                trendingMessage += `Use /analyze [SYMBOL] to analyze specific coins`;
            }

            await this.bot.sendMessage(chatId, trendingMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Error in handleTrending:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get trending data');
        }
    }

    async handleAnalyze(chatId, args) {
        try {
            if (args.length === 0) {
                await this.bot.sendMessage(chatId, 'Please specify a symbol. Example: /analyze BTCUSDT');
                return;
            }

            const symbol = args[0].toUpperCase();
            
            if (!this.tradingBot || !this.tradingBot.marketAnalyzer) {
                await this.bot.sendMessage(chatId, '❌ Market analyzer not available');
                return;
            }

            await this.bot.sendMessage(chatId, `🔍 Analyzing ${symbol}...`);

            // Request analysis
            const analysis = await this.tradingBot.requestMarketAnalysis(symbol);
            
            if (analysis) {
                let analysisMessage = `📊 *${symbol} Analysis*\n\n`;
                
                if (analysis.marketData) {
                    const data = analysis.marketData;
                    const changeEmoji = data.priceChangePercent >= 0 ? '🟢' : '🔴';
                    
                    analysisMessage += `*Current Price:* ${parseFloat(data.price).toLocaleString()}\n`;
                    analysisMessage += `*24h Change:* ${changeEmoji} ${data.priceChangePercent?.toFixed(2)}%\n`;
                    analysisMessage += `*24h Volume:* ${parseFloat(data.volume || 0).toLocaleString()}\n`;
                    analysisMessage += `*24h High:* ${parseFloat(data.high || 0).toLocaleString()}\n`;
                    analysisMessage += `*24h Low:* ${parseFloat(data.low || 0).toLocaleString()}\n\n`;
                }
                
                if (analysis.indicators) {
                    const ind = analysis.indicators;
                    analysisMessage += `*Technical Indicators:*\n`;
                    if (ind.RSI) analysisMessage += `RSI: ${ind.RSI.toFixed(2)}\n`;
                    if (ind.MACD) analysisMessage += `MACD: ${ind.MACD.toFixed(4)}\n`;
                    if (ind.SMA_20) analysisMessage += `SMA 20: ${ind.SMA_20.toFixed(4)}\n`;
                    if (ind.EMA_12) analysisMessage += `EMA 12: ${ind.EMA_12.toFixed(4)}\n`;
                }
                
                if (analysis.predictions) {
                    const pred = analysis.predictions;
                    analysisMessage += `\n*AI Predictions:*\n`;
                    if (pred.priceDirection) {
                        analysisMessage += `Direction: ${pred.priceDirection.direction}\n`;
                        analysisMessage += `Confidence: ${(pred.priceDirection.confidence * 100).toFixed(1)}%\n`;
                    }
                    if (pred.volatility) {
                        analysisMessage += `Volatility: ${pred.volatility.level}\n`;
                    }
                }

                await this.bot.sendMessage(chatId, analysisMessage, { parse_mode: 'Markdown' });
            } else {
                await this.bot.sendMessage(chatId, `❌ Failed to analyze ${symbol}. Please check the symbol and try again.`);
            }

        } catch (error) {
            logger.error('Error in handleAnalyze:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to perform analysis');
        }
    }

    async handleAIStatus(chatId) {
        try {
            if (!this.tradingBot || !this.tradingBot.aiAnalyzer) {
                await this.bot.sendMessage(chatId, '❌ AI analyzer not available');
                return;
            }

            const aiStatus = this.tradingBot.aiAnalyzer.getStatus();
            
            let aiMessage = `🤖 *AI Analyzer Status*\n\n`;
            aiMessage += `Status: ${aiStatus.initialized ? '🟢 Active' : '🔴 Inactive'}\n`;
            aiMessage += `Models: ${aiStatus.models?.join(', ') || 'None'}\n`;
            aiMessage += `Overall Accuracy: ${(aiStatus.accuracy?.overall * 100)?.toFixed(1) || '0'}%\n`;
            aiMessage += `Total Predictions: ${aiStatus.predictions?.total || 0}\n`;
            aiMessage += `Symbols Analyzed: ${aiStatus.predictions?.symbols || 0}\n\n`;
            
            if (aiStatus.accuracy?.byModel) {
                aiMessage += `*Model Accuracy:*\n`;
                Object.entries(aiStatus.accuracy.byModel).forEach(([model, acc]) => {
                    aiMessage += `${model}: ${(acc * 100).toFixed(1)}%\n`;
                });
            }

            await this.bot.sendMessage(chatId, aiMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Error in handleAIStatus:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get AI status');
        }
    }

    async handleSignals(chatId) {
        try {
            let signalsMessage = `📡 *Current Trading Signals*\n\n`;
            
            if (!this.tradingBot) {
                signalsMessage += `❌ Trading bot not initialized`;
            } else {
                // Get recent signals or generate new ones
                signalsMessage += `🔍 Scanning for signals...\n\n`;
                signalsMessage += `*Available Strategies:*\n`;
                
                const strategies = this.tradingBot.enabledStrategies || new Set();
                if (strategies.size > 0) {
                    Array.from(strategies).forEach(strategy => {
                        signalsMessage += `• ${strategy}\n`;
                    });
                } else {
                    signalsMessage += `No strategies enabled`;
                }
                
                signalsMessage += `\nUse /analyze [SYMBOL] for specific coin signals`;
            }

            await this.bot.sendMessage(chatId, signalsMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Error in handleSignals:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get signals');
        }
    }

    async handleRisk(chatId) {
        try {
            let riskMessage = `🛡️ *Risk Assessment*\n\n`;
            
            if (!this.tradingBot) {
                riskMessage += `❌ Trading bot not initialized`;
            } else {
                const status = this.tradingBot.getStatus();
                const activeTrades = this.tradingBot.getActiveTrades();
                
                riskMessage += `*Current Risk Level:* `;
                
                const riskLevel = this.calculateRiskLevel(status, activeTrades);
                const riskEmoji = riskLevel === 'LOW' ? '🟢' : riskLevel === 'MEDIUM' ? '🟡' : '🔴';
                
                riskMessage += `${riskEmoji} ${riskLevel}\n\n`;
                riskMessage += `*Risk Factors:*\n`;
                riskMessage += `Active Trades: ${status.activeTrades || 0}\n`;
                riskMessage += `Current Drawdown: ${status.maxDrawdown?.toFixed(2) || '0'}%\n`;
                riskMessage += `Win Rate: ${status.winRate?.toFixed(1) || '0'}%\n\n`;
                
                if (status.totalPnL < -5) {
                    riskMessage += `⚠️ *Warning:* Total P&L below -5%\n`;
                }
                
                if (status.activeTrades > 5) {
                    riskMessage += `⚠️ *Warning:* High number of concurrent trades\n`;
                }
                
                riskMessage += `\n*Recommendations:*\n`;
                riskMessage += `• Monitor positions closely\n`;
                riskMessage += `• Use stop losses\n`;
                riskMessage += `• Diversify trading pairs\n`;
                riskMessage += `• Regular profit taking`;
            }

            await this.bot.sendMessage(chatId, riskMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Error in handleRisk:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get risk assessment');
        }
    }

    calculateRiskLevel(status, activeTrades) {
        let riskScore = 0;
        
        // High number of trades increases risk
        if (status.activeTrades > 10) riskScore += 3;
        else if (status.activeTrades > 5) riskScore += 2;
        else if (status.activeTrades > 3) riskScore += 1;
        
        // Low win rate increases risk
        if (status.winRate < 30) riskScore += 3;
        else if (status.winRate < 50) riskScore += 2;
        else if (status.winRate < 70) riskScore += 1;
        
        // High drawdown increases risk
        if (Math.abs(status.maxDrawdown) > 15) riskScore += 3;
        else if (Math.abs(status.maxDrawdown) > 10) riskScore += 2;
        else if (Math.abs(status.maxDrawdown) > 5) riskScore += 1;
        
        if (riskScore >= 6) return 'HIGH';
        if (riskScore >= 3) return 'MEDIUM';
        return 'LOW';
    }

    async handleSettings(chatId) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            const status = this.tradingBot.getStatus();
            
            let settingsMessage = `⚙️ *Bot Settings*\n\n`;
            settingsMessage += `*Trading Configuration:*\n`;
            settingsMessage += `Mode: ${status.tradingMode || 'balanced'}\n`;
            settingsMessage += `Status: ${status.isRunning ? '🟢 Running' : '🔴 Stopped'}\n`;
            settingsMessage += `Active Strategies: ${status.enabledStrategies?.length || 0}\n\n`;
            
            settingsMessage += `*Enabled Strategies:*\n`;
            if (status.enabledStrategies && status.enabledStrategies.length > 0) {
                status.enabledStrategies.forEach(strategy => {
                    settingsMessage += `• ${strategy}\n`;
                });
            } else {
                settingsMessage += `No strategies enabled`;
            }

            const keyboard = [
                [
                    { text: '🎛️ Trading Mode', callback_data: 'settings_mode' },
                    { text: '🔧 Strategies', callback_data: 'settings_strategies' }
                ],
                [
                    { text: '⚡ Futures', callback_data: 'futures_overview' },
                    { text: '🛡️ Risk', callback_data: 'settings_risk' }
                ]
            ];

            await this.bot.sendMessage(chatId, settingsMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Error in handleSettings:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get settings');
        }
    }

    async handleTradingMode(chatId, args) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            if (args.length === 0) {
                const currentMode = this.tradingBot.tradingMode || 'balanced';
                
                const modeMessage = `🎛️ *Trading Mode*\n\n` +
                    `Current: ${currentMode}\n\n` +
                    `*Available Modes:*\n` +
                    `• conservative - Lower risk, smaller trades\n` +
                    `• balanced - Moderate risk/reward\n` +
                    `• aggressive - Higher risk, larger trades\n` +
                    `• scalping - Quick small trades\n\n` +
                    `Use: /mode [mode_name]`;

                await this.bot.sendMessage(chatId, modeMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: this.createModeKeyboard() }
                });
            } else {
                const mode = args[0].toLowerCase();
                if (this.tradingBot.setTradingMode(mode)) {
                    await this.bot.sendMessage(chatId, `✅ Trading mode set to: ${mode}`);
                } else {
                    await this.bot.sendMessage(chatId, `❌ Invalid trading mode: ${mode}`);
                }
            }

        } catch (error) {
            logger.error('Error in handleTradingMode:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to change trading mode');
        }
    }

    async handleStrategy(chatId, args) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            if (args.length === 0) {
                const status = this.tradingBot.getStatus();
                
                const strategyMessage = `📊 *Trading Strategies*\n\n` +
                    `Enabled Strategies:\n${status.enabledStrategies?.map(s => `✅ ${s}`).join('\n') || 'None'}\n\n` +
                    `Available Strategies:\n` +
                    `• ai_signals - AI-powered trading signals\n` +
                    `• technical_analysis - Technical indicators\n` +
                    `• momentum - Momentum-based trading\n` +
                    `• sentiment_analysis - Market sentiment`;

                await this.bot.sendMessage(chatId, strategyMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: this.createStrategyKeyboard() }
                });
            } else {
                const strategy = args[0];
                const action = args[1] || 'toggle';
                
                if (action === 'enable') {
                    this.tradingBot.enableStrategy(strategy);
                    await this.bot.sendMessage(chatId, `✅ Strategy enabled: ${strategy}`);
                } else if (action === 'disable') {
                    this.tradingBot.disableStrategy(strategy);
                    await this.bot.sendMessage(chatId, `❌ Strategy disabled: ${strategy}`);
                }
            }

        } catch (error) {
            logger.error('Error in handleStrategy:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to change strategy');
        }
    }

    async handleStartTrading(chatId) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            if (this.tradingBot.isRunning) {
                await this.bot.sendMessage(chatId, '⚠️ Trading is already running');
                return;
            }

            await this.tradingBot.start();
            await this.bot.sendMessage(chatId, '🟢 Trading started successfully!');

        } catch (error) {
            logger.error('Error in handleStartTrading:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to start trading');
        }
    }

    async handleStopTrading(chatId) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            if (!this.tradingBot.isRunning) {
                await this.bot.sendMessage(chatId, '⚠️ Trading is already stopped');
                return;
            }

            await this.tradingBot.stop();
            await this.bot.sendMessage(chatId, '🔴 Trading stopped successfully!');

        } catch (error) {
            logger.error('Error in handleStopTrading:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to stop trading');
        }
    }

    async handleCloseTrade(chatId, args) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            if (args.length === 0) {
                await this.bot.sendMessage(chatId, 'Please specify trade ID. Example: /close 12345');
                return;
            }

            const tradeId = args[0];
            const result = await this.tradingBot.closeTrade(tradeId, 'manual');
            
            if (result) {
                await this.bot.sendMessage(chatId, `✅ Trade ${tradeId} closed successfully`);
            } else {
                await this.bot.sendMessage(chatId, `❌ Failed to close trade ${tradeId}`);
            }

        } catch (error) {
            logger.error('Error in handleCloseTrade:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to close trade');
        }
    }

    async handleCloseAll(chatId) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            const activeTrades = this.tradingBot.getActiveTrades();
            
            if (activeTrades.length === 0) {
                await this.bot.sendMessage(chatId, 'No active trades to close');
                return;
            }

            const results = await this.tradingBot.closeAllTrades('manual');
            const successCount = results.filter(r => r).length;
            
            await this.bot.sendMessage(chatId, `✅ Closed ${successCount}/${activeTrades.length} trades`);

        } catch (error) {
            logger.error('Error in handleCloseAll:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to close all trades');
        }
    }

    // FUTURES COMMAND HANDLERS

    async handleFutures(chatId) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            const status = this.tradingBot.futuresStrategy.getStatus();
            const activePositions = this.tradingBot.futuresStrategy.getActivePositions();
            const dailyStats = this.tradingBot.futuresStrategy.getDailyStats();

            const futuresMessage = `⚡ *Futures Trading Overview*\n\n` +
                `Status: ${status.isRunning ? '🟢 Running' : '🔴 Stopped'}\n` +
                `Symbol: ${status.symbol}\n` +
                `Leverage: ${status.leverage}x\n` +
                `Active Positions: ${status.activePositions}\n` +
                `Daily P&L: ${dailyStats.pnl > 0 ? '+' : ''}${dailyStats.pnl.toFixed(2)}\n` +
                `Daily Trades: ${dailyStats.trades}\n` +
                `Balance: ${dailyStats.startBalance.toFixed(2)}\n\n` +
                `*Current Settings:*\n` +
                `• TP: ${status.settings.takeProfitPercent}%\n` +
                `• SL: ${status.settings.stopLossPercent}%\n` +
                `• Qty: ${status.settings.qtyUSDT} USDT\n` +
                `• RSI Long: <${status.settings.rsiLongThreshold}\n` +
                `• RSI Short: >${status.settings.rsiShortThreshold}`;

            const keyboard = [
                [
                    { text: status.isRunning ? '⏹️ Stop' : '▶️ Start', callback_data: status.isRunning ? 'futures_stop' : 'futures_start' },
                    { text: '📊 Positions', callback_data: 'futures_positions' }
                ],
                [
                    { text: '📈 Daily Stats', callback_data: 'futures_stats' },
                    { text: '⚙️ Settings', callback_data: 'futures_settings' }
                ],
                [
                    { text: '🚨 Emergency Close All', callback_data: 'futures_emergency' }
                ]
            ];

            await this.bot.sendMessage(chatId, futuresMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Error in handleFutures:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get futures status');
        }
    }

    async handleFuturesStart(chatId) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            if (this.tradingBot.futuresStrategy.isRunning) {
                await this.bot.sendMessage(chatId, '⚠️ Futures strategy is already running');
                return;
            }

            await this.tradingBot.futuresStrategy.start();
            await this.bot.sendMessage(chatId, '🚀 Futures strategy started successfully!');

        } catch (error) {
            logger.error('Error in handleFuturesStart:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to start futures strategy');
        }
    }

    async handleFuturesStop(chatId) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            if (!this.tradingBot.futuresStrategy.isRunning) {
                await this.bot.sendMessage(chatId, '⚠️ Futures strategy is already stopped');
                return;
            }

            await this.tradingBot.futuresStrategy.stop();
            await this.bot.sendMessage(chatId, '⏹️ Futures strategy stopped successfully!');

        } catch (error) {
            logger.error('Error in handleFuturesStop:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to stop futures strategy');
        }
    }

    async handleDailyStats(chatId) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            const dailyStats = this.tradingBot.futuresStrategy.getDailyStats();
            const roi = (dailyStats.pnl / dailyStats.startBalance) * 100;
            
            let statsMessage = `📈 *Daily Futures Statistics*\n\n`;
            statsMessage += `*Performance:*\n`;
            statsMessage += `P&L: ${dailyStats.pnl > 0 ? '+' : ''}${dailyStats.pnl.toFixed(2)} USDT\n`;
            statsMessage += `ROI: ${roi > 0 ? '+' : ''}${roi.toFixed(2)}%\n`;
            statsMessage += `Total Trades: ${dailyStats.trades}\n`;
            statsMessage += `Win Rate: ${dailyStats.winRate?.toFixed(1) || '0'}%\n\n`;
            
            statsMessage += `*Balances:*\n`;
            statsMessage += `Start: ${dailyStats.startBalance.toFixed(2)} USDT\n`;
            statsMessage += `Current: ${(dailyStats.startBalance + dailyStats.pnl).toFixed(2)} USDT\n`;
            statsMessage += `Target: ${dailyStats.targetProfit.toFixed(2)} USDT\n`;
            statsMessage += `Max Loss: ${dailyStats.maxLoss.toFixed(2)} USDT\n\n`;
            
            const targetProgress = (dailyStats.pnl / dailyStats.targetProfit) * 100;
            statsMessage += `*Progress:*\n`;
            statsMessage += `Target: ${targetProgress.toFixed(1)}%\n`;
            
            if (dailyStats.pnl < 0) {
                const lossProgress = (Math.abs(dailyStats.pnl) / Math.abs(dailyStats.maxLoss)) * 100;
                statsMessage += `Loss: ${lossProgress.toFixed(1)}%`;
            }

            await this.bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Error in handleDailyStats:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get daily statistics');
        }
    }

    async handlePositions(chatId) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            const positions = this.tradingBot.futuresStrategy.getActivePositions();
            
            let positionsMessage = `📊 *Active Positions*\n\n`;
            
            if (positions.length === 0) {
                positionsMessage += `No active positions`;
            } else {
                positions.forEach((position, index) => {
                    const pnlEmoji = (position.unrealizedPnl || 0) >= 0 ? '🟢' : '🔴';
                    const duration = Date.now() - (position.timestamp || Date.now());
                    
                    positionsMessage += `${pnlEmoji} *${position.side}*\n`;
                    positionsMessage += `Entry: ${position.entryPrice}\n`;
                    positionsMessage += `Size: ${position.size}\n`;
                    positionsMessage += `PnL: ${position.unrealizedPnl > 0 ? '+' : ''}${position.unrealizedPnl?.toFixed(2) || 'N/A'}\n`;
                    positionsMessage += `Duration: ${this.formatDuration(duration)}\n\n`;
                });
            }

            const keyboard = [
                [{ text: '🔄 Refresh', callback_data: 'futures_positions' }],
                [{ text: '❌ Close All', callback_data: 'futures_emergency' }]
            ];

            await this.bot.sendMessage(chatId, positionsMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Error in handlePositions:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get positions');
        }
    }

    async handleEmergency(chatId) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            const confirmMessage = '🚨 *EMERGENCY CLOSE ALL*\n\n' +
                'This will:\n' +
                '• Close all active positions immediately\n' +
                '• Cancel all pending orders\n' +
                '• Stop the futures strategy\n\n' +
                '⚠️ This action cannot be undone!';

            const keyboard = [
                [
                    { text: '✅ Confirm', callback_data: 'confirm_emergency' },
                    { text: '❌ Cancel', callback_data: 'cancel_emergency' }
                ]
            ];

            await this.bot.sendMessage(chatId, confirmMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (error) {
            logger.error('Error in handleEmergency:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to initiate emergency close');
        }
    }

    async executeEmergencyClose(chatId) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            await this.tradingBot.futuresStrategy.emergencyCloseAll();
            await this.bot.sendMessage(chatId, '🚨 Emergency close executed! All positions closed and strategy stopped.');

        } catch (error) {
            logger.error('Error in executeEmergencyClose:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to execute emergency close');
        }
    }

    async handleLeverage(chatId, args) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            if (args.length === 0) {
                const current = this.tradingBot.futuresStrategy.settings.leverage;
                await this.bot.sendMessage(chatId, `Current leverage: ${current}x\n\nUse: /leverage [1-125]`);
                return;
            }

            const leverage = parseInt(args[0]);
            if (isNaN(leverage) || leverage < 1 || leverage > 125) {
                await this.bot.sendMessage(chatId, '❌ Invalid leverage. Must be between 1-125');
                return;
            }

            await this.tradingBot.futuresStrategy.updateSettings({ leverage });
            await this.bot.sendMessage(chatId, `✅ Leverage updated to ${leverage}x`);

        } catch (error) {
            logger.error('Error in handleLeverage:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to update leverage');
        }
    }

    async handleSymbol(chatId, args) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            if (args.length === 0) {
                const current = this.tradingBot.futuresStrategy.settings.symbol;
                await this.bot.sendMessage(chatId, `Current symbol: ${current}\n\nUse: /symbol [SYMBOL]`);
                return;
            }

            const symbol = args[0].toUpperCase();
            await this.tradingBot.futuresStrategy.updateSettings({ symbol });
            await this.bot.sendMessage(chatId, `✅ Trading symbol updated to ${symbol}`);

        } catch (error) {
            logger.error('Error in handleSymbol:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to update symbol');
        }
    }

    async handleRSI(chatId, args) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            if (args.length < 2) {
                const settings = this.tradingBot.futuresStrategy.settings;
                await this.bot.sendMessage(chatId, 
                    `Current RSI thresholds:\n` +
                    `Long: <${settings.rsiLongThreshold}\n` +
                    `Short: >${settings.rsiShortThreshold}\n\n` +
                    `Use: /rsi [long] [short]`
                );
                return;
            }

            const longThreshold = parseFloat(args[0]);
            const shortThreshold = parseFloat(args[1]);

            if (isNaN(longThreshold) || isNaN(shortThreshold) || 
                longThreshold < 10 || longThreshold > 40 ||
                shortThreshold < 60 || shortThreshold > 90) {
                await this.bot.sendMessage(chatId, '❌ Invalid RSI values. Long: 10-40, Short: 60-90');
                return;
            }

            await this.tradingBot.futuresStrategy.updateSettings({
                rsiLongThreshold: longThreshold,
                rsiShortThreshold: shortThreshold
            });

            await this.bot.sendMessage(chatId, `✅ RSI thresholds updated:\nLong: <${longThreshold}\nShort: >${shortThreshold}`);

        } catch (error) {
            logger.error('Error in handleRSI:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to update RSI thresholds');
        }
    }

    async handleFilters(chatId, args) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            if (args.length < 2) {
                const settings = this.tradingBot.futuresStrategy.settings;
                const filtersMessage = `*Current Filters:*\n` +
                    `📰 News: ${settings.enableNewsFilter ? '✅' : '❌'}\n` +
                    `📊 EMA: ${settings.enableEMAFilter ? '✅' : '❌'}\n` +
                    `📈 BB: ${settings.enableBBFilter ? '✅' : '❌'}\n` +
                    `💹 ROI TP: ${settings.roiBasedTP ? '✅' : '❌'}\n\n` +
                    `Use: /filters [filter] [on/off]\n\n` +
                    `Available filters:\n` +
                    `• news - News hours filter\n` +
                    `• ema - EMA trend filter\n` +
                    `• bb - Bollinger Bands filter\n` +
                    `• roi - ROI-based take profit`;

                await this.bot.sendMessage(chatId, filtersMessage, { parse_mode: 'Markdown' });
                return;
            }

            const filter = args[0].toLowerCase();
            const action = args[1].toLowerCase();
            const enabled = action === 'on' || action === 'true' || action === 'enable';

            const filterMap = {
                'news': 'enableNewsFilter',
                'ema': 'enableEMAFilter',
                'bb': 'enableBBFilter',
                'roi': 'roiBasedTP'
            };

            if (!filterMap[filter]) {
                await this.bot.sendMessage(chatId, '❌ Invalid filter. Use: news, ema, bb, or roi');
                return;
            }

            const updateObj = {};
            updateObj[filterMap[filter]] = enabled;

            await this.tradingBot.futuresStrategy.updateSettings(updateObj);
            await this.bot.sendMessage(chatId, `✅ Filter ${filter} ${enabled ? 'enabled' : 'disabled'}`);

        } catch (error) {
            logger.error('Error in handleFilters:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to update filter');
        }
    }

    async sendFuturesSettings(chatId) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            const settings = this.tradingBot.futuresStrategy.settings;
            
            const settingsMessage = `⚙️ *Futures Settings*\n\n` +
                `*Trading Parameters:*\n` +
                `📊 Symbol: ${settings.symbol}\n` +
                `⚡ Leverage: ${settings.leverage}x\n` +
                `💰 Quantity: ${settings.qtyUSDT} USDT\n` +
                `🎯 Take Profit: ${settings.takeProfitPercent}%\n` +
                `🛑 Stop Loss: ${settings.stopLossPercent}%\n\n` +
                `*Signal Settings:*\n` +
                `📈 RSI Long: <${settings.rsiLongThreshold}\n` +
                `📉 RSI Short: >${settings.rsiShortThreshold}\n` +
                `⏱️ Check Interval: ${settings.checkIntervalSeconds}s\n\n` +
                `*Daily Limits:*\n` +
                `🎯 Target: ${settings.dailyTargetPercent}%\n` +
                `🛑 Max Loss: ${settings.dailyMaxLossPercent}%\n\n` +
                `*Filters:*\n` +
                `📰 News: ${settings.enableNewsFilter ? '✅' : '❌'}\n` +
                `📊 EMA: ${settings.enableEMAFilter ? '✅' : '❌'}\n` +
                `📈 BB: ${settings.enableBBFilter ? '✅' : '❌'}\n` +
                `💹 ROI TP: ${settings.roiBasedTP ? '✅' : '❌'}\n\n` +
                'Use commands to modify:\n' +
                '• /symbol [SYMBOL] - Change trading pair\n' +
                '• /leverage [1-125] - Set leverage\n' +
                '• /rsi [long] [short] - RSI thresholds\n' +
                '• /filters [filter] [on/off] - Toggle filters';

            await this.bot.sendMessage(chatId, settingsMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Error in sendFuturesSettings:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get futures settings');
        }
    }

    // UTILITY METHODS

    async notifyAdmins(message, keyboard = null) {
        const options = { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        };
        
        if (keyboard) {
            options.reply_markup = { inline_keyboard: keyboard };
        }

        for (const chatId of this.authorizedChats) {
            try {
                await this.bot.sendMessage(chatId, message, options);
            } catch (error) {
                logger.error(`Failed to send message to chat ${chatId}:`, error);
            }
        }
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    async setTradingMode(chatId, mode) {
        try {
            if (this.tradingBot && this.tradingBot.setTradingMode(mode)) {
                await this.bot.sendMessage(chatId, `✅ Trading mode set to: ${mode}`);
            } else {
                await this.bot.sendMessage(chatId, `❌ Invalid trading mode: ${mode}`);
            }
        } catch (error) {
            logger.error('Error setting trading mode:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to set trading mode');
        }
    }

    async toggleStrategy(chatId, strategy) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            const status = this.tradingBot.getStatus();
            const isEnabled = status.enabledStrategies?.includes(strategy);

            if (isEnabled) {
                this.tradingBot.disableStrategy(strategy);
                await this.bot.sendMessage(chatId, `❌ Strategy disabled: ${strategy}`);
            } else {
                this.tradingBot.enableStrategy(strategy);
                await this.bot.sendMessage(chatId, `✅ Strategy enabled: ${strategy}`);
            }

        } catch (error) {
            logger.error('Error toggling strategy:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to toggle strategy');
        }
    }

    async closeTrade(chatId, tradeId) {
        try {
            if (!this.tradingBot) {
                await this.bot.sendMessage(chatId, '❌ Trading bot not initialized');
                return;
            }

            const result = await this.tradingBot.closeTrade(tradeId, 'manual');
            
            if (result) {
                await this.bot.sendMessage(chatId, `✅ Trade ${tradeId} closed successfully`);
            } else {
                await this.bot.sendMessage(chatId, `❌ Failed to close trade ${tradeId}`);
            }

        } catch (error) {
            logger.error('Error closing trade:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to close trade');
        }
    }

    // MISSING HANDLERS (placeholders)
    async handleFuturesStatus(chatId) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            const status = this.tradingBot.futuresStrategy.getStatus();
            const dailyStats = this.tradingBot.futuresStrategy.getDailyStats();
            
            const statusMessage = `📊 *Detailed Futures Status*\n\n` +
                `🤖 Bot Status: ${status.isRunning ? '🟢 Active' : '🔴 Inactive'}\n` +
                `📊 Symbol: ${status.symbol}\n` +
                `⚡ Leverage: ${status.leverage}x\n` +
                `💰 Quantity: ${status.settings.qtyUSDT} USDT\n\n` +
                `*Daily Performance:*\n` +
                `💵 P&L: ${dailyStats.pnl > 0 ? '+' : ''}${dailyStats.pnl.toFixed(2)}\n` +
                `📈 ROI: ${((dailyStats.pnl / dailyStats.startBalance) * 100).toFixed(2)}%\n` +
                `🔢 Trades: ${dailyStats.trades}\n` +
                `💳 Start Balance: ${dailyStats.startBalance.toFixed(2)}\n\n` +
                `*Signal Settings:*\n` +
                `📊 RSI Long: <${status.settings.rsiLongThreshold}\n` +
                `📊 RSI Short: >${status.settings.rsiShortThreshold}\n` +
                `🎯 TP: ${status.settings.takeProfitPercent}%\n` +
                `🛑 SL: ${status.settings.stopLossPercent}%\n` +
                `⏱️ Check Interval: ${status.settings.checkIntervalSeconds}s`;

            await this.bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Error in handleFuturesStatus:', error);
            await this.bot.sendMessage(chatId, '❌ Failed to get detailed futures status');
        }
    }

    async handleClosePosition(chatId, args) {
        try {
            if (!this.tradingBot.futuresStrategy) {
                await this.bot.sendMessage(chatId, '❌ Futures strategy not available');
                return;
            }

            if (args.length === 0) {
                await this.bot.sendMessage(chatId, '❌ Please specify position side: /closeposition LONG or /closeposition SHORT');
                return;
            }

            const positionSide = args[0].toUpperCase();
            if (!['LONG', 'SHORT'].includes(positionSide)) {
                await this.bot.sendMessage(chatId, '❌ Invalid position side. Use LONG or SHORT');
                return;
            }

            await this.tradingBot.futuresStrategy.closePosition(positionSide, 'manual');
            await this.bot.sendMessage(chatId, `✅ ${positionSide} position closed manually`);

        } catch (error) {
            logger.error('Error in handleClosePosition:', error);
            await this.bot.sendMessage(chatId, `❌ Failed to close position`);
        }
    }

    // Health check and status
    getStatus() {
        return {
            isRunning: this.isRunning,
            authorizedChats: this.authorizedChats.size,
            commands: this.commands.size,
            tradingBotConnected: !!this.tradingBot
        };
    }

    // Cleanup method
    cleanup() {
        try {
            if (this.bot) {
                this.bot.stopPolling();
            }
            this.removeAllListeners();
            this.authorizedChats.clear();
            this.commands.clear();
            logger.telegram('TelegramBot cleanup completed');
        } catch (error) {
            logger.error('Error during TelegramBot cleanup:', error);
        }
    }
}

module.exports = TelegramBot;
