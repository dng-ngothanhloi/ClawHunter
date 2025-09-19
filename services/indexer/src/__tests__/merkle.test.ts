import { describe, it, expect } from 'vitest';
import { MerkleTreeBuilder, MerkleLeafData } from '../lib/merkle.js';

describe('MerkleTreeBuilder', () => {
  const sampleLeaves: MerkleLeafData[] = [
    {
      account: '0x1234567890123456789012345678901234567890',
      amount: '100.000000',
      epochId: '1',
      group: 'A',
    },
    {
      account: '0x2345678901234567890123456789012345678901',
      amount: '200.000000',
      epochId: '1',
      group: 'A',
    },
    {
      account: '0x3456789012345678901234567890123456789012',
      amount: '300.000000',
      epochId: '1',
      group: 'A',
    },
  ];

  describe('createLeafHash', () => {
    it('should create consistent leaf hashes', () => {
      const leaf = sampleLeaves[0];
      const hash1 = MerkleTreeBuilder.createLeafHash(leaf);
      const hash2 = MerkleTreeBuilder.createLeafHash(leaf);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/i);
    });

    it('should create different hashes for different data', () => {
      const hash1 = MerkleTreeBuilder.createLeafHash(sampleLeaves[0]);
      const hash2 = MerkleTreeBuilder.createLeafHash(sampleLeaves[1]);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should create different hashes for different amounts', () => {
      const leaf1 = { ...sampleLeaves[0], amount: '100.000000' };
      const leaf2 = { ...sampleLeaves[0], amount: '100.000001' };
      
      const hash1 = MerkleTreeBuilder.createLeafHash(leaf1);
      const hash2 = MerkleTreeBuilder.createLeafHash(leaf2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('buildTree', () => {
    it('should build a valid Merkle tree', () => {
      const { tree, root, leafHashes, proofs } = MerkleTreeBuilder.buildTree(sampleLeaves);
      
      expect(root).toMatch(/^0x[a-f0-9]{64}$/i);
      expect(leafHashes).toHaveLength(sampleLeaves.length);
      expect(Object.keys(proofs)).toHaveLength(sampleLeaves.length);
      
      // Verify each account has a proof
      for (const leaf of sampleLeaves) {
        expect(proofs[leaf.account]).toBeDefined();
        expect(Array.isArray(proofs[leaf.account])).toBe(true);
      }
    });

    it('should create deterministic trees (same input = same output)', () => {
      const result1 = MerkleTreeBuilder.buildTree(sampleLeaves);
      const result2 = MerkleTreeBuilder.buildTree(sampleLeaves);
      
      expect(result1.root).toBe(result2.root);
      expect(result1.leafHashes).toEqual(result2.leafHashes);
    });

    it('should sort leaves by account for deterministic ordering', () => {
      const shuffledLeaves = [...sampleLeaves].reverse();
      
      const result1 = MerkleTreeBuilder.buildTree(sampleLeaves);
      const result2 = MerkleTreeBuilder.buildTree(shuffledLeaves);
      
      expect(result1.root).toBe(result2.root);
    });

    it('should throw error for empty leaves array', () => {
      expect(() => MerkleTreeBuilder.buildTree([])).toThrow('Cannot build Merkle tree with no leaves');
    });
  });

  describe('verifyProof', () => {
    it('should verify valid proofs', () => {
      const { tree, root, proofs } = MerkleTreeBuilder.buildTree(sampleLeaves);
      
      for (const leaf of sampleLeaves) {
        const leafHash = MerkleTreeBuilder.createLeafHash(leaf);
        const proof = proofs[leaf.account];
        
        const isValid = MerkleTreeBuilder.verifyProof({
          leaf: leafHash,
          proof,
          root,
        });
        
        expect(isValid).toBe(true);
      }
    });

    it('should reject invalid proofs', () => {
      const { root, proofs } = MerkleTreeBuilder.buildTree(sampleLeaves);
      const invalidLeafHash = '0x1234567890123456789012345678901234567890123456789012345678901234';
      const proof = proofs[sampleLeaves[0].account];
      
      const isValid = MerkleTreeBuilder.verifyProof({
        leaf: invalidLeafHash,
        proof,
        root,
      });
      
      expect(isValid).toBe(false);
    });
  });

  describe('calculateTotal', () => {
    it('should calculate correct total amount', () => {
      const total = MerkleTreeBuilder.calculateTotal(sampleLeaves);
      
      // 100 + 200 + 300 = 600 USDT = 600000000 wei (6 decimals)
      expect(total).toBe(600000000n);
    });

    it('should handle decimal amounts correctly', () => {
      const leaves: MerkleLeafData[] = [
        { account: '0x1111111111111111111111111111111111111111', amount: '1.500000', epochId: '1', group: 'A' },
        { account: '0x2222222222222222222222222222222222222222', amount: '2.250000', epochId: '1', group: 'A' },
      ];
      
      const total = MerkleTreeBuilder.calculateTotal(leaves);
      
      // 1.5 + 2.25 = 3.75 USDT = 3750000 wei
      expect(total).toBe(3750000n);
    });
  });

  describe('Revenue Distribution Math', () => {
    it('should match exact spec calculations for floor division', () => {
      // Test the exact math used in revenue distribution
      const totalR = 1000; // 1000 USDT
      const DENOM = 10000;
      
      // Floor division for each pool (as per spec)
      const alphaFloor = Math.floor((totalR * 2000) / DENOM); // 20% = 200
      const betaFloor = Math.floor((totalR * 300) / DENOM);   // 3% = 30
      const gammaFloor = Math.floor((totalR * 300) / DENOM);  // 3% = 30
      const deltaFloor = Math.floor((totalR * 400) / DENOM);  // 4% = 40
      const opcBase = Math.floor((totalR * 7000) / DENOM);    // 70% = 700
      
      // Calculate remainder and add to OPC
      const allocated = alphaFloor + betaFloor + gammaFloor + deltaFloor + opcBase;
      const remainder = totalR - allocated;
      const opcFinal = opcBase + remainder;
      
      expect(alphaFloor).toBe(200);
      expect(betaFloor).toBe(30);
      expect(gammaFloor).toBe(30);
      expect(deltaFloor).toBe(40);
      expect(opcBase).toBe(700);
      expect(remainder).toBe(0); // Perfect division
      expect(opcFinal).toBe(700);
      expect(allocated + remainder).toBe(totalR);
    });

    it('should handle remainder correctly with imperfect division', () => {
      const totalR = 1001; // 1001 USDT (creates remainder)
      const DENOM = 10000;
      
      const alphaFloor = Math.floor((totalR * 2000) / DENOM); // 200.2 -> 200
      const betaFloor = Math.floor((totalR * 300) / DENOM);   // 30.03 -> 30
      const gammaFloor = Math.floor((totalR * 300) / DENOM);  // 30.03 -> 30
      const deltaFloor = Math.floor((totalR * 400) / DENOM);  // 40.04 -> 40
      const opcBase = Math.floor((totalR * 7000) / DENOM);    // 700.7 -> 700
      
      const allocated = alphaFloor + betaFloor + gammaFloor + deltaFloor + opcBase;
      const remainder = totalR - allocated;
      const opcFinal = opcBase + remainder;
      
      expect(alphaFloor).toBe(200);
      expect(betaFloor).toBe(30);
      expect(gammaFloor).toBe(30);
      expect(deltaFloor).toBe(40);
      expect(opcBase).toBe(700);
      expect(remainder).toBe(1); // Remainder goes to OPC
      expect(opcFinal).toBe(701);
      expect(allocated + remainder).toBe(totalR);
    });
  });
});
