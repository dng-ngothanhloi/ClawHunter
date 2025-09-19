import { ethers, Contract, JsonRpcProvider, Interface } from 'ethers';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import config from './config.js';
import logger from './lib/logger.js';

export interface ContractInstance {
  address: string;
  contract: Contract;
  interface: Interface;
  startBlock: number;
}

export class ContractManager {
  private provider: JsonRpcProvider;
  private signer?: ethers.Wallet;
  private contracts: Map<string, ContractInstance> = new Map();
  
  constructor() {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    
    if (config.oracleSigner && config.oracleSigner !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      this.signer = new ethers.Wallet(config.oracleSigner, this.provider);
    }
  }
  
  async initialize(): Promise<void> {
    logger.info('Initializing contract manager...');
    
    // Load ABIs and create contract instances
    await this.loadContract('CHG', config.contracts.CHG);
    await this.loadContract('NFTClaw', config.contracts.NFTClaw);
    await this.loadContract('NFTOwner', config.contracts.NFTOwner);
    await this.loadContract('RevenuePool', config.contracts.RevenuePool);
    await this.loadContract('RevenueSplitter', config.contracts.RevenueSplitter);
    await this.loadContract('ClaimProcessor', config.contracts.ClaimProcessor);
    await this.loadContract('CHGStaking', config.contracts.CHGStaking);
    
    if (config.contracts.NFTTicket) {
      await this.loadContract('NFTTicket', config.contracts.NFTTicket);
    }
    
    // Verify network connection
    const network = await this.provider.getNetwork();
    logger.info(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
    
    if (Number(network.chainId) !== config.chainId) {
      throw new Error(`Chain ID mismatch: expected ${config.chainId}, got ${network.chainId}`);
    }
    
    logger.info(`Contract manager initialized with ${this.contracts.size} contracts`);
  }
  
  private async loadContract(name: string, address: string): Promise<void> {
    try {
      const abiPath = resolve(process.cwd(), `../../contracts/artifacts/contracts/contracts/${name}.sol/${name}.json`);
      const contractArtifact = JSON.parse(readFileSync(abiPath, 'utf8'));
      const abi = contractArtifact.abi;
      
      const contract = new Contract(address, abi, this.provider);
      const contractInterface = new Interface(abi);
      
      // Get deployment block from addresses file
      const addressesPath = resolve(process.cwd(), config.addressesFile);
      const addressesData = JSON.parse(readFileSync(addressesPath, 'utf8'));
      const startBlock = addressesData.contracts[name]?.block || config.startBlock;
      
      this.contracts.set(name, {
        address,
        contract,
        interface: contractInterface,
        startBlock
      });
      
      logger.debug(`Loaded contract ${name} at ${address} (start block: ${startBlock})`);
    } catch (error) {
      logger.error(`Failed to load contract ${name}:`, error);
      throw error;
    }
  }
  
  getContract(name: string): ContractInstance {
    const contract = this.contracts.get(name);
    if (!contract) {
      throw new Error(`Contract ${name} not found`);
    }
    return contract;
  }
  
  getContractWithSigner(name: string): Contract {
    if (!this.signer) {
      throw new Error('No signer available. Check ORACLE_SIGNER environment variable.');
    }
    
    const contractInstance = this.getContract(name);
    return contractInstance.contract.connect(this.signer);
  }
  
  getAllContracts(): Map<string, ContractInstance> {
    return new Map(this.contracts);
  }
  
  getProvider(): JsonRpcProvider {
    return this.provider;
  }
  
  getSigner(): ethers.Wallet | undefined {
    return this.signer;
  }
  
  async getCurrentBlock(): Promise<number> {
    return await this.provider.getBlockNumber();
  }
  
  async getBlockTimestamp(blockNumber: number): Promise<number> {
    const block = await this.provider.getBlock(blockNumber);
    return block?.timestamp || 0;
  }
}

// Singleton instance
let contractManager: ContractManager | null = null;

export function getContractManager(): ContractManager {
  if (!contractManager) {
    contractManager = new ContractManager();
  }
  return contractManager;
}

export default getContractManager;
