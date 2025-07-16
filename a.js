#!/usr/bin/env node

// SIMPLE TELEGRAM BOT TEST
require('dotenv').config();

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bright: '\x1b[1m',
    reset: '\x1b[0m'
};

function log(message, color = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testTelegramBot() {
    log('🧪 Simple Telegram Bot Test', 'bright');
    log('='.repeat(40), 'cyan');

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    // Step 1: Check token
    if (!token) {
        log('❌ No TELEGRAM_BOT_TOKEN in .env', 'red');
        log('💡 Add your bot token to .env file', 'blue');
        return;
    }

    log(`🔑 Token found: ${token.substring(0, 10)}...`, 'green');

    // Step 2: Test token with curl-like request
    try {
        log('\n📡 Testing bot token...', 'bright');
        
        const https = require('https');
        const url = `https://api.telegram.org/bot${token}/getMe`;
        
        const response = await new Promise((resolve, reject) => {
            const req = https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            });
            req.on('error', reject);
            req.setTimeout(10000, () => reject(new Error('Timeout')));
        });

        if (response.ok) {
            log(`✅ Bot valid: @${response.result.username}`, 'green');
            log(`   ID: ${response.result.id}`, 'white');
            log(`   Name: ${response.result.first_name}`, 'white');
        } else {
            log('❌ Invalid bot token', 'red');
            return;
        }

    } catch (error) {
        log(`❌ Token test failed: ${error.message}`, 'red');
        return;
    }

    // Step 3: Test with node-telegram-bot-api
    try {
        log('\n🤖 Starting simple bot...', 'bright');
        
        const TelegramBotAPI = require('node-telegram-bot-api');
        const bot = new TelegramBotAPI(token, { polling: true });

        log('✅ Bot started with polling', 'green');

        // Handle /start command
        bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            const user = msg.from;
            
            log(`📨 /start from ${user.first_name} (${chatId})`, 'cyan');
            
            const welcomeMessage = `🎉 Bot is working!

👤 User: ${user.first_name} ${user.last_name || ''}
🆔 Chat ID: ${chatId}
🆔 User ID: ${user.id}
🕐 Time: ${new Date().toLocaleString()}

✅ /start command received successfully!
🤖 Bot is responding correctly.

Try these commands:
/help - Show help
/test - Test message
/id - Get your IDs`;

            try {
                await bot.sendMessage(chatId, welcomeMessage);
                log('✅ Response sent successfully', 'green');
            } catch (error) {
                log(`❌ Failed to send response: ${error.message}`, 'red');
            }
        });

        // Handle /test command
        bot.onText(/\/test/, async (msg) => {
            const chatId = msg.chat.id;
            log(`📨 /test from ${chatId}`, 'cyan');
            
            try {
                await bot.sendMessage(chatId, '🧪 Test successful! Bot is working correctly.');
                log('✅ Test response sent', 'green');
            } catch (error) {
                log(`❌ Test response failed: ${error.message}`, 'red');
            }
        });

        // Handle /help command
        bot.onText(/\/help/, async (msg) => {
            const chatId = msg.chat.id;
            
            const helpMessage = `📋 Available Commands:

/start - Start the bot
/help - Show this help
/test - Test the bot
/id - Get your chat and user ID
/ping - Simple ping test

🤖 Bot Status: Online
📡 Connection: Active
✅ All systems working!`;

            try {
                await bot.sendMessage(chatId, helpMessage);
                log('✅ Help sent', 'green');
            } catch (error) {
                log(`❌ Help failed: ${error.message}`, 'red');
            }
        });

        // Handle /id command
        bot.onText(/\/id/, async (msg) => {
            const chatId = msg.chat.id;
            const user = msg.from;
            
            const idMessage = `🆔 Your Information:

Chat ID: ${chatId}
User ID: ${user.id}
Username: @${user.username || 'not_set'}
First Name: ${user.first_name}
Last Name: ${user.last_name || 'not_set'}
Language: ${user.language_code || 'not_set'}`;

            try {
                await bot.sendMessage(chatId, idMessage);
                log('✅ ID info sent', 'green');
            } catch (error) {
                log(`❌ ID info failed: ${error.message}`, 'red');
            }
        });

        // Handle /ping command
        bot.onText(/\/ping/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                await bot.sendMessage(chatId, '🏓 Pong!');
                log('✅ Ping response sent', 'green');
            } catch (error) {
                log(`❌ Ping failed: ${error.message}`, 'red');
            }
        });

        // Handle all other messages
        bot.on('message', (msg) => {
            if (!msg.text || msg.text.startsWith('/')) return;
            
            const chatId = msg.chat.id;
            const user = msg.from;
            
            log(`📨 Message from ${user.first_name}: "${msg.text}"`, 'yellow');
            
            // Echo the message
            bot.sendMessage(chatId, `I received: "${msg.text}"\n\nTry /help for available commands.`)
                .then(() => log('✅ Echo sent', 'green'))
                .catch(error => log(`❌ Echo failed: ${error.message}`, 'red'));
        });

        // Handle errors
        bot.on('polling_error', (error) => {
            log(`❌ Polling error: ${error.message}`, 'red');
        });

        bot.on('webhook_error', (error) => {
            log(`❌ Webhook error: ${error.message}`, 'red');
        });

        // Success message
        log('\n🎉 Bot is ready!', 'green');
        log('📱 Go to Telegram and send /start to your bot', 'blue');
        log('🔍 Watch this console for real-time activity', 'blue');
        
        if (chatId) {
            log(`💬 Configured chat ID: ${chatId}`, 'white');
            
            // Send startup notification
            try {
                await bot.sendMessage(chatId, '🚀 Bot started and ready for testing!\n\nSend /start to begin.');
                log('✅ Startup notification sent', 'green');
            } catch (error) {
                log(`⚠️  Could not send startup notification: ${error.message}`, 'yellow');
            }
        } else {
            log('⚠️  No TELEGRAM_CHAT_ID configured', 'yellow');
        }

        log('\n⌨️  Press Ctrl+C to stop the bot', 'blue');
        log('='.repeat(40), 'cyan');

        // Keep alive
        process.on('SIGINT', async () => {
            log('\n🛑 Stopping bot...', 'yellow');
            try {
                await bot.stopPolling();
                log('✅ Bot stopped gracefully', 'green');
            } catch (error) {
                log(`⚠️  Stop error: ${error.message}`, 'yellow');
            }
            process.exit(0);
        });

    } catch (error) {
        log(`❌ Bot startup failed: ${error.message}`, 'red');
        
        if (error.message.includes('node-telegram-bot-api')) {
            log('💡 Install telegram library: npm install node-telegram-bot-api', 'blue');
        }
    }
}

// Check dependencies
function checkDependencies() {
    try {
        require('node-telegram-bot-api');
        return true;
    } catch (error) {
        log('❌ Missing node-telegram-bot-api', 'red');
        log('💡 Install: npm install node-telegram-bot-api', 'blue');
        return false;
    }
}

// Main execution
if (require.main === module) {
    if (!checkDependencies()) {
        process.exit(1);
    }
    
    testTelegramBot().catch(error => {
        log(`💥 Test failed: ${error.message}`, 'red');
        process.exit(1);
    });
}

module.exports = testTelegramBot;
