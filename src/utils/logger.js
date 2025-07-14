const winston = require('winston');
const path = require('path');
const config = require('../config/config');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for logs
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += `\n${JSON.stringify(meta, null, 2)}`;
        }
        return msg;
    })
);

// Create the logger
const logger = winston.createLogger({
    level: config.LOGGING?.LEVEL || 'info',
    format: logFormat,
    transports: [
        // Write all logs to combined.log
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 20 * 1024 * 1024, // 20MB
            maxFiles: 5,
            tailable: true
        }),
        
        // Write only error logs to error.log
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 20 * 1024 * 1024, // 20MB
            maxFiles: 5,
            tailable: true
        }),
        
        // Write trading-specific logs
        new winston.transports.File({
            filename: path.join(logsDir, 'trading.log'),
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            maxsize: 20 * 1024 * 1024, // 20MB
            maxFiles: 10,
            tailable: true
        })
    ]
});

// Add console transport for development
if (config.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat
    }));
}

// Trading-specific logging methods
logger.trade = (action, data) => {
    logger.info(`[TRADE] ${action}`, data);
};

logger.market = (action, data) => {
    logger.info(`[MARKET] ${action}`, data);
};

logger.ai = (action, data) => {
    logger.info(`[AI] ${action}`, data);
};

logger.telegram = (action, data) => {
    logger.info(`[TELEGRAM] ${action}`, data);
};

logger.binance = (action, data) => {
    logger.info(`[BINANCE] ${action}`, data);
};

// Error handling for the logger itself
logger.on('error', (error) => {
    console.error('Logger error:', error);
});

module.exports = logger;