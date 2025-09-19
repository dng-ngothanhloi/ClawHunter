import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Revenue Distribution Mathematical Tests
 * 
 * These tests verify the exact mathematical implementation specified in:
 * - Product Spec Section 2: Top-Level Distribution (Integer Math)
 * - FR-002: Revenue split per fixed ratios with floor division
 * - Remainder policy: remTop → OPC
 */

describe('Revenue Distribution Mathematics (FR-002)', () => {
  const DENOM = 10000; // Basis points denominator
  const OPC_BPS = 7000;    // 70%
  const ALPHA_BPS = 2000;  // 20% 
  const BETA_BPS = 300;    // 3%
  const GAMMA_BPS = 300;   // 3%
  const DELTA_BPS = 400;   // 4%

  /**
   * Calculate revenue distribution using exact product specification
   */
  function calculateDistribution(totalR: number) {
    // Floor division for each pool (exact spec implementation)
    const opcFloor = Math.floor((totalR * OPC_BPS) / DENOM);
    const alphaFloor = Math.floor((totalR * ALPHA_BPS) / DENOM);
    const betaFloor = Math.floor((totalR * BETA_BPS) / DENOM);
    const gammaFloor = Math.floor((totalR * GAMMA_BPS) / DENOM);
    const deltaFloor = Math.floor((totalR * DELTA_BPS) / DENOM);

    // Calculate remainder and add to OPC (remTop policy)
    const allocated = opcFloor + alphaFloor + betaFloor + gammaFloor + deltaFloor;
    const remainder = totalR - allocated;
    const opcFinal = opcFloor + remainder;

    return {
      totalR,
      opc: opcFinal,
      alpha: alphaFloor,
      beta: betaFloor,
      gamma: gammaFloor,
      delta: deltaFloor,
      remainder,
      allocated,
      verification: {
        totalDistributed: opcFinal + alphaFloor + betaFloor + gammaFloor + deltaFloor,
        matchesInput: (opcFinal + alphaFloor + betaFloor + gammaFloor + deltaFloor) === totalR,
      }
    };
  }

  describe('Perfect Division Cases', () => {
    it('should calculate exact 70/20/3/3/4 split for 10,000 USDT', () => {
      const result = calculateDistribution(10000);
      
      expect(result.opc).toBe(7000);      // 70%
      expect(result.alpha).toBe(2000);    // 20%
      expect(result.beta).toBe(300);      // 3%
      expect(result.gamma).toBe(300);     // 3%
      expect(result.delta).toBe(400);     // 4%
      expect(result.remainder).toBe(0);   // Perfect division
      expect(result.verification.matchesInput).toBe(true);
    });

    it('should handle large revenue amounts correctly', () => {
      const result = calculateDistribution(1000000); // 1M USDT
      
      expect(result.opc).toBe(700000);    // 70%
      expect(result.alpha).toBe(200000);  // 20%
      expect(result.beta).toBe(30000);    // 3%
      expect(result.gamma).toBe(30000);   // 3%
      expect(result.delta).toBe(40000);   // 4%
      expect(result.remainder).toBe(0);
      expect(result.verification.matchesInput).toBe(true);
    });
  });

  describe('Remainder Handling (remTop Policy)', () => {
    it('should add remainder to OPC for 10,001 USDT', () => {
      const result = calculateDistribution(10001);
      
      expect(result.opc).toBe(7001);      // 7000 + 1 remainder
      expect(result.alpha).toBe(2000);    // 20%
      expect(result.beta).toBe(300);      // 3%
      expect(result.gamma).toBe(300);     // 3%
      expect(result.delta).toBe(400);     // 4%
      expect(result.remainder).toBe(1);   // 1 USDT remainder
      expect(result.verification.matchesInput).toBe(true);
    });

    it('should handle maximum possible remainder (9 USDT)', () => {
      // Test case that creates maximum remainder
      const result = calculateDistribution(10009);
      
      expect(result.remainder).toBeLessThanOrEqual(9);
      expect(result.verification.matchesInput).toBe(true);
      expect(result.opc).toBe(7006 + result.remainder); // Base + remainder
    });

    it('should maintain deterministic remainder assignment', () => {
      // Multiple runs should produce identical results
      const amount = 12345;
      const result1 = calculateDistribution(amount);
      const result2 = calculateDistribution(amount);
      
      expect(result1).toEqual(result2);
      expect(result1.verification.matchesInput).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero revenue correctly', () => {
      const result = calculateDistribution(0);
      
      expect(result.opc).toBe(0);
      expect(result.alpha).toBe(0);
      expect(result.beta).toBe(0);
      expect(result.gamma).toBe(0);
      expect(result.delta).toBe(0);
      expect(result.remainder).toBe(0);
      expect(result.verification.matchesInput).toBe(true);
    });

    it('should handle single unit revenue (1 USDT)', () => {
      const result = calculateDistribution(1);
      
      // All pools get 0 due to floor division, remainder goes to OPC
      expect(result.opc).toBe(1);         // 0 + 1 remainder
      expect(result.alpha).toBe(0);
      expect(result.beta).toBe(0);
      expect(result.gamma).toBe(0);
      expect(result.delta).toBe(0);
      expect(result.remainder).toBe(1);
      expect(result.verification.matchesInput).toBe(true);
    });

    it('should handle very large revenue amounts', () => {
      const result = calculateDistribution(999999999); // ~1B USDT
      
      expect(result.verification.matchesInput).toBe(true);
      expect(result.remainder).toBeLessThan(10); // Remainder should be small
      expect(result.opc).toBeGreaterThan(699999999); // ~70% of 1B
    });
  });

  describe('Basis Points Validation', () => {
    it('should use exactly 10,000 basis points as denominator', () => {
      expect(DENOM).toBe(10000);
      expect(OPC_BPS + ALPHA_BPS + BETA_BPS + GAMMA_BPS + DELTA_BPS).toBe(10000);
    });

    it('should maintain exact percentage ratios', () => {
      expect(OPC_BPS / DENOM).toBe(0.70);    // 70%
      expect(ALPHA_BPS / DENOM).toBe(0.20);  // 20%
      expect(BETA_BPS / DENOM).toBe(0.03);   // 3%
      expect(GAMMA_BPS / DENOM).toBe(0.03);  // 3%
      expect(DELTA_BPS / DENOM).toBe(0.04);  // 4%
    });
  });

  describe('Precision and Accuracy', () => {
    it('should maintain precision for 6-decimal USDT amounts', () => {
      // Test with 6-decimal precision (USDT standard)
      const result = calculateDistribution(1000000); // 1.000000 USDT in smallest units
      
      expect(result.verification.matchesInput).toBe(true);
      expect(Number.isInteger(result.opc)).toBe(true);
      expect(Number.isInteger(result.alpha)).toBe(true);
      expect(Number.isInteger(result.beta)).toBe(true);
      expect(Number.isInteger(result.gamma)).toBe(true);
      expect(Number.isInteger(result.delta)).toBe(true);
    });

    it('should handle floating point precision correctly', () => {
      // Test cases that might cause floating point issues
      const testAmounts = [333, 666, 999, 1111, 3333, 6666, 9999];
      
      for (const amount of testAmounts) {
        const result = calculateDistribution(amount);
        expect(result.verification.matchesInput).toBe(true);
      }
    });
  });

  describe('Audit Trail Requirements (FR-007)', () => {
    it('should provide complete calculation breakdown for audit', () => {
      const result = calculateDistribution(12345);
      
      // Audit trail should include:
      expect(result.totalR).toBeDefined();
      expect(result.allocated).toBeDefined();
      expect(result.remainder).toBeDefined();
      expect(result.verification).toBeDefined();
      
      // Verification calculations
      expect(result.verification.totalDistributed).toBe(result.totalR);
      expect(result.verification.matchesInput).toBe(true);
    });

    it('should enable verification of each calculation step', () => {
      const totalR = 10001;
      
      // Manual calculation for verification
      const expectedOpcBase = Math.floor((totalR * 7000) / 10000); // 7000
      const expectedAlpha = Math.floor((totalR * 2000) / 10000);   // 2000
      const expectedBeta = Math.floor((totalR * 300) / 10000);     // 300
      const expectedGamma = Math.floor((totalR * 300) / 10000);    // 300
      const expectedDelta = Math.floor((totalR * 400) / 10000);    // 400
      const expectedRemainder = totalR - (expectedOpcBase + expectedAlpha + expectedBeta + expectedGamma + expectedDelta); // 1
      const expectedOpcFinal = expectedOpcBase + expectedRemainder; // 7001
      
      const result = calculateDistribution(totalR);
      
      expect(result.alpha).toBe(expectedAlpha);
      expect(result.beta).toBe(expectedBeta);
      expect(result.gamma).toBe(expectedGamma);
      expect(result.delta).toBe(expectedDelta);
      expect(result.remainder).toBe(expectedRemainder);
      expect(result.opc).toBe(expectedOpcFinal);
    });
  });

  describe('Compliance with Product Specification', () => {
    it('should match exact formulas from Section 2', () => {
      // Test the exact formulas from product spec:
      // OPC = floor(R * 7_000 / 10_000)
      // PoolAlpha = floor(R * 2_000 / 10_000)
      // PoolBeta = floor(R * 300 / 10_000)
      // PoolGamma = floor(R * 300 / 10_000)
      // PoolDelta = floor(R * 400 / 10_000)
      // remTop = R - (OPC + PoolAlpha + PoolBeta + PoolGamma + PoolDelta)
      
      const testCases = [
        { R: 10000, expectedRemainder: 0 },
        { R: 10001, expectedRemainder: 1 },
        { R: 10009, expectedRemainder: 2 }, // Fixed: floor calculations create different remainder
        { R: 1, expectedRemainder: 1 },
        { R: 100, expectedRemainder: 0 }, // Fixed: R=100 has perfect division
      ];

      for (const testCase of testCases) {
        const result = calculateDistribution(testCase.R);
        expect(result.remainder).toBe(testCase.expectedRemainder);
        expect(result.verification.matchesInput).toBe(true);
      }
    });

    it('should implement deterministic math as specified', () => {
      // Deterministic means same input always produces same output
      const amount = 98765;
      const results = Array.from({ length: 100 }, () => calculateDistribution(amount));
      
      // All results should be identical
      const firstResult = results[0];
      for (const result of results) {
        expect(result).toEqual(firstResult);
      }
    });
  });
});
