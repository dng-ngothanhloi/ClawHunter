// Staking Position Model - CHG staking with lock weights
// Implements FR-004 (staking rewards), FR-013 (investor program)

export interface StakingPositionData {
  positionId: number;
  stakerAddress: string;
  stakedAmount: bigint;
  lockDurationDays: number;
  lockWeight: number; // basis points multiplier
  startTimestamp: bigint;
  unlockTimestamp: bigint;
  active: boolean;
  investorProgram: boolean;
}

export interface LockWeight {
  days: number;
  weight: number; // basis points
}

export class StakingPosition {
  // Lock weight tiers from specification
  static readonly LOCK_WEIGHTS: LockWeight[] = [
    { days: 30, weight: 1000 },   // <30d = 1000bps (1x)
    { days: 90, weight: 1500 },   // 90d = 1500bps (1.5x)
    { days: 180, weight: 2000 },  // 180d = 2000bps (2x)
    { days: 365, weight: 3000 },  // 365d = 3000bps (3x)
  ];

  static readonly INVESTOR_PROGRAM_MIN_DAYS = 1095; // 3 years

  /**
   * Calculate lock weight based on duration
   * <30d=1000bps, 90d=1500bps, 180d=2000bps, 365d=3000bps
   */
  static calculateLockWeight(lockDurationDays: number): number {
    if (lockDurationDays < 30) return 1000;   // <30d = 1000bps
    if (lockDurationDays < 90) return 1000;   // 30-89d = 1000bps  
    if (lockDurationDays < 180) return 1500;  // 90-179d = 1500bps
    if (lockDurationDays < 365) return 2000;  // 180-364d = 2000bps
    return 3000; // 365+ days = 3000bps
  }

  /**
   * Check investor program eligibility (≥3 years)
   */
  static isInvestorProgram(lockDurationDays: number): boolean {
    return lockDurationDays >= StakingPosition.INVESTOR_PROGRAM_MIN_DAYS;
  }

  /**
   * Create staking position
   */
  static createPosition(
    positionId: number,
    stakerAddress: string,
    stakedAmount: bigint,
    lockDurationDays: number,
    startTimestamp: bigint
  ): StakingPositionData {
    // Validate address format
    if (!stakerAddress.startsWith('0x') || stakerAddress.length !== 42) {
      throw new Error('Invalid staker address format');
    }

    if (stakedAmount <= 0) {
      throw new Error('Staked amount must be greater than 0');
    }

    if (lockDurationDays < 1) {
      throw new Error('Lock duration must be at least 1 day');
    }

    const lockWeight = StakingPosition.calculateLockWeight(lockDurationDays);
    const unlockTimestamp = startTimestamp + BigInt(lockDurationDays * 86400);
    const investorProgram = StakingPosition.isInvestorProgram(lockDurationDays);

    return {
      positionId,
      stakerAddress: stakerAddress.toLowerCase(),
      stakedAmount,
      lockDurationDays,
      lockWeight,
      startTimestamp,
      unlockTimestamp,
      active: true,
      investorProgram,
    };
  }

  /**
   * Calculate effective weight for reward distribution
   * eff_j = amount_j * weight(lockTerm_j)
   */
  static calculateEffectiveWeight(position: StakingPositionData): bigint {
    if (!position.active) return BigInt(0);
    return position.stakedAmount * BigInt(position.lockWeight);
  }

  /**
   * Check if position can be unstaked
   */
  static canUnstake(position: StakingPositionData, currentTimestamp: bigint): boolean {
    return currentTimestamp >= position.unlockTimestamp;
  }

  /**
   * Calculate total effective weight for all positions
   * W = Σ eff_j
   */
  static calculateTotalWeight(positions: StakingPositionData[]): bigint {
    return positions
      .filter(p => p.active)
      .reduce((sum, p) => sum + StakingPosition.calculateEffectiveWeight(p), BigInt(0));
  }

  /**
   * Find oldest active position for remainder distribution
   */
  static findOldestPosition(positions: StakingPositionData[]): StakingPositionData | null {
    const activePositions = positions.filter(p => p.active);
    if (activePositions.length === 0) return null;

    return activePositions.reduce((oldest, current) => 
      current.startTimestamp < oldest.startTimestamp ? current : oldest
    );
  }

  /**
   * Calculate staking reward for position
   * reward_j = floor(PoolAlpha * eff_j / W)
   */
  static calculateReward(
    position: StakingPositionData,
    poolAlpha: bigint,
    totalWeight: bigint
  ): bigint {
    if (!position.active || totalWeight === BigInt(0)) return BigInt(0);
    
    const effectiveWeight = StakingPosition.calculateEffectiveWeight(position);
    return (poolAlpha * effectiveWeight) / totalWeight; // Floor division
  }

  /**
   * Distribute staking pool with remainder to oldest position
   */
  static distributeStakingPool(
    positions: StakingPositionData[],
    poolAlpha: bigint
  ): {
    rewards: Array<{ positionId: number; reward: bigint }>;
    remainder: bigint;
    oldestPositionId: number | null;
  } {
    const activePositions = positions.filter(p => p.active);
    
    if (activePositions.length === 0) {
      return {
        rewards: [],
        remainder: poolAlpha,
        oldestPositionId: null,
      };
    }

    const totalWeight = StakingPosition.calculateTotalWeight(activePositions);
    const rewards = activePositions.map(p => ({
      positionId: p.positionId,
      reward: StakingPosition.calculateReward(p, poolAlpha, totalWeight),
    }));

    const totalDistributed = rewards.reduce((sum, r) => sum + r.reward, BigInt(0));
    const remainder = poolAlpha - totalDistributed;
    const oldestPosition = StakingPosition.findOldestPosition(activePositions);

    return {
      rewards,
      remainder,
      oldestPositionId: oldestPosition?.positionId || null,
    };
  }
}

export default StakingPosition;
