import { Interface } from 'ethers';
import { BaseEventHandler, ParsedEvent } from './base.js';
import { db } from '../db/client.js';
import logger from '../lib/logger.js';

export class RevenueSplitterEventHandler extends BaseEventHandler {
  constructor(contractInterface: Interface) {
    super('RevenueSplitter', contractInterface);
  }

  protected async handleEventBatch(eventName: string, events: ParsedEvent[]): Promise<void> {
    switch (eventName) {
      case 'RevenueSplit':
        await this.handleRevenueSplit(events);
        break;
      case 'MerkleRootSet':
        await this.handleMerkleRootSet(events);
        break;
      default:
        logger.warn(`Unknown event type for RevenueSplitter: ${eventName}`);
    }
  }

  private async handleRevenueSplit(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: RevenueSplit(epochId, toOPC, toAlpha, toBeta, toGamma, toDelta)
        const [epochId, toOPC, toAlpha, toBeta, toGamma, toDelta] = event.args;
        
        // Convert from wei to USDT (6 decimals)
        const opcAmount = Number(toOPC) / 1e6;
        const alphaAmount = Number(toAlpha) / 1e6;
        const betaAmount = Number(toBeta) / 1e6;
        const gammaAmount = Number(toGamma) / 1e6;
        const deltaAmount = Number(toDelta) / 1e6;
        const totalAmount = opcAmount + alphaAmount + betaAmount + gammaAmount + deltaAmount;

        // Update revenue epoch with actual split amounts
        await db.revenueEpoch.update({
          where: { epochId: BigInt(epochId) },
          data: {
            opc: opcAmount,
            alpha: alphaAmount,
            beta: betaAmount,
            gamma: gammaAmount,
            delta: deltaAmount,
            updatedAt: new Date(),
          },
        });

        await this.markEventProcessed(event);
        
        logger.info(`Processed RevenueSplit event`, {
          epochId: epochId.toString(),
          total: totalAmount,
          opc: opcAmount,
          alpha: alphaAmount,
          beta: betaAmount,
          gamma: gammaAmount,
          delta: deltaAmount,
          txHash: event.txHash,
        });

      } catch (error) {
        logger.error('Failed to process RevenueSplit event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async handleMerkleRootSet(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: MerkleRootSet(epochId, group, root)
        const [epochId, group, root] = event.args;
        
        // Convert group number to letter
        const groupMap: Record<number, string> = {
          0: 'A', // Alpha (CHG Staking)
          1: 'B', // Beta (NFTClaw L1)
          2: 'G', // Gamma (NFTOwner L2)
        };
        
        const groupLetter = groupMap[Number(group)] || group.toString();

        // Update merkle root as published
        await db.merkleRoot.updateMany({
          where: {
            epochId: BigInt(epochId),
            group: groupLetter,
          },
          data: {
            published: true,
            publishedTx: event.txHash,
            updatedAt: new Date(),
          },
        });

        await this.markEventProcessed(event);
        
        logger.info(`Processed MerkleRootSet event`, {
          epochId: epochId.toString(),
          group: groupLetter,
          root,
          txHash: event.txHash,
        });

      } catch (error) {
        logger.error('Failed to process MerkleRootSet event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }
}
