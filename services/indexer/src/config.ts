import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables
dotenv.config();

export interface IndexerConfig {
  // Database
  databaseUrl: string;
  shadowDatabaseUrl?: string;
  
  // Blockchain
  rpcUrl: string;
  chainId: number;
  startBlock: number;
  
  // Oracle
  oracleSigner: string;
  
  // Timezone
  timezone: string;
  
  // Logging
  logLevel: string;
  logFile?: string;
  
  // Jobs
  snapshotCron: string;
  merkleDelayMs: number;
  publishDelayMs: number;
  
  // Contract addresses
  addressesFile: string;
  contracts: ContractAddresses;
  
  // Performance
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface ContractAddresses {
  CHG: string;
  NFTClaw: string;
  NFTOwner: string;
  NFTTicket?: string;
  RevenuePool: string;
  RevenueSplitter: string;
  ClaimProcessor: string;
  CHGStaking: string;
}

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
}

export interface DeploymentConfig {
  deployer: string;
  timestamp: number;
  blockNumber: number;
  totalGasUsed: string;
}

export interface ContractDeployment {
  address: string;
  txHash: string;
  block: number;
  gasUsed: string;
  abi: string;
  version: string;
}

export interface AddressesFile {
  network: NetworkConfig;
  deployment: DeploymentConfig;
  contracts: Record<string, ContractDeployment>;
}

function loadContractAddresses(): ContractAddresses {
  const addressesPath = resolve(process.cwd(), process.env.ADDRESSES_FILE || '../../contracts/addresses.adil.json');
  
  try {
    const addressesData = JSON.parse(readFileSync(addressesPath, 'utf8')) as AddressesFile;
    const contracts = addressesData.contracts;
    
    return {
      CHG: contracts.CHG.address,
      NFTClaw: contracts.NFTClaw.address,
      NFTOwner: contracts.NFTOwner.address,
      NFTTicket: contracts.NFTTicket?.address,
      RevenuePool: contracts.RevenuePool.address,
      RevenueSplitter: contracts.RevenueSplitter.address,
      ClaimProcessor: contracts.ClaimProcessor.address,
      CHGStaking: contracts.CHGStaking.address,
    };
  } catch (error) {
    throw new Error(`Failed to load contract addresses from ${addressesPath}: ${error}`);
  }
}

function validateConfig(): IndexerConfig {
  const requiredEnvs = ['DATABASE_URL', 'ADL_RPC_URL', 'ORACLE_SIGNER'];
  const missing = requiredEnvs.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  const contracts = loadContractAddresses();
  
  return {
    // Database
    databaseUrl: process.env.DATABASE_URL!,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
    
    // Blockchain
    rpcUrl: process.env.ADL_RPC_URL!,
    chainId: parseInt(process.env.CHAIN_ID || '123456'),
    startBlock: parseInt(process.env.START_BLOCK || '26128968'),
    
    // Oracle
    oracleSigner: process.env.ORACLE_SIGNER!,
    
    // Timezone
    timezone: process.env.TZ || 'Asia/Ho_Chi_Minh',
    
    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE,
    
    // Jobs
    snapshotCron: process.env.SNAPSHOT_CRON || '0 0 * * *',
    merkleDelayMs: parseInt(process.env.MERKLE_DELAY_MS || '30000'),
    publishDelayMs: parseInt(process.env.PUBLISH_DELAY_MS || '60000'),
    
    // Contract addresses
    addressesFile: process.env.ADDRESSES_FILE || '../../contracts/addresses.adil.json',
    contracts,
    
    // Performance
    batchSize: parseInt(process.env.BATCH_SIZE || '1000'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '5000'),
  };
}

export const config = validateConfig();

export default config;
