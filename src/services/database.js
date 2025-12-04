const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this. dbPath = config.database.path;
    this.data = {};
    this.init();
  }

  init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      try {
        const rawData = fs.readFileSync(this. dbPath, 'utf8');
        this.data = JSON.parse(rawData);
        logger. info(`Database loaded: ${Object.keys(this. data).length} users`);
      } catch (error) {
        logger.error('Failed to load database', { error: error.message });
        this.data = {};
      }
    } else {
      this.save();
      logger.info('New database created');
    }

    // Start backup schedule
    if (config.database. backupEnabled) {
      this.startBackupSchedule();
    }
  }

  save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      logger. error('Failed to save database', { error: error.message });
    }
  }

  startBackupSchedule() {
    const intervalMs = config.database. backupInterval * 60 * 60 * 1000;
    setInterval(() => this.backup(), intervalMs);
    logger.info(`Database backup scheduled every ${config.database.backupInterval} hours`);
  }

  backup() {
    try {
      const backupPath = `${this.dbPath}.backup. ${Date.now()}`;
      fs.copyFileSync(this. dbPath, backupPath);
      logger.info('Database backup created', { path: backupPath });
    } catch (error) {
      logger.error('Failed to create backup', { error: error.message });
    }
  }

  // Link wallet to Discord user
  linkWallet(discordId, walletAddress) {
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
      linkedAt: new Date().toISOString(),
      attempts: 0,
      verifications: {}
    };

    this.save();
    logger.info('Wallet linked', { discordId, wallet: normalized });
    return { success: true };
  }

  // Get wallet by Discord ID
  getWalletByDiscordId(discordId) {
    for (const [wallet, data] of Object. entries(this.data)) {
      if (data.discordId === discordId) {
        return wallet;
      }
    }
    return null;
  }

  // Get user data by wallet
  getUserByWallet(walletAddress) {
    return this.data[walletAddress. toLowerCase()] || null;
  }

  // Get user data by Discord ID
  getUserByDiscordId(discordId) {
    const wallet = this.getWalletByDiscordId(discordId);
    if (! wallet) return null;
    return { wallet, ... this.data[wallet] };
  }

  // Record verification for a contract
  recordVerification(walletAddress, contractId, txHash, blockNumber) {
    const normalized = walletAddress. toLowerCase();
    if (!this.data[normalized]) return false;

    if (!this.data[normalized].verifications) {
      this. data[normalized].verifications = {};
    }

    this.data[normalized]. verifications[contractId] = {
      verified: true,
      txHash,
      blockNumber,
      verifiedAt: new Date(). toISOString()
    };

    this.save();
    logger.info('Verification recorded', { wallet: normalized, contractId });
    return true;
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
    const normalized = walletAddress. toLowerCase();
    const user = this.data[normalized];
    if (!user) return {};
    return user. verifications || {};
  }

  // Increment attempt counter
  incrementAttempts(walletAddress) {
    const normalized = walletAddress. toLowerCase();
    if (this.data[normalized]) {
      this.data[normalized]. attempts = (this.data[normalized].attempts || 0) + 1;
      this.save();
    }
  }

  // Get all users
  getAllUsers() {
    return this.data;
  }

  // Get statistics
  getStats() {
    const users = Object.values(this.data);
    const totalUsers = users.length;
    const verifiedUsers = users.filter(u => 
      u.verifications && Object.values(u.verifications).some(v => v. verified)
    ). length;

    const contractStats = {};
    for (const contract of config.contracts) {
      contractStats[contract.id] = {
        name: contract.name,
        verified: users.filter(u => 
          u.verifications? .[contract.id]?.verified
        ).length
      };
    }

    return {
      totalUsers,
      verifiedUsers,
      pendingUsers: totalUsers - verifiedUsers,
      contractStats
    };
  }
}

module.exports = new Database();
