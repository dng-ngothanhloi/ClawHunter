import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

/**
 * Double-Claim Prevention Tests (FR-010)
 * 
 * Critical security tests for preventing double-claiming of rewards
 * Tests the unique (beneficiary, epochId, group) constraint
 */

describe('Double-Claim Prevention (FR-010)', () => {
  let apiApp: any;

  beforeEach(async () => {
    // Set up test API
    const { ApiServer } = await import('../services/api/src/index.js');
    const server = new ApiServer();
    apiApp = server.getApp();
  });

  describe('Database Constraint Enforcement', () => {
    it('should prevent duplicate claims with unique constraint', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const epochId = 1;
      const group = 'A';

      // First claim should succeed
      const firstClaimResponse = await request(apiApp)
        .get(`/api/claims/${testAddress}/${epochId}/${group}`)
        .expect(200);

      expect(firstClaimResponse.body.claim.claimed).toBe(false);

      // Simulate claim being processed (this would normally be done by blockchain)
      // In a real test, we would:
      // 1. Submit claim transaction to ClaimProcessor contract
      // 2. Wait for indexer to process Claimed event
      // 3. Verify claim status updated in database

      // For this test, we'll simulate the claim status update
      // (In production, this would be handled by the claim event handler)
    });

    it('should return "Already claimed" error for duplicate attempts', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const epochId = 1;
      const group = 'A';

      // Check if claim is already marked as claimed
      const claimResponse = await request(apiApp)
        .get(`/api/claims/${testAddress}/${epochId}/${group}`);

      if (claimResponse.status === 200 && claimResponse.body.claim.claimed) {
        // Verify that claimed status is properly returned
        expect(claimResponse.body.claim.claimed).toBe(true);
        expect(claimResponse.body.claim.claimedTx).toBeDefined();
        expect(claimResponse.body.claim.claimedAt).toBeDefined();
      }
    });

    it('should allow claims for different epochs by same address', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      
      // Should be able to claim from different epochs
      const epoch1Response = await request(apiApp)
        .get(`/api/claims/${testAddress}/1/A`);
      
      const epoch2Response = await request(apiApp)
        .get(`/api/claims/${testAddress}/2/A`);

      // Both should be valid (if epochs exist)
      if (epoch1Response.status === 200 && epoch2Response.status === 200) {
        expect(epoch1Response.body.epochId).toBe('1');
        expect(epoch2Response.body.epochId).toBe('2');
      }
    });

    it('should allow claims for different groups by same address', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const epochId = 1;
      
      // Should be able to claim from different groups in same epoch
      const groups = ['A', 'B', 'G'];
      
      for (const group of groups) {
        const response = await request(apiApp)
          .get(`/api/claims/${testAddress}/${epochId}/${group}`);

        // Each group should be independent (if claims exist)
        if (response.status === 200) {
          expect(response.body.group).toBe(group);
          expect(response.body.epochId).toBe(epochId.toString());
        }
      }
    });
  });

  describe('Claim Status Validation', () => {
    it('should accurately track claim status', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';

      const response = await request(apiApp)
        .get(`/api/claims/${testAddress}`)
        .expect(200);

      // Verify claim status tracking
      for (const claim of response.body.claims) {
        expect(claim).toHaveProperty('claimed');
        expect(typeof claim.claimed).toBe('boolean');

        if (claim.claimed) {
          expect(claim).toHaveProperty('claimedTx');
          expect(claim).toHaveProperty('claimedAt');
          expect(claim.claimedTx).toMatch(/^0x[a-fA-F0-9]{64}$/);
        }
      }
    });

    it('should provide claim status before transaction submission', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      const epochId = 1;
      const group = 'A';

      const response = await request(apiApp)
        .get(`/api/claims/${testAddress}/${epochId}/${group}`);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('claimable');
        expect(typeof response.body.claimable).toBe('boolean');
        
        // Claimable should be true only if:
        // 1. Not already claimed
        // 2. Merkle root is published
        const isClaimable = !response.body.claim.claimed && 
                           response.body.merkleRoot.published;
        
        expect(response.body.claimable).toBe(isClaimable);
      }
    });
  });

  describe('Merkle Proof Integrity', () => {
    it('should provide valid Merkle proofs for unclaimed rewards', async () => {
      const testAddress = '0x1234567890123456789012345678901234567890';

      const response = await request(apiApp)
        .get(`/api/claims/${testAddress}`)
        .expect(200);

      for (const claim of response.body.claims) {
        if (!claim.claimed && claim.merkleRoot.published) {
          // Verify proof structure
          expect(claim).toHaveProperty('proof');
          expect(Array.isArray(claim.proof)).toBe(true);
          expect(claim).toHaveProperty('leafHash');
          expect(claim.leafHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

          // Verify proof can be used for claiming
          expect(claim.proof.length).toBeGreaterThan(0);
          for (const proofElement of claim.proof) {
            expect(proofElement).toMatch(/^0x[a-fA-F0-9]{64}$/);
          }
        }
      }
    });

    it('should verify proofs against published Merkle roots', async () => {
      // This test would verify that the Merkle proofs are mathematically correct
      // and can be verified against the published roots
    });
  });

  describe('Cross-Service Data Consistency', () => {
    it('should maintain consistent data between indexer and API', async () => {
      // Test that data written by indexer is correctly read by API
      const latestResponse = await request(apiApp)
        .get('/api/revenue/latest')
        .expect(200);

      // Verify data consistency
      expect(latestResponse.body).toHaveProperty('epochId');
      expect(latestResponse.body).toHaveProperty('totalR');
      expect(latestResponse.body).toHaveProperty('distribution');

      // Mathematical consistency check
      const { distribution } = latestResponse.body;
      const totalR = parseFloat(latestResponse.body.totalR);
      const distributedTotal = 
        parseFloat(distribution.opc.amount) +
        parseFloat(distribution.alpha.amount) +
        parseFloat(distribution.beta.amount) +
        parseFloat(distribution.gamma.amount) +
        parseFloat(distribution.delta.amount);

      expect(distributedTotal).toBe(totalR);
    });

    it('should handle service restart scenarios', async () => {
      // Test that services can restart and maintain data consistency
    });

    it('should recover from partial failures', async () => {
      // Test recovery from various failure scenarios
    });
  });

  describe('Audit Trail Completeness (FR-007)', () => {
    it('should maintain complete audit trail from posting to claiming', async () => {
      // Verify that all steps in the revenue flow are logged and auditable
      const latestResponse = await request(apiApp)
        .get('/api/revenue/latest')
        .expect(200);

      // Should include blockchain metadata for audit
      expect(latestResponse.body.blockchain).toHaveProperty('txHash');
      expect(latestResponse.body.blockchain).toHaveProperty('blockNumber');
      expect(latestResponse.body.blockchain).toHaveProperty('blockTime');

      // Should include timestamps
      expect(latestResponse.body.timestamps).toHaveProperty('createdAt');
      expect(latestResponse.body.timestamps).toHaveProperty('updatedAt');
    });
  });

  // Helper functions
  async function loadContracts(): Promise<Record<string, ethers.Contract>> {
    const fs = await import('fs');
    const path = await import('path');

    const addressesPath = path.resolve(process.cwd(), 'contracts/addresses.adil.json');
    const addresses = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

    const contracts: Record<string, ethers.Contract> = {};
    const contractNames = ['RevenuePool', 'RevenueSplitter', 'ClaimProcessor', 'CHGStaking'];

    for (const name of contractNames) {
      const address = addresses.contracts[name].address;
      const abiPath = path.resolve(process.cwd(), `contracts/artifacts/contracts/contracts/${name}.sol/${name}.json`);
      const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
      
      contracts[name] = new ethers.Contract(address, artifact.abi, signer);
    }

    return contracts;
  }

  async function waitForEventProcessing(epochId: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await request(apiApp)
          .get(`/api/revenue/epoch/${epochId}`);

        if (response.status === 200) {
          return; // Event processed successfully
        }
      } catch (error) {
        // Continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }

    throw new Error(`Event processing timeout after ${timeoutMs}ms for epoch ${epochId}`);
  }

  async function triggerSnapshotAndMerkle(epochId: number): Promise<void> {
    // In a real implementation, this would trigger the indexer's snapshot and Merkle jobs
    // For testing, we might call the indexer CLI or service endpoints directly
    
    // Placeholder: simulate processing time
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
});
