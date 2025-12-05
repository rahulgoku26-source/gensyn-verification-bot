const config = require('../config/config');
const logger = require('../utils/logger');

// Retriable HTTP status codes
const RETRIABLE_STATUS_CODES = [502, 503, 504, 429];

class ExplorerApiService {
  constructor() {
    this.cache = new Map();
    this.rateLimitQueue = [];
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.requestWindow = 60000; // 1 minute window
    this.windowStart = Date.now();
    this.requestTimeout = 30000; // 30 seconds timeout
  }

  /**
   * Get the Explorer API URL
   */
  getApiUrl() {
    return config.explorer?.apiUrl || 'https://gensyn-testnet.explorer.alchemy.com/api';
  }

  /**
   * Get minimum transactions required
   */
  getMinTransactions() {
    return config.explorer?.minTransactions || 3;
  }

  /**
   * Get cache TTL in milliseconds (default 1 hour as per requirements)
   */
  getCacheTTL() {
    return (config.performance?.cacheTTL || 3600) * 1000; // Default 1 hour
  }

  /**
   * Get max concurrent requests
   */
  getMaxConcurrent() {
    return config.performance?.maxConcurrent || 10;
  }

  /**
   * Get requests per second limit
   */
  getRequestsPerSecond() {
    return config.performance?.requestsPerSecond || 10;
  }

