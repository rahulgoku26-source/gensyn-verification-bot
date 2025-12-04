const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../services/database');
const config = require('../config/config');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your wallet address to your Discord account')
    .addStringOption(option =>
      option.setName('wallet')
        .setDescription('Your wallet address (0x...)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const wallet = interaction.options.getString('wallet');
    const discordId = interaction.user.id;
    const discordUsername = interaction.user.username;
    const discordTag = interaction.user.tag;

    // Validate wallet format
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return interaction.reply({
        content: '❌ Invalid wallet address format. Please provide a valid Ethereum address (0x...)',
        ephemeral: true
      });
    }

    const result = database.linkWallet(discordId, wallet, discordUsername, discordTag);

    if (result.success) {
      logger.discord('Wallet linked', { user: discordTag, wallet });
      
      // Build available roles list
      const availableRoles = config.contracts.map(c => {
        const role = interaction.guild.roles.cache.get(c.roleId);
        return `• **${c.name}** → ${role ? `<@&${c.roleId}>` : 'Role not found'}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('✅ Wallet Linked Successfully!')
        .setColor(0x00ff00)
        .addFields(
          { name: '🔗 Wallet', value: `\`${wallet}\``, inline: false },
          { name: '👤 Discord User', value: `${discordTag}`, inline: true },
          { name: '📅 Linked At', value: new Date().toLocaleDateString(), inline: true },
          { 
            name: '🎭 Available Roles', 
            value: availableRoles || 'No contracts configured',
            inline: false 
          },
          {
            name: '📋 Next Steps',
            value: '1. Send transactions to the contract addresses\n2. Use `/verify` to check all contracts\n3. Get your roles automatically!',
            inline: false
          }
        )
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    } else {
      return interaction.reply({
        content: `❌ ${result.error}`,
        ephemeral: true
      });
    }
  }
};
