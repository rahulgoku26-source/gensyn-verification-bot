const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAddress } = require('ethers');
const explorerApi = require('../services/explorerApi');
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
      : '🔍 Checking wallet transactions via Block Explorer API...';
    
    await interaction.editReply(checkingMessage);
    
    const minTxns = config.explorer.minTransactions;

    if (specificContract) {
      // Check specific contract
      const contract = config.getContractById(specificContract);
      const result = await explorerApi.verifySingleContract(address, contract);
      
      if (result.success) {
        const shortTxHash = result.hash ? `${result.hash.slice(0, 10)}...${result.hash.slice(-8)}` : 'N/A';
        const shortAddress = `${address.slice(0, 10)}...${address.slice(-8)}`;
        
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Valid Transactions Found')
          .setDescription(`This wallet has enough transactions to **${contract.name}**`)
          .addFields(
            { name: 'Contract', value: contract.name, inline: true },
            { name: 'Network', value: config.blockchain.chainName, inline: true },
            { name: 'Transactions', value: `${result.txnCount} (min: ${minTxns})`, inline: true },
            { name: 'Wallet Address', value: `\`${shortAddress}\``, inline: false },
            { name: 'Contract Address', value: `\`${contract.address}\``, inline: false },
            { name: 'Latest Tx Hash', value: `\`${shortTxHash}\``, inline: false },
            { name: 'Status', value: '✅ Eligible for verification', inline: true }
          )
          .setFooter({ text: 'This wallet can be verified for this contract' })
          .setTimestamp();
        
        return interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('❌ Not Enough Transactions')
          .setDescription(`This wallet doesn't have enough transactions to **${contract.name}**`)
          .addFields(
            { name: 'Wallet Address', value: `\`${address}\``, inline: false },
            { name: 'Transactions Found', value: `${result.txnCount}`, inline: true },
            { name: 'Minimum Required', value: `${minTxns}`, inline: true },
            { name: 'Error', value: result.error, inline: false },
            { name: 'Network', value: config.blockchain.chainName, inline: true }
          )
          .setFooter({ text: 'Send more transactions to this contract' });
        
        return interaction.editReply({ embeds: [embed] });
      }
    }
    
    // Check all contracts
    const result = await explorerApi.checkWallet(address);
    
    if (result.found) {
      const shortAddress = `${address.slice(0, 10)}...${address.slice(-8)}`;
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Wallet Analysis Complete')
        .setDescription(`Found **${result.verifiedCount}/${result.totalContracts}** contracts eligible for verification`)
        .addFields(
          { name: 'Wallet', value: `\`${shortAddress}\``, inline: false },
          { name: 'Network', value: config.blockchain.chainName, inline: true },
          { name: 'Min Txns Required', value: `${minTxns}`, inline: true }
        );
      
      // Add per-contract status
      let contractStatus = '';
      for (const r of result.results) {
        const status = r.verified ? '✅' : '❌';
        contractStatus += `${status} **${r.contract.name}**: ${r.txnCount} txns\n`;
      }
      
      embed.addFields({
        name: '📋 Contract Status',
        value: contractStatus,
        inline: false
      });
      
      embed.setFooter({ text: 'Use /verify to claim your roles' });
      embed.setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ No Valid Transactions Found')
        .setDescription(`This wallet doesn't have enough transactions to any configured contract`)
        .addFields(
          { name: 'Wallet Address', value: `\`${address}\``, inline: false },
          { name: 'Min Txns Required', value: `${minTxns}`, inline: true },
          { name: 'Error', value: result.error || 'No transactions meet minimum requirement', inline: false },
          { name: 'Network', value: config.blockchain.chainName, inline: true }
        );
      
      // Show contract status if available
      if (result.results) {
        let contractStatus = '';
        for (const r of result.results) {
          contractStatus += `❌ **${r.contract.name}**: ${r.txnCount} txns\n`;
        }
        
        embed.addFields({
          name: '📋 Contract Status',
          value: contractStatus,
          inline: false
        });
      }
      
      const contractList = config.contracts
        .map((c, i) => `${i + 1}. ${c.name}: \`${c.address}\``)
        .join('\n');
      
      embed.addFields({
        name: 'Available Contracts',
        value: contractList,
        inline: false
      });
      
      embed.setFooter({ text: `Send at least ${minTxns} transactions to any contract above` });
      
      return interaction.editReply({ embeds: [embed] });
    }
  },
};