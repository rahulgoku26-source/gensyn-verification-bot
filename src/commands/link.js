const { SlashCommandBuilder } = require('discord.js');
const database = require('../services/database');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your wallet address to your Discord account')
    .addStringOption(option =>
      option.setName('wallet')
        .setDescription('Your wallet address (0x... )')
        .setRequired(true)
    ),

  async execute(interaction) {
    const wallet = interaction.options. getString('wallet');
    const discordId = interaction.user.id;

    // Validate wallet format
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return interaction.reply({
        content: '❌ Invalid wallet address format.  Please provide a valid Ethereum address (0x...)',
        ephemeral: true
      });
    }

    const result = database.linkWallet(discordId, wallet);

    if (result.success) {
      logger.discord('Wallet linked', { user: interaction.user.tag, wallet });
      return interaction.reply({
        content: `✅ **Wallet linked successfully! **\n\n` +
                 `🔗 **Wallet:** \`${wallet}\`\n\n` +
                 `You can now use \`/verify\` to verify your contract interactions.`,
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
