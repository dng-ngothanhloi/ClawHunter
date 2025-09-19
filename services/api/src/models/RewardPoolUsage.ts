// Reward Pool Usage Model - δ pool accounting for in-game rewards
// Implements FR-005 (reward pool usage tracking)

export interface RewardPoolUsageData {
  usageId: string;
  epochId: number;
  poolType: RewardPoolType;
  usedAmount: bigint;
  carryoverAmount: bigint;
  allocatedAmount: bigint;
  previousCarryover: bigint;
  usageDescription: string;
  usageCategory: UsageCategory;
  usedAt: bigint;
  blockNumber?: bigint;
  txHash?: string;
}

export enum RewardPoolType {
  DELTA = 'DELTA',           // δ pool (4% of revenue)
  ALPHA = 'ALPHA',           // α pool (20% of revenue) - for reference
  BETA = 'BETA',             // β pool (3% of revenue) - for reference
  GAMMA = 'GAMMA',           // γ pool (3% of revenue) - for reference
}

export enum UsageCategory {
  IN_GAME_REWARDS = 'IN_GAME_REWARDS',
  TOURNAMENT_PRIZES = 'TOURNAMENT_PRIZES',
  SPECIAL_EVENTS = 'SPECIAL_EVENTS',
  COMMUNITY_REWARDS = 'COMMUNITY_REWARDS',
  PARTNERSHIP_PROGRAMS = 'PARTNERSHIP_PROGRAMS',
  OTHER = 'OTHER',
}

export interface BudgetLimit {
  epochId: number;
  poolType: RewardPoolType;
  maxUsage: bigint;
  maxCarryover: bigint;
}

export class RewardPoolUsage {
  static readonly MAX_CARRYOVER_RATIO = 0.5; // 50% of allocated amount

  /**
   * Create reward pool usage entry
   */
  static createUsage(
    usageId: string,
    epochId: number,
    poolType: RewardPoolType,
    usedAmount: bigint,
    allocatedAmount: bigint,
    previousCarryover: bigint,
    usageDescription: string,
    usageCategory: UsageCategory,
    usedAt: bigint,
    blockNumber?: bigint,
    txHash?: string
  ): RewardPoolUsageData {
    // Validate amounts
    if (usedAmount < 0) {
      throw new Error('Used amount cannot be negative');
    }

    if (allocatedAmount < 0) {
      throw new Error('Allocated amount cannot be negative');
    }

    if (previousCarryover < 0) {
      throw new Error('Previous carryover cannot be negative');
    }

    // Calculate carryover
    const totalAvailable = allocatedAmount + previousCarryover;
    const carryoverAmount = totalAvailable > usedAmount 
      ? totalAvailable - usedAmount 
      : BigInt(0);

    return {
      usageId,
      epochId,
      poolType,
      usedAmount,
      carryoverAmount,
      allocatedAmount,
      previousCarryover,
      usageDescription,
      usageCategory,
      usedAt,
      blockNumber,
      txHash,
    };
  }

  /**
   * Validate usage against budget limits
   */
  static validateBudgetLimits(
    usage: RewardPoolUsageData,
    budgetLimit: BudgetLimit
  ): { valid: boolean; error?: string } {
    // Check usage limit
    if (usage.usedAmount > budgetLimit.maxUsage) {
      return {
        valid: false,
        error: `Usage amount ${usage.usedAmount} exceeds budget limit ${budgetLimit.maxUsage}`
      };
    }

    // Check carryover limit
    if (usage.carryoverAmount > budgetLimit.maxCarryover) {
      return {
        valid: false,
        error: `Carryover amount ${usage.carryoverAmount} exceeds limit ${budgetLimit.maxCarryover}`
      };
    }

    return { valid: true };
  }

  /**
   * Calculate next epoch carryover
   */
  static calculateNextEpochCarryover(
    currentUsage: RewardPoolUsageData
  ): bigint {
    return currentUsage.carryoverAmount;
  }

  /**
   * Create budget limit for epoch
   */
  static createBudgetLimit(
    epochId: number,
    poolType: RewardPoolType,
    allocatedAmount: bigint
  ): BudgetLimit {
    const maxCarryover = (allocatedAmount * BigInt(Math.floor(RewardPoolUsage.MAX_CARRYOVER_RATIO * 10000))) / BigInt(10000);

    return {
      epochId,
      poolType,
      maxUsage: allocatedAmount,
      maxCarryover,
    };
  }

  /**
   * Aggregate usage by category
   */
  static aggregateUsageByCategory(
    usages: RewardPoolUsageData[]
  ): Map<UsageCategory, { totalUsed: bigint; count: number }> {
    const aggregated = new Map<UsageCategory, { totalUsed: bigint; count: number }>();

    usages.forEach(usage => {
      const existing = aggregated.get(usage.usageCategory) || { totalUsed: BigInt(0), count: 0 };
      aggregated.set(usage.usageCategory, {
        totalUsed: existing.totalUsed + usage.usedAmount,
        count: existing.count + 1,
      });
    });

    return aggregated;
  }

