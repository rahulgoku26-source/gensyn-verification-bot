const { ethers } = require('ethers');
const config = require('../config/config');
const logger = require('../utils/logger');

class BlockchainService {
  constructor() {
    this.providers = new Map();
    this.cache = new Map();
    
    // Initialize provider for each contract with its own RPC URL(if they have any different RPC URL)
    config.contracts.forEach(contract => {
      this.providers.set(
        contract.id, 
        new ethers.JsonRpcProvider(contract.rpcUrl)
      );
      logger.debug(`Provider initialized for ${contract.name}`, { rpc: contract.rpcUrl });
    });

    // Default provider (first contract's RPC)
    if (config.contracts.length > 0) {
      this.provider = this.providers.get(config.contracts[0].id);
    }
  }

  // Get provider for specific contract (or default)
  getProvider(contractId = null) {
    if (contractId && this.providers.has(contractId)) {
      return this.providers.get(contractId);
    }
    return this.provider;
  }

  async testConnection() {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      const network = await this.provider.getNetwork();
      logger.blockchain('Connection established', { 
        blockNumber, 
        chainId: network.chainId.toString() 
      });
      return { 
        success: true, 
        blockNumber, 
        chainId: network.chainId.toString() 
      };
    } catch (error) {
      logger.error('Blockchain connection failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  // Test connection for all configured providers
  async testAllConnections() {
    const results = [];
    
    for (const contract of config.contracts) {
      try {
        const provider = this.providers.get(contract.id);
        const blockNumber = await provider.getBlockNumber();
        const network = await provider.getNetwork();
        results.push({
          contractId: contract.id,
          contractName: contract.name,
          rpcUrl: contract.rpcUrl,
          success: true,
          blockNumber,
          chainId: network.chainId.toString()
        });
        logger.debug(`Connection test passed for ${contract.name}`);
      } catch (error) {
        results.push({
          contractId: contract.id,
          contractName: contract.name,
          rpcUrl: contract.rpcUrl,
          success: false,
          error: error.message
        });
        logger.error(`Connection test failed for ${contract.name}`, { 
          error: error.message 
        });
      }
    }

    return results;
  }

  async getCurrentBlock(contractId = null) {
    try {
      const provider = this.getProvider(contractId);
      return await provider.getBlockNumber();
    } catch (error) {
      logger.error('Failed to get current block', { error: error.message });
      return null;
    }
  }

  async getTransactionCount(walletAddress, contractId = null) {
    try {
      const provider = this.getProvider(contractId);
      return await provider.getTransactionCount(walletAddress);
    } catch (error) {
      logger.error('Failed to get transaction count', { 
        wallet: walletAddress, 
        error: error.message 
      });
      return 0;
    }
  }

  // Check if wallet has interacted with a specific contract
  async hasInteractedWithContract(walletAddress, contractAddress, contractId = null) {
    try {
      const result = await this.findTransactionToContract(
        walletAddress,
        contractAddress,
        0,
        await this.getCurrentBlock(contractId),
        contractId
      );
      return result.found;
    } catch (error) {
      logger.error('Error checking contract interaction', { 
        wallet: walletAddress, 
        contract: contractAddress,
        error: error.message 
      });
      return false;
    }
  }

  // Find transaction to ANY of the configured contracts
  async findTransactionToAnyContract(walletAddress, fromBlock, toBlock) {
    const normalizedWallet = walletAddress.toLowerCase();

    logger.blockchain('Searching for transactions to any contract', { 
      wallet: normalizedWallet,
      contracts: config.contracts.length,
      fromBlock, 
      toBlock 
    });

    try {
      // Method 1: Check logs for each contract (using per-contract provider)
      for (const contract of config.contracts) {
        try {
          const provider = this.getProvider(contract.id);
          
          const logs = await provider.getLogs({
            address: contract.address,
            fromBlock,
            toBlock: 'latest'
          });

          logger.debug(`Found ${logs.length} events for ${contract.name}`);

          for (const log of logs) {
            const tx = await provider.getTransaction(log.transactionHash);
            if (tx && tx.from.toLowerCase() === normalizedWallet) {
              logger.blockchain('Transaction found via logs', { 
                hash: tx.hash, 
                contract: contract.name 
              });
              return { tx, found: true, contract };
            }
          }
        } catch (logError) {
          logger.debug(`Log search failed for ${contract.name}`, { 
            error: logError.message 
          });
        }
      }

      // Method 2: Block scanning fallback (using per-contract provider)
      const scanLimit = Math.min(100, toBlock - fromBlock);
      const startBlock = Math.max(fromBlock, toBlock - scanLimit);

      logger.debug(`Scanning blocks ${startBlock} to ${toBlock}`);

      for (const contract of config.contracts) {
        const provider = this.getProvider(contract.id);
        
        for (let i = toBlock; i >= startBlock; i--) {
          const block = await provider.getBlock(i, true);
          
          if (!block || !block.transactions) continue;

          for (const tx of block.transactions) {
            if (typeof tx === 'object' && 
                tx.from?.toLowerCase() === normalizedWallet &&
                tx.to?.toLowerCase() === contract.address.toLowerCase()) {
              logger.blockchain('Transaction found via block scan', { 
                hash: tx.hash, 
                contract: contract.name,
                block: i 
              });
              return { tx, found: true, contract };
            }
          }
        }
      }

      logger.blockchain('No transactions found to any contract', { 
        wallet: normalizedWallet 
      });
      return { found: false };

    } catch (error) {
      logger.error('Error searching transactions', { 
        wallet: normalizedWallet, 
        error: error.message 
      });
      throw error;
    }
  }

  // Find transaction to a SPECIFIC contract
  async findTransactionToContract(
    walletAddress, 
    contractAddress, 
    fromBlock, 
    toBlock, 
    contractId = null
  ) {
    const normalizedWallet = walletAddress.toLowerCase();
    const normalizedContract = contractAddress.toLowerCase();
    const cacheKey = `${normalizedWallet}-${normalizedContract}-${fromBlock}-${toBlock}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      logger.debug('Transaction found in cache');
      return this.cache.get(cacheKey);
    }

    const provider = this.getProvider(contractId);

    logger.blockchain('Searching for transaction to specific contract', { 
      wallet: normalizedWallet,
      contract: contractAddress,
      fromBlock, 
      toBlock 
    });

    try {
      // Method 1: Use event logs
      const logs = await provider.getLogs({
        address: normalizedContract,
        fromBlock,
        toBlock: 'latest'
      });

      logger.debug(`Found ${logs.length} contract events`);

      for (const log of logs) {
        const tx = await provider.getTransaction(log.transactionHash);
        if (tx && tx.from.toLowerCase() === normalizedWallet) {
          const contract = config.getContractByAddress(contractAddress);
          const result = { tx, found: true, contract };
          this.cache.set(cacheKey, result);
          return result;
        }
      }

      // Method 2: Block scanning
      const scanLimit = Math.min(100, toBlock - fromBlock);
      const startBlock = Math.max(fromBlock, toBlock - scanLimit);

      for (let i = toBlock; i >= startBlock; i--) {
        const block = await provider.getBlock(i, true);
        
        if (!block || !block.transactions) continue;

        for (const tx of block.transactions) {
          if (typeof tx === 'object' && 
              tx.from?.toLowerCase() === normalizedWallet && 
              tx.to?.toLowerCase() === normalizedContract) {
            const contract = config.getContractByAddress(contractAddress);
            const result = { tx, found: true, contract };
            this.cache.set(cacheKey, result);
            return result;
          }
        }
      }

      return { found: false };

    } catch (error) {
      logger.error('Error searching transactions', { 
        wallet: normalizedWallet,
        contract: contractAddress,
        error: error.message 
      });
      throw error;
    }
  }

  // Verify a single contract for a wallet
  async verifySingleContract(walletAddress, contractId) {
    const normalizedWallet = walletAddress.toLowerCase();
    const contract = config.getContractById(contractId);
    
    if (!contract) {
      return { 
        success: false, 
        error: 'Invalid contract ID',
        contractId
      };
    }

    try {
      logger.blockchain('Verifying single contract', { 
        wallet: normalizedWallet,
        contract: contract.name 
      });

      const provider = this.getProvider(contractId);
      const currentBlock = await provider.getBlockNumber();
      
      if (!currentBlock) {
        return { 
          success: false, 
          error: 'Failed to get current block number',
          contractId,
          contractName: contract.name
        };
      }

      const txCount = await provider.getTransactionCount(normalizedWallet);
      
      if (txCount === 0) {
        return { 
          success: false, 
          error: 'Wallet has no transactions',
          contractId,
          contractName: contract.name
        };
      }

      const searchBlocks = config.blockchain.searchBlocks;
      const fromBlock = Math.max(0, currentBlock - searchBlocks);

      const searchResult = await this.findTransactionToContract(
        normalizedWallet,
        contract.address,
        fromBlock,
        currentBlock,
        contractId
      );

      if (!searchResult.found) {
        return { 
          success: false, 
          error: `No transactions found to ${contract.name} in the last ${searchBlocks} blocks`,
          contractId,
          contractName: contract.name,
          contractAddress: contract.address,
          roleId: contract.roleId
        };
      }

      const tx = searchResult.tx;
      const receipt = await provider.getTransactionReceipt(tx.hash);

      if (!receipt) {
        return { 
          success: false, 
          error: 'Transaction not yet confirmed',
          contractId,
          contractName: contract.name
        };
      }

      if (receipt.status === 0) {
        return { 
          success: false, 
          error: 'Transaction failed on-chain',
          contractId,
          contractName: contract.name
        };
      }

      const confirmations = currentBlock - parseInt(receipt.blockNumber);

      if (confirmations < config.blockchain.minConfirmations) {
        return { 
          success: false, 
          error: `Transaction needs ${config.blockchain.minConfirmations - confirmations} more confirmation(s)`,
          contractId,
          contractName: contract.name
        };
      }

      logger.verification(true, normalizedWallet, { 
        hash: tx.hash,
        contract: contract.name,
        confirmations 
      });

      return {
        success: true,
        tx,
        receipt,
        hash: tx.hash,
        confirmations,
        blockNumber: receipt.blockNumber.toString(),
        contractId: contract.id,
        contractName: contract.name,
        contractAddress: contract.address,
        roleId: contract.roleId,
        contract,
      };

    } catch (error) {
      logger.error('Single contract verification error', { 
        wallet: normalizedWallet,
        contract: contract.name,
        error: error.message 
      });
      return { 
        success: false, 
        error: error.message,
        contractId,
        contractName: contract.name,
        contractAddress: contract.address,
        roleId: contract.roleId
      };
    }
  }

  // Verify transaction (checks ALL contracts by default, or specific one if provided)
  async verifyTransaction(walletAddress, specificContractId = null) {
    const normalizedWallet = walletAddress.toLowerCase();
    
    try {
      logger.blockchain('Starting verification', { 
        wallet: normalizedWallet,
        specificContract: specificContractId 
      });

      const currentBlock = await this.getCurrentBlock(specificContractId);
      if (!currentBlock) {
        return { 
          success: false, 
          error: 'Failed to get current block number' 
        };
      }

      const txCount = await this.getTransactionCount(
        normalizedWallet, 
        specificContractId
      );
      logger.debug(`Wallet has ${txCount} total transactions`);

      if (txCount === 0) {
        return { success: false, error: 'Wallet has no transactions' };
      }

      const searchBlocks = config.blockchain.searchBlocks;
      const fromBlock = Math.max(0, currentBlock - searchBlocks);

      let searchResult;

      if (specificContractId) {
        // Search for specific contract
        const contract = config.getContractById(specificContractId);
        if (!contract) {
          return { success: false, error: 'Invalid contract ID' };
        }
        searchResult = await this.findTransactionToContract(
          normalizedWallet,
          contract.address,
          fromBlock,
          currentBlock,
          specificContractId
        );
      } else {
        // Search for any contract
        searchResult = await this.findTransactionToAnyContract(
          normalizedWallet,
          fromBlock,
          currentBlock
        );
      }

      if (!searchResult.found) {
        const contractList = specificContractId 
          ? `contract ${config.getContractById(specificContractId).name}`
          : 'any configured contract';
        return { 
          success: false, 
          error: `No transactions found to ${contractList} in the last ${searchBlocks} blocks` 
        };
      }

      const tx = searchResult.tx;
      const contract = searchResult.contract;

      // Get receipt using the contract's specific provider
      const provider = this.getProvider(contract.id);
      const receipt = await provider.getTransactionReceipt(tx.hash);

      if (!receipt) {
        return { success: false, error: 'Transaction not yet confirmed' };
      }

      if (receipt.status === 0) {
        return { success: false, error: 'Transaction failed on-chain' };
      }

      const confirmations = currentBlock - parseInt(receipt.blockNumber);

      if (confirmations < config.blockchain.minConfirmations) {
        return { 
          success: false, 
          error: `Transaction needs ${config.blockchain.minConfirmations - confirmations} more confirmation(s)` 
        };
      }

      logger.verification(true, normalizedWallet, { 
        hash: tx.hash,
        contract: contract.name,
        confirmations 
      });

      return {
        success: true,
        tx,
        receipt,
        hash: tx.hash,
        confirmations,
        blockNumber: receipt.blockNumber.toString(),
        contract,
      };

    } catch (error) {
      logger.error('Verification error', { 
        wallet: normalizedWallet, 
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  // Verify wallet against ALL contracts and return detailed results for each
  async verifyAllContracts(walletAddress) {
    const normalizedWallet = walletAddress.toLowerCase();
    const results = [];

    for (const contract of config.contracts) {
      try {
        const result = await this.verifySingleContract(normalizedWallet, contract.id);
        results.push({
          contractId: contract.id,
          contractName: contract.name,
          contractAddress: contract.address,
          roleId: contract.roleId,
          ...result
        });
      } catch (error) {
        results.push({
          contractId: contract.id,
          contractName: contract.name,
          contractAddress: contract.address,
          roleId: contract.roleId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  clearCache() {
    this.cache.clear();
    logger.debug('Transaction cache cleared');
  }

  getCacheSize() {
    return this.cache.size;
  }
}

module.exports = new BlockchainService();
