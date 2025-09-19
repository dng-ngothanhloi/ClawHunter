import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { ApiServer } from '../index.js';

/**
 * Revenue Endpoints Tests (T052)
 * 
 * Tests for revenue and epoch data access endpoints
 * Based on FR-001 (revenue recording) and FR-007 (audit trail)
 */

describe('Revenue Endpoints (T052)', () => {
  let app: any;
  let server: ApiServer;

  beforeEach(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test_clawhunters';
    process.env.ADL_RPC_URL = 'https://devnet.adilchain-rpc.io';
    process.env.LOG_LEVEL = 'error'; // Reduce test noise

    server = new ApiServer();
    app = server.getApp();
  });

  afterEach(async () => {
    // Clean up
    if (server) {
      // Clean up server resources
    }
  });

  describe('GET /api/revenue/epoch/:id', () => {
    it('should return complete epoch details with 70/20/3/3/4 distribution', async () => {
      const epochId = 1;
      
      const response = await request(app)
        .get(`/api/revenue/epoch/${epochId}`)
        .expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('epochId');
      expect(response.body).toHaveProperty('totalR');
      expect(response.body).toHaveProperty('distribution');

      // Verify distribution structure
      const { distribution } = response.body;
      expect(distribution).toHaveProperty('opc');
      expect(distribution).toHaveProperty('alpha');
      expect(distribution).toHaveProperty('beta');
      expect(distribution).toHaveProperty('gamma');
      expect(distribution).toHaveProperty('delta');

      // Verify percentage descriptions
      expect(distribution.opc.percentage).toBe(70);
      expect(distribution.alpha.percentage).toBe(20);
      expect(distribution.beta.percentage).toBe(3);
      expect(distribution.gamma.percentage).toBe(3);
      expect(distribution.delta.percentage).toBe(4);

      // Verify mathematical accuracy
      const totalR = parseFloat(response.body.totalR);
      const opc = parseFloat(distribution.opc.amount);
      const alpha = parseFloat(distribution.alpha.amount);
      const beta = parseFloat(distribution.beta.amount);
      const gamma = parseFloat(distribution.gamma.amount);
      const delta = parseFloat(distribution.delta.amount);

      expect(opc + alpha + beta + gamma + delta).toBe(totalR);
    });

    it('should include machine revenue breakdown', async () => {
      const epochId = 1;
      
      const response = await request(app)
        .get(`/api/revenue/epoch/${epochId}`)
        .expect(200);

      expect(response.body).toHaveProperty('machines');
      expect(Array.isArray(response.body.machines)).toBe(true);

      if (response.body.machines.length > 0) {
        const machine = response.body.machines[0];
        expect(machine).toHaveProperty('machineId');
        expect(machine).toHaveProperty('revenue');
        expect(machine).toHaveProperty('txHash');
        expect(machine).toHaveProperty('blockNumber');
      }
    });

    it('should include Merkle root information', async () => {
      const epochId = 1;
      
      const response = await request(app)
        .get(`/api/revenue/epoch/${epochId}`)
        .expect(200);

      expect(response.body).toHaveProperty('merkleRoots');
      expect(Array.isArray(response.body.merkleRoots)).toBe(true);

      if (response.body.merkleRoots.length > 0) {
        const root = response.body.merkleRoots[0];
        expect(root).toHaveProperty('group');
        expect(root).toHaveProperty('root');
        expect(root).toHaveProperty('total');
        expect(root).toHaveProperty('leafCount');
        expect(root).toHaveProperty('published');
        expect(['A', 'B', 'G']).toContain(root.group);
      }
    });

    it('should return 404 for non-existent epochs', async () => {
      const nonExistentEpochId = 999999;
      
      const response = await request(app)
        .get(`/api/revenue/epoch/${nonExistentEpochId}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    it('should validate epoch ID format', async () => {
      const invalidEpochIds = ['invalid', '-1', '1.5', 'abc'];
      
      for (const invalidId of invalidEpochIds) {
        await request(app)
          .get(`/api/revenue/epoch/${invalidId}`)
          .expect(400);
      }
    });

    it('should include blockchain metadata', async () => {
      const epochId = 1;
      
      const response = await request(app)
        .get(`/api/revenue/epoch/${epochId}`)
        .expect(200);

      expect(response.body).toHaveProperty('blockchain');
      const { blockchain } = response.body;
      
      expect(blockchain).toHaveProperty('blockNumber');
      expect(blockchain).toHaveProperty('blockTime');
      expect(blockchain).toHaveProperty('txHash');
      
      // Validate format
      expect(blockchain.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(new Date(blockchain.blockTime)).toBeInstanceOf(Date);
    });
  });

  describe('GET /api/revenue/epochs', () => {
    it('should return paginated epoch list', async () => {
      const response = await request(app)
        .get('/api/revenue/epochs')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('epochs');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.epochs)).toBe(true);

      const { pagination } = response.body;
      expect(pagination).toHaveProperty('page');
      expect(pagination).toHaveProperty('limit');
      expect(pagination).toHaveProperty('total');
      expect(pagination).toHaveProperty('hasNext');
      expect(pagination).toHaveProperty('hasPrev');
    });

    it('should support date range filtering', async () => {
      const response = await request(app)
        .get('/api/revenue/epochs')
        .query({ from: 1, to: 5 })
        .expect(200);

      const epochs = response.body.epochs;
      for (const epoch of epochs) {
        const epochId = parseInt(epoch.epochId);
        expect(epochId).toBeGreaterThanOrEqual(1);
        expect(epochId).toBeLessThanOrEqual(5);
      }
    });

    it('should sort epochs by ID (desc) by default', async () => {
      const response = await request(app)
        .get('/api/revenue/epochs')
        .expect(200);

      const epochs = response.body.epochs;
      if (epochs.length > 1) {
        for (let i = 1; i < epochs.length; i++) {
          const currentEpoch = parseInt(epochs[i].epochId);
          const previousEpoch = parseInt(epochs[i - 1].epochId);
          expect(currentEpoch).toBeLessThanOrEqual(previousEpoch);
        }
      }
    });

    it('should validate pagination parameters', async () => {
      // Test invalid pagination parameters
      await request(app)
        .get('/api/revenue/epochs')
        .query({ page: 0 })
        .expect(400);

      await request(app)
        .get('/api/revenue/epochs')
        .query({ limit: 101 })
        .expect(400);

      await request(app)
        .get('/api/revenue/epochs')
        .query({ from: -1 })
        .expect(400);
    });
  });

  describe('GET /api/revenue/latest', () => {
    it('should return the most recent epoch', async () => {
      const response = await request(app)
        .get('/api/revenue/latest')
        .expect(200);

      expect(response.body).toHaveProperty('epochId');
      expect(response.body).toHaveProperty('totalR');
      expect(response.body).toHaveProperty('distribution');

      // Should have same structure as individual epoch endpoint
      const { distribution } = response.body;
      expect(distribution.opc.percentage).toBe(70);
      expect(distribution.alpha.percentage).toBe(20);
      expect(distribution.beta.percentage).toBe(3);
      expect(distribution.gamma.percentage).toBe(3);
      expect(distribution.delta.percentage).toBe(4);
    });

    it('should return 404 when no epochs exist', async () => {
      // This test would need a clean database
      // await request(app)
      //   .get('/api/revenue/latest')
      //   .expect(404);
    });
  });

  describe('GET /api/revenue/stats', () => {
    it('should return revenue statistics', async () => {
      const response = await request(app)
        .get('/api/revenue/stats')
        .expect(200);

      expect(response.body).toHaveProperty('epochs');
      expect(response.body).toHaveProperty('revenue');

      const { epochs, revenue } = response.body;
      
      // Epochs statistics
      expect(epochs).toHaveProperty('total');
      expect(epochs).toHaveProperty('latest');
      expect(epochs).toHaveProperty('latestRevenue');
      expect(epochs).toHaveProperty('latestTime');

      // Revenue statistics
      expect(revenue).toHaveProperty('total');
      expect(revenue).toHaveProperty('average');

      // Validate numeric formats
      expect(typeof epochs.total).toBe('number');
      expect(typeof revenue.total).toBe('string'); // Decimal precision
      expect(typeof revenue.average).toBe('string'); // Decimal precision
    });
  });

  describe('Response Format Validation', () => {
    it('should return consistent JSON structure across endpoints', async () => {
      const endpoints = [
        '/api/revenue/latest',
        '/api/revenue/stats',
        '/api/revenue/epochs?limit=1'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .expect(200);

        expect(response.headers['content-type']).toContain('application/json');
        expect(response.body).toBeTypeOf('object');
      }
    });

    it('should include proper timestamps in ISO format', async () => {
      const response = await request(app)
        .get('/api/revenue/latest')
        .expect(200);

      if (response.body.blockchain?.blockTime) {
        const blockTime = new Date(response.body.blockchain.blockTime);
        expect(blockTime).toBeInstanceOf(Date);
        expect(blockTime.toISOString()).toBe(response.body.blockchain.blockTime);
      }
    });

    it('should handle CORS headers correctly', async () => {
      const response = await request(app)
        .get('/api/revenue/latest')
        .expect(200);

      // Should include CORS headers
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Performance Requirements', () => {
    it('should respond within 500ms for simple queries', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/api/revenue/latest')
        .expect(200);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500);
    });

    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = Array.from({ length: 10 }, () =>
        request(app).get('/api/revenue/latest')
      );

      const responses = await Promise.all(concurrentRequests);
      
      for (const response of responses) {
        expect(response.status).toBe(200);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      // This would need to mock database failures
      // Test that API returns appropriate error responses
    });

    it('should provide meaningful error messages', async () => {
      const response = await request(app)
        .get('/api/revenue/epoch/invalid')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('must be');
    });

    it('should include request correlation IDs in responses', async () => {
      const response = await request(app)
        .get('/api/revenue/latest')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
    });
  });
});