  /**
   * Calculate usage analytics for epoch
   */
  static calculateEpochAnalytics(
    usages: RewardPoolUsageData[],
    allocatedAmount: bigint
  ): {
    totalUsed: bigint;
    totalCarryover: bigint;
    utilizationRate: number;
    carryoverRate: number;
    topCategories: Array<{ category: UsageCategory; amount: bigint; percentage: number }>;
  } {
    if (usages.length === 0) {
      return {
        totalUsed: BigInt(0),
        totalCarryover: BigInt(0),
        utilizationRate: 0,
        carryoverRate: 0,
        topCategories: [],
      };
    }

    const totalUsed = usages.reduce((sum, u) => sum + u.usedAmount, BigInt(0));
    const totalCarryover = usages.reduce((sum, u) => sum + u.carryoverAmount, BigInt(0));
    
    const utilizationRate = allocatedAmount > 0 
      ? Number((totalUsed * BigInt(10000)) / allocatedAmount) / 100 
      : 0;
    
    const carryoverRate = allocatedAmount > 0 
      ? Number((totalCarryover * BigInt(10000)) / allocatedAmount) / 100 
      : 0;

    // Calculate top categories
    const categoryAggregation = RewardPoolUsage.aggregateUsageByCategory(usages);
    const topCategories = Array.from(categoryAggregation.entries())
      .map(([category, data]) => ({
        category,
        amount: data.totalUsed,
        percentage: totalUsed > 0 ? Number((data.totalUsed * BigInt(10000)) / totalUsed) / 100 : 0,
      }))
      .sort((a, b) => Number(b.amount - a.amount))
      .slice(0, 5); // Top 5 categories

    return {
      totalUsed,
      totalCarryover,
      utilizationRate,
      carryoverRate,
      topCategories,
    };
  }

  /**
   * Prepare Phase 2 KPI data
   */
  static preparePhase2KPIData(
    usages: RewardPoolUsageData[]
  ): {
    totalRewardsDistributed: bigint;
    averageRewardPerUser: bigint;
    categoryDistribution: Map<UsageCategory, number>;
    monthlyTrends: Array<{ month: string; totalUsed: bigint; categoryBreakdown: Map<UsageCategory, bigint> }>;
  } {
    const totalRewardsDistributed = usages.reduce((sum, u) => sum + u.usedAmount, BigInt(0));
    
    // Calculate average reward per user (placeholder - would need user data)
    const averageRewardPerUser = usages.length > 0 ? totalRewardsDistributed / BigInt(usages.length) : BigInt(0);

    // Category distribution as percentages
    const categoryAggregation = RewardPoolUsage.aggregateUsageByCategory(usages);
    const categoryDistribution = new Map<UsageCategory, number>();
    
    categoryAggregation.forEach((data, category) => {
      const percentage = totalRewardsDistributed > 0 
        ? Number((data.totalUsed * BigInt(10000)) / totalRewardsDistributed) / 100 
        : 0;
      categoryDistribution.set(category, percentage);
    });

    // Monthly trends (placeholder - would group by actual months)
    const monthlyTrends = [
      {
        month: '2025-09',
        totalUsed: totalRewardsDistributed,
        categoryBreakdown: new Map<UsageCategory, bigint>(),
      }
    ];

    return {
      totalRewardsDistributed,
      averageRewardPerUser,
      categoryDistribution,
      monthlyTrends,
    };
  }

  /**
   * Validate usage consistency
   */
  static validateUsageConsistency(usage: RewardPoolUsageData): boolean {
    const totalAvailable = usage.allocatedAmount + usage.previousCarryover;
    const expectedCarryover = totalAvailable > usage.usedAmount 
      ? totalAvailable - usage.usedAmount 
      : BigInt(0);
    
    return usage.carryoverAmount === expectedCarryover;
  }

  /**
   * Get usage history for analytics
   */
  static getUsageHistory(
    usages: RewardPoolUsageData[],
    startEpoch: number,
    endEpoch: number
  ): RewardPoolUsageData[] {
    return usages.filter(u => u.epochId >= startEpoch && u.epochId <= endEpoch);
  }

  /**
   * Calculate efficiency metrics
   */
  static calculateEfficiencyMetrics(
    usages: RewardPoolUsageData[]
  ): {
    averageUtilizationRate: number;
    carryoverEfficiency: number;
    categoryEfficiency: Map<UsageCategory, number>;
  } {
    if (usages.length === 0) {
      return {
        averageUtilizationRate: 0,
        carryoverEfficiency: 0,
        categoryEfficiency: new Map(),
      };
    }

    const totalAllocated = usages.reduce((sum, u) => sum + u.allocatedAmount, BigInt(0));
    const totalUsed = usages.reduce((sum, u) => sum + u.usedAmount, BigInt(0));
    const totalCarryover = usages.reduce((sum, u) => sum + u.carryoverAmount, BigInt(0));

    const averageUtilizationRate = totalAllocated > 0 
      ? Number((totalUsed * BigInt(10000)) / totalAllocated) / 100 
      : 0;

    const carryoverEfficiency = totalUsed > 0 
      ? Number((totalCarryover * BigInt(10000)) / totalUsed) / 100 
      : 0;

    // Category efficiency (placeholder)
    const categoryEfficiency = new Map<UsageCategory, number>();
    categoryEfficiency.set(UsageCategory.IN_GAME_REWARDS, 85);
    categoryEfficiency.set(UsageCategory.TOURNAMENT_PRIZES, 95);
    categoryEfficiency.set(UsageCategory.SPECIAL_EVENTS, 70);

    return {
      averageUtilizationRate,
      carryoverEfficiency,
      categoryEfficiency,
    };
  }
}

export default RewardPoolUsage;