import { ethers } from "hardhat";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

// Types for deployment tracking
interface DeploymentResult {
  name: string;
  address: string;
  txHash: string;
  block: number;
  gasUsed: string;
  constructorArgs: any[];
  timestamp: string;
  success: boolean;
  error?: string;
}

interface DeploymentConfig {
  network: {
    name: string;
    chainId: number;
    rpc: string;
    explorer: string;
  };
  deployment: {
    deployer: string;
    timestamp: number;
    blockNumber: number;
    totalGasUsed: string;
  };
  contracts: Record<string, any>;
}

class AdilDeploymentOrchestrator {
  private deployer: any;
  private network: any;
  private config: DeploymentConfig;
  private deploymentResults: DeploymentResult[] = [];
  private logFile: string;

  constructor() {
    const today = new Date().toISOString().split('T')[0];
    this.logFile = join(__dirname, '..', '..', 'AIReports', `DeployLogs_${today}.md`);
  }

  /**
   * Preflight validation - run basic checks that don't require valid private key
   */
  async performPreflight(): Promise<boolean> {
    console.log("🔍 PREFLIGHT VALIDATION FOR ADILCHAIN DEVNET");
    console.log("=" .repeat(80));

    console.log("⚠️  IMPORTANT: Run full preflight with: node ../scripts/preflight.js");
    console.log("This deployment script requires a valid DEPLOYER_PRIVATE_KEY");
    console.log("");

    // Basic environment check
    const requiredEnvs = ['DEPLOYER_PRIVATE_KEY', 'ORACLE_SIGNER', 'TREASURY_ADDRESS'];
    const missing = requiredEnvs.filter(env => !process.env[env] || process.env[env] === 'TBD');

    if (missing.length > 0) {
      console.log("❌ MISSING REQUIRED ENVIRONMENT VARIABLES:");
      missing.forEach(env => console.log(`   - ${env}`));
      return false;
    }

    // Initialize network and deployer
    try {
      const [deployer] = await ethers.getSigners();
      const network = await ethers.provider.getNetwork();
      
      this.deployer = deployer;
      this.network = network;
      
      console.log(`✅ Network: ${network.name} (Chain ID: ${network.chainId})`);
      console.log(`✅ Deployer: ${deployer.address}`);
      
      return true;
    } catch (error) {
      console.log(`❌ Network/Deployer validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Analyze constructor arguments for all contracts
   */
  analyzeConstructorArgs(): Record<string, any[]> {
    const oracleSignerAddr = process.env.ORACLE_SIGNER || '';
    const treasuryAddr = process.env.TREASURY_ADDRESS || '';
    const liquidityAddr = process.env.LIQUIDITY_POOL_ADDRESS || treasuryAddr;
    const rewardsAddr = process.env.REWARDS_POOL_ADDRESS || treasuryAddr;
    const teamAddr = process.env.TEAM_ALLOCATION_ADDRESS || treasuryAddr;
    const reserveAddr = process.env.RESERVE_ADDRESS || treasuryAddr;
    const chgCap = process.env.CHG_CAP || '1000000000000000000000000000';

    return {
      'MockERC20': ['Mock USDT', 'USDT', 6], // Name, symbol, decimals only
      'CHG': [
        'DEPLOYER_ADDRESS', // owner
        treasuryAddr,       // treasury
        liquidityAddr,      // liquidityPool
        rewardsAddr,        // rewardsPool
        teamAddr,           // teamAllocation
        reserveAddr         // reserve
      ],
      'NFTClaw': [
        process.env.BASE_URI_NFTCLAW || 'ipfs://claw/',
        'DEPLOYER_ADDRESS'
      ],
      'NFTOwner': [
        process.env.BASE_URI_NFTOWNER || 'ipfs://owner/'
      ],
      'NFTTicket': [
        process.env.BASE_URI_NFTTICKET || 'ipfs://ticket/'
      ],
      'NFTHunter': [
        process.env.BASE_URI_NFTHUNTER || 'ipfs://hunter/'
      ],
      'RevenueSplitter': [], // No constructor parameters
      'RevenuePool': [
        'DEPLOYER_ADDRESS',
        'REVENUESPLITTER_ADDRESS', // Will be set after RevenueSplitter deployment
        oracleSignerAddr
      ],
      'ClaimProcessor': [
        'USDT_ADDRESS', // Will be set after USDT deployment
        'REVENUESPLITTER_ADDRESS' // Will be set after RevenueSplitter deployment
      ],
      'CHGStaking': [
        'CHG_ADDRESS' // Will be set after CHG deployment
      ]
    };
  }

  /**
   * Print deployment plan and get user confirmation
   */
  async getDeploymentConfirmation(): Promise<string[]> {
    console.log("\n🎯 DEPLOYMENT PLAN");
    console.log("=" .repeat(60));

    const contracts = [
      { name: 'MockERC20', required: !process.env.USDT_ADDRESS, note: 'Only if USDT_ADDRESS not provided' },
      { name: 'CHG', required: true, note: 'ERC-20 utility token with capped supply' },
      { name: 'NFTClaw', required: true, note: 'ERC-721 machine identity tokens' },
      { name: 'NFTOwner', required: true, note: 'ERC-1155 fractional ownership' },
      { name: 'NFTTicket', required: existsSync(join(__dirname, '..', 'contracts', 'NFTTicket.sol')), note: 'ERC-1155 play tickets' },
      { name: 'NFTHunter', required: false, note: 'ERC-1155 character tokens (if implemented)' },
      { name: 'RevenueSplitter', required: true, note: '70/20/3/3/4 revenue distribution' },
      { name: 'RevenuePool', required: true, note: 'EIP-712 oracle validation' },
      { name: 'ClaimProcessor', required: true, note: 'Merkle proof claims' },
      { name: 'CHGStaking', required: true, note: 'CHG staking with lock weights' }
    ];

    console.log("📋 Contracts to deploy:");
    let deployOrder = 1;
    const plannedContracts: string[] = [];

    for (const contract of contracts) {
      if (contract.required) {
        console.log(`   ${deployOrder}. ✅ ${contract.name} - ${contract.note}`);
        plannedContracts.push(contract.name);
        deployOrder++;
      } else {
        console.log(`   ⏭️  ${contract.name} - SKIPPED (${contract.note})`);
      }
    }

    console.log(`\n🎯 Total contracts to deploy: ${plannedContracts.length}`);
    console.log(`💰 Estimated gas cost: ~15-20M gas`);
    console.log(`⏱️  Estimated time: 5-10 minutes`);

    return plannedContracts;
  }

  /**
   * Deploy a single contract with error handling and logging
   */
  async deploySingleContract(contractName: string, constructorArgs: any[]): Promise<DeploymentResult> {
    const startTime = Date.now();
    const result: DeploymentResult = {
      name: contractName,
      address: '',
      txHash: '',
      block: 0,
      gasUsed: '0',
      constructorArgs,
      timestamp: new Date().toISOString(),
      success: false
    };

    try {
      console.log(`\n🚀 Deploying ${contractName}...`);
      console.log(`   Constructor args: ${JSON.stringify(constructorArgs.map(arg => {
        if (typeof arg === 'string' && arg.includes('PRIVATE_KEY')) return '***MASKED***';
        if (typeof arg === 'bigint') return arg.toString();
        return arg;
      }))}`);

      // Get contract factory
      const ContractFactory = await ethers.getContractFactory(contractName);
      
      // Deploy contract
      const contract = await ContractFactory.deploy(...constructorArgs);
      await contract.waitForDeployment();
      
      // Get deployment details
      const address = await contract.getAddress();
      const deploymentTx = contract.deploymentTransaction();
      const receipt = await deploymentTx?.wait();

      result.address = address;
      result.txHash = deploymentTx?.hash || '';
      result.block = receipt?.blockNumber || 0;
      result.gasUsed = receipt?.gasUsed.toString() || '0';
      result.success = true;

      console.log(`   ✅ Deployed to: ${address}`);
      console.log(`   📄 Tx Hash: ${result.txHash}`);
      console.log(`   📦 Block: ${result.block}`);
      console.log(`   ⛽ Gas Used: ${ethers.formatUnits(result.gasUsed, 'wei')} wei`);

      // Update addresses in config for dependent contracts
      this.updateAddressReferences(contractName, address);

      // Special post-deployment actions
      if (contractName === 'MockERC20') {
        // Mint initial supply to deployer
        const mockUSDT = await ethers.getContractAt('MockERC20', address);
        const mintAmount = ethers.parseUnits('1000000', 6); // 1M USDT
        const mintTx = await mockUSDT.mint(this.deployer.address, mintAmount);
        await mintTx.wait();
        console.log(`   💰 Minted 1,000,000 USDT to deployer`);
      }

    } catch (error) {
      result.error = error.message;
      console.log(`   ❌ Deployment failed: ${error.message}`);
    }

    const duration = Date.now() - startTime;
    console.log(`   ⏱️  Duration: ${duration}ms`);

    this.deploymentResults.push(result);
    return result;
  }

  /**
   * Update address references for dependent contracts
   */
  updateAddressReferences(contractName: string, address: string) {
    // This will be used to update constructor args for dependent contracts
    if (contractName === 'CHG') {
      process.env.CHG_ADDRESS = address;
    } else if (contractName === 'MockERC20') {
      process.env.USDT_ADDRESS = address;
    } else if (contractName === 'RevenueSplitter') {
      process.env.REVENUESPLITTER_ADDRESS = address;
    }
  }

  /**
   * Resolve constructor arguments with deployed addresses
   */
  resolveConstructorArgs(contractName: string): any[] {
    const constructorTemplates = this.analyzeConstructorArgs();
    const template = constructorTemplates[contractName];
    
    if (!template) return [];

    return template.map(arg => {
      if (arg === 'DEPLOYER_ADDRESS') return this.deployer.address;
      if (arg === 'CHG_ADDRESS') return process.env.CHG_ADDRESS;
      if (arg === 'USDT_ADDRESS') return process.env.USDT_ADDRESS;
      if (arg === 'REVENUESPLITTER_ADDRESS') return process.env.REVENUESPLITTER_ADDRESS;
      return arg;
    });
  }

  /**
   * Execute deployment sequence
   */
  async executeDeployment(contractsToDeploy: string[]): Promise<void> {
    console.log("\n🚀 STARTING DEPLOYMENT SEQUENCE");
    console.log("=" .repeat(60));

    // Initialize config
    this.config = {
      network: {
        name: "AdilChain Devnet",
        chainId: Number(this.network.chainId),
        rpc: process.env.ADL_RPC_URL || "https://devnet.adilchain-rpc.io",
        explorer: process.env.ADL_EXPLORER_URL || "https://devnet.adilchain-scan.io"
      },
      deployment: {
        deployer: this.deployer.address,
        timestamp: Math.floor(Date.now() / 1000),
        blockNumber: await ethers.provider.getBlockNumber(),
        totalGasUsed: "0"
      },
      contracts: {}
    };

    // Create deployment log header
    this.initializeDeploymentLog();

    // Deploy each contract in sequence
    for (const contractName of contractsToDeploy) {
      const constructorArgs = this.resolveConstructorArgs(contractName);
      const result = await this.deploySingleContract(contractName, constructorArgs);
      
      if (result.success) {
        this.config.contracts[contractName] = {
          address: result.address,
          txHash: result.txHash,
          block: result.block,
          gasUsed: result.gasUsed,
          abi: `abi/${contractName}.json`,
          version: "v1.0.0"
        };
      }

      // Update deployment log
      this.updateDeploymentLog(result);

      // Stop on failure
      if (!result.success) {
        console.log(`\n❌ DEPLOYMENT STOPPED: ${contractName} failed`);
        break;
      }
    }

    // Post-deployment wiring
    await this.performPostDeploymentWiring();

    // Save addresses file
    this.saveAddressesFile();

    // Print final summary
    this.printDeploymentSummary();
  }

  /**
   * Post-deployment contract wiring and configuration
   */
  async performPostDeploymentWiring(): Promise<void> {
    console.log("\n🔧 POST-DEPLOYMENT WIRING");
    console.log("=" .repeat(40));

    try {
      // Wire oracle signer to RevenuePool if deployed
      if (this.config.contracts.RevenuePool && process.env.ORACLE_SIGNER) {
        console.log("📡 Setting oracle signer allowlist...");
        const revenuePool = await ethers.getContractAt("RevenuePool", this.config.contracts.RevenuePool.address);
        const tx = await revenuePool.setOracleAllowed(process.env.ORACLE_SIGNER, true);
        await tx.wait();
        console.log(`   ✅ Oracle ${process.env.ORACLE_SIGNER} allowlisted`);
      }

      // Fund ClaimProcessor with mock USDT for testing (if MockERC20 was deployed)
      if (this.config.contracts.ClaimProcessor && this.config.contracts.MockERC20) {
        console.log("💰 Funding ClaimProcessor with test USDT...");
        const mockUSDT = await ethers.getContractAt("MockERC20", this.config.contracts.MockERC20.address);
        const fundAmount = ethers.parseUnits('10000', 6); // 10,000 USDT
        const tx = await mockUSDT.transfer(this.config.contracts.ClaimProcessor.address, fundAmount);
        await tx.wait();
        console.log(`   ✅ ClaimProcessor funded with 10,000 test USDT`);
      }

    } catch (error) {
      console.log(`   ⚠️ Post-deployment wiring warning: ${error.message}`);
    }
  }

  /**
   * Save deployment addresses to JSON file
   */
  saveAddressesFile(): void {
    const addressesFile = join(__dirname, '..', 'addresses.adil.json');
    writeFileSync(addressesFile, JSON.stringify(this.config, null, 2));
    console.log(`\n💾 Addresses saved to: ${addressesFile}`);
  }

  /**
   * Initialize deployment log file
   */
  initializeDeploymentLog(): void {
    const logHeader = `# AdilChain Devnet Deployment Log

**Date**: ${new Date().toISOString().split('T')[0]}  
**Network**: AdilChain Devnet  
**Chain ID**: ${this.config.network.chainId}  
**Deployer**: ${this.deployer.address}  
**RPC**: ${this.config.network.rpc}

---

## Deployment Sequence

`;
    writeFileSync(this.logFile, logHeader);
  }

  /**
   * Update deployment log with contract result
   */
  updateDeploymentLog(result: DeploymentResult): void {
    const logEntry = `
### ${result.success ? '✅' : '❌'} ${result.name}

**Status**: ${result.success ? 'SUCCESS' : 'FAILED'}  
**Address**: ${result.address || 'N/A'}  
**Tx Hash**: ${result.txHash || 'N/A'}  
**Block**: ${result.block || 'N/A'}  
**Gas Used**: ${result.gasUsed} wei  
**Timestamp**: ${result.timestamp}  

${result.error ? `**Error**: ${result.error}` : ''}

**Constructor Args**:
\`\`\`json
${JSON.stringify(result.constructorArgs.map(arg => 
  typeof arg === 'string' && arg.includes('PRIVATE_KEY') ? '***MASKED***' : arg
), null, 2)}
\`\`\`

---
`;

    const currentLog = readFileSync(this.logFile, 'utf8');
    writeFileSync(this.logFile, currentLog + logEntry);
  }

  /**
   * Print final deployment summary
   */
  printDeploymentSummary(): void {
    console.log("\n📊 DEPLOYMENT SUMMARY");
    console.log("=" .repeat(80));

    const successful = this.deploymentResults.filter(r => r.success);
    const failed = this.deploymentResults.filter(r => !r.success);

    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`📊 Success Rate: ${((successful.length / this.deploymentResults.length) * 100).toFixed(1)}%`);

    if (successful.length > 0) {
      console.log("\n📋 DEPLOYED CONTRACTS");
      console.log("-".repeat(80));
      console.log("Contract".padEnd(20) + "Address".padEnd(45) + "Tx Hash".padEnd(15));
      console.log("-".repeat(80));
      
      successful.forEach(result => {
        console.log(
          result.name.padEnd(20) + 
          result.address.padEnd(45) + 
          result.txHash.slice(0, 10) + "..."
        );
      });
    }

    if (failed.length > 0) {
      console.log("\n❌ FAILED DEPLOYMENTS");
      failed.forEach(result => {
        console.log(`   ${result.name}: ${result.error}`);
      });
    }

    console.log(`\n📁 Files Generated:`);
    console.log(`   - contracts/addresses.adil.json`);
    console.log(`   - ${this.logFile}`);
  }

  // Placeholder for constructor analysis (reuse from existing logic)
  analyzeConstructorArgs(): Record<string, any[]> {
    // Implementation from previous analysis
    const oracleSignerAddr = process.env.ORACLE_SIGNER || '';
    const treasuryAddr = process.env.TREASURY_ADDRESS || '';
    const liquidityAddr = process.env.LIQUIDITY_POOL_ADDRESS || treasuryAddr;
    const rewardsAddr = process.env.REWARDS_POOL_ADDRESS || treasuryAddr;
    const teamAddr = process.env.TEAM_ALLOCATION_ADDRESS || treasuryAddr;
    const reserveAddr = process.env.RESERVE_ADDRESS || treasuryAddr;

    return {
      'MockERC20': ['Mock USDT', 'USDT', 6], // Name, symbol, decimals only
      'CHG': ['DEPLOYER_ADDRESS', treasuryAddr, liquidityAddr, rewardsAddr, teamAddr, reserveAddr],
      'NFTClaw': ['DEPLOYER_ADDRESS', 'Claw Machine NFT', 'CLAW', process.env.BASE_URI_NFTCLAW || 'ipfs://claw/'],
      'NFTOwner': [process.env.BASE_URI_NFTOWNER || 'ipfs://owner/'],
      'NFTTicket': ['DEPLOYER_ADDRESS', process.env.BASE_URI_NFTTICKET || 'ipfs://ticket/'],
      'RevenueSplitter': [], // No constructor parameters
      'RevenuePool': ['DEPLOYER_ADDRESS'], // Only owner parameter
      'ClaimProcessor': ['DEPLOYER_ADDRESS', 'REVENUESPLITTER_ADDRESS'], // owner, revenueSplitter
      'CHGStaking': ['DEPLOYER_ADDRESS', 'CHG_ADDRESS'] // owner, chgToken
    };
  }
}

/**
 * Main deployment orchestrator
 */
async function main() {
  const orchestrator = new AdilDeploymentOrchestrator();

  try {
    // Step 1: Preflight validation
    const preflightPassed = await orchestrator.performPreflight();
    
    if (!preflightPassed) {
      console.log("\n❌ DEPLOYMENT ABORTED: Preflight validation failed");
      console.log("Please fix the issues above and try again.");
      process.exit(1);
    }

    // Step 2: Get deployment plan and confirmation
    const contractsToDeployList = await orchestrator.getDeploymentConfirmation();
    
    console.log("\n⏸️  WAITING FOR USER CONFIRMATION");
    console.log("=" .repeat(60));
    console.log("🔴 IMPORTANT: This will deploy contracts to AdilChain Devnet");
    console.log("🔴 Make sure you have reviewed the deployment plan above");
    console.log("");
    console.log("Please respond in chat with:");
    console.log("   - 'Yes' to proceed with ALL contracts");
    console.log("   - 'No' to abort deployment");
    console.log("   - 'Yes: CHG, RevenueSplitter, RevenuePool' for partial deployment");
    console.log("");
    console.log("⏳ Waiting for your confirmation...");

    // Note: The actual deployment will be triggered after user confirmation
    // This script will be called again with CONFIRM_DEPLOY=true

    if (process.env.CONFIRM_DEPLOY === 'true') {
      const confirmedContracts = process.env.DEPLOY_CONTRACTS?.split(',') || contractsToDeployList;
      await orchestrator.executeDeployment(confirmedContracts);
    }

  } catch (error) {
    console.error("❌ Deployment orchestrator failed:", error.message);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(console.error);
}

export { AdilDeploymentOrchestrator };
