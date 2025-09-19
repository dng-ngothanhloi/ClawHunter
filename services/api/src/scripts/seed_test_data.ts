#!/usr/bin/env node

/**
 * Test Data Seeding Script for M4 API
 * Creates comprehensive test data for API endpoint validation
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function seedTestData(): Promise<void> {
  console.log('🌱 SEEDING M4 API TEST DATABASE');
  console.log('===============================');
  console.log('');

  try {
    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await prisma.claimableReward.deleteMany();
    await prisma.claimedReward.deleteMany();
    await prisma.ownerShareSnapshot.deleteMany();
    await prisma.stakingSnapshot.deleteMany();
    await prisma.merkleLeaf.deleteMany();
    await prisma.merkleRoot.deleteMany();
    await prisma.machineRevenue.deleteMany();
    await prisma.revenueEpoch.deleteMany();
    console.log('✅ Existing data cleared');

    // Sample epochs data
    const epochs = [
      {
        epochId: 1,
        totalR: new Decimal('100000.000000'), // 100k USDT
        alpha: new Decimal('20000.000000'),   // 20%
        beta: new Decimal('3000.000000'),     // 3%
        gamma: new Decimal('3000.000000'),    // 3%
        delta: new Decimal('4000.000000'),    // 4%
        opc: new Decimal('70000.000000'),     // 70%
        blockNumber: BigInt(1000000),
        blockTime: new Date('2025-09-01T12:00:00Z'),
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        machines: [
          { machineId: 1, revenue: '50000.000000' },
          { machineId: 2, revenue: '30000.000000' },
          { machineId: 3, revenue: '20000.000000' }
        ],
        owners: [
          { account: '0x1111111111111111111111111111111111111111', amount: '1.000000000000000000', weight: 1000 },
          { account: '0x2222222222222222222222222222222222222222', amount: '1.000000000000000000', weight: 1500 },
          { account: '0x3333333333333333333333333333333333333333', amount: '1.000000000000000000', weight: 2000 }
        ]
      },
      {
        epochId: 2,
        totalR: new Decimal('150000.000000'), // 150k USDT
        alpha: new Decimal('30000.000000'),   // 20%
        beta: new Decimal('4500.000000'),     // 3%
        gamma: new Decimal('4500.000000'),    // 3%
        delta: new Decimal('6000.000000'),    // 4%
        opc: new Decimal('105000.000000'),    // 70%
        blockNumber: BigInt(1000100),
        blockTime: new Date('2025-09-02T12:00:00Z'),
        txHash: '0x2345678901bcdef012345678901bcdef012345678901bcdef012345678901bcdef0',
        machines: [
          { machineId: 1, revenue: '75000.000000' },
          { machineId: 2, revenue: '45000.000000' },
          { machineId: 3, revenue: '30000.000000' }
        ],
        owners: [
          { account: '0x1111111111111111111111111111111111111111', amount: '1.000000000000000000', weight: 1000 },
          { account: '0x2222222222222222222222222222222222222222', amount: '1.000000000000000000', weight: 1500 },
          { account: '0x3333333333333333333333333333333333333333', amount: '1.000000000000000000', weight: 2000 }
        ]
      }
    ];

    for (const epoch of epochs) {
      await createEpochData(epoch);
    }

    console.log('');
    console.log('🎉 Test data seeding completed successfully!');
    console.log('📊 Generated comprehensive test data for all API endpoints');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function to create epoch data
async function createEpochData(epoch: any): Promise<void> {
  console.log(`📊 Creating epoch ${epoch.epochId} with ${epoch.totalR} USDT...`);
  
  const epochTime = new Date();

  // Create revenue epoch
  await prisma.revenueEpoch.create({
    data: {
      epochId: BigInt(epoch.epochId),
      totalR: epoch.totalR,
      alpha: epoch.alpha,
      beta: epoch.beta,
      gamma: epoch.gamma,
      delta: epoch.delta,
      opc: epoch.opc,
      blockNumber: epoch.blockNumber,
      blockTime: epoch.blockTime,
      txHash: epoch.txHash,
      createdAt: epochTime,
      updatedAt: epochTime
    }
  });

  // Create machine revenues
  for (const machine of epoch.machines) {
    await prisma.machineRevenue.create({
      data: {
        epochId: BigInt(epoch.epochId),
        machineId: BigInt(machine.machineId),
        Rm: new Decimal(machine.revenue),
        blockNumber: epoch.blockNumber,
        txHash: `0x${epoch.epochId.toString().padStart(32, '0')}${machine.machineId.toString().padStart(32, '0')}`,
        createdAt: epochTime
      }
    });
  }

  // Create owner share snapshots
  for (const owner of epoch.owners) {
    const effectiveShare = new Decimal(owner.amount).div(epoch.totalR).mul(10000); // Convert to basis points
    
    await prisma.ownerShareSnapshot.create({
      data: {
        epochId: BigInt(epoch.epochId),
        machineId: BigInt(1), // Default machine ID
        account: owner.account,
        shareBps: effectiveShare.toNumber(),
        effectiveShare: effectiveShare,
        createdAt: epochTime
      }
    });
  }

  // Create staking snapshots
  for (const owner of epoch.owners) {
    const stakedAmount = new Decimal(owner.amount);
    const effectiveWeight = new Decimal('1.0'); // Use a simple fixed value for testing
    
    await prisma.stakingSnapshot.create({
      data: {
        epochId: BigInt(epoch.epochId),
        account: owner.account,
        amount: stakedAmount,
        weight: owner.weight,
        effectiveWeight: effectiveWeight,
        lockUntil: new Date(epochTime.getTime() + 365 * 24 * 60 * 60 * 1000),
        createdAt: epochTime
      }
    });
  }

  // Create sample Merkle data for all groups
  const groups = ['A', 'B', 'G']; // Alpha, Beta, Gamma
  for (const group of groups) {
    let total = new Decimal('0');
    if (group === 'A') total = epoch.alpha;
    else if (group === 'B') total = epoch.beta;
    else if (group === 'G') total = epoch.gamma;
    
    await prisma.merkleRoot.create({
      data: {
        epochId: BigInt(epoch.epochId),
        group: group,
        root: epoch.txHash,
        total: total,
        leafCount: epoch.owners.length,
        createdAt: epochTime,
        updatedAt: epochTime
      }
    });
  }
  
  // Create merkle leaves for different reward groups
  for (const group of groups) {
    if (group === 'A') {
      // Alpha pool - staking rewards
      for (const owner of epoch.owners) {
        await prisma.merkleLeaf.create({
          data: {
            epochId: BigInt(epoch.epochId),
            group: group,
            account: owner.account,
            amount: new Decimal(owner.amount).mul(0.2), // 20% to alpha pool
            leafHash: `0x${group}${epoch.epochId}${owner.account.slice(-8)}`,
            proof: [`0x${group}${epoch.epochId}${owner.account.slice(-8)}`],
            createdAt: epochTime,
            updatedAt: epochTime
          }
        });
      }
    } else if (group === 'B') {
      // Beta pool - NFT claw rewards
      await prisma.merkleLeaf.create({
        data: {
          epochId: BigInt(epoch.epochId),
          group: group,
          account: '0x4444444444444444444444444444444444444444',
          amount: epoch.beta, // 3% to beta pool
          leafHash: `0x${group}${epoch.epochId}beta`,
          proof: [`0x${group}${epoch.epochId}beta`],
          createdAt: epochTime,
          updatedAt: epochTime
        }
      });
    } else if (group === 'G') {
      // Gamma pool - owner rewards
      for (const owner of epoch.owners) {
        await prisma.merkleLeaf.create({
          data: {
            epochId: BigInt(epoch.epochId),
            group: group,
            account: owner.account,
            amount: new Decimal(owner.amount).mul(0.03), // 3% to gamma pool
            leafHash: `0x${group}${epoch.epochId}${owner.account.slice(-8)}`,
            proof: [`0x${group}${epoch.epochId}${owner.account.slice(-8)}`],
            createdAt: epochTime,
            updatedAt: epochTime
          }
        });
      }
    }
  }
  
  console.log(`✅ Epoch ${epoch.epochId} created successfully`);
}

// Execute seeding
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTestData()
    .then(() => {
      console.log('🎉 Database seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}