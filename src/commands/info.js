const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show Gensyn verification information'),
  
  async execute(interaction) {
    // Define applications
    const applications = [
      { 
        name: 'CodeAssist', 
        key: 'codeAssist', 
        roleId: config.roles.codeAssist,
        description: 'Participate in CodeAssist to earn this role',
        eligibility: 'Participation > 0'
      },
      { 
        name: 'BlockAssist', 
        key: 'blockAssist', 
        roleId: config.roles.blockAssist,
        description: 'Participate in BlockAssist to earn this role',
        eligibility: 'Participation > 0'
      },
      { 
        name: 'Judge (Verdict)', 
        key: 'judge', 
        roleId: config.roles.judge,
        description: 'Place bets in the Judge/Verdict application',
        eligibility: 'Bets placed > 0'
      },
      { 
        name: 'RLSwarm (The Swarm)', 
        key: 'rlSwarm', 
        roleId: config.roles.rlSwarm,
        description: 'Run a node and win in RLSwarm',
        eligibility: 'Peer ID registered + Wins > 0'
      }
    ];

    const configuredApps = applications.filter(a => a.roleId);
    
    // Show info for all applications
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('🌐 Gensyn Verification System')
      .setDescription(`We support **${configuredApps.length} application(s)** for verification\n\nVerification uses the **Gensyn Dashboard API** and **Smart Contract calls**.`)
      .addFields(
        { name: 'Network', value: config.blockchain.chainName || 'Gensyn Testnet', inline: true },
        { name: 'Dashboard', value: 'dashboard.gensyn.ai', inline: true },
        { name: 'API', value: 'Gensyn Dashboard', inline: true }
      );
    
    // Add each application as a field
    applications.forEach((app, index) => {
      if (!app.roleId) return;
      
      embed.addFields({
        name: `${index + 1}. ${app.name}`,
        value: `**Description:** ${app.description}\n**Eligibility:** ${app.eligibility}\n**Role:** <@&${app.roleId}>`,
        inline: false
      });
    });
    
    embed.addFields({
      name: '📋 How to Get Verified',
      value: `1. \`/link wallet:YOUR_ADDRESS\` - Link your **Gensyn Dashboard Address**\n2. Participate in any of the applications above\n3. \`/verify\` - Check your eligibility and get roles`,
      inline: false
    });

    embed.addFields({
      name: '⚠️ Important',
      value: 'Use your **Gensyn Dashboard Address** (found on dashboard.gensyn.ai), NOT your external wallet address.',
      inline: false
    });
    
    embed.setFooter({ text: 'Data from Gensyn Dashboard API | Run /verify to check eligibility' });
    embed.setTimestamp();
    
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};