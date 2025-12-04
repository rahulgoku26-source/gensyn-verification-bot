const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const database = require('../services/database');
const blockchain = require('../services/blockchain');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View bot statistics (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const stats = database.getStats();
    const connectionResults = await blockchain.testAllConnections();

    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Statistics')
      .setColor(0x00aaff)
      .addFields(
        { name: '👥 Total Users', value: stats.totalUsers.toString(), inline: true },
        { name: '✅ Verified', value: stats.verifiedUsers.toString(), inline: true },
        { name: '⏳ Pending', value: stats.pendingUsers.toString(), inline: true }
      )
      .setTimestamp();

    // Connection status per contract
    let connectionStatus = '';
    for (const result of connectionResults) {
      if (result.success) {
        connectionStatus += `✅ **${result.contractName}**\n`;
        connectionStatus += `   Block: ${result.blockNumber}\n`;
      } else {
        connectionStatus += `❌ **${result.contractName}**\n`;
        connectionStatus += `   Error: ${result.error}\n`;
      }
    }
    
    embed.addFields({ 
      name: '🔗 Blockchain Connection Status', 
      value: connectionStatus || 'No contracts configured', 
      inline: false 
    });

    // Per-contract verification stats
    let contractStats = '';
    for (const [contractId, data] of Object.entries(stats.contractStats)) {
      const percentage = stats.totalUsers > 0 
        ? Math.round((data.verified / stats.totalUsers) * 100) 
        : 0;
      contractStats += `**${data.name}**: ${data.verified} verified (${percentage}%)\n`;
    }

    if (contractStats) {
      embed.addFields({ 
        name: '📝 Contract Verification Stats', 
        value: contractStats, 
        inline: false 
      });
    }

    // Role distribution
    let roleDistribution = '';
    for (const [roleId, data] of Object.entries(stats.roleDistribution)) {
      const role = interaction.guild.roles.cache.get(roleId);
      const roleName = role?.name || data.name;
      const percentage = stats.totalUsers > 0 
        ? Math.round((data.count / stats.totalUsers) * 100) 
        : 0;
      roleDistribution += `**${roleName}**: ${data.count} users (${percentage}%)\n`;
    }

    if (roleDistribution) {
      embed.addFields({ 
        name: '🎭 Role Distribution', 
        value: roleDistribution, 
        inline: false 
      });
    }

    // Success/Failure counts
    embed.addFields(
      { name: '✅ Successful Verifications', value: stats.successCount.toString(), inline: true },
      { name: '❌ Failed Verifications', value: stats.failedCount.toString(), inline: true }
    );

    // Auto-verify settings
    const autoVerifyStatus = config.autoVerify.enabled 
      ? `✅ Enabled (every ${config.autoVerify.intervalMinutes} min)` 
      : '❌ Disabled';
    
    embed.addFields({
      name: '⚙️ Auto-Verify',
      value: autoVerifyStatus,
      inline: false
    });

    // Cache info
    embed.addFields({
      name: '💾 Cache',
      value: `${blockchain.getCacheSize()} entries`,
      inline: true
    });

    return interaction.editReply({ embeds: [embed] });
  }
};
