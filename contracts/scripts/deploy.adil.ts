import { ethers } from "hardhat";
import { writeFileSync } from "fs";
import { validateAdilNetwork, validateDeployerAccount, getOptimalGasPrice } from "../hardhat.networks.adil";

async function main() {
  console.log("🚀 DEPLOYING TO ADILCHAIN DEVNET");
  console.log("=" .repeat(60));
  
  // Network and account validation
  console.log("🔍 Validating network and deployer account...");
  const networkValid = await validateAdilNetwork(ethers);
  const deployerValid = await validateDeployerAccount(ethers);
  
  if (!networkValid || !deployerValid) {
    throw new Error("Network or deployer validation failed");
  }
  
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const gasPrice = await getOptimalGasPrice(ethers);
  
  console.log("✅ Network validated:", network.name, "Chain ID:", network.chainId);
  console.log("✅ Deployer validated:", deployer.address);
  console.log("✅ Gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  
  // Deployment tracking
  const deployment = {
    network: {
      name: "AdilChain Devnet",
      chainId: Number(network.chainId),
      rpc: process.env.ADL_RPC_URL || "https://devnet.adilchain-rpc.io",
      explorer: process.env.ADL_EXPLORER_URL || "https://devnet.adilchain-scan.io"
    },
    deployment: {
      deployer: deployer.address,
      timestamp: Math.floor(Date.now() / 1000),
      blockNumber: await ethers.provider.getBlockNumber(),
      gasUsed: "0"
    },
    contracts: {} as Record<string, any>,
    configuration: {
      oracle: {
        allowlisted: [deployer.address],
        eip712Domain: "ClawHuntersRevenuePool",
        version: "1"
      },
      constants: {
        DENOM: 10000,
        OPC_BPS: 7000,
        ALPHA_BPS: 2000,
        BETA_BPS: 300,
        GAMMA_BPS: 300,
        DELTA_BPS: 400
      },
      lockWeights: {
        "30d": 1000,
        "90d": 1500,
        "180d": 2000,
        "365d": 3000
      }
    }
  };

  let totalGasUsed = 0n;

  // Helper function to deploy and track contracts
  async function deployContract(name: string, factory: any, args: any[] = []) {
    console.log(`\n📦 Deploying ${name}...`);
    
    const contract = await factory.deploy(...args, { gasPrice });
    const receipt = await contract.deploymentTransaction()?.wait();
    const address = await contract.getAddress();
    
    const gasUsed = receipt?.gasUsed || 0n;
    totalGasUsed += gasUsed;
    
    deployment.contracts[name] = {
      address,
      deploymentTx: receipt?.hash,
      verified: false,
      gasUsed: gasUsed.toString()
    };
    
    console.log(`✅ ${name} deployed to:`, address);
    console.log(`   Gas used: ${gasUsed.toLocaleString()}`);
    
    return contract;
  }

  try {
    // 1. Deploy Mock USDT for testing
    const MockUSDT = await ethers.getContractFactory("MockERC20");
    const usdt = await deployContract("MockUSDT", MockUSDT, ["Mock USDT", "USDT", 6]);

    // 2. Deploy CHG token
    const CHG = await ethers.getContractFactory("CHG");
    const chg = await deployContract("CHG", CHG, [deployer.address]);

    // 3. Deploy NFTOwner
    const NFTOwner = await ethers.getContractFactory("NFTOwner");
    const nftOwner = await deployContract("NFTOwner", NFTOwner, ["https://api.clawhunters.com/metadata/owner/"]);

    // 4. Deploy NFTClaw
    const NFTClaw = await ethers.getContractFactory("NFTClaw");
    const nftClaw = await deployContract("NFTClaw", NFTClaw, [
      deployer.address,
      "Claw Machine NFT",
      "CLAW",
      "https://api.clawhunters.com/metadata/claw/"
    ]);

    // 5. Deploy NFTTicket (MVP stub)
    const NFTTicket = await ethers.getContractFactory("NFTTicket");
    const nftTicket = await deployContract("NFTTicket", NFTTicket, [
      deployer.address,
      "https://api.clawhunters.com/metadata/ticket/"
    ]);

    // 6. Deploy RevenueSplitter
    const RevenueSplitter = await ethers.getContractFactory("RevenueSplitter");
    const revenueSplitter = await deployContract("RevenueSplitter", RevenueSplitter);

    // 7. Deploy RevenuePool
    const RevenuePool = await ethers.getContractFactory("RevenuePool");
    const revenuePool = await deployContract("RevenuePool", RevenuePool, [deployer.address]);

    // 8. Deploy ClaimProcessor
    const ClaimProcessor = await ethers.getContractFactory("ClaimProcessor");
    const claimProcessor = await deployContract("ClaimProcessor", ClaimProcessor, [
      deployer.address,
      deployment.contracts.RevenueSplitter.address
    ]);

    // 9. Deploy CHGStaking
    const CHGStaking = await ethers.getContractFactory("CHGStaking");
    const chgStaking = await deployContract("CHGStaking", CHGStaking, [
      deployer.address,
      deployment.contracts.CHG.address
    ]);

    // 10. Wire contracts together
    console.log("\n🔗 Wiring contracts together...");
    
    // Set RevenueSplitter in RevenuePool
    const tx1 = await revenuePool.setSplitter(deployment.contracts.RevenueSplitter.address, { gasPrice });
    await tx1.wait();
    console.log("✅ RevenueSplitter set in RevenuePool");
    
    // Authorize RevenuePool in RevenueSplitter
    const tx2 = await revenueSplitter.setAuthorizedCaller(deployment.contracts.RevenuePool.address, true, { gasPrice });
    await tx2.wait();
    console.log("✅ RevenuePool authorized in RevenueSplitter");
    
    // Set deployer as oracle (for testing)
    const tx3 = await revenuePool.setOracle(deployer.address, true, { gasPrice });
    await tx3.wait();
    console.log("✅ Deployer set as oracle in RevenuePool");

    // 11. Fund ClaimProcessor with test USDT
    console.log("\n💰 Funding ClaimProcessor with test USDT...");
    const testAmount = ethers.parseUnits("1000000", 6); // 1M USDT for testing
    const tx4 = await usdt.mint(deployment.contracts.ClaimProcessor.address, testAmount, { gasPrice });
    await tx4.wait();
    console.log("✅ ClaimProcessor funded with", ethers.formatUnits(testAmount, 6), "USDT");

    // 12. Update deployment metadata
    deployment.deployment.gasUsed = totalGasUsed.toString();
    deployment.deployment.blockNumber = await ethers.provider.getBlockNumber();

    // 13. Save addresses to file
    const addressesJson = JSON.stringify(deployment, null, 2);
    writeFileSync("addresses.adil.json", addressesJson);
    console.log("\n📄 Contract addresses saved to addresses.adil.json");

    // 14. Display deployment summary
    console.log("\n🎉 ADILCHAIN DEVNET DEPLOYMENT COMPLETE!");
    console.log("=" .repeat(60));
    console.log("📊 Deployment Summary:");
    console.log(`Network: ${deployment.network.name} (Chain ID: ${deployment.network.chainId})`);
    console.log(`Deployer: ${deployment.deployment.deployer}`);
    console.log(`Total Gas Used: ${Number(totalGasUsed).toLocaleString()}`);
    console.log(`Block Number: ${deployment.deployment.blockNumber}`);
    
    console.log("\n📋 Contract Addresses:");
    Object.entries(deployment.contracts).forEach(([name, contract]) => {
      console.log(`${name.padEnd(20)}: ${contract.address}`);
    });
    
    console.log("\n🔗 Explorer Links:");
    Object.entries(deployment.contracts).forEach(([name, contract]) => {
      console.log(`${name.padEnd(20)}: ${deployment.network.explorer}/address/${contract.address}`);
    });
    
    console.log("\n📋 Next Steps:");
    console.log("1. Verify contracts on explorer (see scripts/verify.adil.md)");
    console.log("2. Test revenue posting: npx hardhat run scripts/demoPostRevenue.ts --network adil");
    console.log("3. Distribute addresses.adil.json to M3/M4/M5 teams");
    console.log("4. Begin M3 indexer implementation");
    
    console.log("\n⚠️  IMPORTANT NOTES:");
    console.log("- CHPoint is OFF-CHAIN (HCPoint.sol not deployed)");
    console.log("- Merkle roots must be set by M3 indexer for claims");
    console.log("- Oracle allowlist currently contains only deployer");
    console.log("- ClaimProcessor funded with 1M test USDT");
    
    console.log("\n✅ AdilChain Devnet deployment successful!");

  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    
    // Save partial deployment info for debugging
    if (Object.keys(deployment.contracts).length > 0) {
      deployment.deployment.gasUsed = totalGasUsed.toString();
      deployment.deployment.status = "FAILED";
      deployment.deployment.error = error instanceof Error ? error.message : String(error);
      
      const partialJson = JSON.stringify(deployment, null, 2);
      writeFileSync("addresses.adil.partial.json", partialJson);
      console.log("💾 Partial deployment saved to addresses.adil.partial.json");
    }
    
    throw error;
  }
}

// Deployment validation function
async function validateDeployment() {
  console.log("\n🔍 Validating deployment...");
  
  try {
    const addresses = JSON.parse(require("fs").readFileSync("addresses.adil.json", "utf8"));
    
    // Test each contract
    for (const [name, contractInfo] of Object.entries(addresses.contracts)) {
      const code = await ethers.provider.getCode((contractInfo as any).address);
      if (code === "0x") {
        throw new Error(`Contract ${name} not deployed properly`);
      }
      console.log(`✅ ${name} validated`);
    }
    
    console.log("✅ All contracts validated successfully");
    return true;
  } catch (error) {
    console.error("❌ Validation failed:", error);
    return false;
  }
}

// Execute deployment
main()
  .then(() => validateDeployment())
  .then((valid) => {
    if (valid) {
      console.log("\n🎉 Deployment and validation complete!");
      process.exit(0);
    } else {
      console.log("\n❌ Validation failed!");
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("\n💥 Deployment error:", error);
    process.exit(1);
  });
