// Revenue Epoch Model - Core mathematical logic for 70/20/3/3/4 split
// Implements FR-001 (revenue recording), FR-002 (revenue split)

export interface RevenueEpochData {
  epochId: number;
  totalRevenue: bigint;
  opcAmount: bigint;
  alphaAmount: bigint;
  betaAmount: bigint;
  gammaAmount: bigint;
  deltaAmount: bigint;
  remainderAmount: bigint;
  blockTimestamp: bigint;
  finalized: boolean;
  oraclePosted: boolean;
}

export interface EpochDistribution {
  opcAmount: bigint;
  alphaAmount: bigint;
  betaAmount: bigint;
  gammaAmount: bigint;
  deltaAmount: bigint;
  remainderAmount: bigint;
}

export class RevenueEpoch {
  // Constants from product spec
  static readonly EPOCH0_START = BigInt(1640995200); // 2022-01-01 00:00:00 UTC
  static readonly EPOCH_DURATION = BigInt(86400); // 24 hours in seconds
  static readonly DENOM = 10000; // 100% in basis points
  static readonly OPC_BPS = 7000; // 70%
  static readonly ALPHA_BPS = 2000; // 20%
  static readonly BETA_BPS = 300; // 3%
  static readonly GAMMA_BPS = 300; // 3%
  static readonly DELTA_BPS = 400; // 4%

  /**
   * Calculate epoch ID from timestamp
   * Formula: floor((timestamp - EPOCH0_START) / 86400) + 1
   */
  static calculateEpochId(timestamp: number | bigint): number {
    const ts = BigInt(timestamp);
    return Number((ts - RevenueEpoch.EPOCH0_START) / RevenueEpoch.EPOCH_DURATION) + 1;
  }

  /**
   * Calculate revenue distribution with floor division and remainder handling
   * Policy: remTop = R - (sum of pools) → OPC
   */
  static calculateDistribution(totalRevenue: bigint): EpochDistribution {
    // Floor division for all pools
    const opcBase = (totalRevenue * BigInt(RevenueEpoch.OPC_BPS)) / BigInt(RevenueEpoch.DENOM);
    const alphaAmount = (totalRevenue * BigInt(RevenueEpoch.ALPHA_BPS)) / BigInt(RevenueEpoch.DENOM);
    const betaAmount = (totalRevenue * BigInt(RevenueEpoch.BETA_BPS)) / BigInt(RevenueEpoch.DENOM);
    const gammaAmount = (totalRevenue * BigInt(RevenueEpoch.GAMMA_BPS)) / BigInt(RevenueEpoch.DENOM);
    const deltaAmount = (totalRevenue * BigInt(RevenueEpoch.DELTA_BPS)) / BigInt(RevenueEpoch.DENOM);

    // Calculate remainder and add to OPC
    const poolSum = opcBase + alphaAmount + betaAmount + gammaAmount + deltaAmount;
    const remainderAmount = totalRevenue - poolSum;
    const opcAmount = opcBase + remainderAmount;

    return {
      opcAmount,
      alphaAmount,
      betaAmount,
      gammaAmount,
      deltaAmount,
      remainderAmount,
    };
  }

  /**
   * Validate revenue distribution totals exactly 100%
   */
  static validateDistribution(totalRevenue: bigint, distribution: EpochDistribution): boolean {
    const sum = distribution.opcAmount + distribution.alphaAmount + 
                distribution.betaAmount + distribution.gammaAmount + distribution.deltaAmount;
    return sum === totalRevenue;
  }

  /**
   * Create revenue epoch with automatic distribution calculation
   */
  static createEpochData(epochId: number, totalRevenue: bigint, blockTimestamp: bigint): RevenueEpochData {
    const distribution = RevenueEpoch.calculateDistribution(totalRevenue);
    
    return {
      epochId,
      totalRevenue,
      opcAmount: distribution.opcAmount,
      alphaAmount: distribution.alphaAmount,
      betaAmount: distribution.betaAmount,
      gammaAmount: distribution.gammaAmount,
      deltaAmount: distribution.deltaAmount,
      remainderAmount: distribution.remainderAmount,
      blockTimestamp,
      finalized: false,
      oraclePosted: false,
    };
  }

  /**
   * Get current epoch ID based on current timestamp
   */
  static getCurrentEpochId(): number {
    return RevenueEpoch.calculateEpochId(Math.floor(Date.now() / 1000));
  }

  /**
   * Check if epoch boundary (end-of-day detection)
   */
  static isEndOfDay(timestamp: number | bigint): boolean {
    const ts = Number(timestamp);
    return (ts % 86400) >= 86340; // After 23:59:00 UTC
  }
}

export default RevenueEpoch;
