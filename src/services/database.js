const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.dbPath = config.database.path;
    this.failedLogPath = config.logging.failedLogPath;
    this.successLogPath = config.logging.successLogPath;
    this.data = {};
    this.failedVerifications = [];
    this.successfulVerifications = [];
    this.init();
  }

  init() {
    // Ensure database directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Ensure logs directory exists
    const logsDir = path.dirname(this.failedLogPath);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Load main database
    if (fs.existsSync(this.dbPath)) {
      try {
        const rawData = fs.readFileSync(this.dbPath, 'utf8');
        this.data = JSON.parse(rawData);
        logger.info(`Database loaded: ${Object.keys(this.data).length} users`);
      } catch (error) {
        logger.error('Failed to load database', { error: error.message });
        this.data = {};
      }
    } else {
      this.save();
      logger.info('New database created');
    }

    // Load failed verifications log
    if (fs.existsSync(this.failedLogPath)) {
      try {
        const rawData = fs.readFileSync(this.failedLogPath, 'utf8');
        this.failedVerifications = JSON.parse(rawData);
      } catch (error) {
        logger.error('Failed to load failed verifications log', { error: error.message });
        this.failedVerifications = [];
      }
    }

    // Load successful verifications log
    if (fs.existsSync(this.successLogPath)) {
      try {
        const rawData = fs.readFileSync(this.successLogPath, 'utf8');
        this.successfulVerifications = JSON.parse(rawData);
      } catch (error) {
        logger.error('Failed to load successful verifications log', { error: error.message });
        this.successfulVerifications = [];
      }
    }

    // Start backup schedule
    if (config.database.backupEnabled) {
      this.startBackupSchedule();
    }
  }

  save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      logger.error('Failed to save database', { error: error.message });
    }
  }

  saveFailedLog() {
    try {
      fs.writeFileSync(this.failedLogPath, JSON.stringify(this.failedVerifications, null, 2));
    } catch (error) {
      logger.error('Failed to save failed verifications log', { error: error.message });
    }
  }

  saveSuccessLog() {
    try {
      fs.writeFileSync(this.successLogPath, JSON.stringify(this.successfulVerifications, null, 2));
    } catch (error) {
      logger.error('Failed to save successful verifications log', { error: error.message });
    }
  }

  startBackupSchedule() {
    const intervalMs = config.database.backupInterval * 60 * 60 * 1000;
    setInterval(() => this.backup(), intervalMs);
    logger.info(`Database backup scheduled every ${config.database.backupInterval} hours`);
  }

  backup() {
    try {
      const backupPath = `${this.dbPath}.backup.${Date.now()}`;
      fs.copyFileSync(this.dbPath, backupPath);
      logger.info('Database backup created', { path: backupPath });
    } catch (error) {
      logger.error('Failed to create backup', { error: error.message });
    }
  }

  // Link wallet to Discord user with full user info
  linkWallet(discordId, walletAddress, discordUsername = null, discordTag = null) {
    const normalized = walletAddress.toLowerCase();
    
    // Check if wallet already linked to another user
    for (const [wallet, data] of Object.entries(this.data)) {
      if (wallet === normalized && data.discordId !== discordId) {
        return { success: false, error: 'Wallet already linked to another user' };
      }
    }

    // Check if user already has a wallet
    const existingWallet = this.getWalletByDiscordId(discordId);
    if (existingWallet) {
      return { success: false, error: 'You already have a wallet linked', wallet: existingWallet };
    }

    this.data[normalized] = {
      discordId,
      discordUsername: discordUsername || null,
      discordTag: discordTag || null,
      linkedAt: new Date().toISOString(),
      lastCheckedAt: null,
      attempts: 0,
      roles: [],
      verifications: {}
    };

    this.save();
    logger.info('Wallet linked', { discordId, discordUsername, wallet: normalized });
    return { success: true };
  }

  // Update user's Discord info
  updateUserInfo(walletAddress, discordUsername, discordTag) {
    const normalized = walletAddress.toLowerCase();
    if (this.data[normalized]) {
      this.data[normalized].discordUsername = discordUsername;
      this.data[normalized].discordTag = discordTag;
      this.save();
      return true;
    }
    return false;
  }

  // Get wallet by Discord ID
  getWalletByDiscordId(discordId) {
    for (const [wallet, data] of Object.entries(this.data)) {
      if (data.discordId === discordId) {
        return wallet;
      }
    }
    return null;
  }

  // Get user data by wallet
  getUserByWallet(walletAddress) {
    return this.data[walletAddress.toLowerCase()] || null;
  }

  // Get user data by Discord ID
  getUserByDiscordId(discordId) {
    const wallet = this.getWalletByDiscordId(discordId);
    if (!wallet) return null;
    return { wallet, ...this.data[wallet] };
  }

  // Record verification for a contract with role tracking
  recordVerification(walletAddress, contractId, txHash, blockNumber, roleId = null, roleName = null) {
    const normalized = walletAddress.toLowerCase();
    if (!this.data[normalized]) return false;

    if (!this.data[normalized].verifications) {
      this.data[normalized].verifications = {};
    }

    if (!this.data[normalized].roles) {
      this.data[normalized].roles = [];
    }

    const timestamp = new Date().toISOString();

    this.data[normalized].verifications[contractId] = {
      verified: true,
      txHash,
      blockNumber,
      verifiedAt: timestamp
    };

    // Track role if not already present
    if (roleId && !this.data[normalized].roles.includes(roleId)) {
      this.data[normalized].roles.push(roleId);
    }

    this.data[normalized].lastCheckedAt = timestamp;

    this.save();
    logger.info('Verification recorded', { wallet: normalized, contractId, roleId });

    // Log to successful verifications
    const userData = this.data[normalized];
    this.recordSuccessfulVerification({
      discordId: userData.discordId,
      discordUsername: userData.discordUsername,
      walletAddress: normalized,
      contractId,
      contractName: config.getContractById(contractId)?.name || contractId,
      roleId,
      roleName,
      txHash,
      blockNumber,
      timestamp
    });

    return true;
  }

  // Record failed verification with detailed reason
  recordFailedVerification(data) {
    const {
      discordId,
      discordUsername,
      walletAddress,
      contractId,
      contractName,
      reason,
      timestamp = new Date().toISOString()
    } = data;

    this.failedVerifications.push({
      discordId,
      discordUsername,
      walletAddress: walletAddress?.toLowerCase(),
      contractId,
      contractName,
      reason,
      timestamp
    });

    // Keep only configured number of failed verifications to prevent file from growing too large
    const maxEntries = config.logging.maxLogEntries;
    if (this.failedVerifications.length > maxEntries) {
      this.failedVerifications = this.failedVerifications.slice(-maxEntries);
    }

    this.saveFailedLog();
  }

  // Record successful verification
  recordSuccessfulVerification(data) {
    this.successfulVerifications.push(data);

    // Keep only configured number of successful verifications
    const maxEntries = config.logging.maxLogEntries;
    if (this.successfulVerifications.length > maxEntries) {
      this.successfulVerifications = this.successfulVerifications.slice(-maxEntries);
    }

    this.saveSuccessLog();
  }

  // Get failed verifications
  getFailedVerifications(limit = 50) {
    return this.failedVerifications.slice(-limit).reverse();
  }

  // Get successful verifications
  getSuccessfulVerifications(limit = 50) {
    return this.successfulVerifications.slice(-limit).reverse();
  }

  // Check if user is verified for a contract
  isVerified(walletAddress, contractId) {
    const normalized = walletAddress.toLowerCase();
    const user = this.data[normalized];
    if (!user || !user.verifications) return false;
    return user.verifications[contractId]?.verified === true;
  }

  // Get all verifications for a user
  getVerifications(walletAddress) {
    const normalized = walletAddress.toLowerCase();
    const user = this.data[normalized];
    if (!user) return {};
    return user.verifications || {};
  }

  // Get user's roles
  getUserRoles(walletAddress) {
    const normalized = walletAddress.toLowerCase();
    const user = this.data[normalized];
    if (!user) return [];
    return user.roles || [];
  }

  // Add role to user
  addUserRole(walletAddress, roleId) {
    const normalized = walletAddress.toLowerCase();
    if (!this.data[normalized]) return false;
    
    if (!this.data[normalized].roles) {
      this.data[normalized].roles = [];
    }

    if (!this.data[normalized].roles.includes(roleId)) {
      this.data[normalized].roles.push(roleId);
      this.save();
    }
    return true;
  }

  // Update last checked timestamp
  updateLastChecked(walletAddress) {
    const normalized = walletAddress.toLowerCase();
    if (this.data[normalized]) {
      this.data[normalized].lastCheckedAt = new Date().toISOString();
      this.save();
    }
  }

  // Increment attempt counter
  incrementAttempts(walletAddress) {
    const normalized = walletAddress.toLowerCase();
    if (this.data[normalized]) {
      this.data[normalized].attempts = (this.data[normalized].attempts || 0) + 1;
      this.save();
    }
  }

  // Get all users
  getAllUsers() {
    return this.data;
  }

  // Get users for auto-verification (all linked users)
  getUsersForAutoVerify() {
    const users = [];
    for (const [wallet, userData] of Object.entries(this.data)) {
      users.push({
        wallet,
        ...userData
      });
    }
    return users;
  }

  // Get statistics
  getStats() {
    const users = Object.values(this.data);
    const totalUsers = users.length;
    const verifiedUsers = users.filter(u => 
      u.verifications && Object.values(u.verifications).some(v => v.verified)
    ).length;

    const contractStats = {};
    for (const contract of config.contracts) {
      contractStats[contract.id] = {
        name: contract.name,
        verified: users.filter(u => 
          u.verifications?.[contract.id]?.verified
        ).length
      };
    }

    // Role distribution
    const roleDistribution = {};
    for (const contract of config.contracts) {
      roleDistribution[contract.roleId] = {
        name: contract.name,
        count: users.filter(u => u.roles && u.roles.includes(contract.roleId)).length
      };
    }

    return {
      totalUsers,
      verifiedUsers,
      pendingUsers: totalUsers - verifiedUsers,
      contractStats,
      roleDistribution,
      failedCount: this.failedVerifications.length,
      successCount: this.successfulVerifications.length
    };
  }

  // Export all data
  exportAllData() {
    return {
      users: this.data,
      failedVerifications: this.failedVerifications,
      successfulVerifications: this.successfulVerifications,
      exportedAt: new Date().toISOString()
    };
  }
}

module.exports = new Database();
