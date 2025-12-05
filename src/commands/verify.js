const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../services/database');
const explorerApi = require('../services/explorerApi');
const config = require('../config/config');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your contract interactions and get roles')
    .addStringOption(option =>
      option.setName('contract')
        .setDescription('Specific contract to verify (optional - verifies all if not specified)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;
    const specificContract = interaction.options.getString('contract');

    // Check if user has linked wallet
    const userData = database.getUserByDiscordId(discordId);
    if (!userData) {
      return interaction.editReply({
        content: '❌ You need to link your wallet first!\n\nUse `/link wallet:0xYourAddress` to link your wallet.'
      });
    }

    const wallet = userData.wallet;
    const member = interaction.member;

    // Update user info if not already stored
    if (!userData.discordUsername) {
      database.updateUserInfo(wallet, interaction.user.username, interaction.user.tag);
    }

    try {
      let results;
      
      if (specificContract) {
        // Verify specific contract
        const contract = config.contracts.find(c => 
          c.id === specificContract || 
          c.name.toLowerCase() === specificContract.toLowerCase()
        );
        
        if (!contract) {
          const availableContracts = config.contracts.map(c => `• ${c.name}`).join('\n');
          return interaction.editReply({
            content: `❌ Contract "${specificContract}" not found.\n\n**Available contracts:**\n${availableContracts}`
          });
        }

        const result = await explorerApi.verifySingleContract(wallet, contract);
        results = [result];
      } else {
        // Verify all contracts in parallel
        results = await explorerApi.verifyAllContracts(wallet);
      }

      // Process results and assign roles
      const newlyVerified = [];
      const alreadyVerified = [];
      const failedVerifications = [];

      for (const result of results) {
        // Check if already verified
        if (database.isVerified(wallet, result.contractId)) {
          const role = interaction.guild.roles.cache.get(result.roleId);
          alreadyVerified.push({
            name: result.contractName,
            roleName: role?.name || result.contractName,
            hasRole: member.roles.cache.has(result.roleId),
            txnCount: result.txnCount || 0
          });
          continue;
        }

        if (result.success) {
          // Get role info
          const role = interaction.guild.roles.cache.get(result.roleId);
          const roleName = role?.name || result.contractName;

          // Record verification with txn count
          database.recordVerification(
            wallet, 
            result.contractId, 
            result.hash, 
            result.blockNumber,
            result.roleId,
            roleName,
            result.txnCount
          );
          
          // Assign role (incremental - doesn't remove existing roles)
          try {
            if (role && !member.roles.cache.has(result.roleId)) {
              await member.roles.add(role);
              // Log successful verification with role assignment to terminal
              console.log(`[${new Date().toISOString()}] ✅ SUCCESS | Discord: ${interaction.user.username} (${discordId}) | Wallet: ${wallet.substring(0, 10)}...${wallet.slice(-4)} | Contract: ${result.contractName} | Txns: ${result.txnCount} | Role Assigned: ✅`);
              newlyVerified.push({
                name: result.contractName,
                role: roleName,
                txHash: result.hash,
                txnCount: result.txnCount,
                isNew: true
              });
            } else if (member.roles.cache.has(result.roleId)) {
              // Log successful verification with existing role to terminal
              console.log(`[${new Date().toISOString()}] ✅ SUCCESS | Discord: ${interaction.user.username} (${discordId}) | Wallet: ${wallet.substring(0, 10)}...${wallet.slice(-4)} | Contract: ${result.contractName} | Txns: ${result.txnCount} | Role Assigned: Already had role`);
              newlyVerified.push({
                name: result.contractName,
                role: roleName,
                txHash: result.hash,
                txnCount: result.txnCount,
                isNew: false
              });
            }
          } catch (roleError) {
            logger.error('Failed to assign role', { error: roleError.message });
            // Log role assignment failure to terminal
            console.log(`[${new Date().toISOString()}] ⚠️ WARNING | Discord: ${interaction.user.username} (${discordId}) | Wallet: ${wallet.substring(0, 10)}...${wallet.slice(-4)} | Contract: ${result.contractName} | Txns: ${result.txnCount} | Role Assigned: ❌ (Failed to assign role)`);
            newlyVerified.push({
              name: result.contractName,
              role: roleName,
              txHash: result.hash,
              txnCount: result.txnCount,
              isNew: false,
              error: 'Failed to assign role'
            });
          }
        } else {
          // Log failed verification to terminal
          console.log(`[${new Date().toISOString()}] ❌ FAILED  | Discord: ${interaction.user.username} (${discordId}) | Wallet: ${wallet.substring(0, 10)}...${wallet.slice(-4)} | Contract: ${result.contractName} | Txns: ${result.txnCount || 0} | Reason: ${result.error}`);
          failedVerifications.push({
            name: result.contractName,
            error: result.error,
            txnCount: result.txnCount || 0
          });

          // Record failed verification
          database.recordFailedVerification({
            discordId: discordId,
            discordUsername: interaction.user.username,
            walletAddress: wallet,
            contractId: result.contractId,
            contractName: result.contractName,
            txnCount: result.txnCount || 0,
            reason: result.error
          });
        }
      }

      // Build response embed
      const totalContracts = config.contracts.length;
      const verifiedCount = newlyVerified.length + alreadyVerified.length;
      const progressPercent = Math.round((verifiedCount / totalContracts) * 100);

      const embed = new EmbedBuilder()
        .setTitle('🔍 Verification Results')
        .setColor(newlyVerified.length > 0 ? 0x00ff00 : (verifiedCount > 0 ? 0xffaa00 : 0xff0000))
        .setDescription(`**Progress:** ${verifiedCount}/${totalContracts} contracts verified (${progressPercent}%)\n**Min Transactions Required:** ${config.explorer.minTransactions}`)
        .setTimestamp();

      // Newly verified
      if (newlyVerified.length > 0) {
        const newRoles = newlyVerified.filter(v => v.isNew);
        const existingRoles = newlyVerified.filter(v => !v.isNew);

        if (newRoles.length > 0) {
          embed.addFields({
            name: '✅ Newly Verified',
            value: newRoles.map(v => 
              `**${v.name}** → Role: ${v.role}\nTransactions: ${v.txnCount}`
            ).join('\n\n'),
            inline: false
          });
        }

        if (existingRoles.length > 0) {
          embed.addFields({
            name: '✅ Verified (Role Already Assigned)',
            value: existingRoles.map(v => 
              `**${v.name}** → Role: ${v.role} (${v.txnCount} txns)`
            ).join('\n'),
            inline: false
          });
        }
      }

      // Already verified
      if (alreadyVerified.length > 0) {
        embed.addFields({
          name: '📋 Previously Verified',
          value: alreadyVerified.map(v => 
            `**${v.name}** → ${v.roleName} ${v.hasRole ? '✅' : '⚠️ (Role missing)'} (${v.txnCount} txns)`
          ).join('\n'),
          inline: false
        });
      }

      // Failed verifications
      if (failedVerifications.length > 0) {
        embed.addFields({
          name: '❌ Not Verified',
          value: failedVerifications.map(v => 
            `**${v.name}**: ${v.error} (${v.txnCount} txns found)`
          ).join('\n'),
          inline: false
        });
      }

      // Show all roles user currently has
      const userRoles = config.contracts
        .filter(c => member.roles.cache.has(c.roleId))
        .map(c => c.name);
      
      if (userRoles.length > 0) {
        embed.addFields({
          name: '🎭 Your Current Roles',
          value: userRoles.join(', '),
          inline: false
        });
      }

      // Send announcement to verification channel for new verifications
      if (newlyVerified.filter(v => v.isNew).length > 0 && config.discord.verificationChannelId) {
        try {
          const channel = interaction.guild.channels.cache.get(config.discord.verificationChannelId);
          if (channel) {
            const announceEmbed = new EmbedBuilder()
              .setTitle('🎉 New Verification!')
              .setColor(0x00ff00)
              .setDescription(`${interaction.user} has been verified!`)
              .addFields({
                name: 'Contracts',
                value: newlyVerified.filter(v => v.isNew).map(v => `✅ ${v.name} → ${v.role} (${v.txnCount} txns)`).join('\n')
              })
              .setTimestamp();
            
            await channel.send({ embeds: [announceEmbed] });
          }
        } catch (error) {
          logger.error('Failed to send announcement', { error: error.message });
        }
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Verification command error', { error: error.message });
      return interaction.editReply({
        content: `❌ Verification failed: ${error.message}`
      });
    }
  }
};
