import { Log } from 'ethers';
import { getContractManager } from '../contracts.js';
import { RevenuePoolEventHandler } from './revenuePool.js';
import { RevenueSplitterEventHandler } from './revenueSplitter.js';
import { CHGStakingEventHandler } from './chgStaking.js';
import { NFTOwnerEventHandler } from './nftOwner.js';
import { NFTClawEventHandler } from './nftClaw.js';
import { BaseEventHandler } from './base.js';
import logger from '../lib/logger.js';

export class EventProcessor {
  private handlers: Map<string, BaseEventHandler> = new Map();
  private contractManager = getContractManager();

  async initialize(): Promise<void> {
    await this.contractManager.initialize();
    
    // Initialize event handlers
    const contracts = this.contractManager.getAllContracts();
    
    for (const [contractName, contractInstance] of contracts) {
      let handler: BaseEventHandler | null = null;
      
      switch (contractName) {
        case 'RevenuePool':
          handler = new RevenuePoolEventHandler(contractInstance.interface);
          break;
        case 'RevenueSplitter':
          handler = new RevenueSplitterEventHandler(contractInstance.interface);
          break;
        case 'CHGStaking':
          handler = new CHGStakingEventHandler(contractInstance.interface);
          break;
        case 'NFTOwner':
          handler = new NFTOwnerEventHandler(contractInstance.interface);
          break;
        case 'NFTClaw':
          handler = new NFTClawEventHandler(contractInstance.interface);
          break;
        default:
          logger.warn(`No event handler for contract: ${contractName}`);
          continue;
      }
      
      if (handler) {
        this.handlers.set(contractName, handler);
        logger.info(`Initialized event handler for ${contractName}`);
      }
    }
    
    logger.info(`Event processor initialized with ${this.handlers.size} handlers`);
  }

  /**
   * Process logs for a specific contract
   */
  async processContractLogs(contractName: string, logs: Log[]): Promise<void> {
    const handler = this.handlers.get(contractName);
    if (!handler) {
      logger.warn(`No handler found for contract: ${contractName}`);
      return;
    }

    if (logs.length === 0) {
      return;
    }

    logger.info(`Processing ${logs.length} logs for ${contractName}`);
    await handler.processLogs(logs);
  }

  /**
   * Get logs for a contract between blocks
   */
  async getContractLogs(
    contractName: string,
    fromBlock: number,
    toBlock: number
  ): Promise<Log[]> {
    const contractInstance = this.contractManager.getContract(contractName);
    const provider = this.contractManager.getProvider();

    try {
      const logs = await provider.getLogs({
        address: contractInstance.address,
        fromBlock,
        toBlock,
      });

      return logs;
    } catch (error) {
      logger.error(`Failed to get logs for ${contractName}:`, error);
      throw error;
    }
  }

  /**
   * Process all contracts for a block range
   */
  async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    logger.info(`Processing block range ${fromBlock} to ${toBlock}`);

    for (const [contractName, handler] of this.handlers) {
      try {
        // Get last processed block for this contract
        const lastProcessedBlock = await handler.getLastProcessedBlock();
        const startBlock = Math.max(lastProcessedBlock + 1, fromBlock);

        if (startBlock > toBlock) {
          logger.debug(`Contract ${contractName} already processed up to block ${lastProcessedBlock}`);
          continue;
        }

        // Get logs for this contract
        const logs = await this.getContractLogs(contractName, startBlock, toBlock);
        
        if (logs.length > 0) {
          await this.processContractLogs(contractName, logs);
        }

        // Update checkpoint
        await handler.updateLastProcessedBlock(toBlock);
        
        logger.debug(`Processed ${logs.length} logs for ${contractName} (blocks ${startBlock}-${toBlock})`);
      } catch (error) {
        logger.error(`Failed to process ${contractName} for blocks ${fromBlock}-${toBlock}:`, error);
        // Continue with other contracts
      }
    }
  }

  /**
   * Get the earliest unprocessed block across all contracts
   */
  async getEarliestUnprocessedBlock(): Promise<number> {
    let earliestBlock = Infinity;

    for (const [contractName, handler] of this.handlers) {
      try {
        const contractInstance = this.contractManager.getContract(contractName);
        const lastProcessedBlock = await handler.getLastProcessedBlock();
        const startBlock = Math.max(lastProcessedBlock + 1, contractInstance.startBlock);
        
        if (startBlock < earliestBlock) {
          earliestBlock = startBlock;
        }
      } catch (error) {
        logger.error(`Failed to get last processed block for ${contractName}:`, error);
      }
    }

    return earliestBlock === Infinity ? 0 : earliestBlock;
  }

  /**
   * Catch up processing from the earliest unprocessed block to current
   */
  async catchUp(batchSize: number = 1000): Promise<void> {
    const currentBlock = await this.contractManager.getCurrentBlock();
    let fromBlock = await this.getEarliestUnprocessedBlock();

    logger.info(`Starting catch-up from block ${fromBlock} to ${currentBlock}`);

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + batchSize - 1, currentBlock);
      
      try {
        await this.processBlockRange(fromBlock, toBlock);
        logger.info(`Processed blocks ${fromBlock} to ${toBlock} (${toBlock - fromBlock + 1} blocks)`);
      } catch (error) {
        logger.error(`Failed to process block range ${fromBlock}-${toBlock}:`, error);
        // Skip this batch and continue
      }

      fromBlock = toBlock + 1;
    }

    logger.info('Catch-up processing completed');
  }
}

export * from './base.js';
export * from './revenuePool.js';
export * from './revenueSplitter.js';
export * from './chgStaking.js';
export * from './nftOwner.js';
export * from './nftClaw.js';
