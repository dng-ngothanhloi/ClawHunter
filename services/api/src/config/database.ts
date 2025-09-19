import { PrismaClient } from '@prisma/client';
import logger from './logger.js';
import config from './index.js';

class DatabaseClient {
  private static instance: PrismaClient | null = null;

  static getInstance(): PrismaClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new PrismaClient({
        log: [
          { level: 'query' as const, emit: 'event' as const },
          { level: 'error' as const, emit: 'event' as const },
          { level: 'info' as const, emit: 'event' as const },
          { level: 'warn' as const, emit: 'event' as const },
        ],
      });

      // Log database queries in development
      if (config.nodeEnv === 'development' || config.logLevel === 'debug') {
        (DatabaseClient.instance as any).$on('query', (e: any) => {
          logger.debug('Database query', {
            query: e.query,
            params: e.params,
            duration: e.duration,
          });
        });
      }

      (DatabaseClient.instance as any).$on('error', (e: any) => {
        logger.error('Database error', { error: e });
      });

      (DatabaseClient.instance as any).$on('info', (e: any) => {
        logger.info('Database info', { message: e.message });
      });

      (DatabaseClient.instance as any).$on('warn', (e: any) => {
        logger.warn('Database warning', { message: e.message });
      });
    }

    return DatabaseClient.instance;
  }

  static async disconnect(): Promise<void> {
    if (DatabaseClient.instance) {
      await DatabaseClient.instance.$disconnect();
      DatabaseClient.instance = null;
    }
  }

  static async healthCheck(): Promise<boolean> {
    try {
      const db = DatabaseClient.getInstance();
      await db.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}

export const db = DatabaseClient.getInstance();
export default DatabaseClient;
