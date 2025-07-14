const tf = require('@tensorflow/tfjs');
const EventEmitter = require('events');
const _ = require('lodash');
const ss = require('simple-statistics');
const logger = require('../utils/logger');
const config = require('../config/config');

class AIAnalyzer extends EventEmitter {
    constructor() {
        super();
        this.models = new Map();
        this.predictions = new Map();
        this.trainingData = new Map();
        this.isInitialized = false;
        this.modelAccuracy = new Map();
        this.predictionHistory = new Map();
        
        this.setupModelConfigurations();
    }

    setupModelConfigurations() {
        this.modelConfigs = {
            pricePredictor: {
                inputShape: [config.AI_ANALYSIS.PRICE_PREDICTION_LOOKBACK, 6], // OHLCV + indicators
                outputShape: 3, // up, down, sideways
                hiddenLayers: [128, 64, 32],
                learningRate: 0.001,
                epochs: 100,
                batchSize: 32
            },
            volatilityPredictor: {
                inputShape: [50, 4], // shorter lookback for volatility
                outputShape: 1, // volatility percentage
                hiddenLayers: [64, 32, 16],
                learningRate: 0.001,
                epochs: 50,
                batchSize: 16
            },
            sentimentAnalyzer: {
                inputShape: [20], // 20 technical indicators
                outputShape: 3, // bullish, bearish, neutral
                hiddenLayers: [32, 16],
                learningRate: 0.002,
                epochs: 75,
                batchSize: 8
            }
        };
    }

    async initialize() {
        if (this.isInitialized) {
            logger.ai('AI Analyzer already initialized');
            return;
        }

        try {
            logger.ai('Initializing AI Analyzer...');

            // Initialize TensorFlow.js backend
            await tf.ready();
            logger.ai('TensorFlow.js backend ready');

            // Create models
            await this.createModels();

            // Load pre-trained weights if available
            await this.loadPretrainedWeights();

            this.isInitialized = true;
            logger.ai('AI Analyzer initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize AI Analyzer:', error);
            throw error;
        }
    }

    async createModels() {
        try {
            // Price Prediction Model
            this.models.set('pricePredictor', this.createPricePredictionModel());
            
            // Volatility Prediction Model
            this.models.set('volatilityPredictor', this.createVolatilityPredictionModel());
            
            // Sentiment Analysis Model
            this.models.set('sentimentAnalyzer', this.createSentimentAnalysisModel());

            logger.ai('All AI models created successfully');

        } catch (error) {
            logger.error('Failed to create AI models:', error);
            throw error;
        }
    }

