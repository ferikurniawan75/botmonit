const EventEmitter = require('events');

class BinanceAPI extends EventEmitter {
    constructor(options = {}) {
        super();
        this.apiKey = options.apiKey;
        this.secretKey = options.secretKey;
        this.useTestnet = options.useTestnet || false;
    }

    async getAccountInfo() {
        // Placeholder implementation
        return { canTrade: false, balances: [] };
    }

    async getSymbolInfo(symbol) {
        return { symbol, status: 'TRADING' };
    }

    async getKlines(symbol, interval, limit) {
        return [];
    }

    async get24hrStats(symbol) {
        return { symbol, priceChangePercent: '0.00' };
    }

    async getOrderBook(symbol) {
        return { bids: [], asks: [] };
    }

    async newOrder(params) {
        throw new Error('Demo mode - trading disabled');
    }
}

module.exports = BinanceAPI;