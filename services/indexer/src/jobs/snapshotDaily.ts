import { db } from '../db/client.js';
import { getContractManager } from '../contracts.js';
import logger from '../lib/logger.js';
import config from '../config.js';

export interface SnapshotResult {
  epochId: bigint;
  stakingSnapshots: number;
  ownerSnapshots: number;
  totalStakers: number;
  totalOwners: number;
  totalStakedCHG: string;
  totalOwnerShares: number;
}

export class DailySnapshotJob {
  private contractManager = getContractManager();

  async execute(epochId?: bigint): Promise<SnapshotResult> {
    const currentEpochId = epochId || BigInt(this.getCurrentEpochId());
    
    logger.info(`Starting daily snapshot for epoch ${currentEpochId}`);

    // Take snapshots in parallel
    const [stakingSnapshots, ownerSnapshots] = await Promise.all([
      this.takeStakingSnapshots(currentEpochId),
      this.takeOwnerShareSnapshots(currentEpochId),
    ]);

    const result: SnapshotResult = {
      epochId: currentEpochId,
      stakingSnapshots: stakingSnapshots.count,
      ownerSnapshots: ownerSnapshots.count,
      totalStakers: stakingSnapshots.totalStakers,
      totalOwners: ownerSnapshots.totalOwners,
      totalStakedCHG: stakingSnapshots.totalStaked,
      totalOwnerShares: ownerSnapshots.totalShares,
    };

    logger.info(`Daily snapshot completed for epoch ${currentEpochId}`, result);
    return result;
  }

  /**
   * Take snapshots of CHG staking positions
   */
  private async takeStakingSnapshots(epochId: bigint): Promise<{
    count: number;
    totalStakers: number;
    totalStaked: string;
  }> {
    logger.info(`Taking CHG staking snapshots for epoch ${epochId}`);

    try {
      await this.contractManager.initialize();
      const chgStakingContract = this.contractManager.getContract('CHGStaking').contract;

      // Get all unique stakers (this would need to be tracked from events in a real implementation)
      // For now, we'll use a placeholder approach
      const stakers = await this.getActiveStakers();
      
      let snapshotCount = 0;
      let totalStaked = 0n;

      for (const staker of stakers) {
        try {
          // Get staker's position details
          const positions = await chgStakingContract.getUserPositions(staker);
          
          if (positions.length === 0) {
            continue;
          }

          // Sum all positions for this staker
          let stakerTotal = 0n;
          let weightedTotal = 0n;
          let maxLockUntil: Date | null = null;

          for (const position of positions) {
            const amount = BigInt(position.amount);
            const weight = Number(position.weight);
            const lockUntil = new Date(Number(position.lockUntil) * 1000);

            stakerTotal += amount;
            weightedTotal += amount * BigInt(weight);
            
            if (!maxLockUntil || lockUntil > maxLockUntil) {
              maxLockUntil = lockUntil;
            }
          }

          if (stakerTotal > 0n) {
            // Calculate average weight
            const avgWeight = Number(weightedTotal / stakerTotal);

            // Store snapshot
            await db.stakingSnapshot.upsert({
              where: {
                epochId_account: {
                  epochId,
                  account: staker.toLowerCase(),
                },
              },
              update: {
                amount: stakerTotal.toString(),
                weight: avgWeight,
                effectiveWeight: weightedTotal.toString(),
                lockUntil: maxLockUntil,
              },
              create: {
                epochId,
                account: staker.toLowerCase(),
                amount: stakerTotal.toString(),
                weight: avgWeight,
                effectiveWeight: weightedTotal.toString(),
                lockUntil: maxLockUntil,
              },
            });

            totalStaked += stakerTotal;
            snapshotCount++;
          }
        } catch (error) {
          logger.warn(`Failed to snapshot staker ${staker}:`, error);
        }
      }

      logger.info(`Created ${snapshotCount} staking snapshots`, {
        totalStaked: totalStaked.toString(),
        totalStakers: stakers.length,
      });

      return {
        count: snapshotCount,
        totalStakers: stakers.length,
        totalStaked: totalStaked.toString(),
      };

    } catch (error) {
      logger.error('Failed to take staking snapshots:', error);
      throw error;
    }
  }

