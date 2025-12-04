const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const database = require('../services/database');
const config = require('../config/config');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View bot statistics (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const stats = database.getStats();
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Bot Statistics')
        .setDescription(`Multi-contract verification statistics for **${config.blockchain.chainName}**`)
        .addFields(
          { name: '👥 Total Users', value: `${stats.total}`, inline: true },
          { name: '✅ Total Verifications', value: `${stats.totalVerifications}`, inline: true },
          { name: '📊 Avg per User', value: `${(stats.totalVerifications / stats.total || 0).toFixed(1)}`, inline: true }
        );
      
      // Add per-contract statistics
      embed.addFields({
        name: '\u200B',
        value: '**📝 Per-Contract Statistics**',
        inline: false
      });
      
      Object.entries(stats.byContract).forEach(([contractId, contractStats]) => {
        const total = contractStats.verified + contractStats.pending;
        const percentage = total > 0 
          ? Math.round((contractStats.verified / total) * 100) 
          : 0;
        
        const progressBar = this.createProgressBar(contractStats.verified, total);
        
        embed.addFields({
          name: `${contractStats.name}`,
          value: `${progressBar}\n✅ Verified: **${contractStats.verified}** | ⏳ Pending: **${contractStats.pending}** | Rate: **${percentage}%**`,
          inline: false
        });
      });
      
      // Recent activity
      embed.addFields(
        { name: '\u200B', value: '**📈 Recent Activity (24h)**', inline: false },
        { name: '🔗 New Links', value: `${stats.recentLinks}`, inline: true },
        { name: '✅ New Verifications', value: `${stats.recentVerifications}`, inline: true },
        { name: '🎯 Success Rate', value: stats.recentLinks > 0 ? `${Math.round((stats.recentVerifications / stats.recentLinks) * 100)}%` : 'N/A', inline: true }
      );
      
      // System info
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      
      embed.addFields(
        { name: '\u200B', value: '**⚙️ System Info**', inline: false },
        { name: 'Uptime', value: `${hours}h ${minutes}m`, inline: true },
        { name: 'Memory Usage', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true },
        { name: 'Node Version', value: process.version, inline: true }
      );
      
      embed.setFooter({ 
        text: `${config.contracts.length} contracts configured • ${config.blockchain.chainName}` 
      });
      embed.setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      logger.error('Error fetching stats', { error: error.message });
      return interaction.editReply('❌ Error fetching statistics. Check logs for details.');
    }
  },
  
  // Helper function to create progress bar
  createProgressBar(current, total, length = 10) {
    const percentage = total > 0 ? current / total : 0;
    const filled = Math.round(length * percentage);
    const empty = length - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${bar} ${current}/${total}`;
  }
};