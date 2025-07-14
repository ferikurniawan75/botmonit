const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');

class BinanceFuturesAPI {
    constructor(options = {}) {
        // Handle both direct config object and individual parameters
        if (options.apiKey && options.secretKey) {
            // New style: { apiKey, secretKey, useTestnet }
            this.apiKey = options.apiKey;
            this.apiSecret = options.secretKey;
            this.useTestnet = options.useTestnet || false;
        } else {
            // Old style: passing config object with nested properties
            this.apiKey = options.apiKey;
            this.apiSecret = options.secretKey || options.apiSecret;
            this.useTestnet = options.useTestnet || false;
        }
        
        // Validate required configuration
        if (!this.apiKey) {
            throw new Error('BinanceFuturesAPI: apiKey is required');
        }
        
        if (!this.apiSecret) {
            throw new Error('BinanceFuturesAPI: apiSecret is required');
        }
        
        this.baseURL = this.useTestnet ? 
            'https://testnet.binancefuture.com' : 
            'https://fapi.binance.com';
        
        this.axiosInstance = axios.create({
            baseURL: this.baseURL,
            timeout: 10000,
            headers: {
                'X-MBX-APIKEY': this.apiKey
            }
        });
        
        logger.info(`BinanceFuturesAPI initialized (testnet: ${this.useTestnet})`);
    }

    // Generate signature for authenticated requests
    generateSignature(queryString) {
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(queryString)
            .digest('hex');
    }

    // Create query string with signature
    createAuthQuery(params = {}) {
        const timestamp = Date.now();
        const queryParams = { ...params, timestamp };
        
        const queryString = Object.keys(queryParams)
            .map(key => `${key}=${encodeURIComponent(queryParams[key])}`)
            .join('&');
            
        const signature = this.generateSignature(queryString);
        
        return `${queryString}&signature=${signature}`;
    }

    // Test connectivity
    async testConnectivity() {
        try {
            const response = await this.axiosInstance.get('/fapi/v1/ping');
            logger.info('Futures API connectivity test successful');
            return response.status === 200;
        } catch (error) {
            logger.error('Futures API connectivity test failed:', error.message);
            throw error;
        }
    }

    // Get server time
    async getServerTime() {
        try {
            const response = await this.axiosInstance.get('/fapi/v1/time');
            return response.data.serverTime;
        } catch (error) {
            logger.error('Failed to get server time:', error.message);
            throw error;
        }
    }

    // Get account information
    async getAccountInfo() {
        try {
            const queryString = this.createAuthQuery();
            const response = await this.axiosInstance.get(`/fapi/v2/account?${queryString}`);
            
            logger.info('Account info retrieved', {
                totalWalletBalance: response.data.totalWalletBalance,
                availableBalance: response.data.availableBalance
            });
            
            return response.data;
        } catch (error) {
            logger.error('Failed to get account info:', error.message);
            throw error;
        }
    }

    // Get balance for specific asset
    async getBalance(asset = 'USDT') {
        try {
            const account = await this.getAccountInfo();
            const balance = account.assets.find(a => a.asset === asset);
            
            return balance ? {
                asset: balance.asset,
                walletBalance: parseFloat(balance.walletBalance),
                unrealizedProfit: parseFloat(balance.unrealizedProfit),
                marginBalance: parseFloat(balance.marginBalance),
                maintMargin: parseFloat(balance.maintMargin),
                initialMargin: parseFloat(balance.initialMargin),
                positionInitialMargin: parseFloat(balance.positionInitialMargin),
                openOrderInitialMargin: parseFloat(balance.openOrderInitialMargin),
                crossWalletBalance: parseFloat(balance.crossWalletBalance),
                crossUnPnl: parseFloat(balance.crossUnPnl),
                availableBalance: parseFloat(balance.availableBalance),
                maxWithdrawAmount: parseFloat(balance.maxWithdrawAmount)
            } : null;
        } catch (error) {
            logger.error(`Failed to get ${asset} balance:`, error.message);
            throw error;
        }
    }

    // Get current positions
    async getPositions() {
        try {
            const queryString = this.createAuthQuery();
            const response = await this.axiosInstance.get(`/fapi/v2/positionRisk?${queryString}`);
            
            // Filter only positions with non-zero amounts
            const activePositions = response.data.filter(position => 
                parseFloat(position.positionAmt) !== 0
            );
            
            logger.info('Positions retrieved', { 
                total: response.data.length,
                active: activePositions.length 
            });
            
            return response.data;
        } catch (error) {
            logger.error('Failed to get positions:', error.message);
            throw error;
        }
    }

    // Set leverage for symbol
    async setLeverage(symbol, leverage) {
        try {
            const params = { symbol, leverage };
            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.post(`/fapi/v1/leverage?${queryString}`);
            
            logger.info('Leverage set', {
                symbol,
                leverage: response.data.leverage,
                maxNotionalValue: response.data.maxNotionalValue
            });
            
            return response.data;
        } catch (error) {
            logger.error(`Failed to set leverage for ${symbol}:`, error.message);
            throw error;
        }
    }

    // Set margin type (ISOLATED or CROSSED)
    async setMarginType(symbol, marginType) {
        try {
            const params = { symbol, marginType };
            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.post(`/fapi/v1/marginType?${queryString}`);
            
            logger.info('Margin type set', { symbol, marginType });
            return response.data;
        } catch (error) {
            // Margin type might already be set, check if it's just a warning
            if (error.response?.data?.code === -4046) {
                logger.info('Margin type already set', { symbol, marginType });
                return { code: -4046, msg: 'No need to change margin type.' };
            }
            logger.error(`Failed to set margin type for ${symbol}:`, error.message);
            throw error;
        }
    }

