const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAddress } = require('ethers');
const gensynApi = require('../services/gensynApi');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkwallet')
    .setDescription('Check if an address is eligible for Gensyn verification')
    .addStringOption(option =>
      option.setName('address')
        .setDescription('Gensyn Dashboard address to check')
        .setRequired(true)),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const address = interaction.options.getString('address');
    
    if (!isAddress(address)) {
      return interaction.editReply('❌ Invalid address format. Please provide a valid Ethereum address (0x...).');
    }
    
    await interaction.editReply('🔍 Checking Gensyn Dashboard eligibility...');
    
    try {
      const results = await gensynApi.verifyAll(address);
      
      const shortAddress = `${address.slice(0, 10)}...${address.slice(-8)}`;
      const eligibleCount = results.summary.totalEligible;
      const totalApps = 4;
      
      const embed = new EmbedBuilder()
        .setColor(eligibleCount > 0 ? 0x00ff00 : 0xff0000)
        .setTitle(eligibleCount > 0 ? '✅ Eligibility Check Complete' : '❌ Eligibility Check Complete')
        .setDescription(`**Address:** \`${shortAddress}\`\n**Eligible for:** ${eligibleCount}/${totalApps} applications`)
        .addFields(
          { name: 'Network', value: config.blockchain.chainName || 'Gensyn Testnet', inline: true },
          { name: 'Data Source', value: 'Gensyn Dashboard API', inline: true }
        );
      
      // Add per-application status
      let appStatus = '';
      
      // CodeAssist
      const ca = results.codeAssist;
      appStatus += ca.eligible 
        ? `✅ **CodeAssist**: Participation: ${ca.participation}\n`
        : `❌ **CodeAssist**: No participation\n`;
      
      // BlockAssist
      const ba = results.blockAssist;
      appStatus += ba.eligible 
        ? `✅ **BlockAssist**: Participation: ${ba.participation}\n`
        : `❌ **BlockAssist**: No participation\n`;
      
      // Judge
      const judge = results.judge;
      appStatus += judge.eligible 
        ? `✅ **Judge**: Bets: ${judge.betsPlaced}, Points: ${judge.totalPoints}\n`
        : `❌ **Judge**: No bets placed\n`;
      
      // RLSwarm
      const rl = results.rlSwarm;
      if (rl.eligible) {
        appStatus += `✅ **RLSwarm**: Peers: ${rl.peerCount}, Wins: ${rl.totalWins}\n`;
      } else {
        if (rl.peerCount === 0) {
          appStatus += `❌ **RLSwarm**: No peer IDs registered\n`;
        } else {
          appStatus += `❌ **RLSwarm**: Peers: ${rl.peerCount}, Wins: 0 (need wins)\n`;
        }
      }
      
      embed.addFields({
        name: '📋 Application Status',
        value: appStatus,
        inline: false
      });
      
      if (eligibleCount > 0) {
        embed.addFields({
          name: '💡 Next Steps',
          value: 'Link this address with `/link wallet:ADDRESS` and run `/verify` to get your roles!',
          inline: false
        });
      } else {
        embed.addFields({
          name: '💡 Tips',
          value: '• Participate in Gensyn applications to become eligible\n• Make sure you\'re using your **Gensyn Dashboard Address**\n• Visit dashboard.gensyn.ai to check your participation',
          inline: false
        });
      }
      
      embed.setFooter({ text: 'Data from Gensyn Dashboard API & Smart Contract' });
      embed.setTimestamp();
      
      return interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Checkwallet error:', error.message);
      return interaction.editReply(`❌ Failed to check address: ${error.message}`);
    }
  },
};