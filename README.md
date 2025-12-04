# 🤖 Gensyn Discord Verification Bot (Multi-Contract)

Professional Discord bot with **multi-contract support** - verify users who interact with up to 10+ smart contracts on Gensyn Testnet, assigning different roles for each.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

## ✨ Features

- 🔗 **Multi-Contract Support**: Verify against up to 10 contracts (easily extendable)
- 🎭 **Different Roles per Contract**: Each contract assigns its own unique Discord role
- ✅ **Flexible Verification**: Users can verify for all contracts or specific ones
- 🤖 **Auto-Verification**: Automatically checks and verifies users every minute
- ⚡ **High Performance**: 50-200 users/minute with Alchemy API key
- 📊 **Per-Contract Analytics**: Track verification stats for each contract
- 💾 **Automatic Backups**: Database backed up every 24 hours
- 📝 **Comprehensive Logging**: Color-coded console + file logging
- 🔐 **Production Ready**: PM2 support, error handling, graceful shutdown

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/gensyn-discord-bot.git
cd gensyn-discord-bot
npm install
```

### 2. Configure
```bash
cp .env.example .env
nano .env
```

**Required settings:**
```env
# Discord
DISCORD_TOKEN=your_bot_token_here

# Blockchain (with Alchemy API key for best performance)
RPC_URL=https://gensyn-testnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Contract 1 (at least one required)
CONTRACT_1_ADDRESS=0x7745a8FE4b8D2D2c3BB103F8dCae822746F35Da0
CONTRACT_1_ROLE_ID=your_role_id_here
CONTRACT_1_CHANNEL_ID=your_channel_id_here
CONTRACT_1_ENABLED=true
```

### 3. Run
```bash
npm start
```

## 📋 Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/link` | Link your wallet address | `/link wallet:0xYourAddress` |
| `/verify` | Verify for all contracts | `/verify` |
| `/verify contract:Name` | Verify for specific contract | `/verify contract:Main Contract` |
| `/mystatus` | Check verification status | `/mystatus` |
| `/info` | Show all contracts | `/info` |
| `/info contract:Name` | Show specific contract | `/info contract:Main Contract` |
| `/checkwallet` | Check any wallet | `/checkwallet address:0xAddress` |
| `/stats` | View statistics (admin) | `/stats` |

## 🎯 How It Works

### For Users:

1. **Link wallet once**: `/link wallet:0xYourAddress`
2. **Interact with contracts**: Send transactions to any configured contract
3. **Get verified**: `/verify` (checks all) or `/verify contract:Name` (specific)
4. **Receive roles**: Automatically assigned based on contracts verified

### Example Flow:
```
User: /link wallet:0xABC123...
Bot: ✅ Wallet linked!

User: [Sends transaction to Contract 1]
User: /verify
Bot: ✅ Verified for Main Contract! Role assigned.

User: [Sends transaction to Contract 2]
User: /verify
Bot: ✅ Verified for Secondary Contract! Role assigned.

User: /mystatus
Bot: Verified for 2/3 contracts (66% complete)
```

## ⚙️ Configuration

### Adding Contracts

Edit `.env` and uncomment/configure contracts:
```env
# Contract 2
CONTRACT_2_ADDRESS=0xYourContract
CONTRACT_2_ROLE_ID=role_id_here
CONTRACT_2_CHANNEL_ID=channel_id_here
CONTRACT_2_ENABLED=true

# Contract 3
CONTRACT_3_ADDRESS=0xAnotherContract
CONTRACT_3_ROLE_ID=another_role_id
CONTRACT_3_CHANNEL_ID=another_channel_id
CONTRACT_3_ENABLED=true

# ... up to CONTRACT_10
```

### Performance Settings

**For 50 users/minute:**
```env
RPC_URL=https://gensyn-testnet.g.alchemy.com/v2/YOUR_KEY
AUTO_VERIFY_BATCH_SIZE=50
AUTO_VERIFY_INTERVAL=1
MAX_CONCURRENT_VERIFICATIONS=10
```

**For 200 users/minute:**
```env
RPC_URL=https://gensyn-testnet.g.alchemy.com/v2/YOUR_KEY
AUTO_VERIFY_BATCH_SIZE=200
AUTO_VERIFY_INTERVAL=1
MAX_CONCURRENT_VERIFICATIONS=20
```

## 🚀 Deployment

### Local Testing
```bash
npm start
```

### Production with PM2
```bash
npm install -g pm2
npm run pm2:start
pm2 save
pm2 startup
```

### VPS Setup
```bash
# SSH into VPS
ssh user@your-server

# Clone and setup
git clone your-repo
cd gensyn-discord-bot
npm install

# Configure
nano .env
# Add your tokens and IDs

# Run with PM2
npm run pm2:start
```

## 📊 Performance

| Setup | Users/Min | Users/Hour | Best For |
|-------|-----------|------------|----------|
| Public RPC | 6-10 | 360-600 | Small communities |
| Alchemy Key | 50-200 | 3,000-12,000 | Medium-large projects |

## 🎨 Use Cases 
## Still on developement period

## 📝 Database Structure
```json
{
  "0xwalletaddress": {
    "discordId": "123456789",
    "linkedAt": "2024-12-04T10:00:00Z",
    "attempts": 3,
    "verifications": {
      "contract1": {
        "verified": true,
        "txHash": "0xabc123...",
        "blockNumber": "12345",
        "verifiedAt": "2024-12-04T10:05:00Z"
      },
      "contract2": {
        "verified": true,
        "txHash": "0xdef456...",
        "blockNumber": "12350",
        "verifiedAt": "2024-12-04T10:10:00Z"
      }
    }
  }
}
```

## 🔧 Troubleshooting

### Bot doesn't start
- Check `DISCORD_TOKEN` in `.env`
- Run `npm install` again
- Check logs in `logs/error.log`

### Commands don't appear
- Wait 5 minutes after bot starts
- Check bot has `applications.commands` scope
- Try restarting bot

### Verification fails
- Check wallet sent transaction to correct contract
- Verify transaction is confirmed
- Use `/checkwallet` to debug

### Role not assigned
- Bot's role must be ABOVE the verified role
- Bot needs "Manage Roles" permission
- Check role ID is correct in `.env`

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 🙏 Credits

Built for the Gensyn community with ❤️

## 📞 Support

- Open an issue on GitHub
- Check logs in `logs/` directory
- Use `/stats` command for bot health

---

**Ready to deploy? Follow the Quick Start guide above!** 🚀
