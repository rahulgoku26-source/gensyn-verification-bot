const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../services/database');
const gensynApi = require('../services/gensynApi');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mystatus')
    .setDescription('Check your Gensyn verification status'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;
    const userData = database.getUserByDiscordId(discordId);

    if (!userData) {
      return interaction.editReply({
        content: '❌ You have not linked an address yet.\n\nUse `/link wallet:0xYourAddress` to get started.\n\n**Important:** Use your Gensyn Dashboard Address, NOT your external wallet address.',
      });
    }

    const member = interaction.member;

    // Get stored verification data
    const storedVerification = database.getGensynVerification(userData.wallet);

    // Get live verification data
    let liveVerification = null;
    try {
      liveVerification = await gensynApi.verifyAll(userData.wallet);
    } catch (error) {
      console.error('Failed to get live verification:', error.message);
    }

    // Define applications
    const applications = [
      { name: 'CodeAssist', key: 'codeAssist', roleId: config.roles.codeAssist },
      { name: 'BlockAssist', key: 'blockAssist', roleId: config.roles.blockAssist },
      { name: 'Judge', key: 'judge', roleId: config.roles.judge },
      { name: 'RLSwarm', key: 'rlSwarm', roleId: config.roles.rlSwarm }
    ];

    // Count verified applications
    const configuredApps = applications.filter(a => a.roleId);
    let verifiedCount = 0;
    
    for (const app of configuredApps) {
      const liveData = liveVerification?.[app.key];
      if (liveData?.eligible) {
        verifiedCount++;
      }
    }

    const totalApps = configuredApps.length;
    const percentage = totalApps > 0 ? Math.round((verifiedCount / totalApps) * 100) : 0;

    // Get current roles from Discord
    const currentRoles = [];
    for (const [appName, roleId] of Object.entries(config.roles)) {
      if (roleId && member.roles.cache.has(roleId)) {
        const role = interaction.guild.roles.cache.get(roleId);
        currentRoles.push(role?.name || appName);
      }
    }

    // Progress bar
    const progressBar = createProgressBar(percentage);

    const embed = new EmbedBuilder()
      .setTitle('📊 Your Gensyn Verification Status')
      .setColor(verifiedCount === totalApps ? 0x00ff00 : (verifiedCount > 0 ? 0xffaa00 : 0xff0000))
      .addFields(
        { name: '👤 Discord', value: `${userData.discordTag || interaction.user.tag}`, inline: true },
        { name: '🔗 Address', value: `\`${userData.wallet.substring(0, 10)}...${userData.wallet.slice(-8)}\``, inline: true },
        { name: '📅 Linked', value: new Date(userData.linkedAt).toLocaleDateString(), inline: true },
        { name: '📈 Progress', value: `${progressBar}\n${verifiedCount}/${totalApps} applications (${percentage}%)`, inline: false }
      )
      .setTimestamp();

    // Add per-application status
    let appStatus = '';
    for (const app of applications) {
      if (!app.roleId) {
        continue; // Skip unconfigured applications
      }

      const liveData = liveVerification?.[app.key];
      const storedData = storedVerification?.[app.key];
      const hasRole = member.roles.cache.has(app.roleId);
      const role = interaction.guild.roles.cache.get(app.roleId);
      const roleName = role?.name || app.name;

      if (liveData?.eligible) {
        appStatus += `✅ **${app.name}**\n`;
        appStatus += `   Role: ${roleName} ${hasRole ? '✅' : '⚠️ Run /verify'}\n`;
        
        // Add app-specific details
        if (app.key === 'codeAssist') {
          appStatus += `   Participation: ${liveData.participation || 0}\n`;
        } else if (app.key === 'blockAssist') {
          appStatus += `   Participation: ${liveData.participation || 0}\n`;
        } else if (app.key === 'judge') {
          appStatus += `   Bets: ${liveData.betsPlaced || 0}, Points: ${liveData.totalPoints || 0}\n`;
        } else if (app.key === 'rlSwarm') {
          appStatus += `   Peers: ${liveData.peerCount || 0}, Wins: ${liveData.totalWins || 0}\n`;
        }
      } else {
        appStatus += `❌ **${app.name}**\n`;
        appStatus += `   Role: ${roleName}\n`;
        appStatus += `   Status: Not eligible\n`;
        
        // Add hints
        if (app.key === 'rlSwarm' && liveData) {
          if (liveData.peerCount === 0) {
            appStatus += `   Hint: No peer IDs registered\n`;
          } else {
            appStatus += `   Hint: Need wins (Peers: ${liveData.peerCount})\n`;
          }
        }
      }
      appStatus += '\n';
    }

    embed.addFields({ 
      name: '📝 Application Status', 
      value: appStatus || 'No applications configured', 
      inline: false 
    });

    // Show current roles
    if (currentRoles.length > 0) {
      embed.addFields({
        name: '🎭 Your Active Roles',
        value: currentRoles.join(', '),
        inline: false
      });
    }

    // Last verified info
    if (storedVerification?.lastVerified) {
      embed.addFields({
        name: '🕐 Last Verified',
        value: new Date(storedVerification.lastVerified).toLocaleString(),
        inline: true
      });
    }

    // Add footer with helpful info
    embed.setFooter({ text: 'Run /verify to update your roles | Data from Gensyn Dashboard API' });

    return interaction.editReply({ embeds: [embed] });
  }
};

// Helper function to create progress bar
function createProgressBar(percentage) {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
