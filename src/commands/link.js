const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../services/database');
const config = require('../config/config');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Gensyn Dashboard address to your Discord account')
    .addStringOption(option =>
      option.setName('wallet')
        .setDescription('Your Gensyn Dashboard address (0x...)')
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
        content: '❌ Invalid address format. Please provide a valid Ethereum address (0x...).\n\n**Important:** Use your Gensyn Dashboard Address, NOT your external wallet address.',
        ephemeral: true
      });
    }

    const result = database.linkWallet(discordId, wallet, discordUsername, discordTag);

    if (result.success) {
      logger.discord('Address linked', { user: discordTag, wallet });
      
      // Build available roles list
      const availableRoles = [];
      const roleMapping = {
        'CodeAssist': config.roles.codeAssist,
        'BlockAssist': config.roles.blockAssist,
        'Judge': config.roles.judge,
        'RLSwarm': config.roles.rlSwarm
      };

      for (const [appName, roleId] of Object.entries(roleMapping)) {
        if (roleId) {
          const role = interaction.guild.roles.cache.get(roleId);
          availableRoles.push(`• **${appName}** → ${role ? `<@&${roleId}>` : 'Role not found'}`);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ Address Linked Successfully!')
        .setColor(0x00ff00)
        .addFields(
          { name: '🔗 Gensyn Dashboard Address', value: `\`${wallet}\``, inline: false },
          { name: '👤 Discord User', value: `${discordTag}`, inline: true },
          { name: '📅 Linked At', value: new Date().toLocaleDateString(), inline: true },
          { 
            name: '🎭 Available Roles', 
            value: availableRoles.length > 0 ? availableRoles.join('\n') : 'No roles configured',
            inline: false 
          },
          {
            name: '📋 Next Steps',
            value: '1. Participate in Gensyn applications (CodeAssist, BlockAssist, Judge, RLSwarm)\n2. Use `/verify` to check your eligibility\n3. Get your roles automatically!',
            inline: false
          },
          {
            name: '⚠️ Important',
            value: 'Make sure you linked your **Gensyn Dashboard Address** (the one shown on dashboard.gensyn.ai), NOT your external wallet address.',
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
