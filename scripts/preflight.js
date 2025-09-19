#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Preflight validation for AdilChain deployment
 */
class PreflightValidator {
  constructor() {
    this.issues = [];
    this.warnings = [];
  }

  /**
   * Validate all required environment variables
   */
  validateEnvironmentVariables() {
    console.log("📋 Checking required environment variables...");
    
    const requiredEnvs = [
      'DEPLOYER_PRIVATE_KEY',
      'ORACLE_SIGNER', 
      'TREASURY_ADDRESS'
    ];

    const optionalEnvs = [
      { key: 'ADL_RPC_URL', default: 'https://devnet.adilchain-rpc.io' },
      { key: 'LIQUIDITY_POOL_ADDRESS', default: 'Same as TREASURY_ADDRESS' },
      { key: 'REWARDS_POOL_ADDRESS', default: 'Same as TREASURY_ADDRESS' },
      { key: 'TEAM_ALLOCATION_ADDRESS', default: 'Same as TREASURY_ADDRESS' },
      { key: 'RESERVE_ADDRESS', default: 'Same as TREASURY_ADDRESS' },
      { key: 'USDT_ADDRESS', default: 'Will deploy MockERC20' },
      { key: 'BASE_URI_NFTCLAW', default: 'ipfs://claw/' },
      { key: 'BASE_URI_NFTOWNER', default: 'ipfs://owner/' },
      { key: 'BASE_URI_NFTTICKET', default: 'ipfs://ticket/' },
      { key: 'BASE_URI_NFTHUNTER', default: 'ipfs://hunter/' },
      { key: 'CHG_CAP', default: '1000000000000000000000000000' } // 1B * 10^18
    ];

    // Check required envs
    for (const env of requiredEnvs) {
      if (!process.env[env] || process.env[env] === 'TBD') {
        this.issues.push(`❌ Missing REQUIRED: ${env}`);
      } else {
        const masked = env === 'DEPLOYER_PRIVATE_KEY' ? '***MASKED***' : process.env[env];
        console.log(`   ✅ ${env}: ${masked}`);
      }
    }

    // Check optional envs and set defaults
    for (const env of optionalEnvs) {
      const value = process.env[env.key] || env.default;
      console.log(`   📝 ${env.key}: ${value}`);
    }

    return this.issues.length === 0;
  }

  /**
   * Validate private key format
   */
  validatePrivateKey() {
    console.log("\n🔐 Validating private key format...");
    
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey || privateKey === 'TBD') {
      this.issues.push('❌ DEPLOYER_PRIVATE_KEY not set or is placeholder "TBD"');
      return false;
    }

