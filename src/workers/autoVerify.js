const database = require('../services/database');
const blockchain = require('../services/blockchain');
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
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('      Auto-Verify Worker Running...');
    logger.info('═══════════════════════════════════════════════════════');

    try {
      const users = database.getUsersForAutoVerify();
      
      let processed = 0;
      let newVerifications = 0;
      let failedVerifications = 0;
      const rolesAssigned = [];

      for (const userData of users) {
        if (processed >= config.autoVerify.maxBatchSize) break;

        const wallet = userData.wallet;
        const discordUsername = userData.discordUsername || 'Unknown';

        try {
          logger.debug(`Processing user: ${discordUsername} (${wallet.substring(0, 10)}...)`);
          
          const results = await blockchain.verifyAllContracts(wallet);
          
          for (const result of results) {
            if (result.success && !database.isVerified(wallet, result.contractId)) {
              // Get role info
              const role = await this.getRoleInfo(result.roleId);
              const roleName = role?.name || result.contractName;

              // Record verification with role tracking
              database.recordVerification(
                wallet, 
                result.contractId, 
                result.hash, 
                result.blockNumber,
                result.roleId,
                roleName
              );
              
              // Assign role
              const roleAssigned = await this.assignRole(userData.discordId, result.roleId);
              
              if (roleAssigned) {
                rolesAssigned.push({
                  username: discordUsername,
                  roleName: roleName,
                  contractName: result.contractName
                });
              }
              
              newVerifications++;
              
              logger.info(`✅ Auto-verified: ${discordUsername}`, { 
                wallet: wallet.substring(0, 10) + '...', 
                contract: result.contractName,
                role: roleName
              });

              // Send announcement
              await this.sendAnnouncement(userData.discordId, discordUsername, result, roleName);

            } else if (!result.success && !database.isVerified(wallet, result.contractId)) {
              // Record failed verification
              database.recordFailedVerification({
                discordId: userData.discordId,
                discordUsername: discordUsername,
                walletAddress: wallet,
                contractId: result.contractId,
                contractName: result.contractName,
                reason: result.error
              });
              failedVerifications++;
            }
          }

          // Update last checked timestamp
          database.updateLastChecked(wallet);
          processed++;
          
          // Delay between checks
          await this.delay(config.performance.delayBetweenChecks);
          
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
        }
      }

      // Log summary
      logger.info('═══════════════════════════════════════════════════════');
      logger.info('      Auto-Verify Complete');
      logger.info('═══════════════════════════════════════════════════════');
      logger.info(`📊 Processed: ${processed} users`);
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

  async getRoleInfo(roleId) {
    try {
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
      for (const guild of this.client.guilds.cache.values()) {
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
      for (const guild of this.client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(config.discord.verificationChannelId);
        if (channel) {
          const embed = new EmbedBuilder()
            .setTitle('🎉 New Auto-Verification!')
            .setColor(0x00ff00)
            .setDescription(`<@${discordId}> has been automatically verified!`)
            .addFields(
              { name: '📝 Contract', value: result.contractName, inline: true },
              { name: '🎭 Role', value: roleName, inline: true },
              { name: '🔗 Transaction', value: `\`${result.hash.substring(0, 20)}...\``, inline: false }
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
