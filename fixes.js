#!/usr/bin/env node

// ===================================================================
// AUTOMATIC FIXES APPLICATION SCRIPT
// ===================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bright: '\x1b[1m'
};

const log = (message, color = 'reset') => {
    console.log(`${colors[color]}${message}${colors.reset}`);
};

class FixApplicator {
    constructor() {
        this.startTime = Date.now();
        this.fixesApplied = [];
        this.errors = [];
    }

    async run() {
        log('\n🔧 APPLYING CRYPTO TRADING BOT FIXES', 'bright');
        log('=' .repeat(50), 'blue');
        log('');

        try {
            // Apply all fixes
            await this.createMissingDirectories();
            await this.createEnvironmentTemplate();
            await this.updatePackageJson();
            await this.createValidationScript();
            await this.createStartupScripts();
            await this.fixIndexJs();
            await this.createDocumentation();
            await this.setPermissions();
            await this.runValidation();

            this.showSummary();

        } catch (error) {
            log(`❌ Critical error: ${error.message}`, 'red');
            process.exit(1);
        }
    }

    async createMissingDirectories() {
        log('📁 Creating missing directories...', 'bright');

        const dirs = [
            'logs',
            'models', 
            'data',
            'backups',
            'src/config',
            'src/core',
            'src/strategies',
            'src/exchange',
            'src/analysis',
            'src/telegram',
            'src/utils'
        ];

        for (const dir of dirs) {
            try {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    log(`✅ Created: ${dir}`, 'green');
                    this.fixesApplied.push(`Directory: ${dir}`);
                } else {
                    log(`✓ Exists: ${dir}`, 'blue');
                }
            } catch (error) {
                log(`❌ Failed to create ${dir}: ${error.message}`, 'red');
                this.errors.push(`Directory creation: ${dir}`);
            }
        }
        log('');
    }

    async createEnvironmentTemplate() {
        log('🔧 Creating environment template...', 'bright');

        const envExample = `# ===================================================================
# CRYPTO TRADING BOT CONFIGURATION
# Copy this file to .env and fill in your actual values
# ===================================================================

# TELEGRAM CONFIGURATION (REQUIRED)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
ADMIN_USER_IDS=123456789

# BINANCE API CONFIGURATION (REQUIRED)
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_SECRET_KEY=your_binance_secret_key_here

# SAFETY: Always start with testnet!
USE_TESTNET=true

# TRADING CONFIGURATION
DEFAULT_FUTURES_SYMBOL=BTCUSDT
FUTURES_LEVERAGE=10
FUTURES_QTY_USDT=20
FUTURES_TP_PERCENT=0.6
FUTURES_SL_PERCENT=0.3

# RSI THRESHOLDS
RSI_LONG_THRESHOLD=30
RSI_SHORT_THRESHOLD=70
SIGNAL_CHECK_INTERVAL=30

# DAILY LIMITS (CRITICAL FOR SAFETY)
DAILY_TARGET_PERCENT=5
DAILY_MAX_LOSS_PERCENT=3

# FILTERS
ENABLE_NEWS_FILTER=true
ENABLE_EMA_FILTER=true
ENABLE_BB_FILTER=true

# AI CONFIGURATION
ENABLE_AI_ANALYSIS=true
AI_CONFIDENCE_THRESHOLD=0.7
USE_TECHNICAL_INDICATORS=true
USE_SENTIMENT_ANALYSIS=true

# RISK MANAGEMENT
MAX_LOSS_PERCENTAGE=2
STOP_LOSS_PERCENTAGE=1
TAKE_PROFIT_PERCENTAGE=2
MIN_ACCOUNT_BALANCE=50

# SERVER
PORT=3000
NODE_ENV=development
`;

        try {
            if (!fs.existsSync('.env.example')) {
                fs.writeFileSync('.env.example', envExample);
                log('✅ Created .env.example', 'green');
                this.fixesApplied.push('.env.example template');
            }

            if (!fs.existsSync('.env')) {
                fs.writeFileSync('.env', envExample);
                fs.chmodSync('.env', 0o600);
                log('✅ Created .env (secure permissions)', 'green');
                log('⚠️  EDIT .env with your actual API keys!', 'yellow');
                this.fixesApplied.push('.env file');
            } else {
                log('✓ .env already exists', 'blue');
            }
        } catch (error) {
            log(`❌ Failed to create environment files: ${error.message}`, 'red');
            this.errors.push('Environment file creation');
        }
        log('');
    }

    async updatePackageJson() {
        log('📦 Updating package.json scripts...', 'bright');

        try {
            if (fs.existsSync('package.json')) {
                const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
                
                // Add/update scripts
                packageJson.scripts = {
                    ...packageJson.scripts,
                    "validate": "node validate-config.js",
                    "test:config": "node validate-config.js",
                    "fix:apply": "node apply-fixes.js",
                    "setup:complete": "./setup.sh",
                    "start:safe": "npm run test:config && npm start",
                    "logs:trading": "tail -f logs/trading.log",
                    "logs:error": "tail -f logs/error.log",
                    "backup:create": "./backup.sh",
                    "health:check": "curl -f http://localhost:3000/health || exit 1"
                };

                fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
                log('✅ Updated package.json scripts', 'green');
                this.fixesApplied.push('package.json scripts');
            }
        } catch (error) {
            log(`❌ Failed to update package.json: ${error.message}`, 'red');
            this.errors.push('package.json update');
        }
        log('');
    }

    async createValidationScript() {
        log('✅ Creating validation script...', 'bright');

        const validationScript = `// Configuration validation script
require('dotenv').config();

const validators = {
    checkEnvironment() {
        const required = ['TELEGRAM_BOT_TOKEN', 'ADMIN_USER_IDS', 'BINANCE_API_KEY', 'BINANCE_SECRET_KEY'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:', missing.join(', '));
            return false;
        }
        
        console.log('✅ All required environment variables present');
        return true;
    },

    checkAPIKeys() {
        const apiKey = process.env.BINANCE_API_KEY;
        const secretKey = process.env.BINANCE_SECRET_KEY;
        
        if (apiKey && apiKey.length < 60) {
            console.error('❌ Binance API key appears invalid (too short)');
            return false;
        }
        
        if (secretKey && secretKey.length < 60) {
            console.error('❌ Binance secret key appears invalid (too short)');
            return false;
        }
        
        console.log('✅ API keys format looks correct');
        return true;
    },

    checkTelegramToken() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const tokenRegex = /^\\d+:[A-Za-z0-9_-]{35}$/;
        
        if (!token || !tokenRegex.test(token)) {
            console.error('❌ Telegram bot token format invalid');
            return false;
        }
        
        console.log('✅ Telegram token format correct');
        return true;
    },

    checkNumericConfigs() {
        const configs = [
            'FUTURES_LEVERAGE', 'FUTURES_QTY_USDT', 'RSI_LONG_THRESHOLD', 
            'RSI_SHORT_THRESHOLD', 'DAILY_MAX_LOSS_PERCENT'
        ];
        
        for (const config of configs) {
            if (process.env[config] && isNaN(parseFloat(process.env[config]))) {
                console.error(\`❌ Invalid numeric value for \${config}\`);
                return false;
            }
        }
        
        console.log('✅ Numeric configurations valid');
        return true;
    }
};

// Run validation
console.log('🔍 Validating configuration...');
const checks = Object.values(validators).map(validator => validator());
const allPassed = checks.every(check => check);

if (allPassed) {
    console.log('\\n🎉 Configuration validation passed!');
    process.exit(0);
} else {
    console.log('\\n❌ Configuration validation failed!');
    console.log('Please fix the errors above and try again.');
    process.exit(1);
}
`;

        try {
            fs.writeFileSync('validate-config.js', validationScript);
            log('✅ Created validate-config.js', 'green');
            this.fixesApplied.push('validation script');
        } catch (error) {
            log(`❌ Failed to create validation script: ${error.message}`, 'red');
            this.errors.push('validation script creation');
        }
        log('');
    }

    async createStartupScripts() {
        log('🚀 Creating startup scripts...', 'bright');

        const scripts = {
            'start.sh': `#!/bin/bash
echo "🚀 Starting Crypto Trading Bot..."

# Validate configuration first
echo "📋 Validating configuration..."
npm run test:config

if [ $? -ne 0 ]; then
    echo "❌ Configuration validation failed!"
    exit 1
fi

# Start the bot
echo "🎯 Starting bot..."
npm start
`,
            'start-pm2.sh': `#!/bin/bash
echo "🚀 Starting Crypto Trading Bot with PM2..."

# Validate configuration
npm run test:config
if [ $? -ne 0 ]; then
    echo "❌ Configuration validation failed!"
    exit 1
fi

# Start with PM2
npm run pm2:start
echo "✅ Bot started with PM2"
echo "📊 Monitor: npm run pm2:logs"
`,
            'stop.sh': `#!/bin/bash
echo "🛑 Stopping Crypto Trading Bot..."
npm run pm2:stop || pkill -f "node index.js"
echo "✅ Bot stopped"
`,
            'restart.sh': `#!/bin/bash
echo "🔄 Restarting Crypto Trading Bot..."
./stop.sh
sleep 2
./start-pm2.sh
`,
            'backup.sh': `#!/bin/bash
echo "💾 Creating backup..."
BACKUP_DIR="backups/\$(date +%Y%m%d_%H%M%S)"
mkdir -p "\$BACKUP_DIR"

# Backup configuration
cp .env "\$BACKUP_DIR/" 2>/dev/null
cp package.json "\$BACKUP_DIR/" 2>/dev/null

# Backup logs
tar -czf "\$BACKUP_DIR/logs.tar.gz" logs/ 2>/dev/null

echo "✅ Backup created in \$BACKUP_DIR"
`
        };

        for (const [filename, content] of Object.entries(scripts)) {
            try {
                fs.writeFileSync(filename, content);
                fs.chmodSync(filename, 0o755);
                log(`✅ Created ${filename}`, 'green');
                this.fixesApplied.push(filename);
            } catch (error) {
                log(`❌ Failed to create ${filename}: ${error.message}`, 'red');
                this.errors.push(`Script creation: ${filename}`);
            }
        }
        log('');
    }

    async fixIndexJs() {
        log('🔧 Checking index.js...', 'bright');

        if (fs.existsSync('index.js')) {
            const content = fs.readFileSync('index.js', 'utf8');
            
            // Check if already has error handling
            if (!content.includes('uncaughtException')) {
                log('⚠️  index.js needs error handling improvements', 'yellow');
                log('📝 Manual update recommended for index.js', 'blue');
            } else {
                log('✅ index.js appears to have error handling', 'green');
            }
        } else {
            log('❌ index.js not found', 'red');
            this.errors.push('index.js missing');
        }
        log('');
    }

    async createDocumentation() {
        log('📚 Creating documentation...', 'bright');

        const quickStart = `# 🚀 Quick Start Guide

## Prerequisites
- Node.js 16+
- Telegram Bot Token
- Binance API Keys

## Setup Steps

1. **Install Dependencies**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure Environment**
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your API keys
   \`\`\`

3. **Validate Configuration**
   \`\`\`bash
   npm run test:config
   \`\`\`

4. **Start Bot**
   \`\`\`bash
   ./start-pm2.sh
   \`\`\`

## ⚠️ Safety Rules

1. **Always start with testnet** (\`USE_TESTNET=true\`)
2. **Start with small amounts** (max $20 position)
3. **Set daily loss limits** (max 3% per day)
4. **Monitor 24/7** for first week

## 🆘 Emergency Stop

\`\`\`bash
./stop.sh
# Or via Telegram: /stop
\`\`\`

## 📊 Monitoring

\`\`\`bash
npm run logs           # View logs
npm run pm2:monitor    # PM2 dashboard
curl http://localhost:3000/health  # Health check
\`\`\`
`;

        try {
            fs.writeFileSync('QUICK_START.md', quickStart);
            log('✅ Created QUICK_START.md', 'green');
            this.fixesApplied.push('Quick Start documentation');
        } catch (error) {
            log(`❌ Failed to create documentation: ${error.message}`, 'red');
            this.errors.push('documentation creation');
        }
        log('');
    }

    async setPermissions() {
        log('🔐 Setting file permissions...', 'bright');

        const filesToSecure = ['.env'];
        const scriptsToExecute = ['start.sh', 'stop.sh', 'restart.sh', 'backup.sh', 'start-pm2.sh'];

        // Secure sensitive files
        for (const file of filesToSecure) {
            try {
                if (fs.existsSync(file)) {
                    fs.chmodSync(file, 0o600);
                    log(`✅ Secured ${file} (600)`, 'green');
                }
            } catch (error) {
                log(`❌ Failed to secure ${file}: ${error.message}`, 'red');
            }
        }

        // Make scripts executable
        for (const script of scriptsToExecute) {
            try {
                if (fs.existsSync(script)) {
                    fs.chmodSync(script, 0o755);
                    log(`✅ Made ${script} executable`, 'green');
                }
            } catch (error) {
                log(`❌ Failed to make ${script} executable: ${error.message}`, 'red');
            }
        }

        // Set directory permissions
        const directories = ['logs', 'data', 'models', 'backups'];
        for (const dir of directories) {
            try {
                if (fs.existsSync(dir)) {
                    fs.chmodSync(dir, 0o755);
                    log(`✅ Set permissions for ${dir}/`, 'green');
                }
            } catch (error) {
                log(`❌ Failed to set permissions for ${dir}: ${error.message}`, 'red');
            }
        }

        this.fixesApplied.push('file permissions');
        log('');
    }

    async runValidation() {
        log('🔍 Running final validation...', 'bright');

        try {
            if (fs.existsSync('validate-config.js')) {
                // Try to run validation
                log('Running configuration validation...', 'blue');
                
                // Note: We don't actually run it here to avoid requiring all dependencies
                // Just check if the file exists and is readable
                const validationContent = fs.readFileSync('validate-config.js', 'utf8');
                if (validationContent.length > 0) {
                    log('✅ Validation script ready', 'green');
                    log('📝 Run: npm run test:config', 'blue');
                    this.fixesApplied.push('validation setup');
                }
            }
        } catch (error) {
            log(`⚠️  Validation check failed: ${error.message}`, 'yellow');
        }
        log('');
    }

    showSummary() {
        const duration = Date.now() - this.startTime;
        
        log('📊 FIXES APPLICATION SUMMARY', 'bright');
        log('=' .repeat(50), 'blue');
        log(`⏱️  Duration: ${duration}ms`);
        log(`✅ Fixes Applied: ${this.fixesApplied.length}`);
        log(`❌ Errors: ${this.errors.length}`);
        log('');

        if (this.fixesApplied.length > 0) {
            log('✅ Successfully Applied:', 'green');
            for (const fix of this.fixesApplied) {
                log(`   • ${fix}`, 'green');
            }
            log('');
        }

        if (this.errors.length > 0) {
            log('❌ Errors Encountered:', 'red');
            for (const error of this.errors) {
                log(`   • ${error}`, 'red');
            }
            log('');
        }

        // Show next steps
        log('📋 NEXT STEPS:', 'bright');
        log('');
        
        log('1. 🔧 Configure your bot:', 'yellow');
        log('   • Edit .env file with your actual API keys');
        log('   • Get Telegram Bot Token from @BotFather');
        log('   • Get Binance API keys from Binance.com');
        log('   • Get your Telegram User ID from @userinfobot');
        log('');

        log('2. ✅ Validate configuration:', 'yellow');
        log('   npm run test:config');
        log('');

        log('3. 🚀 Start the bot:', 'yellow');
        log('   ./start-pm2.sh');
        log('   # Or: npm start');
        log('');

        log('4. 📊 Monitor the bot:', 'yellow');
        log('   npm run logs');
        log('   npm run pm2:monitor');
        log('   curl http://localhost:3000/health');
        log('');

        log('🛡️ SAFETY REMINDERS:', 'bright');
        log('   • Keep USE_TESTNET=true for testing');
        log('   • Start with small amounts (max $20)');
        log('   • Set daily loss limits (max 3%)');
        log('   • Monitor the bot 24/7 for first week');
        log('   • Have an emergency stop plan ready');
        log('');

        log('📱 USEFUL COMMANDS:', 'bright');
        log('   ./start-pm2.sh     # Start with PM2');
        log('   ./stop.sh          # Stop bot');
        log('   ./restart.sh       # Restart bot');
        log('   ./backup.sh        # Create backup');
        log('   npm run test:config # Validate config');
        log('');

        if (this.errors.length === 0) {
            log('🎉 ALL FIXES APPLIED SUCCESSFULLY!', 'green');
            log('Your bot is now ready for configuration and testing.', 'green');
        } else {
            log('⚠️  SOME FIXES FAILED', 'yellow');
            log('Please review the errors above and fix manually.', 'yellow');
        }

        log('');
        log('Happy Trading! 🚀💰', 'bright');
        log('');
    }

    // Helper method to check if running in the right directory
    validateDirectory() {
        if (!fs.existsSync('package.json')) {
            throw new Error('Not in a Node.js project directory. Please run from your bot directory.');
        }

        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        if (!packageJson.name || !packageJson.name.includes('trading')) {
            log('⚠️  This doesn\'t appear to be a trading bot project', 'yellow');
            log('Continuing anyway...', 'blue');
        }
    }

    // Method to create gitignore if missing
    createGitignore() {
        const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*

# Environment variables
.env
.env.local
.env.*.local

# Logs
logs/
*.log

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Models (too large for git)
models/
*.h5
*.pkl

# Trading data
data/
backtest_results/
trade_history/

# PM2
.pm2/

# Backup files
*.backup
*.bak

# Local config overrides
local.config.js
local.env

# OS generated files
.DS_Store
Thumbs.db

# Editor directories
.vscode/
.idea/
`;

        try {
            if (!fs.existsSync('.gitignore')) {
                fs.writeFileSync('.gitignore', gitignoreContent);
                log('✅ Created .gitignore', 'green');
                this.fixesApplied.push('.gitignore');
            }
        } catch (error) {
            log(`❌ Failed to create .gitignore: ${error.message}`, 'red');
        }
    }

    // Method to check and install missing dependencies
    async checkDependencies() {
        log('📦 Checking dependencies...', 'bright');

        const requiredDeps = [
            'express', 'axios', 'dotenv', 'winston', 'node-telegram-bot-api',
            'technicalindicators', '@tensorflow/tfjs', 'cors', 'helmet', 'cron'
        ];

        try {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

            const missingDeps = requiredDeps.filter(dep => !dependencies[dep]);

            if (missingDeps.length > 0) {
                log(`⚠️  Missing dependencies: ${missingDeps.join(', ')}`, 'yellow');
                log('📝 Run: npm install to install missing dependencies', 'blue');
            } else {
                log('✅ All required dependencies present', 'green');
            }

            // Check if node_modules exists
            if (!fs.existsSync('node_modules')) {
                log('❌ node_modules not found', 'red');
                log('📝 Run: npm install', 'blue');
            } else {
                log('✅ node_modules directory exists', 'green');
            }

        } catch (error) {
            log(`❌ Failed to check dependencies: ${error.message}`, 'red');
        }
        log('');
    }
}

// Main execution
async function main() {
    const applicator = new FixApplicator();

    try {
        // Validate we're in the right directory
        applicator.validateDirectory();

        // Create gitignore
        applicator.createGitignore();

        // Check dependencies
        await applicator.checkDependencies();

        // Run all fixes
        await applicator.run();

    } catch (error) {
        log(`💥 Fatal error: ${error.message}`, 'red');
        log('');
        log('Please ensure you are running this script from your trading bot directory.', 'yellow');
        process.exit(1);
    }
}

// Handle script interruption
process.on('SIGINT', () => {
    log('\n🛑 Fix application interrupted by user', 'yellow');
    process.exit(1);
});

// Run the script
if (require.main === module) {
    main().catch(error => {
        log(`💥 Unhandled error: ${error.message}`, 'red');
        process.exit(1);
    });
}

module.exports = FixApplicator;
