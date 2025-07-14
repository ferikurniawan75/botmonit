const EventEmitter = require('events');
const logger = require('../utils/logger');

class RiskManager extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.accountInfo = null;
        this.riskLimits = {
            maxDailyLoss: config.MAX_LOSS_PERCENTAGE || 5, // 5% max daily loss
            maxTradeRisk: config.MAX_TRADE_RISK || 2, // 2% per trade
            maxCorrelationRisk: 0.7, // Max correlation between positions
            maxLeverage: 1, // No leverage for spot trading
            maxPositionSize: 10, // 10% max position size
            maxDrawdown: 10 // 10% max drawdown
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
    }

    async initialize(accountInfo) {
        this.accountInfo = accountInfo;
        
        // Calculate total balance in USDT
        const totalBalance = this.calculateTotalBalanceUSDT();
        
        this.dailyStats.startBalance = totalBalance;
        this.dailyStats.currentBalance = totalBalance;
        
        logger.trade('Risk manager initialized', {
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
        
        logger.trade('Daily risk stats reset');
    }

    calculateTotalBalanceUSDT() {
        if (!this.accountInfo) return 0;
        
        // For now, just return USDT balance
        // In real implementation, convert all assets to USDT equivalent
        const usdtBalance = this.accountInfo.balances.find(b => b.asset === 'USDT');
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
            logger.trade('Risk assessment completed', {
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
        // Get currently held positions
        const currentPositions = Array.from(this.positionSizes.keys());
        
        // Check correlation with existing positions
        for (const existingSymbol of currentPositions) {
            const correlation = await this.calculateCorrelation(signal.symbol, existingSymbol);
            
            if (Math.abs(correlation) > this.riskLimits.maxCorrelationRisk) {
                return {
                    approved: false,
                    reason: `High correlation ${correlation.toFixed(2)} with existing position ${existingSymbol}`
                };
            }
        }
        
        return { approved: true };
    }

    async calculateCorrelation(symbol1, symbol2) {
        try {
            // Simplified correlation calculation
            // In real implementation, use historical price data
            
            // Get base assets
            const base1 = symbol1.replace('USDT', '').replace('BUSD', '');
            const base2 = symbol2.replace('USDT', '').replace('BUSD', '');
            
            // High correlation for same asset
            if (base1 === base2) return 1.0;
            
            // High correlation for major pairs
            const majorPairs = ['BTC', 'ETH', 'BNB'];
            if (majorPairs.includes(base1) && majorPairs.includes(base2)) {
                return 0.8;
            }
            
            // Medium correlation for DeFi tokens
            const defiTokens = ['UNI', 'SUSHI', 'AAVE', 'COMP', 'MKR'];
            if (defiTokens.includes(base1) && defiTokens.includes(base2)) {
                return 0.6;
            }
            
            // Low correlation otherwise
            return 0.3;
            
        } catch (error) {
            logger.error('Correlation calculation failed:', error);
            return 0.5; // Default medium correlation
        }
    }

    checkVolatilityRisk(signal) {
        // Calculate implied volatility from stop loss distance
        const stopLossDistance = Math.abs(signal.entryPrice - signal.stopLoss) / signal.entryPrice * 100;
        
        let risk = 'low';
        if (stopLossDistance > 5) {
            risk = 'high';
        } else if (stopLossDistance > 3) {
            risk = 'medium';
        }
        
        return { risk, volatility: stopLossDistance };
    }

    checkMarketConditions(signal) {
        // Check overall market sentiment and conditions
        // This is a simplified check - in real implementation, 
        // you'd analyze broader market indicators
        
        return { approved: true };
    }

    validateStopLoss(signal) {
        if (!signal.stopLoss) {
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

    assessTradeRisk(signal) {
        const riskScore = {
            overall: 0,
            factors: {}
        };
        
        // Volatility risk (0-30 points)
        const volatilityCheck = this.checkVolatilityRisk(signal);
        if (volatilityCheck.risk === 'high') {
            riskScore.factors.volatility = 30;
        } else if (volatilityCheck.risk === 'medium') {
            riskScore.factors.volatility = 15;
        } else {
            riskScore.factors.volatility = 5;
        }
        
        // Confidence risk (0-25 points)
        if (signal.confidence < 0.6) {
            riskScore.factors.confidence = 25;
        } else if (signal.confidence < 0.8) {
            riskScore.factors.confidence = 10;
        } else {
            riskScore.factors.confidence = 0;
        }
        
        // Market timing risk (0-20 points)
        const hour = new Date().getHours();
        if (hour >= 22 || hour <= 6) { // Night trading (higher risk)
            riskScore.factors.timing = 20;
        } else {
            riskScore.factors.timing = 0;
        }
        
        // Strategy risk (0-15 points)
        if (signal.strategy === 'ai_signals') {
            riskScore.factors.strategy = 5;
        } else if (signal.strategy === 'momentum') {
            riskScore.factors.strategy = 15;
        } else {
            riskScore.factors.strategy = 10;
        }
        
        // Position concentration risk (0-10 points)
        const existingPositions = this.positionSizes.size;
        if (existingPositions === 0) {
            riskScore.factors.concentration = 0;
        } else if (existingPositions >= 5) {
            riskScore.factors.concentration = 10;
        } else {
            riskScore.factors.concentration = 5;
        }
        
        // Calculate overall risk score
        riskScore.overall = Object.values(riskScore.factors).reduce((sum, val) => sum + val, 0);
        
        // Classify risk level
        let riskLevel;
        if (riskScore.overall <= 25) {
            riskLevel = 'low';
        } else if (riskScore.overall <= 50) {
            riskLevel = 'medium';
        } else if (riskScore.overall <= 75) {
            riskLevel = 'high';
        } else {
            riskLevel = 'very_high';
        }
        
        return {
            score: riskScore.overall,
            level: riskLevel,
            factors: riskScore.factors
        };
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
        
        logger.trade('Risk event logged', { type, data });
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
        logger.trade('Risk limits updated', this.riskLimits);
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
            exposurePercent: (totalValue / this.dailyStats.currentBalance) * 100,
            numberOfPositions: this.positionSizes.size,
            diversification: this.positionSizes.size > 0 ? 1 / Math.sqrt(this.positionSizes.size) : 0,
            dailyPnLPercent: (this.dailyStats.pnl / this.dailyStats.startBalance) * 100
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

    generateRiskReport() {
        const portfolioRisk = this.getPortfolioRisk();
        const riskCheck = this.isWithinRiskLimits();
        const recentEvents = this.getRiskEvents(10);
        
        return {
            timestamp: Date.now(),
            dailyStats: this.getDailyStats(),
            portfolioRisk,
            riskLimits: this.getRiskLimits(),
            withinLimits: riskCheck.withinLimits,
            checks: riskCheck.checks,
            recentEvents,
            recommendations: this.generateRiskRecommendations(portfolioRisk, riskCheck)
        };
    }

    generateRiskRecommendations(portfolioRisk, riskCheck) {
        const recommendations = [];
        
        if (!riskCheck.checks.dailyLoss) {
            recommendations.push({
                type: 'critical',
                message: 'Daily loss limit exceeded - stop trading immediately',
                action: 'stop_trading'
            });
        }
        
        if (portfolioRisk.exposurePercent > 80) {
            recommendations.push({
                type: 'warning',
                message: 'High portfolio exposure - consider reducing position sizes',
                action: 'reduce_positions'
            });
        }
        
        if (portfolioRisk.numberOfPositions > 8) {
            recommendations.push({
                type: 'info',
                message: 'Many open positions - monitor correlation risk',
                action: 'monitor_correlation'
            });
        }
        
        if (portfolioRisk.diversification < 0.3) {
            recommendations.push({
                type: 'info',
                message: 'Low diversification - consider spreading risk across more assets',
                action: 'increase_diversification'
            });
        }
        
        return recommendations;
    }

    cleanup() {
        this.removeAllListeners();
        this.positionSizes.clear();
        this.correlationMatrix.clear();
        this.riskEvents = [];
        logger.trade('Risk manager cleanup completed');
    }
}

module.exports = RiskManager;