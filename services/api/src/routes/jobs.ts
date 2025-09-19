import express from 'express';
import { asyncHandler } from '../middleware/index.js';
import DatabaseClient from '../config/database.js';
import blockchain from '../config/blockchain.js';
import logger from '../config/logger.js';
import config from '../config/index.js';

const router: any = express.Router();

/**
 * HTTP-triggered indexing endpoint
 * Runs one index tick (idempotent, retry-safe)
 * Reads last_processed_* from DB, processes new events, updates cursor
 */
router.post('/index', asyncHandler(async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  let processedCount = 0;
  let lastProcessedBlock = 0n;
  let lastProcessedTx = '';

  try {
    logger.info('🔄 Starting indexing job', {
      timestamp: new Date().toISOString(),
      source: 'http-trigger',
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    // Get database instance
    const db = DatabaseClient.getInstance();
    
    // Get current blockchain state
    const networkInfo = await blockchain.getNetworkInfo();
    const currentBlock = networkInfo.blockNumber;
    
    logger.info('📊 Blockchain state', {
      currentBlock: currentBlock.toString(),
      chainId: networkInfo.chainId.toString()
    });

    // Process each contract checkpoint
    const contracts = ['RevenueSplitter', 'NFTOwner', 'HCPoint', 'CHG'];
    
    for (const contractName of contracts) {
      try {
        // Get or create checkpoint for this contract
        let checkpoint = await db.indexerCheckpoint.findUnique({
          where: { contractName }
        });

        if (!checkpoint) {
          checkpoint = await db.indexerCheckpoint.create({
            data: {
              contractName,
              lastProcessedBlock: 0n,
              lastProcessedTx: null
            }
          });
          logger.info(`📝 Created new checkpoint for ${contractName}`);
        }

        // Calculate blocks to process (limit to 100 blocks per job)
        const fromBlock = checkpoint.lastProcessedBlock + 1n;
        const currentBlockBigInt = BigInt(currentBlock);
        const toBlock = fromBlock + 100n > currentBlockBigInt ? currentBlockBigInt : fromBlock + 100n;
        
        if (fromBlock > currentBlockBigInt) {
          logger.info(`✅ ${contractName} is up to date`, {
            lastProcessed: checkpoint.lastProcessedBlock.toString(),
            currentBlock: currentBlockBigInt.toString()
          });
          continue;
        }

        logger.info(`🔍 Processing ${contractName}`, {
          fromBlock: fromBlock.toString(),
          toBlock: toBlock.toString(),
          blocksToProcess: (toBlock - fromBlock + 1n).toString()
        });

        // Simulate event processing (replace with actual event processing logic)
        const eventsProcessed = await processContractEvents(contractName, fromBlock, toBlock);
        processedCount += eventsProcessed;

        // Update checkpoint
        await db.indexerCheckpoint.update({
          where: { contractName },
          data: {
            lastProcessedBlock: toBlock,
            lastProcessedTx: `0x${Date.now().toString(16)}` // Mock tx hash
          }
        });

        lastProcessedBlock = toBlock;
        lastProcessedTx = `0x${Date.now().toString(16)}`;

        logger.info(`✅ Processed ${contractName}`, {
          eventsProcessed,
          lastProcessedBlock: toBlock.toString()
        });

      } catch (error) {
        logger.error(`❌ Error processing ${contractName}:`, error);
        // Continue with other contracts
      }
    }

    const duration = Date.now() - startTime;
    const response = {
      status: 'success',
      processed: processedCount,
      duration: `${(duration / 1000).toFixed(1)}s`,
      lastProcessed: {
        blockNumber: lastProcessedBlock.toString(),
        txHash: lastProcessedTx
      },
      timestamp: new Date().toISOString()
    };

    logger.info('🎉 Indexing job completed', response);
    res.json(response);

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('❌ Indexing job failed:', error);
    
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      processed: processedCount,
      duration: `${(duration / 1000).toFixed(1)}s`,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * GET endpoint for job status (useful for monitoring)
 */
router.get('/index', asyncHandler(async (req: express.Request, res: express.Response) => {
  try {
    const db = DatabaseClient.getInstance();
    const checkpoints = await db.indexerCheckpoint.findMany({
      orderBy: { contractName: 'asc' }
    });

    const networkInfo = await blockchain.getNetworkInfo();
    
    const status = {
      status: 'ready',
      currentBlock: networkInfo.blockNumber.toString(),
      chainId: networkInfo.chainId.toString(),
      checkpoints: checkpoints.map(cp => ({
        contract: cp.contractName,
        lastProcessedBlock: cp.lastProcessedBlock.toString(),
        lastProcessedTx: cp.lastProcessedTx,
        blocksBehind: (BigInt(networkInfo.blockNumber) - cp.lastProcessedBlock).toString(),
        lastUpdated: cp.createdAt
      })),
      timestamp: new Date().toISOString()
    };

    res.json(status);
  } catch (error) {
    logger.error('❌ Failed to get job status:', error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * Simulate contract event processing
 * In production, this would:
 * 1. Fetch events from blockchain for the given block range
 * 2. Parse and validate events
 * 3. Update database with new data
 * 4. Handle errors and retries
 */
async function processContractEvents(contractName: string, fromBlock: bigint, toBlock: bigint): Promise<number> {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  
  // Simulate event count (0-5 events per block range)
  const eventCount = Math.floor(Math.random() * 6);
  
  logger.debug(`📋 Processed ${eventCount} events for ${contractName}`, {
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString()
  });
  
  return eventCount;
}

export default router;
