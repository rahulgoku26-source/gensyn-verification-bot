const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.dbPath = config.database.path;
    this.data = { 
      users: {}, 
      metadata: { 
        version: '2.0.0',
        created: new Date().toISOString(),
        contracts: config.contracts.map(c => ({ 
          id: c.id, 
          name: c.name, 
          address: c.address 
        }))
      } 
    };
    this.ensureDirectoryExists();
    this.load();
    
    if (config.database.backupEnabled) {
      this.startBackupSchedule();
    }
  }

  ensureDirectoryExists() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created database directory', { path: dir });
    }
  }

  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const rawData = fs.readFileSync(this.dbPath, 'utf8');
        this.data = JSON.parse(rawData);
        logger.info('Database loaded', { users: Object.keys(this.data.users).length });
      } else {
        this.save();
        logger.info('Created new database file');
      }
    } catch (error) {
      logger.error('Failed to load database', { error: error.message });
      throw error;
    }
  }

  save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
      logger.debug('Database saved');
    } catch (error) {
      logger.error('Failed to save database', { error: error.message });
      throw error;
    }
  }

  backup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = this.dbPath.replace('.json', `-backup-${timestamp}.json`);
      fs.copyFileSync(this.dbPath, backupPath);
      logger.info('Database backup created', { path: backupPath });
      this.cleanOldBackups();
    } catch (error) {
      logger.error('Failed to create backup', { error: error.message });
    }
  }

  cleanOldBackups() {
    try {
      const dir = path.dirname(this.dbPath);
      const files = fs.readdirSync(dir)
        .filter(f => f.includes('-backup-'))
        .map(f => ({
          name: f,
          path: path.join(dir, f),
          time: fs.statSync(path.join(dir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Keep only last 7 backups
      files.slice(7).forEach(file => {
        fs.unlinkSync(file.path);
        logger.debug('Deleted old backup', { file: file.name });
      });
    } catch (error) {
      logger.error('Failed to clean old backups', { error: error.message });
    }
  }

  startBackupSchedule() {
    const intervalMs = config.database.backupInterval * 60 * 60 * 1000;
    setInterval(() => this.backup(), intervalMs);
    logger.info('Backup schedule started', { 
      intervalHours: config.database.backupInterval 
    });
  }

  // Link wallet to Discord user
  linkWallet(discordId, walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    this.data.users[normalizedAddress] = {
      discordId,
      linkedAt: new Date().toISOString(),
      attempts: 0,
      verifications: {},
    };
    this.save();
    logger.info('Wallet linked', { wallet: normalizedAddress, discordId });
    return this.data.users[normalizedAddress];
  }

  getUserByWallet(walletAddress) {
    return this.data.users[walletAddress.toLowerCase()];
  }

  getUserByDiscordId(discordId) {
    return Object.entries(this.data.users).find(
      ([_, user]) => user.discordId === discordId
    );
  }

  // Mark verified for specific contract
  markVerifiedForContract(walletAddress, contractId, txHash, blockNumber) {
    const normalizedAddress = walletAddress.toLowerCase();
    if (this.data.users[normalizedAddress]) {
      if (!this.data.users[normalizedAddress].verifications) {
        this.data.users[normalizedAddress].verifications = {};
      }
      
      this.data.users[normalizedAddress].verifications[contractId] = {
        verified: true,
        txHash,
        blockNumber,
        verifiedAt: new Date().toISOString(),
      };
      
      this.save();
      logger.verification(true, normalizedAddress, { 
        contractId, 
        txHash, 
        blockNumber 
      });
      return true;
    }
    return false;
  }

  // Get all verifications for a wallet
  getVerifications(walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    const user = this.data.users[normalizedAddress];
    return user?.verifications || {};
  }

  // Check if verified for specific contract
  isVerifiedForContract(walletAddress, contractId) {
    const verifications = this.getVerifications(walletAddress);
    return !!verifications[contractId];
  }

  // Get list of contracts user is verified for
  getVerifiedContracts(walletAddress) {
    const verifications = this.getVerifications(walletAddress);
    return Object.keys(verifications).map(contractId => 
      config.getContractById(contractId)
    ).filter(Boolean);
  }

  incrementAttempts(walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    if (this.data.users[normalizedAddress]) {
      this.data.users[normalizedAddress].attempts += 1;
      this.data.users[normalizedAddress].lastAttempt = new Date().toISOString();
      this.save();
    }
  }

  unlinkWallet(walletAddress) {
    const normalizedAddress = walletAddress.toLowerCase();
    if (this.data.users[normalizedAddress]) {
      delete this.data.users[normalizedAddress];
      this.save();
      logger.info('Wallet unlinked', { wallet: normalizedAddress });
      return true;
    }
    return false;
  }

  // Get all users pending verification for ANY contract
  getAllUnverified() {
    const unverified = [];
    
    Object.entries(this.data.users).forEach(([wallet, user]) => {
      const verifications = user.verifications || {};
      const verifiedContractIds = Object.keys(verifications);
      const allContractIds = config.contracts.map(c => c.id);
      
      // Find contracts user hasn't verified for
      const pendingContracts = allContractIds.filter(
        id => !verifiedContractIds.includes(id)
      );
      
      if (pendingContracts.length > 0) {
        unverified.push({
          wallet,
          ...user,
          pendingContracts,
        });
      }
    });
    
    return unverified;
  }

  // Statistics - Multi-contract aware
  getStats() {
    const users = Object.values(this.data.users);
    const stats = {
      total: users.length,
      linked: users.length,
      totalVerifications: 0,
      byContract: {},
    };

    // Initialize contract stats
    config.contracts.forEach(contract => {
      stats.byContract[contract.id] = {
        name: contract.name,
        verified: 0,
        pending: 0,
      };
    });

    // Calculate stats
    users.forEach(user => {
      const verifications = user.verifications || {};
      stats.totalVerifications += Object.keys(verifications).length;

      config.contracts.forEach(contract => {
        if (verifications[contract.id]) {
          stats.byContract[contract.id].verified++;
        } else {
          stats.byContract[contract.id].pending++;
        }
      });
    });

    // Recent activity (last 24 hours)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    stats.recentLinks = users.filter(u => {
      const linkedDate = new Date(u.linkedAt);
      return linkedDate > dayAgo;
    }).length;

    stats.recentVerifications = 0;
    users.forEach(user => {
      const verifications = user.verifications || {};
      Object.values(verifications).forEach(v => {
        if (v.verifiedAt) {
          const verifiedDate = new Date(v.verifiedAt);
          if (verifiedDate > dayAgo) {
            stats.recentVerifications++;
          }
        }
      });
    });

    return stats;
  }

  exportData() {
    return JSON.stringify(this.data, null, 2);
  }

  importData(jsonData) {
    try {
      const imported = JSON.parse(jsonData);
      this.data = imported;
      this.save();
      logger.info('Data imported successfully');
      return true;
    } catch (error) {
      logger.error('Failed to import data', { error: error.message });
      return false;
    }
  }
}

module.exports = new Database();