    createPricePredictionModel() {
        const config = this.modelConfigs.pricePredictor;
        
        const model = tf.sequential({
            layers: [
                tf.layers.lstm({
                    units: config.hiddenLayers[0],
                    returnSequences: true,
                    inputShape: config.inputShape,
                    dropout: 0.2,
                    recurrentDropout: 0.2
                }),
                tf.layers.lstm({
                    units: config.hiddenLayers[1],
                    returnSequences: true,
                    dropout: 0.2,
                    recurrentDropout: 0.2
                }),
                tf.layers.lstm({
                    units: config.hiddenLayers[2],
                    dropout: 0.2,
                    recurrentDropout: 0.2
                }),
                tf.layers.dense({
                    units: config.outputShape,
                    activation: 'softmax'
                })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(config.learningRate),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        logger.ai('Price prediction model created', {
            params: model.countParams(),
            layers: model.layers.length
        });

        return model;
    }

    createVolatilityPredictionModel() {
        const config = this.modelConfigs.volatilityPredictor;
        
        const model = tf.sequential({
            layers: [
                tf.layers.lstm({
                    units: config.hiddenLayers[0],
                    returnSequences: true,
                    inputShape: config.inputShape,
                    dropout: 0.1
                }),
                tf.layers.lstm({
                    units: config.hiddenLayers[1],
                    returnSequences: false,
                    dropout: 0.1
                }),
                tf.layers.dense({
                    units: config.hiddenLayers[2],
                    activation: 'relu'
                }),
                tf.layers.dense({
                    units: config.outputShape,
                    activation: 'linear'
                })
            ]
        });

        // FIXED: Use 'mae' instead of 'meanAbsoluteError'
        model.compile({
            optimizer: tf.train.adam(config.learningRate),
            loss: 'meanSquaredError',
            metrics: ['mae'] // Changed from 'meanAbsoluteError' to 'mae'
        });

        logger.ai('Volatility prediction model created', {
            params: model.countParams(),
            layers: model.layers.length
        });

        return model;
    }

    createSentimentAnalysisModel() {
        const config = this.modelConfigs.sentimentAnalyzer;
        
        const model = tf.sequential({
            layers: [
                tf.layers.dense({
                    units: config.hiddenLayers[0],
                    activation: 'relu',
                    inputShape: [config.inputShape[0]]
                }),
                tf.layers.dropout({ rate: 0.3 }),
                tf.layers.dense({
                    units: config.hiddenLayers[1],
                    activation: 'relu'
                }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({
                    units: config.outputShape,
                    activation: 'softmax'
                })
            ]
        });

        model.compile({
            optimizer: tf.train.adam(config.learningRate),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        logger.ai('Sentiment analysis model created', {
            params: model.countParams(),
            layers: model.layers.length
        });

        return model;
    }

    async loadPretrainedWeights() {
        try {
            // In a real implementation, you would load weights from file system
            // For now, we'll use randomly initialized weights
            logger.ai('Using randomly initialized weights (no pretrained weights found)');
        } catch (error) {
            logger.ai('No pretrained weights found, using random initialization');
        }
    }

    async analyzeMarket(marketData, technicalIndicators, priceHistory) {
        if (!this.isInitialized) {
            logger.error('AI Analyzer not initialized');
            return null;
        }

        try {
            const analysis = {
                symbol: marketData.symbol,
                timestamp: Date.now(),
                predictions: {},
                confidence: 0,
                recommendations: []
            };

            // Price direction prediction
            const priceFeatures = this.preparePriceFeatures(priceHistory, technicalIndicators);
            if (priceFeatures) {
                analysis.predictions.priceDirection = await this.predictPriceDirection(priceFeatures);
            }

            // Volatility prediction
            const volatilityFeatures = this.prepareVolatilityFeatures(priceHistory);
            if (volatilityFeatures) {
                analysis.predictions.volatility = await this.predictVolatility(volatilityFeatures);
            }

            // Sentiment analysis
            const sentimentFeatures = this.prepareSentimentFeatures(technicalIndicators);
            if (sentimentFeatures) {
                analysis.predictions.sentiment = await this.analyzeSentiment(sentimentFeatures);
            }

            // Calculate overall confidence
            analysis.confidence = this.calculateOverallConfidence(analysis.predictions);

            // Generate recommendations
            analysis.recommendations = this.generateRecommendations(analysis.predictions);

            // Store prediction history
            this.storePredictionHistory(marketData.symbol, analysis);

            // Emit analysis event
            this.emit('analysisComplete', analysis);

            return analysis;

        } catch (error) {
            logger.error('Market analysis failed:', error);
            return null;
        }
    }

    preparePriceFeatures(priceHistory, technicalIndicators) {
        if (!priceHistory || priceHistory.length < this.modelConfigs.pricePredictor.inputShape[0]) {
            return null;
        }

        const lookback = this.modelConfigs.pricePredictor.inputShape[0];
        const recentHistory = priceHistory.slice(-lookback);

        const features = recentHistory.map(candle => [
            this.normalize(candle.open, priceHistory.map(c => c.open)),
            this.normalize(candle.high, priceHistory.map(c => c.high)),
            this.normalize(candle.low, priceHistory.map(c => c.low)),
            this.normalize(candle.close, priceHistory.map(c => c.close)),
            this.normalize(candle.volume, priceHistory.map(c => c.volume)),
            technicalIndicators.RSI ? technicalIndicators.RSI / 100 : 0.5
        ]);

        return features;
    }

    prepareVolatilityFeatures(priceHistory) {
        if (!priceHistory || priceHistory.length < 50) {
            return null;
        }

        const lookback = 50;
        const recentHistory = priceHistory.slice(-lookback);

        const features = recentHistory.map(candle => [
            this.normalize(candle.high - candle.low, priceHistory.map(c => c.high - c.low)),
            this.normalize(candle.close - candle.open, priceHistory.map(c => c.close - c.open)),
            this.normalize(candle.volume, priceHistory.map(c => c.volume)),
            candle.close > candle.open ? 1 : 0
        ]);

        return features;
    }

    prepareSentimentFeatures(technicalIndicators) {
        if (!technicalIndicators) {
            return null;
        }

        const features = [
            // RSI normalized
            technicalIndicators.RSI ? technicalIndicators.RSI / 100 : 0.5,
            
            // MACD signals
            technicalIndicators.MACD ? Math.tanh(technicalIndicators.MACD / 100) : 0,
            technicalIndicators.MACDSignal ? Math.tanh(technicalIndicators.MACDSignal / 100) : 0,
            technicalIndicators.MACDHistogram ? Math.tanh(technicalIndicators.MACDHistogram / 100) : 0,
            
            // Bollinger Bands position
            technicalIndicators.price && technicalIndicators.BB_Upper && technicalIndicators.BB_Lower ?
                (technicalIndicators.price - technicalIndicators.BB_Lower) / 
                (technicalIndicators.BB_Upper - technicalIndicators.BB_Lower) : 0.5,
            
            // Stochastic indicators
            technicalIndicators.StochK ? technicalIndicators.StochK / 100 : 0.5,
            technicalIndicators.StochD ? technicalIndicators.StochD / 100 : 0.5,
            
            // Volume indicators
            technicalIndicators.VolumeRatio ? Math.tanh(technicalIndicators.VolumeRatio) : 0.5,
            
            // ADX for trend strength
            technicalIndicators.ADX ? technicalIndicators.ADX / 100 : 0.5,
            
            // Williams %R
            technicalIndicators.WilliamsR ? (technicalIndicators.WilliamsR + 100) / 100 : 0.5,
            
            // CCI normalized
            technicalIndicators.CCI ? Math.tanh(technicalIndicators.CCI / 100) : 0,
            
            // Moving average relationships
            technicalIndicators.SMA_20 && technicalIndicators.SMA_50 ?
                Math.tanh((technicalIndicators.SMA_20 - technicalIndicators.SMA_50) / technicalIndicators.SMA_50 * 100) : 0,
            
            // EMA relationships
            technicalIndicators.EMA_12 && technicalIndicators.EMA_26 && technicalIndicators.price ?
                Math.tanh((technicalIndicators.price - technicalIndicators.EMA_12) / technicalIndicators.price * 100) : 0,
            
            technicalIndicators.EMA_12 && technicalIndicators.EMA_26 ?
                Math.tanh((technicalIndicators.EMA_12 - technicalIndicators.EMA_26) / technicalIndicators.EMA_26 * 100) : 0,
            
            // Additional normalized features
            ...Array(6).fill(0.5) // Placeholder for additional features
        ];

        return features.slice(0, 20); // Ensure exactly 20 features
    }

    async predictPriceDirection(features) {
        try {
            const model = this.models.get('pricePredictor');
            if (!model) throw new Error('Price prediction model not found');

            const inputTensor = tf.tensor3d([features]);
            const prediction = model.predict(inputTensor);
            const probabilities = await prediction.data();

            inputTensor.dispose();
            prediction.dispose();

            return {
                up: probabilities[0],
                down: probabilities[1],
                sideways: probabilities[2],
                direction: this.getMaxProbabilityDirection(probabilities),
                confidence: Math.max(...probabilities)
            };

        } catch (error) {
            logger.error('Price direction prediction failed:', error);
            return null;
        }
    }

    async predictVolatility(features) {
        try {
            const model = this.models.get('volatilityPredictor');
            if (!model) throw new Error('Volatility prediction model not found');

            const inputTensor = tf.tensor3d([features]);
            const prediction = model.predict(inputTensor);
            const volatility = await prediction.data();

            inputTensor.dispose();
            prediction.dispose();

            return {
                predicted: Math.abs(volatility[0]) * 100, // Convert to percentage
                level: this.categorizeVolatility(Math.abs(volatility[0]) * 100)
            };

        } catch (error) {
            logger.error('Volatility prediction failed:', error);
            return null;
        }
    }

    async analyzeSentiment(features) {
        try {
            const model = this.models.get('sentimentAnalyzer');
            if (!model) throw new Error('Sentiment analysis model not found');

            const inputTensor = tf.tensor2d([features]);
            const prediction = model.predict(inputTensor);
            const probabilities = await prediction.data();

            inputTensor.dispose();
            prediction.dispose();

            return {
                bullish: probabilities[0],
                bearish: probabilities[1],
                neutral: probabilities[2],
                sentiment: this.getMaxProbabilitySentiment(probabilities),
                confidence: Math.max(...probabilities)
            };

        } catch (error) {
            logger.error('Sentiment analysis failed:', error);
            return null;
        }
    }

    getMaxProbabilityDirection(probabilities) {
        const maxIndex = probabilities.indexOf(Math.max(...probabilities));
        return ['up', 'down', 'sideways'][maxIndex];
    }

    getMaxProbabilitySentiment(probabilities) {
        const maxIndex = probabilities.indexOf(Math.max(...probabilities));
        return ['bullish', 'bearish', 'neutral'][maxIndex];
    }

    categorizeVolatility(volatilityPercent) {
        if (volatilityPercent < 2) return 'low';
        if (volatilityPercent < 5) return 'medium';
        if (volatilityPercent < 10) return 'high';
        return 'extreme';
    }

    calculateOverallConfidence(predictions) {
        const confidences = [];
        
        if (predictions.priceDirection) {
            confidences.push(predictions.priceDirection.confidence);
        }
        
        if (predictions.sentiment) {
            confidences.push(predictions.sentiment.confidence);
        }

        return confidences.length > 0 ? _.mean(confidences) : 0;
    }

    generateRecommendations(predictions) {
        const recommendations = [];

        // Price direction recommendations
        if (predictions.priceDirection) {
            const { direction, confidence } = predictions.priceDirection;
            if (confidence > 0.7) {
                recommendations.push({
                    type: 'direction',
                    action: direction === 'up' ? 'BUY' : direction === 'down' ? 'SELL' : 'HOLD',
                    confidence: confidence,
                    reason: `Strong ${direction} signal detected`
                });
            }
        }

        // Volatility recommendations
        if (predictions.volatility) {
            const { level, predicted } = predictions.volatility;
            if (level === 'high' || level === 'extreme') {
                recommendations.push({
                    type: 'volatility',
                    action: 'CAUTION',
                    confidence: 0.8,
                    reason: `High volatility expected (${predicted.toFixed(2)}%)`
                });
            }
        }

        // Sentiment recommendations
        if (predictions.sentiment) {
            const { sentiment, confidence } = predictions.sentiment;
            if (confidence > 0.75) {
                recommendations.push({
                    type: 'sentiment',
                    action: sentiment === 'bullish' ? 'BUY' : sentiment === 'bearish' ? 'SELL' : 'HOLD',
                    confidence: confidence,
                    reason: `Strong ${sentiment} sentiment detected`
                });
            }
        }

        return recommendations;
    }

    storePredictionHistory(symbol, analysis) {
        if (!this.predictionHistory.has(symbol)) {
            this.predictionHistory.set(symbol, []);
        }

        const history = this.predictionHistory.get(symbol);
        history.push({
            timestamp: analysis.timestamp,
            predictions: analysis.predictions,
            confidence: analysis.confidence
        });

        // Keep only last 100 predictions per symbol
        if (history.length > 100) {
            history.shift();
        }
    }

    async saveModels(directory = './models') {
        try {
            const fs = require('fs').promises;
            await fs.mkdir(directory, { recursive: true });

            for (const [modelName, model] of this.models.entries()) {
                const modelPath = `file://${directory}/${modelName}`;
                await model.save(modelPath);
                logger.ai(`Model ${modelName} saved to ${modelPath}`);
            }
            
            return true;
        } catch (error) {
            logger.error('Failed to save models:', error);
            return false;
        }
    }

    async loadModels(directory = './models') {
        try {
            for (const modelName of this.models.keys()) {
                const modelPath = `file://${directory}/${modelName}/model.json`;
                const model = await tf.loadLayersModel(modelPath);
                this.models.set(modelName, model);
                logger.ai(`Model ${modelName} loaded from ${modelPath}`);
            }
            
            return true;
        } catch (error) {
            logger.ai('Failed to load models, using default initialization:', error.message);
            return false;
        }
    }

    // Utility methods
    normalize(value, array) {
        const min = Math.min(...array);
        const max = Math.max(...array);
        if (max === min) return 0.5;
        return (value - min) / (max - min);
    }

    denormalize(normalizedValue, array) {
        const min = Math.min(...array);
        const max = Math.max(...array);
        return normalizedValue * (max - min) + min;
    }

    // Performance tracking
    updatePredictionAccuracy(symbol, actualOutcome) {
        const history = this.predictionHistory.get(symbol);
        if (!history || history.length === 0) return;

        const recentPrediction = history[history.length - 1];
        if (!recentPrediction.predictions.priceDirection) return;

        const predicted = recentPrediction.predictions.priceDirection.direction;
        const wasCorrect = (
            (predicted === 'up' && actualOutcome > 0) ||
            (predicted === 'down' && actualOutcome < 0) ||
            (predicted === 'sideways' && Math.abs(actualOutcome) < 1)
        );

        recentPrediction.wasCorrect = wasCorrect;
        
        // Calculate running accuracy for this symbol
        const correctPredictions = history.filter(p => p.wasCorrect === true).length;
        const totalPredictions = history.filter(p => p.hasOwnProperty('wasCorrect')).length;
        
        if (totalPredictions > 0) {
            const accuracy = correctPredictions / totalPredictions;
            logger.ai(`Prediction accuracy for ${symbol}`, { 
                accuracy: (accuracy * 100).toFixed(2) + '%',
                correct: correctPredictions,
                total: totalPredictions
            });
        }
    }

    getModelAccuracy(modelName) {
        return this.modelAccuracy.get(modelName) || 0;
    }

    getOverallAccuracy() {
        const accuracies = Array.from(this.modelAccuracy.values());
        return accuracies.length > 0 ? _.mean(accuracies) : 0;
    }

    getStatus() {
        return {
            initialized: this.isInitialized,
            models: Array.from(this.models.keys()),
            accuracy: {
                overall: this.getOverallAccuracy(),
                byModel: Object.fromEntries(this.modelAccuracy)
            },
            predictions: {
                total: Array.from(this.predictionHistory.values())
                    .reduce((sum, history) => sum + history.length, 0),
                symbols: this.predictionHistory.size
            }
        };
    }

    // Advanced analysis methods
    async detectAnomalies(marketData, technicalIndicators) {
        const anomalies = [];
        
        // Price anomalies
        if (marketData.priceChangePercent && Math.abs(marketData.priceChangePercent) > 10) {
            anomalies.push({
                type: 'price_spike',
                severity: Math.abs(marketData.priceChangePercent) > 20 ? 'high' : 'medium',
                value: marketData.priceChangePercent,
                description: `Unusual price movement: ${marketData.priceChangePercent.toFixed(2)}%`
            });
        }
        
        // Volume anomalies
        if (technicalIndicators.VolumeRatio && technicalIndicators.VolumeRatio > 5) {
            anomalies.push({
                type: 'volume_spike',
                severity: technicalIndicators.VolumeRatio > 10 ? 'high' : 'medium',
                value: technicalIndicators.VolumeRatio,
                description: `Unusual volume increase: ${technicalIndicators.VolumeRatio.toFixed(2)}x normal`
            });
        }
        
        // RSI extremes
        if (technicalIndicators.RSI) {
            if (technicalIndicators.RSI > 80) {
                anomalies.push({
                    type: 'overbought',
                    severity: 'medium',
                    value: technicalIndicators.RSI,
                    description: `Extremely overbought condition: RSI ${technicalIndicators.RSI.toFixed(2)}`
                });
            } else if (technicalIndicators.RSI < 20) {
                anomalies.push({
                    type: 'oversold',
                    severity: 'medium',
                    value: technicalIndicators.RSI,
                    description: `Extremely oversold condition: RSI ${technicalIndicators.RSI.toFixed(2)}`
                });
            }
        }

        return anomalies;
    }

    async trainModel(modelName, trainingData, validationData) {
        try {
            const model = this.models.get(modelName);
            if (!model) {
                throw new Error(`Model ${modelName} not found`);
            }

            const config = this.modelConfigs[modelName];
            
            logger.ai(`Starting training for ${modelName}...`);

            const history = await model.fit(trainingData.xs, trainingData.ys, {
                epochs: config.epochs,
                batchSize: config.batchSize,
                validationData: validationData ? [validationData.xs, validationData.ys] : null,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        if (epoch % 10 === 0) {
                            logger.ai(`Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, accuracy=${logs.acc?.toFixed(4) || 'N/A'}`);
                        }
                    }
                }
            });

            // Update model accuracy
            const finalAccuracy = history.history.acc ? history.history.acc[history.history.acc.length - 1] : 0;
            this.modelAccuracy.set(modelName, finalAccuracy);

            logger.ai(`Training completed for ${modelName}`, {
                finalLoss: history.history.loss[history.history.loss.length - 1],
                finalAccuracy: finalAccuracy,
                epochs: config.epochs
            });

            return true;

        } catch (error) {
            logger.error(`Failed to train model ${modelName}:`, error);
            return false;
        }
    }

    // Cleanup method
    dispose() {
        try {
            for (const [modelName, model] of this.models.entries()) {
                model.dispose();
                logger.ai(`Model ${modelName} disposed`);
            }
            this.models.clear();
            this.predictions.clear();
            this.trainingData.clear();
            this.predictionHistory.clear();
            this.isInitialized = false;
            
            logger.ai('AI Analyzer disposed successfully');
        } catch (error) {
            logger.error('Error disposing AI Analyzer:', error);
        }
    }
}

module.exports = AIAnalyzer;
