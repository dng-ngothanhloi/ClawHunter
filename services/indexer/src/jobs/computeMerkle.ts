import { db } from '../db/client.js';
import { MerkleTreeBuilder, MerkleLeafData } from '../lib/merkle.js';
import logger from '../lib/logger.js';

export interface MerkleComputationResult {
  epochId: bigint;
  alpha?: MerkleGroupResult;
  beta?: MerkleGroupResult;
  gamma?: MerkleGroupResult;
}

export interface MerkleGroupResult {
  group: string;
  root: string;
  leafCount: number;
  totalAmount: string;
  leaves: Array<{
    account: string;
    amount: string;
    leafHash: string;
    proof: string[];
  }>;
}

export class MerkleComputationJob {
  /**
   * Compute Merkle trees for all groups in an epoch
   */
  async execute(epochId: bigint): Promise<MerkleComputationResult> {
    logger.info(`Computing Merkle trees for epoch ${epochId}`);

    // Check if epoch exists
    const epoch = await db.revenueEpoch.findUnique({
      where: { epochId },
    });

    if (!epoch) {
      throw new Error(`Epoch ${epochId} not found`);
    }

    const result: MerkleComputationResult = { epochId };

    // Compute trees for each group in parallel
    const [alpha, beta, gamma] = await Promise.all([
      this.computeAlphaTree(epochId, epoch.alpha),
      this.computeBetaTree(epochId, epoch.beta),
      this.computeGammaTree(epochId, epoch.gamma),
    ]);

    if (alpha) result.alpha = alpha;
    if (beta) result.beta = beta;
    if (gamma) result.gamma = gamma;

    logger.info(`Merkle computation completed for epoch ${epochId}`, {
      alphaLeaves: alpha?.leafCount || 0,
      betaLeaves: beta?.leafCount || 0,
      gammaLeaves: gamma?.leafCount || 0,
    });

    return result;
  }

  /**
   * Compute Alpha tree (CHG Staking rewards)
   */
  private async computeAlphaTree(epochId: bigint, totalAmount: any): Promise<MerkleGroupResult | null> {
    logger.info(`Computing Alpha tree for epoch ${epochId}`);

    // Get staking snapshots for this epoch
    const stakingSnapshots = await db.stakingSnapshot.findMany({
      where: { epochId },
      orderBy: { account: 'asc' }, // Deterministic ordering
    });

    if (stakingSnapshots.length === 0) {
      logger.warn(`No staking snapshots found for epoch ${epochId}`);
      return null;
    }

    // Calculate total effective weight
    const totalEffectiveWeight = stakingSnapshots.reduce(
      (sum, snapshot) => sum + BigInt(snapshot.effectiveWeight),
      0n
    );

    if (totalEffectiveWeight === 0n) {
      logger.warn(`Total effective weight is zero for epoch ${epochId}`);
      return null;
    }

    // Calculate pro-rata rewards for each staker
    const totalAmountWei = BigInt(Math.floor(Number(totalAmount) * 1e6)); // Convert to 6-decimal precision
    const leaves: MerkleLeafData[] = [];

    for (const snapshot of stakingSnapshots) {
      const effectiveWeight = BigInt(snapshot.effectiveWeight);
      
      // Pro-rata calculation with floor division (as per spec)
      const rewardWei = (totalAmountWei * effectiveWeight) / totalEffectiveWeight;
      const rewardAmount = (Number(rewardWei) / 1e6).toFixed(6); // Convert back to USDT

      if (Number(rewardAmount) > 0) {
        leaves.push({
          account: snapshot.account,
          amount: rewardAmount,
          epochId: epochId.toString(),
          group: 'A',
        });
      }
    }

    return await this.buildAndStoreMerkleTree('A', epochId, totalAmount, leaves);
  }

  /**
   * Compute Beta tree (NFTClaw L1 rewards)
   */
  private async computeBetaTree(epochId: bigint, totalAmount: any): Promise<MerkleGroupResult | null> {
    logger.info(`Computing Beta tree for epoch ${epochId}`);

    // Get machine revenues for this epoch
    const machineRevenues = await db.machineRevenue.findMany({
      where: { epochId },
      orderBy: { machineId: 'asc' },
    });

    if (machineRevenues.length === 0) {
      logger.warn(`No machine revenues found for epoch ${epochId}`);
      return null;
    }

    // For Beta pool, rewards are distributed to NFTClaw stakers
    // This is a simplified implementation - in reality, we'd need to track who has staked their NFTClaw tokens
    const leaves: MerkleLeafData[] = [];
    
    // Placeholder: distribute equally among machine owners (this would come from actual staking data)
    const clawStakers = await this.getNFTClawStakers(epochId);
    
    if (clawStakers.length === 0) {
      logger.warn(`No NFTClaw stakers found for epoch ${epochId}`);
      return null;
    }

    const totalAmountWei = BigInt(Math.floor(Number(totalAmount) * 1e6));
    const rewardPerStaker = totalAmountWei / BigInt(clawStakers.length);
    const rewardAmount = (Number(rewardPerStaker) / 1e6).toFixed(6);

    for (const staker of clawStakers) {
      if (Number(rewardAmount) > 0) {
        leaves.push({
          account: staker.account,
          amount: rewardAmount,
          epochId: epochId.toString(),
          group: 'B',
        });
      }
    }

    return await this.buildAndStoreMerkleTree('B', epochId, totalAmount, leaves);
  }

