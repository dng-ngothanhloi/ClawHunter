import { expect } from "chai";
import { ethers } from "hardhat";
import { RevenuePool, RevenueSplitter } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("RevenuePool Contract Tests (FR-001, FR-012)", function () {
  let revenuePool: RevenuePool;
  let revenueSplitter: RevenueSplitter;
  let owner: SignerWithAddress;
  let oracle1: SignerWithAddress;
  let oracle2: SignerWithAddress;
  let unauthorized: SignerWithAddress;

  const EPOCH0_START = Math.floor(Date.now() / 1000) - 86400; // 1 day ago
  const EPOCH_DURATION = 86400; // 24 hours
  const GRACE_PERIOD = 7200; // 2 hours

  beforeEach(async function () {
    [owner, oracle1, oracle2, unauthorized] = await ethers.getSigners();
    
    // Deploy contracts - THESE WILL FAIL UNTIL IMPLEMENTATION
    const RevenuePoolFactory = await ethers.getContractFactory("RevenuePool");
    revenuePool = await RevenuePoolFactory.deploy(
      EPOCH0_START,
      EPOCH_DURATION,
      GRACE_PERIOD
    );

    const RevenueSplitterFactory = await ethers.getContractFactory("RevenueSplitter");
    revenueSplitter = await RevenueSplitterFactory.deploy();
    
    await revenuePool.setSplitter(await revenueSplitter.getAddress());
  });

  describe("Oracle Management (FR-012)", function () {
    it("should allow owner to add oracle to allowlist", async function () {
      await expect(revenuePool.connect(owner).addOracle(oracle1.address))
        .to.emit(revenuePool, "OracleAdded")
        .withArgs(oracle1.address);
      
      expect(await revenuePool.isAllowlistedOracle(oracle1.address)).to.be.true;
    });

    it("should allow owner to remove oracle from allowlist", async function () {
      await revenuePool.addOracle(oracle1.address);
      
      await expect(revenuePool.connect(owner).removeOracle(oracle1.address))
        .to.emit(revenuePool, "OracleRemoved")
        .withArgs(oracle1.address);
      
      expect(await revenuePool.isAllowlistedOracle(oracle1.address)).to.be.false;
    });

    it("should reject non-owner oracle management", async function () {
      await expect(revenuePool.connect(unauthorized).addOracle(oracle1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Epoch Management (FR-001, FR-008)", function () {
    it("should calculate current epoch ID correctly", async function () {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const expectedEpochId = Math.floor((currentTimestamp - EPOCH0_START) / EPOCH_DURATION) + 1;
      
      expect(await revenuePool.getCurrentEpochId()).to.equal(expectedEpochId);
    });

    it("should calculate grace window deadline correctly", async function () {
      const epochId = 1;
      const expectedDeadline = EPOCH0_START + (epochId * EPOCH_DURATION) + GRACE_PERIOD;
      
      expect(await revenuePool.getGraceWindowDeadline(epochId)).to.equal(expectedDeadline);
    });

    it("should track epoch finalization state", async function () {
      const epochId = 1;
      expect(await revenuePool.isEpochFinalized(epochId)).to.be.false;
      
      // This will fail until implementation
      await revenuePool.finalizeEpoch(epochId);
      expect(await revenuePool.isEpochFinalized(epochId)).to.be.true;
    });
  });

  describe("Revenue Posting (FR-001)", function () {
    beforeEach(async function () {
      await revenuePool.addOracle(oracle1.address);
    });

    it("should post revenue with valid oracle signature", async function () {
      const epochId = 1;
      const totalRevenue = ethers.parseEther("1000"); // 1000 ETH
      const machineRevenues = [
        { machineId: 1, revenueAmount: ethers.parseEther("600") },
        { machineId: 2, revenueAmount: ethers.parseEther("400") }
      ];
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test-merkle-root"));
      
      // Create signature (this will fail until oracle signature validation is implemented)
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bytes32"],
        [epochId, totalRevenue, merkleRoot]
      );
      const signature = await oracle1.signMessage(ethers.getBytes(messageHash));

      await expect(
        revenuePool.connect(oracle1).postRevenue(
          epochId,
          totalRevenue,
          machineRevenues,
          merkleRoot,
          signature
        )
      )
        .to.emit(revenuePool, "RevenuePosted")
        .withArgs(epochId, totalRevenue, merkleRoot, oracle1.address, anyValue);

      expect(await revenuePool.isOraclePosted(epochId)).to.be.true;
    });

    it("should reject unauthorized oracle posting", async function () {
      const epochId = 1;
      const totalRevenue = ethers.parseEther("1000");
      const machineRevenues = [];
      const merkleRoot = ethers.ZeroHash;
      const signature = "0x";

      await expect(
        revenuePool.connect(unauthorized).postRevenue(
          epochId,
          totalRevenue,
          machineRevenues,
          merkleRoot,
          signature
        )
      ).to.be.revertedWith("Oracle not allowlisted");
    });

    it("should prevent duplicate revenue posting for same epoch", async function () {
      const epochId = 1;
      const totalRevenue = ethers.parseEther("1000");
      const machineRevenues = [];
      const merkleRoot = ethers.ZeroHash;
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bytes32"],
        [epochId, totalRevenue, merkleRoot]
      );
      const signature = await oracle1.signMessage(ethers.getBytes(messageHash));

      // First posting should succeed
      await revenuePool.connect(oracle1).postRevenue(
        epochId,
        totalRevenue,
        machineRevenues,
        merkleRoot,
        signature
      );

      // Second posting should fail
      await expect(
        revenuePool.connect(oracle1).postRevenue(
          epochId,
          totalRevenue,
          machineRevenues,
          merkleRoot,
          signature
        )
      ).to.be.revertedWith("Revenue already posted for epoch");
    });
  });

  describe("Grace Window Management", function () {
    it("should finalize epoch with R=0 after grace window", async function () {
      const epochId = 1;
      
      // Fast forward past grace window
      const deadline = await revenuePool.getGraceWindowDeadline(epochId);
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deadline) + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(revenuePool.finalizeEpoch(epochId))
        .to.emit(revenuePool, "EpochFinalized")
        .withArgs(epochId, 0, false, anyValue);

      expect(await revenuePool.isEpochFinalized(epochId)).to.be.true;
      const epochData = await revenuePool.getEpoch(epochId);
      expect(epochData.totalRevenue).to.equal(0);
      expect(epochData.oraclePosted).to.be.false;
    });

    it("should reject finalization before grace window expires", async function () {
      const epochId = 1;
      
      await expect(revenuePool.finalizeEpoch(epochId))
        .to.be.revertedWith("Grace period not expired");
    });
  });

  describe("Gas Usage Optimization", function () {
    it("should stay within 100k gas limit for revenue posting", async function () {
      await revenuePool.addOracle(oracle1.address);
      
      const epochId = 1;
      const totalRevenue = ethers.parseEther("1000");
      const machineRevenues = Array.from({ length: 10 }, (_, i) => ({
        machineId: i + 1,
        revenueAmount: ethers.parseEther("100")
      }));
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const messageHash = ethers.solidityPackedKeccak256(
        ["uint256", "uint256", "bytes32"],
        [epochId, totalRevenue, merkleRoot]
      );
      const signature = await oracle1.signMessage(ethers.getBytes(messageHash));

      const tx = await revenuePool.connect(oracle1).postRevenue(
        epochId,
        totalRevenue,
        machineRevenues,
        merkleRoot,
        signature
      );
      
      const receipt = await tx.wait();
      expect(receipt?.gasUsed).to.be.lessThan(100000); // Gas target: <100k
    });
  });
});

// Helper for any value matching
const anyValue = expect.anything();
