const express = require('express');

class WebServer {
    constructor(botInstance) {
        this.bot = botInstance;
        this.app = express();
        this.setupRoutes();
    }

    setupRoutes() {
        // Status endpoint
        this.app.get('/api/status', (req, res) => {
            res.json({
                isRunning: this.bot.isRunning,
                activeTrades: this.bot.activeTrades ? this.bot.activeTrades.size : 0,
                timestamp: new Date().toISOString()
            });
        });

        // Trades endpoint
        this.app.get('/api/trades', (req, res) => {
            const trades = this.bot.tradingBot ? this.bot.tradingBot.getActiveTrades() : [];
            res.json(trades);
        });

        // Market data endpoint
        this.app.get('/api/market-data', (req, res) => {
            const marketData = {};
            if (this.bot.marketData) {
                for (const [symbol, data] of this.bot.marketData.entries()) {
                    marketData[symbol] = data;
                }
            }
            res.json(marketData);
        });
    }

    start(port = 3000) {
        this.server = this.app.listen(port, () => {
            console.log(`Web server started on port ${port}`);
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            console.log('Web server stopped');
        }
    }
}

module.exports = WebServer;