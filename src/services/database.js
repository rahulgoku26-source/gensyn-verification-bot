const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.dbPath = config.database.path;
    this.failedLogPath = config.logging.failedLogPath;
    this.successLogPath = config.logging.successLogPath;
    this.auditLogPath = config.logging.auditLogPath;
    this.data = {};
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

    // Ensure backups directory exists
    const backupsDir = path.join(path.dirname(this.dbPath), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
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

  /**
   * Format timestamp for logs
   */
  formatTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Append to simple text log file
   */
  appendToLog(filePath, entry) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(filePath, entry + '\n');
    } catch (error) {
      logger.error('Failed to append to log', { error: error.message, path: filePath });
    }
  }

  /**
   * Read lines from log file (most recent first)
   */
  readLogLines(filePath, limit = 50) {
    try {
      if (!fs.existsSync(filePath)) {
        return [];
      }
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      return lines.slice(-limit).reverse();
    } catch (error) {
      logger.error('Failed to read log', { error: error.message, path: filePath });
      return [];
    }
  }

  /**
   * Trim log file to keep only recent entries
   */
  trimLogFile(filePath, maxEntries = config.logging.maxLogEntries) {
    try {
      if (!fs.existsSync(filePath)) return;
      
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length > maxEntries) {
        const trimmed = lines.slice(-maxEntries).join('\n');
        fs.writeFileSync(filePath, trimmed + '\n');
      }
    } catch (error) {
      logger.error('Failed to trim log', { error: error.message, path: filePath });
    }
  }

  /**
   * Record failed verification with simple one-line format
   * Format: [TIMESTAMP] FAILED | Discord: username (id) | Wallet: 0x... | Contract: Name | Reason: ...
   */
  recordFailedVerification(data) {
    const {
      discordId,
      discordUsername,
      walletAddress,
      contractId,
      contractName,
      txnCount = 0,
      reason,
    } = data;

    const timestamp = this.formatTimestamp();
    const wallet = walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.slice(-3)}` : 'N/A';
    
    const logEntry = `[${timestamp}] FAILED | Discord: ${discordUsername || 'Unknown'} (${discordId}) | Wallet: ${wallet} | Contract: ${contractName || contractId} | Reason: ${reason}`;
    
    this.appendToLog(this.failedLogPath, logEntry);
    this.trimLogFile(this.failedLogPath);
  }

  /**
   * Record successful verification with simple one-line format
   * Format: [TIMESTAMP] SUCCESS | Discord: username (id) | Wallet: 0x... | Contract: Name | Txns: N | Role Assigned: ✅
   */
  recordSuccessfulVerification(data) {
    const {
      discordId,
      discordUsername,
      walletAddress,
      contractId,
      contractName,
      txnCount = 0,
      roleAssigned = true,
    } = data;

    const timestamp = this.formatTimestamp();
    const wallet = walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.slice(-3)}` : 'N/A';
    
    const logEntry = `[${timestamp}] SUCCESS | Discord: ${discordUsername || 'Unknown'} (${discordId}) | Wallet: ${wallet} | Contract: ${contractName || contractId} | Txns: ${txnCount} | Role Assigned: ${roleAssigned ? '✅' : '❌'}`;
    
    this.appendToLog(this.successLogPath, logEntry);
    this.trimLogFile(this.successLogPath);
  }

  /**
   * Get failed verifications (parsed from log file)
   */
  getFailedVerifications(limit = 50) {
    return this.readLogLines(this.failedLogPath, limit);
  }

  /**
   * Get successful verifications (parsed from log file)
   */
  getSuccessfulVerifications(limit = 50) {
    return this.readLogLines(this.successLogPath, limit);
  }

  startBackupSchedule() {
    const intervalMs = config.database.backupInterval * 60 * 60 * 1000; // hours to ms
    setInterval(() => this.backup(), intervalMs);
    logger.info(`Database backup scheduled every ${config.database.backupInterval} hour(s)`);
  }

  backup() {
    try {
      const backupsDir = path.join(path.dirname(this.dbPath), 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupsDir, `users-${timestamp}.json`);
      
      fs.copyFileSync(this.dbPath, backupPath);
      logger.info('Database backup created', { path: backupPath });

      // Clean old backups (keep last 24)
      this.cleanOldBackups(backupsDir, 24);
    } catch (error) {
      logger.error('Failed to create backup', { error: error.message });
    }
  }

  cleanOldBackups(backupsDir, keepCount) {
    try {
      const files = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('users-') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(backupsDir, f),
          time: fs.statSync(path.join(backupsDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Remove old backups
      files.slice(keepCount).forEach(f => {
        fs.unlinkSync(f.path);
        logger.debug('Removed old backup', { file: f.name });
      });
    } catch (error) {
      logger.error('Failed to clean old backups', { error: error.message });
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

  // Record verification for a contract with role tracking and txn count
  recordVerification(walletAddress, contractId, txHash, blockNumber, roleId = null, roleName = null, txnCount = 0) {
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
      txnCount,
      verifiedAt: timestamp
    };

    // Track role if not already present
    if (roleId && !this.data[normalized].roles.includes(roleId)) {
      this.data[normalized].roles.push(roleId);
    }

    this.data[normalized].lastCheckedAt = timestamp;

    this.save();
    logger.info('Verification recorded', { wallet: normalized, contractId, roleId });

    // Log to successful verifications (simple text format)
    const userData = this.data[normalized];
    this.recordSuccessfulVerification({
      discordId: userData.discordId,
      discordUsername: userData.discordUsername,
      walletAddress: normalized,
      contractId,
      contractName: config.getContractById(contractId)?.name || contractId,
      txnCount,
      roleAssigned: true
    });

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

    // Count log entries
    const failedLogs = this.getFailedVerifications(1000);
    const successLogs = this.getSuccessfulVerifications(1000);

    return {
      totalUsers,
      verifiedUsers,
      pendingUsers: totalUsers - verifiedUsers,
      contractStats,
      roleDistribution,
      failedCount: failedLogs.length,
      successCount: successLogs.length
    };
  }

  // Export all data (flat format for easy TXT export)
  exportAllData() {
    const flatUsers = [];
    
    for (const [wallet, userData] of Object.entries(this.data)) {
      const contractStatus = {};
      for (const contract of config.contracts) {
        const verification = userData.verifications?.[contract.id];
        const txnCount = verification?.txnCount || 0;
        contractStatus[contract.name] = verification?.verified 
          ? `✅ (${txnCount} txns)` 
          : `❌ (${txnCount} txns)`;
      }
      
      flatUsers.push({
        wallet,
        discordId: userData.discordId,
        discordUsername: userData.discordUsername || 'Unknown',
        linkedAt: userData.linkedAt?.split('T')[0] || 'N/A',
        ...contractStatus
      });
    }

    return {
      users: flatUsers,
      rawData: this.data,
      failedVerifications: this.getFailedVerifications(100),
      successfulVerifications: this.getSuccessfulVerifications(100),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Export users in flat TXT format
   * Format: WALLET | DISCORD_ID | DISCORD_NAME | CONTRACT1 | CONTRACT2 | ... | LINKED_AT
   */
  exportFlatFormat() {
    const header = ['WALLET', 'DISCORD_ID', 'DISCORD_NAME'];
    config.contracts.forEach(c => header.push(c.name.toUpperCase()));
    header.push('LINKED_AT');
    
    const lines = [header.join(' | ')];
    
    for (const [wallet, userData] of Object.entries(this.data)) {
      const row = [
        wallet,
        userData.discordId,
        userData.discordUsername || 'Unknown'
      ];
      
      for (const contract of config.contracts) {
        const verification = userData.verifications?.[contract.id];
        const txnCount = verification?.txnCount || 0;
        row.push(verification?.verified ? `✅ (${txnCount} txns)` : `❌ (${txnCount} txns)`);
      }
      
      row.push(userData.linkedAt?.split('T')[0] || 'N/A');
      lines.push(row.join(' | '));
    }
    
    return lines.join('\n');
  }
}

module.exports = new Database();
