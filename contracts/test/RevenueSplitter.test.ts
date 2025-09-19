import { expect } from "chai";
import { ethers } from "hardhat";
import { RevenueSplitter } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("RevenueSplitter Contract Tests (FR-002)", function () {
  let revenueSplitter: RevenueSplitter;
  let owner: SignerWithAddress;

  // Constants from product specification
  const DENOM = 10000; // 100% in basis points
  const OPC_BPS = 7000;   // 70%
  const ALPHA_BPS = 2000; // 20% - Staking CHG
  const BETA_BPS = 300;   // 3% - NFTClaw L1
  const GAMMA_BPS = 300;  // 3% - NFTOwner L2
  const DELTA_BPS = 400;  // 4% - RewardPool

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    
    // Deploy contract - THIS WILL FAIL UNTIL IMPLEMENTATION
    const RevenueSplitterFactory = await ethers.getContractFactory("RevenueSplitter");
    revenueSplitter = await RevenueSplitterFactory.deploy();
  });

  describe("Mathematical Distribution (FR-002)", function () {
    it("should split revenue exactly 70/20/3/3/4 with floor division", async function () {
      const epochId = 1;
      const totalRevenue = 1000000n; // 1M wei

      // Expected floor calculations
      const expectedOpc = (totalRevenue * BigInt(OPC_BPS)) / BigInt(DENOM);
      const expectedAlpha = (totalRevenue * BigInt(ALPHA_BPS)) / BigInt(DENOM);
      const expectedBeta = (totalRevenue * BigInt(BETA_BPS)) / BigInt(DENOM);
      const expectedGamma = (totalRevenue * BigInt(GAMMA_BPS)) / BigInt(DENOM);
      const expectedDelta = (totalRevenue * BigInt(DELTA_BPS)) / BigInt(DENOM);
      
      const expectedSum = expectedOpc + expectedAlpha + expectedBeta + expectedGamma + expectedDelta;
      const expectedRemainder = totalRevenue - expectedSum;
      const expectedOpcWithRemainder = expectedOpc + expectedRemainder;

      await expect(revenueSplitter.splitRevenue(epochId, totalRevenue))
        .to.emit(revenueSplitter, "RevenueSplit")
        .withArgs(
          epochId,
          totalRevenue,
          expectedOpcWithRemainder, // OPC gets remainder
          expectedAlpha,
          expectedBeta,
          expectedGamma,
          expectedDelta,
          expectedRemainder
        );

      const distribution = await revenueSplitter.getRevenueDistribution(epochId);
      expect(distribution.opcAmount).to.equal(expectedOpcWithRemainder);
      expect(distribution.alphaAmount).to.equal(expectedAlpha);
      expect(distribution.betaAmount).to.equal(expectedBeta);
      expect(distribution.gammaAmount).to.equal(expectedGamma);
      expect(distribution.deltaAmount).to.equal(expectedDelta);
      expect(distribution.remainderAmount).to.equal(expectedRemainder);
    });

    it("should handle remainder correctly (remTop → OPC)", async function () {
      const epochId = 2;
      const totalRevenue = 1000001n; // 1M + 1 wei (will have remainder)

      const expectedOpc = (totalRevenue * BigInt(OPC_BPS)) / BigInt(DENOM);
      const expectedAlpha = (totalRevenue * BigInt(ALPHA_BPS)) / BigInt(DENOM);
      const expectedBeta = (totalRevenue * BigInt(BETA_BPS)) / BigInt(DENOM);
      const expectedGamma = (totalRevenue * BigInt(GAMMA_BPS)) / BigInt(DENOM);
      const expectedDelta = (totalRevenue * BigInt(DELTA_BPS)) / BigInt(DENOM);
      
      const expectedSum = expectedOpc + expectedAlpha + expectedBeta + expectedGamma + expectedDelta;
      const expectedRemainder = totalRevenue - expectedSum;

      await revenueSplitter.splitRevenue(epochId, totalRevenue);
      
      const distribution = await revenueSplitter.getRevenueDistribution(epochId);
      
      // Verify remainder goes to OPC
      expect(distribution.remainderAmount).to.equal(expectedRemainder);
      expect(distribution.opcAmount).to.equal(expectedOpc + expectedRemainder);
      
      // Verify total preservation
      const totalDistributed = distribution.opcAmount + distribution.alphaAmount + 
                              distribution.betaAmount + distribution.gammaAmount + distribution.deltaAmount;
      expect(totalDistributed).to.equal(totalRevenue);
    });

    it("should use floor division exclusively (no rounding)", async function () {
      const testCases = [
        1n,      // Edge case: 1 wei
        7n,      // Small amount
        999n,    // Under 1000
        1000001n // Large amount with remainder
      ];

      for (const revenue of testCases) {
        const epochId = testCases.indexOf(revenue) + 10;
        
        // Manual floor calculation
        const expectedOpc = (revenue * BigInt(OPC_BPS)) / BigInt(DENOM);
        const expectedAlpha = (revenue * BigInt(ALPHA_BPS)) / BigInt(DENOM);
        
        await revenueSplitter.splitRevenue(epochId, revenue);
        const distribution = await revenueSplitter.getRevenueDistribution(epochId);
        
        expect(distribution.opcAmount).to.be.gte(expectedOpc); // OPC gets remainder
        expect(distribution.alphaAmount).to.equal(expectedAlpha);
        
        // Verify total preservation
        const total = distribution.opcAmount + distribution.alphaAmount + 
                     distribution.betaAmount + distribution.gammaAmount + distribution.deltaAmount;
        expect(total).to.equal(revenue);
      }
    });

    it("should handle zero revenue case", async function () {
      const epochId = 99;
      const totalRevenue = 0n;

      await revenueSplitter.splitRevenue(epochId, totalRevenue);
      const distribution = await revenueSplitter.getRevenueDistribution(epochId);
      
      expect(distribution.opcAmount).to.equal(0);
      expect(distribution.alphaAmount).to.equal(0);
      expect(distribution.betaAmount).to.equal(0);
      expect(distribution.gammaAmount).to.equal(0);
      expect(distribution.deltaAmount).to.equal(0);
      expect(distribution.remainderAmount).to.equal(0);
    });
  });

  describe("Basis Points Constants", function () {
    it("should have correct basis point constants", async function () {
      expect(await revenueSplitter.DENOM()).to.equal(DENOM);
      expect(await revenueSplitter.OPC_BPS()).to.equal(OPC_BPS);
      expect(await revenueSplitter.ALPHA_BPS()).to.equal(ALPHA_BPS);
      expect(await revenueSplitter.BETA_BPS()).to.equal(BETA_BPS);
      expect(await revenueSplitter.GAMMA_BPS()).to.equal(GAMMA_BPS);
      expect(await revenueSplitter.DELTA_BPS()).to.equal(DELTA_BPS);
      
      // Verify they sum to 100%
      const totalBps = OPC_BPS + ALPHA_BPS + BETA_BPS + GAMMA_BPS + DELTA_BPS;
      expect(totalBps).to.equal(DENOM);
    });
  });

  describe("Deterministic Results", function () {
    it("should produce same results for same inputs", async function () {
      const epochId1 = 100;
      const epochId2 = 101;
      const revenue = 1234567n;

      await revenueSplitter.splitRevenue(epochId1, revenue);
      await revenueSplitter.splitRevenue(epochId2, revenue);

      const dist1 = await revenueSplitter.getRevenueDistribution(epochId1);
      const dist2 = await revenueSplitter.getRevenueDistribution(epochId2);

      expect(dist1.opcAmount).to.equal(dist2.opcAmount);
      expect(dist1.alphaAmount).to.equal(dist2.alphaAmount);
      expect(dist1.betaAmount).to.equal(dist2.betaAmount);
      expect(dist1.gammaAmount).to.equal(dist2.gammaAmount);
      expect(dist1.deltaAmount).to.equal(dist2.deltaAmount);
      expect(dist1.remainderAmount).to.equal(dist2.remainderAmount);
    });
  });

  describe("Gas Optimization", function () {
    it("should optimize gas usage for complex calculations", async function () {
      const epochId = 1;
      const totalRevenue = ethers.parseEther("1000000"); // Large amount

      const tx = await revenueSplitter.splitRevenue(epochId, totalRevenue);
      const receipt = await tx.wait();
      
      // Gas target: reasonable for mathematical operations
      expect(receipt?.gasUsed).to.be.lessThan(80000);
    });
  });
});

// Note: These tests MUST FAIL before implementation (TDD requirement)
// Expected failures: Contract methods not implemented, events not defined