    // Place futures order
    async placeOrder(orderParams) {
        try {
            const {
                symbol,
                side,           // BUY or SELL
                type,           // MARKET, LIMIT, STOP, TAKE_PROFIT, etc.
                quantity,
                price,          // Required for LIMIT orders
                stopPrice,      // Required for STOP orders
                timeInForce,    // GTC, IOC, FOK
                reduceOnly,     // true or false
                newClientOrderId,
                closePosition,  // true or false
                activationPrice,
                callbackRate,
                workingType,
                priceProtect
            } = orderParams;

            const params = {
                symbol,
                side,
                type,
                quantity
            };

            // Add optional parameters
            if (price) params.price = price;
            if (stopPrice) params.stopPrice = stopPrice;
            if (timeInForce) params.timeInForce = timeInForce;
            if (reduceOnly !== undefined) params.reduceOnly = reduceOnly;
            if (newClientOrderId) params.newClientOrderId = newClientOrderId;
            if (closePosition !== undefined) params.closePosition = closePosition;
            if (activationPrice) params.activationPrice = activationPrice;
            if (callbackRate) params.callbackRate = callbackRate;
            if (workingType) params.workingType = workingType;
            if (priceProtect !== undefined) params.priceProtect = priceProtect;

            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.post(`/fapi/v1/order?${queryString}`);
            
            logger.info('Futures order placed', {
                orderId: response.data.orderId,
                symbol: response.data.symbol,
                side: response.data.side,
                type: response.data.type,
                quantity: response.data.origQty,
                status: response.data.status
            });
            
            return response.data;
        } catch (error) {
            logger.error('Failed to place futures order:', error.response?.data || error.message);
            throw error;
        }
    }

    // Cancel futures order
    async cancelOrder(symbol, orderId) {
        try {
            const params = { symbol, orderId };
            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.delete(`/fapi/v1/order?${queryString}`);
            
            logger.info('Futures order cancelled', {
                orderId: response.data.orderId,
                symbol: response.data.symbol,
                status: response.data.status
            });
            
            return response.data;
        } catch (error) {
            logger.error('Failed to cancel futures order:', error.message);
            throw error;
        }
    }

    // Cancel all open orders for a symbol
    async cancelAllOpenOrders(symbol) {
        try {
            const params = { symbol };
            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.delete(`/fapi/v1/allOpenOrders?${queryString}`);
            
            logger.info('All open orders cancelled', { symbol, count: response.data.length });
            return response.data;
        } catch (error) {
            logger.error(`Failed to cancel all orders for ${symbol}:`, error.message);
            throw error;
        }
    }

    // Get open orders
    async getOpenOrders(symbol = null) {
        try {
            const params = symbol ? { symbol } : {};
            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.get(`/fapi/v1/openOrders?${queryString}`);
            
            return response.data;
        } catch (error) {
            logger.error('Failed to get open orders:', error.message);
            throw error;
        }
    }

    // Get order history
    async getOrderHistory(symbol, limit = 500) {
        try {
            const params = { symbol, limit };
            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.get(`/fapi/v1/allOrders?${queryString}`);
            
            return response.data;
        } catch (error) {
            logger.error('Failed to get order history:', error.message);
            throw error;
        }
    }

    // Get trade history
    async getTradeHistory(symbol, limit = 500) {
        try {
            const params = { symbol, limit };
            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.get(`/fapi/v1/userTrades?${queryString}`);
            
            return response.data;
        } catch (error) {
            logger.error('Failed to get trade history:', error.message);
            throw error;
        }
    }

    // Get exchange info
    async getExchangeInfo() {
        try {
            const response = await this.axiosInstance.get('/fapi/v1/exchangeInfo');
            return response.data;
        } catch (error) {
            logger.error('Failed to get exchange info:', error.message);
            throw error;
        }
    }

    // Get symbol price ticker
    async getSymbolTicker(symbol) {
        try {
            const params = symbol ? { symbol } : {};
            const response = await this.axiosInstance.get('/fapi/v1/ticker/price', { params });
            return response.data;
        } catch (error) {
            logger.error('Failed to get symbol ticker:', error.message);
            throw error;
        }
    }

    // Get 24hr ticker statistics
    async get24hrTicker(symbol) {
        try {
            const params = symbol ? { symbol } : {};
            const response = await this.axiosInstance.get('/fapi/v1/ticker/24hr', { params });
            return response.data;
        } catch (error) {
            logger.error('Failed to get 24hr ticker:', error.message);
            throw error;
        }
    }

    // Get kline/candlestick data
    async getKlines(symbol, interval, startTime = null, endTime = null, limit = 500) {
        try {
            const params = { symbol, interval, limit };
            if (startTime) params.startTime = startTime;
            if (endTime) params.endTime = endTime;
            
            const response = await this.axiosInstance.get('/fapi/v1/klines', { params });
            
            return response.data.map(kline => ({
                openTime: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: kline[6],
                quoteVolume: parseFloat(kline[7]),
                trades: kline[8],
                takerBuyBaseVolume: parseFloat(kline[9]),
                takerBuyQuoteVolume: parseFloat(kline[10])
            }));
        } catch (error) {
            logger.error('Failed to get klines:', error.message);
            throw error;
        }
    }

    // Get status info
    getStatus() {
        return {
            baseURL: this.baseURL,
            useTestnet: this.useTestnet,
            hasApiKey: !!this.apiKey,
            hasApiSecret: !!this.apiSecret
        };
    }
}

module.exports = BinanceFuturesAPI;
