import { ethers } from 'ethers';
import { db } from '../config/database.js';
import { getContract, blockchain } from '../config/blockchain.js';
import logger from '../config/logger.js';

export interface ClaimTransactionData {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface ClaimPreparationRequest {
  beneficiary: string;
  epochIds: number[];
  groups?: string[];
}

export interface ClaimPreparationResponse {
  beneficiary: string;
  totalClaimable: string;
  claimCount: number;
  gasEstimate: {
    gasLimit: string;
    gasPrice: string;
    gasCostUSD: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  transactionData: ClaimTransactionData;
  claims: Array<{
    epochId: string;
    group: string;
    amount: string;
    proof: string[];
  }>;
  merkleRoots: Array<{
    epochId: string;
    group: string;
    root: string;
    published: boolean;
  }>;
  validUntil: string; // Timestamp when this preparation expires
}

export class ClaimTransactionService {
  private claimProcessorContract: ethers.Contract;
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.provider = blockchain.getProvider();
    this.claimProcessorContract = getContract('ClaimProcessor') || new ethers.Contract('0x0000000000000000000000000000000000000000', [], this.provider);
  }

  /**
   * Prepare claim transaction with gas estimation and validation
   */
  async prepareClaim(request: ClaimPreparationRequest): Promise<ClaimPreparationResponse> {
    logger.info(`Preparing claim for ${request.beneficiary}`, {
      epochIds: request.epochIds,
      groups: request.groups,
    });

    // 1. Validate and fetch claimable rewards
    const claims = await this.fetchValidClaims(request);
    
    if (claims.length === 0) {
      throw new Error('No claimable rewards found for the specified criteria');
    }

    // 2. Validate Merkle proofs
    await this.validateMerkleProofs(claims);

    // 3. Prepare transaction data
    const transactionData = await this.buildClaimTransaction(claims);

    // 4. Estimate gas costs
    const gasEstimate = await this.estimateGasCosts(transactionData);

    // 5. Calculate totals
    const totalClaimable = claims.reduce((sum, claim) => 
      sum + BigInt(claim.amount.toString()), BigInt(0)
    ).toString();

    // 6. Get Merkle roots info
    const merkleRoots = await this.getMerkleRootsInfo(claims);

    return {
      beneficiary: request.beneficiary,
      totalClaimable,
      claimCount: claims.length,
      gasEstimate,
      transactionData: {
        ...transactionData,
        gasLimit: gasEstimate.gasLimit,
        gasPrice: gasEstimate.gasPrice,
        maxFeePerGas: gasEstimate.maxFeePerGas,
        maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas,
      },
      claims: claims.map(claim => ({
        epochId: claim.epochId.toString(),
        group: claim.group,
        amount: claim.amount.toString(),
        proof: typeof claim.proof === 'string' ? JSON.parse(claim.proof) : claim.proof,
      })),
      merkleRoots,
      validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // Valid for 10 minutes
    };
  }

  /**
   * Fetch valid claims for the request
   */
  private async fetchValidClaims(request: ClaimPreparationRequest) {
    const whereClause: any = {
      account: request.beneficiary.toLowerCase(),
      epochId: { in: request.epochIds.map(id => BigInt(id)) },
      claimed: false,
    };

    if (request.groups && request.groups.length > 0) {
      whereClause.group = { in: request.groups };
    }

    const claims = await db.merkleLeaf.findMany({
      where: whereClause,
      include: {
        merkleRoot: true,
      },
      orderBy: [
        { epochId: 'asc' },
        { group: 'asc' },
      ],
    });

    // Filter only claims with published Merkle roots
    return claims.filter(claim => 
      claim.merkleRoot && claim.merkleRoot.published
    );
  }

  /**
   * Validate Merkle proofs against contract state
   */
  private async validateMerkleProofs(claims: any[]) {
    for (const claim of claims) {
      const proof = typeof claim.proof === 'string' 
        ? JSON.parse(claim.proof) 
        : claim.proof;

      const leafHash = claim.leafHash;
      const root = claim.merkleRoot.root;

      // Verify proof using ethers MerkleTree utilities
      const isValid = this.verifyMerkleProof(proof, leafHash, root);
      
      if (!isValid) {
        throw new Error(`Invalid Merkle proof for claim: epoch ${claim.epochId}, group ${claim.group}`);
      }
    }

    logger.info(`Validated ${claims.length} Merkle proofs successfully`);
  }

