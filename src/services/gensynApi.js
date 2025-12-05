const axios = require('axios');
const { ethers } = require('ethers');

class GensynApiService {
  constructor() {
    this.dashboardBaseUrl = 'https://dashboard.gensyn.ai/api/v1';
    this.rpcUrl = 'https://gensyn-testnet.g.alchemy.com/public';
    this.swarmContractAddress = '0x7745a8FE4b8D2D2c3BB103F8dCae822746F35Da0';
    
    this.swarmAbi = [
      'function getPeerId(address[] calldata eoas) external view returns (string[][] memory)',
      'function getTotalWins(string calldata peerId) external view returns (uint256)'
    ];
    
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.swarmContract = new ethers.Contract(
      this.swarmContractAddress,
      this.swarmAbi,
      this.provider
    );
  }

  async verifyCodeAssist(address) {
    try {
      const url = `${this.dashboardBaseUrl}/applications/codeassist/userinfo/${address}`;
      const response = await axios.get(url, { timeout: 10000 });
      const participation = response.data?.participation || 0;
      return {
        eligible: participation > 0,
        participation: participation,
        message: participation > 0 
          ? `CodeAssist: ✅ Verified (Participation: ${participation})`
          : `CodeAssist: ❌ No participation found`
      };
    } catch (error) {
      console.error('CodeAssist verification error:', error.message);
      return { eligible: false, participation: 0, message: `CodeAssist: ❌ Error verifying` };
    }
  }

  async verifyBlockAssist(address) {
    try {
      const url = `${this.dashboardBaseUrl}/users/${address}/blockassist/stats`;
      const response = await axios.get(url, { timeout: 10000 });
      const participation = response.data?.participation || 0;
      return {
        eligible: participation > 0,
        participation: participation,
        message: participation > 0 
          ? `BlockAssist: ✅ Verified (Participation: ${participation})`
          : `BlockAssist: ❌ No participation found`
      };
    } catch (error) {
      console.error('BlockAssist verification error:', error.message);
      return { eligible: false, participation: 0, message: `BlockAssist: ❌ Error verifying` };
    }
  }

  async verifyJudge(address) {
    try {
      const url = `${this.dashboardBaseUrl}/applications/verdict/userinfo/${address}`;
      const response = await axios.get(url, { timeout: 10000 });
      const entries = response.data?.entries || [];
      const betsPlaced = response.data?.betsPlaced || 0;
      const totalPoints = response.data?.totalPoints || 0;
      const hasEntries = entries.length > 0 || betsPlaced > 0;
      return {
        eligible: hasEntries,
        betsPlaced: betsPlaced,
        totalPoints: totalPoints,
        entriesCount: entries.length,
        message: hasEntries 
          ? `Judge: ✅ Verified (Bets: ${betsPlaced}, Points: ${totalPoints})`
          : `Judge: ❌ No bets/entries found`
      };
    } catch (error) {
      console.error('Judge verification error:', error.message);
      return { eligible: false, betsPlaced: 0, totalPoints: 0, message: `Judge: ❌ Error verifying` };
    }
  }

  async verifyRLSwarm(address) {
    try {
      const peerIdsResult = await this.swarmContract.getPeerId([address]);
      const peerIds = peerIdsResult[0] || [];
      
      if (peerIds.length === 0) {
        return { eligible: false, peerIds: [], peerCount: 0, totalWins: 0, message: `RLSwarm: ❌ No peer IDs registered` };
      }
      
      let totalWins = 0;
      for (const peerId of peerIds) {
        try {
          const wins = await this.swarmContract.getTotalWins(peerId);
          totalWins += Number(wins);
        } catch (err) {
          console.error(`Error getting wins for peer ${peerId}:`, err.message);
          // Continue with other peers even if one fails
        }
      }
      
      const eligible = totalWins > 0;
      return {
        eligible: eligible,
        peerIds: peerIds,
        peerCount: peerIds.length,
        totalWins: totalWins,
        message: eligible 
          ? `RLSwarm: ✅ Verified (Peers: ${peerIds.length}, Total Wins: ${totalWins})`
          : `RLSwarm: ❌ No wins found (Peers: ${peerIds.length}, Wins: 0)`
      };
    } catch (error) {
      console.error('RLSwarm verification error:', error.message);
      // More descriptive error message based on error type
      let errorMessage = 'Error connecting to smart contract';
      if (error.message.includes('network')) {
        errorMessage = 'Network error connecting to Gensyn RPC';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Contract call timed out';
      }
      return { eligible: false, peerIds: [], peerCount: 0, totalWins: 0, message: `RLSwarm: ❌ ${errorMessage}` };
    }
  }

  async verifyAll(address) {
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid Gensyn Dashboard address format');
    }
    
    const normalizedAddress = ethers.getAddress(address);
    
    const [codeAssist, blockAssist, judge, rlSwarm] = await Promise.all([
      this.verifyCodeAssist(normalizedAddress),
      this.verifyBlockAssist(normalizedAddress),
      this.verifyJudge(normalizedAddress),
      this.verifyRLSwarm(normalizedAddress)
    ]);
    
    return {
      address: normalizedAddress,
      codeAssist,
      blockAssist,
      judge,
      rlSwarm,
      summary: {
        totalEligible: [codeAssist, blockAssist, judge, rlSwarm].filter(r => r.eligible).length,
        eligible: {
          codeAssist: codeAssist.eligible,
          blockAssist: blockAssist.eligible,
          judge: judge.eligible,
          rlSwarm: rlSwarm.eligible
        }
      }
    };
  }
}

module.exports = new GensynApiService();
