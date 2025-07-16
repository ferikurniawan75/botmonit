const EventEmitter = require('events');

class BinanceFuturesAPI extends EventEmitter {
    constructor(options = {}) {
        super();
        this.apiKey = options.apiKey;
        this.secretKey = options.secretKey;
        this.useTestnet = options.useTestnet || false;
    }

    async getAccountInfo() {
        return { totalWalletBalance: '0.00' };
    }

    async getPositions() {
        return [];
    }

    async newOrder(params) {
        throw new Error('Demo mode - futures trading disabled');
    }
}

module.exports = BinanceFuturesAPI;