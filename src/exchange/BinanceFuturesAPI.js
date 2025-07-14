const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');

class BinanceFuturesAPI {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.apiSecret = config.secretKey;
        this.baseURL = config.useTestnet ? 
            'https://testnet.binancefuture.com' : 
            'https://fapi.binance.com';
        
        this.axiosInstance = axios.create({
            baseURL: this.baseURL,
            timeout: 10000,
            headers: {
                'X-MBX-APIKEY': this.apiKey
            }
        });
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
            logger.binance('Futures API connectivity test successful');
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
    async getAccount() {
        try {
            const queryString = this.createAuthQuery();
            const response = await this.axiosInstance.get(`/fapi/v2/account?${queryString}`);
            
            logger.binance('Account info retrieved', {
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
            const account = await this.getAccount();
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

    // Get positions for specific symbol or all positions
    async getPositions(symbol = null) {
        try {
            const params = symbol ? { symbol } : {};
            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.get(`/fapi/v2/positionRisk?${queryString}`);
            
            // Filter out positions with zero size
            const activePositions = response.data.filter(pos => 
                Math.abs(parseFloat(pos.positionAmt)) > 0
            );
            
            logger.binance('Positions retrieved', {
                symbol,
                activePositions: activePositions.length,
                totalPositions: response.data.length
            });
            
            return symbol ? activePositions : response.data;
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
            
            logger.binance('Leverage set', {
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
            
            logger.binance('Margin type set', { symbol, marginType });
            return response.data;
        } catch (error) {
            // Margin type might already be set, check if it's just a warning
            if (error.response?.data?.code === -4046) {
                logger.binance('Margin type already set', { symbol, marginType });
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
                price,
                stopPrice,
                positionSide,   // BOTH, LONG, SHORT (for hedge mode)
                timeInForce,    // GTC, IOC, FOK
                reduceOnly,     // true/false
                newClientOrderId,
                closePosition,
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
            if (positionSide) params.positionSide = positionSide;
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

            logger.trade('Futures order placed', {
                orderId: response.data.orderId,
                symbol: response.data.symbol,
                side: response.data.side,
                type: response.data.type,
                origQty: response.data.origQty,
                price: response.data.price,
                status: response.data.status,
                positionSide: response.data.positionSide
            });

            return response.data;
        } catch (error) {
            logger.error('Failed to place futures order:', error.response?.data || error.message);
            throw error;
        }
    }

    // Cancel futures order
    async cancelOrder(symbol, orderId, origClientOrderId = null) {
        try {
            const params = { symbol };
            if (orderId) params.orderId = orderId;
            if (origClientOrderId) params.origClientOrderId = origClientOrderId;

            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.delete(`/fapi/v1/order?${queryString}`);

            logger.trade('Futures order cancelled', {
                orderId: response.data.orderId,
                symbol: response.data.symbol,
                status: response.data.status
            });

            return response.data;
        } catch (error) {
            logger.error('Failed to cancel futures order:', error.response?.data || error.message);
            throw error;
        }
    }

    // Cancel all open orders for symbol
    async cancelAllOrders(symbol) {
        try {
            const params = { symbol };
            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.delete(`/fapi/v1/allOpenOrders?${queryString}`);

            logger.trade('All futures orders cancelled', {
                symbol,
                cancelledOrders: response.data.length
            });

            return response.data;
        } catch (error) {
            logger.error('Failed to cancel all futures orders:', error.response?.data || error.message);
            throw error;
        }
    }

    // Get order status
    async getOrder(symbol, orderId, origClientOrderId = null) {
        try {
            const params = { symbol };
            if (orderId) params.orderId = orderId;
            if (origClientOrderId) params.origClientOrderId = origClientOrderId;

            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.get(`/fapi/v1/order?${queryString}`);

            return response.data;
        } catch (error) {
            logger.error('Failed to get futures order:', error.response?.data || error.message);
            throw error;
        }
    }

    // Get all orders for symbol
    async getAllOrders(symbol, orderId = null, startTime = null, endTime = null, limit = 500) {
        try {
            const params = { symbol, limit };
            if (orderId) params.orderId = orderId;
            if (startTime) params.startTime = startTime;
            if (endTime) params.endTime = endTime;

            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.get(`/fapi/v1/allOrders?${queryString}`);

            logger.binance('All futures orders retrieved', {
                symbol,
                count: response.data.length
            });

            return response.data;
        } catch (error) {
            logger.error('Failed to get all futures orders:', error.response?.data || error.message);
            throw error;
        }
    }

    // Get open orders
    async getOpenOrders(symbol = null) {
        try {
            const params = symbol ? { symbol } : {};
            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.get(`/fapi/v1/openOrders?${queryString}`);

            logger.binance('Open futures orders retrieved', {
                symbol,
                count: response.data.length
            });

            return response.data;
        } catch (error) {
            logger.error('Failed to get open futures orders:', error.response?.data || error.message);
            throw error;
        }
    }

    // Get symbol information
    async getSymbolInfo(symbol) {
        try {
            const response = await this.axiosInstance.get('/fapi/v1/exchangeInfo');
            const symbolInfo = response.data.symbols.find(s => s.symbol === symbol);

            if (symbolInfo) {
                // Extract useful trading info
                const priceFilter = symbolInfo.filters.find(f => f.filterType === 'PRICE_FILTER');
                const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
                const minNotionalFilter = symbolInfo.filters.find(f => f.filterType === 'MIN_NOTIONAL');

                return {
                    symbol: symbolInfo.symbol,
                    status: symbolInfo.status,
                    baseAsset: symbolInfo.baseAsset,
                    quoteAsset: symbolInfo.quoteAsset,
                    pricePrecision: symbolInfo.pricePrecision,
                    quantityPrecision: symbolInfo.quantityPrecision,
                    baseAssetPrecision: symbolInfo.baseAssetPrecision,
                    quotePrecision: symbolInfo.quotePrecision,
                    minPrice: priceFilter ? parseFloat(priceFilter.minPrice) : 0,
                    maxPrice: priceFilter ? parseFloat(priceFilter.maxPrice) : 0,
                    tickSize: priceFilter ? parseFloat(priceFilter.tickSize) : 0,
                    minQty: lotSizeFilter ? parseFloat(lotSizeFilter.minQty) : 0,
                    maxQty: lotSizeFilter ? parseFloat(lotSizeFilter.maxQty) : 0,
                    stepSize: lotSizeFilter ? parseFloat(lotSizeFilter.stepSize) : 0,
                    minNotional: minNotionalFilter ? parseFloat(minNotionalFilter.notional) : 0
                };
            }

            return null;
        } catch (error) {
            logger.error('Failed to get symbol info:', error.message);
            throw error;
        }
    }

    // Get 24hr ticker statistics
    async get24hrTicker(symbol = null) {
        try {
            const params = symbol ? { symbol } : {};
            const response = await this.axiosInstance.get('/fapi/v1/ticker/24hr', { params });

            logger.binance('24hr ticker retrieved', {
                symbol,
                count: Array.isArray(response.data) ? response.data.length : 1
            });

            return response.data;
        } catch (error) {
            logger.error('Failed to get 24hr ticker:', error.message);
            throw error;
        }
    }

    // Get current price
    async getPrice(symbol) {
        try {
            const params = { symbol };
            const response = await this.axiosInstance.get('/fapi/v1/ticker/price', { params });
            return parseFloat(response.data.price);
        } catch (error) {
            logger.error('Failed to get price:', error.message);
            throw error;
        }
    }

    // Get kline/candlestick data
    async getKlines(symbol, interval, limit = 100, startTime = null, endTime = null) {
        try {
            const params = { symbol, interval, limit };
            if (startTime) params.startTime = startTime;
            if (endTime) params.endTime = endTime;

            const response = await this.axiosInstance.get('/fapi/v1/klines', { params });

            // Format klines data
            const klines = response.data.map(k => ({
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

            logger.binance('Klines retrieved', {
                symbol,
                interval,
                count: klines.length
            });

            return klines;
        } catch (error) {
            logger.error('Failed to get klines:', error.message);
            throw error;
        }
    }

    // Get mark price
    async getMarkPrice(symbol = null) {
        try {
            const params = symbol ? { symbol } : {};
            const response = await this.axiosInstance.get('/fapi/v1/premiumIndex', { params });
            return response.data;
        } catch (error) {
            logger.error('Failed to get mark price:', error.message);
            throw error;
        }
    }

    // Get funding rate
    async getFundingRate(symbol, limit = 100) {
        try {
            const params = { symbol, limit };
            const response = await this.axiosInstance.get('/fapi/v1/fundingRate', { params });
            return response.data;
        } catch (error) {
            logger.error('Failed to get funding rate:', error.message);
            throw error;
        }
    }

    // Get account trades
    async getAccountTrades(symbol, limit = 500, fromId = null, startTime = null, endTime = null) {
        try {
            const params = { symbol, limit };
            if (fromId) params.fromId = fromId;
            if (startTime) params.startTime = startTime;
            if (endTime) params.endTime = endTime;

            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.get(`/fapi/v1/userTrades?${queryString}`);

            logger.binance('Account trades retrieved', {
                symbol,
                count: response.data.length
            });

            return response.data;
        } catch (error) {
            logger.error('Failed to get account trades:', error.message);
            throw error;
        }
    }

    // Get income history
    async getIncomeHistory(symbol = null, incomeType = null, limit = 100, startTime = null, endTime = null) {
        try {
            const params = { limit };
            if (symbol) params.symbol = symbol;
            if (incomeType) params.incomeType = incomeType;
            if (startTime) params.startTime = startTime;
            if (endTime) params.endTime = endTime;

            const queryString = this.createAuthQuery(params);
            const response = await this.axiosInstance.get(`/fapi/v1/income?${queryString}`);

            return response.data;
        } catch (error) {
            logger.error('Failed to get income history:', error.message);
            throw error;
        }
    }

    // Close all positions (emergency function)
    async closeAllPositions() {
        try {
            const positions = await this.getPositions();
            const activePositions = positions.filter(pos => 
                Math.abs(parseFloat(pos.positionAmt)) > 0
            );

            const closePromises = activePositions.map(async (position) => {
                try {
                    const side = parseFloat(position.positionAmt) > 0 ? 'SELL' : 'BUY';
                    const quantity = Math.abs(parseFloat(position.positionAmt));

                    return await this.placeOrder({
                        symbol: position.symbol,
                        side: side,
                        type: 'MARKET',
                        quantity: quantity,
                        positionSide: position.positionSide,
                        reduceOnly: true
                    });
                } catch (error) {
                    logger.error(`Failed to close position ${position.symbol}:`, error.message);
                    return null;
                }
            });

            const results = await Promise.allSettled(closePromises);
            const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;

            logger.trade('Emergency close all positions', {
                totalPositions: activePositions.length,
                successfulCloses: successful
            });

            return {
                total: activePositions.length,
                successful: successful,
                results: results
            };

        } catch (error) {
            logger.error('Failed to close all positions:', error.message);
            throw error;
        }
    }

    // Utility method to round price to symbol precision
    roundPrice(price, symbol) {
        const symbolInfo = this.getSymbolInfo(symbol);
        if (symbolInfo && symbolInfo.tickSize) {
            const precision = symbolInfo.pricePrecision;
            return parseFloat(price.toFixed(precision));
        }
        return parseFloat(price.toFixed(4)); // Default precision
    }

    // Utility method to round quantity to symbol precision
    roundQuantity(quantity, symbol) {
        const symbolInfo = this.getSymbolInfo(symbol);
        if (symbolInfo && symbolInfo.stepSize) {
            const precision = symbolInfo.quantityPrecision;
            return parseFloat(quantity.toFixed(precision));
        }
        return parseFloat(quantity.toFixed(3)); // Default precision
    }

    // WebSocket methods (basic setup)
    createWebSocket(streams, callback) {
        const WebSocket = require('ws');
        const baseWsUrl = this.baseURL.replace('https://', 'wss://').replace('http://', 'ws://');
        const wsUrl = `${baseWsUrl}/ws/${streams}`;

        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            logger.binance('WebSocket connected', { streams });
        });

        ws.on('message', (data) => {
            try {
                const parsedData = JSON.parse(data);
                callback(parsedData);
            } catch (error) {
                logger.error('Failed to parse WebSocket data:', error.message);
            }
        });

        ws.on('error', (error) => {
            logger.error('WebSocket error:', error.message);
        });

        ws.on('close', () => {
            logger.binance('WebSocket disconnected', { streams });
        });

        return ws;
    }

    // Start user data stream
    async startUserDataStream() {
        try {
            const response = await this.axiosInstance.post('/fapi/v1/listenKey', {}, {
                headers: { 'X-MBX-APIKEY': this.apiKey }
            });

            const listenKey = response.data.listenKey;
            logger.binance('User data stream started', { listenKey: listenKey.substring(0, 10) + '...' });

            return listenKey;
        } catch (error) {
            logger.error('Failed to start user data stream:', error.message);
            throw error;
        }
    }

    // Keep alive user data stream
    async keepAliveUserDataStream(listenKey) {
        try {
            await this.axiosInstance.put('/fapi/v1/listenKey', {}, {
                headers: { 'X-MBX-APIKEY': this.apiKey },
                params: { listenKey }
            });

            logger.binance('User data stream kept alive');
            return true;
        } catch (error) {
            logger.error('Failed to keep alive user data stream:', error.message);
            throw error;
        }
    }

    // Close user data stream
    async closeUserDataStream(listenKey) {
        try {
            await this.axiosInstance.delete('/fapi/v1/listenKey', {
                headers: { 'X-MBX-APIKEY': this.apiKey },
                params: { listenKey }
            });

            logger.binance('User data stream closed');
            return true;
        } catch (error) {
            logger.error('Failed to close user data stream:', error.message);
            throw error;
        }
    }
}

module.exports = BinanceFuturesAPI;