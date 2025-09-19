import { PrismaClient } from '@prisma/client';
import logger from '../lib/logger.js';

class DatabaseClient {
  private static instance: PrismaClient | null = null;

  static getInstance(): PrismaClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new PrismaClient({
        log: [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'event' },
          { level: 'info', emit: 'event' },
          { level: 'warn', emit: 'event' },
        ],
      });

      // Log database queries in development
      if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
        DatabaseClient.instance.$on('query', (e) => {
          logger.debug('Database query', {
            query: e.query,
            params: e.params,
            duration: e.duration,
          });
        });
      }

      DatabaseClient.instance.$on('error', (e) => {
        logger.error('Database error', { error: e });
      });

      DatabaseClient.instance.$on('info', (e) => {
        logger.info('Database info', { message: e.message });
      });

      DatabaseClient.instance.$on('warn', (e) => {
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
}

export const db = DatabaseClient.getInstance();
export default db;
