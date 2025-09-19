import express from 'express';
import { asyncHandler } from '../middleware/index.js';
import DatabaseClient from '../config/database.js';
import blockchain from '../config/blockchain.js';
import logger from '../config/logger.js';
import config from '../config/index.js';

const router: any = express.Router();

/**
 * Health check endpoint
 * Returns basic API health status
 */
router.get('/healthz', asyncHandler(async (req: express.Request, res: express.Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };

  res.json(health);
}));

/**
 * Readiness check endpoint
 * Returns detailed readiness status including database and blockchain connectivity
 */
router.get('/readyz', asyncHandler(async (req: express.Request, res: express.Response) => {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkBlockchain(),
  ]);

  const [dbCheck, blockchainCheck] = checks;

  const readiness = {
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: {
        status: dbCheck.status === 'fulfilled' ? 'connected' : 'disconnected',
        ...(dbCheck.status === 'rejected' && { error: dbCheck.reason?.message }),
      },
      blockchain: {
        status: blockchainCheck.status === 'fulfilled' ? 'connected' : 'disconnected',
        ...(blockchainCheck.status === 'rejected' && { error: blockchainCheck.reason?.message }),
        ...(blockchainCheck.status === 'fulfilled' && blockchainCheck.value),
      },
    },
    config: {
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      nodeEnv: config.nodeEnv,
    },
  };

  // If any critical service is down, return 503
  const isReady = dbCheck.status === 'fulfilled' && blockchainCheck.status === 'fulfilled';
  
  if (!isReady) {
    res.status(503);
  }

  res.json(readiness);
}));

/**
 * Detailed status endpoint with contract information
 */
router.get('/status', asyncHandler(async (req: express.Request, res: express.Response) => {
  const [dbHealthy, blockchainHealthy] = await Promise.all([
    DatabaseClient.healthCheck(),
    blockchain.healthCheck(),
  ]);

  let networkInfo = null;
  let contractInfo = null;

  if (blockchainHealthy) {
    try {
      networkInfo = await blockchain.getNetworkInfo();
      
      // Get contract addresses
      contractInfo = {
        addresses: config.contracts,
        loaded: Object.keys(config.contracts).length,
      };
    } catch (error) {
      logger.warn('Failed to get network info:', error);
    }
  }

  const status = {
    api: {
      status: 'running',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    database: {
      status: dbHealthy ? 'connected' : 'disconnected',
      url: config.databaseUrl.replace(/\/\/.*@/, '//***@'), // Mask credentials
    },
    blockchain: {
      status: blockchainHealthy ? 'connected' : 'disconnected',
      rpcUrl: config.rpcUrl,
      chainId: config.chainId,
      ...(networkInfo && {
        currentBlock: networkInfo.blockNumber,
        networkName: networkInfo.name,
      }),
    },
    contracts: contractInfo,
  };

  res.json(status);
}));

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<void> {
  const isHealthy = await DatabaseClient.healthCheck();
  if (!isHealthy) {
    throw new Error('Database connection failed');
  }
}

/**
 * Check blockchain connectivity
 */
async function checkBlockchain(): Promise<{
  chainId: string;
  blockNumber: number;
  networkName: string;
}> {
  const isHealthy = await blockchain.healthCheck();
  if (!isHealthy) {
    throw new Error('Blockchain connection failed');
  }

  const networkInfo = await blockchain.getNetworkInfo();
  return {
    chainId: networkInfo.chainId.toString(),
    blockNumber: networkInfo.blockNumber,
    networkName: networkInfo.name,
  };
}

export default router;
