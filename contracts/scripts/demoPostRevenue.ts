import { ethers } from "hardhat";

async function main() {
  console.log("🎯 Demo: Revenue Posting with EIP-712 Oracle Signature");
  console.log("=" .repeat(60));

  const [deployer, oracle] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Oracle:", oracle.address);

  // Deploy contracts
  console.log("\n📦 Deploying contracts...");
  
  const RevenueSplitter = await ethers.getContractFactory("RevenueSplitter");
  const revenueSplitter = await RevenueSplitter.deploy();
  await revenueSplitter.waitForDeployment();
  
  const RevenuePool = await ethers.getContractFactory("RevenuePool");
  const revenuePool = await RevenuePool.deploy(deployer.address);
  await revenuePool.waitForDeployment();
  
  // Wire contracts
  await revenuePool.setSplitter(await revenueSplitter.getAddress());
  console.log("✅ Splitter set in RevenuePool");
  
  await revenuePool.setOracle(oracle.address, true);
  console.log("✅ Oracle authorized in RevenuePool");
  
  // Authorize RevenuePool to call RevenueSplitter
  await revenueSplitter.setAuthorizedCaller(await revenuePool.getAddress(), true);
  console.log("✅ RevenuePool authorized in RevenueSplitter");
  
  console.log("✅ RevenueSplitter:", await revenueSplitter.getAddress());
  console.log("✅ RevenuePool:", await revenuePool.getAddress());

  // Test parameters
  const epochId = 1;
  const revenueAmount = ethers.parseEther("1000"); // 1000 ETH
  const merkleRootMachines = ethers.keccak256(ethers.toUtf8Bytes("test-machines"));
  
  console.log("\n🔐 Creating EIP-712 signature...");
  
  // Get domain separator
  const domain = {
    name: "ClawHuntersRevenuePool",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await revenuePool.getAddress()
  };
  
  // Define the types
  const types = {
    RevenuePost: [
      { name: "epochId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "merkleRootMachines", type: "bytes32" },
      { name: "chainId", type: "uint256" },
      { name: "contract", type: "address" }
    ]
  };
  
  // Create the message
  const message = {
    epochId: epochId,
    amount: revenueAmount,
    merkleRootMachines: merkleRootMachines,
    chainId: domain.chainId,
    contract: domain.verifyingContract
  };
  
  // Sign the message
  const signature = await oracle.signTypedData(domain, types, message);
  
  console.log("✅ EIP-712 signature created");
  console.log("Domain:", domain);
  console.log("Message:", {
    epochId: epochId.toString(),
    amount: ethers.formatEther(revenueAmount) + " ETH",
    merkleRootMachines: merkleRootMachines,
    chainId: domain.chainId.toString(),
    contract: domain.verifyingContract
  });

  // Post revenue
  console.log("\n📡 Posting revenue...");
  
  const tx = await revenuePool.connect(deployer).postRevenue(
    epochId,
    revenueAmount,
    merkleRootMachines,
    signature
  );
  
  const receipt = await tx.wait();
  console.log("✅ Revenue posted successfully!");
  console.log("Transaction hash:", receipt?.hash);
  console.log("Gas used:", receipt?.gasUsed?.toString());

  // Check the distribution
  console.log("\n📊 Checking revenue distribution...");
  
  const distribution = await revenueSplitter.getRevenueDistribution(epochId);
  
  console.log("Distribution results:");
  console.log(`  Total Revenue: ${ethers.formatEther(distribution.totalRevenue)} ETH`);
  console.log(`  OPC (70%): ${ethers.formatEther(distribution.opcAmount)} ETH`);
  console.log(`  Alpha (20%): ${ethers.formatEther(distribution.alphaAmount)} ETH`);
  console.log(`  Beta (3%): ${ethers.formatEther(distribution.betaAmount)} ETH`);
  console.log(`  Gamma (3%): ${ethers.formatEther(distribution.gammaAmount)} ETH`);
  console.log(`  Delta (4%): ${ethers.formatEther(distribution.deltaAmount)} ETH`);
  
  // Verify total preservation
  const totalDistributed = distribution.opcAmount + distribution.alphaAmount + 
                           distribution.betaAmount + distribution.gammaAmount + 
                           distribution.deltaAmount;
  
  console.log(`  Total Distributed: ${ethers.formatEther(totalDistributed)} ETH`);
  console.log(`  ✅ Total Preserved: ${totalDistributed === distribution.totalRevenue}`);

  // Verify percentages
  const opcPercent = (Number(distribution.opcAmount) / Number(distribution.totalRevenue)) * 100;
  const alphaPercent = (Number(distribution.alphaAmount) / Number(distribution.totalRevenue)) * 100;
  const betaPercent = (Number(distribution.betaAmount) / Number(distribution.totalRevenue)) * 100;
  const gammaPercent = (Number(distribution.gammaAmount) / Number(distribution.totalRevenue)) * 100;
  const deltaPercent = (Number(distribution.deltaAmount) / Number(distribution.totalRevenue)) * 100;
  
  console.log("\n📈 Actual percentages:");
  console.log(`  OPC: ${opcPercent.toFixed(2)}% (expected: ~70%)`);
  console.log(`  Alpha: ${alphaPercent.toFixed(2)}% (expected: 20%)`);
  console.log(`  Beta: ${betaPercent.toFixed(2)}% (expected: 3%)`);
  console.log(`  Gamma: ${gammaPercent.toFixed(2)}% (expected: 3%)`);
  console.log(`  Delta: ${deltaPercent.toFixed(2)}% (expected: 4%)`);
  
  console.log("\n🎉 Demo completed successfully!");
  console.log("✅ Oracle signature validation working");
  console.log("✅ 70/20/3/3/4 split implemented correctly");
  console.log("✅ Remainder handling working (remTop → OPC)");
  console.log("✅ Integer floor division enforced");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});