const config = require('../config/config');
const logger = require('./logger');

class PerformanceService {
  constructor() {
    this.stats = {
      startTime: Date.now(),
      usersProcessed: 0,
      verificationsSuccess: 0,
      verificationsFailed: 0,
      apiCalls: 0,
      cacheHits: 0,
      lastBatchTime: 0
    };
  }

  /**
   * Get batch size from config
   */
  getBatchSize() {
    return config.performance?.batchSize || 50;
  }

  /**
   * Process items in batches
   * @param {Array} items - Items to process
   * @param {Function} processor - Async function to process each item
   * @param {number} batchSize - Number of items per batch
   * @param {number} delayBetweenBatches - Delay in ms between batches
   * @returns {Promise<Array>} - Results from all items
   */
  async processBatches(items, processor, batchSize = this.getBatchSize(), delayBetweenBatches = 100) {
    const results = [];
    const batches = this.createBatches(items, batchSize);
    
    logger.debug(`Processing ${items.length} items in ${batches.length} batches of ${batchSize}`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchStartTime = Date.now();
      
      // Process batch items in parallel
      const batchResults = await Promise.all(
        batch.map(item => processor(item).catch(err => ({ error: err.message, item })))
      );
      
      results.push(...batchResults);
      
      const batchTime = Date.now() - batchStartTime;
      this.stats.lastBatchTime = batchTime;
      
      logger.debug(`Batch ${i + 1}/${batches.length} completed in ${batchTime}ms`);

      // Delay between batches (except for the last one)
      if (i < batches.length - 1 && delayBetweenBatches > 0) {
        await this.delay(delayBetweenBatches);
      }
    }

    return results;
  }

  /**
   * Create batches from an array
   * @param {Array} items - Items to batch
   * @param {number} batchSize - Size of each batch
   * @returns {Array<Array>} - Array of batches
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Process all contracts for a user in parallel
   * @param {Function} verifyFn - Function to verify a single contract
   * @param {string} walletAddress - The wallet address
   * @param {Array} contracts - Array of contract configs
   * @returns {Promise<Array>} - Results for each contract
   */
  async verifyContractsParallel(verifyFn, walletAddress, contracts) {
    const startTime = Date.now();
    
    const results = await Promise.all(
      contracts.map(contract => 
        verifyFn(walletAddress, contract).catch(err => ({
          success: false,
          contractId: contract.id,
          contractName: contract.name,
          error: err.message
        }))
      )
    );

    const duration = Date.now() - startTime;
    logger.debug(`Verified ${contracts.length} contracts in ${duration}ms`);

    return results;
  }

  /**
   * Rate limiter
   * @param {number} maxRequests - Maximum requests per interval
   * @param {number} interval - Interval in milliseconds
   * @returns {Function} - Rate-limited function wrapper
   */
  createRateLimiter(maxRequests, interval) {
    const queue = [];
    let requestCount = 0;
    let lastReset = Date.now();

    return async (fn) => {
      const now = Date.now();
      
      // Reset counter if interval has passed
      if (now - lastReset >= interval) {
        requestCount = 0;
        lastReset = now;
      }

      // Wait if we've hit the limit
      while (requestCount >= maxRequests) {
        const waitTime = interval - (Date.now() - lastReset);
        if (waitTime > 0) {
          await this.delay(waitTime);
        }
        requestCount = 0;
        lastReset = Date.now();
      }

      requestCount++;
      return fn();
    };
  }

  /**
   * Delay helper
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate users per minute
   * @param {number} usersProcessed - Number of users processed
   * @param {number} durationMs - Duration in milliseconds
   * @returns {number} - Users per minute
   */
  calculateUsersPerMinute(usersProcessed, durationMs) {
    if (durationMs === 0) return 0;
    return Math.round((usersProcessed / durationMs) * 60000);
  }

  /**
   * Record stats
   */
  recordSuccess() {
    this.stats.usersProcessed++;
    this.stats.verificationsSuccess++;
  }

  recordFailure() {
    this.stats.usersProcessed++;
    this.stats.verificationsFailed++;
  }

  recordApiCall() {
    this.stats.apiCalls++;
  }

  recordCacheHit() {
    this.stats.cacheHits++;
  }

  /**
   * Get performance stats
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const usersPerMinute = this.calculateUsersPerMinute(this.stats.usersProcessed, uptime);
    
    return {
      ...this.stats,
      uptimeMs: uptime,
      uptimeFormatted: this.formatDuration(uptime),
      usersPerMinute,
      cacheHitRate: this.stats.apiCalls > 0 
        ? Math.round((this.stats.cacheHits / (this.stats.apiCalls + this.stats.cacheHits)) * 100) 
        : 0,
      successRate: this.stats.usersProcessed > 0
        ? Math.round((this.stats.verificationsSuccess / this.stats.usersProcessed) * 100)
        : 0
    };
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = {
      startTime: Date.now(),
      usersProcessed: 0,
      verificationsSuccess: 0,
      verificationsFailed: 0,
      apiCalls: 0,
      cacheHits: 0,
      lastBatchTime: 0
    };
  }

  /**
   * Format duration in human-readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} - Formatted duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Estimate time remaining
   * @param {number} totalItems - Total items to process
   * @param {number} processedItems - Items already processed
   * @param {number} startTime - Start time in milliseconds
   * @returns {string} - Estimated time remaining
   */
  estimateTimeRemaining(totalItems, processedItems, startTime) {
    if (processedItems === 0) return 'Calculating...';
    
    const elapsed = Date.now() - startTime;
    const avgTimePerItem = elapsed / processedItems;
    const remaining = totalItems - processedItems;
    const estimatedRemaining = remaining * avgTimePerItem;
    
    return this.formatDuration(estimatedRemaining);
  }

  /**
   * Connection pool for API calls
   */
  createConnectionPool(maxConnections = 10) {
    let activeConnections = 0;
    const queue = [];

    const acquire = () => {
      return new Promise((resolve) => {
        if (activeConnections < maxConnections) {
          activeConnections++;
          resolve();
        } else {
          queue.push(resolve);
        }
      });
    };

    const release = () => {
      activeConnections--;
      if (queue.length > 0) {
        activeConnections++;
        const next = queue.shift();
        next();
      }
    };

    return {
      acquire,
      release,
      getActiveCount: () => activeConnections,
      getQueueLength: () => queue.length
    };
  }

  /**
   * Memory usage stats
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(usage.rss / 1024 / 1024) + ' MB',
      external: Math.round(usage.external / 1024 / 1024) + ' MB'
    };
  }

  /**
   * Throttle function execution
   * @param {Function} fn - Function to throttle
   * @param {number} limit - Minimum time between calls in ms
   * @returns {Function} - Throttled function
   */
  throttle(fn, limit) {
    let lastCall = 0;
    return async (...args) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall;
      
      if (timeSinceLastCall < limit) {
        await this.delay(limit - timeSinceLastCall);
      }
      
      lastCall = Date.now();
      return fn(...args);
    };
  }

  /**
   * Retry with exponential backoff
   * @param {Function} fn - Async function to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} baseDelay - Base delay in ms
   * @returns {Promise} - Result of the function
   */
  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          logger.debug(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }
}

module.exports = new PerformanceService();
