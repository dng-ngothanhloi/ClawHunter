import { EventProcessor } from './events/index.js';
import { DailySnapshotJob } from './jobs/snapshotDaily.js';
import { MerkleComputationJob } from './jobs/computeMerkle.js';
import { PublishRootsJob } from './jobs/publishRoots.js';
import { CronJob } from 'cron';
import { db } from './db/client.js';
import logger from './lib/logger.js';
import config from './config.js';

class IndexerService {
  private eventProcessor: EventProcessor;
  private snapshotJob: DailySnapshotJob;
  private merkleJob: MerkleComputationJob;
  private publishJob: PublishRootsJob;
  private cronJobs: CronJob[] = [];
  private isRunning = false;

  constructor() {
    this.eventProcessor = new EventProcessor();
    this.snapshotJob = new DailySnapshotJob();
    this.merkleJob = new MerkleComputationJob();
    this.publishJob = new PublishRootsJob();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Indexer service is already running');
      return;
    }

    try {
      logger.info('Starting Claw Hunters Indexer Service...');

      // Initialize event processor
      await this.eventProcessor.initialize();

      // Catch up with any missed events
      logger.info('Catching up with blockchain events...');
      await this.eventProcessor.catchUp(config.batchSize);

      // Set up cron jobs
      this.setupCronJobs();

      // Start continuous event listening
      this.startEventListening();

      this.isRunning = true;
      logger.info('Indexer service started successfully');

    } catch (error) {
      logger.error('Failed to start indexer service:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Claw Hunters Indexer Service...');

    // Stop cron jobs
    for (const job of this.cronJobs) {
      job.stop();
    }
    this.cronJobs = [];

    // Disconnect from database
    await db.$disconnect();

    this.isRunning = false;
    logger.info('Indexer service stopped');
  }

  private setupCronJobs(): void {
    // Daily snapshot job (runs at midnight in configured timezone)
    const snapshotCron = new CronJob(
      config.snapshotCron,
      async () => {
        try {
          logger.info('Running scheduled daily snapshot...');
          const result = await this.snapshotJob.execute();
          logger.info('Scheduled snapshot completed', result);

          // Schedule Merkle computation after snapshot
          setTimeout(async () => {
            try {
              logger.info('Running scheduled Merkle computation...');
              const merkleResult = await this.merkleJob.execute(result.epochId);
              logger.info('Scheduled Merkle computation completed');

              // Schedule root publication after Merkle computation
              setTimeout(async () => {
                try {
                  logger.info('Running scheduled root publication...');
                  const publishResults = await this.publishJob.publishEpochRoots(result.epochId);
                  const successCount = publishResults.filter(r => r.success).length;
                  logger.info(`Scheduled root publication completed: ${successCount}/${publishResults.length} roots published`);
                } catch (error) {
                  logger.error('Scheduled root publication failed:', error);
                }
              }, config.publishDelayMs);

            } catch (error) {
              logger.error('Scheduled Merkle computation failed:', error);
            }
          }, config.merkleDelayMs);

        } catch (error) {
          logger.error('Scheduled snapshot failed:', error);
        }
      },
      null,
      true, // Start immediately
      config.timezone
    );

    this.cronJobs.push(snapshotCron);
    logger.info(`Scheduled daily snapshot job with cron: ${config.snapshotCron} (${config.timezone})`);
  }

  private startEventListening(): void {
    // Poll for new events every 10 seconds
    setInterval(async () => {
      try {
        await this.eventProcessor.catchUp(100); // Smaller batch for real-time processing
      } catch (error) {
        logger.error('Error in event listening:', error);
      }
    }, 10000);

    logger.info('Started continuous event listening');
  }
}

// Main execution
async function main() {
  const service = new IndexerService();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await service.stop();
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  try {
    await service.start();
  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Service startup failed:', error);
    process.exit(1);
  });
}

export { IndexerService };
export default IndexerService;