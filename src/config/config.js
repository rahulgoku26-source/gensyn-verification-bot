require('dotenv').config();

const config = {
  // Discord Configuration
  discord: {
    token: process.env.DISCORD_TOKEN,
  },

  // Blockchain Configuration
  blockchain: {
    rpcUrl: process.env.RPC_URL || 'https://gensyn-testnet.g.alchemy.com/public',
    chainId: process.env.CHAIN_ID || '685685',
    chainName: process.env.CHAIN_NAME || 'Gensyn Testnet',
    minConfirmations: parseInt(process.env.MIN_CONFIRMATIONS) || 1,
    searchBlocks: parseInt(process.env.SEARCH_BLOCKS) || 10000,
  },

  // Multi-Contract Configuration (Up to 10 contracts)
  contracts: [
    {
      id: 'contract1',
      name: 'Main Contract',
      address: process.env.CONTRACT_1_ADDRESS || '0x7745a8FE4b8D2D2c3BB103F8dCae822746F35Da0',
      roleId: process.env.CONTRACT_1_ROLE_ID,
      verificationChannelId: process.env.CONTRACT_1_CHANNEL_ID,
      enabled: process.env.CONTRACT_1_ENABLED !== 'false',
      description: 'Main smart contract verification',
      rpcUrl: process.env.CONTRACT_1_RPC_URL || process.env.RPC_URL,
    },
    {
      id: 'contract2',
      name: 'Secondary Contract',
      address: process.env.CONTRACT_2_ADDRESS,
      roleId: process.env.CONTRACT_2_ROLE_ID,
      verificationChannelId: process.env.CONTRACT_2_CHANNEL_ID,
      enabled: process.env.CONTRACT_2_ENABLED === 'true',
      description: 'Secondary contract verification',
      rpcUrl: process.env.CONTRACT_2_RPC_URL || process.env.RPC_URL,
    },
    {
      id: 'contract3',
      name: 'Third Contract',
      address: process.env.CONTRACT_3_ADDRESS,
      roleId: process.env.CONTRACT_3_ROLE_ID,
      verificationChannelId: process.env.CONTRACT_3_CHANNEL_ID,
      enabled: process.env.CONTRACT_3_ENABLED === 'true',
      description: 'Third contract verification',
      rpcUrl: process.env.CONTRACT_3_RPC_URL || process.env.RPC_URL,
    },
    {
      id: 'contract4',
      name: 'Fourth Contract',
      address: process.env.CONTRACT_4_ADDRESS,
      roleId: process.env.CONTRACT_4_ROLE_ID,
      verificationChannelId: process.env.CONTRACT_4_CHANNEL_ID,
      enabled: process.env.CONTRACT_4_ENABLED === 'true',
      description: 'Fourth contract verification',
      rpcUrl: process.env.CONTRACT_4_RPC_URL || process.env.RPC_URL,
    },
    {
      id: 'contract5',
      name: 'Fifth Contract',
      address: process.env.CONTRACT_5_ADDRESS,
      roleId: process.env.CONTRACT_5_ROLE_ID,
      verificationChannelId: process.env.CONTRACT_5_CHANNEL_ID,
      enabled: process.env.CONTRACT_5_ENABLED === 'true',
      description: 'Fifth contract verification',
      rpcUrl: process.env.CONTRACT_5_RPC_URL || process.env.RPC_URL,
    },
    {
      id: 'contract6',
      name: 'Sixth Contract',
      address: process.env.CONTRACT_6_ADDRESS,
      roleId: process.env.CONTRACT_6_ROLE_ID,
      verificationChannelId: process.env.CONTRACT_6_CHANNEL_ID,
      enabled: process.env.CONTRACT_6_ENABLED === 'true',
      description: 'Sixth contract verification',
      rpcUrl: process.env.CONTRACT_6_RPC_URL || process.env.RPC_URL,
    },
    {
      id: 'contract7',
      name: 'Seventh Contract',
      address: process.env.CONTRACT_7_ADDRESS,
      roleId: process.env.CONTRACT_7_ROLE_ID,
      verificationChannelId: process.env.CONTRACT_7_CHANNEL_ID,
      enabled: process.env.CONTRACT_7_ENABLED === 'true',
      description: 'Seventh contract verification',
      rpcUrl: process.env.CONTRACT_7_RPC_URL || process.env.RPC_URL,
    },
    {
      id: 'contract8',
      name: 'Eighth Contract',
      address: process.env.CONTRACT_8_ADDRESS,
      roleId: process.env.CONTRACT_8_ROLE_ID,
      verificationChannelId: process.env.CONTRACT_8_CHANNEL_ID,
      enabled: process.env.CONTRACT_8_ENABLED === 'true',
      description: 'Eighth contract verification',
      rpcUrl: process.env.CONTRACT_8_RPC_URL || process.env.RPC_URL,
    },
    {
      id: 'contract9',
      name: 'Ninth Contract',
      address: process.env.CONTRACT_9_ADDRESS,
      roleId: process.env.CONTRACT_9_ROLE_ID,
      verificationChannelId: process.env.CONTRACT_9_CHANNEL_ID,
      enabled: process.env.CONTRACT_9_ENABLED === 'true',
      description: 'Ninth contract verification',
      rpcUrl: process.env.CONTRACT_9_RPC_URL || process.env.RPC_URL,
    },
    {
      id: 'contract10',
      name: 'Tenth Contract',
      address: process.env.CONTRACT_10_ADDRESS,
      roleId: process.env.CONTRACT_10_ROLE_ID,
      verificationChannelId: process.env.CONTRACT_10_CHANNEL_ID,
      enabled: process.env.CONTRACT_10_ENABLED === 'true',
      description: 'Tenth contract verification',
      rpcUrl: process.env.CONTRACT_10_RPC_URL || process.env.RPC_URL,
    },
  ].filter(c => c.enabled && c.address && c.roleId),

  // Auto-Verification Settings
  autoVerify: {
    enabled: process.env.ENABLE_AUTO_VERIFY !== 'false',
    intervalMinutes: parseInt(process.env.AUTO_VERIFY_INTERVAL) || 5,
    maxBatchSize: parseInt(process.env.AUTO_VERIFY_BATCH_SIZE) || 10,
  },

  // Database Settings
  database: {
    path: process.env.DB_PATH || './data/users.json',
    backupEnabled: process.env.DB_BACKUP_ENABLED !== 'false',
    backupInterval: parseInt(process.env.DB_BACKUP_INTERVAL) || 24,
  },

  // Logging Settings
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    errorLogPath: './logs/error.log',
    combinedLogPath: './logs/combined.log',
  },

  // Rate Limiting
  rateLimit: {
    verifyCommandCooldown: parseInt(process.env.VERIFY_COOLDOWN) || 60,
    linkCommandCooldown: parseInt(process.env.LINK_COOLDOWN) || 30,
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
  },
};

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

config.getAllContractAddresses = function() {
  return this.contracts.map(c => c.address.toLowerCase());
};

config.getDefaultContract = function() {
  return this.contracts[0];
};

// Validation
function validateConfig() {
  if (!config.discord.token) {
    throw new Error('❌ Missing DISCORD_TOKEN in environment variables');
  }

  if (config.contracts.length === 0) {
    throw new Error('❌ At least one contract must be configured and enabled');
  }

  // Validate each contract has required fields
  for (const contract of config.contracts) {
    if (!contract.address) {
      throw new Error(`❌ Contract ${contract.id} missing address`);
    }
    if (!contract.roleId) {
      throw new Error(`❌ Contract ${contract.id} missing roleId`);
    }
  }
}

validateConfig();

module.exports = config;
