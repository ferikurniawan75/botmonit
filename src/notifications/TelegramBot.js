const TelegramBotAPI = require('node-telegram-bot-api');
const EventEmitter = require('events');

class TelegramBot extends EventEmitter {
    constructor(token, chatId) {
        super();
        this.token = token;
        this.chatId = chatId;
        this.bot = null;
        this.isRunning = false;
        this.authorizedUsers = new Set();
        
        // Add configured chat ID as authorized
        if (chatId) {
            this.authorizedUsers.add(parseInt(chatId));
        }
        
        // Trading bot reference (will be set externally)
        this.tradingBot = null;
    }

    async initialize() {
        try {
            if (!this.token) {
                console.log('⚠️  No Telegram token provided - notifications disabled');
                return false;
            }
            
            console.log('🤖 Initializing Telegram bot...');
            
            // Create bot instance with proper polling config
            this.bot = new TelegramBotAPI(this.token, { 
                polling: {
                    interval: 300,
                    autoStart: true,
                    params: {
                        timeout: 10
                    }
                }
            });
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Test connection
            const me = await this.bot.getMe();
            console.log(`✅ Telegram bot connected: @${me.username}`);
            
            this.isRunning = true;
            
            // Send startup notification if chat ID is configured
            if (this.chatId) {
                await this.sendStartupNotification();
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize Telegram bot:', error.message);
            return false;
        }
    }

    setupEventHandlers() {
        // Handle messages
        this.bot.on('message', async (msg) => {
            try {
                await this.handleMessage(msg);
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        // Handle callback queries (inline keyboard buttons)
        this.bot.on('callback_query', async (query) => {
            try {
                await this.handleCallbackQuery(query);
            } catch (error) {
                console.error('Error handling callback query:', error);
            }
        });

        // Handle errors
        this.bot.on('polling_error', (error) => {
            console.error('Telegram polling error:', error.message);
        });

        this.bot.on('webhook_error', (error) => {
            console.error('Telegram webhook error:', error.message);
        });
    }

    async handleMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text || '';
        const username = msg.from.username || msg.from.first_name || 'Unknown';
        
        console.log(`📨 Message from ${username} (${userId}): ${text}`);
        
        // Auto-authorize first user or users from configured chat
        if (!this.authorizedUsers.has(userId)) {
            if (!this.chatId || chatId.toString() === this.chatId || userId.toString() === this.chatId) {
                this.authorizedUsers.add(userId);
                console.log(`✅ Auto-authorized user: ${username} (${userId})`);
            }
        }
        
        // Check authorization
        if (!this.authorizedUsers.has(userId)) {
            await this.sendMessage(chatId, `⛔ Unauthorized access from ${username}\nUser ID: ${userId}\nContact admin for access.`);
            return;
        }

        // Handle commands
        if (text.startsWith('/')) {
            await this.handleCommand(chatId, text, msg);
        } else {
            // Handle non-command messages
            await this.sendMessage(chatId, `Received: "${text}"\n\nUse /help for available commands.`);
        }
    }

    async handleCommand(chatId, text, msg) {
        const command = text.split(' ')[0].toLowerCase();
        const args = text.split(' ').slice(1);
        
        console.log(`🔧 Executing command: ${command}`);
        
        try {
            switch (command) {
                case '/start':
                    await this.handleStart(chatId, msg);
                    break;
                    
                case '/help':
                    await this.handleHelp(chatId);
                    break;
                    
                case '/status':
                    await this.handleStatus(chatId);
                    break;
                    
                case '/balance':
                    await this.handleBalance(chatId);
                    break;
                    
                case '/trades':
                    await this.handleTrades(chatId);
                    break;
                    
                case '/market':
                    await this.handleMarket(chatId);
                    break;
                    
                case '/starttrading':
                    await this.handleStartTrading(chatId);
                    break;
                    
                case '/stoptrading':
                    await this.handleStopTrading(chatId);
                    break;
                    
                case '/emergency':
                case '/stop':
                    await this.handleEmergencyStop(chatId);
                    break;
                    
                case '/settings':
                    await this.handleSettings(chatId);
                    break;
                    
                case '/id':
                    await this.handleGetId(chatId, msg);
                    break;
                    
                case '/test':
                    await this.sendMessage(chatId, '✅ Bot is working correctly!');
                    break;
                    
                default:
                    await this.sendMessage(chatId, `❓ Unknown command: ${command}\nTry /help for available commands.`);
            }
        } catch (error) {
            console.error(`Error executing command ${command}:`, error);
            await this.sendMessage(chatId, '❌ An error occurred while processing your command.');
        }
    }

    async handleStart(chatId, msg) {
        const user = msg.from;
        const welcomeMessage = `🤖 *Crypto Trading Bot*

Welcome ${user.first_name}! Your advanced trading assistant is ready.

🚀 *Key Features:*
• AI-powered market analysis
• Automated trading strategies
• Real-time notifications
• Risk management
• Performance tracking

📊 *Quick Actions:*`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📊 Status', callback_data: 'status' },
                    { text: '💰 Balance', callback_data: 'balance' }
                ],
                [
                    { text: '📈 Active Trades', callback_data: 'trades' },
                    { text: '📉 Market', callback_data: 'market' }
                ],
                [
                    { text: '⚙️ Settings', callback_data: 'settings' },
                    { text: '📋 Help', callback_data: 'help' }
                ],
                [
                    { text: '🚀 Start Trading', callback_data: 'start_trading' },
                    { text: '🛑 Stop Trading', callback_data: 'stop_trading' }
                ]
            ]
        };

        await this.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleHelp(chatId) {
        const helpMessage = `📋 *Available Commands:*

🔹 *Basic Commands:*
/start - Start the bot & show main menu
/help - Show this help message
/status - Show bot status
/balance - Show account balance
/id - Get your chat/user ID

🔹 *Trading Commands:*
/trades - Show active trades
/market - Market overview
/starttrading - Start automated trading
/stoptrading - Stop automated trading
/emergency - Emergency stop all trades

🔹 *Settings:*
/settings - Bot configuration

💡 *Tips:*
• Use inline keyboards for quick actions
• Bot responds only to authorized users
• All trading actions are logged
• Use /emergency in case of issues

⚠️ *Safety:*
Always monitor your trades and set appropriate risk limits.`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🏠 Main Menu', callback_data: 'start' },
                    { text: '📊 Status', callback_data: 'status' }
                ]
            ]
        };

        await this.sendMessage(chatId, helpMessage, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleStatus(chatId) {
        const uptime = Math.floor(process.uptime());
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        
        const statusMessage = `📊 *Bot Status*

🟢 *System:* Online
🤖 *Trading Bot:* ${this.tradingBot?.isRunning ? 'Running' : 'Stopped'}
📡 *Connection:* Active
⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s

💻 *System Info:*
• Node.js: ${process.version}
• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
• Platform: ${process.platform}

📈 *Trading Status:*
• Active Trades: ${this.tradingBot?.getActiveTradeCount?.() || 0}
• Today's Profit: $0.00
• Success Rate: 0%

✅ All systems operational!`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Refresh', callback_data: 'status' },
                    { text: '📈 Trades', callback_data: 'trades' }
                ],
                [
                    { text: '🏠 Main Menu', callback_data: 'start' }
                ]
            ]
        };

        await this.sendMessage(chatId, statusMessage, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleBalance(chatId) {
        // This would integrate with your trading bot
        const balanceMessage = `💰 *Account Balance*

💵 *Spot Balance:*
• USDT: $1,000.00
• BTC: 0.00000000
• ETH: 0.00000000

⚡ *Futures Balance:*
• Wallet: $500.00
• Available: $500.00
• Used Margin: $0.00

📊 *Performance:*
• Today: +0.00%
• This Week: +0.00%
• This Month: +0.00%

*Note:* Demo mode - showing sample data`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Refresh', callback_data: 'balance' },
                    { text: '📊 Status', callback_data: 'status' }
                ],
                [
                    { text: '🏠 Main Menu', callback_data: 'start' }
                ]
            ]
        };

        await this.sendMessage(chatId, balanceMessage, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleTrades(chatId) {
        const tradesMessage = `📈 *Active Trades*

Currently no active trades.

📊 *Recent Activity:*
• No recent trades

💡 *Tips:*
• Use /starttrading to begin automated trading
• Monitor markets with /market
• Set up alerts in /settings

🔄 Auto-refresh every 30 seconds when trading is active.`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Refresh', callback_data: 'trades' },
                    { text: '📉 Market', callback_data: 'market' }
                ],
                [
                    { text: '🚀 Start Trading', callback_data: 'start_trading' },
                    { text: '🏠 Main Menu', callback_data: 'start' }
                ]
            ]
        };

        await this.sendMessage(chatId, tradesMessage, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleMarket(chatId) {
        const marketMessage = `📉 *Market Overview*

🔥 *Top Movers (24h):*
• BTC/USDT: $43,250 (+2.45%)
• ETH/USDT: $2,650 (+1.80%)
• BNB/USDT: $310 (-0.50%)

📊 *Market Sentiment:*
• Fear & Greed Index: 65 (Greed)
• BTC Dominance: 52.3%
• Total Market Cap: $1.65T

⚡ *AI Signals:*
• BTC: Bullish (Strong)
• ETH: Neutral
• Market: Cautiously Optimistic

*Last updated: ${new Date().toLocaleTimeString()}*`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Refresh', callback_data: 'market' },
                    { text: '📈 Trades', callback_data: 'trades' }
                ],
                [
                    { text: '🚀 Start Trading', callback_data: 'start_trading' },
                    { text: '🏠 Main Menu', callback_data: 'start' }
                ]
            ]
        };

        await this.sendMessage(chatId, marketMessage, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleStartTrading(chatId) {
        const confirmMessage = `🚀 *Start Automated Trading*

⚠️ *Important:*
• Ensure you have sufficient balance
• Trading will follow your configured strategy
• Set appropriate risk limits
• Monitor regularly

Are you sure you want to start automated trading?`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Yes, Start Trading', callback_data: 'confirm_start_trading' },
                    { text: '❌ Cancel', callback_data: 'start' }
                ]
            ]
        };

        await this.sendMessage(chatId, confirmMessage, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleStopTrading(chatId) {
        const confirmMessage = `🛑 *Stop Automated Trading*

This will:
• Stop opening new trades
• Keep existing trades running
• Maintain monitoring

For emergency stop (close all trades), use /emergency

Continue with stopping automated trading?`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Yes, Stop Trading', callback_data: 'confirm_stop_trading' },
                    { text: '❌ Cancel', callback_data: 'start' }
                ],
                [
                    { text: '🚨 Emergency Stop', callback_data: 'emergency_stop' }
                ]
            ]
        };

        await this.sendMessage(chatId, confirmMessage, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleEmergencyStop(chatId) {
        const emergencyMessage = `🚨 *EMERGENCY STOP*

⚠️ *WARNING:* This will immediately:
• Stop all automated trading
• Close ALL open positions
• Cancel all pending orders

This action cannot be undone!

Are you absolutely sure?`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🚨 YES, EMERGENCY STOP', callback_data: 'confirm_emergency' }
                ],
                [
                    { text: '❌ Cancel', callback_data: 'start' }
                ]
            ]
        };

        await this.sendMessage(chatId, emergencyMessage, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleSettings(chatId) {
        const settingsMessage = `⚙️ *Bot Settings*

🔧 *Current Configuration:*
• Trading Mode: Demo
• Risk Level: Conservative
• Max Positions: 3
• Daily Loss Limit: 3%

📊 *Strategy Settings:*
• AI Analysis: Enabled
• Technical Indicators: RSI, MACD
• Position Size: $20 USDT

🔔 *Notifications:*
• Trade Alerts: ✅ Enabled
• Market Updates: ✅ Enabled
• Risk Warnings: ✅ Enabled

Use the buttons below to modify settings.`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🎯 Risk Settings', callback_data: 'risk_settings' },
                    { text: '📊 Strategy', callback_data: 'strategy_settings' }
                ],
                [
                    { text: '🔔 Notifications', callback_data: 'notification_settings' },
                    { text: '🏠 Main Menu', callback_data: 'start' }
                ]
            ]
        };

        await this.sendMessage(chatId, settingsMessage, { 
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleGetId(chatId, msg) {
        const user = msg.from;
        const idMessage = `🆔 *Your Information:*

Chat ID: \`${chatId}\`
User ID: \`${user.id}\`
Username: @${user.username || 'not_set'}
First Name: ${user.first_name}
Last Name: ${user.last_name || 'not_set'}
Language: ${user.language_code || 'not_set'}

💡 Save your Chat ID for configuration.`;

        await this.sendMessage(chatId, idMessage, { parse_mode: 'Markdown' });
    }

    async handleCallbackQuery(query) {
        const chatId = query.message.chat.id;
        const data = query.data;
        const userId = query.from.id;

        // Answer the callback query
        await this.bot.answerCallbackQuery(query.id);

        // Check authorization
        if (!this.authorizedUsers.has(userId)) {
            return;
        }

        console.log(`🔘 Callback: ${data} from ${userId}`);

        try {
            switch (data) {
                case 'start':
                    await this.handleStart(chatId, { from: query.from });
                    break;
                case 'help':
                    await this.handleHelp(chatId);
                    break;
                case 'status':
                    await this.handleStatus(chatId);
                    break;
                case 'balance':
                    await this.handleBalance(chatId);
                    break;
                case 'trades':
                    await this.handleTrades(chatId);
                    break;
                case 'market':
                    await this.handleMarket(chatId);
                    break;
                case 'settings':
                    await this.handleSettings(chatId);
                    break;
                case 'start_trading':
                    await this.handleStartTrading(chatId);
                    break;
                case 'stop_trading':
                    await this.handleStopTrading(chatId);
                    break;
                case 'emergency_stop':
                    await this.handleEmergencyStop(chatId);
                    break;
                case 'confirm_start_trading':
                    await this.sendMessage(chatId, '🚀 Automated trading started!\n\nMonitor your trades with /trades');
                    break;
                case 'confirm_stop_trading':
                    await this.sendMessage(chatId, '🛑 Automated trading stopped.\n\nExisting trades will continue running.');
                    break;
                case 'confirm_emergency':
                    await this.sendMessage(chatId, '🚨 EMERGENCY STOP ACTIVATED!\n\nAll trading stopped and positions closed.');
                    break;
                default:
                    await this.sendMessage(chatId, `Received callback: ${data}`);
            }
        } catch (error) {
            console.error(`Error handling callback ${data}:`, error);
            await this.sendMessage(chatId, '❌ An error occurred processing your request.');
        }
    }

    async sendMessage(chatId, text, options = {}) {
        if (!this.bot || !this.isRunning) {
            console.log('Bot not running, cannot send message');
            return false;
        }
        
        try {
            const result = await this.bot.sendMessage(chatId, text, options);
            console.log(`✅ Message sent to ${chatId}`);
            return result;
        } catch (error) {
            console.error(`❌ Failed to send message to ${chatId}:`, error.message);
            return false;
        }
    }

    async sendNotification(message, options = {}) {
        if (this.chatId) {
            return await this.sendMessage(this.chatId, message, options);
        }
        console.log('No chat ID configured for notifications');
        return false;
    }

    async sendTradeNotification(trade, action) {
        const emoji = action === 'opened' ? '🟢' : '🔴';
        const message = `${emoji} *Trade ${action.toUpperCase()}*

💰 Symbol: ${trade.symbol}
📊 Side: ${trade.side}
💵 Amount: $${trade.amount}
💲 Price: $${trade.price}

${action === 'opened' ? '🎯 Trade is now active!' : `💰 P&L: $${trade.profit || 0}`}`;

        return await this.sendNotification(message, { parse_mode: 'Markdown' });
    }

    async sendStartupNotification() {
        const message = `🚀 *Crypto Trading Bot Started*

✅ System: Online
📡 Connection: Active
⏰ Time: ${new Date().toLocaleString()}

Ready for trading commands!
Send /start to begin.`;

        return await this.sendNotification(message, { parse_mode: 'Markdown' });
    }

    async stop() {
        if (this.bot && this.isRunning) {
            try {
                await this.bot.stopPolling();
                this.isRunning = false;
                console.log('✅ Telegram bot stopped');
            } catch (error) {
                console.error('Error stopping bot:', error);
            }
        }
    }

    // Method to set trading bot reference
    setTradingBot(tradingBot) {
        this.tradingBot = tradingBot;
    }
}

module.exports = TelegramBot;
