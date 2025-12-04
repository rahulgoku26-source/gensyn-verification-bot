const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAddress } = require('ethers');
const blockchain = require('../services/blockchain');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkwallet')
    .setDescription('Check if a wallet has valid transactions')
    .addStringOption(option =>
      option.setName('address')
        .setDescription('Wallet address to check')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('contract')
        .setDescription('Specific contract to check (optional)')
        .setRequired(false)
        .addChoices(...config.contracts.map(c => ({ name: c.name, value: c.id })))),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const address = interaction.options.getString('address');
    const specificContract = interaction.options.getString('contract');
    
    if (!isAddress(address)) {
      return interaction.editReply('❌ Invalid wallet address format.');
    }
    
    const checkingMessage = specificContract
      ? `🔍 Checking ${config.getContractById(specificContract).name}...`
      : '🔍 Scanning blockchain for transactions...';
    
    await interaction.editReply(checkingMessage);
    
    const result = await blockchain.verifyTransaction(address, specificContract);
    
    if (result.success) {
      const contract = result.contract;
      const shortTxHash = `${result.hash.slice(0, 10)}...${result.hash.slice(-8)}`;
      const shortAddress = `${address.slice(0, 10)}...${address.slice(-8)}`;
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Valid Transaction Found')
        .setDescription(`This wallet has interacted with **${contract.name}**`)
        .addFields(
          { name: 'Contract', value: contract.name, inline: true },
          { name: 'Network', value: config.blockchain.chainName, inline: true },
          { name: 'Confirmations', value: `${result.confirmations}`, inline: true },
          { name: 'Wallet Address', value: `\`${shortAddress}\``, inline: false },
          { name: 'Contract Address', value: `\`${contract.address}\``, inline: false },
          { name: 'Transaction Hash', value: `\`${shortTxHash}\``, inline: false },
          { name: 'Block Number', value: `${result.blockNumber}`, inline: true },
          { name: 'Status', value: '✅ Eligible for verification', inline: true }
        )
        .setFooter({ text: 'This wallet can be verified for this contract' })
        .setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    } else {
      const contractInfo = specificContract
        ? `**${config.getContractById(specificContract).name}**`
        : 'any configured contract';
      
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ No Valid Transactions Found')
        .setDescription(`This wallet has no valid transactions to ${contractInfo}`)
        .addFields(
          { name: 'Wallet Address', value: `\`${address}\``, inline: false },
          { name: 'Error', value: result.error, inline: false },
          { name: 'Blocks Searched', value: `${config.blockchain.searchBlocks}`, inline: true },
          { name: 'Network', value: config.blockchain.chainName, inline: true }
        );
      
      if (!specificContract) {
        const contractList = config.contracts
          .map((c, i) => `${i + 1}. ${c.name}: \`${c.address}\``)
          .join('\n');
        
        embed.addFields({
          name: 'Available Contracts',
          value: contractList,
          inline: false
        });
      }
      
      embed.setFooter({ text: 'Send a transaction to one of the contracts above' });
      
      return interaction.editReply({ embeds: [embed] });
    }
  },
};