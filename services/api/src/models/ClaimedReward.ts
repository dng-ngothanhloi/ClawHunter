// Claimed Reward Model - Audit trail for successful claims
// Implements FR-007 (audit trail)

export interface ClaimedRewardData {
  beneficiaryAddress: string;
  epochId: number;
  claimedAmount: bigint;
  transactionHash: string;
  blockTimestamp: bigint;
  gasUsed: number;
}

export class ClaimedReward {
  /**
   * Create claimed reward audit entry
   */
  static createClaimedReward(
    beneficiaryAddress: string,
    epochId: number,
    claimedAmount: bigint,
    transactionHash: string,
    blockTimestamp: bigint,
    gasUsed: number
  ): ClaimedRewardData {
    // Validate transaction hash format
    if (!transactionHash.startsWith('0x') || transactionHash.length !== 66) {
      throw new Error('Invalid transaction hash format');
    }

    // Validate address format
    if (!beneficiaryAddress.startsWith('0x') || beneficiaryAddress.length !== 42) {
      throw new Error('Invalid beneficiary address format');
    }

    if (claimedAmount <= 0) {
      throw new Error('Claimed amount must be greater than 0');
    }

    return {
      beneficiaryAddress: beneficiaryAddress.toLowerCase(),
      epochId,
      claimedAmount,
      transactionHash,
      blockTimestamp,
      gasUsed,
    };
  }

  /**
   * Calculate claim statistics for analytics
   */
  static calculateClaimStats(claims: ClaimedRewardData[]): {
    totalClaimed: bigint;
    averageGasUsed: number;
    uniqueBeneficiaries: number;
    epochsWithClaims: number;
  } {
    if (claims.length === 0) {
      return {
        totalClaimed: BigInt(0),
        averageGasUsed: 0,
        uniqueBeneficiaries: 0,
        epochsWithClaims: 0,
      };
    }

    const totalClaimed = claims.reduce((sum, c) => sum + c.claimedAmount, BigInt(0));
    const averageGasUsed = Math.floor(claims.reduce((sum, c) => sum + c.gasUsed, 0) / claims.length);
    const uniqueBeneficiaries = new Set(claims.map(c => c.beneficiaryAddress)).size;
    const epochsWithClaims = new Set(claims.map(c => c.epochId)).size;

    return {
      totalClaimed,
      averageGasUsed,
      uniqueBeneficiaries,
      epochsWithClaims,
    };
  }

  /**
   * Verify claim against blockchain transaction
   */
  static verifyClaimTransaction(
    claim: ClaimedRewardData,
    blockchainTx: {
      hash: string;
      blockTimestamp: bigint;
      gasUsed: number;
      success: boolean;
    }
  ): boolean {
    return (
      claim.transactionHash === blockchainTx.hash &&
      claim.blockTimestamp === blockchainTx.blockTimestamp &&
      claim.gasUsed === blockchainTx.gasUsed &&
      blockchainTx.success
    );
  }

  /**
   * Create bulk claim entries for batch processing
   */
  static createBulkClaims(
    beneficiaryAddress: string,
    epochRewards: Array<{ epochId: number; amount: bigint }>,
    transactionHash: string,
    blockTimestamp: bigint,
    gasUsed: number
  ): ClaimedRewardData[] {
    return epochRewards.map(er =>
      ClaimedReward.createClaimedReward(
        beneficiaryAddress,
        er.epochId,
        er.amount,
        transactionHash,
        blockTimestamp,
        gasUsed
      )
    );
  }
}

export default ClaimedReward;
