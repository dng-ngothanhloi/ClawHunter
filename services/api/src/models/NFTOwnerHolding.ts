// NFT Owner Holding Model - End-of-day snapshots
// Implements snapshot policy: end-of-day snapshots affect next epoch

export interface NFTOwnerHoldingData {
  holderAddress: string;
  tokenId: number;
  unitsHeld: number;
  snapshotEpoch: number;
  stakedInPool: boolean;
}

export class NFTOwnerHolding {
  /**
   * Create holding snapshot entry
   */
  static createHolding(
    holderAddress: string,
    tokenId: number,
    unitsHeld: number,
    snapshotEpoch: number,
    stakedInPool: boolean = false
  ): NFTOwnerHoldingData {
    // Validate address format
    if (!holderAddress.startsWith('0x') || holderAddress.length !== 42) {
      throw new Error('Invalid holder address format');
    }

    if (unitsHeld < 0) {
      throw new Error('Units held cannot be negative');
    }

    return {
      holderAddress: holderAddress.toLowerCase(),
      tokenId,
      unitsHeld,
      snapshotEpoch,
      stakedInPool,
    };
  }

  /**
   * Check if it's end-of-day for snapshot capture (23:59:59 UTC)
   */
  static isEndOfDay(timestamp: number | bigint): boolean {
    const ts = Number(timestamp);
    return (ts % 86400) >= 86340; // After 23:59:00 UTC
  }

  /**
   * Calculate snapshot epoch (next epoch for end-of-day snapshots)
   */
  static getSnapshotEpoch(currentEpoch: number, isEndOfDay: boolean): number {
    return isEndOfDay ? currentEpoch + 1 : currentEpoch;
  }

  /**
   * Create bulk snapshot for all holdings
   */
  static createBulkSnapshot(
    holdings: Array<{
      holderAddress: string;
      tokenId: number;
      unitsHeld: number;
      stakedInPool: boolean;
    }>,
    snapshotEpoch: number
  ): NFTOwnerHoldingData[] {
    return holdings.map(h => 
      NFTOwnerHolding.createHolding(
        h.holderAddress,
        h.tokenId,
        h.unitsHeld,
        snapshotEpoch,
        h.stakedInPool
      )
    );
  }

  /**
   * Compare snapshots to detect ownership changes
   */
  static compareSnapshots(
    previousHoldings: NFTOwnerHoldingData[],
    currentHoldings: NFTOwnerHoldingData[]
  ): {
    added: NFTOwnerHoldingData[];
    removed: NFTOwnerHoldingData[];
    changed: NFTOwnerHoldingData[];
  } {
    const prevMap = new Map(
      previousHoldings.map(h => [`${h.holderAddress}-${h.tokenId}`, h])
    );
    const currMap = new Map(
      currentHoldings.map(h => [`${h.holderAddress}-${h.tokenId}`, h])
    );

    const added = currentHoldings.filter(h => !prevMap.has(`${h.holderAddress}-${h.tokenId}`));
    const removed = previousHoldings.filter(h => !currMap.has(`${h.holderAddress}-${h.tokenId}`));
    const changed = currentHoldings.filter(h => {
      const key = `${h.holderAddress}-${h.tokenId}`;
      const prev = prevMap.get(key);
      return prev && (
        prev.unitsHeld !== h.unitsHeld || 
        prev.stakedInPool !== h.stakedInPool
      );
    });

    return { added, removed, changed };
  }

  /**
   * Validate snapshot integrity against blockchain state
   */
  static validateSnapshotIntegrity(
    holdings: NFTOwnerHoldingData[],
    blockchainHoldings: Array<{ holderAddress: string; tokenId: number; balance: number }>
  ): boolean {
    const snapshotMap = new Map(
      holdings.map(h => [`${h.holderAddress}-${h.tokenId}`, h.unitsHeld])
    );

    return blockchainHoldings.every(bh => {
      const key = `${bh.holderAddress.toLowerCase()}-${bh.tokenId}`;
      const snapshotUnits = snapshotMap.get(key) || 0;
      return snapshotUnits === bh.balance;
    });
  }

  /**
   * Get holdings eligible for rewards (staked only)
   */
  static getEligibleHoldings(holdings: NFTOwnerHoldingData[]): NFTOwnerHoldingData[] {
    return holdings.filter(h => h.stakedInPool && h.unitsHeld > 0);
  }

  /**
   * Calculate total effective weight for machine
   * Eff_m = Σ_i (shareBps_i * units_i) for staked holdings
   */
  static calculateMachineEffectiveWeight(
    holdings: NFTOwnerHoldingData[],
    tokenShares: Map<number, number> // tokenId -> shareBasisPoints
  ): number {
    return holdings
      .filter(h => h.stakedInPool)
      .reduce((sum, h) => {
        const shareBps = tokenShares.get(h.tokenId) || 0;
        return sum + (shareBps * h.unitsHeld);
      }, 0);
  }
}

export default NFTOwnerHolding;
