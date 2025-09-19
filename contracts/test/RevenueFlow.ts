import { expect } from "chai";
import { ethers } from "hardhat";

describe("Revenue flow", function () {
  it("emits events and enforces sum constraint", async () => {
    const [owner] = await ethers.getSigners();
    const Pool = await ethers.getContractFactory("RevenuePool");
    const pool = await Pool.deploy(owner.address); await pool.waitForDeployment();
    const Split = await ethers.getContractFactory("RevenueSplitter");
    const split = await Split.deploy(); await split.waitForDeployment();
    await pool.setSplitter(await split.getAddress());
    await expect(split.setParams(4000,3000,2001,1000)).to.be.revertedWith("sum!=100%");
    await expect(split.distribute(1, 1000)).to.emit(split, "Distributed").withArgs(1, 1000, 4000, 3000, 2000, 1000);
    await expect(pool.postRevenue(2, 2000, ethers.ZeroHash)).to.emit(pool, "RevenuePosted");
  });
});
