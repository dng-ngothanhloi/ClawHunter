// Machine Revenue Model - Per-machine revenue tracking
// Implements FR-003 (NFTOwner rewards), FR-009 (per-machine tracking)

export interface MachineRevenueData {
  machineId: number;
  epochId: number;
  revenueAmount: bigint;
  rootHash: string;
  oracleAddress: string;
  blockTimestamp: bigint;
}

export class MachineRevenue {
  /**
   * Create machine revenue entry with R_m = 0 audit support
   */
  static createRevenueData(
    machineId: number,
    epochId: number,
    revenueAmount: bigint,
    rootHash: string,
    oracleAddress: string,
    blockTimestamp: bigint
  ): MachineRevenueData {
    // R_m = 0 allowed for audit trail (FR requirement)
    return {
      machineId,
      epochId,
      revenueAmount,
      rootHash,
      oracleAddress,
      blockTimestamp,
    };
  }

  /**
   * Validate oracle signature integration (placeholder for contract integration)
   */
  static validateOracleSignature(oracleAddress: string, allowlistedOracles: string[]): boolean {
    return allowlistedOracles.includes(oracleAddress.toLowerCase());
  }

  /**
   * Calculate machine revenue aggregation for analytics
   */
  static aggregateRevenue(revenues: MachineRevenueData[]): {
    totalRevenue: bigint;
    averageRevenue: bigint;
    epochCount: number;
  } {
    if (revenues.length === 0) {
      return { totalRevenue: BigInt(0), averageRevenue: BigInt(0), epochCount: 0 };
    }

    const totalRevenue = revenues.reduce((sum, r) => sum + r.revenueAmount, BigInt(0));
    const averageRevenue = totalRevenue / BigInt(revenues.length);

    return {
      totalRevenue,
      averageRevenue,
      epochCount: revenues.length,
    };
  }

  /**
   * Validate merkle proof against revenue data (placeholder for oracle integration)
   */
  static validateMerkleProof(
    revenueData: MachineRevenueData,
    merkleRoot: string,
    proof: string[]
  ): boolean {
    // TODO: Implement merkle proof validation when oracle integration is ready
    // For now, validate that root hash matches expected format
    return merkleRoot.length === 66 && merkleRoot.startsWith('0x');
  }

  /**
   * Create bulk revenue entries for oracle batch processing
   */
  static createBulkRevenues(
    epochId: number,
    machineRevenues: Array<{ machineId: number; revenueAmount: bigint }>,
    rootHash: string,
    oracleAddress: string,
    blockTimestamp: bigint
  ): MachineRevenueData[] {
    return machineRevenues.map(mr => 
      MachineRevenue.createRevenueData(
        mr.machineId,
        epochId,
        mr.revenueAmount,
        rootHash,
        oracleAddress,
        blockTimestamp
      )
    );
  }

  /**
   * Validate machine-epoch uniqueness constraint
   */
  static validateUniqueness(
    newRevenue: MachineRevenueData,
    existingRevenues: MachineRevenueData[]
  ): boolean {
    return !existingRevenues.some(r => 
      r.machineId === newRevenue.machineId && r.epochId === newRevenue.epochId
    );
  }
}

export default MachineRevenue;
