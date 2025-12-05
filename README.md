# 🤖 Gensyn Discord Verification Bot

A Discord bot for verifying Gensyn Dashboard participation using the **Gensyn Dashboard API** and **Smart Contract calls**. Supports CodeAssist, BlockAssist, Judge (Verdict), and RLSwarm verification with automatic role assignment.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

## ✨ Features

### Core Features
- 🔗 **Gensyn Dashboard API Integration**: Verify CodeAssist, BlockAssist, and Judge participation
- ⛓️ **Smart Contract Verification**: RLSwarm verification via smart contract calls
- 🎭 **Multi-Application Support**: Four applications with individual Discord roles
- ⚡ **High Performance**: Parallel verification of all applications
- 🔄 **Re-verification**: Users can run `/verify` anytime to check for new eligibility

### Supported Applications
| Application | Verification Method | Eligibility Criteria |
|-------------|--------------------|--------------------|
| **CodeAssist** | Dashboard API | Participation > 0 |
| **BlockAssist** | Dashboard API | Participation > 0 |
| **Judge (Verdict)** | Dashboard API | Has bets placed or entries |
| **RLSwarm (The Swarm)** | Smart Contract | Peer ID registered + Wins > 0 |

### Security Features
- 🔐 **Password Protection**: AES-256 encryption for sensitive files
- 🔒 **Auto-Lock**: 5-minute inactivity timeout
- 🛡️ **Token Masking**: Sensitive data hidden in logs

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/rahulgoku26-source/gensyn-verification-bot.git
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

# Gensyn Application Role IDs
CODEASSIST_ROLE_ID=your_codeassist_role_id
BLOCKASSIST_ROLE_ID=your_blockassist_role_id
JUDGE_ROLE_ID=your_judge_role_id
RLSWARM_ROLE_ID=your_rlswarm_role_id

# Security (optional but recommended)
MASTER_PASSWORD=your_secure_password_here
```

### 3. Run

```bash
npm start
```

If you set a master password, you'll be prompted to enter it on startup.

## 📋 Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/link` | Link your Gensyn Dashboard address | `/link wallet:0xYourAddress` |
| `/verify` | Verify for all applications | `/verify` |
| `/mystatus` | Check your verification status with transaction counts | `/mystatus` |
| `/info` | Show all contracts and requirements | `/info` |
| `/info contract:Name` | Show specific contract details | `/info contract:The Swarm` |
| `/mystatus` | Check your verification status | `/mystatus` |
| `/info` | Show verification info | `/info` |
| `/checkwallet` | Check any address's eligibility | `/checkwallet address:0xAddress` |
| `/stats` | View bot statistics (Admin) | `/stats` |
| `/admin failures` | View failed verifications (Admin) | `/admin failures limit:20` |
| `/admin successes` | View successful verifications (Admin) | `/admin successes limit:20` |
| `/admin user` | Look up a user's details (Admin) | `/admin user target:@User` |
| `/admin export` | Export data as JSON or TXT (Admin) | `/admin export format:txt` |

## ⚙️ Configuration

### Gensyn Application Roles

Each application needs a Discord role ID configured:

| Application | Environment Variable | Verification API |
|-------------|---------------------|------------------|
| CodeAssist | `CODEASSIST_ROLE_ID` | Dashboard API |
| BlockAssist | `BLOCKASSIST_ROLE_ID` | Dashboard API |
| Judge | `JUDGE_ROLE_ID` | Dashboard API |
| RLSwarm | `RLSWARM_ROLE_ID` | Smart Contract |

### API Endpoints

| Application | API Endpoint |
|-------------|-------------|
| CodeAssist | `https://dashboard.gensyn.ai/api/v1/applications/codeassist/userinfo/{address}` |
| BlockAssist | `https://dashboard.gensyn.ai/api/v1/users/{address}/blockassist/stats` |
| Judge | `https://dashboard.gensyn.ai/api/v1/applications/verdict/userinfo/{address}` |
| RLSwarm | Smart Contract at `0x7745a8FE4b8D2D2c3BB103F8dCae822746F35Da0` |

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
2. **User participates**: Use Gensyn applications (CodeAssist, BlockAssist, Judge, RLSwarm)
3. **User verifies**: `/verify`
4. **Bot checks**: Uses Gensyn Dashboard API and Smart Contract calls
5. **Role assigned**: If eligibility criteria met for each application

