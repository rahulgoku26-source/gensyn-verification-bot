require('dotenv').config();

const config = {
  // Discord Configuration
  discord: {
    token: process.env.DISCORD_TOKEN,
    guildId: process.env.GUILD_ID,
    verificationChannelId: process.env.VERIFICATION_CHANNEL_ID,
  },

  // Security Configuration
  security: {
    masterPassword: process.env.MASTER_PASSWORD,
    encryptionEnabled: process.env.ENCRYPTION_ENABLED !== 'false',
    autoLockTimeout: parseInt(process.env.AUTO_LOCK_TIMEOUT) || 5, // minutes
  },

  // Explorer API Configuration
  explorer: {
    apiUrl: process.env.EXPLORER_API_URL || 'https://gensyn-testnet.explorer.alchemy.com/api',
    minTransactions: parseInt(process.env.MIN_TRANSACTIONS) || 3,
  },

  // Blockchain Configuration (kept for compatibility)
  blockchain: {
    chainId: process.env.CHAIN_ID || '685685',
    chainName: process.env.CHAIN_NAME || 'Gensyn Testnet',
    minConfirmations: parseInt(process.env.MIN_CONFIRMATIONS) || 1,
    searchBlocks: parseInt(process.env.SEARCH_BLOCKS) || 10000,
  },

  // Multi-Contract Configuration (Up to 20 contracts)
  contracts: [],

  // Auto-Verification Settings
  autoVerify: {
    enabled: process.env.ENABLE_AUTO_VERIFY !== 'false',
    intervalMinutes: parseInt(process.env.AUTO_VERIFY_INTERVAL) || 5,
    maxBatchSize: parseInt(process.env.AUTO_VERIFY_BATCH_SIZE) || 50,
  },

  // Database Settings
  database: {
    path: process.env.DB_PATH || './data/users.json',
    backupEnabled: process.env.DB_BACKUP_ENABLED !== 'false',
    backupInterval: parseInt(process.env.DB_BACKUP_INTERVAL) || 1, // Changed to 1 hour
  },

  // Logging Settings
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    errorLogPath: './logs/error.log',
    combinedLogPath: './logs/combined.log',
    failedLogPath: process.env.FAILED_LOG_PATH || './logs/failed.txt',
    successLogPath: process.env.SUCCESS_LOG_PATH || './logs/success.txt',
    auditLogPath: './logs/audit.log',
    maxLogEntries: parseInt(process.env.MAX_LOG_ENTRIES) || 1000,
  },

  // Rate Limiting
  rateLimit: {
    verifyCommandCooldown: parseInt(process.env.VERIFY_COOLDOWN) || 60,
    linkCommandCooldown: parseInt(process.env.LINK_COOLDOWN) || 30,
    explorerApiRate: parseInt(process.env.EXPLORER_API_RATE) || 100, // requests per minute
  },

  // Feature Flags
  features: {
    dmNotifications: process.env.FEATURE_DM_NOTIFICATIONS !== 'false',
    adminCommands: process.env.FEATURE_ADMIN_COMMANDS !== 'false',
    statistics: process.env.FEATURE_STATISTICS !== 'false',
  },

  // Performance Settings
  performance: {
    maxConcurrentVerifications: parseInt(process.env.MAX_CONCURRENT_VERIFICATIONS) || 10,
    delayBetweenChecks: parseInt(process.env.DELAY_BETWEEN_CHECKS) || 100,
    batchSize: parseInt(process.env.BATCH_SIZE) || 50,
    cacheTTL: parseInt(process.env.CACHE_TTL) || 3600, // 1 hour in seconds (changed from 5 minutes)
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT) || 10,
    requestsPerSecond: parseInt(process.env.REQUESTS_PER_SECOND) || 10,
    backupInterval: parseInt(process.env.BACKUP_INTERVAL) || 3600, // 1 hour in seconds
  },
};

// Load contracts dynamically (supports up to 20 contracts)
// Note: RPC URL is now optional since we use Explorer API
for (let i = 1; i <= 20; i++) {
  const address = process.env[`CONTRACT_${i}_ADDRESS`];
  const roleId = process.env[`CONTRACT_${i}_ROLE_ID`];
  const rpcUrl = process.env[`CONTRACT_${i}_RPC_URL`];
  const name = process.env[`CONTRACT_${i}_NAME`];

  if (address && roleId) {
    config.contracts.push({
      id: `contract${i}`,
      name: name || `Contract ${i}`,
      address: address,
      roleId: roleId,
      rpcUrl: rpcUrl || null, // RPC URL is now optional
    });
  }
}

// Helper functions for multi-contract support
config.getContractById = function(contractId) {
  return this.contracts.find(c => c.id === contractId);
};

config.getContractByAddress = function(address) {
  if (!address) return null;
  return this.contracts.find(c => c.address.toLowerCase() === address.toLowerCase());
};

config.getContractByRoleId = function(roleId) {
  return this.contracts.find(c => c.roleId === roleId);
};

config.getContractByName = function(name) {
  if (!name) return null;
  return this.contracts.find(c => c.name.toLowerCase() === name.toLowerCase());
};

config.getAllContractAddresses = function() {
  return this.contracts.map(c => c.address.toLowerCase());
};

config.getAllContractNames = function() {
  return this.contracts.map(c => c.name);
};

config.getDefaultContract = function() {
  return this.contracts[0];
};

// Add a new contract dynamically (for future use)
config.addContract = function(contractConfig) {
  const { name, address, roleId, rpcUrl } = contractConfig;
  
  if (!address || !roleId || !rpcUrl) {
    throw new Error('Contract must have address, roleId, and rpcUrl');
  }
  
  // Check if contract already exists
  if (this.getContractByAddress(address)) {
    throw new Error('Contract with this address already exists');
  }
  
  const id = `contract${this.contracts.length + 1}`;
  this.contracts.push({
    id,
    name: name || `Contract ${this.contracts.length + 1}`,
    address,
    roleId,
    rpcUrl,
  });
  
  return this.getContractById(id);
};

// Validation
function validateConfig() {
  if (!config.discord.token) {
    throw new Error('❌ Missing DISCORD_TOKEN in environment variables');
  }

  if (config.contracts.length === 0) {
    throw new Error('❌ At least one contract must be configured (ADDRESS + ROLE_ID)');
  }

  console.log(`✅ Loaded ${config.contracts.length} contract(s)`);
  config.contracts.forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.name}: ${c.address.substring(0, 10)}... → Role: ${c.roleId}`);
  });
  
  console.log(`📡 Explorer API: ${config.explorer.apiUrl}`);
  console.log(`📊 Min Transactions: ${config.explorer.minTransactions}`);
}

validateConfig();

module.exports = config;
