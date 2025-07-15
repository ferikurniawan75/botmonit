const EventEmitter = require('events');
const TechnicalIndicators = require('technicalindicators');
const _ = require('lodash');
const logger = require('../utils/logger');
const config = require('../config/config');

class MarketAnalyzer extends EventEmitter {
    constructor(binanceAPI) {
        super();
        this.binanceAPI = binanceAPI;
        this.marketData = new Map();
        this.priceHistory = new Map();
        this.volumeData = new Map();
        this.technicalIndicators = new Map();
        this.marketSentiment = new Map();
        this.activeStreams = new Set();
        this.updateInterval = null;
        this.isRunning = false;
        
        
// Add default config fallbacks at top of constructor
if (!config.TRADING_PAIRS) {
    config.TRADING_PAIRS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
}
if (!config.MARKET_CATEGORIES) {
    config.MARKET_CATEGORIES = {
        major: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
        altcoins: ['ADAUSDT', 'DOTUSDT', 'LINKUSDT']
    };
}
if (!config.MARKET_UPDATE_INTERVAL) {
    config.MARKET_UPDATE_INTERVAL = 30000; // 30 seconds
}
if (!config.PRICE_HISTORY_LIMIT) {
    config.PRICE_HISTORY_LIMIT = 200;
}
if (!config.VOLUME_THRESHOLD_USDT) {
    config.VOLUME_THRESHOLD_USDT = 1000000;
}
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.binanceAPI.on('tickerUpdate', (ticker) => {
            this.updateMarketData(ticker);
        });

        this.binanceAPI.on('klineUpdate', (kline) => {
            this.updatePriceHistory(kline);
            this.calculateTechnicalIndicators(kline.symbol);
        });

        this.on('marketUpdate', (data) => {
            this.analyzeMarketConditions(data);
        });
    }

