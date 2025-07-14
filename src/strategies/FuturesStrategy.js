const EventEmitter = require('events');
const logger = require('../utils/logger');
const config = require('../config/config');

class FuturesStrategy extends EventEmitter {
    constructor(binanceAPI, marketAnalyzer) {
        super();
        this.binanceAPI = binanceAPI;
        this.marketAnalyzer = marketAnalyzer;
        this.activePositions = new Map();
        this.dailyStats = {
            pnl: 0,
            trades: 0,
            startBalance: 0,
            targetProfit: 0,
            maxLoss: 0,
            lastResetDate: new Date().toDateString()
        };
        this.isRunning = false;
        this.checkInterval = null;
        this.newsHours = [12, 14, 16, 20]; // UTC hours to avoid trading
        
        this.settings = {
            symbol: config.DEFAULT_FUTURES_SYMBOL || 'BTCUSDT',
            leverage: config.FUTURES_LEVERAGE || 10,
            qtyUSDT: config.FUTURES_QTY_USDT || 20,
            takeProfitPercent: config.FUTURES_TP_PERCENT || 0.6,
            stopLossPercent: config.FUTURES_SL_PERCENT || 0.3,
            rsiLongThreshold: config.RSI_LONG_THRESHOLD || 30,
            rsiShortThreshold: config.RSI_SHORT_THRESHOLD || 70,
            dailyTargetPercent: config.DAILY_TARGET_PERCENT || 5,
            dailyMaxLossPercent: config.DAILY_MAX_LOSS_PERCENT || 3,
            checkIntervalSeconds: config.SIGNAL_CHECK_INTERVAL || 30,
            enableNewsFilter: config.ENABLE_NEWS_FILTER || true,
            enableEMAFilter: config.ENABLE_EMA_FILTER || true,
            enableBBFilter: config.ENABLE_BB_FILTER || true,
            roiBasedTP: config.ROI_BASED_TP || false
        };
    }

