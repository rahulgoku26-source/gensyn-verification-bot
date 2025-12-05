# 🤖 Gensyn Discord Verification Bot

A high-performance Discord bot for verifying smart contract interactions on Gensyn Testnet using the **Block Explorer API**. Supports multi-contract verification, password protection, and optimized for **500-600 users/minute**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

## ✨ Features

### Core Features
- 🔗 **Block Explorer API Integration**: Uses `txlistinternal` endpoint for accurate transaction tracking
- 🎭 **Multi-Contract Support**: Verify against up to 20 contracts with different Discord roles
- 📊 **Transaction Count Verification**: Minimum 3 transactions required per contract
- ⚡ **High Performance**: 500-600 users/minute with parallel processing
- 🤖 **Auto-Verification**: Automatically checks and verifies users

### Security Features
- 🔐 **Password Protection**: AES-256 encryption for sensitive files
- 🔒 **Auto-Lock**: 5-minute inactivity timeout
- 🛡️ **Token Masking**: Sensitive data hidden in logs

### Performance Features
- 🚀 **Parallel Processing**: All 4 contracts checked simultaneously
- 📦 **Batch Processing**: 50 users per batch
- 💾 **API Caching**: 5-minute TTL for faster repeated checks
- ⏱️ **Rate Limiting**: 100 requests/minute to Explorer API

### Logging Features
- 📝 **Simple Log Format**: Easy-to-read one-line entries
- 📊 **Flat Data Export**: TXT format for easy analysis
- 💿 **Hourly Backups**: Automatic database backups

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/gensyn-verification-bot.git
cd gensyn-verification-bot
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
GUILD_ID=your_server_id_here

# Security (optional but recommended)
MASTER_PASSWORD=your_secure_password_here

# At least one contract
CONTRACT_1_NAME=The Swarm
CONTRACT_1_ADDRESS=0x7745a8FE4b8D2D2c3BB103F8dCae822746F35Da0
CONTRACT_1_ROLE_ID=your_role_id_here
```

### 3. Run

```bash
npm start
```

If you set a master password, you'll be prompted to enter it on startup.

## 📋 Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/link` | Link your wallet address | `/link wallet:0xYourAddress` |
| `/verify` | Verify for all contracts | `/verify` |
| `/verify contract:Name` | Verify for specific contract | `/verify contract:The Swarm` |
| `/mystatus` | Check your verification status with transaction counts | `/mystatus` |
| `/info` | Show all contracts and requirements | `/info` |
| `/info contract:Name` | Show specific contract details | `/info contract:The Swarm` |
| `/checkwallet` | Check any wallet's transactions | `/checkwallet address:0xAddress` |
| `/stats` | View bot statistics (Admin) | `/stats` |
| `/admin failures` | View failed verifications (Admin) | `/admin failures limit:20` |
| `/admin successes` | View successful verifications (Admin) | `/admin successes limit:20` |
| `/admin user` | Look up a user's details (Admin) | `/admin user target:@User` |
| `/admin export` | Export data as JSON or TXT (Admin) | `/admin export format:txt` |

## ⚙️ Configuration

### Contract Configuration

Each contract needs:
- `CONTRACT_N_NAME`: Display name
- `CONTRACT_N_ADDRESS`: Smart contract address
- `CONTRACT_N_ROLE_ID`: Discord role ID to assign

**Default Contracts:**

| # | Name | Address | Purpose |
|---|------|---------|---------|
| 1 | The Swarm | 0x7745a8FE4b8D2D2c3BB103F8dCae822746F35Da0 | Main verification |
| 2 | Codeassist | 0x0d3A2561883203a48E4227D41D37E9ffF81CAb85 | Code assistance |
| 3 | Block | 0xE2070109A0C1e8561274E59F024301a19581d45c | Block operations |
| 4 | Judge | 0x51D4db531ae706a6eC732458825465058fA23a35 | Judging system |

### Adding New Contracts

Edit `.env` and add:

```env
CONTRACT_5_NAME=New Contract
CONTRACT_5_ADDRESS=0xYourContractAddress
CONTRACT_5_ROLE_ID=your_discord_role_id
```

### Performance Tuning

```env
# For 500-600 users/min:
BATCH_SIZE=50
CACHE_TTL=300
AUTO_VERIFY_BATCH_SIZE=50
MAX_CONCURRENT_VERIFICATIONS=10

# Explorer API rate limit
EXPLORER_API_RATE=100
```

### Security Configuration

```env
# Enable password protection
MASTER_PASSWORD=your_secure_password

# Files protected:
# - .env (configuration)
# - data/users.json (user database)
# - logs/failed.txt (failed verifications)
# - logs/success.txt (successful verifications)
# - data/backups/* (all backups)
```

## 🎯 How It Works

### Verification Flow

