import { Interface } from 'ethers';
import { BaseEventHandler, ParsedEvent } from './base.js';
import { db } from '../db/client.js';
import logger from '../lib/logger.js';

export class CHGStakingEventHandler extends BaseEventHandler {
  constructor(contractInterface: Interface) {
    super('CHGStaking', contractInterface);
  }

  protected async handleEventBatch(eventName: string, events: ParsedEvent[]): Promise<void> {
    switch (eventName) {
      case 'Staked':
        await this.handleStaked(events);
        break;
      case 'Unstaked':
        await this.handleUnstaked(events);
        break;
      case 'Claimed':
        await this.handleClaimed(events);
        break;
      case 'RewardAccrued':
        await this.handleRewardAccrued(events);
        break;
      default:
        logger.warn(`Unknown event type for CHGStaking: ${eventName}`);
    }
  }

  private async handleStaked(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: Staked(user, amount, lockDuration, weight)
        const [user, amount, lockDuration, weight] = event.args;
        
        // Calculate lock expiration
        const blockTimestamp = await this.getBlockTimestamp(event.blockNumber);
        const lockUntil = new Date((blockTimestamp + Number(lockDuration)) * 1000);
        
        logger.info(`CHG Staked`, {
          user,
          amount: amount.toString(),
          lockDuration: lockDuration.toString(),
          weight: weight.toString(),
          lockUntil: lockUntil.toISOString(),
          txHash: event.txHash,
        });

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process Staked event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async handleUnstaked(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: Unstaked(user, amount)
        const [user, amount] = event.args;
        
        logger.info(`CHG Unstaked`, {
          user,
          amount: amount.toString(),
          txHash: event.txHash,
        });

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process Unstaked event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async handleClaimed(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: Claimed(user, epochId, amount)
        const [user, epochId, amount] = event.args;
        
        // Update merkle leaf as claimed
        await db.merkleLeaf.updateMany({
          where: {
            epochId: BigInt(epochId),
            group: 'A', // Alpha group for CHG staking
            account: user.toLowerCase(),
          },
          data: {
            claimed: true,
            claimedTx: event.txHash,
            claimedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        logger.info(`CHG Staking reward claimed`, {
          user,
          epochId: epochId.toString(),
          amount: amount.toString(),
          txHash: event.txHash,
        });

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process Claimed event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async handleRewardAccrued(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: RewardAccrued(user, epochId, amount)
        const [user, epochId, amount] = event.args;
        
        logger.info(`CHG Staking reward accrued`, {
          user,
          epochId: epochId.toString(),
          amount: amount.toString(),
          txHash: event.txHash,
        });

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process RewardAccrued event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async getBlockTimestamp(blockNumber: number): Promise<number> {
    const contractManager = (await import('../contracts.js')).getContractManager();
    return await contractManager.getBlockTimestamp(blockNumber);
  }
}
