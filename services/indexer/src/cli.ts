#!/usr/bin/env node

import { Command } from 'commander';
import { EventProcessor } from './events/index.js';
import { DailySnapshotJob } from './jobs/snapshotDaily.js';
import { MerkleComputationJob } from './jobs/computeMerkle.js';
import { PublishRootsJob } from './jobs/publishRoots.js';
import { db } from './db/client.js';
import logger from './lib/logger.js';
import config from './config.js';

const program = new Command();

program
  .name('clawhunters-indexer')
  .description('Claw Hunters Event Indexer CLI')
  .version('1.0.0');

/**
 * Ingest events from blockchain
 */
program
  .command('ingest')
  .description('Ingest events from blockchain starting from a specific block')
  .option('--from <block>', 'Starting block number', '0')
  .option('--to <block>', 'Ending block number (default: latest)')
  .option('--batch-size <size>', 'Batch size for processing', config.batchSize.toString())
  .action(async (options) => {
    try {
      logger.info('Starting event ingestion', options);

      const eventProcessor = new EventProcessor();
      await eventProcessor.initialize();

      const fromBlock = parseInt(options.from);
      const toBlock = options.to ? parseInt(options.to) : await eventProcessor['contractManager'].getCurrentBlock();
      const batchSize = parseInt(options.batchSize);

      logger.info(`Ingesting events from block ${fromBlock} to ${toBlock} (batch size: ${batchSize})`);

      let currentBlock = fromBlock;
      while (currentBlock <= toBlock) {
        const endBlock = Math.min(currentBlock + batchSize - 1, toBlock);
        
        await eventProcessor.processBlockRange(currentBlock, endBlock);
        
        const progress = ((currentBlock - fromBlock) / (toBlock - fromBlock)) * 100;
        logger.info(`Progress: ${progress.toFixed(1)}% (blocks ${currentBlock}-${endBlock})`);
        
        currentBlock = endBlock + 1;
      }

      logger.info('Event ingestion completed');
    } catch (error) {
      logger.error('Event ingestion failed:', error);
      process.exit(1);
    } finally {
      await db.$disconnect();
    }
  });

/**
 * Run continuous event listener
 */
program
  .command('run')
  .description('Run continuous event listener')
  .option('--poll-interval <ms>', 'Polling interval in milliseconds', '10000')
  .action(async (options) => {
    try {
      logger.info('Starting continuous event listener', options);

      const eventProcessor = new EventProcessor();
      await eventProcessor.initialize();

      const pollInterval = parseInt(options.pollInterval);

      // First, catch up with any missed events
      await eventProcessor.catchUp(config.batchSize);

      // Then start continuous polling
      logger.info(`Starting continuous polling (interval: ${pollInterval}ms)`);

      setInterval(async () => {
        try {
          await eventProcessor.catchUp(100); // Smaller batch for real-time processing
        } catch (error) {
          logger.error('Error in continuous polling:', error);
        }
      }, pollInterval);

      // Keep the process running
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await db.$disconnect();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await db.$disconnect();
        process.exit(0);
      });

    } catch (error) {
      logger.error('Continuous listener failed:', error);
      process.exit(1);
    }
  });

/**
 * Take snapshots for an epoch
 */
program
  .command('snapshot')
  .description('Take snapshots for a specific epoch')
  .option('--epoch <id>', 'Epoch ID (default: current epoch)')
  .action(async (options) => {
    try {
      logger.info('Starting snapshot job', options);

      const snapshotJob = new DailySnapshotJob();
      const epochId = options.epoch ? BigInt(options.epoch) : undefined;
      
      const result = await snapshotJob.execute(epochId);
      
      logger.info('Snapshot completed successfully', result);
      
      console.log('\n📊 Snapshot Results:');
      console.log(`Epoch ID: ${result.epochId}`);
      console.log(`Staking Snapshots: ${result.stakingSnapshots}`);
      console.log(`Owner Snapshots: ${result.ownerSnapshots}`);
      console.log(`Total Stakers: ${result.totalStakers}`);
      console.log(`Total Owners: ${result.totalOwners}`);
      console.log(`Total Staked CHG: ${result.totalStakedCHG}`);
      console.log(`Total Owner Shares: ${result.totalOwnerShares}`);

    } catch (error) {
      logger.error('Snapshot job failed:', error);
      process.exit(1);
    } finally {
      await db.$disconnect();
    }
  });

