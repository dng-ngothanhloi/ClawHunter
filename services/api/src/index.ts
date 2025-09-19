import express from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Import configuration and middleware
import config from './config/index.js';
import logger from './config/logger.js';
import blockchain from './config/blockchain.js';
import {
  corsMiddleware,
  securityMiddleware,
  compressionMiddleware,
  loggingMiddleware,
  rateLimitMiddleware,
  jsonMiddleware,
  urlencodedMiddleware,
  requestIdMiddleware,
  responseTimeMiddleware,
  errorMiddleware,
  notFoundMiddleware,
} from './middleware/index.js';

// Import routes
import healthRouter from './routes/health.js';
import revenueRouter from './routes/revenue.js';
import machinesRouter from './routes/machines.js';
import nftownerRouter from './routes/nftowner.js';
import stakingRouter from './routes/staking.js';
import claimsRouter from './routes/claims.js';
import jobsRouter from './routes/jobs.js';

class ApiServer {
  private app: express.Application;
  private server: any;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security and basic middleware
    this.app.use(requestIdMiddleware);
    this.app.use(responseTimeMiddleware);
    this.app.use(securityMiddleware);
    this.app.use(corsMiddleware);
    this.app.use(compressionMiddleware);
    this.app.use(loggingMiddleware);
    
    // Rate limiting
    this.app.use(rateLimitMiddleware);
    
    // Body parsing
    this.app.use(jsonMiddleware);
    this.app.use(urlencodedMiddleware);
  }

  private setupRoutes(): void {
    // API Documentation
    try {
      const swaggerDocument = YAML.load(resolve(process.cwd(), 'openapi.yaml'));
      this.app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Claw Hunters API Documentation',
      }));
      logger.info('API documentation available at /docs');
    } catch (error) {
      logger.warn('Failed to load OpenAPI documentation:', error);
    }

    // Health checks (no /api prefix for health endpoints)
    this.app.use('/', healthRouter);

    // Jobs endpoint (no /api prefix for external cron access)
    this.app.use('/jobs', jobsRouter);

    // API routes with /api prefix
    const apiRouter = express.Router();
    
    apiRouter.use('/revenue', revenueRouter);
    apiRouter.use('/machine', machinesRouter);
    apiRouter.use('/nftowner', nftownerRouter);
    apiRouter.use('/staking', stakingRouter);
    apiRouter.use('/claims', claimsRouter);

    this.app.use('/api', apiRouter);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Claw Hunters Revenue Sharing API',
        version: '1.0.0',
        description: 'REST API for GameFi revenue sharing system',
        documentation: '/docs',
        health: '/healthz',
        readiness: '/readyz',
        jobs: '/jobs/index',
        endpoints: {
          revenue: '/api/revenue',
          machines: '/api/machine',
          nftowners: '/api/nftowner',
          staking: '/api/staking',
          claims: '/api/claims',
        },
        blockchain: {
          network: 'AdilChain Devnet',
          chainId: config.chainId,
        },
      });
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundMiddleware);
    
    // Global error handler
    this.app.use(errorMiddleware);
  }

  async start(): Promise<void> {
    try {
      // Initialize blockchain connection
      await blockchain.initialize();
      
      // Start server
      this.server = this.app.listen(config.port, () => {
        logger.info(`🚀 Claw Hunters API server started`, {
          port: config.port,
          nodeEnv: config.nodeEnv,
          chainId: config.chainId,
          rpcUrl: config.rpcUrl,
          documentation: `http://localhost:${config.port}/docs`,
        });
      });

      // Graceful shutdown handlers
      process.on('SIGTERM', () => this.shutdown('SIGTERM'));
      process.on('SIGINT', () => this.shutdown('SIGINT'));

    } catch (error) {
      logger.error('Failed to start API server:', error);
      process.exit(1);
    }
  }

  private async shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    if (this.server) {
      this.server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    }
  }

  getApp(): express.Application {
    return this.app;
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ApiServer();
  server.start().catch((error) => {
    logger.error('Server startup failed:', error);
    process.exit(1);
  });
}

export { ApiServer };
export default ApiServer;