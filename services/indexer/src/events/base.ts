import { Log, Interface } from 'ethers';
import { db } from '../db/client.js';
import logger from '../lib/logger.js';

export interface ParsedEvent {
  name: string;
  args: any[];
  signature: string;
  topic: string;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  contractAddress: string;
}

export abstract class BaseEventHandler {
  protected contractName: string;
  protected contractInterface: Interface;

  constructor(contractName: string, contractInterface: Interface) {
    this.contractName = contractName;
    this.contractInterface = contractInterface;
  }

  /**
   * Parse raw log into structured event data
   */
  parseLog(log: Log): ParsedEvent | null {
    try {
      const parsed = this.contractInterface.parseLog({
        topics: log.topics,
        data: log.data,
      });

      if (!parsed) {
        return null;
      }

      return {
        name: parsed.name,
        args: parsed.args,
        signature: parsed.signature,
        topic: parsed.topic || log.topics[0],
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
        logIndex: log.index,
        contractAddress: log.address,
      };
    } catch (error) {
      logger.warn(`Failed to parse log for ${this.contractName}:`, {
        error: error instanceof Error ? error.message : error,
        log,
      });
      return null;
    }
  }

  /**
   * Process a batch of logs
   */
  async processLogs(logs: Log[]): Promise<void> {
    const events: ParsedEvent[] = [];

    // Parse all logs
    for (const log of logs) {
      const event = this.parseLog(log);
      if (event) {
        events.push(event);
      }
    }

    if (events.length === 0) {
      return;
    }

    logger.info(`Processing ${events.length} ${this.contractName} events`);

    // Group events by type
    const eventGroups = events.reduce((groups, event) => {
      if (!groups[event.name]) {
        groups[event.name] = [];
      }
      groups[event.name].push(event);
      return groups;
    }, {} as Record<string, ParsedEvent[]>);

    // Process each event type
    for (const [eventName, eventList] of Object.entries(eventGroups)) {
      try {
        await this.handleEventBatch(eventName, eventList);
        logger.debug(`Processed ${eventList.length} ${eventName} events`);
      } catch (error) {
        logger.error(`Failed to process ${eventName} events:`, error);
        
        // Log individual events that failed
        for (const event of eventList) {
          await this.logEventError(event, error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  /**
   * Handle a batch of events of the same type
   * Must be implemented by subclasses
   */
  protected abstract handleEventBatch(eventName: string, events: ParsedEvent[]): Promise<void>;

  /**
   * Log event processing error to database
   */
  protected async logEventError(event: ParsedEvent, error: string): Promise<void> {
    try {
      await db.eventLog.upsert({
        where: {
          txHash_logIndex: {
            txHash: event.txHash,
            logIndex: event.logIndex,
          },
        },
        update: {
          error,
          processed: false,
          updatedAt: new Date(),
        },
        create: {
          contractName: this.contractName,
          eventName: event.name,
          blockNumber: BigInt(event.blockNumber),
          txHash: event.txHash,
          logIndex: event.logIndex,
          processed: false,
          data: event.args,
          error,
        },
      });
    } catch (dbError) {
      logger.error('Failed to log event error to database:', dbError);
    }
  }

  /**
   * Mark event as successfully processed
   */
  protected async markEventProcessed(event: ParsedEvent): Promise<void> {
    try {
      await db.eventLog.upsert({
        where: {
          txHash_logIndex: {
            txHash: event.txHash,
            logIndex: event.logIndex,
          },
        },
        update: {
          processed: true,
          error: null,
          updatedAt: new Date(),
        },
        create: {
          contractName: this.contractName,
          eventName: event.name,
          blockNumber: BigInt(event.blockNumber),
          txHash: event.txHash,
          logIndex: event.logIndex,
          processed: true,
          data: event.args,
        },
      });
    } catch (error) {
      logger.error('Failed to mark event as processed:', error);
    }
  }

  /**
   * Get the last processed block for this contract
   */
  async getLastProcessedBlock(): Promise<number> {
    try {
      const checkpoint = await db.indexerCheckpoint.findUnique({
        where: { contractName: this.contractName },
      });
      return checkpoint ? Number(checkpoint.lastProcessedBlock) : 0;
    } catch (error) {
      logger.error(`Failed to get last processed block for ${this.contractName}:`, error);
      return 0;
    }
  }

  /**
   * Update the last processed block for this contract
   */
  async updateLastProcessedBlock(blockNumber: number, txHash?: string): Promise<void> {
    try {
      await db.indexerCheckpoint.upsert({
        where: { contractName: this.contractName },
        update: {
          lastProcessedBlock: BigInt(blockNumber),
          lastProcessedTx: txHash,
          updatedAt: new Date(),
        },
        create: {
          contractName: this.contractName,
          lastProcessedBlock: BigInt(blockNumber),
          lastProcessedTx: txHash,
        },
      });
    } catch (error) {
      logger.error(`Failed to update last processed block for ${this.contractName}:`, error);
      throw error;
    }
  }
}
