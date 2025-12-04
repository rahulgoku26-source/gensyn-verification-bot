const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const blockchain = require('../services/blockchain');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show contract information')
    .addStringOption(option =>
      option.setName('contract')
        .setDescription('Show specific contract info (optional)')
        .setRequired(false)
        .addChoices(...config.contracts.map(c => ({ name: c.name, value: c.id })))),
  
  async execute(interaction) {
    const specificContract = interaction.options.getString('contract');
    const currentBlock = await blockchain.getCurrentBlock() || 'Unknown';
    
    if (specificContract) {
      // Show info for specific contract
      const contract = config.getContractById(specificContract);
      
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`🔷 ${contract.name}`)
        .setDescription(contract.description || 'Smart contract verification details')
        .addFields(
          { name: 'Network', value: config.blockchain.chainName, inline: true },
          { name: 'Chain ID', value: config.blockchain.chainId, inline: true },
          { name: 'Current Block', value: currentBlock.toString(), inline: true },
          { name: 'Contract Address', value: `\`${contract.address}\``, inline: false },
          { name: 'Role Assigned', value: `<@&${contract.roleId}>`, inline: true },
          { name: 'Required Confirmations', value: `${config.blockchain.minConfirmations}`, inline: true },
          { 
            name: '📋 How to Verify', 
            value: `1. \`/link wallet:YOUR_ADDRESS\`\n2. Send a transaction to this contract\n3. \`/verify contract:${contract.name}\` or just \`/verify\``,
            inline: false
          }
        )
        .setFooter({ text: 'Gensyn Testnet Verification Bot' })
        .setTimestamp();
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Show info for all contracts
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('🌐 All Available Contracts')
      .setDescription(`We support **${config.contracts.length} contract(s)** for verification on ${config.blockchain.chainName}`)
      .addFields(
        { name: 'Network', value: config.blockchain.chainName, inline: true },
        { name: 'Chain ID', value: config.blockchain.chainId, inline: true },
        { name: 'Current Block', value: currentBlock.toString(), inline: true }
      );
    
    // Add each contract as a field
    config.contracts.forEach((contract, index) => {
      const shortAddress = `${contract.address.slice(0, 10)}...${contract.address.slice(-8)}`;
      embed.addFields({
        name: `${index + 1}. ${contract.name}`,
        value: `**Address:** \`${shortAddress}\`\n**Role:** <@&${contract.roleId}>`,
        inline: false
      });
    });
    
    embed.addFields({
      name: '📋 How to Get Verified',
      value: '1. `/link wallet:YOUR_ADDRESS` - Link your wallet\n2. Send a transaction to any contract above\n3. `/verify` - Check all contracts OR `/verify contract:Name` - Check specific contract',
      inline: false
    });
    
    embed.setFooter({ text: 'Use /info contract:Name for detailed contract info' });
    embed.setTimestamp();
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};