const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../services/database');
const gensynApi = require('../services/gensynApi');
const config = require('../config/config');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Gensyn Dashboard participation and get roles'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;

    // Check if user has linked wallet
    const userData = database.getUserByDiscordId(discordId);
    if (!userData) {
      return interaction.editReply({
        content: '❌ You need to link your Gensyn Dashboard address first!\n\nUse `/link wallet:0xYourAddress` to link your address.\n\n**Important:** Use your Gensyn Dashboard Address, NOT your external wallet address.'
      });
    }

    const wallet = userData.wallet;
    const member = interaction.member;

    // Update user info if not already stored
    if (!userData.discordUsername) {
      database.updateUserInfo(wallet, interaction.user.username, interaction.user.tag);
    }

    try {
      // Verify all applications using Gensyn Dashboard API
      const results = await gensynApi.verifyAll(wallet);
      
      // Save verification results to database
      database.saveGensynVerification(wallet, results);

      // Track role assignments
      const newlyVerified = [];
      const alreadyVerified = [];
      const failedVerifications = [];

      // Define applications and their role mappings
      const applications = [
        { name: 'CodeAssist', key: 'codeAssist', roleId: config.roles.codeAssist, result: results.codeAssist },
        { name: 'BlockAssist', key: 'blockAssist', roleId: config.roles.blockAssist, result: results.blockAssist },
        { name: 'Judge', key: 'judge', roleId: config.roles.judge, result: results.judge },
        { name: 'RLSwarm', key: 'rlSwarm', roleId: config.roles.rlSwarm, result: results.rlSwarm }
      ];

      for (const app of applications) {
        const { name, key, roleId, result } = app;
        
        if (!roleId) {
          // Role not configured, skip
          continue;
        }

        if (result.eligible) {
          const role = interaction.guild.roles.cache.get(roleId);
          const roleName = role?.name || name;
          const hadRole = member.roles.cache.has(roleId);

          // Assign role if not already assigned
          try {
            if (role && !hadRole) {
              await member.roles.add(role);
              console.log(`[${new Date().toISOString()}] ✅ SUCCESS | Discord: ${interaction.user.username} (${discordId}) | Address: ${wallet.substring(0, 10)}...${wallet.slice(-4)} | App: ${name} | Role Assigned: ✅`);
              newlyVerified.push({
                name: name,
                role: roleName,
                details: result.message,
                isNew: true
              });
            } else if (hadRole) {
              console.log(`[${new Date().toISOString()}] ✅ SUCCESS | Discord: ${interaction.user.username} (${discordId}) | Address: ${wallet.substring(0, 10)}...${wallet.slice(-4)} | App: ${name} | Role: Already had role`);
              alreadyVerified.push({
                name: name,
                roleName: roleName,
                hasRole: true,
                details: result.message
              });
            }
          } catch (roleError) {
            logger.error('Failed to assign role', { error: roleError.message, app: name });
            console.log(`[${new Date().toISOString()}] ⚠️ WARNING | Discord: ${interaction.user.username} (${discordId}) | Address: ${wallet.substring(0, 10)}...${wallet.slice(-4)} | App: ${name} | Role Assigned: ❌ (Failed to assign)`);
            newlyVerified.push({
              name: name,
              role: roleName,
              details: result.message,
              isNew: false,
              error: 'Failed to assign role'
            });
          }

          // Record to success log
          database.recordSuccessfulVerification({
            discordId: discordId,
            discordUsername: interaction.user.username,
            walletAddress: wallet,
            contractId: key,
            contractName: name,
            txnCount: 0,
            roleAssigned: !hadRole
          });
        } else {
          console.log(`[${new Date().toISOString()}] ❌ FAILED  | Discord: ${interaction.user.username} (${discordId}) | Address: ${wallet.substring(0, 10)}...${wallet.slice(-4)} | App: ${name} | Reason: ${result.message}`);
          failedVerifications.push({
            name: name,
            details: result.message
          });
        }
      }

      // Build response embed
      const totalApps = applications.filter(a => a.roleId).length;
      const verifiedCount = newlyVerified.length + alreadyVerified.length;
      const progressPercent = totalApps > 0 ? Math.round((verifiedCount / totalApps) * 100) : 0;

      const embed = new EmbedBuilder()
        .setTitle('🔍 Gensyn Verification Results')
        .setColor(newlyVerified.length > 0 ? 0x00ff00 : (verifiedCount > 0 ? 0xffaa00 : 0xff0000))
        .setDescription(`**Address:** \`${wallet.substring(0, 10)}...${wallet.slice(-4)}\`\n**Progress:** ${verifiedCount}/${totalApps} applications verified (${progressPercent}%)`)
        .setTimestamp();

      // Newly verified
      if (newlyVerified.length > 0) {
        const newRoles = newlyVerified.filter(v => v.isNew);
        const existingRoles = newlyVerified.filter(v => !v.isNew);

        if (newRoles.length > 0) {
          embed.addFields({
            name: '🎉 Newly Verified',
            value: newRoles.map(v => 
              `**${v.name}** → Role: ${v.role}\n${v.details}`
            ).join('\n\n'),
            inline: false
          });
        }

        if (existingRoles.length > 0) {
          embed.addFields({
            name: '✅ Verified (Role Already Assigned)',
            value: existingRoles.map(v => 
              `**${v.name}** → Role: ${v.role}`
            ).join('\n'),
            inline: false
          });
        }
      }

      // Already verified (previous session)
      if (alreadyVerified.length > 0) {
        embed.addFields({
          name: '📋 Previously Verified',
          value: alreadyVerified.map(v => 
            `**${v.name}** → ${v.roleName} ${v.hasRole ? '✅' : '⚠️ (Role missing)'}`
          ).join('\n'),
          inline: false
        });
      }

      // Failed verifications
      if (failedVerifications.length > 0) {
        embed.addFields({
          name: '❌ Not Eligible',
          value: failedVerifications.map(v => 
            `**${v.name}**: ${v.details}`
          ).join('\n'),
          inline: false
        });
      }

      // Show all Gensyn roles user currently has
      const gensynRoleIds = Object.values(config.roles).filter(Boolean);
      const userGensynRoles = [];
      for (const [appName, roleId] of Object.entries(config.roles)) {
        if (roleId && member.roles.cache.has(roleId)) {
          const role = interaction.guild.roles.cache.get(roleId);
          userGensynRoles.push(role?.name || appName);
        }
      }
      
      if (userGensynRoles.length > 0) {
        embed.addFields({
          name: '🎭 Your Gensyn Roles',
          value: userGensynRoles.join(', '),
          inline: false
        });
      }

      // Add tips
      embed.addFields({
        name: '💡 Tips',
        value: '• You can run `/verify` again anytime to check for new eligibility\n• Roles are added incrementally - existing roles are kept\n• Make sure you linked your **Gensyn Dashboard Address**',
        inline: false
      });

      // Send announcement to verification channel for new verifications
      if (newlyVerified.filter(v => v.isNew).length > 0 && config.discord.verificationChannelId) {
        try {
          const channel = interaction.guild.channels.cache.get(config.discord.verificationChannelId);
          if (channel) {
            const announceEmbed = new EmbedBuilder()
              .setTitle('🎉 New Gensyn Verification!')
              .setColor(0x00ff00)
              .setDescription(`${interaction.user} has been verified!`)
              .addFields({
                name: 'Applications',
                value: newlyVerified.filter(v => v.isNew).map(v => `✅ ${v.name} → ${v.role}`).join('\n')
              })
              .setTimestamp();
            
            await channel.send({ embeds: [announceEmbed] });
          }
        } catch (error) {
          logger.error('Failed to send announcement', { error: error.message });
        }
      }

      // Send detailed log to log channel
      if (config.discord.logChannelId) {
        try {
          const logChannel = interaction.guild.channels.cache.get(config.discord.logChannelId);
          if (logChannel) {
            const newRolesAdded = newlyVerified.filter(v => v.isNew).map(v => v.role);
            const logEmbed = new EmbedBuilder()
              .setTitle('📋 Verification Log')
              .setColor(verifiedCount > 0 ? 0x00ff00 : 0xff0000)
              .addFields(
                { name: '👤 User', value: `${interaction.user.tag} (${discordId})`, inline: true },
                { name: '🔗 Address', value: `\`${wallet.substring(0, 10)}...${wallet.slice(-4)}\``, inline: true },
                { name: '📊 Results', value: `${verifiedCount}/${totalApps} eligible`, inline: true },
                { name: '🔵 CodeAssist', value: results.codeAssist.message, inline: false },
                { name: '🟢 BlockAssist', value: results.blockAssist.message, inline: false },
                { name: '⚖️ Judge', value: results.judge.message, inline: false },
                { name: '🐝 RLSwarm', value: results.rlSwarm.message, inline: false }
              )
              .setTimestamp();

            if (newRolesAdded.length > 0) {
              logEmbed.addFields({ name: '🎭 Roles Added', value: newRolesAdded.join(', '), inline: false });
            }
            
            await logChannel.send({ embeds: [logEmbed] });
          }
        } catch (error) {
          logger.error('Failed to send log', { error: error.message });
        }
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Verification command error', { error: error.message });
      
      // Log failed verification attempt to log channel
      if (config.discord.logChannelId) {
        try {
          const logChannel = interaction.guild.channels.cache.get(config.discord.logChannelId);
          if (logChannel) {
            const addressDisplay = wallet 
              ? `\`${wallet.substring(0, 10)}...${wallet.slice(-4)}\`` 
              : 'Unknown';
            const errorEmbed = new EmbedBuilder()
              .setTitle('❌ Verification Failed')
              .setColor(0xff0000)
              .addFields(
                { name: '👤 User', value: `${interaction.user.tag} (${discordId})`, inline: true },
                { name: '🔗 Address', value: addressDisplay, inline: true },
                { name: '❌ Error', value: error.message || 'Unknown error', inline: false }
              )
              .setTimestamp();
            
            await logChannel.send({ embeds: [errorEmbed] });
          }
        } catch (logError) {
          logger.error('Failed to send error log', { error: logError.message });
        }
      }
      
      let errorMessage = `❌ Verification failed: ${error.message}`;
      if (error.message.includes('Invalid Ethereum address')) {
        errorMessage += '\n\n**Tip:** Make sure you linked a valid Gensyn Dashboard address (0x...).';
      }
      
      return interaction.editReply({ content: errorMessage });
    }
  }
};

