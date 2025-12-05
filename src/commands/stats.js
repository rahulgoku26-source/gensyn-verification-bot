const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const database = require('../services/database');
const explorerApi = require('../services/explorerApi');
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
    
    // Test Explorer API connection
    const connectionTest = await explorerApi.testConnection();

    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Statistics')
      .setColor(0x00aaff)
      .addFields(
        { name: '👥 Total Users', value: stats.totalUsers.toString(), inline: true },
        { name: '✅ Verified', value: stats.verifiedUsers.toString(), inline: true },
        { name: '⏳ Pending', value: stats.pendingUsers.toString(), inline: true }
      )
      .setTimestamp();

    // Explorer API status
    let apiStatus = '';
    if (connectionTest.success) {
      apiStatus = `✅ **Block Explorer API**: Connected\n`;
      apiStatus += `   URL: ${config.explorer.apiUrl.substring(0, 40)}...\n`;
      apiStatus += `   Min Txns: ${config.explorer.minTransactions}`;
    } else {
      apiStatus = `❌ **Block Explorer API**: Error\n`;
      apiStatus += `   Error: ${connectionTest.error}`;
    }
    
    embed.addFields({ 
      name: '🔗 API Connection Status', 
      value: apiStatus, 
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

    // Cache info
    embed.addFields({
      name: '💾 Cache',
      value: `${explorerApi.getCacheSize()} entries\nTTL: ${config.performance.cacheTTL}s`,
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
