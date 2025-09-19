import { expect } from "chai";
import { ethers } from "hardhat";
import { CHGStaking, CHG } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CHGStaking Contract Tests (FR-004, FR-013)", function () {
  let chgStaking: CHGStaking;
  let chgToken: CHG;
  let owner: SignerWithAddress;
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;

  // Lock weight constants from specification
  const LOCK_WEIGHTS = {
    TIER1: 1000, // <30d = 1000bps (1x)
    TIER2: 1500, // 90d = 1500bps (1.5x)
    TIER3: 2000, // 180d = 2000bps (2x)
    TIER4: 3000  // 365d = 3000bps (3x)
  };

  const INVESTOR_PROGRAM_MIN_DAYS = 1095; // 3 years

  beforeEach(async function () {
    [owner, staker1, staker2] = await ethers.getSigners();
    
    // Deploy CHG token first
    const CHGFactory = await ethers.getContractFactory("CHG");
    chgToken = await CHGFactory.deploy("ClawHunters Game", "CHG");
    
    // Deploy staking contract - THIS WILL FAIL UNTIL IMPLEMENTATION
    const CHGStakingFactory = await ethers.getContractFactory("CHGStaking");
    chgStaking = await CHGStakingFactory.deploy(await chgToken.getAddress());

    // Mint tokens for testing
    await chgToken.mint(staker1.address, ethers.parseEther("1000"));
    await chgToken.mint(staker2.address, ethers.parseEther("2000"));
  });

  describe("Lock Weight Calculation (FR-004)", function () {
    it("should calculate correct lock weights for all tiers", async function () {
      const testCases = [
        { days: 29, expected: LOCK_WEIGHTS.TIER1 },   // <30d
        { days: 30, expected: LOCK_WEIGHTS.TIER1 },   // 30d
        { days: 89, expected: LOCK_WEIGHTS.TIER1 },   // 89d
        { days: 90, expected: LOCK_WEIGHTS.TIER2 },   // 90d
        { days: 179, expected: LOCK_WEIGHTS.TIER2 },  // 179d
        { days: 180, expected: LOCK_WEIGHTS.TIER3 },  // 180d
        { days: 364, expected: LOCK_WEIGHTS.TIER3 },  // 364d
        { days: 365, expected: LOCK_WEIGHTS.TIER4 },  // 365d
        { days: 1095, expected: LOCK_WEIGHTS.TIER4 }  // 3 years
      ];

      for (const testCase of testCases) {
        const weight = await chgStaking.calculateLockWeight(testCase.days);
        expect(weight).to.equal(testCase.expected, 
          `Lock weight for ${testCase.days} days should be ${testCase.expected} bps`);
      }
    });

    it("should identify investor program eligibility", async function () {
      expect(await chgStaking.isInvestorProgram(1094)).to.be.false; // Just under 3 years
      expect(await chgStaking.isInvestorProgram(1095)).to.be.true;  // Exactly 3 years
      expect(await chgStaking.isInvestorProgram(1460)).to.be.true;  // 4 years
    });
  });

  describe("Staking Operations (FR-004)", function () {
    beforeEach(async function () {
      // Approve staking contract to spend tokens
      await chgToken.connect(staker1).approve(await chgStaking.getAddress(), ethers.parseEther("1000"));
      await chgToken.connect(staker2).approve(await chgStaking.getAddress(), ethers.parseEther("2000"));
    });

    it("should allow CHG staking with lock duration", async function () {
      const stakeAmount = ethers.parseEther("100");
      const lockDays = 365;
      const expectedWeight = LOCK_WEIGHTS.TIER4;

      await expect(chgStaking.connect(staker1).stake(stakeAmount, lockDays))
        .to.emit(chgStaking, "Staked")
        .withArgs(staker1.address, anyValue, stakeAmount, lockDays, expectedWeight, true); // investor program

      const position = await chgStaking.getStakingPosition(staker1.address, 1);
      expect(position.stakedAmount).to.equal(stakeAmount);
      expect(position.lockDurationDays).to.equal(lockDays);
      expect(position.lockWeight).to.equal(expectedWeight);
      expect(position.investorProgram).to.be.true;
      expect(position.active).to.be.true;
    });

    it("should calculate effective weight correctly", async function () {
      const stakeAmount = ethers.parseEther("100"); // 100 CHG
      const lockDays = 180; // 2000 bps weight
      
      await chgStaking.connect(staker1).stake(stakeAmount, lockDays);
      
      const effectiveWeight = await chgStaking.calculateEffectiveWeight(staker1.address, 1);
      const expectedWeight = stakeAmount * BigInt(LOCK_WEIGHTS.TIER3);
      
      expect(effectiveWeight).to.equal(expectedWeight);
    });

    it("should enforce lock period for unstaking", async function () {
      const stakeAmount = ethers.parseEther("100");
      const lockDays = 90;
      
      await chgStaking.connect(staker1).stake(stakeAmount, lockDays);
      
      // Should fail immediately after staking
      await expect(chgStaking.connect(staker1).unstake(1))
        .to.be.revertedWith("Position still locked");
      
      // Fast forward past lock period
      const lockSeconds = lockDays * 24 * 60 * 60;
      await ethers.provider.send("evm_increaseTime", [lockSeconds]);
      await ethers.provider.send("evm_mine", []);
      
      // Should succeed after lock period
      await expect(chgStaking.connect(staker1).unstake(1))
        .to.emit(chgStaking, "Unstaked")
        .withArgs(staker1.address, 1, stakeAmount);
    });

    it("should expose unstake() and claim() methods as required", async function () {
      const stakeAmount = ethers.parseEther("100");
      const lockDays = 30;
      
      await chgStaking.connect(staker1).stake(stakeAmount, lockDays);
      
      // Verify methods exist and are callable
      expect(chgStaking.interface.getFunction("unstake")).to.not.be.null;
      expect(chgStaking.interface.getFunction("claim")).to.not.be.null;
      
      // Test claim method (should work even with 0 rewards)
      await expect(chgStaking.connect(staker1).claim(1))
        .to.not.be.reverted;
    });
  });

  describe("Reward Distribution (Alpha Pool)", function () {
    it("should calculate staking rewards with lock weights", async function () {
      // Setup two stakers with different lock periods
      await chgStaking.connect(staker1).stake(ethers.parseEther("100"), 30);  // 1000 bps
      await chgStaking.connect(staker2).stake(ethers.parseEther("100"), 365); // 3000 bps

      const poolAlpha = ethers.parseEther("1000"); // 1000 ETH to distribute
      const epochId = 1;

      // Calculate expected weights
      const weight1 = ethers.parseEther("100") * BigInt(LOCK_WEIGHTS.TIER1); // 100 * 1000
      const weight2 = ethers.parseEther("100") * BigInt(LOCK_WEIGHTS.TIER4); // 100 * 3000
      const totalWeight = weight1 + weight2;

      const expectedReward1 = (poolAlpha * weight1) / totalWeight; // Floor division
      const expectedReward2 = (poolAlpha * weight2) / totalWeight; // Floor division

      const [rewards, remainder] = await chgStaking.calculateStakingRewards(
        epochId,
        poolAlpha,
        [
          { staker: staker1.address, positionId: 1, amount: ethers.parseEther("100"), weight: LOCK_WEIGHTS.TIER1 },
          { staker: staker2.address, positionId: 2, amount: ethers.parseEther("100"), weight: LOCK_WEIGHTS.TIER4 }
        ]
      );

      expect(rewards[0].rewardAmount).to.equal(expectedReward1);
      expect(rewards[1].rewardAmount).to.equal(expectedReward2);
      
      // Verify remainder calculation
      const totalDistributed = expectedReward1 + expectedReward2;
      const expectedRemainder = poolAlpha - totalDistributed;
      expect(remainder).to.equal(expectedRemainder);
    });

    it("should assign remainder to oldest active position", async function () {
      // Create positions with different start times
      await chgStaking.connect(staker1).stake(ethers.parseEther("100"), 30);
      
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [3600]); // 1 hour
      await ethers.provider.send("evm_mine", []);
      
      await chgStaking.connect(staker2).stake(ethers.parseEther("100"), 30);

      const poolAlpha = 1001n; // Amount that will create remainder
      const epochId = 1;

      const [rewards, remainder] = await chgStaking.calculateStakingRewards(epochId, poolAlpha, [
        { staker: staker1.address, positionId: 1, amount: 100n, weight: LOCK_WEIGHTS.TIER1 },
        { staker: staker2.address, positionId: 2, amount: 100n, weight: LOCK_WEIGHTS.TIER1 }
      ]);

      // Oldest position (staker1) should get remainder
      const oldestPositionId = await chgStaking.findOldestPosition([1, 2]);
      expect(oldestPositionId).to.equal(1); // staker1's position
    });
  });

  describe("Investor Program (FR-013)", function () {
    it("should require minimum 3-year lock for investor program", async function () {
      const stakeAmount = ethers.parseEther("1000");
      
      // Less than 3 years - no investor program
      await chgStaking.connect(staker1).stake(stakeAmount, 1094);
      let position = await chgStaking.getStakingPosition(staker1.address, 1);
      expect(position.investorProgram).to.be.false;
      
      // Exactly 3 years - investor program eligible
      await chgStaking.connect(staker2).stake(stakeAmount, 1095);
      position = await chgStaking.getStakingPosition(staker2.address, 2);
      expect(position.investorProgram).to.be.true;
    });

    it("should enforce 3-year minimum for investor benefits", async function () {
      const stakeAmount = ethers.parseEther("1000");
      
      await chgStaking.connect(staker1).stake(stakeAmount, 1095); // 3 years
      
      // Early unstaking should forfeit investor benefits
      await expect(chgStaking.connect(staker1).unstake(1))
        .to.be.revertedWith("Position still locked");
      
      // Should not be able to unstake before 3 years for investor program
      await ethers.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]); // 1 year
      await expect(chgStaking.connect(staker1).unstake(1))
        .to.be.revertedWith("Position still locked");
    });
  });

  describe("Edge Cases", function () {
    it("should handle zero total weight (no active stakers)", async function () {
      const poolAlpha = ethers.parseEther("1000");
      const epochId = 1;

      const [rewards, remainder] = await chgStaking.calculateStakingRewards(epochId, poolAlpha, []);
      
      expect(rewards.length).to.equal(0);
      expect(remainder).to.equal(poolAlpha); // All goes to remainder
    });

    it("should handle inactive positions", async function () {
      await chgStaking.connect(staker1).stake(ethers.parseEther("100"), 30);
      
      // Deactivate position
      await chgStaking.setPositionActive(1, false);
      
      const effectiveWeight = await chgStaking.calculateEffectiveWeight(staker1.address, 1);
      expect(effectiveWeight).to.equal(0); // Inactive positions have 0 weight
    });
  });
});

const anyValue = expect.anything();
