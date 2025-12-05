const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config/config');
const logger = require('./utils/logger');
const explorerApi = require('./services/explorerApi');
const security = require('./utils/security');
const AutoVerifyWorker = require('./workers/autoVerify');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    logger.debug(`Loaded command: ${command.data.name}`);
  } else {
    logger.warn(`Command at ${filePath} is missing required "data" or "execute" property`);
  }
}

// Bot ready event
client.once('ready', async () => {
  logger.info('═══════════════════════════════════════════════════════');
  logger.info('      Discord Verification Bot - ONLINE ✅');
  logger.info('═══════════════════════════════════════════════════════');
  logger.discord('Bot started', { 
    tag: client.user.tag, 
    guilds: client.guilds.cache.size 
  });
  
  logger.info(`🌐 Network: ${config.blockchain.chainName}`);
  logger.info(`⛓️  Chain ID: ${config.blockchain.chainId}`);
  logger.info(`📝 Contracts: ${config.contracts.length} configured`);
  logger.info(`📊 Min Transactions: ${config.explorer.minTransactions}`);
  
  config.contracts.forEach((contract, index) => {
    logger.info(`   ${index + 1}. ${contract.name}: ${contract.address}`);
  });

  // Test Explorer API connection
  const connectionTest = await explorerApi.testConnection();
  if (connectionTest.success) {
    logger.info(`📡 Explorer API: Connected`);
  } else {
    logger.error('❌ Explorer API connection failed!', { 
      error: connectionTest.error 
    });
  }

  // Register slash commands
  try {
    const commands = [];
    client.commands.forEach(command => {
      commands.push(command.data.toJSON());
    });
    
    await client.application.commands.set(commands);
    logger.info(`✅ Registered ${commands.length} slash commands`);
  } catch (error) {
    logger.error('Failed to register commands', { error: error.message });
  }

  logger.info('═══════════════════════════════════════════════════════');

  // Start auto-verification worker
  if (config.autoVerify.enabled) {
    const autoVerifyWorker = new AutoVerifyWorker(client);
    autoVerifyWorker.start();
  }
});

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    logger.warn(`No command matching ${interaction.commandName} was found`);
    return;
  }

  try {
    await command.execute(interaction);
    logger.debug('Command executed', { 
      command: interaction.commandName, 
      user: interaction.user.tag 
    });
  } catch (error) {
    logger.error('Command execution error', { 
      command: interaction.commandName, 
      error: error.message,
      stack: error.stack
    });
    
    const errorMessage = { 
      content: '❌ There was an error executing this command!', 
      ephemeral: true 
    };
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Error handling
client.on('error', error => {
  logger.error('Discord client error', { error: error.message });
});

process.on('unhandledRejection', error => {
  logger.error('Unhandled promise rejection', { 
    error: error.message,
    stack: error.stack 
  });
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

// Login with security check
async function startBot() {
  // Security verification
  if (config.security.masterPassword) {
    const securityOk = await security.initialize();
    if (!securityOk) {
      process.exit(1);
    }
  } else {
    logger.warn('⚠️  Running without password protection. Set MASTER_PASSWORD in .env for security.');
  }

  logger.info('🚀 Starting Discord bot...');
  client.login(config.discord.token).catch(error => {
    logger.error('Failed to login', { error: error.message });
    process.exit(1);
  });
}

startBot();