### API Details

**Dashboard API Endpoints:**
```
Base URL: https://dashboard.gensyn.ai/api/v1

# CodeAssist
GET /applications/codeassist/userinfo/{address}
Response: {"id": "0x...", "participation": 23.5}

# BlockAssist  
GET /users/{address}/blockassist/stats
Response: {"id": "0x...", "participation": 0}

# Judge (Verdict)
GET /applications/verdict/userinfo/{address}
Response: {"totalPoints": 0, "entries": [...], "betsPlaced": 4}
```

**Smart Contract (RLSwarm):**
```
Contract: 0x7745a8FE4b8D2D2c3BB103F8dCae822746F35Da0
RPC: https://gensyn-testnet.g.alchemy.com/public

Functions:
- getPeerId(address[]) → string[][]
- getTotalWins(string peerId) → uint256
```

### Log Format

**Success Log (`logs/success.txt`):**
```
[2024-12-05 10:30:00] SUCCESS | Discord: username (123456789) | Address: 0xD77...A70 | App: CodeAssist | Role Assigned: ✅
```

**Failed Log (`logs/failed.txt`):**
```
[2024-12-05 10:30:00] FAILED | Discord: username (123456789) | Address: 0xD77...A70 | App: RLSwarm | Reason: No wins found
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
| Time per user | 1-3 seconds |
| Users per minute | 200-400 |
| Parallel users | 50 at a time |
| Cache TTL | 1 hour |
| Backup interval | 1 hour |
| API retries | 3 with exponential backoff |
| API rate limit | 10 requests/second |
| Memory usage | ~50-100 MB |

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
// Step 1: Fetch wallet's internal transactions (get parent tx hashes)
const walletUrl = `https://gensyn-testnet.explorer.alchemy.com/api?module=account&action=txlistinternal&address=${walletAddress}`;

// Step 2: Fetch transaction trace for each parent tx hash
const traceUrl = `https://gensyn-testnet.explorer.alchemy.com/api?module=account&action=txlistinternal&txhash=${txHash}`;

// Response format
{
  "status": "1",
  "message": "OK",
  "result": [
    {
      "hash": "0x...",
      "transactionHash": "0x...",
      "from": "0x...",
      "to": "0x...",
      "contractAddress": "0x...",
      "blockNumber": "123456",
      ...
    }
  ]
}
```

### Verification Logic

```javascript
// Check if wallet qualifies using the correct two-step approach
const allInternalTxns = await getAllInternalTransactions(walletAddress);

// Find matching transactions for contract
const matchingTxns = allInternalTxns.filter(tx =>
  tx.to?.toLowerCase() === contractAddress.toLowerCase() ||
  tx.from?.toLowerCase() === contractAddress.toLowerCase() ||
  tx.contractAddress?.toLowerCase() === contractAddress.toLowerCase()
);

// Count UNIQUE transaction hashes (not individual internal calls)
const uniqueTxHashes = [...new Set(matchingTxns.map(tx => tx.transactionHash))];
const qualifies = uniqueTxHashes.length >= MIN_TRANSACTIONS; // Default: 3
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
│   ├── explorerApi.js       # Block Explorer API service with caching
│   ├── database.js          # Database with flat format
│   └── blockchain.js        # Legacy (deprecated)
├── utils/
│   ├── security.js          # AES-256 encryption
│   ├── logger.js            # Logging utility
│   └── performance.js       # Batch processing, rate limiting
└── workers/
    └── autoVerify.js        # Auto-verification worker

data/
├── users.json               # User database (encrypted if password set)
└── backups/                 # Hourly backups (encrypted)

logs/
├── failed.txt               # Failed verifications log
├── success.txt              # Successful verifications log
└── audit.log                # Audit log (encrypted)
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
