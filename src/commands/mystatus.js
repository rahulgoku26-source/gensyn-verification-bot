const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../services/database');
const explorerApi = require('../services/explorerApi');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mystatus')
    .setDescription('Check your verification status'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;
    const userData = database.getUserByDiscordId(discordId);

    if (!userData) {
      return interaction.editReply({
        content: '❌ You have not linked a wallet yet.\n\nUse `/link wallet:0xYourAddress` to get started.',
      });
    }

    const verifications = userData.verifications || {};
    const totalContracts = config.contracts.length;
    const verifiedCount = Object.values(verifications).filter(v => v.verified).length;
    const percentage = Math.round((verifiedCount / totalContracts) * 100);

    // Get current roles from Discord
    const member = interaction.member;
    const currentRoles = config.contracts
      .filter(c => member.roles.cache.has(c.roleId))
      .map(c => c.name);

    // Get live transaction counts from Explorer API
    const walletSummary = await explorerApi.getWalletSummary(userData.wallet);
    const minTxns = config.explorer.minTransactions;

    // Progress bar
    const progressBar = createProgressBar(percentage);

    const embed = new EmbedBuilder()
      .setTitle('📊 Your Verification Status')
      .setColor(verifiedCount === totalContracts ? 0x00ff00 : (verifiedCount > 0 ? 0xffaa00 : 0xff0000))
      .addFields(
        { name: '👤 Discord', value: `${userData.discordTag || interaction.user.tag}`, inline: true },
        { name: '🔗 Wallet', value: `\`${userData.wallet.substring(0, 10)}...${userData.wallet.slice(-8)}\``, inline: true },
        { name: '📅 Linked', value: new Date(userData.linkedAt).toLocaleDateString(), inline: true },
        { name: '📈 Progress', value: `${progressBar}\n${verifiedCount}/${totalContracts} contracts (${percentage}%)`, inline: false }
      )
      .setTimestamp();

    // Add per-contract status with transaction counts
    let contractStatus = '';
    for (const contract of config.contracts) {
      const verification = verifications[contract.id];
      const hasRole = member.roles.cache.has(contract.roleId);
      const role = interaction.guild.roles.cache.get(contract.roleId);
      const roleName = role?.name || contract.name;

      // Get live transaction count if available
      let liveTxnCount = 0;
      if (walletSummary.success && walletSummary.summary[contract.id]) {
        liveTxnCount = walletSummary.summary[contract.id].txnCount;
      }
      
      // Use stored txn count if no live data
      const txnCount = liveTxnCount || verification?.txnCount || 0;
      const txnStatus = txnCount >= minTxns ? '✅' : `❌ (need ${minTxns - txnCount} more)`;

      if (verification?.verified) {
        const verifiedDate = new Date(verification.verifiedAt).toLocaleDateString();
        contractStatus += `✅ **${contract.name}**\n`;
        contractStatus += `   Role: ${roleName} ${hasRole ? '✅' : '⚠️ Missing'}\n`;
        contractStatus += `   Transactions: ${txnCount} ${txnStatus}\n`;
        contractStatus += `   Verified: ${verifiedDate}\n`;
      } else {
        contractStatus += `❌ **${contract.name}**\n`;
        contractStatus += `   Role: ${roleName}\n`;
        contractStatus += `   Transactions: ${txnCount}/${minTxns} ${txnStatus}\n`;
        contractStatus += `   Status: Not verified\n`;
      }
      contractStatus += '\n';
    }

    embed.addFields({ 
      name: '📝 Contract Status', 
      value: contractStatus || 'No contracts configured', 
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

    // Last checked info
    if (userData.lastCheckedAt) {
      embed.addFields({
        name: '🕐 Last Auto-Check',
        value: new Date(userData.lastCheckedAt).toLocaleString(),
        inline: true
      });
    }

    // Attempts info
    if (userData.attempts > 0) {
      embed.addFields({
        name: '🔄 Verification Attempts',
        value: userData.attempts.toString(),
        inline: true
      });
    }

    // Add min transactions info
    embed.setFooter({ text: `Minimum ${minTxns} transactions required per contract | Data via Block Explorer API` });

    return interaction.editReply({ embeds: [embed] });
  }
};

// Helper function to create progress bar
function createProgressBar(percentage) {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