1. **User links wallet**: `/link wallet:0xYourAddress`
2. **User interacts with contracts**: Send at least 3 transactions
3. **User verifies**: `/verify`
4. **Bot checks**: Uses Block Explorer API (`txlistinternal`)
5. **Role assigned**: If ≥3 transactions found per contract

### API Details

**Endpoint Used:**
```
https://gensyn-testnet.explorer.alchemy.com/api?module=account&action=txlistinternal&address=WALLET_ADDRESS
```

**Logic:**
- Fetches internal transactions for the wallet
- Filters by contract address (checks both `to` and `from` fields)
- Counts transactions per contract
- Requires minimum 3 transactions to pass verification

### Log Format

**Success Log (`logs/success.txt`):**
```
[2024-12-05 10:30:00] SUCCESS | Discord: username (123456789) | Wallet: 0xD77...A70 | Contract: The Swarm | Txns: 5 | Role Assigned: ✅
```

**Failed Log (`logs/failed.txt`):**
```
[2024-12-05 10:30:00] FAILED | Discord: username (123456789) | Wallet: 0xD77...A70 | Contract: Block | Reason: Only 2 txns found (min 3 required)
```

### User Data Format (Flat Export)

```
WALLET | DISCORD_ID | DISCORD_NAME | THE_SWARM | CODEASSIST | BLOCK | JUDGE | LINKED_AT
0xD77...A70 | 876804295658545120 | username | ✅ (5 txns) | ✅ (3 txns) | ❌ (2 txns) | ✅ (4 txns) | 2024-12-04
```

## 🚀 Deployment

### Local Development

```bash
npm run dev
```

### Production with PM2

```bash
npm install -g pm2
npm run pm2:start
pm2 save
pm2 startup
```

### Docker (Coming Soon)

```bash
docker build -t gensyn-bot .
docker run -d --env-file .env gensyn-bot
```

## 📊 Performance

| Metric | Value |
|--------|-------|
| Users per minute | 500-600 |
| API calls (cached) | ~100/min |
| Memory usage | ~50-100 MB |
| Batch size | 50 users |
| Cache TTL | 5 minutes |

## 🔧 Troubleshooting

### Bot doesn't start

1. Check `DISCORD_TOKEN` in `.env`
2. Verify Node.js version ≥16
3. Run `npm install` again
4. Check logs for errors

### Commands don't appear

1. Wait 5 minutes after bot starts
2. Check bot has `applications.commands` scope
3. Ensure bot is in the correct server
4. Try restarting the bot

### Verification fails

1. Check wallet has ≥3 transactions to the contract
2. Verify transactions are internal transactions
3. Use `/checkwallet` to debug
4. Check Explorer API is accessible

### Role not assigned

1. Bot's role must be ABOVE the verified role
2. Bot needs "Manage Roles" permission
3. Check role ID is correct in `.env`

### Password issues

1. Ensure `MASTER_PASSWORD` is set correctly
2. Password is case-sensitive
3. After 3 failed attempts, restart the bot

## 📄 API Reference

### Explorer API

```javascript
// Fetch internal transactions
const url = `https://gensyn-testnet.explorer.alchemy.com/api?module=account&action=txlistinternal&address=${walletAddress}`;

// Response format
{
  "status": "1",
  "message": "OK",
  "result": [
    {
      "hash": "0x...",
      "from": "0x...",
      "to": "0x...",
      "blockNumber": "123456",
      ...
    }
  ]
}
```

### Verification Logic

```javascript
// Check if wallet qualifies
const transactions = await getInternalTransactions(walletAddress);
const contractTxns = transactions.filter(tx => 
  tx.to === contractAddress || tx.from === contractAddress
);
const qualifies = contractTxns.length >= MIN_TRANSACTIONS; // Default: 3
```

## 📁 File Structure

```
src/
├── index.js                 # Main entry point with security
├── config/
│   └── config.js            # Configuration loader
├── commands/
│   ├── admin.js             # Admin commands
│   ├── checkwallet.js       # Wallet checker
│   ├── info.js              # Contract info
│   ├── link.js              # Wallet linking
│   ├── mystatus.js          # User status with txn counts
│   ├── stats.js             # Statistics
│   └── verify.js            # Verification command
├── services/
│   ├── explorerApi.js       # Block Explorer API service
│   ├── database.js          # Database with flat format
│   └── blockchain.js        # Legacy (deprecated)
├── utils/
│   ├── security.js          # AES-256 encryption
│   ├── logger.js            # Logging utility
│   └── performance.js       # Batch processing
└── workers/
    └── autoVerify.js        # Auto-verification worker
```

## 🙏 Credits

Built for the Gensyn community with ❤️

## 📞 Support

- Open an issue on GitHub
- Check logs in `logs/` directory
- Use `/stats` command for bot health
- Join the Gensyn Discord

---

**Ready to deploy? Follow the Quick Start guide above!** 🚀