    async startDataStream() {
        if (this.isRunning) {
            logger.market('Market analyzer already running');
            return;
        }

        try {
            logger.market('Starting market data streams');
            
            // Start ticker streams for trading pairs
            if (config.TRADING_PAIRS && config.TRADING_PAIRS.length > 0) {
                this.binanceAPI.startTickerStream(config.TRADING_PAIRS);
            }

            // Start kline streams for major pairs
            const majorPairs = config.MARKET_CATEGORIES?.major || ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
            for (const symbol of majorPairs) {
                this.binanceAPI.startKlineStream(symbol, '5m');
                this.activeStreams.add(`kline_${symbol}_5m`);
            }

            // Start periodic market analysis
            this.updateInterval = setInterval(() => {
                this.performMarketAnalysis();
            }, config.MARKET_UPDATE_INTERVAL || 30000);

            this.isRunning = true;
            logger.market('Market data streams started successfully');

        } catch (error) {
            logger.error('Failed to start market data streams:', error);
            throw error;
        }
    }
    async stopDataStream() {
        if (!this.isRunning) {
            return;
        }

        try {
            logger.market('Stopping market data streams');
            
            // Stop all streams
            this.binanceAPI.stopAllStreams();
            this.activeStreams.clear();

            // Stop periodic analysis
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }

            this.isRunning = false;
            logger.market('Market data streams stopped');

        } catch (error) {
            logger.error('Failed to stop market data streams:', error);
        }
    }

    updateMarketData(ticker) {
        const symbol = ticker.symbol;
        
        // Store current market data
        this.marketData.set(symbol, {
            ...ticker,
            timestamp: Date.now(),
            spread: this.calculateSpread(ticker),
            volatility: this.calculateVolatility(symbol, ticker.price)
        });

        // Update volume data
        this.updateVolumeData(symbol, ticker.volume);

        // Emit market update event
        this.emit('marketUpdate', { symbol, ticker });
    }

    updatePriceHistory(kline) {
        const symbol = kline.symbol;
        
        if (!this.priceHistory.has(symbol)) {
            this.priceHistory.set(symbol, []);
        }

        const history = this.priceHistory.get(symbol);
        
        // Add new price data
        const priceData = {
            timestamp: kline.closeTime,
            open: kline.open,
            high: kline.high,
            low: kline.low,
            close: kline.close,
            volume: kline.volume
        };

        // Only add if it's a new/final candle
        if (kline.isFinal) {
            history.push(priceData);
            
            // Keep only recent history
            if (history.length > config.PRICE_HISTORY_LIMIT) {
                history.shift();
            }
        } else {
            // Update the last candle if it's not final
            if (history.length > 0) {
                history[history.length - 1] = priceData;
            }
        }

        this.priceHistory.set(symbol, history);
    }

    updateVolumeData(symbol, volume) {
        if (!this.volumeData.has(symbol)) {
            this.volumeData.set(symbol, []);
        }

        const volumeHistory = this.volumeData.get(symbol);
        volumeHistory.push({
            timestamp: Date.now(),
            volume: parseFloat(volume)
        });

        // Keep only last 24 hours of volume data
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const filteredVolume = volumeHistory.filter(v => v.timestamp > oneDayAgo);
        this.volumeData.set(symbol, filteredVolume);
    }

    calculateTechnicalIndicators(symbol) {
        const history = this.priceHistory.get(symbol);
        if (!history || history.length < 50) {
            return;
        }

        try {
            const closes = history.map(h => h.close);
            const highs = history.map(h => h.high);
            const lows = history.map(h => h.low);
            const volumes = history.map(h => h.volume);

            const indicators = {};

            // Simple Moving Averages
            for (const period of config.TECHNICAL_ANALYSIS.SMA_PERIODS) {
                if (closes.length >= period) {
                    const sma = TechnicalIndicators.SMA.calculate({
                        period: period,
                        values: closes
                    });
                    indicators[`SMA_${period}`] = sma[sma.length - 1];
                }
            }

            // Exponential Moving Averages
            for (const period of config.TECHNICAL_ANALYSIS.EMA_PERIODS) {
                if (closes.length >= period) {
                    const ema = TechnicalIndicators.EMA.calculate({
                        period: period,
                        values: closes
                    });
                    indicators[`EMA_${period}`] = ema[ema.length - 1];
                }
            }

            // RSI
            if (closes.length >= config.TECHNICAL_ANALYSIS.RSI_PERIOD + 1) {
                const rsi = TechnicalIndicators.RSI.calculate({
                    period: config.TECHNICAL_ANALYSIS.RSI_PERIOD,
                    values: closes
                });
                indicators.RSI = rsi[rsi.length - 1];
            }

            // MACD
            if (closes.length >= config.TECHNICAL_ANALYSIS.MACD_SLOW + 1) {
                const macd = TechnicalIndicators.MACD.calculate({
                    fastPeriod: config.TECHNICAL_ANALYSIS.MACD_FAST,
                    slowPeriod: config.TECHNICAL_ANALYSIS.MACD_SLOW,
                    signalPeriod: config.TECHNICAL_ANALYSIS.MACD_SIGNAL,
                    values: closes,
                    SimpleMAOscillator: false,
                    SimpleMASignal: false
                });
                const lastMACD = macd[macd.length - 1];
                if (lastMACD) {
                    indicators.MACD = lastMACD.MACD;
                    indicators.MACD_Signal = lastMACD.signal;
                    indicators.MACD_Histogram = lastMACD.histogram;
                }
            }

            // Bollinger Bands
            if (closes.length >= config.TECHNICAL_ANALYSIS.BB_PERIOD) {
                const bb = TechnicalIndicators.BollingerBands.calculate({
                    period: config.TECHNICAL_ANALYSIS.BB_PERIOD,
                    stdDev: config.TECHNICAL_ANALYSIS.BB_DEVIATION,
                    values: closes
                });
                const lastBB = bb[bb.length - 1];
                if (lastBB) {
                    indicators.BB_Upper = lastBB.upper;
                    indicators.BB_Middle = lastBB.middle;
                    indicators.BB_Lower = lastBB.lower;
                }
            }

            // Stochastic Oscillator
            if (history.length >= config.TECHNICAL_ANALYSIS.STOCH_K_PERIOD) {
                const stoch = TechnicalIndicators.Stochastic.calculate({
                    high: highs,
                    low: lows,
                    close: closes,
                    period: config.TECHNICAL_ANALYSIS.STOCH_K_PERIOD,
                    signalPeriod: config.TECHNICAL_ANALYSIS.STOCH_D_PERIOD
                });
                const lastStoch = stoch[stoch.length - 1];
                if (lastStoch) {
                    indicators.STOCH_K = lastStoch.k;
                    indicators.STOCH_D = lastStoch.d;
                }
            }

            // ADX
            if (history.length >= config.TECHNICAL_ANALYSIS.ADX_PERIOD + 1) {
                const adx = TechnicalIndicators.ADX.calculate({
                    high: highs,
                    low: lows,
                    close: closes,
                    period: config.TECHNICAL_ANALYSIS.ADX_PERIOD
                });
                indicators.ADX = adx[adx.length - 1];
            }

            // Volume indicators
            if (volumes.length >= 20) {
                const avgVolume = _.mean(volumes.slice(-20));
                const currentVolume = volumes[volumes.length - 1];
                indicators.VolumeRatio = currentVolume / avgVolume;
            }

            // Store indicators
            this.technicalIndicators.set(symbol, {
                ...indicators,
                timestamp: Date.now(),
                price: closes[closes.length - 1]
            });

            logger.market('Technical indicators calculated', { symbol, indicators: Object.keys(indicators).length });

        } catch (error) {
            logger.error(`Failed to calculate technical indicators for ${symbol}:`, error);
        }
    }

    calculateSpread(ticker) {
        // Simple spread calculation - in real implementation, use order book
        return ((ticker.highPrice - ticker.lowPrice) / ticker.price) * 100;
    }

    calculateVolatility(symbol, currentPrice) {
        const history = this.priceHistory.get(symbol);
        if (!history || history.length < 20) {
            return 0;
        }

        const prices = history.slice(-20).map(h => h.close);
        const returns = [];
        
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }

        const mean = _.mean(returns);
        const variance = _.mean(returns.map(r => Math.pow(r - mean, 2)));
        return Math.sqrt(variance) * 100; // Convert to percentage
    }

    analyzeMarketConditions(data) {
        const { symbol } = data;
        const marketData = this.marketData.get(symbol);
        const indicators = this.technicalIndicators.get(symbol);

        if (!marketData || !indicators) {
            return;
        }

        // Analyze market sentiment
        const sentiment = this.calculateMarketSentiment(symbol, marketData, indicators);
        this.marketSentiment.set(symbol, sentiment);

        // Emit analysis results
        this.emit('marketAnalysis', {
            symbol,
            marketData,
            indicators,
            sentiment
        });
    }

    calculateMarketSentiment(symbol, marketData, indicators) {
        let sentiment = {
            overall: 'neutral',
            strength: 0,
            signals: [],
            confidence: 0
        };

        const signals = [];
        let bullishScore = 0;
        let bearishScore = 0;

        // RSI Analysis
        if (indicators.RSI) {
            if (indicators.RSI > config.TECHNICAL_ANALYSIS.RSI_OVERBOUGHT) {
                signals.push({ type: 'bearish', indicator: 'RSI', value: indicators.RSI, reason: 'Overbought' });
                bearishScore += 2;
            } else if (indicators.RSI < config.TECHNICAL_ANALYSIS.RSI_OVERSOLD) {
                signals.push({ type: 'bullish', indicator: 'RSI', value: indicators.RSI, reason: 'Oversold' });
                bullishScore += 2;
            }
        }

        // MACD Analysis
        if (indicators.MACD && indicators.MACD_Signal) {
            if (indicators.MACD > indicators.MACD_Signal) {
                signals.push({ type: 'bullish', indicator: 'MACD', reason: 'MACD above signal' });
                bullishScore += 1;
            } else {
                signals.push({ type: 'bearish', indicator: 'MACD', reason: 'MACD below signal' });
                bearishScore += 1;
            }
        }

        // Moving Average Analysis
        if (indicators.SMA_20 && indicators.SMA_50) {
            if (indicators.SMA_20 > indicators.SMA_50) {
                signals.push({ type: 'bullish', indicator: 'SMA', reason: 'SMA20 > SMA50' });
                bullishScore += 1;
            } else {
                signals.push({ type: 'bearish', indicator: 'SMA', reason: 'SMA20 < SMA50' });
                bearishScore += 1;
            }
        }

        // Price vs Moving Averages
        if (indicators.SMA_20) {
            if (marketData.price > indicators.SMA_20) {
                signals.push({ type: 'bullish', indicator: 'Price', reason: 'Price above SMA20' });
                bullishScore += 1;
            } else {
                signals.push({ type: 'bearish', indicator: 'Price', reason: 'Price below SMA20' });
                bearishScore += 1;
            }
        }

        // Bollinger Bands Analysis
        if (indicators.BB_Upper && indicators.BB_Lower) {
            if (marketData.price > indicators.BB_Upper) {
                signals.push({ type: 'bearish', indicator: 'BB', reason: 'Price above upper band' });
                bearishScore += 1;
            } else if (marketData.price < indicators.BB_Lower) {
                signals.push({ type: 'bullish', indicator: 'BB', reason: 'Price below lower band' });
                bullishScore += 1;
            }
        }

        // Volume Analysis
        if (indicators.VolumeRatio) {
            if (indicators.VolumeRatio > 1.5) {
                signals.push({ type: 'strength', indicator: 'Volume', reason: 'High volume' });
                // High volume strengthens the signal
                if (bullishScore > bearishScore) {
                    bullishScore += 1;
                } else if (bearishScore > bullishScore) {
                    bearishScore += 1;
                }
            }
        }

        // Price Change Analysis
        if (marketData.priceChangePercent) {
            if (Math.abs(marketData.priceChangePercent) > 5) {
                signals.push({ 
                    type: marketData.priceChangePercent > 0 ? 'bullish' : 'bearish', 
                    indicator: 'Price Change', 
                    reason: `Strong ${marketData.priceChangePercent > 0 ? 'positive' : 'negative'} movement` 
                });
                if (marketData.priceChangePercent > 0) {
                    bullishScore += 2;
                } else {
                    bearishScore += 2;
                }
            }
        }

        // Calculate overall sentiment
        const totalScore = bullishScore + bearishScore;
        if (totalScore > 0) {
            if (bullishScore > bearishScore) {
                sentiment.overall = 'bullish';
                sentiment.strength = (bullishScore / totalScore) * 100;
            } else if (bearishScore > bullishScore) {
                sentiment.overall = 'bearish';
                sentiment.strength = (bearishScore / totalScore) * 100;
            } else {
                sentiment.overall = 'neutral';
                sentiment.strength = 50;
            }
        }

        sentiment.signals = signals;
        sentiment.confidence = Math.min(signals.length * 10, 100);

        return sentiment;
    }

    async performMarketAnalysis() {
        try {
            // Get market overview
            const marketOverview = await this.getMarketOverview();
            
            // Analyze trending pairs
            const trendingAnalysis = this.analyzeTrendingPairs();
            
            // Detect market opportunities
            const opportunities = this.detectTradingOpportunities();

            // Emit comprehensive market analysis
            this.emit('comprehensiveAnalysis', {
                overview: marketOverview,
                trending: trendingAnalysis,
                opportunities: opportunities,
                timestamp: Date.now()
            });

            logger.market('Comprehensive market analysis completed', {
                overview: !!marketOverview,
                trending: trendingAnalysis.length,
                opportunities: opportunities.length
            });

        } catch (error) {
            logger.error('Failed to perform market analysis:', error);
        }
    }

    async getMarketOverview() {
        try {
            const topVolume = await this.binanceAPI.getTopVolumeCoins(20);
            const gainersLosers = await this.binanceAPI.getGainersLosers(10);

            return {
                topVolume: topVolume.slice(0, 10),
                topGainers: gainersLosers.gainers.slice(0, 5),
                topLosers: gainersLosers.losers.slice(0, 5),
                marketSentiment: this.getOverallMarketSentiment(),
                volatilityIndex: this.calculateMarketVolatility()
            };
        } catch (error) {
            logger.error('Failed to get market overview:', error);
            return null;
        }
    }

    analyzeTrendingPairs() {
        const trending = [];
        
        for (const [symbol, marketData] of this.marketData) {
            if (!config.TRADING_PAIRS.includes(symbol)) continue;
            
            const sentiment = this.marketSentiment.get(symbol);
            const indicators = this.technicalIndicators.get(symbol);
            
            if (!sentiment || !indicators) continue;

            // Check if pair is trending
            if (Math.abs(marketData.priceChangePercent) > 3 && 
                marketData.volume > config.VOLUME_THRESHOLD_USDT &&
                sentiment.confidence > 60) {
                
                trending.push({
                    symbol,
                    priceChange: marketData.priceChangePercent,
                    volume: marketData.volume,
                    sentiment: sentiment.overall,
                    confidence: sentiment.confidence,
                    volatility: marketData.volatility,
                    signals: sentiment.signals.length
                });
            }
        }

        return trending.sort((a, b) => Math.abs(b.priceChange) - Math.abs(a.priceChange));
    }

    detectTradingOpportunities() {
        const opportunities = [];

        for (const [symbol, marketData] of this.marketData) {
            if (!config.TRADING_PAIRS.includes(symbol)) continue;
            
            const sentiment = this.marketSentiment.get(symbol);
            const indicators = this.technicalIndicators.get(symbol);
            
            if (!sentiment || !indicators) continue;

            // Define opportunity criteria
            const opportunity = {
                symbol,
                type: null,
                strength: 0,
                reasons: [],
                risk: 'medium',
                confidence: sentiment.confidence
            };

            // Bullish opportunities
            if (sentiment.overall === 'bullish' && sentiment.confidence > 70) {
                // RSI oversold + bullish divergence
                if (indicators.RSI && indicators.RSI < 35 && 
                    indicators.MACD > indicators.MACD_Signal) {
                    opportunity.type = 'long';
                    opportunity.strength += 30;
                    opportunity.reasons.push('RSI oversold with MACD bullish divergence');
                }

                // Price near support (Bollinger Band lower)
                if (indicators.BB_Lower && 
                    marketData.price <= indicators.BB_Lower * 1.02) {
                    opportunity.type = 'long';
                    opportunity.strength += 25;
                    opportunity.reasons.push('Price near support level');
                }

                // Volume spike with price increase
                if (indicators.VolumeRatio > 2 && marketData.priceChangePercent > 2) {
                    opportunity.type = 'long';
                    opportunity.strength += 20;
                    opportunity.reasons.push('Volume spike with positive price action');
                }
            }

            // Bearish opportunities
            if (sentiment.overall === 'bearish' && sentiment.confidence > 70) {
                // RSI overbought + bearish divergence
                if (indicators.RSI && indicators.RSI > 65 && 
                    indicators.MACD < indicators.MACD_Signal) {
                    opportunity.type = 'short';
                    opportunity.strength += 30;
                    opportunity.reasons.push('RSI overbought with MACD bearish divergence');
                }

                // Price near resistance (Bollinger Band upper)
                if (indicators.BB_Upper && 
                    marketData.price >= indicators.BB_Upper * 0.98) {
                    opportunity.type = 'short';
                    opportunity.strength += 25;
                    opportunity.reasons.push('Price near resistance level');
                }

                // Volume spike with price decrease
                if (indicators.VolumeRatio > 2 && marketData.priceChangePercent < -2) {
                    opportunity.type = 'short';
                    opportunity.strength += 20;
                    opportunity.reasons.push('Volume spike with negative price action');
                }
            }

            // Scalping opportunities
            if (marketData.volatility > 2 && indicators.VolumeRatio > 1.5) {
                const scalping = {
                    symbol,
                    type: 'scalp',
                    strength: 15 + (marketData.volatility * 2),
                    reasons: ['High volatility with good volume'],
                    risk: 'high',
                    confidence: Math.min(sentiment.confidence + 10, 100)
                };
                opportunities.push(scalping);
            }

            // Add main opportunity if it has sufficient strength
            if (opportunity.type && opportunity.strength >= 20) {
                // Adjust risk based on volatility and market conditions
                if (marketData.volatility > 5) {
                    opportunity.risk = 'high';
                } else if (marketData.volatility < 2) {
                    opportunity.risk = 'low';
                }

                opportunities.push(opportunity);
            }
        }

        return opportunities.sort((a, b) => b.strength - a.strength);
    }

    getOverallMarketSentiment() {
        const sentiments = Array.from(this.marketSentiment.values());
        if (sentiments.length === 0) return 'neutral';

        let bullishCount = 0;
        let bearishCount = 0;
        let neutralCount = 0;

        sentiments.forEach(s => {
            if (s.overall === 'bullish') bullishCount++;
            else if (s.overall === 'bearish') bearishCount++;
            else neutralCount++;
        });

        const total = sentiments.length;
        const bullishPercent = (bullishCount / total) * 100;
        const bearishPercent = (bearishCount / total) * 100;

        if (bullishPercent > 60) return 'bullish';
        if (bearishPercent > 60) return 'bearish';
        return 'neutral';
    }

    calculateMarketVolatility() {
        const volatilities = Array.from(this.marketData.values())
            .map(data => data.volatility)
            .filter(vol => vol > 0);

        if (volatilities.length === 0) return 0;
        return _.mean(volatilities);
    }

    // Getter methods for external access
    getMarketData(symbol) {
        return symbol ? this.marketData.get(symbol) : Object.fromEntries(this.marketData);
    }

    getTechnicalIndicators(symbol) {
        return symbol ? this.technicalIndicators.get(symbol) : Object.fromEntries(this.technicalIndicators);
    }

    getMarketSentiment(symbol) {
        return symbol ? this.marketSentiment.get(symbol) : Object.fromEntries(this.marketSentiment);
    }

    getPriceHistory(symbol, limit = 100) {
        const history = this.priceHistory.get(symbol);
        if (!history) return [];
        return history.slice(-limit);
    }

    getMarketSummary() {
        const totalPairs = this.marketData.size;
        const activePairs = Array.from(this.marketData.values())
            .filter(data => data.volume > 0).length;
        
        const sentiments = Array.from(this.marketSentiment.values());
        const avgConfidence = sentiments.length > 0 ? 
            _.mean(sentiments.map(s => s.confidence)) : 0;

        return {
            totalPairs,
            activePairs,
            isRunning: this.isRunning,
            avgConfidence: Math.round(avgConfidence),
            overallSentiment: this.getOverallMarketSentiment(),
            marketVolatility: Math.round(this.calculateMarketVolatility()),
            lastUpdate: Math.max(...Array.from(this.marketData.values()).map(d => d.timestamp))
        };
    }

    // Analysis methods for specific strategies
    findBreakoutCandidates(minVolume = 1000000) {
        const candidates = [];

        for (const [symbol, marketData] of this.marketData) {
            if (marketData.volume < minVolume) continue;

            const indicators = this.technicalIndicators.get(symbol);
            if (!indicators) continue;

            // Look for consolidation breakouts
            if (indicators.BB_Upper && indicators.BB_Lower) {
                const bbWidth = ((indicators.BB_Upper - indicators.BB_Lower) / indicators.BB_Middle) * 100;
                
                // Narrow Bollinger Bands indicate low volatility/consolidation
                if (bbWidth < 4) {
                    candidates.push({
                        symbol,
                        type: 'consolidation_breakout',
                        bbWidth,
                        volume: marketData.volume,
                        price: marketData.price,
                        volatility: marketData.volatility
                    });
                }
            }

            // Look for volume breakouts
            if (indicators.VolumeRatio > 3) {
                candidates.push({
                    symbol,
                    type: 'volume_breakout',
                    volumeRatio: indicators.VolumeRatio,
                    priceChange: marketData.priceChangePercent,
                    volume: marketData.volume
                });
            }
        }

        return candidates;
    }

    findMeanReversionCandidates() {
        const candidates = [];

        for (const [symbol, marketData] of this.marketData) {
            const indicators = this.technicalIndicators.get(symbol);
            if (!indicators) continue;

            // RSI mean reversion
            if (indicators.RSI) {
                if (indicators.RSI > 80) {
                    candidates.push({
                        symbol,
                        type: 'rsi_overbought',
                        rsi: indicators.RSI,
                        direction: 'short',
                        strength: indicators.RSI - 70
                    });
                } else if (indicators.RSI < 20) {
                    candidates.push({
                        symbol,
                        type: 'rsi_oversold',
                        rsi: indicators.RSI,
                        direction: 'long',
                        strength: 30 - indicators.RSI
                    });
                }
            }

            // Bollinger Band mean reversion
            if (indicators.BB_Upper && indicators.BB_Lower && indicators.BB_Middle) {
                const distanceFromMiddle = Math.abs(marketData.price - indicators.BB_Middle) / indicators.BB_Middle * 100;
                
                if (marketData.price > indicators.BB_Upper) {
                    candidates.push({
                        symbol,
                        type: 'bb_reversion',
                        direction: 'short',
                        distanceFromMiddle,
                        strength: distanceFromMiddle
                    });
                } else if (marketData.price < indicators.BB_Lower) {
                    candidates.push({
                        symbol,
                        type: 'bb_reversion',
                        direction: 'long',
                        distanceFromMiddle,
                        strength: distanceFromMiddle
                    });
                }
            }
        }

        return candidates.sort((a, b) => b.strength - a.strength);
    }

    findTrendFollowingCandidates() {
        const candidates = [];

        for (const [symbol, marketData] of this.marketData) {
            const indicators = this.technicalIndicators.get(symbol);
            if (!indicators) continue;

            let trendStrength = 0;
            let direction = null;

            // ADX for trend strength
            if (indicators.ADX && indicators.ADX > 25) {
                trendStrength += indicators.ADX;
            }

            // Moving average alignment
            if (indicators.EMA_12 && indicators.EMA_26 && indicators.SMA_50) {
                if (indicators.EMA_12 > indicators.EMA_26 && indicators.EMA_26 > indicators.SMA_50) {
                    direction = 'long';
                    trendStrength += 20;
                } else if (indicators.EMA_12 < indicators.EMA_26 && indicators.EMA_26 < indicators.SMA_50) {
                    direction = 'short';
                    trendStrength += 20;
                }
            }

            // MACD confirmation
            if (indicators.MACD && indicators.MACD_Signal) {
                if (direction === 'long' && indicators.MACD > indicators.MACD_Signal) {
                    trendStrength += 15;
                } else if (direction === 'short' && indicators.MACD < indicators.MACD_Signal) {
                    trendStrength += 15;
                }
            }

            if (direction && trendStrength > 40) {
                candidates.push({
                    symbol,
                    type: 'trend_following',
                    direction,
                    strength: trendStrength,
                    adx: indicators.ADX,
                    volume: marketData.volume
                });
            }
        }

        return candidates.sort((a, b) => b.strength - a.strength);
    }

    cleanup() {
        this.stopDataStream();
        this.marketData.clear();
        this.priceHistory.clear();
        this.volumeData.clear();
        this.technicalIndicators.clear();
        this.marketSentiment.clear();
        this.removeAllListeners();
        logger.market('MarketAnalyzer cleanup completed');
    }
}

module.exports = MarketAnalyzer;