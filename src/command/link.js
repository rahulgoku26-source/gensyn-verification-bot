const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAddress } = require('ethers');
const database = require('../services/database');
const config = require('../config/config');
const logger = require('../utils/logger');

const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your wallet address to get verified')
    .addStringOption(option =>
      option.setName('wallet')
        .setDescription('Your wallet address (0x...)')
        .setRequired(true)),
  
  async execute(interaction) {
    const userId = interaction.user.id;
    const wallet = interaction.options.getString('wallet');
    
    // Rate limiting
    const now = Date.now();
    const cooldownAmount = config.rateLimit.linkCommandCooldown * 1000;
    
    if (cooldowns.has(userId)) {
      const expirationTime = cooldowns.get(userId) + cooldownAmount;
      if (now < expirationTime) {
        const timeLeft = Math.ceil((expirationTime - now) / 1000);
        return interaction.reply({
          content: `⏱️ Please wait ${timeLeft} more second(s) before linking again.`,
          ephemeral: true
        });
      }
    }
    
    // Validate wallet address
    if (!isAddress(wallet)) {
      return interaction.reply({ 
        content: '❌ Invalid wallet address format. Please provide a valid Ethereum address starting with 0x', 
        ephemeral: true 
      });
    }
    
    // Check if wallet already linked to another user
    const existingUser = database.getUserByWallet(wallet);
    if (existingUser && existingUser.discordId !== userId) {
      return interaction.reply({ 
        content: '❌ This wallet is already linked to another Discord account.', 
        ephemeral: true 
      });
    }
    
    // Set cooldown
    cooldowns.set(userId, now);
    setTimeout(() => cooldowns.delete(userId), cooldownAmount);
    
    // Link wallet
    database.linkWallet(userId, wallet);
    
    // Create success embed
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('🔗 Wallet Linked Successfully!')
      .setDescription('Your wallet has been linked to your Discord account.')
      .addFields(
        { name: 'Wallet Address', value: `\`${wallet}\``, inline: false },
        { name: 'Network', value: config.blockchain.chainName, inline: true },
        { name: 'Chain ID', value: config.blockchain.chainId, inline: true },
        { name: 'Available Contracts', value: `${config.contracts.length} contract(s)`, inline: true },
        { 
          name: '📋 Next Steps', 
          value: '1. Send a transaction to any contract below\n2. Wait for confirmation\n3. Use `/verify` to get your role(s)', 
          inline: false 
        }
      )
      .setFooter({ text: `Use /info to see all contracts • ${config.blockchain.chainName}` })
      .setTimestamp();
    
    // Add contract list
    const contractList = config.contracts.map((c, i) => 
      `${i + 1}. **${c.name}**: \`${c.address.slice(0, 10)}...${c.address.slice(-8)}\``
    ).join('\n');
    
    if (contractList) {
      embed.addFields({ 
        name: '📝 Available Contracts', 
        value: contractList, 
        inline: false 
      });
    }
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
