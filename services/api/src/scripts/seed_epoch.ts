#!/usr/bin/env tsx

import { db } from '../config/database.js';
import logger from '../config/logger.js';

/**
 * Seed script to create demo revenue epoch data
 * This script creates sample data for testing the API endpoints
 */

interface SeedData {
  epochId: bigint;
  totalRevenue: number;
  machineRevenues: Array<{
    machineId: number;
    revenue: number;
  }>;
  stakingPositions: Array<{
    account: string;
    amount: string;
    weight: number;
    lockUntil?: Date;
  }>;
  ownerShares: Array<{
    account: string;
    machineId: number;
    shareBps: number;
  }>;
}

const sampleData: SeedData[] = [
  {
    epochId: 1n,
    totalRevenue: 10000, // 10,000 USDT
    machineRevenues: [
      { machineId: 1, revenue: 2000 },
      { machineId: 2, revenue: 3000 },
      { machineId: 3, revenue: 1500 },
      { machineId: 4, revenue: 2500 },
      { machineId: 5, revenue: 1000 },
    ],
    stakingPositions: [
      {
        account: '0x1234567890123456789012345678901234567890',
        amount: '100000000000000000000000', // 100,000 CHG
        weight: 3000, // 365 days
        lockUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      {
        account: '0x2345678901234567890123456789012345678901',
        amount: '50000000000000000000000', // 50,000 CHG
        weight: 2000, // 180 days
        lockUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      },
      {
        account: '0x3456789012345678901234567890123456789012',
        amount: '25000000000000000000000', // 25,000 CHG
        weight: 1500, // 90 days
        lockUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    ],
    ownerShares: [
      { account: '0x1234567890123456789012345678901234567890', machineId: 1, shareBps: 5000 }, // 50%
      { account: '0x2345678901234567890123456789012345678901', machineId: 1, shareBps: 3000 }, // 30%
      { account: '0x3456789012345678901234567890123456789012', machineId: 1, shareBps: 2000 }, // 20%
      { account: '0x1234567890123456789012345678901234567890', machineId: 2, shareBps: 7500 }, // 75%
      { account: '0x4567890123456789012345678901234567890123', machineId: 2, shareBps: 2500 }, // 25%
    ],
  },
  {
    epochId: 2n,
    totalRevenue: 12500, // 12,500 USDT
    machineRevenues: [
      { machineId: 1, revenue: 2500 },
      { machineId: 2, revenue: 3500 },
      { machineId: 3, revenue: 2000 },
      { machineId: 4, revenue: 3000 },
      { machineId: 5, revenue: 1500 },
    ],
    stakingPositions: [
      {
        account: '0x1234567890123456789012345678901234567890',
        amount: '110000000000000000000000', // 110,000 CHG (increased)
        weight: 3000, // 365 days
        lockUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      {
        account: '0x2345678901234567890123456789012345678901',
        amount: '55000000000000000000000', // 55,000 CHG (increased)
        weight: 2000, // 180 days
        lockUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      },
      {
        account: '0x3456789012345678901234567890123456789012',
        amount: '30000000000000000000000', // 30,000 CHG (increased)
        weight: 1500, // 90 days
        lockUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      {
        account: '0x5678901234567890123456789012345678901234',
        amount: '20000000000000000000000', // 20,000 CHG (new staker)
        weight: 1000, // 30 days
        lockUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    ],
    ownerShares: [
      { account: '0x1234567890123456789012345678901234567890', machineId: 1, shareBps: 5000 },
      { account: '0x2345678901234567890123456789012345678901', machineId: 1, shareBps: 3000 },
      { account: '0x3456789012345678901234567890123456789012', machineId: 1, shareBps: 2000 },
      { account: '0x1234567890123456789012345678901234567890', machineId: 2, shareBps: 7500 },
      { account: '0x4567890123456789012345678901234567890123', machineId: 2, shareBps: 2500 },
      { account: '0x5678901234567890123456789012345678901234', machineId: 3, shareBps: 10000 }, // New full owner
    ],
  },
];

async function calculateRevenueDistribution(totalR: number) {
  // Implement exact 70/20/3/3/4 split with floor division and remainder to OPC
  const DENOM = 10000;
  
  const alphaFloor = Math.floor((totalR * 2000) / DENOM); // 20%
  const betaFloor = Math.floor((totalR * 300) / DENOM);   // 3%
  const gammaFloor = Math.floor((totalR * 300) / DENOM);  // 3%
  const deltaFloor = Math.floor((totalR * 400) / DENOM);  // 4%
  const opcBase = Math.floor((totalR * 7000) / DENOM);    // 70%
  
  // Remainder goes to OPC (as per spec)
  const allocated = alphaFloor + betaFloor + gammaFloor + deltaFloor + opcBase;
  const remainder = totalR - allocated;
  const opcFinal = opcBase + remainder;

  return {
    totalR,
    alpha: alphaFloor,
    beta: betaFloor,
    gamma: gammaFloor,
    delta: deltaFloor,
    opc: opcFinal,
  };
}

async function seedEpoch(data: SeedData): Promise<void> {
  const { epochId, totalRevenue } = data;
  
  logger.info(`Seeding epoch ${epochId} with ${totalRevenue} USDT revenue`);

  // Calculate revenue distribution
  const distribution = await calculateRevenueDistribution(totalRevenue);

  // Create revenue epoch
  await db.revenueEpoch.upsert({
    where: { epochId },
    update: {
      totalR: distribution.totalR,
      alpha: distribution.alpha,
      beta: distribution.beta,
      gamma: distribution.gamma,
      delta: distribution.delta,
      opc: distribution.opc,
      blockNumber: 1000000n + epochId, // Mock block number
      blockTime: new Date(),
      txHash: `0x${epochId.toString().padStart(64, '0')}`, // Mock transaction hash
      updatedAt: new Date(),
    },
    create: {
      epochId,
      totalR: distribution.totalR,
      alpha: distribution.alpha,
      beta: distribution.beta,
      gamma: distribution.gamma,
      delta: distribution.delta,
      opc: distribution.opc,
      blockNumber: 1000000n + epochId,
      blockTime: new Date(),
      txHash: `0x${epochId.toString().padStart(64, '0')}`,
    },
  });

  // Create machine revenues
  for (const machineRevenue of data.machineRevenues) {
    await db.machineRevenue.upsert({
      where: {
        epochId_machineId: {
          epochId,
          machineId: BigInt(machineRevenue.machineId),
        },
      },
      update: {
        Rm: machineRevenue.revenue,
        blockNumber: 1000000n + epochId,
        txHash: `0x${epochId.toString()}${machineRevenue.machineId.toString().padStart(8, '0')}`,
      },
      create: {
        epochId,
        machineId: BigInt(machineRevenue.machineId),
        Rm: machineRevenue.revenue,
        blockNumber: 1000000n + epochId,
        txHash: `0x${epochId.toString()}${machineRevenue.machineId.toString().padStart(8, '0')}`,
      },
    });
  }

  // Create staking snapshots
  for (const position of data.stakingPositions) {
    const effectiveWeight = BigInt(position.amount) * BigInt(position.weight);
    
    await db.stakingSnapshot.upsert({
      where: {
        epochId_account: {
          epochId,
          account: position.account.toLowerCase(),
        },
      },
      update: {
        amount: position.amount,
        weight: position.weight,
        effectiveWeight: effectiveWeight.toString(),
        lockUntil: position.lockUntil,
      },
      create: {
        epochId,
        account: position.account.toLowerCase(),
        amount: position.amount,
        weight: position.weight,
        effectiveWeight: effectiveWeight.toString(),
        lockUntil: position.lockUntil,
      },
    });
  }

  // Create owner share snapshots
  for (const share of data.ownerShares) {
    const effectiveShare = (share.shareBps / 10000) * 100; // Convert BPS to percentage
    
    await db.ownerShareSnapshot.upsert({
      where: {
        epochId_account_machineId: {
          epochId,
          account: share.account.toLowerCase(),
          machineId: BigInt(share.machineId),
        },
      },
      update: {
        shareBps: share.shareBps,
        effectiveShare,
      },
      create: {
        epochId,
        account: share.account.toLowerCase(),
        machineId: BigInt(share.machineId),
        shareBps: share.shareBps,
        effectiveShare,
      },
    });
  }

  logger.info(`✅ Seeded epoch ${epochId} successfully`, {
    machineRevenues: data.machineRevenues.length,
    stakingPositions: data.stakingPositions.length,
    ownerShares: data.ownerShares.length,
    distribution,
  });
}

async function main(): Promise<void> {
  try {
    logger.info('🌱 Starting seed process for API demo data...');

    for (const epochData of sampleData) {
      await seedEpoch(epochData);
    }

    // Create some sample Merkle roots and leaves for claims testing
    await createSampleClaims();

    logger.info('✅ Seed process completed successfully');
    logger.info('🔗 You can now test the API endpoints with the seeded data');
    
    // Print some sample API calls
    console.log('\n📡 Sample API calls to test:');
    console.log('curl http://localhost:4000/api/revenue/epoch/1');
    console.log('curl http://localhost:4000/api/machine/1/revenue');
    console.log('curl http://localhost:4000/api/staking/0x1234567890123456789012345678901234567890/positions');
    console.log('curl http://localhost:4000/api/nftowner/0x1234567890123456789012345678901234567890/shares');
    console.log('curl http://localhost:4000/api/claims/0x1234567890123456789012345678901234567890');

  } catch (error) {
    logger.error('❌ Seed process failed:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

async function createSampleClaims(): Promise<void> {
  logger.info('Creating sample Merkle roots and claims...');

  for (const epochData of sampleData) {
    const { epochId } = epochData;

    // Create sample Merkle roots for each group
    const groups = ['A', 'B', 'G'];
    const groupTotals = { A: 2000, B: 300, G: 300 }; // Sample amounts

    for (const group of groups) {
      await db.merkleRoot.upsert({
        where: {
          epochId_group: { epochId, group },
        },
        update: {
          root: `0x${group.toLowerCase()}${epochId.toString().padStart(63, '0')}`,
          total: groupTotals[group as keyof typeof groupTotals],
          leafCount: 3,
          published: true,
          publishedTx: `0x${group.toLowerCase()}${epochId.toString().padStart(31, '0')}pub`,
          updatedAt: new Date(),
        },
        create: {
          epochId,
          group,
          root: `0x${group.toLowerCase()}${epochId.toString().padStart(63, '0')}`,
          total: groupTotals[group as keyof typeof groupTotals],
          leafCount: 3,
          published: true,
          publishedTx: `0x${group.toLowerCase()}${epochId.toString().padStart(31, '0')}pub`,
        },
      });

      // Create sample claims for each account
      const accounts = [
        '0x1234567890123456789012345678901234567890',
        '0x2345678901234567890123456789012345678901',
        '0x3456789012345678901234567890123456789012',
      ];

      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        const amount = (groupTotals[group as keyof typeof groupTotals] / accounts.length).toFixed(6);
        const leafHash = `0x${group.toLowerCase()}${epochId.toString()}${i.toString().padStart(60, '0')}`;
        const proof = [
          `0x${group.toLowerCase()}proof1${epochId.toString().padStart(56, '0')}`,
          `0x${group.toLowerCase()}proof2${epochId.toString().padStart(56, '0')}`,
        ];

        await db.merkleLeaf.upsert({
          where: {
            epochId_group_account: {
              epochId,
              group,
              account: account.toLowerCase(),
            },
          },
          update: {
            amount: parseFloat(amount),
            leafHash,
            proof: JSON.stringify(proof),
            claimed: false,
            updatedAt: new Date(),
          },
          create: {
            epochId,
            group,
            account: account.toLowerCase(),
            amount: parseFloat(amount),
            leafHash,
            proof: JSON.stringify(proof),
            claimed: false,
          },
        });
      }
    }
  }

  logger.info('✅ Sample claims created');
}

// Run the seed script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
