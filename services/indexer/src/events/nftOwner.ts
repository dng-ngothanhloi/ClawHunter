import { Interface } from 'ethers';
import { BaseEventHandler, ParsedEvent } from './base.js';
import { db } from '../db/client.js';
import logger from '../lib/logger.js';

export class NFTOwnerEventHandler extends BaseEventHandler {
  constructor(contractInterface: Interface) {
    super('NFTOwner', contractInterface);
  }

  protected async handleEventBatch(eventName: string, events: ParsedEvent[]): Promise<void> {
    switch (eventName) {
      case 'TransferSingle':
        await this.handleTransferSingle(events);
        break;
      case 'TransferBatch':
        await this.handleTransferBatch(events);
        break;
      case 'StakedL2':
        await this.handleStakedL2(events);
        break;
      case 'UnstakedL2':
        await this.handleUnstakedL2(events);
        break;
      default:
        logger.warn(`Unknown event type for NFTOwner: ${eventName}`);
    }
  }

  private async handleTransferSingle(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: TransferSingle(operator, from, to, id, value)
        const [operator, from, to, id, value] = event.args;
        
        // Skip mint/burn transactions (from/to zero address)
        if (from === '0x0000000000000000000000000000000000000000' || 
            to === '0x0000000000000000000000000000000000000000') {
          logger.debug(`NFTOwner mint/burn detected`, {
            from,
            to,
            tokenId: id.toString(),
            value: value.toString(),
            txHash: event.txHash,
          });
        } else {
          logger.info(`NFTOwner transfer`, {
            from,
            to,
            tokenId: id.toString(),
            value: value.toString(),
            operator,
            txHash: event.txHash,
          });
        }

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process TransferSingle event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async handleTransferBatch(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: TransferBatch(operator, from, to, ids, values)
        const [operator, from, to, ids, values] = event.args;
        
        logger.info(`NFTOwner batch transfer`, {
          from,
          to,
          tokenIds: ids.map((id: any) => id.toString()),
          values: values.map((value: any) => value.toString()),
          operator,
          txHash: event.txHash,
        });

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process TransferBatch event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async handleStakedL2(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: StakedL2(user, tokenId, machineId, shareBps)
        const [user, tokenId, machineId, shareBps] = event.args;
        
        logger.info(`NFTOwner staked for L2 rewards`, {
          user,
          tokenId: tokenId.toString(),
          machineId: machineId.toString(),
          shareBps: shareBps.toString(),
          txHash: event.txHash,
        });

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process StakedL2 event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async handleUnstakedL2(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        // Parse event arguments: UnstakedL2(user, tokenId, machineId)
        const [user, tokenId, machineId] = event.args;
        
        logger.info(`NFTOwner unstaked from L2 rewards`, {
          user,
          tokenId: tokenId.toString(),
          machineId: machineId.toString(),
          txHash: event.txHash,
        });

        await this.markEventProcessed(event);

      } catch (error) {
        logger.error('Failed to process UnstakedL2 event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }
}
