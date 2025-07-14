const EventEmitter = require('events');
const logger = require('../utils/logger');

class RiskManager extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.accountInfo = null;
        
        // Use config values with fallbacks from environment or defaults
        this.riskLimits = {
            maxDailyLoss: config.MAX_LOSS_PERCENTAGE || 
                         parseFloat(process.env.MAX_LOSS_PERCENTAGE) || 5, // 5% max daily loss
            maxTradeRisk: config.MAX_TRADE_RISK || 
                         parseFloat(process.env.MAX_TRADE_RISK) || 2, // 2% per trade
            maxCorrelationRisk: 0.7, // Max correlation between positions
            maxLeverage: config.MAX_LEVERAGE || 1, // No leverage for spot trading
            maxPositionSize: config.MAX_POSITION_SIZE || 10, // 10% max position size
            maxDrawdown: config.MAX_DRAWDOWN || 10, // 10% max drawdown
            maxConsecutiveLosses: config.MAX_CONSECUTIVE_LOSSES || 5
        };
        
        this.dailyStats = {
            pnl: 0,
            trades: 0,
            startBalance: 0,
            currentBalance: 0,
            maxLoss: 0,
            lastResetDate: new Date().toDateString()
        };
        
        this.positionSizes = new Map();
        this.correlationMatrix = new Map();
        this.riskEvents = [];
        
        this.setupRiskMonitoring();
        
        logger.info('Risk Manager initialized with limits:', this.riskLimits);
    }

    async initialize(accountInfo) {
        this.accountInfo = accountInfo;
        
        // Calculate total balance in USDT
        const totalBalance = this.calculateTotalBalanceUSDT();
        
        this.dailyStats.startBalance = totalBalance;
        this.dailyStats.currentBalance = totalBalance;
        
        logger.info('Risk manager initialized', {
            totalBalance: totalBalance,
            limits: this.riskLimits
        });
        
        return true;
    }

    setupRiskMonitoring() {
        // Reset daily stats at midnight
        setInterval(() => {
            const today = new Date().toDateString();
            if (today !== this.dailyStats.lastResetDate) {
                this.resetDailyStats();
            }
        }, 60000); // Check every minute
    }

    resetDailyStats() {
        const today = new Date().toDateString();
        
        this.dailyStats = {
            pnl: 0,
            trades: 0,
            startBalance: this.dailyStats.currentBalance,
            currentBalance: this.dailyStats.currentBalance,
            maxLoss: 0,
            lastResetDate: today
        };
        
        logger.info('Daily risk stats reset');
    }

    calculateTotalBalanceUSDT() {
        if (!this.accountInfo) return 0;
        
        // For now, just return USDT balance
        // In real implementation, convert all assets to USDT equivalent
        const usdtBalance = this.accountInfo.balances?.find(b => b.asset === 'USDT');
        return usdtBalance ? parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked) : 0;
    }

    async evaluateRisk(signal) {
        const riskAssessment = {
            approved: true,
            risk: 'low',
            reasons: [],
            warnings: [],
            adjustments: {}
        };

        try {
            // Check daily loss limit
            if (!this.checkDailyLossLimit()) {
                riskAssessment.approved = false;
                riskAssessment.reasons.push('Daily loss limit exceeded');
            }

            // Check position size limit
            const positionSizeCheck = this.checkPositionSize(signal);
            if (!positionSizeCheck.approved) {
                riskAssessment.approved = false;
                riskAssessment.reasons.push(positionSizeCheck.reason);
            }

            // Check correlation risk
            const correlationCheck = await this.checkCorrelationRisk(signal);
            if (!correlationCheck.approved) {
                riskAssessment.warnings.push(correlationCheck.reason);
                riskAssessment.risk = 'medium';
            }

            // Check volatility risk
            const volatilityCheck = this.checkVolatilityRisk(signal);
            if (volatilityCheck.risk === 'high') {
                riskAssessment.risk = 'high';
                riskAssessment.warnings.push('High volatility detected');
                riskAssessment.adjustments.reducePosition = true;
            }

            // Check market conditions
            const marketCheck = this.checkMarketConditions(signal);
            if (!marketCheck.approved) {
                riskAssessment.risk = 'high';
                riskAssessment.warnings.push(marketCheck.reason);
            }

            // Check stop loss validity
            const stopLossCheck = this.validateStopLoss(signal);
            if (!stopLossCheck.valid) {
                riskAssessment.approved = false;
                riskAssessment.reasons.push(stopLossCheck.reason);
            }

            // Log risk assessment
            logger.info('Risk assessment completed', {
                symbol: signal.symbol,
                approved: riskAssessment.approved,
                risk: riskAssessment.risk,
                reasons: riskAssessment.reasons,
                warnings: riskAssessment.warnings
            });

            return riskAssessment;

        } catch (error) {
            logger.error('Risk evaluation failed:', error);
            return {
                approved: false,
                risk: 'high',
                reasons: ['Risk evaluation failed'],
                warnings: [],
                adjustments: {}
            };
        }
    }

    checkDailyLossLimit() {
        if (this.dailyStats.startBalance === 0) return true;
        
        const dailyLossPercent = (this.dailyStats.pnl / this.dailyStats.startBalance) * 100;
        
        if (Math.abs(dailyLossPercent) >= this.riskLimits.maxDailyLoss) {
            this.logRiskEvent('daily_loss_limit', {
                currentLoss: dailyLossPercent,
                limit: this.riskLimits.maxDailyLoss
            });
            return false;
        }
        
        return true;
    }

    checkPositionSize(signal) {
        if (!signal.entryPrice || !signal.quantity) {
            return { approved: true }; // Skip if no position size info
        }
        
        const entryValue = signal.entryPrice * signal.quantity;
        const positionSizePercent = (entryValue / this.dailyStats.currentBalance) * 100;
        
        if (positionSizePercent > this.riskLimits.maxPositionSize) {
            return {
                approved: false,
                reason: `Position size ${positionSizePercent.toFixed(2)}% exceeds limit ${this.riskLimits.maxPositionSize}%`
            };
        }
        
        return { approved: true };
    }

    async checkCorrelationRisk(signal) {
        // Simplified correlation check
        // In real implementation, you'd calculate actual correlation
        const currentPositions = Array.from(this.positionSizes.keys());
        
        if (currentPositions.length === 0) {
            return { approved: true };
        }
        
        // For now, just check if we already have a position in the same symbol
        if (currentPositions.includes(signal.symbol)) {
            return {
                approved: false,
                reason: `Already have position in ${signal.symbol}`
            };
        }
        
        return { approved: true };
    }

    checkVolatilityRisk(signal) {
        // Simplified volatility check
        // In real implementation, calculate actual volatility from price history
        return {
            risk: 'low',
            message: 'Volatility within acceptable range'
        };
    }

    checkMarketConditions(signal) {
        // Check for major market events, low liquidity times, etc.
        const hour = new Date().getUTCHours();
        
        // Avoid trading during low liquidity hours (22:00 - 04:00 UTC)
        if (hour >= 22 || hour <= 4) {
            return {
                approved: false,
                reason: 'Low liquidity hours'
            };
        }
        
        return { approved: true };
    }

    validateStopLoss(signal) {
        if (!signal.stopLoss || !signal.entryPrice) {
            return {
                valid: false,
                reason: 'No stop loss specified'
            };
        }
        
        const stopLossDistance = Math.abs(signal.entryPrice - signal.stopLoss) / signal.entryPrice * 100;
        
        // Stop loss should be reasonable (0.5% to 10%)
        if (stopLossDistance < 0.5) {
            return {
                valid: false,
                reason: 'Stop loss too tight'
            };
        }
        
        if (stopLossDistance > 10) {
            return {
                valid: false,
                reason: 'Stop loss too wide'
            };
        }
        
        return { valid: true };
    }

    updatePositionSize(symbol, size) {
        if (size <= 0) {
            this.positionSizes.delete(symbol);
        } else {
            this.positionSizes.set(symbol, size);
        }
    }

    updateDailyStats(pnl, isNewTrade = false) {
        this.dailyStats.pnl += pnl;
        this.dailyStats.currentBalance += pnl;
        
        if (isNewTrade) {
            this.dailyStats.trades++;
        }
        
        // Track maximum loss
        if (this.dailyStats.pnl < this.dailyStats.maxLoss) {
            this.dailyStats.maxLoss = this.dailyStats.pnl;
        }
        
        // Check if we're approaching limits
        this.checkRiskLimits();
    }

    checkRiskLimits() {
        if (this.dailyStats.startBalance === 0) return;
        
        const dailyLossPercent = (this.dailyStats.pnl / this.dailyStats.startBalance) * 100;
        
        // Warning at 75% of daily limit
        if (Math.abs(dailyLossPercent) >= this.riskLimits.maxDailyLoss * 0.75) {
            this.emit('riskWarning', {
                type: 'approaching_daily_limit',
                current: dailyLossPercent,
                limit: this.riskLimits.maxDailyLoss
            });
        }
        
        // Emergency stop at daily limit
        if (Math.abs(dailyLossPercent) >= this.riskLimits.maxDailyLoss) {
            this.emit('emergencyStop', {
                type: 'daily_loss_limit_exceeded',
                current: dailyLossPercent,
                limit: this.riskLimits.maxDailyLoss
            });
        }
    }

    calculateMaxPositionSize(balance, entryPrice, stopLoss) {
        // Calculate position size based on risk per trade
        const riskPerTrade = balance * (this.riskLimits.maxTradeRisk / 100);
        const priceRisk = Math.abs(entryPrice - stopLoss);
        const maxQuantity = riskPerTrade / priceRisk;
        
        // Also check against max position size limit
        const maxByPercent = (balance * (this.riskLimits.maxPositionSize / 100)) / entryPrice;
        
        return Math.min(maxQuantity, maxByPercent);
    }

    logRiskEvent(type, data) {
        const event = {
            timestamp: Date.now(),
            type,
            data
        };
        
        this.riskEvents.push(event);
        
        // Keep only last 100 events
        if (this.riskEvents.length > 100) {
            this.riskEvents.shift();
        }
        
        logger.info('Risk event logged', { type, data });
        this.emit('riskEvent', event);
    }

    getDailyStats() {
        return { ...this.dailyStats };
    }

    getRiskLimits() {
        return { ...this.riskLimits };
    }

    updateRiskLimits(newLimits) {
        this.riskLimits = { ...this.riskLimits, ...newLimits };
        logger.info('Risk limits updated', this.riskLimits);
    }

    getRiskEvents(limit = 50) {
        return this.riskEvents
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    getPortfolioRisk() {
        const totalValue = Array.from(this.positionSizes.values())
            .reduce((sum, size) => sum + size, 0);
        
        const portfolioRisk = {
            totalExposure: totalValue,
            exposurePercent: this.dailyStats.currentBalance > 0 ? 
                           (totalValue / this.dailyStats.currentBalance) * 100 : 0,
            numberOfPositions: this.positionSizes.size,
            diversification: this.positionSizes.size > 0 ?
                           1 / Math.sqrt(this.positionSizes.size) : 0,
            dailyPnLPercent: this.dailyStats.startBalance > 0 ?
                           (this.dailyStats.pnl / this.dailyStats.startBalance) * 100 : 0
        };
        
        return portfolioRisk;
    }

    isWithinRiskLimits() {
        const portfolioRisk = this.getPortfolioRisk();
        
        return {
            withinLimits: portfolioRisk.exposurePercent <= this.riskLimits.maxPositionSize * this.positionSizes.size &&
                         Math.abs(portfolioRisk.dailyPnLPercent) < this.riskLimits.maxDailyLoss,
            checks: {
                dailyLoss: Math.abs(portfolioRisk.dailyPnLPercent) < this.riskLimits.maxDailyLoss,
                exposure: portfolioRisk.exposurePercent <= this.riskLimits.maxPositionSize * this.positionSizes.size,
                positions: this.positionSizes.size <= 10 // Max 10 concurrent positions
            }
        };
    }

    getStatus() {
        return {
            riskLimits: this.riskLimits,
            dailyStats: this.dailyStats,
            portfolioRisk: this.getPortfolioRisk(),
            withinLimits: this.isWithinRiskLimits(),
            recentEvents: this.getRiskEvents(5)
        };
    }

    cleanup() {
        this.removeAllListeners();
        this.positionSizes.clear();
        this.correlationMatrix.clear();
        this.riskEvents = [];
        logger.info('Risk manager cleanup completed');
    }
}

module.exports = RiskManager;
