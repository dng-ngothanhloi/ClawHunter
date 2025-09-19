import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables
dotenv.config();

export interface ApiConfig {
  // Server
  port: number;
  nodeEnv: string;
  
  // Database
  databaseUrl: string;
  
  // Blockchain
  rpcUrl: string;
  chainId: number;
  
  // Contracts
  contractsFile: string;
  contracts: ContractAddresses;
  
  // API
  corsOrigin: string[];
  rateLimitWindowMs: number;
  rateLimitMax: number;
  
  // Logging
  logLevel: string;
  logFile?: string;
  
  // Admin
  adminJwtSecret: string;
  
  // Health
  dbTimeoutMs: number;
  blockchainTimeoutMs: number;
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

export interface ContractDeployment {
  address: string;
  txHash: string;
  block: number;
  gasUsed: string;
  abi: string;
  version: string;
}

export interface AddressesFile {
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
  contracts: Record<string, ContractDeployment>;
}

function loadContractAddresses(): ContractAddresses {
  const contractsPath = resolve(process.cwd(), process.env.CONTRACTS_FILE || '../../contracts/addresses.adil.json');
  
  try {
    const addressesData = JSON.parse(readFileSync(contractsPath, 'utf8')) as AddressesFile;
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
    throw new Error(`Failed to load contract addresses from ${contractsPath}: ${error}`);
  }
}

function validateConfig(): ApiConfig {
  const requiredEnvs = ['DATABASE_URL', 'ADL_RPC_URL'];
  const missing = requiredEnvs.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  const contracts = loadContractAddresses();
  
  return {
    // Server
    port: parseInt(process.env.PORT || '4000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Database
    databaseUrl: process.env.DATABASE_URL!,
    
    // Blockchain
    rpcUrl: process.env.ADL_RPC_URL!,
    chainId: parseInt(process.env.CHAIN_ID || '123456'),
    
    // Contracts
    contractsFile: process.env.CONTRACTS_FILE || '../../contracts/addresses.adil.json',
    contracts,
    
    // API
    corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000'),
    
    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE,
    
    // Admin
    adminJwtSecret: process.env.ADMIN_JWT_SECRET || 'default-dev-secret',
    
    // Health
    dbTimeoutMs: parseInt(process.env.DB_TIMEOUT_MS || '5000'),
    blockchainTimeoutMs: parseInt(process.env.BLOCKCHAIN_TIMEOUT_MS || '10000'),
  };
}

export const config = validateConfig();

export default config;
