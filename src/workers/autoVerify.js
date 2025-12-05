const database = require('../services/database');
const explorerApi = require('../services/explorerApi');
const performance = require('../utils/performance');
const config = require('../config/config');
const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');

class AutoVerifyWorker {
  constructor(client) {
    this.client = client;
    this.isRunning = false;
  }

  start() {
    const intervalMs = config.autoVerify.intervalMinutes * 60 * 1000;
    
    logger.info(`Auto-verify worker started (interval: ${config.autoVerify.intervalMinutes} min)`);
    logger.info(`Using Block Explorer API for verification`);
    logger.info(`Batch size: ${config.performance.batchSize}, Min transactions: ${config.explorer.minTransactions}`);
    
    // Run immediately, then on interval
    this.run();
    setInterval(() => this.run(), intervalMs);
  }

  async run() {
    if (this.isRunning) {
      logger.debug('Auto-verify already running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('      Auto-Verify Worker Running (Explorer API)');
    logger.info('═══════════════════════════════════════════════════════');

    try {
      const users = database.getUsersForAutoVerify();
      
      let processed = 0;
      let newVerifications = 0;
      let failedVerifications = 0;
      const rolesAssigned = [];

      // Process users in batches for better performance
      const batchSize = config.performance.batchSize || 50;
      const batches = performance.createBatches(users, batchSize);

      logger.info(`Processing ${users.length} users in ${batches.length} batches of ${batchSize}`);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchStartTime = Date.now();

        // Process batch items in parallel using Promise.allSettled for better error handling
        const batchResults = await Promise.allSettled(
          batch.map(userData => this.processUser(userData))
        );

        // Aggregate results, handling both fulfilled and rejected promises
        for (const promiseResult of batchResults) {
          processed++;
          if (promiseResult.status === 'fulfilled') {
            const result = promiseResult.value;
            newVerifications += result.newVerifications;
            failedVerifications += result.failedVerifications;
            rolesAssigned.push(...result.rolesAssigned);
          } else {
            // Promise was rejected - log the error but continue
            logger.debug('User processing failed', { error: promiseResult.reason?.message });
            failedVerifications++;
          }
        }

        const batchTime = Date.now() - batchStartTime;
        logger.debug(`Batch ${batchIndex + 1}/${batches.length} completed in ${batchTime}ms`);

        // Small delay between batches to avoid rate limiting
        if (batchIndex < batches.length - 1) {
          await this.delay(100);
        }

        // Check if we've hit max batch size
        if (processed >= config.autoVerify.maxBatchSize) {
          logger.info(`Reached max batch size (${config.autoVerify.maxBatchSize}), stopping`);
          break;
        }
      }

      const duration = Date.now() - startTime;
      const usersPerMinute = duration > 0 ? Math.round((processed / duration) * 60000) : 0;

      // Log summary
      logger.info('═══════════════════════════════════════════════════════');
      logger.info('      Auto-Verify Complete');
      logger.info('═══════════════════════════════════════════════════════');
      logger.info(`📊 Processed: ${processed} users in ${duration}ms`);
      logger.info(`⚡ Speed: ${usersPerMinute} users/min`);
      logger.info(`✅ New verifications: ${newVerifications}`);
      logger.info(`❌ Failed verifications: ${failedVerifications}`);
      
      if (rolesAssigned.length > 0) {
        logger.info('🎭 Roles assigned:');
        rolesAssigned.forEach(r => {
          logger.info(`   • ${r.username} → ${r.roleName} (${r.contractName})`);
        });
      }
      
      logger.info('═══════════════════════════════════════════════════════');

    } catch (error) {
      logger.error('Auto-verify worker error', { error: error.message });
    } finally {
      this.isRunning = false;
    }
  }

  async processUser(userData) {
    const wallet = userData.wallet;
    const discordUsername = userData.discordUsername || 'Unknown';
    
    const result = {
      newVerifications: 0,
      failedVerifications: 0,
      rolesAssigned: []
    };

    try {
      logger.debug(`Processing user: ${discordUsername} (${wallet.substring(0, 10)}...)`);
      
      // Use Explorer API for parallel verification of all contracts
      const results = await explorerApi.verifyAllContracts(wallet);
      
      for (const verificationResult of results) {
        if (verificationResult.success && !database.isVerified(wallet, verificationResult.contractId)) {
          // Get role info
          const role = await this.getRoleInfo(verificationResult.roleId);
          const roleName = role?.name || verificationResult.contractName;

          // Record verification with txn count
          database.recordVerification(
            wallet, 
            verificationResult.contractId, 
            verificationResult.hash, 
            verificationResult.blockNumber,
            verificationResult.roleId,
            roleName,
            verificationResult.txnCount
          );
          
          // Assign role
          const roleAssigned = await this.assignRole(userData.discordId, verificationResult.roleId);
          
          if (roleAssigned) {
            result.rolesAssigned.push({
              username: discordUsername,
              roleName: roleName,
              contractName: verificationResult.contractName,
              txnCount: verificationResult.txnCount
            });
          }
          
          result.newVerifications++;
          
          logger.info(`✅ Auto-verified: ${discordUsername}`, { 
            wallet: wallet.substring(0, 10) + '...', 
            contract: verificationResult.contractName,
            role: roleName,
            txnCount: verificationResult.txnCount
          });

          // Send announcement
          await this.sendAnnouncement(userData.discordId, discordUsername, verificationResult, roleName);

        } else if (!verificationResult.success && !database.isVerified(wallet, verificationResult.contractId)) {
          // Record failed verification
          database.recordFailedVerification({
            discordId: userData.discordId,
            discordUsername: discordUsername,
            walletAddress: wallet,
            contractId: verificationResult.contractId,
            contractName: verificationResult.contractName,
            txnCount: verificationResult.txnCount || 0,
            reason: verificationResult.error
          });
          result.failedVerifications++;
        }
      }

      // Update last checked timestamp
      database.updateLastChecked(wallet);
      
    } catch (error) {
      logger.debug('Auto-verify error for wallet', { 
        wallet: wallet.substring(0, 10) + '...', 
        username: discordUsername,
        error: error.message 
      });
      
      // Record as failed verification
      database.recordFailedVerification({
        discordId: userData.discordId,
        discordUsername: discordUsername,
        walletAddress: wallet,
        contractId: 'unknown',
        contractName: 'Unknown',
        reason: error.message
      });
      result.failedVerifications++;
    }

    return result;
  }

  async getRoleInfo(roleId) {
    try {
      // Use configured guild ID if available
      if (config.discord.guildId) {
        const guild = this.client.guilds.cache.get(config.discord.guildId);
        if (guild) {
          return guild.roles.cache.get(roleId);
        }
      }
      // Fallback to searching all guilds
      for (const guild of this.client.guilds.cache.values()) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          return role;
        }
      }
    } catch (error) {
      logger.error('Failed to get role info', { roleId, error: error.message });
    }
    return null;
  }

  async assignRole(discordId, roleId) {
    try {
      // Use configured guild ID if available for better performance
      const targetGuild = config.discord.guildId 
        ? this.client.guilds.cache.get(config.discord.guildId)
        : null;
      
      const guildsToCheck = targetGuild 
        ? [targetGuild] 
        : Array.from(this.client.guilds.cache.values());

      for (const guild of guildsToCheck) {
        if (!guild) continue;
        
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (member) {
          // Check if member already has the role
          if (member.roles.cache.has(roleId)) {
            logger.debug(`User already has role`, { discordId, roleId });
            return true; // Already has role, consider it a success
          }
          
          const role = guild.roles.cache.get(roleId);
          if (role) {
            await member.roles.add(role);
            logger.info('Role assigned', { 
              user: member.user.tag, 
              role: role.name 
            });
            
            // Update database with role
            const wallet = database.getWalletByDiscordId(discordId);
            if (wallet) {
              database.addUserRole(wallet, roleId);
            }
            
            return true;
          }
        }
      }
    } catch (error) {
      logger.error('Failed to assign role in auto-verify', { 
        discordId, 
        roleId, 
        error: error.message 
      });
    }
    return false;
  }

  async sendAnnouncement(discordId, username, result, roleName) {
    if (!config.discord.verificationChannelId) return;

    try {
      // Use configured guild ID if available for better performance
      const targetGuild = config.discord.guildId 
        ? this.client.guilds.cache.get(config.discord.guildId)
        : null;
      
      const guildsToCheck = targetGuild 
        ? [targetGuild] 
        : Array.from(this.client.guilds.cache.values());

      for (const guild of guildsToCheck) {
        if (!guild) continue;
        
        const channel = guild.channels.cache.get(config.discord.verificationChannelId);
        if (channel) {
          const embed = new EmbedBuilder()
            .setTitle('🎉 New Auto-Verification!')
            .setColor(0x00ff00)
            .setDescription(`<@${discordId}> has been automatically verified!`)
            .addFields(
              { name: '📝 Contract', value: result.contractName, inline: true },
              { name: '🎭 Role', value: roleName, inline: true },
              { name: '📊 Transactions', value: `${result.txnCount}`, inline: true }
            )
            .setTimestamp();
          
          await channel.send({ embeds: [embed] });
          break;
        }
      }
    } catch (error) {
      logger.error('Failed to send auto-verify announcement', { error: error.message });
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AutoVerifyWorker;
