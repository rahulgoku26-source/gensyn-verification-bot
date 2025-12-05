const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../services/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin-unlink')
    .setDescription('Admin: Unlink a wallet from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('Unlink by Discord user')
        .addUserOption(option =>
          option.setName('target')
            .setDescription('The user to unlink')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('address')
        .setDescription('Unlink by wallet address')
        .addStringOption(option =>
          option.setName('wallet')
            .setDescription('The wallet address to unlink')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    try {
      let targetUser, address, discordId;

      if (subcommand === 'user') {
        targetUser = interaction.options.getUser('target');
        const userData = db.getUserByDiscordId(targetUser.id);

        if (!userData) {
          return await interaction.editReply({
            content: `❌ User ${targetUser.tag} doesn't have any wallet linked.`
          });
        }

        address = userData.wallet;
        discordId = targetUser.id;

      } else if (subcommand === 'address') {
        address = interaction.options.getString('wallet');
        const userData = db.getUserByWallet(address);

        if (!userData) {
          return await interaction.editReply({
            content: `❌ Address \`${address}\` is not linked to any user.`
          });
        }

        discordId = userData.discordId;
        targetUser = await interaction.client.users.fetch(discordId).catch(() => null);
      }

      // Remove from database
      db.removeUser(address);

      const embed = new EmbedBuilder()
        .setTitle('✅ Wallet Unlinked by Admin')
        .setColor(0x2ecc71)
        .addFields(
          { name: '👤 User', value: targetUser ? `${targetUser.tag} (<@${discordId}>)` : `ID: ${discordId}`, inline: true },
          { name: '🔗 Address Removed', value: `\`${address}\``, inline: true },
          { name: '👮 Admin', value: `${interaction.user.tag}`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Log to channel
      const logChannelId = process.env.LOG_CHANNEL_ID;
      if (logChannelId) {
        try {
          const logChannel = await interaction.client.channels.fetch(logChannelId);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle('🔓 Admin Wallet Unlink')
              .setColor(0xe74c3c)
              .addFields(
                { name: '👤 Target User', value: targetUser ? `${targetUser.tag}\n<@${discordId}>` : `ID: ${discordId}`, inline: true },
                { name: '🔗 Address Removed', value: `\`${address}\``, inline: true },
                { name: '👮 Admin', value: `${interaction.user.tag}\n<@${interaction.user.id}>`, inline: true }
              )
              .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] });
          }
        } catch (logError) {
          console.error('Failed to log unlink action:', logError);
        }
      }

    } catch (error) {
      console.error('Admin unlink error:', error);
      await interaction.editReply({
        content: `❌ Error: ${error.message}`
      });
    }
  }
};
