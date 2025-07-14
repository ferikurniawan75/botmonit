#!/usr/bin/env node

// ===================================================================
// QUICK FIX SCRIPT UNTUK TELEGRAM BOT TOKEN ISSUE
// ===================================================================

const fs = require('fs');
const path = require('path');

console.log('🔧 Quick Fix untuk Telegram Bot Token Issue');
console.log('=' .repeat(50));

function fixTelegramBot() {
    const telegramBotPath = 'src/telegram/TelegramBot.js';
    
    if (!fs.existsSync(telegramBotPath)) {
        console.log('❌ File TelegramBot.js tidak ditemukan');
        return false;
    }
    
    // Backup original file
    const backupPath = telegramBotPath + '.backup.' + Date.now();
    fs.copyFileSync(telegramBotPath, backupPath);
    console.log('✅ Backup dibuat:', backupPath);
    
    // Read original file
    let content = fs.readFileSync(telegramBotPath, 'utf8');
    
    // Fix 1: Add token validation in constructor
    const constructorFix = `    constructor({ token, adminUserIds, tradingBot, futuresStrategy, marketAnalyzer, aiAnalyzer }) {
        super();
        
        // Validate token immediately
        if (!token) {
            throw new Error('Telegram Bot Token is required');
        }
        
        this.token = token;
        this.adminUserIds = adminUserIds || [];
        this.tradingBot = tradingBot;
        this.futuresStrategy = futuresStrategy;
        this.marketAnalyzer = marketAnalyzer;
        this.aiAnalyzer = aiAnalyzer;
        this.bot = null;
        this.isRunning = false;
        this.authorizedChats = new Set();
        
        this.commands = new Map();
        this.setupCommands();
        
        console.log('TelegramBot constructor - Token received:', this.token ? 'YES' : 'NO');
    }`;
    
    // Fix 2: Improve start method
    const startMethodFix = `    async start() {
        if (this.isRunning) {
            logger.telegram('Bot already running');
            return;
        }

        try {
            // Double-check token
            if (!this.token) {
                throw new Error('Telegram Bot Token not provided in start method');
            }
            
            console.log('Starting Telegram bot with token length:', this.token.length);
            
            const TelegramBotAPI = require('node-telegram-bot-api');
            this.bot = new TelegramBotAPI(this.token, { polling: true });
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Set up trading bot event listeners
            if (this.tradingBot) {
                this.setupTradingBotListeners();
            }
            
            this.isRunning = true;
            logger.telegram('Telegram bot started successfully');
            
        } catch (error) {
            logger.error('Failed to start Telegram bot:', error);
            throw error;
        }
    }`;
    
    // Fix 3: Improve testConnection method
    const testConnectionFix = `    async testConnection() {
        try {
            // Validate token first
            if (!this.token) {
                throw new Error('Telegram Bot Token not provided for test');
            }
            
            // Create temporary bot instance for testing if needed
            let testBot = this.bot;
            if (!testBot) {
                const TelegramBotAPI = require('node-telegram-bot-api');
                testBot = new TelegramBotAPI(this.token, { polling: false });
            }
            
            const me = await testBot.getMe();
            logger.telegram('Bot connection test successful', { username: me.username });
            
            return true;
        } catch (error) {
            logger.error('Bot connection test failed:', error);
            throw error;
        }
    }`;
    
    // Apply fixes
    content = content.replace(
        /constructor\(\{ token, adminUserIds, tradingBot.*?\n    \}/s,
        constructorFix
    );
    
    content = content.replace(
        /async start\(\) \{.*?^\s*\}/ms,
        startMethodFix
    );
    
    content = content.replace(
        /async testConnection\(\) \{.*?^\s*\}/ms,
        testConnectionFix
    );
    
    // Write fixed file
    fs.writeFileSync(telegramBotPath, content);
    console.log('✅ TelegramBot.js berhasil diperbaiki');
    
    return true;
}

function fixIndexJs() {
    const indexPath = 'index.js';
    
    if (!fs.existsSync(indexPath)) {
        console.log('❌ File index.js tidak ditemukan');
        return false;
    }
    
    // Backup original file
    const backupPath = indexPath + '.backup.' + Date.now();
    fs.copyFileSync(indexPath, backupPath);
    console.log('✅ Backup index.js dibuat:', backupPath);
    
    // Read original file
    let content = fs.readFileSync(indexPath, 'utf8');
    
    // Fix TelegramBot initialization with debug
    const telegramBotFix = `            // Initialize Telegram Bot with debug
            logger.info('📱 Initializing Telegram Bot...');
            logger.info('Token available:', config.TELEGRAM_BOT_TOKEN ? 'YES' : 'NO');
            logger.info('Admin IDs available:', config.ADMIN_USER_IDS ? 'YES' : 'NO');
            
            if (!config.TELEGRAM_BOT_TOKEN) {
                throw new Error('TELEGRAM_BOT_TOKEN is missing from config');
            }
            
            this.telegramBot = new TelegramBot({
                token: config.TELEGRAM_BOT_TOKEN,
                adminUserIds: config.ADMIN_USER_IDS,
                tradingBot: this.tradingBot,
                futuresStrategy: this.futuresStrategy,
                marketAnalyzer: this.marketAnalyzer,
                aiAnalyzer: this.aiAnalyzer
            });`;
    
    // Apply fix
    content = content.replace(
        /this\.telegramBot = new TelegramBot\(\{[\s\S]*?\}\);/,
        telegramBotFix
    );
    
    // Write fixed file
    fs.writeFileSync(indexPath, content);
    console.log('✅ index.js berhasil diperbaiki');
    
    return true;
}

function testEnvironment() {
    console.log('\n🧪 Testing Environment...');
    
    require('dotenv').config();
    
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const adminIds = process.env.ADMIN_USER_IDS;
    
    console.log('TELEGRAM_BOT_TOKEN:', token ? `SET (${token.length} chars)` : 'NOT SET');
    console.log('ADMIN_USER_IDS:', adminIds ? `SET (${adminIds})` : 'NOT SET');
    
    if (!token) {
        console.log('❌ TELEGRAM_BOT_TOKEN masih kosong!');
        return false;
    }
    
    if (!adminIds) {
        console.log('❌ ADMIN_USER_IDS masih kosong!');
        return false;
    }
    
    console.log('✅ Environment variables OK');
    return true;
}

// Main execution
function main() {
    console.log('Starting fixes...\n');
    
    // Test environment first
    if (!testEnvironment()) {
        console.log('\n❌ Environment validation failed');
        console.log('Fix .env file first, then run this script again');
        return;
    }
    
    // Apply fixes
    const fixes = [
        { name: 'TelegramBot.js', fix: fixTelegramBot },
        { name: 'index.js', fix: fixIndexJs }
    ];
    
    let allSuccess = true;
    
    for (const { name, fix } of fixes) {
        console.log(`\n🔧 Fixing ${name}...`);
        const success = fix();
        if (!success) {
            allSuccess = false;
            console.log(`❌ Failed to fix ${name}`);
        }
    }
    
    console.log('\n📋 RESULTS:');
    console.log('=' .repeat(30));
    
    if (allSuccess) {
        console.log('✅ All fixes applied successfully!');
        console.log('\n🚀 Next steps:');
        console.log('1. npm start');
        console.log('2. Check logs for "Telegram bot started successfully"');
        console.log('3. Send /start to your Telegram bot');
    } else {
        console.log('❌ Some fixes failed');
        console.log('Check error messages above');
    }
}

// Run the fixes
main();
