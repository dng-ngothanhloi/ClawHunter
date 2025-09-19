import { expect } from "chai";
import { ethers } from "hardhat";
import { RevenueSplitter, RevenuePool } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Revenue Top Level (70/20/3/3/4 Split)", function () {
  let revenueSplitter: RevenueSplitter;
  let revenuePool: RevenuePool;
  let owner: SignerWithAddress;
  let oracle: SignerWithAddress;

  beforeEach(async function () {
    [owner, oracle] = await ethers.getSigners();

    // Deploy RevenueSplitter
    const RevenueSplitterFactory = await ethers.getContractFactory("RevenueSplitter");
    revenueSplitter = await RevenueSplitterFactory.deploy();
    await revenueSplitter.waitForDeployment();

    // Deploy RevenuePool
    const RevenuePoolFactory = await ethers.getContractFactory("RevenuePool");
    revenuePool = await RevenuePoolFactory.deploy(owner.address);
    await revenuePool.waitForDeployment();

    // Wire contracts
    await revenuePool.setSplitter(await revenueSplitter.getAddress());
    await revenuePool.setOracle(oracle.address, true);
  });

  it("Should split revenue with exact 70/20/3/3/4 percentages", async function () {
    const testRevenue = ethers.parseEther("1000"); // 1000 ETH
    const epochId = 1;

    // Call splitRevenue directly
    const tx = await revenueSplitter.splitRevenue(epochId, testRevenue);
    const receipt = await tx.wait();

    // Verify gas usage is reasonable
    expect(receipt?.gasUsed).to.be.lt(100000); // Less than 100k gas

    // Get distribution
    const distribution = await revenueSplitter.getRevenueDistribution(epochId);

    // Calculate expected values (floor division)
    const expectedOpc = (testRevenue * 7000n) / 10000n;
    const expectedAlpha = (testRevenue * 2000n) / 10000n;
    const expectedBeta = (testRevenue * 300n) / 10000n;
    const expectedGamma = (testRevenue * 300n) / 10000n;
    const expectedDelta = (testRevenue * 400n) / 10000n;

    const baseSum = expectedOpc + expectedAlpha + expectedBeta + expectedGamma + expectedDelta;
    const remainder = testRevenue - baseSum;
    const expectedOpcWithRemainder = expectedOpc + remainder;

    // Verify exact amounts
    expect(distribution.opcAmount).to.equal(expectedOpcWithRemainder);
    expect(distribution.alphaAmount).to.equal(expectedAlpha);
    expect(distribution.betaAmount).to.equal(expectedBeta);
    expect(distribution.gammaAmount).to.equal(expectedGamma);
    expect(distribution.deltaAmount).to.equal(expectedDelta);

    // Verify total preservation
    const totalDistributed = distribution.opcAmount + distribution.alphaAmount + 
                             distribution.betaAmount + distribution.gammaAmount + 
                             distribution.deltaAmount;
    expect(totalDistributed).to.equal(testRevenue);

    console.log("✅ Revenue Split Results:");
    console.log(`  Total Revenue: ${ethers.formatEther(testRevenue)} ETH`);
    console.log(`  OPC (70%): ${ethers.formatEther(distribution.opcAmount)} ETH`);
    console.log(`  Alpha (20%): ${ethers.formatEther(distribution.alphaAmount)} ETH`);
    console.log(`  Beta (3%): ${ethers.formatEther(distribution.betaAmount)} ETH`);
    console.log(`  Gamma (3%): ${ethers.formatEther(distribution.gammaAmount)} ETH`);
    console.log(`  Delta (4%): ${ethers.formatEther(distribution.deltaAmount)} ETH`);
    console.log(`  Remainder added to OPC: ${ethers.formatEther(remainder)} ETH`);
    console.log(`  Gas used: ${receipt?.gasUsed}`);
  });

  it("Should handle remainder correctly with odd numbers", async function () {
    const testRevenue = 1001n; // Odd number that will create remainder
    const epochId = 2;

    await revenueSplitter.splitRevenue(epochId, testRevenue);
    const distribution = await revenueSplitter.getRevenueDistribution(epochId);

    // Calculate expected values
    const expectedOpcBase = (testRevenue * 7000n) / 10000n; // 700
    const expectedAlpha = (testRevenue * 2000n) / 10000n;   // 200
    const expectedBeta = (testRevenue * 300n) / 10000n;     // 30
    const expectedGamma = (testRevenue * 300n) / 10000n;    // 30
    const expectedDelta = (testRevenue * 400n) / 10000n;    // 40

    const baseSum = expectedOpcBase + expectedAlpha + expectedBeta + expectedGamma + expectedDelta;
    const remainder = testRevenue - baseSum; // Should be 1
    const expectedOpcWithRemainder = expectedOpcBase + remainder; // 701

    expect(distribution.opcAmount).to.equal(expectedOpcWithRemainder);
    expect(remainder).to.equal(1n); // Verify remainder is 1

    // Verify total preservation
    const totalDistributed = distribution.opcAmount + distribution.alphaAmount + 
                             distribution.betaAmount + distribution.gammaAmount + 
                             distribution.deltaAmount;
    expect(totalDistributed).to.equal(testRevenue);
  });

  it("Should validate basis points constants", async function () {
    const constants = await revenueSplitter.getConstants();
    
    expect(constants[0]).to.equal(10000); // DENOM
    expect(constants[1]).to.equal(7000);  // OPC_BPS
    expect(constants[2]).to.equal(2000);  // ALPHA_BPS
    expect(constants[3]).to.equal(300);   // BETA_BPS
    expect(constants[4]).to.equal(300);   // GAMMA_BPS
    expect(constants[5]).to.equal(400);   // DELTA_BPS

    // Verify they sum to 10000
    const sum = constants[1] + constants[2] + constants[3] + constants[4] + constants[5];
    expect(sum).to.equal(10000);
  });

  it("Should prevent double posting for same epoch", async function () {
    const testRevenue = ethers.parseEther("100");
    const epochId = 3;

    // First posting should succeed
    await revenueSplitter.splitRevenue(epochId, testRevenue);

    // Second posting should fail
    await expect(
      revenueSplitter.splitRevenue(epochId, testRevenue)
    ).to.be.revertedWith("Epoch already processed");
  });
});
