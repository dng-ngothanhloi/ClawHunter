// Claimable Reward Model - Double-claim prevention and reward tracking
// Implements FR-006 (reward claiming), FR-010 (double-claim prevention)

export const RewardGroupType = {
  STAKING_CHG: 'STAKING_CHG',
  NFTCLAW_L1: 'NFTCLAW_L1',
  NFTOWNER_L2: 'NFTOWNER_L2'
} as const;

export type RewardGroupType = typeof RewardGroupType[keyof typeof RewardGroupType];

export interface ClaimableRewardData {
  beneficiaryAddress: string;
  epochId: number;
  rewardGroup: RewardGroupType;
  claimableAmount: bigint;
  sourceTokenId?: number;
  sourceMachineId?: number;
  calculatedAt: bigint;
  claimed: boolean;
}

export class ClaimableReward {
  /**
   * Create claimable reward entry
   */
  static createReward(
    beneficiaryAddress: string,
    epochId: number,
    rewardGroup: RewardGroupType,
    claimableAmount: bigint,
    calculatedAt: bigint,
    sourceTokenId?: number,
    sourceMachineId?: number
  ): ClaimableRewardData {
    // Validate address format
    if (!beneficiaryAddress.startsWith('0x') || beneficiaryAddress.length !== 42) {
      throw new Error('Invalid beneficiary address format');
    }

    // Validate reward group requirements
    if ((rewardGroup === RewardGroupType.NFTCLAW_L1 || rewardGroup === RewardGroupType.NFTOWNER_L2) && !sourceTokenId) {
      throw new Error(`sourceTokenId required for ${rewardGroup}`);
    }

    if (rewardGroup === RewardGroupType.NFTOWNER_L2 && !sourceMachineId) {
      throw new Error('sourceMachineId required for NFTOWNER_L2');
    }

    return {
      beneficiaryAddress: beneficiaryAddress.toLowerCase(),
      epochId,
      rewardGroup,
      claimableAmount,
      sourceTokenId,
      sourceMachineId,
      calculatedAt,
      claimed: false,
    };
  }

  /**
   * Calculate staking rewards for pool alpha
   * reward_j = floor(PoolAlpha * eff_j / W)
   */
  static calculateStakingRewards(
    poolAlpha: bigint,
    stakingPositions: Array<{
      positionId: number;
      stakerAddress: string;
      effectiveWeight: bigint;
    }>,
    totalWeight: bigint,
    epochId: number,
    calculatedAt: bigint
  ): ClaimableRewardData[] {
    if (totalWeight === BigInt(0)) return [];

    return stakingPositions.map(pos => {
      const rewardAmount = (poolAlpha * pos.effectiveWeight) / totalWeight; // Floor division
      
      return ClaimableReward.createReward(
        pos.stakerAddress,
        epochId,
        RewardGroupType.STAKING_CHG,
        rewardAmount,
        calculatedAt
      );
    });
  }

  /**
   * Calculate NFTOwner rewards per machine
   * reward_i = floor(OwnerPool_m * eff_i / Eff_m)
   */
  static calculateNFTOwnerRewards(
    machineId: number,
    machineRevenue: bigint,
    holdings: Array<{
      holderAddress: string;
      tokenId: number;
      effectiveWeight: number;
    }>,
    totalEffectiveWeight: number,
    epochId: number,
    calculatedAt: bigint
  ): ClaimableRewardData[] {
    // Calculate gamma pool for this machine: floor(R_m * 300 / 10000)
    const ownerPool = (machineRevenue * BigInt(300)) / BigInt(10000);
    
    if (totalEffectiveWeight === 0 || ownerPool === BigInt(0)) return [];

    return holdings
      .filter(h => h.effectiveWeight > 0)
      .map(h => {
        const rewardAmount = (ownerPool * BigInt(h.effectiveWeight)) / BigInt(totalEffectiveWeight);
        
        return ClaimableReward.createReward(
          h.holderAddress,
          epochId,
          RewardGroupType.NFTOWNER_L2,
          rewardAmount,
          calculatedAt,
          h.tokenId,
          machineId
        );
      });
  }

  /**
   * Aggregate claimable rewards by beneficiary
   */
  static aggregateByBeneficiary(rewards: ClaimableRewardData[]): Map<string, {
    totalClaimable: bigint;
    rewardsByGroup: Map<RewardGroupType, ClaimableRewardData[]>;
  }> {
    const aggregated = new Map();

    rewards.forEach(reward => {
      if (!aggregated.has(reward.beneficiaryAddress)) {
        aggregated.set(reward.beneficiaryAddress, {
          totalClaimable: BigInt(0),
          rewardsByGroup: new Map(),
        });
      }

      const beneficiaryData = aggregated.get(reward.beneficiaryAddress);
      beneficiaryData.totalClaimable += reward.claimableAmount;

      if (!beneficiaryData.rewardsByGroup.has(reward.rewardGroup)) {
        beneficiaryData.rewardsByGroup.set(reward.rewardGroup, []);
      }
      beneficiaryData.rewardsByGroup.get(reward.rewardGroup).push(reward);
    });

    return aggregated;
  }

  /**
   * Check for double-claim attempts
   */
  static checkDoubleClaimPrevention(
    newReward: ClaimableRewardData,
    existingRewards: ClaimableRewardData[]
  ): boolean {
    return !existingRewards.some(r =>
      r.beneficiaryAddress === newReward.beneficiaryAddress &&
      r.epochId === newReward.epochId &&
      r.rewardGroup === newReward.rewardGroup &&
      r.sourceTokenId === newReward.sourceTokenId &&
      r.sourceMachineId === newReward.sourceMachineId
    );
  }

  /**
   * Mark rewards as claimed (audit trail)
   */
  static markAsClaimed(rewards: ClaimableRewardData[]): ClaimableRewardData[] {
    return rewards.map(r => ({ ...r, claimed: true }));
  }
}

export default ClaimableReward;