/**
 * Compute Merkle trees for an epoch
 */
program
  .command('merkle')
  .description('Compute Merkle trees for a specific epoch')
  .requiredOption('--epoch <id>', 'Epoch ID')
  .option('--group <group>', 'Specific group to compute (A, B, G)', 'all')
  .action(async (options) => {
    try {
      logger.info('Starting Merkle computation', options);

      const merkleJob = new MerkleComputationJob();
      const epochId = BigInt(options.epoch);
      
      const result = await merkleJob.execute(epochId);
      
      logger.info('Merkle computation completed successfully');
      
      console.log('\n🌳 Merkle Tree Results:');
      console.log(`Epoch ID: ${result.epochId}`);
      
      if (result.alpha) {
        console.log(`\nAlpha (CHG Staking):`);
        console.log(`  Root: ${result.alpha.root}`);
        console.log(`  Leaves: ${result.alpha.leafCount}`);
        console.log(`  Total: ${result.alpha.totalAmount} USDT`);
      }
      
      if (result.beta) {
        console.log(`\nBeta (NFTClaw L1):`);
        console.log(`  Root: ${result.beta.root}`);
        console.log(`  Leaves: ${result.beta.leafCount}`);
        console.log(`  Total: ${result.beta.totalAmount} USDT`);
      }
      
      if (result.gamma) {
        console.log(`\nGamma (NFTOwner L2):`);
        console.log(`  Root: ${result.gamma.root}`);
        console.log(`  Leaves: ${result.gamma.leafCount}`);
        console.log(`  Total: ${result.gamma.totalAmount} USDT`);
      }

    } catch (error) {
      logger.error('Merkle computation failed:', error);
      process.exit(1);
    } finally {
      await db.$disconnect();
    }
  });

/**
 * Publish Merkle roots to blockchain
 */
program
  .command('publish')
  .description('Publish Merkle roots to blockchain')
  .requiredOption('--epoch <id>', 'Epoch ID')
  .option('--group <group>', 'Specific group to publish (A, B, G)', 'all')
  .option('--dry-run', 'Show what would be published without actually publishing')
  .action(async (options) => {
    try {
      logger.info('Starting Merkle root publication', options);

      const publishJob = new PublishRootsJob();
      const epochId = BigInt(options.epoch);

      // Check oracle permissions first
      const hasPermission = await publishJob.checkOraclePermissions();
      if (!hasPermission) {
        throw new Error('Oracle signer does not have permission to publish Merkle roots');
      }

      if (options.dryRun) {
        logger.info('DRY RUN: No actual transactions will be sent');
        
        // Show what would be published
        const unpublishedRoots = await db.merkleRoot.findMany({
          where: {
            epochId,
            published: false,
            ...(options.group !== 'all' && { group: options.group.toUpperCase() }),
          },
        });

        console.log('\n📤 Roots to be published:');
        for (const root of unpublishedRoots) {
          console.log(`  Group ${root.group}: ${root.root} (${root.leafCount} leaves)`);
        }
        return;
      }

      let results;
      if (options.group === 'all') {
        results = await publishJob.publishEpochRoots(epochId);
      } else {
        const result = await publishJob.publishRoot(epochId, options.group.toUpperCase());
        results = [result];
      }

      console.log('\n📤 Publication Results:');
      for (const result of results) {
        const status = result.success ? '✅' : '❌';
        console.log(`${status} Group ${result.group}: ${result.root}`);
        if (result.success) {
          console.log(`    TX: ${result.txHash}`);
          console.log(`    Gas: ${result.gasUsed}`);
        } else if (result.error) {
          console.log(`    Error: ${result.error}`);
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`\nPublished ${successCount}/${results.length} Merkle roots`);

    } catch (error) {
      logger.error('Merkle root publication failed:', error);
      process.exit(1);
    } finally {
      await db.$disconnect();
    }
  });

/**
 * Database management commands
 */
const dbCommand = program.command('db').description('Database management commands');

dbCommand
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    try {
      logger.info('Running database migrations...');
      
      // This would typically run `prisma migrate deploy`
      const { execSync } = await import('child_process');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      
      logger.info('Database migrations completed');
    } catch (error) {
      logger.error('Database migration failed:', error);
      process.exit(1);
    }
  });

