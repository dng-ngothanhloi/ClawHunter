#!/usr/bin/env tsx

import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import config from '../config/index.js';
import logger from '../config/logger.js';

/**
 * Demo script to post revenue to the RevenuePool contract
 * This simulates oracle posting revenue for testing the complete flow
 */

interface PostRevenueParams {
  epochId: number;
  totalRevenue: string; // In USDT (6 decimals)
  machineId?: number;
  metadata?: any;
}

class RevenuePostDemo {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private revenuePoolContract: ethers.Contract;

  constructor(privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    
    // Load RevenuePool contract
    const revenuePoolAddress = config.contracts.RevenuePool;
    const abiPath = resolve(process.cwd(), '../../contracts/artifacts/contracts/contracts/RevenuePool.sol/RevenuePool.json');
    const contractArtifact = JSON.parse(readFileSync(abiPath, 'utf8'));
    
    this.revenuePoolContract = new ethers.Contract(
      revenuePoolAddress,
      contractArtifact.abi,
      this.signer
    );
  }

  async postRevenue(params: PostRevenueParams): Promise<string> {
    const { epochId, totalRevenue, machineId, metadata } = params;
    
    logger.info('Posting revenue to RevenuePool contract', {
      epochId,
      totalRevenue,
      machineId,
      contract: this.revenuePoolContract.target,
    });

    try {
      // Convert USDT to wei (6 decimals)
      const totalRevenueWei = ethers.parseUnits(totalRevenue, 6);
      
      // Call postRevenue function
      // Note: This assumes the RevenuePool contract has a postRevenue function
      // The actual function signature may vary based on implementation
      const tx = await this.revenuePoolContract.postRevenue(
        epochId,
        totalRevenueWei,
        machineId || 0,
        metadata || '0x'
      );

      logger.info('Revenue posting transaction submitted', {
        txHash: tx.hash,
        epochId,
        totalRevenue,
      });

      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        logger.info('✅ Revenue posted successfully', {
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
        });
      } else {
        throw new Error('Transaction failed');
      }

      return receipt.hash;

    } catch (error) {
      logger.error('❌ Failed to post revenue:', error);
      throw error;
    }
  }

  async getNetworkInfo(): Promise<void> {
    const network = await this.provider.getNetwork();
    const balance = await this.provider.getBalance(this.signer.address);
    const blockNumber = await this.provider.getBlockNumber();

    logger.info('Network Information', {
      chainId: network.chainId.toString(),
      name: network.name,
      signerAddress: this.signer.address,
      balance: ethers.formatEther(balance) + ' ETH',
      currentBlock: blockNumber,
    });
  }
}

async function main(): Promise<void> {
  // Demo private key (never use in production)
  const demoPrivateKey = process.env.ORACLE_SIGNER || 
    '0x0000000000000000000000000000000000000000000000000000000000000001';

  if (demoPrivateKey === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    logger.error('❌ Please set ORACLE_SIGNER environment variable with a valid private key');
    process.exit(1);
  }

  try {
    const demo = new RevenuePostDemo(demoPrivateKey);
    
    // Show network info
    await demo.getNetworkInfo();

    // Demo revenue posting scenarios
    const scenarios: PostRevenueParams[] = [
      {
        epochId: 1,
        totalRevenue: '10000.000000', // 10,000 USDT
        machineId: 1,
        metadata: {
          source: 'demo',
          timestamp: Date.now(),
          machineRevenues: [
            { machineId: 1, revenue: '2000.000000' },
            { machineId: 2, revenue: '3000.000000' },
            { machineId: 3, revenue: '1500.000000' },
            { machineId: 4, revenue: '2500.000000' },
            { machineId: 5, revenue: '1000.000000' },
          ],
        },
      },
      {
        epochId: 2,
        totalRevenue: '12500.000000', // 12,500 USDT
        machineId: 2,
        metadata: {
          source: 'demo',
          timestamp: Date.now(),
          machineRevenues: [
            { machineId: 1, revenue: '2500.000000' },
            { machineId: 2, revenue: '3500.000000' },
            { machineId: 3, revenue: '2000.000000' },
            { machineId: 4, revenue: '3000.000000' },
            { machineId: 5, revenue: '1500.000000' },
          ],
        },
      },
    ];

    logger.info('🚀 Starting demo revenue posting...');

    for (const scenario of scenarios) {
      try {
        const txHash = await demo.postRevenue(scenario);
        logger.info(`✅ Posted revenue for epoch ${scenario.epochId}: ${txHash}`);
        
        // Wait a bit between transactions
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        logger.error(`❌ Failed to post revenue for epoch ${scenario.epochId}:`, error);
      }
    }

    logger.info('🎉 Demo revenue posting completed!');
    logger.info('📊 You can now check the indexer logs to see event processing');
    logger.info('🔗 Test the API endpoints to see the processed data');

  } catch (error) {
    logger.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🎮 Claw Hunters Revenue Posting Demo

Usage:
  tsx src/scripts/demo_postRevenue.ts [options]

Options:
  --help, -h     Show this help message

Environment Variables:
  ORACLE_SIGNER  Private key for signing transactions (required)
  ADL_RPC_URL    RPC URL for AdilChain Devnet
  
Examples:
  # Set oracle signer and run demo
  export ORACLE_SIGNER="0x..."
  tsx src/scripts/demo_postRevenue.ts
  
  # Run with specific RPC
  export ADL_RPC_URL="https://devnet.adilchain-rpc.io"
  tsx src/scripts/demo_postRevenue.ts

Note: This script posts demo revenue data to the RevenuePool contract.
The indexer should be running to process the events and update the database.
    `);
    process.exit(0);
  }

  main();
}
