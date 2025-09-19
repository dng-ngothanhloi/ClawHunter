import { ethers, JsonRpcProvider } from 'ethers';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import config from './index.js';
import logger from './logger.js';

export class BlockchainClient {
  private static instance: BlockchainClient | null = null;
  private provider: JsonRpcProvider;
  private contracts: Map<string, ethers.Contract> = new Map();

  private constructor() {
    this.provider = new JsonRpcProvider(config.rpcUrl);
  }

  static getInstance(): BlockchainClient {
    if (!BlockchainClient.instance) {
      BlockchainClient.instance = new BlockchainClient();
    }
    return BlockchainClient.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Verify network connection
      const network = await this.provider.getNetwork();
      logger.info(`Connected to blockchain network: ${network.name} (Chain ID: ${network.chainId})`);
      
      if (Number(network.chainId) !== config.chainId) {
        throw new Error(`Chain ID mismatch: expected ${config.chainId}, got ${network.chainId}`);
      }

      // Load contract ABIs and create instances
      await this.loadContracts();
      
      logger.info(`Blockchain client initialized with ${this.contracts.size} contracts`);
    } catch (error) {
      logger.error('Failed to initialize blockchain client:', error);
      throw error;
    }
  }

  private async loadContracts(): Promise<void> {
    const contractNames = ['CHG', 'NFTClaw', 'NFTOwner', 'RevenuePool', 'RevenueSplitter', 'ClaimProcessor', 'CHGStaking'];
    
    for (const name of contractNames) {
      try {
        const address = config.contracts[name as keyof typeof config.contracts];
        if (!address) {
          logger.warn(`Contract address not found for ${name}`);
          continue;
        }

        const abiPath = resolve(process.cwd(), `../../contracts/artifacts/contracts/contracts/${name}.sol/${name}.json`);
        const contractArtifact = JSON.parse(readFileSync(abiPath, 'utf8'));
        
        const contract = new ethers.Contract(address, contractArtifact.abi, this.provider);
        this.contracts.set(name, contract);
        
        logger.debug(`Loaded contract ${name} at ${address}`);
      } catch (error) {
        logger.warn(`Failed to load contract ${name}:`, error);
      }
    }
  }

  getProvider(): JsonRpcProvider {
    return this.provider;
  }

  getContract(name: string): ethers.Contract | undefined {
    return this.contracts.get(name);
  }

  async getCurrentBlock(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  async getBlockTimestamp(blockNumber: number): Promise<number> {
    const block = await this.provider.getBlock(blockNumber);
    return block?.timestamp || 0;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await Promise.race([
        this.provider.getBlockNumber(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), config.blockchainTimeoutMs)
        )
      ]);
      return true;
    } catch (error) {
      logger.error('Blockchain health check failed:', error);
      return false;
    }
  }

  async getNetworkInfo(): Promise<{
    chainId: bigint;
    name: string;
    blockNumber: number;
  }> {
    const network = await this.provider.getNetwork();
    const blockNumber = await this.provider.getBlockNumber();
    
    return {
      chainId: network.chainId,
      name: network.name,
      blockNumber,
    };
  }
}

export const blockchain = BlockchainClient.getInstance();

// Export getContract function for external use
export const getContract = (contractName: string) => {
  return blockchain.getContract(contractName);
};

export default blockchain;
