const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../services/database');
const blockchain = require('../services/blockchain');
const config = require('../config/config');
const logger = require('../utils/logger');

const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your linked wallet and get role')
    .addStringOption(option =>
      option.setName('contract')
        .setDescription('Specific contract to verify (optional - checks all by default)')
        .setRequired(false)
        .addChoices(...config.contracts.map(c => ({ name: c.name, value: c.id })))),
  
  async execute(interaction) {
    const userId = interaction.user.id;
    const specificContract = interaction.options.getString('contract');
    
    // Rate limiting
    const now = Date.now();
    const cooldownAmount = config.rateLimit.verifyCommandCooldown * 1000;
    
    if (cooldowns.has(userId)) {
      const expirationTime = cooldowns.get(userId) + cooldownAmount;
      if (now < expirationTime) {
        const timeLeft = Math.ceil((expirationTime - now) / 1000);
        return interaction.reply({
          content: `⏱️ Please wait ${timeLeft} more second(s) before verifying again.`,
          ephemeral: true
        });
      }
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    // Find user's linked wallet
    const userEntry = database.getUserByDiscordId(userId);
    
    if (!userEntry) {
      return interaction.editReply('❌ You haven\'t linked a wallet yet. Use `/link` first with your wallet address.');
    }
    
    const [walletAddress, userData] = userEntry;
    
    // Check if already verified for this contract
    if (specificContract) {
      const isVerified = database.isVerifiedForContract(walletAddress, specificContract);
      if (isVerified) {
        const contract = config.getContractById(specificContract);
        const verification = userData.verifications[specificContract];
        
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Already Verified')
          .setDescription(`You are already verified for **${contract.name}**!`)
          .addFields(
            { name: 'Wallet', value: `\`${walletAddress}\``, inline: false },
            { name: 'Contract', value: contract.name, inline: true },
            { name: 'Transaction', value: `\`${verification.txHash}\``, inline: false },
            { name: 'Verified At', value: new Date(verification.verifiedAt).toLocaleString(), inline: true }
          );
        return interaction.editReply({ embeds: [embed] });
      }
    }
    
    // Set cooldown
    cooldowns.set(userId, now);
    setTimeout(() => cooldowns.delete(userId), cooldownAmount);
    
    // Increment attempts
    database.incrementAttempts(walletAddress);
    
    // Check blockchain
    const searchMessage = specificContract 
      ? `🔍 Checking ${config.getContractById(specificContract).name}...`
      : '🔍 Scanning all contracts on blockchain...';
    await interaction.editReply(searchMessage);
    
    const verification = await blockchain.verifyTransaction(walletAddress, specificContract);
    
    if (!verification.success) {
      const contractInfo = specificContract
        ? config.getContractById(specificContract)
        : null;
      
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Verification Failed')
        .setDescription(verification.error)
        .addFields(
          { 
            name: '📋 Requirements', 
            value: contractInfo 
              ? `• Send a transaction to **${contractInfo.name}**: \`${contractInfo.address}\``
              : `• Send a transaction to any of these contracts:\n${config.contracts.map(c => `  - **${c.name}**: \`${c.address}\``).join('\n')}`,
            inline: false 
          },
          { name: 'Network', value: config.blockchain.chainName, inline: true },
          { name: 'Chain ID', value: config.blockchain.chainId, inline: true },
          { name: 'Min Confirmations', value: `${config.blockchain.minConfirmations}`, inline: true },
          { name: 'Attempts', value: `${userData.attempts + 1}`, inline: true }
        )
        .setFooter({ text: 'Need help? Use /info to see contract details' });
      
      return interaction.editReply({ embeds: [errorEmbed] });
    }
    
    // Assign role for the verified contract
    const contract = verification.contract;
    
    try {
      const member = interaction.member;
      const role = interaction.guild.roles.cache.get(contract.roleId);
      
      if (!role) {
        logger.error('Role not found', { roleId: contract.roleId, contract: contract.name });
        return interaction.editReply(`❌ Role for ${contract.name} not found. Contact an administrator.`);
      }
      
      if (!member.roles.cache.has(contract.roleId)) {
        await member.roles.add(role);
        logger.info(`Assigned role for ${contract.name}`, { userId, contract: contract.name });
      }
      
      // Mark as verified for this contract
      database.markVerifiedForContract(
        walletAddress, 
        contract.id,
        verification.hash, 
        verification.blockNumber
      );
      
      // Success embed
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Verification Successful!')
        .setDescription(`Welcome ${interaction.user.username}! You've been verified for **${contract.name}**.`)
        .addFields(
          { name: 'Contract', value: contract.name, inline: true },
          { name: 'Network', value: config.blockchain.chainName, inline: true },
          { name: 'Confirmations', value: `${verification.confirmations}`, inline: true },
          { name: 'Wallet Address', value: `\`${walletAddress}\``, inline: false },
          { name: 'Contract Address', value: `\`${contract.address}\``, inline: false },
          { name: 'Transaction Hash', value: `\`${verification.hash}\``, inline: false },
          { name: 'Block Number', value: `${verification.blockNumber}`, inline: true }
        )
        .setFooter({ text: `Powered by ${config.blockchain.chainName}` })
        .setTimestamp();
      
      // Check if user can verify for other contracts
      const userVerifications = database.getVerifications(walletAddress);
      const unverifiedContracts = config.contracts.filter(c => !userVerifications[c.id]);
      
      if (unverifiedContracts.length > 0) {
        embed.addFields({
          name: '💡 Tip',
          value: `You can also verify for:\n${unverifiedContracts.map(c => `• ${c.name}`).join('\n')}\nUse \`/verify contract:${unverifiedContracts[0].name}\` or just \`/verify\``,
          inline: false
        });
      }
      
      // Log to verification channel
      if (contract.verificationChannelId) {
        const channel = interaction.guild.channels.cache.get(contract.verificationChannelId);
        if (channel) {
          const logEmbed = EmbedBuilder.from(embed)
            .setDescription(`User <@${userId}> verified for **${contract.name}**!`);
          await channel.send({ embeds: [logEmbed] });
        }
      }
      
      return interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      logger.error('Failed to assign role', { userId, contract: contract.name, error: error.message });
      return interaction.editReply('❌ Found valid transaction but couldn\'t assign role. Contact an administrator.');
    }
  },
};