  /**
   * Take snapshots of NFTOwner share positions
   */
  private async takeOwnerShareSnapshots(epochId: bigint): Promise<{
    count: number;
    totalOwners: number;
    totalShares: number;
  }> {
    logger.info(`Taking NFTOwner share snapshots for epoch ${epochId}`);

    try {
      await this.contractManager.initialize();
      const nftOwnerContract = this.contractManager.getContract('NFTOwner').contract;

      // Get all unique owners and their tokens
      const owners = await this.getActiveOwners();
      
      let snapshotCount = 0;
      let totalShares = 0;

      for (const owner of owners) {
        try {
          // Get owner's tokens (this would need to be tracked from events)
          const tokens = await this.getOwnerTokens(owner.account);
          
          for (const tokenData of tokens) {
            const { tokenId, machineId } = tokenData;
            
            // Get current balance
            const balance = await nftOwnerContract.balanceOf(owner.account, tokenId);
            
            if (balance > 0) {
              // Get share basis points from metadata or contract
              const shareBps = await this.getTokenShareBps(tokenId);
              
              // Calculate effective share amount
              const effectiveShare = (Number(balance) * shareBps) / 10000;

              await db.ownerShareSnapshot.upsert({
                where: {
                  epochId_account_machineId: {
                    epochId,
                    account: owner.account.toLowerCase(),
                    machineId: BigInt(machineId),
                  },
                },
                update: {
                  shareBps,
                  effectiveShare,
                },
                create: {
                  epochId,
                  account: owner.account.toLowerCase(),
                  machineId: BigInt(machineId),
                  shareBps,
                  effectiveShare,
                },
              });

              totalShares += shareBps;
              snapshotCount++;
            }
          }
        } catch (error) {
          logger.warn(`Failed to snapshot owner ${owner.account}:`, error);
        }
      }

      logger.info(`Created ${snapshotCount} owner share snapshots`, {
        totalShares,
        totalOwners: owners.length,
      });

      return {
        count: snapshotCount,
        totalOwners: owners.length,
        totalShares,
      };

    } catch (error) {
      logger.error('Failed to take owner share snapshots:', error);
      throw error;
    }
  }

  /**
   * Get current epoch ID based on timestamp
   */
  private getCurrentEpochId(): number {
    // Daily epochs: epoch 0 = 2025-01-01 00:00:00 UTC
    const epochStart = new Date('2025-01-01T00:00:00Z').getTime();
    const now = new Date().getTime();
    const daysSinceEpochStart = Math.floor((now - epochStart) / (24 * 60 * 60 * 1000));
    return Math.max(0, daysSinceEpochStart);
  }

  /**
   * Get active stakers from database (tracked from events)
   */
  private async getActiveStakers(): Promise<string[]> {
    // This is a placeholder - in a real implementation, we would track stakers from Staked events
    // and remove them when they fully unstake
    
    // For now, return empty array - this would be populated from event processing
    const stakers = await db.$queryRaw<Array<{ account: string }>>`
      SELECT DISTINCT account FROM staking_snapshots 
      WHERE epochId = (SELECT MAX(epochId) FROM staking_snapshots)
      AND amount > 0
    `;
    
    return stakers.map(s => s.account);
  }

  /**
   * Get active owners from database (tracked from events)
   */
  private async getActiveOwners(): Promise<Array<{ account: string }>> {
    // This is a placeholder - in a real implementation, we would track owners from Transfer events
    
    const owners = await db.$queryRaw<Array<{ account: string }>>`
      SELECT DISTINCT account FROM owner_share_snapshots 
      WHERE epochId = (SELECT MAX(epochId) FROM owner_share_snapshots)
      AND effectiveShare > 0
    `;
    
    return owners;
  }

  /**
   * Get tokens owned by an account
   */
  private async getOwnerTokens(account: string): Promise<Array<{ tokenId: number; machineId: number }>> {
    // This is a placeholder - in a real implementation, we would track token ownership from Transfer events
    // For now, return sample data based on our seed data
    
    // Return tokens 1-100 with corresponding machine IDs
    const tokens: Array<{ tokenId: number; machineId: number }> = [];
    for (let i = 1; i <= 100; i++) {
      tokens.push({ tokenId: i, machineId: i });
    }
    
    return tokens;
  }

  /**
   * Get share basis points for a token
   */
  private async getTokenShareBps(tokenId: number): Promise<number> {
    // This is a placeholder - in a real implementation, this would come from metadata or contract
    // For now, return a sample value (1% = 100 bps)
    return 100; // 1% share
  }
}

export default DailySnapshotJob;
