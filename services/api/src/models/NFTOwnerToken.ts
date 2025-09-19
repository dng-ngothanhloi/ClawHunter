// NFT Owner Token Model - Fractional machine ownership
// Implements FR-003 (NFTOwner rewards), FR-015 (token burning)

export interface NFTOwnerTokenData {
  tokenId: number;
  machineId: number;
  shareBasisPoints: number; // 1-10000
  totalSupply: number;
  expiresAt?: bigint;
  burned: boolean;
}

export class NFTOwnerToken {
  static readonly MAX_OWNERSHIP_BPS = 10000; // 100% in basis points

  /**
   * Create NFT Owner token with ownership validation
   */
  static createToken(
    tokenId: number,
    machineId: number,
    shareBasisPoints: number,
    totalSupply: number,
    expiresAt?: bigint
  ): NFTOwnerTokenData {
    // Validate ownership share
    if (shareBasisPoints < 1 || shareBasisPoints > NFTOwnerToken.MAX_OWNERSHIP_BPS) {
      throw new Error(`Invalid ownership share: ${shareBasisPoints} bps. Must be 1-10000`);
    }

    if (totalSupply <= 0) {
      throw new Error('Total supply must be greater than 0');
    }

    return {
      tokenId,
      machineId,
      shareBasisPoints,
      totalSupply,
      expiresAt,
      burned: false,
    };
  }

  /**
   * Validate total ownership per machine doesn't exceed 100%
   */
  static validateMachineOwnership(
    machineId: number,
    tokens: NFTOwnerTokenData[]
  ): { valid: boolean; totalBps: number } {
    const machineTokens = tokens.filter(t => t.machineId === machineId && !t.burned);
    const totalBps = machineTokens.reduce((sum, t) => sum + t.shareBasisPoints, 0);
    
    return {
      valid: totalBps <= NFTOwnerToken.MAX_OWNERSHIP_BPS,
      totalBps,
    };
  }

  /**
   * Burn token (removes reward eligibility)
   */
  static burnToken(token: NFTOwnerTokenData): NFTOwnerTokenData {
    if (token.burned) {
      throw new Error(`Token ${token.tokenId} already burned`);
    }

    return {
      ...token,
      burned: true,
    };
  }

  /**
   * Check if token is eligible for rewards (not burned, staked)
   */
  static isEligibleForRewards(token: NFTOwnerTokenData, stakedInPool: boolean): boolean {
    return !token.burned && stakedInPool;
  }

  /**
   * Calculate ownership percentage as decimal
   */
  static calculateOwnershipPercentage(token: NFTOwnerTokenData): number {
    return token.shareBasisPoints / 100; // Convert bps to percentage
  }

  /**
   * Track supply changes for burn events
   */
  static updateSupply(token: NFTOwnerTokenData, supplyChange: number): NFTOwnerTokenData {
    const newSupply = token.totalSupply + supplyChange;
    
    if (newSupply < 0) {
      throw new Error('Supply cannot be negative');
    }

    return {
      ...token,
      totalSupply: newSupply,
    };
  }

  /**
   * Get tokens requiring burn due to machine expiration
   */
  static getTokensRequiringBurn(
    tokens: NFTOwnerTokenData[],
    expiredMachineIds: number[]
  ): NFTOwnerTokenData[] {
    return tokens.filter(t => 
      expiredMachineIds.includes(t.machineId) && !t.burned
    );
  }

  /**
   * Calculate effective weight for reward distribution
   * eff_i = shareBps_i * units_i * (stakedInPool ? 1 : 0)
   */
  static calculateEffectiveWeight(
    token: NFTOwnerTokenData,
    unitsHeld: number,
    stakedInPool: boolean
  ): number {
    if (token.burned) return 0;
    return stakedInPool ? token.shareBasisPoints * unitsHeld : 0;
  }
}

export default NFTOwnerToken;
