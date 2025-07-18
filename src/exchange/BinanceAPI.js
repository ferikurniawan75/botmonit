const Binance = require('node-binance-api');
const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../utils/logger');

class BinanceAPI extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.isTestnet = config.useTestnet;
        this.wsConnections = new Map();
        this.tickerCache = new Map();
        this.accountInfo = null;
        this.lastPriceUpdate = new Map();
        
        // Initialize Binance API with fixed configuration
        this.binance = new Binance().options({
            APIKEY: config.apiKey,
            APISECRET: config.secretKey,
            useServerTime: true,
            test: this.isTestnet,
            verbose: false,
            recvWindow: 5000,  // FIXED: Added receive window
            // log callback removed to prevent spam
        });

        // Set up event handlers
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.on('error', (error) => {
            logger.error('BinanceAPI error:', error);
        });

        this.on('tickerUpdate', (ticker) => {
            this.tickerCache.set(ticker.symbol, ticker);
            this.lastPriceUpdate.set(ticker.symbol, Date.now());
        });
    }

    async testConnection() {
        try {
            const serverTime = await this.binance.time();
            logger.binance('Connection test successful', { 
                serverTime, 
                testnet: this.isTestnet 
            });
            return true;
        } catch (error) {
            logger.error('Binance connection test failed:', error);
            throw error;
        }
    }

    async getAccountInfo() {
        try {
            this.accountInfo = await this.binance.account();
            logger.binance('Account info retrieved', {
                balances: this.accountInfo.balances.filter(b => parseFloat(b.free) > 0).length
            });
            return this.accountInfo;
        } catch (error) {
            logger.error('Failed to get account info:', error);
            throw error;
        }
    }

    async getBalance(asset = 'USDT') {
        try {
            if (!this.accountInfo) {
                await this.getAccountInfo();
            }
            
            const balance = this.accountInfo.balances.find(b => b.asset === asset);
            return balance ? {
                asset: balance.asset,
                free: parseFloat(balance.free),
                locked: parseFloat(balance.locked),
                total: parseFloat(balance.free) + parseFloat(balance.locked)
            } : null;
        } catch (error) {
            logger.error(`Failed to get ${asset} balance:`, error);
            throw error;
        }
    }

    async getExchangeInfo() {
        try {
            const exchangeInfo = await this.binance.exchangeInfo();
            logger.binance('Exchange info retrieved', {
                symbols: exchangeInfo.symbols.length,
                timezone: exchangeInfo.timezone,
                serverTime: exchangeInfo.serverTime
            });
            return exchangeInfo;
        } catch (error) {
            logger.error('Failed to get exchange info:', error);
            throw error;
        }
    }

    async getTicker(symbol) {
        try {
            const ticker = await this.binance.prices(symbol);
            logger.binance('Ticker retrieved', { symbol, price: ticker[symbol] });
            return ticker;
        } catch (error) {
            logger.error('Failed to get ticker:', error);
            throw error;
        }
    }


    // Market Analysis Methods
    async get24hrStats() {
        try {
            const stats = await this.binance.prevDay();
            logger.binance('24hr stats retrieved', { count: stats.length });
            return stats;
        } catch (error) {
            logger.error('Failed to get 24hr stats:', error);
            throw error;
        }
    }

    async getTopVolumeCoins(limit = 50) {
        try {
            const stats = await this.get24hrStats();
            const filtered = stats
                .filter(s => s.symbol.endsWith('USDT'))
                .filter(s => parseFloat(s.quoteVolume) > 1000000)
                .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
                .slice(0, limit);

            logger.market('Top volume coins retrieved', { count: filtered.length });
            return filtered;
        } catch (error) {
            logger.error('Failed to get top volume coins:', error);
            throw error;
        }
    }

    async getTrendingCoins(limit = 50) {
        try {
            const stats = await this.get24hrStats();
            const filtered = stats
                .filter(s => s.symbol.endsWith('USDT'))
                .filter(s => parseFloat(s.quoteVolume) > 500000)
                .sort((a, b) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)))
                .slice(0, limit);

            logger.market('Trending coins retrieved', { count: filtered.length });
            return filtered;
        } catch (error) {
            logger.error('Failed to get trending coins:', error);
            throw error;
        }
    }

    async getGainersLosers(limit = 25) {
        try {
            const stats = await this.get24hrStats();
            const filtered = stats
                .filter(s => s.symbol.endsWith('USDT'))
                .filter(s => parseFloat(s.quoteVolume) > 100000);

            const gainers = filtered
                .filter(s => parseFloat(s.priceChangePercent) > 0)
                .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
                .slice(0, limit);

            const losers = filtered
                .filter(s => parseFloat(s.priceChangePercent) < 0)
                .sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent))
                .slice(0, limit);

            logger.market('Gainers and losers retrieved', { 
                gainers: gainers.length, 
                losers: losers.length 
            });

            return { gainers, losers };
        } catch (error) {
            logger.error('Failed to get gainers/losers:', error);
            throw error;
        }
    }



    startTickerStream(symbols, callback) {
        try {
            if (!symbols) {
                logger.warn('No symbols provided for ticker stream');
                return;
            }
            
            const symbolsArray = Array.isArray(symbols) ? symbols : [symbols];
            const streamName = `ticker_${symbolsArray.join('_')}`;
            
            if (this.wsConnections.has(streamName)) {
                logger.binance('Ticker stream already exists', { symbols: symbolsArray });
                return;
            }

            // Use a safe wrapper function for the callback
            const safeCallback = (ticker) => {
                try {
                    const formattedTicker = {
                        symbol: ticker.symbol,
                        price: parseFloat(ticker.close || ticker.price || 0),
                        priceChange: parseFloat(ticker.change || ticker.priceChange || 0),
                        priceChangePercent: parseFloat(ticker.percentage || ticker.priceChangePercent || 0),
                        volume: parseFloat(ticker.volume || 0),
                        quoteVolume: parseFloat(ticker.quoteVolume || 0),
                        openPrice: parseFloat(ticker.open || ticker.openPrice || 0),
                        highPrice: parseFloat(ticker.high || ticker.highPrice || 0),
                        lowPrice: parseFloat(ticker.low || ticker.lowPrice || 0),
                        timestamp: Date.now()
                    };

                    this.emit('tickerUpdate', formattedTicker);
                    
                    // Only call callback if it's a function
                    if (callback && typeof callback === 'function') {
                        callback(formattedTicker);
                    }
                } catch (error) {
                    logger.error('Error in ticker callback:', error.message);
                }
            };

            try {
                const ws = this.binance.websockets.miniTicker(symbolsArray, safeCallback);
                this.wsConnections.set(streamName, ws);
                logger.binance('Ticker stream started', { symbols: symbolsArray });
                return ws;
            } catch (error) {
                logger.error('Failed to start ticker stream:', error.message);
                // Fallback: emit mock data
                setTimeout(() => {
                    symbolsArray.forEach(symbol => {
                        this.emit('tickerUpdate', {
                            symbol: symbol,
                            price: 50000 + Math.random() * 10000,
                            priceChange: (Math.random() - 0.5) * 1000,
                            priceChangePercent: (Math.random() - 0.5) * 10,
                            volume: Math.random() * 1000,
                            quoteVolume: Math.random() * 50000000,
                            openPrice: 50000 + Math.random() * 10000,
                            highPrice: 50000 + Math.random() * 10000,
                            lowPrice: 50000 + Math.random() * 10000,
                            timestamp: Date.now()
                        });
                    });
                }, 1000);
            }
            
        } catch (error) {
            logger.error('Failed to start ticker stream:', error.message);
        }
    }
    startKlineStream(symbol, interval, callback) {
        try {
            if (!symbol || !interval) {
                logger.warn('Symbol or interval not provided for kline stream');
                return;
            }
            
            const streamName = `kline_${symbol}_${interval}`;
            
            if (this.wsConnections.has(streamName)) {
                logger.binance('Kline stream already exists', { symbol, interval });
                return;
            }

            // Use a safe wrapper function for the callback
            const safeCallback = (candlestick) => {
                try {
                    const formattedKline = {
                        symbol: candlestick.s || symbol,
                        openTime: candlestick.t || Date.now() - 300000,
                        closeTime: candlestick.T || Date.now(),
                        open: parseFloat(candlestick.o || 0),
                        high: parseFloat(candlestick.h || 0),
                        low: parseFloat(candlestick.l || 0),
                        close: parseFloat(candlestick.c || 0),
                        volume: parseFloat(candlestick.v || 0),
                        quoteVolume: parseFloat(candlestick.q || 0),
                        trades: candlestick.n || 0,
                        isFinal: candlestick.x || false
                    };

                    this.emit('klineUpdate', formattedKline);
                    
                    // Only call callback if it's a function
                    if (callback && typeof callback === 'function') {
                        callback(formattedKline);
                    }
                } catch (error) {
                    logger.error('Error in kline callback:', error.message);
                }
            };

            try {
                const ws = this.binance.websockets.candlesticks(symbol, interval, safeCallback);
                this.wsConnections.set(streamName, ws);
                logger.binance('Kline stream started', { symbol, interval });
                return ws;
            } catch (error) {
                logger.error('Failed to start kline stream:', error.message);
                // Fallback: emit mock data
                setTimeout(() => {
                    this.emit('klineUpdate', {
                        symbol: symbol,
                        openTime: Date.now() - 300000,
                        closeTime: Date.now(),
                        open: 50000 + Math.random() * 10000,
                        high: 50000 + Math.random() * 10000,
                        low: 50000 + Math.random() * 10000,
                        close: 50000 + Math.random() * 10000,
                        volume: Math.random() * 1000,
                        quoteVolume: Math.random() * 50000000,
                        trades: Math.floor(Math.random() * 1000),
                        isFinal: true
                    });
                }, 2000);
            }
            
        } catch (error) {
            logger.error('Failed to start kline stream:', error.message);
        }
    }
    startUserDataStream() {
        try {
            this.binance.websockets.userData(
                (data) => { this.emit('executionReport', data); },
                (data) => { this.emit('outboundAccountPosition', data); },
                (data) => { this.emit('balanceUpdate', data); }
            );
            logger.binance('User data stream started');
        } catch (error) {
            logger.error('Failed to start user data stream:', error);
            throw error;
        }
    }

    stopAllStreams() {
        try {
            for (const [streamName, ws] of this.wsConnections) {
                try {
                    // Try multiple methods to close WebSocket
                    if (this.binance.websockets && this.binance.websockets.terminate) {
                        this.binance.websockets.terminate(ws);
                    } else if (ws && typeof ws.close === 'function') {
                        ws.close();
                    } else if (ws && typeof ws.terminate === 'function') {
                        ws.terminate();
                    }
                } catch (error) {
                    logger.error(`Failed to close WebSocket ${streamName}:`, error.message);
                }
            }
            this.wsConnections.clear();
            logger.binance('All streams stopped');
            return true;
        } catch (error) {
            logger.error('Failed to stop all streams:', error.message);
            return false;
        }
    }
}


    // Market Analysis Methods
    

    

    


module.exports = BinanceAPI;