    // Basic format validation
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
      this.issues.push('❌ DEPLOYER_PRIVATE_KEY invalid format (should be 0x + 64 hex chars)');
      return false;
    }

    console.log("   ✅ Private key format valid");
    return true;
  }

  /**
   * Check network connectivity
   */
  async validateNetworkConnectivity() {
    console.log("\n🌐 Checking network connectivity...");
    
    try {
      const rpcUrl = process.env.ADL_RPC_URL || 'https://devnet.adilchain-rpc.io';
      console.log(`   📡 Testing RPC: ${rpcUrl}`);
      
      // Simple fetch test to RPC
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        })
      });

      if (!response.ok) {
        this.issues.push(`❌ RPC not responding: ${response.status} ${response.statusText}`);
        return false;
      }

      const data = await response.json();
      if (data.error) {
        this.issues.push(`❌ RPC error: ${data.error.message}`);
        return false;
      }

      const blockNumber = parseInt(data.result, 16);
      console.log(`   ✅ RPC responding - Latest block: ${blockNumber}`);
      return true;

    } catch (error) {
      this.issues.push(`❌ Network connectivity failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Analyze contract files and constructor requirements
   */
  analyzeContracts() {
    console.log("\n🔨 Analyzing contract files...");
    
    const contractsDir = path.join(__dirname, '..', 'contracts', 'contracts');
    const contracts = [
      'MockERC20.sol',
      'CHG.sol',
      'NFTClaw.sol', 
      'NFTOwner.sol',
      'NFTTicket.sol',
      'RevenueSplitter.sol',
      'RevenuePool.sol',
      'ClaimProcessor.sol',
      'CHGStaking.sol'
    ];

    const contractStatus = {};
    let availableContracts = 0;

    for (const contract of contracts) {
      const contractPath = path.join(contractsDir, contract);
      const exists = fs.existsSync(contractPath);
      
      if (exists) {
        console.log(`   ✅ ${contract} - Found`);
        contractStatus[contract] = 'available';
        availableContracts++;
      } else {
        console.log(`   ⏭️  ${contract} - Not found (will skip)`);
        contractStatus[contract] = 'missing';
      }
    }

    console.log(`\n   📊 Available contracts: ${availableContracts}/${contracts.length}`);
    return contractStatus;
  }

  /**
   * Generate deployment plan
   */
  generateDeploymentPlan(contractStatus) {
    console.log("\n🎯 DEPLOYMENT PLAN");
    console.log("=" .repeat(60));

    const deploymentOrder = [
      { name: 'MockERC20', required: !process.env.USDT_ADDRESS, note: 'Only if USDT_ADDRESS not provided' },
      { name: 'CHG', required: true, note: 'ERC-20 utility token with capped supply' },
      { name: 'NFTClaw', required: true, note: 'ERC-721 machine identity tokens' },
      { name: 'NFTOwner', required: true, note: 'ERC-1155 fractional ownership' },
      { name: 'NFTTicket', required: contractStatus['NFTTicket.sol'] === 'available', note: 'ERC-1155 play tickets' },
      { name: 'RevenueSplitter', required: true, note: '70/20/3/3/4 revenue distribution' },
      { name: 'RevenuePool', required: true, note: 'EIP-712 oracle validation' },
      { name: 'ClaimProcessor', required: true, note: 'Merkle proof claims' },
      { name: 'CHGStaking', required: true, note: 'CHG staking with lock weights' }
    ];

    console.log("📋 Contracts to deploy:");
    let deployOrder = 1;
    const plannedContracts = [];

    for (const contract of deploymentOrder) {
      const contractFile = `${contract.name}.sol`;
      const available = contractStatus[contractFile] === 'available';
      
      if (contract.required && available) {
        console.log(`   ${deployOrder}. ✅ ${contract.name} - ${contract.note}`);
        plannedContracts.push(contract.name);
        deployOrder++;
      } else if (contract.required && !available) {
        console.log(`   ❌ ${contract.name} - MISSING (${contract.note})`);
        this.issues.push(`❌ Required contract missing: ${contractFile}`);
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
   * Print constructor arguments preview
   */
  printConstructorPreview() {
    console.log("\n📋 Constructor Arguments Preview:");
    console.log("-".repeat(60));

    const oracleSignerAddr = process.env.ORACLE_SIGNER || '';
    const treasuryAddr = process.env.TREASURY_ADDRESS || '';
    const liquidityAddr = process.env.LIQUIDITY_POOL_ADDRESS || treasuryAddr;
    const rewardsAddr = process.env.REWARDS_POOL_ADDRESS || treasuryAddr;
    const teamAddr = process.env.TEAM_ALLOCATION_ADDRESS || treasuryAddr;
    const reserveAddr = process.env.RESERVE_ADDRESS || treasuryAddr;

    const constructorArgs = {
      'MockERC20': ['Mock USDT', 'USDT', 6, '1000000000000'], // 1M USDT with 6 decimals
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
      'RevenueSplitter': ['DEPLOYER_ADDRESS'],
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

    for (const [contract, args] of Object.entries(constructorArgs)) {
      console.log(`📝 ${contract}:`);
      args.forEach((arg, index) => {
        const displayValue = typeof arg === 'string' && arg.includes('PRIVATE_KEY') ? '***MASKED***' : arg;
        console.log(`   ${index + 1}. ${displayValue}`);
      });
      console.log('');
    }
  }

  /**
   * Run complete preflight validation
   */
  async runPreflight() {
    console.log("🔍 PREFLIGHT VALIDATION FOR ADILCHAIN DEVNET");
    console.log("=" .repeat(80));

    // Step 1: Environment variables
    const envValid = this.validateEnvironmentVariables();

    // Step 2: Private key format (only if provided)
    const pkValid = this.validatePrivateKey();

    // Step 3: Network connectivity
    const networkValid = await this.validateNetworkConnectivity();

    // Step 4: Contract analysis
    const contractStatus = this.analyzeContracts();

    // Step 5: Deployment plan
    const plannedContracts = this.generateDeploymentPlan(contractStatus);

    // Step 6: Constructor preview
    this.printConstructorPreview();

    // Final summary
    console.log("\n📊 PREFLIGHT SUMMARY");
    console.log("=" .repeat(80));

    if (this.issues.length > 0) {
      console.log("❌ PREFLIGHT FAILED - Issues found:");
      this.issues.forEach(issue => console.log(`   ${issue}`));
      console.log("\n🔧 Required Actions:");
      console.log("   1. Set missing environment variables");
      console.log("   2. Ensure DEPLOYER_PRIVATE_KEY is a valid 64-character hex string");
      console.log("   3. Verify network connectivity");
      console.log("   4. Fix any missing contract files");
      return false;
    }

    if (this.warnings.length > 0) {
      console.log("⚠️ WARNINGS:");
      this.warnings.forEach(warning => console.log(`   ${warning}`));
      console.log("");
    }

    console.log("✅ PREFLIGHT PASSED - Ready for deployment");
    console.log(`🎯 Contracts to deploy: ${plannedContracts.length}`);
    console.log(`💰 Estimated cost: ~15-20M gas`);
    console.log(`⏱️  Estimated time: 5-10 minutes`);
    
    console.log("\n🔴 NEXT STEPS:");
    console.log("1. Ensure you have a valid DEPLOYER_PRIVATE_KEY");
    console.log("2. Run the deployment orchestrator with proper confirmation");
    console.log("3. Monitor deployment progress and capture addresses");

    return true;
  }
}

/**
 * Main preflight execution
 */
async function main() {
  const validator = new PreflightValidator();
  
  try {
    const success = await validator.runPreflight();
    
    if (!success) {
      console.log("\n❌ DEPLOYMENT BLOCKED - Fix issues above before proceeding");
      process.exit(1);
    }
    
    console.log("\n✅ PREFLIGHT COMPLETE - System ready for deployment");
    
  } catch (error) {
    console.error("❌ Preflight validation failed:", error.message);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { PreflightValidator };
