class RiskManager {
    constructor(config) {
        this.config = config;
        this.dailyLoss = 0;
        this.openPositions = 0;
        this.maxDailyLoss = config.DAILY_MAX_LOSS_PERCENT || 3;
        this.maxPositions = config.MAX_OPEN_POSITIONS || 3;
    }

    canOpenPosition(amount) {
        if (this.openPositions >= this.maxPositions) {
            return { allowed: false, reason: 'Max positions reached' };
        }
        
        if (this.dailyLoss >= this.maxDailyLoss) {
            return { allowed: false, reason: 'Daily loss limit reached' };
        }
        
        return { allowed: true };
    }

    recordTrade(profit) {
        if (profit < 0) {
            this.dailyLoss += Math.abs(profit);
        }
    }

    resetDaily() {
        this.dailyLoss = 0;
    }
}

module.exports = RiskManager;