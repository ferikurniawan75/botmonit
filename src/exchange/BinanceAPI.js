const Binance = require('node-binance-api');
const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../utils/logger');

class BinanceAPI extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Handle both direct config object and individual parameters
        if (options.apiKey && options.secretKey) {
            // New style: { apiKey, secretKey, useTestnet }
            this.config = {
                apiKey: options.apiKey,
                secretKey: options.secretKey,
                useTestnet: options.useTestnet || false
            };
        } else {
            // Old style: passing config object with nested properties
            this.config = options || {};
        }
        
        this.isTestnet = this.config.useTestnet || false;
        this.wsConnections = new Map();
        this.tickerCache = new Map();
        this.accountInfo = null;
        this.lastPriceUpdate = new Map();
        
        // Validate required configuration
        if (!this.config.apiKey) {
            throw new Error('BinanceAPI: apiKey is required');
        }
        
        if (!this.config.secretKey) {
            throw new Error('BinanceAPI: secretKey is required');
        }
        
        // Initialize Binance API
        this.binance = new Binance().options({
            APIKEY: this.config.apiKey,
            APISECRET: this.config.secretKey,
            useServerTime: true,
            test: this.isTestnet,
            verbose: false,
            log: (msg) => logger.binance ? logger.binance('API', msg) : console.log('BINANCE:', msg)
        });

        // Set up event handlers
        this.setupEventHandlers();
        
        logger.info(`BinanceAPI initialized (testnet: ${this.isTestnet})`);
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
            logger.info('Binance connection test successful', { 
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
            logger.info('Account info retrieved', {
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

    async getTicker(symbol) {
        try {
            const ticker = await this.binance.prices(symbol);
            return {
                symbol,
                price: parseFloat(ticker[symbol]),
                timestamp: Date.now()
            };
        } catch (error) {
            logger.error(`Failed to get ticker for ${symbol}:`, error);
            throw error;
        }
    }

    async getKlines(symbol, interval = '5m', limit = 100) {
        try {
            const klines = await this.binance.candlesticks(symbol, interval, null, { limit });
            return klines.map(kline => ({
                openTime: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: kline[6]
            }));
        } catch (error) {
            logger.error(`Failed to get klines for ${symbol}:`, error);
            throw error;
        }
    }

    async placeOrder(orderParams) {
        try {
            const order = await this.binance.order(orderParams);
            logger.info('Order placed successfully', {
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                quantity: order.origQty,
                orderId: order.orderId
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
            logger.info('Order cancelled', { symbol, orderId });
            return result;
        } catch (error) {
            logger.error('Failed to cancel order:', error);
            throw error;
        }
    }

    async getOpenOrders(symbol) {
        try {
            const orders = await this.binance.openOrders(symbol);
            return orders;
        } catch (error) {
            logger.error('Failed to get open orders:', error);
            throw error;
        }
    }

    // WebSocket methods
    startTickerStream(symbols) {
        try {
            if (Array.isArray(symbols)) {
                for (const symbol of symbols) {
                    this.startSingleTickerStream(symbol);
                }
            } else {
                this.startSingleTickerStream(symbols);
            }
        } catch (error) {
            logger.error('Failed to start ticker stream:', error);
        }
    }

    startSingleTickerStream(symbol) {
        try {
            const streamName = `${symbol.toLowerCase()}@ticker`;
            
            if (this.wsConnections.has(streamName)) {
                logger.warn(`Ticker stream for ${symbol} already active`);
                return;
            }

            this.binance.websockets.prevDay(symbol, (error, response) => {
                if (error) {
                    logger.error(`Ticker stream error for ${symbol}:`, error);
                    return;
                }
                
                this.emit('tickerUpdate', {
                    symbol: response.symbol,
                    price: parseFloat(response.curDayClose),
                    change: parseFloat(response.priceChange),
                    changePercent: parseFloat(response.priceChangePercent),
                    volume: parseFloat(response.volume),
                    timestamp: Date.now()
                });
            });

            this.wsConnections.set(streamName, true);
            logger.info(`Started ticker stream for ${symbol}`);
            
        } catch (error) {
            logger.error(`Failed to start ticker stream for ${symbol}:`, error);
        }
    }

    startKlineStream(symbol, interval = '5m') {
        try {
            const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
            
            if (this.wsConnections.has(streamName)) {
                logger.warn(`Kline stream for ${symbol} ${interval} already active`);
                return;
            }

            this.binance.websockets.candlesticks(symbol, interval, (error, response) => {
                if (error) {
                    logger.error(`Kline stream error for ${symbol}:`, error);
                    return;
                }
                
                const kline = response.k;
                this.emit('klineUpdate', {
                    symbol: kline.s,
                    interval: kline.i,
                    openTime: kline.t,
                    closeTime: kline.T,
                    open: parseFloat(kline.o),
                    high: parseFloat(kline.h),
                    low: parseFloat(kline.l),
                    close: parseFloat(kline.c),
                    volume: parseFloat(kline.v),
                    isClosed: kline.x,
                    timestamp: Date.now()
                });
            });

            this.wsConnections.set(streamName, true);
            logger.info(`Started kline stream for ${symbol} ${interval}`);
            
        } catch (error) {
            logger.error(`Failed to start kline stream for ${symbol}:`, error);
        }
    }

    stopAllStreams() {
        try {
            this.binance.websockets.terminate();
            this.wsConnections.clear();
            logger.info('All WebSocket streams terminated');
        } catch (error) {
            logger.error('Failed to stop streams:', error);
        }
    }

    getMarketData(symbol) {
        return this.tickerCache.get(symbol);
    }

    isConnected() {
        return this.wsConnections.size > 0;
    }

    getConnectionCount() {
        return this.wsConnections.size;
    }

    getStatus() {
        return {
            isTestnet: this.isTestnet,
            connections: this.wsConnections.size,
            cachedTickers: this.tickerCache.size,
            lastUpdate: Math.max(...Array.from(this.lastPriceUpdate.values())) || 0
        };
    }
}

module.exports = BinanceAPI;
