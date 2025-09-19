import { db } from '../db/client.js';
import { getContractManager } from '../contracts.js';
import logger from '../lib/logger.js';
import config from '../config.js';

export interface PublishResult {
  epochId: bigint;
  group: string;
  root: string;
  txHash: string;
  gasUsed: string;
  success: boolean;
  error?: string;
}

export class PublishRootsJob {
  private contractManager = getContractManager();

  /**
   * Publish Merkle root for a specific group and epoch
   */
  async publishRoot(epochId: bigint, group: string): Promise<PublishResult> {
    logger.info(`Publishing Merkle root for epoch ${epochId}, group ${group}`);

    try {
      await this.contractManager.initialize();
      
      // Get Merkle root from database
      const merkleRoot = await db.merkleRoot.findUnique({
        where: {
          epochId_group: { epochId, group },
        },
      });

      if (!merkleRoot) {
        throw new Error(`Merkle root not found for epoch ${epochId}, group ${group}`);
      }

      if (merkleRoot.published) {
        logger.info(`Merkle root already published for epoch ${epochId}, group ${group}`);
        return {
          epochId,
          group,
          root: merkleRoot.root,
          txHash: merkleRoot.publishedTx || '',
          gasUsed: '0',
          success: true,
        };
      }

      // Get RevenueSplitter contract with signer
      const revenueSplitterContract = this.contractManager.getContractWithSigner('RevenueSplitter');
      
      if (!revenueSplitterContract) {
        throw new Error('RevenueSplitter contract not available or no signer configured');
      }

      // Convert group letter to number for contract call
      const groupNumber = this.groupToNumber(group);
      
      // Call setMerkleRoot on the contract
      logger.info(`Calling setMerkleRoot(${epochId}, ${groupNumber}, ${merkleRoot.root})`);
      
      const tx = await revenueSplitterContract.setMerkleRoot(
        epochId,
        groupNumber,
        merkleRoot.root
      );

      logger.info(`Merkle root transaction submitted`, {
        txHash: tx.hash,
        epochId: epochId.toString(),
        group,
        root: merkleRoot.root,
      });

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      if (!receipt) {
        throw new Error('Transaction receipt not available');
      }

      // Update database with published status
      await db.merkleRoot.update({
        where: {
          epochId_group: { epochId, group },
        },
        data: {
          published: true,
          publishedTx: receipt.hash,
          updatedAt: new Date(),
        },
      });

      const result: PublishResult = {
        epochId,
        group,
        root: merkleRoot.root,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
        success: true,
      };

      logger.info(`Merkle root published successfully`, result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to publish Merkle root for epoch ${epochId}, group ${group}:`, error);

      return {
        epochId,
        group,
        root: '',
        txHash: '',
        gasUsed: '0',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Publish all unpublished Merkle roots for an epoch
   */
  async publishEpochRoots(epochId: bigint): Promise<PublishResult[]> {
    logger.info(`Publishing all Merkle roots for epoch ${epochId}`);

    // Get all unpublished roots for this epoch
    const unpublishedRoots = await db.merkleRoot.findMany({
      where: {
        epochId,
        published: false,
      },
      orderBy: { group: 'asc' },
    });

    if (unpublishedRoots.length === 0) {
      logger.info(`No unpublished Merkle roots found for epoch ${epochId}`);
      return [];
    }

    const results: PublishResult[] = [];

    // Publish roots sequentially to avoid nonce conflicts
    for (const root of unpublishedRoots) {
      try {
        const result = await this.publishRoot(epochId, root.group);
        results.push(result);

        // Small delay between transactions
        await this.sleep(2000);
      } catch (error) {
        logger.error(`Failed to publish root for group ${root.group}:`, error);
        results.push({
          epochId,
          group: root.group,
          root: root.root,
          txHash: '',
          gasUsed: '0',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`Published ${successCount}/${results.length} Merkle roots for epoch ${epochId}`);

    return results;
  }

  /**
   * Get all epochs with unpublished Merkle roots
   */
  async getEpochsWithUnpublishedRoots(): Promise<bigint[]> {
    const epochs = await db.merkleRoot.findMany({
      where: { published: false },
      select: { epochId: true },
      distinct: ['epochId'],
      orderBy: { epochId: 'asc' },
    });

    return epochs.map(e => e.epochId);
  }

  /**
   * Publish all unpublished Merkle roots across all epochs
   */
  async publishAllPending(): Promise<Record<string, PublishResult[]>> {
    logger.info('Publishing all pending Merkle roots');

    const epochs = await this.getEpochsWithUnpublishedRoots();
    
    if (epochs.length === 0) {
      logger.info('No pending Merkle roots to publish');
      return {};
    }

    const results: Record<string, PublishResult[]> = {};

    for (const epochId of epochs) {
      try {
        results[epochId.toString()] = await this.publishEpochRoots(epochId);
        
        // Delay between epochs
        await this.sleep(5000);
      } catch (error) {
        logger.error(`Failed to publish roots for epoch ${epochId}:`, error);
        results[epochId.toString()] = [];
      }
    }

    const totalResults = Object.values(results).flat();
    const totalSuccess = totalResults.filter(r => r.success).length;
    
    logger.info(`Published ${totalSuccess}/${totalResults.length} Merkle roots across ${epochs.length} epochs`);
    
    return results;
  }

  /**
   * Check if oracle signer has permission to publish roots
   */
  async checkOraclePermissions(): Promise<boolean> {
    try {
      await this.contractManager.initialize();
      
      const signer = this.contractManager.getSigner();
      if (!signer) {
        logger.error('No signer available for oracle operations');
        return false;
      }

      const signerAddress = await signer.getAddress();
      logger.info(`Checking oracle permissions for ${signerAddress}`);

      // Check if signer is authorized (this would depend on the actual contract implementation)
      // For now, we'll assume it's authorized if we have a signer
      return true;

    } catch (error) {
      logger.error('Failed to check oracle permissions:', error);
      return false;
    }
  }

  /**
   * Convert group letter to number for contract calls
   */
  private groupToNumber(group: string): number {
    const groupMap: Record<string, number> = {
      'A': 0, // Alpha (CHG Staking)
      'B': 1, // Beta (NFTClaw L1)
      'G': 2, // Gamma (NFTOwner L2)
    };

    const groupNumber = groupMap[group.toUpperCase()];
    if (groupNumber === undefined) {
      throw new Error(`Invalid group: ${group}`);
    }

    return groupNumber;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default PublishRootsJob;
