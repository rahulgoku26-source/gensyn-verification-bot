const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const database = require('../services/database');
const config = require('../config/config');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands for verification management')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('failures')
        .setDescription('View recent failed verifications')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of failures to show (default: 10)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('successes')
        .setDescription('View recent successful verifications')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of successes to show (default: 10)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('Look up a specific user')
        .addUserOption(option =>
          option.setName('target')
            .setDescription('The user to look up')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('export')
        .setDescription('Export all data as JSON')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'failures':
        await handleFailures(interaction);
        break;
      case 'successes':
        await handleSuccesses(interaction);
        break;
      case 'user':
        await handleUserLookup(interaction);
        break;
      case 'export':
        await handleExport(interaction);
        break;
    }
  }
};

async function handleFailures(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const limit = interaction.options.getInteger('limit') || 10;
  const failures = database.getFailedVerifications(limit);

  if (failures.length === 0) {
    return interaction.editReply({
      content: '✅ No failed verifications recorded.'
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('❌ Recent Failed Verifications')
    .setColor(0xff0000)
    .setDescription(`Showing last ${failures.length} failed verifications`)
    .setTimestamp();

  // Group failures by user
  let failureText = '';
  for (const failure of failures.slice(0, 10)) {
    const timestamp = new Date(failure.timestamp).toLocaleString();
    const username = failure.discordUsername || 'Unknown';
    const wallet = failure.walletAddress 
      ? `${failure.walletAddress.substring(0, 10)}...` 
      : 'N/A';
    
    failureText += `**${username}** - ${failure.contractName}\n`;
    failureText += `📅 ${timestamp}\n`;
    failureText += `💼 Wallet: \`${wallet}\`\n`;
    failureText += `❌ Reason: ${failure.reason}\n\n`;
  }

  embed.addFields({
    name: 'Failed Verifications',
    value: failureText || 'No data',
    inline: false
  });

  // Summary stats
  const totalFailures = database.getFailedVerifications(1000).length;
  embed.setFooter({ text: `Total failed verifications logged: ${totalFailures}` });

  return interaction.editReply({ embeds: [embed] });
}

async function handleSuccesses(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const limit = interaction.options.getInteger('limit') || 10;
  const successes = database.getSuccessfulVerifications(limit);

  if (successes.length === 0) {
    return interaction.editReply({
      content: '📋 No successful verifications recorded yet.'
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Recent Successful Verifications')
    .setColor(0x00ff00)
    .setDescription(`Showing last ${successes.length} successful verifications`)
    .setTimestamp();

  let successText = '';
  for (const success of successes.slice(0, 10)) {
    const timestamp = new Date(success.timestamp).toLocaleString();
    const username = success.discordUsername || 'Unknown';
    const wallet = success.walletAddress 
      ? `${success.walletAddress.substring(0, 10)}...` 
      : 'N/A';
    
    successText += `**${username}** - ${success.contractName}\n`;
    successText += `📅 ${timestamp}\n`;
    successText += `💼 Wallet: \`${wallet}\`\n`;
    successText += `🎭 Role: ${success.roleName || 'N/A'}\n`;
    if (success.txHash) {
      successText += `🔗 TX: \`${success.txHash.substring(0, 16)}...\`\n`;
    }
    successText += '\n';
  }

  embed.addFields({
    name: 'Successful Verifications',
    value: successText || 'No data',
    inline: false
  });

  // Summary stats
  const totalSuccesses = database.getSuccessfulVerifications(1000).length;
  embed.setFooter({ text: `Total successful verifications logged: ${totalSuccesses}` });

  return interaction.editReply({ embeds: [embed] });
}

async function handleUserLookup(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const targetUser = interaction.options.getUser('target');
  const userData = database.getUserByDiscordId(targetUser.id);

  if (!userData) {
    return interaction.editReply({
      content: `❌ User ${targetUser.tag} has not linked a wallet.`
    });
  }

  const verifications = userData.verifications || {};
  const totalContracts = config.contracts.length;
  const verifiedCount = Object.values(verifications).filter(v => v.verified).length;

  // Get member info
  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  const embed = new EmbedBuilder()
    .setTitle(`👤 User Lookup: ${targetUser.tag}`)
    .setColor(0x00aaff)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: '🆔 Discord ID', value: targetUser.id, inline: true },
      { name: '📛 Username', value: userData.discordUsername || targetUser.username, inline: true },
      { name: '🏷️ Tag', value: userData.discordTag || targetUser.tag, inline: true },
      { name: '💼 Wallet', value: `\`${userData.wallet}\``, inline: false },
      { name: '📅 Linked At', value: new Date(userData.linkedAt).toLocaleString(), inline: true },
      { name: '📈 Progress', value: `${verifiedCount}/${totalContracts} contracts`, inline: true }
    )
    .setTimestamp();

  // Last checked
  if (userData.lastCheckedAt) {
    embed.addFields({
      name: '🕐 Last Auto-Check',
      value: new Date(userData.lastCheckedAt).toLocaleString(),
      inline: true
    });
  }

  // Verification attempts
  embed.addFields({
    name: '🔄 Attempts',
    value: (userData.attempts || 0).toString(),
    inline: true
  });

  // Contract status
  let contractStatus = '';
  for (const contract of config.contracts) {
    const verification = verifications[contract.id];
    const hasRole = member?.roles.cache.has(contract.roleId);
    
    if (verification?.verified) {
      contractStatus += `✅ **${contract.name}**\n`;
      contractStatus += `   Verified: ${new Date(verification.verifiedAt).toLocaleDateString()}\n`;
      contractStatus += `   Role: ${hasRole ? '✅ Has role' : '⚠️ Missing role'}\n`;
      if (verification.txHash) {
        contractStatus += `   TX: \`${verification.txHash.substring(0, 16)}...\`\n`;
      }
    } else {
      contractStatus += `❌ **${contract.name}** - Not verified\n`;
    }
  }

  embed.addFields({
    name: '📝 Contract Status',
    value: contractStatus || 'No contracts configured',
    inline: false
  });

  // Current roles from database
  const dbRoles = userData.roles || [];
  if (dbRoles.length > 0) {
    const roleNames = dbRoles.map(roleId => {
      const role = interaction.guild.roles.cache.get(roleId);
      return role?.name || roleId;
    }).join(', ');
    
    embed.addFields({
      name: '🎭 Recorded Roles',
      value: roleNames,
      inline: false
    });
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleExport(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const allData = database.exportAllData();
    const jsonString = JSON.stringify(allData, null, 2);
    
    // Create buffer from JSON string
    const buffer = Buffer.from(jsonString, 'utf-8');
    
    // Create attachment
    const attachment = new AttachmentBuilder(buffer, { 
      name: `verification-data-${Date.now()}.json` 
    });

    const embed = new EmbedBuilder()
      .setTitle('📤 Data Export')
      .setColor(0x00ff00)
      .setDescription('Complete database export attached below.')
      .addFields(
        { name: '👥 Total Users', value: Object.keys(allData.users).length.toString(), inline: true },
        { name: '✅ Successes Logged', value: allData.successfulVerifications.length.toString(), inline: true },
        { name: '❌ Failures Logged', value: allData.failedVerifications.length.toString(), inline: true },
        { name: '📅 Export Time', value: new Date(allData.exportedAt).toLocaleString(), inline: false }
      )
      .setTimestamp();

    logger.info('Data export requested', { 
      user: interaction.user.tag,
      totalUsers: Object.keys(allData.users).length 
    });

    return interaction.editReply({ 
      embeds: [embed], 
      files: [attachment] 
    });

  } catch (error) {
    logger.error('Export failed', { error: error.message });
    return interaction.editReply({
      content: `❌ Export failed: ${error.message}`
    });
  }
}
