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
        
        // Initialize Binance API
        this.binance = new Binance().options({
            APIKEY: config.apiKey,
            APISECRET: config.secretKey,
            useServerTime: true,
            test: this.isTestnet,
            verbose: false,
            log: (msg) => logger.binance('API', msg)
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
                free: parseFloat(balance.free),
                locked: parseFloat(balance.locked),
                total: parseFloat(balance.free) + parseFloat(balance.locked)
            } : { free: 0, locked: 0, total: 0 };
        } catch (error) {
            logger.error(`Failed to get ${asset} balance:`, error);
            return { free: 0, locked: 0, total: 0 };
        }
    }

    async getAllTickers() {
        try {
            const tickers = await this.binance.prices();
            logger.binance('All tickers retrieved', { count: Object.keys(tickers).length });
            return tickers;
        } catch (error) {
            logger.error('Failed to get all tickers:', error);
            throw error;
        }
    }

    async get24hrStats(symbol = null) {
        try {
            const stats = await this.binance.prevDay(symbol);
            logger.binance('24hr stats retrieved', { symbol, count: Array.isArray(stats) ? stats.length : 1 });
            return stats;
        } catch (error) {
            logger.error('Failed to get 24hr stats:', error);
            throw error;
        }
    }

    async getKlines(symbol, interval = '5m', limit = 100) {
        try {
            const klines = await this.binance.candlesticks(symbol, interval, null, { limit });
            logger.binance('Klines retrieved', { symbol, interval, count: klines.length });
            return klines.map(k => ({
                openTime: k[0],
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5]),
                closeTime: k[6],
                quoteVolume: parseFloat(k[7]),
                trades: k[8],
                buyBaseVolume: parseFloat(k[9]),
                buyQuoteVolume: parseFloat(k[10])
            }));
        } catch (error) {
            logger.error('Failed to get klines:', error);
            throw error;
        }
    }

    async getOrderBook(symbol, limit = 100) {
        try {
            const orderBook = await this.binance.depth(symbol, limit);
            logger.binance('Order book retrieved', { symbol, bidsCount: orderBook.bids.length });
            return {
                lastUpdateId: orderBook.lastUpdateId,
                bids: orderBook.bids.map(b => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
                asks: orderBook.asks.map(a => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) }))
            };
        } catch (error) {
            logger.error('Failed to get order book:', error);
            throw error;
        }
    }

    async placeOrder(params) {
        try {
            const {
                symbol,
                side,
                type = 'MARKET',
                quantity,
                price,
                timeInForce = 'GTC',
                stopPrice,
                newClientOrderId
            } = params;

            let orderParams = {
                symbol,
                side: side.toUpperCase(),
                type: type.toUpperCase(),
                quantity: parseFloat(quantity)
            };

            if (type.toUpperCase() === 'LIMIT') {
                orderParams.price = parseFloat(price);
                orderParams.timeInForce = timeInForce;
            }

            if (stopPrice) {
                orderParams.stopPrice = parseFloat(stopPrice);
            }

            if (newClientOrderId) {
                orderParams.newClientOrderId = newClientOrderId;
            }

            const order = await this.binance.order(orderParams);
            
            logger.trade('Order placed', {
                orderId: order.orderId,
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                quantity: order.origQty,
                price: order.price,
                status: order.status
            });

            return order;
        } catch (error) {
            logger.error('Failed to place order:', error);
            throw error;
        }
    }

    async cancelOrder(symbol, orderId) {
        try {
            const result = await this.binance.cancel(symbol, orderId);
            logger.trade('Order cancelled', { symbol, orderId, result });
            return result;
        } catch (error) {
            logger.error('Failed to cancel order:', error);
            throw error;
        }
    }

    async getOpenOrders(symbol = null) {
        try {
            const orders = await this.binance.openOrders(symbol);
            logger.binance('Open orders retrieved', { symbol, count: orders.length });
            return orders;
        } catch (error) {
            logger.error('Failed to get open orders:', error);
            throw error;
        }
    }

    async getOrderStatus(symbol, orderId) {
        try {
            const order = await this.binance.orderStatus(symbol, orderId);
            logger.binance('Order status retrieved', { symbol, orderId, status: order.status });
            return order;
        } catch (error) {
            logger.error('Failed to get order status:', error);
            throw error;
        }
    }

    async getAllOrders(symbol, limit = 500) {
        try {
            const orders = await this.binance.allOrders(symbol, { limit });
            logger.binance('All orders retrieved', { symbol, count: orders.length });
            return orders;
        } catch (error) {
            logger.error('Failed to get all orders:', error);
            throw error;
        }
    }

    async getTrades(symbol, limit = 500) {
        try {
            const trades = await this.binance.myTrades(symbol, { limit });
            logger.binance('Trades retrieved', { symbol, count: trades.length });
            return trades;
        } catch (error) {
            logger.error('Failed to get trades:', error);
            throw error;
        }
    }

    // WebSocket Methods
    startTickerStream(symbols, callback) {
        try {
            const symbolsArray = Array.isArray(symbols) ? symbols : [symbols];
            const streamName = `ticker_${symbolsArray.join('_')}`;
            
            if (this.wsConnections.has(streamName)) {
                logger.binance('Ticker stream already exists', { symbols: symbolsArray });
                return;
            }

            const ws = this.binance.websockets.miniTicker(symbolsArray, (ticker) => {
                const formattedTicker = {
                    symbol: ticker.symbol,
                    price: parseFloat(ticker.close),
                    priceChange: parseFloat(ticker.change),
                    priceChangePercent: parseFloat(ticker.percentage),
                    volume: parseFloat(ticker.volume),
                    quoteVolume: parseFloat(ticker.quoteVolume),
                    openPrice: parseFloat(ticker.open),
                    highPrice: parseFloat(ticker.high),
                    lowPrice: parseFloat(ticker.low),
                    timestamp: Date.now()
                };

                this.emit('tickerUpdate', formattedTicker);
                if (callback) callback(formattedTicker);
            });

            this.wsConnections.set(streamName, ws);
            logger.binance('Ticker stream started', { symbols: symbolsArray });
            
            return ws;
        } catch (error) {
            logger.error('Failed to start ticker stream:', error);
            throw error;
        }
    }

    startKlineStream(symbol, interval, callback) {
        try {
            const streamName = `kline_${symbol}_${interval}`;
            
            if (this.wsConnections.has(streamName)) {
                logger.binance('Kline stream already exists', { symbol, interval });
                return;
            }

            const ws = this.binance.websockets.candlesticks(symbol, interval, (candlestick) => {
                const formattedKline = {
                    symbol: candlestick.s,
                    openTime: candlestick.t,
                    closeTime: candlestick.T,
                    open: parseFloat(candlestick.o),
                    high: parseFloat(candlestick.h),
                    low: parseFloat(candlestick.l),
                    close: parseFloat(candlestick.c),
                    volume: parseFloat(candlestick.v),
                    quoteVolume: parseFloat(candlestick.q),
                    trades: candlestick.n,
                    isFinal: candlestick.x
                };

                this.emit('klineUpdate', formattedKline);
                if (callback) callback(formattedKline);
            });

            this.wsConnections.set(streamName, ws);
            logger.binance('Kline stream started', { symbol, interval });
            
            return ws;
        } catch (error) {
            logger.error('Failed to start kline stream:', error);
            throw error;
        }
    }

    startDepthStream(symbol, callback) {
        try {
            const streamName = `depth_${symbol}`;
            
            if (this.wsConnections.has(streamName)) {
                logger.binance('Depth stream already exists', { symbol });
                return;
            }

            const ws = this.binance.websockets.depthCache(symbol, (depth) => {
                const formattedDepth = {
                    symbol: symbol,
                    bids: Object.entries(depth.bids).map(([price, quantity]) => ({
                        price: parseFloat(price),
                        quantity: parseFloat(quantity)
                    })).slice(0, 20), // Top 20 bids
                    asks: Object.entries(depth.asks).map(([price, quantity]) => ({
                        price: parseFloat(price),
                        quantity: parseFloat(quantity)
                    })).slice(0, 20), // Top 20 asks
                    timestamp: Date.now()
                };

                this.emit('depthUpdate', formattedDepth);
                if (callback) callback(formattedDepth);
            });

            this.wsConnections.set(streamName, ws);
            logger.binance('Depth stream started', { symbol });
            
            return ws;
        } catch (error) {
            logger.error('Failed to start depth stream:', error);
            throw error;
        }
    }

    startUserDataStream(callback) {
        try {
            if (this.wsConnections.has('userData')) {
                logger.binance('User data stream already exists');
                return;
            }

            const ws = this.binance.websockets.userData(
                // Balance update
                (data) => {
                    logger.binance('Balance update', data);
                    this.emit('balanceUpdate', data);
                    if (callback) callback('balance', data);
                },
                // Execution report
                (data) => {
                    logger.trade('Execution report', {
                        symbol: data.s,
                        orderId: data.i,
                        side: data.S,
                        orderType: data.o,
                        orderStatus: data.X,
                        executedQty: data.z,
                        price: data.p
                    });
                    this.emit('executionReport', data);
                    if (callback) callback('execution', data);
                }
            );

            this.wsConnections.set('userData', ws);
            logger.binance('User data stream started');
            
            return ws;
        } catch (error) {
            logger.error('Failed to start user data stream:', error);
            throw error;
        }
    }

    stopStream(streamName) {
        try {
            if (this.wsConnections.has(streamName)) {
                const ws = this.wsConnections.get(streamName);
                this.binance.websockets.terminate(ws);
                this.wsConnections.delete(streamName);
                logger.binance('Stream stopped', { streamName });
                return true;
            }
            return false;
        } catch (error) {
            logger.error('Failed to stop stream:', error);
            return false;
        }
    }

    stopAllStreams() {
        try {
            for (const [streamName, ws] of this.wsConnections) {
                this.binance.websockets.terminate(ws);
            }
            this.wsConnections.clear();
            logger.binance('All streams stopped');
        } catch (error) {
            logger.error('Failed to stop all streams:', error);
        }
    }

    // Market Analysis Helpers
    async getTopVolumeCoins(limit = 50) {
        try {
            const stats = await this.get24hrStats();
            const filtered = stats
                .filter(s => s.symbol.endsWith('USDT'))
                .filter(s => parseFloat(s.quoteVolume) > 1000000) // Min 1M USDT volume
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
                .filter(s => parseFloat(s.quoteVolume) > 500000) // Min 500K USDT volume
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
                .filter(s => parseFloat(s.quoteVolume) > 100000); // Min 100K USDT volume

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

    // Utility Methods
    getTickerFromCache(symbol) {
        return this.tickerCache.get(symbol);
    }

    getAllTickersFromCache() {
        return Object.fromEntries(this.tickerCache);
    }

    isTickerCacheStale(symbol, maxAge = 60000) { // 1 minute default
        const lastUpdate = this.lastPriceUpdate.get(symbol);
        return !lastUpdate || (Date.now() - lastUpdate) > maxAge;
    }

    async getExchangeInfo() {
        try {
            const info = await this.binance.exchangeInfo();
            logger.binance('Exchange info retrieved', { 
                symbols: info.symbols.length,
                rateLimits: info.rateLimits.length 
            });
            return info;
        } catch (error) {
            logger.error('Failed to get exchange info:', error);
            throw error;
        }
    }

    // Cleanup
    cleanup() {
        this.stopAllStreams();
        this.tickerCache.clear();
        this.lastPriceUpdate.clear();
        this.removeAllListeners();
        logger.binance('Cleanup completed');
    }
}

module.exports = BinanceAPI;