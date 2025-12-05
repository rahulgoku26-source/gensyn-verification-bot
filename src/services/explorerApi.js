const config = require('../config/config');
const logger = require('../utils/logger');

class ExplorerApiService {
  constructor() {
    this.cache = new Map();
    this.rateLimitQueue = [];
    this.lastRequestTime = 0;
    this.minRequestInterval = 600; // 100 requests per minute = 600ms between requests
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
   * Get cache TTL in milliseconds
   */
  getCacheTTL() {
    return (config.performance?.cacheTTL || 300) * 1000; // Default 5 minutes
  }

  /**
   * Rate limit API calls
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Get cache key for wallet
   */
  getCacheKey(walletAddress) {
    return `txns_${walletAddress.toLowerCase()}`;
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
   * @param {string} walletAddress - The wallet address to check
   * @returns {Promise<{success: boolean, transactions: Array, error?: string}>}
   */
  async getInternalTransactions(walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    const cacheKey = this.getCacheKey(normalizedAddress);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (this.isCacheValid(cached)) {
      logger.debug('Using cached transaction data', { wallet: normalizedAddress.substring(0, 10) + '...' });
      return { success: true, transactions: cached.data };
    }

    try {
      await this.waitForRateLimit();

      const apiUrl = this.getApiUrl();
      const url = `${apiUrl}?module=account&action=txlistinternal&address=${normalizedAddress}`;

      logger.debug('Fetching internal transactions from Explorer API', { 
        wallet: normalizedAddress.substring(0, 10) + '...',
        url: url.replace(normalizedAddress, normalizedAddress.substring(0, 10) + '...')
      });

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();

      if (data.status === '0' && data.message === 'No transactions found') {
        // Cache empty result
        this.cache.set(cacheKey, { data: [], timestamp: Date.now() });
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

      const transactions = data.result || [];

      // Cache the result
      this.cache.set(cacheKey, { data: transactions, timestamp: Date.now() });

      logger.debug('Fetched transactions from Explorer API', { 
        wallet: normalizedAddress.substring(0, 10) + '...',
        count: transactions.length 
      });

      return { success: true, transactions };

    } catch (error) {
      logger.error('Explorer API error', { 
        wallet: normalizedAddress.substring(0, 10) + '...',
        error: error.message 
      });
      return { success: false, transactions: [], error: error.message };
    }
  }

  /**
   * Count transactions for a specific contract address
   * @param {Array} transactions - List of transactions
   * @param {string} contractAddress - The contract address to filter by
   * @returns {number} - Number of transactions to/from the contract
   */
  countTransactionsForContract(transactions, contractAddress) {
    const normalizedContract = contractAddress.toLowerCase();
    
    return transactions.filter(tx => {
      const toAddress = (tx.to || '').toLowerCase();
      const fromAddress = (tx.from || '').toLowerCase();
      return toAddress === normalizedContract || fromAddress === normalizedContract;
    }).length;
  }

  /**
   * Get transaction details for a contract
   * @param {Array} transactions - List of transactions
   * @param {string} contractAddress - The contract address to filter by
   * @returns {Array} - Filtered transactions
   */
  getTransactionsForContract(transactions, contractAddress) {
    const normalizedContract = contractAddress.toLowerCase();
    
    return transactions.filter(tx => {
      const toAddress = (tx.to || '').toLowerCase();
      const fromAddress = (tx.from || '').toLowerCase();
      return toAddress === normalizedContract || fromAddress === normalizedContract;
    });
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
