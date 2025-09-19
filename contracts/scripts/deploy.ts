import { ethers } from "hardhat";
import { writeFileSync } from "fs";

async function main() {
  console.log("🚀 Deploying Claw Hunters Revenue Sharing System...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const addresses: Record<string, string> = {};

  // 1. Deploy mock USDT for testing
  console.log("📦 Deploying Mock USDT...");
  const MockUSDT = await ethers.getContractFactory("MockERC20");
  const usdt = await MockUSDT.deploy("Mock USDT", "USDT", 6); // 6 decimals like real USDT
  await usdt.waitForDeployment();
  addresses.USDT = await usdt.getAddress();
  console.log("✅ Mock USDT deployed to:", addresses.USDT);

  // 2. Deploy CHG token
  console.log("\n📦 Deploying CHG Token...");
  const CHG = await ethers.getContractFactory("CHG");
  const chg = await CHG.deploy(deployer.address);
  await chg.waitForDeployment();
  addresses.CHG = await chg.getAddress();
  console.log("✅ CHG deployed to:", addresses.CHG);

  // 3. Deploy NFTOwner
  console.log("\n📦 Deploying NFTOwner...");
  const NFTOwner = await ethers.getContractFactory("NFTOwner");
  const nftOwner = await NFTOwner.deploy("https://api.clawhunters.com/metadata/owner/");
  await nftOwner.waitForDeployment();
  addresses.NFTOwner = await nftOwner.getAddress();
  console.log("✅ NFTOwner deployed to:", addresses.NFTOwner);

  // 4. Deploy NFTClaw
  console.log("\n📦 Deploying NFTClaw...");
  const NFTClaw = await ethers.getContractFactory("NFTClaw");
  const nftClaw = await NFTClaw.deploy(
    deployer.address,
    "Claw Machine NFT",
    "CLAW",
    "https://api.clawhunters.com/metadata/claw/"
  );
  await nftClaw.waitForDeployment();
  addresses.NFTClaw = await nftClaw.getAddress();
  console.log("✅ NFTClaw deployed to:", addresses.NFTClaw);

  // 5. Deploy NFTTicket (MVP stub)
  console.log("\n📦 Deploying NFTTicket...");
  const NFTTicket = await ethers.getContractFactory("NFTTicket");
  const nftTicket = await NFTTicket.deploy(
    deployer.address,
    "https://api.clawhunters.com/metadata/ticket/"
  );
  await nftTicket.waitForDeployment();
  addresses.NFTTicket = await nftTicket.getAddress();
  console.log("✅ NFTTicket deployed to:", addresses.NFTTicket);

  // 6. Deploy RevenueSplitter
  console.log("\n📦 Deploying RevenueSplitter...");
  const RevenueSplitter = await ethers.getContractFactory("RevenueSplitter");
  const revenueSplitter = await RevenueSplitter.deploy();
  await revenueSplitter.waitForDeployment();
  addresses.RevenueSplitter = await revenueSplitter.getAddress();
  console.log("✅ RevenueSplitter deployed to:", addresses.RevenueSplitter);

  // 7. Deploy RevenuePool
  console.log("\n📦 Deploying RevenuePool...");
  const RevenuePool = await ethers.getContractFactory("RevenuePool");
  const revenuePool = await RevenuePool.deploy(deployer.address);
  await revenuePool.waitForDeployment();
  addresses.RevenuePool = await revenuePool.getAddress();
  console.log("✅ RevenuePool deployed to:", addresses.RevenuePool);

  // 8. Deploy ClaimProcessor
  console.log("\n📦 Deploying ClaimProcessor...");
  const ClaimProcessor = await ethers.getContractFactory("ClaimProcessor");
  const claimProcessor = await ClaimProcessor.deploy(deployer.address, addresses.RevenueSplitter);
  await claimProcessor.waitForDeployment();
  addresses.ClaimProcessor = await claimProcessor.getAddress();
  console.log("✅ ClaimProcessor deployed to:", addresses.ClaimProcessor);

  // 9. Deploy CHGStaking
  console.log("\n📦 Deploying CHGStaking...");
  const CHGStaking = await ethers.getContractFactory("CHGStaking");
  const chgStaking = await CHGStaking.deploy(deployer.address, addresses.CHG);
  await chgStaking.waitForDeployment();
  addresses.CHGStaking = await chgStaking.getAddress();
  console.log("✅ CHGStaking deployed to:", addresses.CHGStaking);

  // 10. Wire contracts together
  console.log("\n🔗 Wiring contracts together...");
  
  // Set RevenueSplitter in RevenuePool
  await revenuePool.setSplitter(addresses.RevenueSplitter);
  console.log("✅ RevenueSplitter set in RevenuePool");
  
  // Set deployer as oracle (for testing)
  await revenuePool.setOracle(deployer.address, true);
  console.log("✅ Deployer set as oracle in RevenuePool");

  // 11. Fund ClaimProcessor with test USDT
  console.log("\n💰 Funding ClaimProcessor with test USDT...");
  const testAmount = ethers.parseUnits("1000000", 6); // 1M USDT for testing
  await usdt.mint(addresses.ClaimProcessor, testAmount);
  console.log("✅ ClaimProcessor funded with", ethers.formatUnits(testAmount, 6), "USDT");

  // 12. Save addresses to file
  const addressesJson = JSON.stringify(addresses, null, 2);
  writeFileSync("addresses.local.json", addressesJson);
  console.log("\n📄 Contract addresses saved to addresses.local.json");

  // 13. Display deployment summary
  console.log("\n🎉 DEPLOYMENT COMPLETE!");
  console.log("=" .repeat(50));
  console.log("Contract Addresses:");
  Object.entries(addresses).forEach(([name, address]) => {
    console.log(`${name.padEnd(20)}: ${address}`);
  });
  
  console.log("\n📋 Verification Commands:");
  console.log("Verify mathematical constants:");
  console.log(`npx hardhat run scripts/demoPostRevenue.ts --network 127.0.0.1`);
  console.log("\nTest Merkle claims:");
  console.log(`npx hardhat run scripts/demoMerkleClaims.ts --network 127.0.0.1`);
  
  console.log("\n⚠️  IMPORTANT NOTES:");
  console.log("- CHPoint is OFF-CHAIN (not deployed as ERC-20)");
  console.log("- Merkle roots must be set off-chain by indexer/oracle");
  console.log("- This is a testnet deployment with mock USDT");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});