dbCommand
  .command('status')
  .description('Show indexer status and statistics')
  .action(async () => {
    try {
      console.log('📊 Indexer Status\n');

      // Get latest processed blocks
      const checkpoints = await db.indexerCheckpoint.findMany({
        orderBy: { contractName: 'asc' },
      });

      console.log('Contract Processing Status:');
      for (const checkpoint of checkpoints) {
        console.log(`  ${checkpoint.contractName.padEnd(20)} Block: ${checkpoint.lastProcessedBlock}`);
      }

      // Get epoch statistics
      const epochCount = await db.revenueEpoch.count();
      const latestEpoch = await db.revenueEpoch.findFirst({
        orderBy: { epochId: 'desc' },
      });

      console.log(`\nEpoch Statistics:`);
      console.log(`  Total Epochs: ${epochCount}`);
      if (latestEpoch) {
        console.log(`  Latest Epoch: ${latestEpoch.epochId}`);
        console.log(`  Latest Revenue: ${latestEpoch.totalR} USDT`);
      }

      // Get Merkle root statistics
      const merkleStats = await db.merkleRoot.groupBy({
        by: ['published'],
        _count: true,
      });

      console.log(`\nMerkle Root Statistics:`);
      for (const stat of merkleStats) {
        const status = stat.published ? 'Published' : 'Pending';
        console.log(`  ${status}: ${stat._count}`);
      }

      // Get event log statistics
      const eventStats = await db.eventLog.groupBy({
        by: ['contractName', 'processed'],
        _count: true,
      });

      console.log(`\nEvent Processing Statistics:`);
      const eventsByContract = eventStats.reduce((acc, stat) => {
        if (!acc[stat.contractName]) {
          acc[stat.contractName] = { processed: 0, pending: 0 };
        }
        if (stat.processed) {
          acc[stat.contractName].processed = stat._count;
        } else {
          acc[stat.contractName].pending = stat._count;
        }
        return acc;
      }, {} as Record<string, { processed: number; pending: number }>);

      for (const [contract, stats] of Object.entries(eventsByContract)) {
        console.log(`  ${contract.padEnd(20)} Processed: ${stats.processed}, Pending: ${stats.pending}`);
      }

    } catch (error) {
      logger.error('Failed to get indexer status:', error);
      process.exit(1);
    } finally {
      await db.$disconnect();
    }
  });

/**
 * Utility commands
 */
program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    console.log('⚙️  Indexer Configuration\n');
    console.log(`Database URL: ${config.databaseUrl.replace(/\/\/.*@/, '//***@')}`);
    console.log(`RPC URL: ${config.rpcUrl}`);
    console.log(`Chain ID: ${config.chainId}`);
    console.log(`Start Block: ${config.startBlock}`);
    console.log(`Timezone: ${config.timezone}`);
    console.log(`Log Level: ${config.logLevel}`);
    console.log(`Batch Size: ${config.batchSize}`);
    
    console.log('\nContract Addresses:');
    for (const [name, address] of Object.entries(config.contracts)) {
      if (address) {
        console.log(`  ${name.padEnd(20)} ${address}`);
      }
    }
  });

// Error handling
program.configureHelp({
  sortSubcommands: true,
});

program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof Error && error.message.includes('commander')) {
    // Commander errors (help, version, etc.)
    process.exit(0);
  } else {
    logger.error('CLI error:', error);
    process.exit(1);
  }
}