  /**
   * Compute Gamma tree (NFTOwner L2 rewards)
   */
  private async computeGammaTree(epochId: bigint, totalAmount: any): Promise<MerkleGroupResult | null> {
    logger.info(`Computing Gamma tree for epoch ${epochId}`);

    // Get owner share snapshots for this epoch
    const ownerSnapshots = await db.ownerShareSnapshot.findMany({
      where: { epochId },
      orderBy: { account: 'asc' },
    });

    if (ownerSnapshots.length === 0) {
      logger.warn(`No owner share snapshots found for epoch ${epochId}`);
      return null;
    }

    // Group by account and sum effective shares
    const accountShares = new Map<string, number>();
    
    for (const snapshot of ownerSnapshots) {
      const account = snapshot.account;
      const currentShare = accountShares.get(account) || 0;
      accountShares.set(account, currentShare + Number(snapshot.effectiveShare));
    }

    // Calculate total shares
    const totalShares = Array.from(accountShares.values()).reduce((sum, share) => sum + share, 0);
    
    if (totalShares === 0) {
      logger.warn(`Total shares is zero for epoch ${epochId}`);
      return null;
    }

    // Calculate pro-rata rewards
    const totalAmountWei = BigInt(Math.floor(Number(totalAmount) * 1e6));
    const leaves: MerkleLeafData[] = [];

    for (const [account, shareAmount] of accountShares) {
      // Pro-rata calculation with floor division
      const rewardWei = (totalAmountWei * BigInt(Math.floor(shareAmount * 1e6))) / BigInt(Math.floor(totalShares * 1e6));
      const rewardAmount = (Number(rewardWei) / 1e6).toFixed(6);

      if (Number(rewardAmount) > 0) {
        leaves.push({
          account,
          amount: rewardAmount,
          epochId: epochId.toString(),
          group: 'G',
        });
      }
    }

    return await this.buildAndStoreMerkleTree('G', epochId, totalAmount, leaves);
  }

  /**
   * Build Merkle tree and store in database
   */
  private async buildAndStoreMerkleTree(
    group: string,
    epochId: bigint,
    totalAmount: any,
    leaves: MerkleLeafData[]
  ): Promise<MerkleGroupResult | null> {
    if (leaves.length === 0) {
      logger.warn(`No leaves to build Merkle tree for group ${group}, epoch ${epochId}`);
      return null;
    }

    try {
      // Build Merkle tree
      const { tree, root, proofs } = MerkleTreeBuilder.buildTree(leaves);
      const totalCalculated = MerkleTreeBuilder.calculateTotal(leaves);

      // Store Merkle root
      await db.merkleRoot.upsert({
        where: {
          epochId_group: { epochId, group },
        },
        update: {
          root,
          total: Number(totalAmount),
          leafCount: leaves.length,
          published: false,
          publishedTx: null,
          updatedAt: new Date(),
        },
        create: {
          epochId,
          group,
          root,
          total: Number(totalAmount),
          leafCount: leaves.length,
          published: false,
        },
      });

      // Store Merkle leaves with proofs
      const leafData = leaves.map((leaf) => {
        const leafHash = MerkleTreeBuilder.createLeafHash(leaf);
        const proof = proofs[leaf.account] || [];

        return {
          epochId,
          group,
          account: leaf.account,
          amount: Number(leaf.amount),
          leafHash,
          proof: JSON.stringify(proof),
          claimed: false,
        };
      });

      // Batch insert leaves
      for (const leaf of leafData) {
        await db.merkleLeaf.upsert({
          where: {
            epochId_group_account: {
              epochId: leaf.epochId,
              group: leaf.group,
              account: leaf.account,
            },
          },
          update: {
            amount: leaf.amount,
            leafHash: leaf.leafHash,
            proof: leaf.proof,
            claimed: false,
            claimedTx: null,
            claimedAt: null,
            updatedAt: new Date(),
          },
          create: leaf,
        });
      }

      logger.info(`Built and stored Merkle tree for group ${group}`, {
        epochId: epochId.toString(),
        root,
        leafCount: leaves.length,
        totalAmount: Number(totalAmount),
        totalCalculated: Number(totalCalculated) / 1e6,
      });

      return {
        group,
        root,
        leafCount: leaves.length,
        totalAmount: totalAmount.toString(),
        leaves: leafData.map(leaf => ({
          account: leaf.account,
          amount: leaf.amount.toString(),
          leafHash: leaf.leafHash,
          proof: JSON.parse(leaf.proof),
        })),
      };

    } catch (error) {
      logger.error(`Failed to build Merkle tree for group ${group}:`, error);
      throw error;
    }
  }

  /**
   * Get NFTClaw stakers (placeholder implementation)
   */
  private async getNFTClawStakers(epochId: bigint): Promise<Array<{ account: string; tokenId: number }>> {
    // This is a placeholder - in a real implementation, we would track NFTClaw staking from events
    // For now, return sample stakers based on our test data
    
    const sampleStakers = [];
    for (let i = 1; i <= 10; i++) {
      sampleStakers.push({
        account: `0x${i.toString().padStart(40, '0')}`,
        tokenId: i,
      });
    }
    
    return sampleStakers;
  }
}

export default MerkleComputationJob;
