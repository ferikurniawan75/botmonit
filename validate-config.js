// Configuration validation script
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
        const tokenRegex = /^\d+:[A-Za-z0-9_-]{35}$/;
        
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
                console.error(`❌ Invalid numeric value for ${config}`);
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
    console.log('\n🎉 Configuration validation passed!');
    process.exit(0);
} else {
    console.log('\n❌ Configuration validation failed!');
    console.log('Please fix the errors above and try again.');
    process.exit(1);
}