  /**
   * Rate limit API calls - 10 requests per second
   */
  async waitForRateLimit() {
    const now = Date.now();
    const minInterval = 1000 / this.getRequestsPerSecond(); // 100ms for 10 req/s
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch with retry logic and exponential backoff
   * @param {string} url - URL to fetch
   * @param {number} retries - Number of retries (default 3)
   * @returns {Promise<Object>} - JSON response
   */
  async fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      let timeoutId;
      try {
        await this.waitForRateLimit();
        
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
        
        const response = await fetch(url, { 
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          return await response.json();
        }
        
        // Retry on retriable status codes (502, 503, 504, 429)
        if (RETRIABLE_STATUS_CODES.includes(response.status)) {
          const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
          logger.debug(`API returned ${response.status}, retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw new Error(`API error: ${response.status}`);
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        if (i === retries - 1) throw error;
        const delay = Math.pow(2, i) * 1000;
        logger.debug(`Request failed, retrying in ${delay}ms`, { error: error.message });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Process items in batches with concurrency limit
   * This processes batches sequentially but items within each batch are parallel
   * @param {Array} items - Items to process
   * @param {Function} processor - Async function to process each item
   * @param {number} concurrency - Maximum concurrent operations per batch
   * @returns {Promise<Array>} - Results from all items
   */
  async processBatches(items, processor, concurrency = this.getMaxConcurrent()) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(item => processor(item)));
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * Fetch with caching support
   * @param {string} url - URL to fetch
   * @returns {Promise<Object>} - JSON response
   */
  async fetchWithCache(url) {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.getCacheTTL()) {
      logger.debug('Cache hit', { url: url.substring(0, 50) + '...' });
      return cached.data;
    }
    
    const data = await this.fetchWithRetry(url);
    this.cache.set(url, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * Get cache key for wallet
   */
  getCacheKey(walletAddress) {
    return `wallet_traces_${walletAddress.toLowerCase()}`;
  }

  /**
   * Check if cached data is still valid
   */
  isCacheValid(cacheEntry) {
    if (!cacheEntry) return false;
    const now = Date.now();
    return (now - cacheEntry.timestamp) < this.getCacheTTL();
  }

  /**
   * Get internal transactions for a wallet address from Block Explorer API
   * This returns parent transaction hashes
   * @param {string} walletAddress - The wallet address to check
   * @returns {Promise<{success: boolean, transactions: Array, error?: string}>}
   */
  async getWalletInternalTransactions(walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    const apiUrl = this.getApiUrl();
    const url = `${apiUrl}?module=account&action=txlistinternal&address=${normalizedAddress}`;

    try {
      const data = await this.fetchWithCache(url);

      if (data.status === '0' && data.message === 'No transactions found') {
        return { success: true, transactions: [] };
      }

      if (data.status !== '1') {
        const errorMsg = data.message || 'Unknown API error';
        logger.error('Explorer API returned error', {
          wallet: normalizedAddress.substring(0, 10) + '...',
          status: data.status,
          message: errorMsg
        });
        throw new Error(errorMsg);
      }

      return { success: true, transactions: data.result || [] };
    } catch (error) {
      logger.error('Explorer API error', { 
        wallet: normalizedAddress.substring(0, 10) + '...',
        error: error.message 
      });
      return { success: false, transactions: [], error: error.message };
    }
  }

  /**
   * Get transaction trace (full internal transactions) for a transaction hash
   * @param {string} txHash - Transaction hash
   * @returns {Promise<{success: boolean, transactions: Array, error?: string}>}
   */
  async getTransactionTrace(txHash) {
    const apiUrl = this.getApiUrl();
    const url = `${apiUrl}?module=account&action=txlistinternal&txhash=${txHash}`;

    try {
      const data = await this.fetchWithCache(url);

      if (data.status === '0' && data.message === 'No transactions found') {
        return { success: true, transactions: [] };
      }

      if (data.status !== '1') {
        const errorMsg = data.message || 'Unknown API error';
        throw new Error(errorMsg);
      }

      return { success: true, transactions: data.result || [] };
    } catch (error) {
      logger.debug('Transaction trace error', { txHash: txHash.substring(0, 10) + '...', error: error.message });
      return { success: false, transactions: [], error: error.message };
    }
  }

  /**
   * Get all internal transactions for a wallet by fetching traces for each parent tx
   * This is the CORRECT verification logic:
   * 1. Get wallet's internal transactions (returns parent tx hashes)
   * 2. For each parent tx hash, get the full transaction trace
   * 3. Search for contract addresses in the trace
   * @param {string} walletAddress - The wallet address to check
   * @returns {Promise<{success: boolean, transactions: Array, error?: string}>}
   */
  async getAllInternalTransactions(walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    const cacheKey = this.getCacheKey(normalizedAddress);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (this.isCacheValid(cached)) {
      logger.debug('Using cached transaction data', { wallet: normalizedAddress.substring(0, 10) + '...' });
      return { success: true, transactions: cached.data };
    }

    try {
      // Step 1: Get wallet's internal transactions
      logger.debug('Fetching wallet internal transactions', { wallet: normalizedAddress.substring(0, 10) + '...' });
      const walletTxns = await this.getWalletInternalTransactions(normalizedAddress);
      
      if (!walletTxns.success) {
        return { success: false, transactions: [], error: walletTxns.error };
      }

      if (walletTxns.transactions.length === 0) {
        this.cache.set(cacheKey, { data: [], timestamp: Date.now() });
        return { success: true, transactions: [] };
      }

      // Step 2: Get unique parent transaction hashes (filter out null, undefined, and empty strings)
      const txHashes = [...new Set(
        walletTxns.transactions
          .map(tx => tx.transactionHash)
          .filter(hash => hash !== null && hash !== undefined && hash !== '')
      )];
      logger.debug('Found unique tx hashes', { count: txHashes.length, wallet: normalizedAddress.substring(0, 10) + '...' });

      // Step 3: Fetch all transaction traces in batched parallel (respecting concurrency limit)
      const traces = await this.processBatches(
        txHashes,
        hash => this.getTransactionTrace(hash),
        this.getMaxConcurrent()
      );

      // Step 4: Flatten all internal txns from all traces
      const allInternalTxns = traces
        .filter(t => t.success)
        .flatMap(t => t.transactions);

      logger.debug('Fetched all transaction traces', { 
        wallet: normalizedAddress.substring(0, 10) + '...',
        totalTxns: allInternalTxns.length 
      });

      // Cache the result
      this.cache.set(cacheKey, { data: allInternalTxns, timestamp: Date.now() });

      return { success: true, transactions: allInternalTxns };

    } catch (error) {
      logger.error('Explorer API error', { 
        wallet: normalizedAddress.substring(0, 10) + '...',
        error: error.message 
      });
      return { success: false, transactions: [], error: error.message };
    }
  }

  /**
   * Legacy method - Get internal transactions (for backward compatibility)
   * Now uses the new getAllInternalTransactions method
   * @param {string} walletAddress - The wallet address to check
   * @returns {Promise<{success: boolean, transactions: Array, error?: string}>}
   */
  async getInternalTransactions(walletAddress) {
    return this.getAllInternalTransactions(walletAddress);
  }

  /**
   * Gets matching transactions for a specific contract address.
   * Checks to, from, and contractAddress fields.
   * @param {Array} transactions - List of internal transactions
   * @param {string} contractAddress - The contract address to filter by
   * @returns {Array} - Matching transactions
   */
  getMatchingTransactions(transactions, contractAddress) {
    const normalizedContract = contractAddress.toLowerCase();
    
    return transactions.filter(tx => {
      const toAddress = (tx.to || '').toLowerCase();
      const fromAddress = (tx.from || '').toLowerCase();
      const txContractAddress = (tx.contractAddress || '').toLowerCase();
      
      return toAddress === normalizedContract || 
             fromAddress === normalizedContract ||
             txContractAddress === normalizedContract;
    });
  }

  /**
   * Count UNIQUE transaction hashes for a specific contract address
   * This is the CORRECT count as per requirements - count unique tx hashes, not individual internal calls
   * @param {Array} transactions - List of transactions
   * @param {string} contractAddress - The contract address to filter by
   * @returns {number} - Number of unique transactions to/from the contract
   */
  countTransactionsForContract(transactions, contractAddress) {
    const matchingTxns = this.getMatchingTransactions(transactions, contractAddress);
    
    // Count unique transaction hashes (not individual internal calls), filter out null, undefined, and empty strings
    const uniqueTxHashes = [...new Set(
      matchingTxns
        .map(tx => tx.transactionHash)
        .filter(hash => hash !== null && hash !== undefined && hash !== '')
    )];
    
    return uniqueTxHashes.length;
  }

  /**
   * Get transaction details for a contract
   * @param {Array} transactions - List of transactions
   * @param {string} contractAddress - The contract address to filter by
   * @returns {Array} - Filtered transactions
   */
  getTransactionsForContract(transactions, contractAddress) {
    return this.getMatchingTransactions(transactions, contractAddress);
  }

  /**
   * Verify a wallet against a single contract
   * @param {string} walletAddress - The wallet address
   * @param {Object} contract - The contract configuration
   * @returns {Promise<Object>} - Verification result
   */
  async verifySingleContract(walletAddress, contract) {
    const normalizedWallet = walletAddress.toLowerCase();
    const minTxns = this.getMinTransactions();

    try {
      const { success, transactions, error } = await this.getInternalTransactions(normalizedWallet);

      if (!success) {
        return {
          success: false,
          contractId: contract.id,
          contractName: contract.name,
          contractAddress: contract.address,
          roleId: contract.roleId,
          txnCount: 0,
          error: error || 'API error - retry later'
        };
      }

      const txnCount = this.countTransactionsForContract(transactions, contract.address);
      const contractTxns = this.getTransactionsForContract(transactions, contract.address);

      if (txnCount < minTxns) {
        const reason = txnCount === 0 
          ? 'No transactions found'
          : `Only ${txnCount} txns found (min ${minTxns} required)`;
        
        return {
          success: false,
          contractId: contract.id,
          contractName: contract.name,
          contractAddress: contract.address,
          roleId: contract.roleId,
          txnCount,
          error: reason
        };
      }

      // Get the most recent transaction hash
      const latestTxn = contractTxns[0];
      const txHash = latestTxn?.hash || latestTxn?.transactionHash || 'N/A';
      const blockNumber = latestTxn?.blockNumber || 'N/A';

      return {
        success: true,
        contractId: contract.id,
        contractName: contract.name,
        contractAddress: contract.address,
        roleId: contract.roleId,
        txnCount,
        hash: txHash,
        blockNumber: blockNumber.toString(),
        contract
      };

    } catch (error) {
      logger.error('Verification error', {
        wallet: normalizedWallet.substring(0, 10) + '...',
        contract: contract.name,
        error: error.message
      });

      return {
        success: false,
        contractId: contract.id,
        contractName: contract.name,
        contractAddress: contract.address,
        roleId: contract.roleId,
        txnCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Verify a wallet against all configured contracts (parallel processing)
   * @param {string} walletAddress - The wallet address
   * @returns {Promise<Array>} - Array of verification results for each contract
   */
  async verifyAllContracts(walletAddress) {
    const normalizedWallet = walletAddress.toLowerCase();

    try {
      // First, fetch transactions once (will be cached)
      const { success, transactions, error } = await this.getInternalTransactions(normalizedWallet);

      if (!success) {
        // Return error for all contracts
        return config.contracts.map(contract => ({
          success: false,
          contractId: contract.id,
          contractName: contract.name,
          contractAddress: contract.address,
          roleId: contract.roleId,
          txnCount: 0,
          error: error || 'API error - retry later'
        }));
      }

      const minTxns = this.getMinTransactions();

      // Process all contracts in parallel using cached transaction data
      const results = await Promise.all(
        config.contracts.map(async (contract) => {
          const txnCount = this.countTransactionsForContract(transactions, contract.address);
          const contractTxns = this.getTransactionsForContract(transactions, contract.address);

          if (txnCount < minTxns) {
            const reason = txnCount === 0 
              ? 'No transactions found'
              : `Only ${txnCount} txns found (min ${minTxns} required)`;
            
            return {
              success: false,
              contractId: contract.id,
              contractName: contract.name,
              contractAddress: contract.address,
              roleId: contract.roleId,
              txnCount,
              error: reason
            };
          }

          // Get the most recent transaction
          const latestTxn = contractTxns[0];
          const txHash = latestTxn?.hash || latestTxn?.transactionHash || 'N/A';
          const blockNumber = latestTxn?.blockNumber || 'N/A';

          return {
            success: true,
            contractId: contract.id,
            contractName: contract.name,
            contractAddress: contract.address,
            roleId: contract.roleId,
            txnCount,
            hash: txHash,
            blockNumber: blockNumber.toString(),
            contract
          };
        })
      );

      return results;

    } catch (error) {
      logger.error('Verify all contracts error', {
        wallet: normalizedWallet.substring(0, 10) + '...',
        error: error.message
      });

      // Return error for all contracts
      return config.contracts.map(contract => ({
        success: false,
        contractId: contract.id,
        contractName: contract.name,
        contractAddress: contract.address,
        roleId: contract.roleId,
        txnCount: 0,
        error: error.message
      }));
    }
  }

  /**
   * Check if a wallet has valid transactions for verification (any contract)
   * @param {string} walletAddress - The wallet address
   * @returns {Promise<Object>} - Result with found status and contract info
   */
  async checkWallet(walletAddress) {
    const normalizedWallet = walletAddress.toLowerCase();
    const minTxns = this.getMinTransactions();

    try {
      const { success, transactions, error } = await this.getInternalTransactions(normalizedWallet);

      if (!success) {
        return {
          found: false,
          error: error || 'API error - retry later'
        };
      }

      // Check each contract
      const contractResults = [];
      for (const contract of config.contracts) {
        const txnCount = this.countTransactionsForContract(transactions, contract.address);
        const contractTxns = this.getTransactionsForContract(transactions, contract.address);
        
        if (txnCount >= minTxns) {
          const latestTxn = contractTxns[0];
          contractResults.push({
            contract,
            txnCount,
            hash: latestTxn?.hash || latestTxn?.transactionHash || 'N/A',
            blockNumber: latestTxn?.blockNumber || 'N/A',
            verified: true
          });
        } else {
          contractResults.push({
            contract,
            txnCount,
            verified: false
          });
        }
      }

      const verifiedContracts = contractResults.filter(r => r.verified);
      
      if (verifiedContracts.length > 0) {
        return {
          found: true,
          results: contractResults,
          verifiedCount: verifiedContracts.length,
          totalContracts: config.contracts.length
        };
      }

      return {
        found: false,
        results: contractResults,
        error: `No contract has ${minTxns}+ transactions`
      };

    } catch (error) {
      return {
        found: false,
        error: error.message
      };
    }
  }

  /**
   * Get wallet transaction summary for all contracts
   * @param {string} walletAddress - The wallet address
   * @returns {Promise<Object>} - Summary of transactions per contract
   */
  async getWalletSummary(walletAddress) {
    const normalizedWallet = walletAddress.toLowerCase();

    try {
      const { success, transactions, error } = await this.getInternalTransactions(normalizedWallet);

      if (!success) {
        return { success: false, error };
      }

      const summary = {};
      for (const contract of config.contracts) {
        const txnCount = this.countTransactionsForContract(transactions, contract.address);
        summary[contract.id] = {
          name: contract.name,
          address: contract.address,
          txnCount,
          verified: txnCount >= this.getMinTransactions()
        };
      }

      return {
        success: true,
        totalTransactions: transactions.length,
        summary
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('Explorer API cache cleared');
  }

  /**
   * Get cache size
   */
  getCacheSize() {
    return this.cache.size;
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      // Use a known test address or the first contract address
      const testAddress = config.contracts[0]?.address || '0x0000000000000000000000000000000000000000';
      const apiUrl = this.getApiUrl();
      const url = `${apiUrl}?module=account&action=txlistinternal&address=${testAddress}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        return {
          success: false,
          error: `API responded with status ${response.status}`
        };
      }

      const data = await response.json();
      
      return {
        success: true,
        apiUrl,
        status: data.status,
        message: data.message
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new ExplorerApiService();
