const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../services/database');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mystatus')
    .setDescription('Check your verification status for all contracts'),
  
  async execute(interaction) {
    const userEntry = database.getUserByDiscordId(interaction.user.id);
    
    if (!userEntry) {
      return interaction.reply({
        content: '❌ You haven\'t linked a wallet yet. Use `/link wallet:YOUR_ADDRESS` to get started.',
        ephemeral: true
      });
    }
    
    const [walletAddress, userData] = userEntry;
    const verifications = database.getVerifications(walletAddress) || {};
    const verifiedCount = Object.keys(verifications).length;
    const totalContracts = config.contracts.length;
    
    const percentComplete = totalContracts > 0 
      ? Math.round((verifiedCount / totalContracts) * 100) 
      : 0;
    
    const embed = new EmbedBuilder()
      .setColor(verifiedCount === totalContracts ? 0x00ff00 : 0xff9900)
      .setTitle('📊 Your Verification Status')
      .setDescription(`Verified for **${verifiedCount}/${totalContracts}** contract(s) (${percentComplete}% complete)`)
      .addFields(
        { name: 'Wallet Address', value: `\`${walletAddress}\``, inline: false },
        { name: 'Linked At', value: new Date(userData.linkedAt).toLocaleString(), inline: true },
        { name: 'Total Attempts', value: `${userData.attempts || 0}`, inline: true },
        { name: 'Network', value: config.blockchain.chainName, inline: true }
      );
    
    // Show status for each contract
    config.contracts.forEach(contract => {
      const verification = verifications[contract.id];
      
      if (verification) {
        const shortTxHash = `${verification.txHash.slice(0, 10)}...${verification.txHash.slice(-8)}`;
        embed.addFields({
          name: `✅ ${contract.name}`,
          value: `**Status:** Verified\n**Transaction:** \`${shortTxHash}\`\n**Block:** ${verification.blockNumber}\n**Verified:** ${new Date(verification.verifiedAt).toLocaleString()}`,
          inline: false
        });
      } else {
        const shortAddress = `${contract.address.slice(0, 10)}...${contract.address.slice(-8)}`;
        embed.addFields({
          name: `⏳ ${contract.name}`,
          value: `**Status:** Not Verified\n**Contract:** \`${shortAddress}\`\n**Action:** Send a transaction, then \`/verify contract:${contract.name}\``,
          inline: false
        });
      }
    });
    
    // Add progress bar
    const progressBar = this.createProgressBar(verifiedCount, totalContracts);
    embed.addFields({
      name: 'Progress',
      value: progressBar,
      inline: false
    });
    
    // Add next steps if not fully verified
    if (verifiedCount < totalContracts) {
      const unverifiedContracts = config.contracts
        .filter(c => !verifications[c.id])
        .map(c => c.name)
        .slice(0, 3);
      
      embed.addFields({
        name: '💡 Next Steps',
        value: `Verify for: ${unverifiedContracts.join(', ')}${unverifiedContracts.length < config.contracts.length - verifiedCount ? '...' : ''}\nUse \`/verify\` to check all contracts`,
        inline: false
      });
    } else {
      embed.addFields({
        name: '🎉 Complete!',
        value: 'You are verified for all contracts!',
        inline: false
      });
    }
    
    embed.setFooter({ text: 'Use /info to see all contracts' });
    embed.setTimestamp();
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
  
  // Helper function to create progress bar
  createProgressBar(current, total, length = 10) {
    const percentage = total > 0 ? current / total : 0;
    const filled = Math.round(length * percentage);
    const empty = length - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${bar} ${current}/${total}`;
  }
};