  /**
   * Build claim transaction data
   */
  private async buildClaimTransaction(claims: any[]): Promise<Omit<ClaimTransactionData, 'gasLimit' | 'gasPrice' | 'maxFeePerGas' | 'maxPriorityFeePerGas'>> {
    // Group claims by epoch and group for batch processing
    const claimsByEpochGroup = claims.reduce((acc, claim) => {
      const key = `${claim.epochId}-${claim.group}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(claim);
      return acc;
    }, {} as Record<string, any[]>);

    // Prepare batch claim data
    const batchClaims = Object.values(claimsByEpochGroup).map((groupClaims: any) => {
      const firstClaim = groupClaims[0];
      return {
        epochId: firstClaim.epochId,
        group: this.getGroupNumber(firstClaim.group),
        beneficiaries: groupClaims.map((c: any) => c.account),
        amounts: groupClaims.map((c: any) => c.amount),
        proofs: groupClaims.map((c: any) => 
          typeof c.proof === 'string' ? JSON.parse(c.proof) : c.proof
        ),
      };
    });

    // Encode function call
    const functionData = this.claimProcessorContract.interface.encodeFunctionData(
      'batchClaim',
      [batchClaims]
    );

    return {
      to: await this.claimProcessorContract.getAddress(),
      data: functionData,
      value: '0', // No ETH value needed for claims
    };
  }

  /**
   * Estimate gas costs for the transaction
   */
  private async estimateGasCosts(transactionData: Omit<ClaimTransactionData, 'gasLimit' | 'gasPrice' | 'maxFeePerGas' | 'maxPriorityFeePerGas'>) {
    try {
      // Estimate gas limit
      const gasLimit = await this.provider.estimateGas({
        to: transactionData.to,
        data: transactionData.data,
        value: transactionData.value,
      });

      // Get current gas price
      const feeData = await this.provider.getFeeData();
      
      const gasPrice = feeData.gasPrice || BigInt(0);
      const maxFeePerGas = feeData.maxFeePerGas;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;

      // Add 20% buffer to gas limit
      const bufferedGasLimit = (gasLimit * BigInt(120)) / BigInt(100);

      // Calculate cost in USD (assuming ETH price - this should be fetched from oracle)
      const ethPriceUSD = 2000; // Placeholder - should fetch from price oracle
      const gasCostETH = Number(bufferedGasLimit * gasPrice) / 1e18;
      const gasCostUSD = (gasCostETH * ethPriceUSD).toFixed(2);

      return {
        gasLimit: bufferedGasLimit.toString(),
        gasPrice: gasPrice.toString(),
        gasCostUSD,
        maxFeePerGas: maxFeePerGas?.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas?.toString(),
      };
    } catch (error) {
      logger.error('Gas estimation failed:', error);
      
      // Fallback gas estimates
      return {
        gasLimit: '500000', // Conservative estimate
        gasPrice: '20000000000', // 20 gwei
        gasCostUSD: '20.00', // Conservative estimate
      };
    }
  }

  /**
   * Get Merkle roots information for claims
   */
  private async getMerkleRootsInfo(claims: any[]) {
    const uniqueRoots = new Map();
    
    claims.forEach(claim => {
      const key = `${claim.epochId}-${claim.group}`;
      if (!uniqueRoots.has(key)) {
        uniqueRoots.set(key, {
          epochId: claim.epochId.toString(),
          group: claim.group,
          root: claim.merkleRoot.root,
          published: claim.merkleRoot.published,
        });
      }
    });

    return Array.from(uniqueRoots.values());
  }

  /**
   * Verify Merkle proof
   */
  private verifyMerkleProof(proof: string[], leaf: string, root: string): boolean {
    let computedHash = leaf;

    for (const proofElement of proof) {
      if (computedHash <= proofElement) {
        computedHash = ethers.keccak256(
          ethers.solidityPacked(['bytes32', 'bytes32'], [computedHash, proofElement])
        );
      } else {
        computedHash = ethers.keccak256(
          ethers.solidityPacked(['bytes32', 'bytes32'], [proofElement, computedHash])
        );
      }
    }

    return computedHash === root;
  }

  /**
   * Convert group letter to number
   */
  private getGroupNumber(group: string): number {
    const groupMap: Record<string, number> = {
      'A': 1, // Alpha (CHG Staking)
      'B': 2, // Beta (NFTClaw L1)
      'G': 3, // Gamma (NFTOwner L2)
    };
    return groupMap[group] || 0;
  }
}
