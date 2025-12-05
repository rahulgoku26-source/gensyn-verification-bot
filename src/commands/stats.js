const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const database = require('../services/database');
const performance = require('../utils/performance');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View bot statistics (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const stats = database.getStats();
    const perfStats = performance.getStats();
    const memoryUsage = performance.getMemoryUsage();

    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Statistics')
      .setColor(0x00aaff)
      .addFields(
        { name: '👥 Total Users', value: stats.totalUsers.toString(), inline: true },
        { name: '✅ Verified', value: stats.verifiedUsers.toString(), inline: true },
        { name: '⏳ Pending', value: stats.pendingUsers.toString(), inline: true }
      )
      .setTimestamp();

    // Gensyn API status
    let apiStatus = '';
    apiStatus = `**Gensyn Dashboard API**: dashboard.gensyn.ai\n`;
    apiStatus += `**RPC**: ${config.blockchain?.rpcUrl || 'gensyn-testnet.g.alchemy.com'}`;
    
    embed.addFields({ 
      name: '🔗 API Configuration', 
      value: apiStatus, 
      inline: false 
    });

    // Per-application role configuration
    let roleConfig = '';
    const roleMapping = {
      'CodeAssist': config.roles.codeAssist,
      'BlockAssist': config.roles.blockAssist,
      'Judge': config.roles.judge,
      'RLSwarm': config.roles.rlSwarm
    };

    for (const [appName, roleId] of Object.entries(roleMapping)) {
      if (roleId) {
        const role = interaction.guild.roles.cache.get(roleId);
        const roleName = role?.name || 'Role not found';
        roleConfig += `**${appName}**: ${roleName}\n`;
      } else {
        roleConfig += `**${appName}**: ⚠️ Not configured\n`;
      }
    }

    embed.addFields({ 
      name: '🎭 Role Configuration', 
      value: roleConfig || 'No roles configured', 
      inline: false 
    });

    // Legacy contract verification stats (if any)
    if (Object.keys(stats.contractStats).length > 0) {
      let contractStats = '';
      for (const [contractId, data] of Object.entries(stats.contractStats)) {
        const percentage = stats.totalUsers > 0 
          ? Math.round((data.verified / stats.totalUsers) * 100) 
          : 0;
        contractStats += `**${data.name}**: ${data.verified} verified (${percentage}%)\n`;
      }

      if (contractStats) {
        embed.addFields({ 
          name: '📝 Legacy Contract Stats', 
          value: contractStats, 
          inline: false 
        });
      }
    }

    // Success/Failure counts
    embed.addFields(
      { name: '✅ Successful Verifications', value: stats.successCount.toString(), inline: true },
      { name: '❌ Failed Verifications', value: stats.failedCount.toString(), inline: true }
    );

    // Performance stats
    let perfInfo = '';
    perfInfo += `**Uptime:** ${perfStats.uptimeFormatted}\n`;
    perfInfo += `**Users Processed:** ${perfStats.usersProcessed}\n`;
    perfInfo += `**Speed:** ${perfStats.usersPerMinute} users/min\n`;
    perfInfo += `**Cache Hit Rate:** ${perfStats.cacheHitRate}%\n`;
    perfInfo += `**Success Rate:** ${perfStats.successRate}%`;
    
    embed.addFields({
      name: '⚡ Performance',
      value: perfInfo,
      inline: false
    });

    // Auto-verify settings
    const autoVerifyStatus = config.autoVerify.enabled 
      ? `✅ Enabled (every ${config.autoVerify.intervalMinutes} min)` 
      : '❌ Disabled';
    
    embed.addFields({
      name: '⚙️ Auto-Verify',
      value: `${autoVerifyStatus}\nBatch Size: ${config.performance.batchSize}`,
      inline: true
    });

    // Memory usage
    embed.addFields({
      name: '🖥️ Memory',
      value: `Heap: ${memoryUsage.heapUsed}\nRSS: ${memoryUsage.rss}`,
      inline: true
    });

    // Backup info
    embed.addFields({
      name: '💿 Backup',
      value: `Interval: ${config.database.backupInterval} hour(s)\nEnabled: ${config.database.backupEnabled ? '✅' : '❌'}`,
      inline: true
    });

    return interaction.editReply({ embeds: [embed] });
  }
};
