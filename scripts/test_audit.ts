#!/usr/bin/env tsx

/**
 * Test Audit Orchestrator for M3 Indexer and M4 REST API
 * 
 * This script performs a comprehensive test audit including:
 * - Environment validation
 * - Contract address verification
 * - Database connectivity checks
 * - Test execution with logging
 * - Failure analysis and reporting
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { config } from 'dotenv';

// Load environment variables
config();

interface AuditConfig {
  adlRpcUrl: string;
  databaseUrl: string;
  shadowDatabaseUrl?: string;
  chainId?: string;
  oracleSigner?: string;
  contractsFile: string;
  autoFix: boolean;
}

interface PrecheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  critical: boolean;
}

interface ContractAddress {
  address: string;
  txHash: string;
  block: number;
  gasUsed: string;
  abi: string;
  version: string;
}

interface AddressesFile {
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
  contracts: Record<string, ContractAddress>;
}

class TestAuditor {
  private config: AuditConfig;
  private results: PrecheckResult[] = [];
  private artifactsDir = 'artifacts/test-logs';

  constructor() {
    this.config = this.loadConfig();
    this.ensureArtifactsDir();
  }

  private loadConfig(): AuditConfig {
    return {
      adlRpcUrl: process.env.ADL_RPC_URL || 'https://devnet.adilchain-rpc.io',
      databaseUrl: process.env.DATABASE_URL || '',
      shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
      chainId: process.env.CHAIN_ID,
      oracleSigner: process.env.ORACLE_SIGNER,
      contractsFile: process.env.CONTRACTS_FILE || 'contracts/addresses.adil.json',
      autoFix: process.env.AUTO_FIX === '1'
    };
  }

  private ensureArtifactsDir(): void {
    if (!existsSync(this.artifactsDir)) {
      mkdirSync(this.artifactsDir, { recursive: true });
    }
  }

  private addResult(name: string, status: 'PASS' | 'FAIL' | 'WARN', message: string, critical = false): void {
    this.results.push({ name, status, message, critical });
  }

  async runPrecheck(): Promise<boolean> {
    console.log('🔍 STEP 0: PROJECT PRECHECK');
    console.log('============================');

    // Check environment variables
    this.checkEnvironmentVariables();
    
    // Check contract addresses file
    await this.checkContractAddresses();
    
    // Check database connectivity
    await this.checkDatabaseConnectivity();
    
    // Check tooling versions
    this.checkToolingVersions();

    // Print results table
    this.printPrecheckResults();

    // Check if critical failures exist
    const criticalFailures = this.results.filter(r => r.status === 'FAIL' && r.critical);
    return criticalFailures.length === 0;
  }

  private checkEnvironmentVariables(): void {
    console.log('📋 Checking environment variables...');
    
    const required = [
      { key: 'DATABASE_URL', value: this.config.databaseUrl },
      { key: 'ADL_RPC_URL', value: this.config.adlRpcUrl }
    ];

    const optional = [
      { key: 'SHADOW_DATABASE_URL', value: this.config.shadowDatabaseUrl },
      { key: 'CHAIN_ID', value: this.config.chainId },
      { key: 'ORACLE_SIGNER', value: this.config.oracleSigner }
    ];

    for (const env of required) {
      if (env.value) {
        this.addResult(`ENV_${env.key}`, 'PASS', `Set to: ${env.value.substring(0, 20)}...`);
      } else {
        this.addResult(`ENV_${env.key}`, 'FAIL', 'Not set', true);
      }
    }

    for (const env of optional) {
      if (env.value) {
        this.addResult(`ENV_${env.key}`, 'PASS', `Set to: ${env.value.substring(0, 20)}...`);
      } else {
        this.addResult(`ENV_${env.key}`, 'WARN', 'Not set (optional)');
      }
    }
  }

  private async checkContractAddresses(): Promise<void> {
    console.log('📋 Checking contract addresses...');
    
    if (!existsSync(this.config.contractsFile)) {
      this.addResult('CONTRACTS_FILE', 'FAIL', `File not found: ${this.config.contractsFile}`, true);
      return;
    }

    try {
      const content = readFileSync(this.config.contractsFile, 'utf8');
      const addresses: AddressesFile = JSON.parse(content);

      // Check network info
      if (addresses.network) {
        this.addResult('NETWORK_INFO', 'PASS', 
          `Network: ${addresses.network.name}, Chain ID: ${addresses.network.chainId}`);
      }

      // Check required contracts
      const requiredContracts = ['CHG', 'NFTClaw', 'NFTOwner', 'RevenuePool', 'RevenueSplitter', 'ClaimProcessor', 'CHGStaking'];
      const optionalContracts = ['NFTTicket', 'MockERC20'];

      for (const contract of requiredContracts) {
        if (addresses.contracts[contract]) {
          const addr = addresses.contracts[contract].address;
          this.addResult(`CONTRACT_${contract}`, 'PASS', 
            `Deployed at: ${addr.substring(0, 10)}...`);
        } else {
          this.addResult(`CONTRACT_${contract}`, 'FAIL', 
            `Missing required contract: ${contract}`, true);
        }
      }

      for (const contract of optionalContracts) {
        if (addresses.contracts[contract]) {
          const addr = addresses.contracts[contract].address;
          this.addResult(`CONTRACT_${contract}`, 'PASS', 
            `Deployed at: ${addr.substring(0, 10)}...`);
        } else {
          this.addResult(`CONTRACT_${contract}`, 'WARN', 
            `Optional contract missing: ${contract}`);
        }
      }

      // Check ABI files exist
      for (const [name, contract] of Object.entries(addresses.contracts)) {
        const abiPath = join('contracts', contract.abi);
        if (existsSync(abiPath)) {
          this.addResult(`ABI_${name}`, 'PASS', `ABI file exists: ${contract.abi}`);
        } else {
          this.addResult(`ABI_${name}`, 'WARN', `ABI file missing: ${contract.abi}`);
        }
      }

    } catch (error) {
      this.addResult('CONTRACTS_FILE', 'FAIL', 
        `Failed to parse contracts file: ${error.message}`, true);
    }
  }

  private async checkDatabaseConnectivity(): Promise<void> {
    console.log('📋 Checking database connectivity...');
    
    if (!this.config.databaseUrl) {
      this.addResult('DB_CONNECTIVITY', 'FAIL', 'No DATABASE_URL provided', true);
      return;
    }

    try {
      // Test MySQL connectivity
      const mysql = require('mysql2/promise');
      const url = new URL(this.config.databaseUrl);
      const connection = await mysql.createConnection({
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1)
      });

      await connection.execute('SELECT 1');
      await connection.end();
      
      this.addResult('DB_CONNECTIVITY', 'PASS', 'MySQL connection successful');
    } catch (error) {
      this.addResult('DB_CONNECTIVITY', 'FAIL', 
        `Database connection failed: ${error.message}`, true);
    }
  }

  private checkToolingVersions(): void {
    console.log('📋 Checking tooling versions...');
    
    const tools = [
      { name: 'Node.js', cmd: 'node -v' },
      { name: 'pnpm', cmd: 'pnpm -v' },
      { name: 'TypeScript', cmd: 'tsc --version' },
      { name: 'Prisma', cmd: 'pnpm -C services/indexer prisma --version' }
    ];

    for (const tool of tools) {
      try {
        const version = execSync(tool.cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
        this.addResult(`TOOL_${tool.name.replace(/[^A-Z0-9]/g, '_')}`, 'PASS', 
          `${tool.name}: ${version}`);
      } catch (error) {
        this.addResult(`TOOL_${tool.name.replace(/[^A-Z0-9]/g, '_')}`, 'WARN', 
          `${tool.name}: Not available`);
      }
    }
  }

  private printPrecheckResults(): void {
    console.log('\n📊 PRECHECK RESULTS:');
    console.log('===================');
    console.log('Component | Status | Message');
    console.log('----------|--------|--------');
    
    for (const result of this.results) {
      const status = result.status === 'PASS' ? '✔' : result.status === 'FAIL' ? '✖' : '⚠';
      const critical = result.critical ? ' [CRITICAL]' : '';
      console.log(`${result.name.padEnd(12)} | ${status.padEnd(6)} | ${result.message}${critical}`);
    }

    const passCount = this.results.filter(r => r.status === 'PASS').length;
    const failCount = this.results.filter(r => r.status === 'FAIL').length;
    const warnCount = this.results.filter(r => r.status === 'WARN').length;
    
    console.log(`\nSummary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);
  }

  async runTests(): Promise<void> {
    console.log('\n🧪 STEP 1: RUNNING TESTS WITH LOGGING');
    console.log('=====================================');

    // Ensure Prisma is ready
    await this.preparePrisma();
    
    // Run M3 Indexer tests
    await this.runIndexerTests();
    
    // Run M4 API tests
    await this.runApiTests();
  }

  private async preparePrisma(): Promise<void> {
    console.log('📋 Preparing Prisma...');
    
    const services = ['services/indexer', 'services/api'];
    
    for (const service of services) {
      try {
        console.log(`  Generating Prisma client for ${service}...`);
        execSync(`pnpm -C ${service} prisma generate`, { stdio: 'inherit' });
        
        console.log(`  Running Prisma migrations for ${service}...`);
        try {
          execSync(`pnpm -C ${service} prisma migrate deploy`, { stdio: 'inherit' });
        } catch {
          execSync(`pnpm -C ${service} prisma migrate dev --name test_init`, { stdio: 'inherit' });
        }
      } catch (error) {
        console.warn(`  Warning: Prisma setup failed for ${service}: ${error.message}`);
      }
    }
  }

  private async runIndexerTests(): Promise<void> {
    console.log('🔧 Running M3 Indexer tests...');
    
    const commands = [
      'pnpm -C services/indexer test -- --reporter=json --reporter=junit',
      'pnpm -C services/indexer vitest run --reporter=verbose --reporter=junit'
    ];

    for (const cmd of commands) {
      try {
        const result = execSync(cmd, { 
          encoding: 'utf8', 
          stdio: 'pipe',
          cwd: process.cwd(),
          timeout: 60000
        });
        
        writeFileSync(join(this.artifactsDir, 'indexer.out.log'), result);
        console.log('  ✅ Indexer tests completed successfully');
        break;
      } catch (error) {
        writeFileSync(join(this.artifactsDir, 'indexer.err.log'), error.stdout || error.message);
        console.log(`  ⚠️ Command failed: ${cmd}`);
        if (cmd === commands[commands.length - 1]) {
          console.log('  ❌ All indexer test commands failed');
        }
      }
    }
  }

  private async runApiTests(): Promise<void> {
    console.log('🔧 Running M4 API tests...');
    
    const commands = [
      'pnpm -C services/api test -- --reporter=json --reporter=junit',
      'pnpm -C services/api vitest run --reporter=verbose --reporter=junit'
    ];

    for (const cmd of commands) {
      try {
        const result = execSync(cmd, { 
          encoding: 'utf8', 
          stdio: 'pipe',
          cwd: process.cwd(),
          timeout: 60000
        });
        
        writeFileSync(join(this.artifactsDir, 'api.out.log'), result);
        console.log('  ✅ API tests completed successfully');
        break;
      } catch (error) {
        writeFileSync(join(this.artifactsDir, 'api.err.log'), error.stdout || error.message);
        console.log(`  ⚠️ Command failed: ${cmd}`);
        if (cmd === commands[commands.length - 1]) {
          console.log('  ❌ All API test commands failed');
        }
      }
    }
  }

  async runAudit(): Promise<void> {
    console.log('🎯 TEST AUDIT ORCHESTRATOR');
    console.log('==========================');
    console.log(`Auto-fix enabled: ${this.config.autoFix}`);
    console.log(`Contracts file: ${this.config.contractsFile}`);
    console.log(`Artifacts directory: ${this.artifactsDir}\n`);

    const precheckPassed = await this.runPrecheck();
    
    if (!precheckPassed) {
      console.log('\n❌ PRECHECK FAILED - Critical issues found');
      console.log('Please fix critical issues before running tests');
      return;
    }

    console.log('\n✅ PRECHECK PASSED - Proceeding with tests');
    
    await this.runTests();
    
    console.log('\n🎯 Test audit completed');
    console.log('Check artifacts/test-logs/ for detailed results');
  }
}

// Main execution
if (require.main === module) {
  const auditor = new TestAuditor();
  auditor.runAudit().catch(console.error);
}

export { TestAuditor };
