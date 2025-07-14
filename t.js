// test-telegram.js - Simple test script
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = parseInt(process.env.ADMIN_USER_IDS);

console.log('Testing Telegram Bot...');
console.log('Token:', token ? 'SET' : 'MISSING');
console.log('Admin ID:', adminId);

if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN missing in .env');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
    console.log('📨 Message received:', {
        from: msg.from.id,
        text: msg.text,
        authorized: msg.from.id === adminId
    });
    
    if (msg.from.id === adminId) {
        bot.sendMessage(msg.chat.id, '✅ Bot is working! Your user ID: ' + msg.from.id);
    } else {
        bot.sendMessage(msg.chat.id, '❌ Unauthorized. Your ID: ' + msg.from.id);
    }
});

bot.on('error', (error) => {
    console.error('❌ Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error);
});

console.log('🤖 Test bot started. Send any message...');

// Test getMe
bot.getMe().then((result) => {
    console.log('✅ Bot info:', result);
}).catch((error) => {
    console.error('❌ Failed to get bot info:', error);
});