    async start() {
        if (this.isRunning) {
            logger.trade('Futures strategy already running');
            return;
        }

        try {
            // Initialize futures trading
            await this.initializeFutures();
            
            // Start signal checking
            this.checkInterval = setInterval(() => {
                this.checkSignals();
            }, this.settings.checkIntervalSeconds * 1000);

            this.isRunning = true;
            logger.trade('Futures strategy started', this.settings);
            
            this.emit('started');

        } catch (error) {
            logger.error('Failed to start futures strategy:', error);
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) {
            return;
        }

        try {
            // Clear interval
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }

            // Close all positions
            await this.closeAllPositions();

            this.isRunning = false;
            logger.trade('Futures strategy stopped');
            
            this.emit('stopped');

        } catch (error) {
            logger.error('Error stopping futures strategy:', error);
        }
    }

    async initializeFutures() {
        try {
            // Set leverage
            await this.binanceAPI.setLeverage(this.settings.symbol, this.settings.leverage);
            
            // Set margin type to crossed
            await this.binanceAPI.setMarginType(this.settings.symbol, 'CROSSED');
            
            // Get account info and set daily stats
            const account = await this.binanceAPI.getFuturesAccount();
            if (account) {
                this.dailyStats.startBalance = parseFloat(account.totalWalletBalance);
                this.dailyStats.targetProfit = this.dailyStats.startBalance * (this.settings.dailyTargetPercent / 100);
                this.dailyStats.maxLoss = this.dailyStats.startBalance * (this.settings.dailyMaxLossPercent / 100);
            }

            // Get existing positions
            await this.updatePositions();

            logger.trade('Futures trading initialized', {
                symbol: this.settings.symbol,
                leverage: this.settings.leverage,
                balance: this.dailyStats.startBalance
            });

        } catch (error) {
            logger.error('Failed to initialize futures trading:', error);
            throw error;
        }
    }

    async checkSignals() {
        try {
            // Check daily limits first
            if (await this.checkDailyLimits()) {
                return; // Stop trading if limits reached
            }

            // Check news hours filter
            if (this.isNewsHour()) {
                logger.trade('Skipping signals during news hours');
                return;
            }

            // Update positions
            await this.updatePositions();

            // Check if we already have positions
            const longPosition = this.activePositions.get('LONG');
            const shortPosition = this.activePositions.get('SHORT');

            if (longPosition || shortPosition) {
                logger.trade('Position already exists, skipping new signals', {
                    long: !!longPosition,
                    short: !!shortPosition
                });
                return;
            }

            // Get market data and indicators
            const marketData = this.marketAnalyzer.getMarketData(this.settings.symbol);
            const indicators = this.marketAnalyzer.getTechnicalIndicators(this.settings.symbol);
            const priceHistory = this.marketAnalyzer.getPriceHistory(this.settings.symbol, 20);

            if (!marketData || !indicators || !priceHistory || priceHistory.length < 2) {
                logger.trade('Insufficient data for signal analysis');
                return;
            }

            // Get latest candle
            const latestCandle = priceHistory[priceHistory.length - 1];
            const isGreenCandle = latestCandle.close > latestCandle.open;
            const isRedCandle = latestCandle.close < latestCandle.open;

            // Check RSI + Candlestick signals
            const signal = this.analyzeEntrySignal(indicators, isGreenCandle, isRedCandle);

            if (signal.action !== 'WAIT') {
                // Apply additional filters
                if (await this.applyFilters(signal, indicators, priceHistory)) {
                    await this.executeEntry(signal, marketData.price);
                }
            }

        } catch (error) {
            logger.error('Error checking signals:', error);
        }
    }

    analyzeEntrySignal(indicators, isGreenCandle, isRedCandle) {
        const signal = {
            action: 'WAIT',
            reason: '',
            confidence: 0
        };

        // RSI + Candlestick Logic
        if (indicators.RSI < this.settings.rsiLongThreshold && isGreenCandle) {
            signal.action = 'LONG';
            signal.reason = `RSI oversold (${indicators.RSI.toFixed(2)}) + Green candle`;
            signal.confidence = (this.settings.rsiLongThreshold - indicators.RSI) / this.settings.rsiLongThreshold;
        } else if (indicators.RSI > this.settings.rsiShortThreshold && isRedCandle) {
            signal.action = 'SHORT';
            signal.reason = `RSI overbought (${indicators.RSI.toFixed(2)}) + Red candle`;
            signal.confidence = (indicators.RSI - this.settings.rsiShortThreshold) / (100 - this.settings.rsiShortThreshold);
        } else {
            signal.reason = `No signal: RSI=${indicators.RSI?.toFixed(2) || 'N/A'}, Green=${isGreenCandle}, Red=${isRedCandle}`;
        }

        return signal;
    }

    async applyFilters(signal, indicators, priceHistory) {
        try {
            // EMA Filter
            if (this.settings.enableEMAFilter && indicators.EMA_20 && indicators.EMA_50) {
                if (signal.action === 'LONG' && indicators.EMA_20 <= indicators.EMA_50) {
                    logger.trade('EMA filter rejected LONG signal', {
                        ema20: indicators.EMA_20,
                        ema50: indicators.EMA_50
                    });
                    return false;
                }
                if (signal.action === 'SHORT' && indicators.EMA_20 >= indicators.EMA_50) {
                    logger.trade('EMA filter rejected SHORT signal', {
                        ema20: indicators.EMA_20,
                        ema50: indicators.EMA_50
                    });
                    return false;
                }
            }

            // Bollinger Bands Filter
            if (this.settings.enableBBFilter && indicators.BB_Upper && indicators.BB_Lower) {
                const currentPrice = priceHistory[priceHistory.length - 1].close;
                const bbPosition = (currentPrice - indicators.BB_Lower) / (indicators.BB_Upper - indicators.BB_Lower);
                
                // Look for breakout signals
                if (signal.action === 'LONG' && bbPosition > 0.8) {
                    logger.trade('BB filter rejected LONG signal - price too high in BB', {
                        bbPosition: bbPosition.toFixed(2)
                    });
                    return false;
                }
                if (signal.action === 'SHORT' && bbPosition < 0.2) {
                    logger.trade('BB filter rejected SHORT signal - price too low in BB', {
                        bbPosition: bbPosition.toFixed(2)
                    });
                    return false;
                }
            }

            // Volume filter
            if (indicators.VolumeRatio && indicators.VolumeRatio < 1.2) {
                logger.trade('Volume filter rejected signal - low volume', {
                    volumeRatio: indicators.VolumeRatio.toFixed(2)
                });
                return false;
            }

            return true;

        } catch (error) {
            logger.error('Error applying filters:', error);
            return false;
        }
    }

    async executeEntry(signal, currentPrice) {
        try {
            const positionSide = signal.action; // 'LONG' or 'SHORT'
            const side = signal.action === 'LONG' ? 'BUY' : 'SELL';
            
            // Calculate quantity
            const quantity = this.calculateQuantity(currentPrice);
            
            if (!quantity || quantity <= 0) {
                logger.error('Invalid quantity calculated', { quantity, currentPrice });
                return;
            }

            // Place market order
            const order = await this.binanceAPI.placeFuturesOrder({
                symbol: this.settings.symbol,
                side: side,
                type: 'MARKET',
                quantity: quantity,
                positionSide: positionSide,
                reduceOnly: false
            });

            if (!order) {
                logger.error('Failed to place entry order');
                return;
            }

            logger.trade('Entry order placed', {
                orderId: order.orderId,
                side: positionSide,
                quantity: quantity,
                price: currentPrice,
                reason: signal.reason
            });

            // Place TP and SL orders
            await this.placeTPSLOrders(positionSide, currentPrice, quantity);

            // Send Telegram notification
            this.sendTelegramNotification(`🚀 ${positionSide} ENTRY\n\n` +
                `Symbol: ${this.settings.symbol}\n` +
                `Price: $${currentPrice}\n` +
                `Quantity: ${quantity}\n` +
                `Leverage: ${this.settings.leverage}x\n` +
                `Reason: ${signal.reason}\n` +
                `Confidence: ${(signal.confidence * 100).toFixed(1)}%`
            );

            this.dailyStats.trades++;

        } catch (error) {
            logger.error('Failed to execute entry:', error);
            this.sendTelegramNotification(`❌ Entry Failed: ${error.message}`);
        }
    }

    async placeTPSLOrders(positionSide, entryPrice, quantity) {
        try {
            const isLong = positionSide === 'LONG';
            
            // Calculate TP and SL prices
            let tpPrice, slPrice;
            
            if (this.settings.roiBasedTP) {
                // ROI-based TP calculation
                const targetROI = this.settings.takeProfitPercent / this.settings.leverage;
                tpPrice = isLong ? 
                    entryPrice * (1 + targetROI / 100) : 
                    entryPrice * (1 - targetROI / 100);
            } else {
                // Standard percentage-based TP
                tpPrice = isLong ? 
                    entryPrice * (1 + this.settings.takeProfitPercent / 100) : 
                    entryPrice * (1 - this.settings.takeProfitPercent / 100);
            }
            
            slPrice = isLong ? 
                entryPrice * (1 - this.settings.stopLossPercent / 100) : 
                entryPrice * (1 + this.settings.stopLossPercent / 100);

            // Round prices according to symbol precision
            const symbolInfo = await this.binanceAPI.getSymbolInfo(this.settings.symbol);
            const pricePrecision = symbolInfo?.pricePrecision || 2;
            
            tpPrice = parseFloat(tpPrice.toFixed(pricePrecision));
            slPrice = parseFloat(slPrice.toFixed(pricePrecision));

            // Place Take Profit order
            const tpOrder = await this.binanceAPI.placeFuturesOrder({
                symbol: this.settings.symbol,
                side: isLong ? 'SELL' : 'BUY',
                type: 'TAKE_PROFIT_MARKET',
                quantity: quantity,
                stopPrice: tpPrice,
                positionSide: positionSide,
                reduceOnly: true,
                timeInForce: 'GTC'
            });

            // Place Stop Loss order
            const slOrder = await this.binanceAPI.placeFuturesOrder({
                symbol: this.settings.symbol,
                side: isLong ? 'SELL' : 'BUY',
                type: 'STOP_MARKET',
                quantity: quantity,
                stopPrice: slPrice,
                positionSide: positionSide,
                reduceOnly: true,
                timeInForce: 'GTC'
            });

            logger.trade('TP/SL orders placed', {
                positionSide,
                tpOrderId: tpOrder?.orderId,
                slOrderId: slOrder?.orderId,
                tpPrice,
                slPrice
            });

            // Store order IDs for tracking
            this.activePositions.set(positionSide, {
                side: positionSide,
                entryPrice,
                quantity,
                tpOrderId: tpOrder?.orderId,
                slOrderId: slOrder?.orderId,
                tpPrice,
                slPrice,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Failed to place TP/SL orders:', error);
            this.sendTelegramNotification(`⚠️ TP/SL Order Failed: ${error.message}`);
        }
    }

    calculateQuantity(price) {
        try {
            // Calculate quantity based on USDT amount and leverage
            const notionalValue = this.settings.qtyUSDT * this.settings.leverage;
            const baseQuantity = notionalValue / price;
            
            // Round to appropriate precision
            const symbolInfo = this.binanceAPI.getSymbolInfo(this.settings.symbol);
            const quantityPrecision = symbolInfo?.quantityPrecision || 3;
            
            return parseFloat(baseQuantity.toFixed(quantityPrecision));
            
        } catch (error) {
            logger.error('Error calculating quantity:', error);
            return 0;
        }
    }

    async updatePositions() {
        try {
            const positions = await this.binanceAPI.getFuturesPositions(this.settings.symbol);
            
            this.activePositions.clear();
            
            if (positions && positions.length > 0) {
                for (const position of positions) {
                    const size = Math.abs(parseFloat(position.positionAmt));
                    if (size > 0) {
                        this.activePositions.set(position.positionSide, {
                            side: position.positionSide,
                            size: size,
                            entryPrice: parseFloat(position.entryPrice),
                            unrealizedPnl: parseFloat(position.unrealizedPnl),
                            percentage: parseFloat(position.percentage)
                        });
                    }
                }
            }

        } catch (error) {
            logger.error('Error updating positions:', error);
        }
    }

    async closeAllPositions() {
        try {
            await this.updatePositions();
            
            for (const [positionSide, position] of this.activePositions) {
                await this.closePosition(positionSide, 'manual');
            }
            
        } catch (error) {
            logger.error('Error closing all positions:', error);
        }
    }

    async closePosition(positionSide, reason = 'manual') {
        try {
            const position = this.activePositions.get(positionSide);
            if (!position) {
                return;
            }

            // Cancel existing TP/SL orders
            if (position.tpOrderId) {
                await this.binanceAPI.cancelFuturesOrder(this.settings.symbol, position.tpOrderId);
            }
            if (position.slOrderId) {
                await this.binanceAPI.cancelFuturesOrder(this.settings.symbol, position.slOrderId);
            }

            // Close position with market order
            const closeOrder = await this.binanceAPI.placeFuturesOrder({
                symbol: this.settings.symbol,
                side: positionSide === 'LONG' ? 'SELL' : 'BUY',
                type: 'MARKET',
                quantity: position.size,
                positionSide: positionSide,
                reduceOnly: true
            });

            if (closeOrder) {
                logger.trade('Position closed', {
                    positionSide,
                    reason,
                    orderId: closeOrder.orderId,
                    pnl: position.unrealizedPnl
                });

                // Update daily PnL
                this.dailyStats.pnl += position.unrealizedPnl || 0;

                // Send notification
                const pnlEmoji = position.unrealizedPnl > 0 ? '✅' : '❌';
                this.sendTelegramNotification(`${pnlEmoji} ${positionSide} CLOSED\n\n` +
                    `Reason: ${reason}\n` +
                    `PnL: $${position.unrealizedPnl?.toFixed(2) || '0.00'}\n` +
                    `Daily PnL: $${this.dailyStats.pnl.toFixed(2)}`
                );

                // Remove from active positions
                this.activePositions.delete(positionSide);
            }

        } catch (error) {
            logger.error(`Error closing ${positionSide} position:`, error);
        }
    }

    async checkDailyLimits() {
        try {
            // Reset daily stats if new day
            const today = new Date().toDateString();
            if (today !== this.dailyStats.lastResetDate) {
                await this.resetDailyStats();
            }

            // Check if target profit reached
            if (this.dailyStats.pnl >= this.dailyStats.targetProfit) {
                logger.trade('Daily target profit reached, stopping trading', {
                    currentPnL: this.dailyStats.pnl,
                    target: this.dailyStats.targetProfit
                });
                
                this.sendTelegramNotification(`🎯 Daily Target Reached!\n\n` +
                    `Target: $${this.dailyStats.targetProfit.toFixed(2)}\n` +
                    `Current: $${this.dailyStats.pnl.toFixed(2)}\n` +
                    `Trading stopped for today.`
                );
                
                await this.stop();
                return true;
            }

            // Check if max loss reached
            if (this.dailyStats.pnl <= -this.dailyStats.maxLoss) {
                logger.trade('Daily max loss reached, stopping trading', {
                    currentPnL: this.dailyStats.pnl,
                    maxLoss: this.dailyStats.maxLoss
                });
                
                this.sendTelegramNotification(`🚨 Daily Loss Limit Hit!\n\n` +
                    `Max Loss: $${this.dailyStats.maxLoss.toFixed(2)}\n` +
                    `Current: $${this.dailyStats.pnl.toFixed(2)}\n` +
                    `Trading stopped for today.`
                );
                
                await this.closeAllPositions();
                await this.stop();
                return true;
            }

            return false;

        } catch (error) {
            logger.error('Error checking daily limits:', error);
            return false;
        }
    }

    async resetDailyStats() {
        const today = new Date().toDateString();
        
        // Send daily summary if it's not the first day
        if (this.dailyStats.lastResetDate !== today && this.dailyStats.trades > 0) {
            this.sendDailySummary();
        }

        // Get current balance
        const account = await this.binanceAPI.getFuturesAccount();
        const currentBalance = account ? parseFloat(account.totalWalletBalance) : this.dailyStats.startBalance;

        this.dailyStats = {
            pnl: 0,
            trades: 0,
            startBalance: currentBalance,
            targetProfit: currentBalance * (this.settings.dailyTargetPercent / 100),
            maxLoss: currentBalance * (this.settings.dailyMaxLossPercent / 100),
            lastResetDate: today
        };

        logger.trade('Daily stats reset', this.dailyStats);
    }

    sendDailySummary() {
        const winRate = this.dailyStats.trades > 0 ? 
            (this.dailyStats.pnl > 0 ? 100 : 0) : 0; // Simplified win rate calculation

        this.sendTelegramNotification(`📊 Daily Summary\n\n` +
            `Total PnL: $${this.dailyStats.pnl.toFixed(2)}\n` +
            `Total Trades: ${this.dailyStats.trades}\n` +
            `Win Rate: ${winRate.toFixed(1)}%\n` +
            `Start Balance: $${this.dailyStats.startBalance.toFixed(2)}\n` +
            `ROI: ${((this.dailyStats.pnl / this.dailyStats.startBalance) * 100).toFixed(2)}%`
        );
    }

    isNewsHour() {
        if (!this.settings.enableNewsFilter) {
            return false;
        }

        const currentHour = new Date().getUTCHours();
        return this.newsHours.includes(currentHour);
    }

    sendTelegramNotification(message) {
        // This will be handled by the main TelegramBot class
        this.emit('notification', message);
    }

    // Getter methods
    getStatus() {
        return {
            isRunning: this.isRunning,
            symbol: this.settings.symbol,
            leverage: this.settings.leverage,
            activePositions: this.activePositions.size,
            dailyPnL: this.dailyStats.pnl,
            dailyTrades: this.dailyStats.trades,
            settings: this.settings
        };
    }

    getActivePositions() {
        return Array.from(this.activePositions.values());
    }

    getDailyStats() {
        return { ...this.dailyStats };
    }

    // Settings update methods
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        logger.trade('Settings updated', newSettings);
    }

    cleanup() {
        this.stop();
        this.removeAllListeners();
        logger.trade('Futures strategy cleanup completed');
    }
}

module.exports = FuturesStrategy;