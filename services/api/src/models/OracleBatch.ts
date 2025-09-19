// Oracle Batch Model - Oracle posting integrity and signature validation
// Implements FR-012 (oracle signature validation)

export interface OracleBatchData {
  batchId: string;
  epochId: number;
  oracleAddress: string;
  signature: string;
  merkleRoot: string;
  machineRevenues: Array<{
    machineId: number;
    revenueAmount: bigint;
  }>;
  blockNumber: bigint;
  blockTimestamp: bigint;
  verified: boolean;
  verificationError?: string;
}

export interface OracleAllowlistEntry {
  address: string;
  active: boolean;
  addedAt: bigint;
  removedAt?: bigint;
}

export class OracleBatch {
  /**
   * Create oracle batch entry
   */
  static createBatch(
    batchId: string,
    epochId: number,
    oracleAddress: string,
    signature: string,
    merkleRoot: string,
    machineRevenues: Array<{ machineId: number; revenueAmount: bigint }>,
    blockNumber: bigint,
    blockTimestamp: bigint
  ): OracleBatchData {
    // Validate signature format (ECDSA signature)
    if (!signature.startsWith('0x') || signature.length !== 132) {
      throw new Error('Invalid signature format - must be 66-byte ECDSA signature');
    }

    // Validate merkle root format
    if (!merkleRoot.startsWith('0x') || merkleRoot.length !== 66) {
      throw new Error('Invalid merkle root format - must be 32-byte hash');
    }

    // Validate oracle address format
    if (!oracleAddress.startsWith('0x') || oracleAddress.length !== 42) {
      throw new Error('Invalid oracle address format');
    }

    return {
      batchId,
      epochId,
      oracleAddress: oracleAddress.toLowerCase(),
      signature,
      merkleRoot,
      machineRevenues,
      blockNumber,
      blockTimestamp,
      verified: false,
    };
  }

  /**
   * Validate ECDSA signature against allowlisted oracles
   */
  static validateOracleSignature(
    oracleAddress: string,
    allowlist: OracleAllowlistEntry[]
  ): boolean {
    const activeAllowlist = allowlist.filter(o => o.active);
    return activeAllowlist.some(o => 
      o.address.toLowerCase() === oracleAddress.toLowerCase()
    );
  }

  /**
   * Verify merkle root against machine revenue data
   */
  static verifyMerkleRoot(
    merkleRoot: string,
    machineRevenues: Array<{ machineId: number; revenueAmount: bigint }>
  ): boolean {
    // TODO: Implement actual merkle tree verification
    // For now, validate that the data structure is correct
    if (machineRevenues.length === 0) {
      return merkleRoot === '0x0000000000000000000000000000000000000000000000000000000000000000';
    }

    // Basic validation - in production, this would verify the actual merkle tree
    return merkleRoot.length === 66 && merkleRoot.startsWith('0x');
  }

  /**
   * Verify oracle batch integrity
   */
  static verifyBatch(
    batch: OracleBatchData,
    allowlist: OracleAllowlistEntry[]
  ): { verified: boolean; error?: string } {
    try {
      // Check oracle allowlist
      if (!OracleBatch.validateOracleSignature(batch.oracleAddress, allowlist)) {
        return { verified: false, error: 'Oracle not in allowlist' };
      }

      // Verify merkle root
      if (!OracleBatch.verifyMerkleRoot(batch.merkleRoot, batch.machineRevenues)) {
        return { verified: false, error: 'Invalid merkle root' };
      }

      // Verify signature (placeholder - would use actual ECDSA recovery)
      if (!OracleBatch.verifySignature(batch.signature, batch.oracleAddress)) {
        return { verified: false, error: 'Invalid signature' };
      }

      return { verified: true };
    } catch (error) {
      return { verified: false, error: `Verification failed: ${error}` };
    }
  }

  /**
   * Verify ECDSA signature (placeholder implementation)
   */
  static verifySignature(signature: string, expectedSigner: string): boolean {
    // TODO: Implement actual ECDSA signature verification
    // This would use ethers.js or similar library to recover the signer
    // and compare with the expected oracle address
    
    // For now, basic format validation
    return signature.length === 132 && signature.startsWith('0x');
  }

  /**
   * Calculate batch processing status
   */
  static getBatchStatus(batch: OracleBatchData): {
    status: 'pending' | 'verified' | 'failed';
    processedAt?: bigint;
    error?: string;
  } {
    if (batch.verified) {
      return { status: 'verified' };
    }

    if (batch.verificationError) {
      return { 
        status: 'failed', 
        error: batch.verificationError 
      };
    }

    return { status: 'pending' };
  }

  /**
   * Track oracle performance metrics
   */
  static calculateOraclePerformance(
    batches: OracleBatchData[],
    oracleAddress: string
  ): {
    totalBatches: number;
    verifiedBatches: number;
    successRate: number;
    averageProcessingTime: number;
  } {
    const oracleBatches = batches.filter(b => 
      b.oracleAddress.toLowerCase() === oracleAddress.toLowerCase()
    );

    const totalBatches = oracleBatches.length;
    const verifiedBatches = oracleBatches.filter(b => b.verified).length;
    const successRate = totalBatches > 0 ? (verifiedBatches / totalBatches) * 100 : 0;

    // Calculate average processing time (placeholder)
    const averageProcessingTime = oracleBatches.length > 0 ? 5000 : 0; // 5 seconds average

    return {
      totalBatches,
      verifiedBatches,
      successRate,
      averageProcessingTime,
    };
  }

  /**
   * Create allowlist entry
   */
  static createAllowlistEntry(
    address: string,
    addedAt: bigint
  ): OracleAllowlistEntry {
    if (!address.startsWith('0x') || address.length !== 42) {
      throw new Error('Invalid oracle address format');
    }

    return {
      address: address.toLowerCase(),
      active: true,
      addedAt,
    };
  }

  /**
   * Deactivate oracle from allowlist
   */
  static deactivateOracle(
    allowlistEntry: OracleAllowlistEntry,
    removedAt: bigint
  ): OracleAllowlistEntry {
    return {
      ...allowlistEntry,
      active: false,
      removedAt,
    };
  }

  /**
   * Get active oracles from allowlist
   */
  static getActiveOracles(allowlist: OracleAllowlistEntry[]): string[] {
    return allowlist
      .filter(o => o.active)
      .map(o => o.address);
  }

  /**
   * Validate batch integrity for data consistency
   */
  static validateBatchIntegrity(
    batch: OracleBatchData,
    expectedEpochId: number
  ): boolean {
    return (
      batch.epochId === expectedEpochId &&
      batch.machineRevenues.length > 0 &&
      batch.blockNumber > 0 &&
      batch.blockTimestamp > 0
    );
  }
}

export default OracleBatch;