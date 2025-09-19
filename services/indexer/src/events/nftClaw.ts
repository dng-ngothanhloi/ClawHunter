import { Interface } from 'ethers';
import { BaseEventHandler, ParsedEvent } from './base.js';
import { db } from '../db/client.js';
import logger from '../lib/logger.js';

export class NFTClawEventHandler extends BaseEventHandler {
  constructor(contractInterface: Interface) {
    super('NFTClaw', contractInterface);
  }

  protected async handleEventBatch(eventName: string, events: ParsedEvent[]): Promise<void> {
    switch (eventName) {
      case 'Transfer':
        await this.handleTransfer(events);
        break;
      case 'StakedL1':
        await this.handleStakedL1(events);
        break;
      case 'UnstakedL1':
        await this.handleUnstakedL1(events);
        break;
      default:
        logger.warn(`Unknown event type for NFTClaw: ${eventName}`);
    }
  }

  private async handleTransfer(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: Transfer(from, to, tokenId)
        const [from, to, tokenId] = event.args;
        
        // Skip mint/burn transactions (from/to zero address)
        if (from === '0x0000000000000000000000000000000000000000') {
          logger.info(`NFTClaw minted`, {
            to,
            tokenId: tokenId.toString(),
            txHash: event.txHash,
          });
        } else if (to === '0x0000000000000000000000000000000000000000') {
          logger.info(`NFTClaw burned`, {
            from,
            tokenId: tokenId.toString(),
            txHash: event.txHash,
          });
        } else {
          logger.info(`NFTClaw transfer`, {
            from,
            to,
            tokenId: tokenId.toString(),
            txHash: event.txHash,
          });
        }

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process Transfer event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async handleStakedL1(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: StakedL1(user, tokenId, machineId)
        const [user, tokenId, machineId] = event.args;
        
        logger.info(`NFTClaw staked for L1 rewards`, {
          user,
          tokenId: tokenId.toString(),
          machineId: machineId.toString(),
          txHash: event.txHash,
        });

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process StakedL1 event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async handleUnstakedL1(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: UnstakedL1(user, tokenId, machineId)
        const [user, tokenId, machineId] = event.args;
        
        logger.info(`NFTClaw unstaked from L1 rewards`, {
          user,
          tokenId: tokenId.toString(),
          machineId: machineId.toString(),
          txHash: event.txHash,
        });

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process UnstakedL1 event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }
}
