#!/usr/bin/env node

/**
 * Simple Database Seeding Script
 * Creates test data for M4 API testing
 */

const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');

async function seedDatabase() {
  console.log('🌱 SEEDING TEST DATABASE');
  console.log('========================');
  
  const prisma = new PrismaClient();
  
  try {
    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await prisma.merkleLeaf.deleteMany();
    await prisma.merkleRoot.deleteMany();
    await prisma.stakingSnapshot.deleteMany();
    await prisma.ownerShareSnapshot.deleteMany();
    await prisma.machineRevenue.deleteMany();
    await prisma.revenueEpoch.deleteMany();
    console.log('✅ Existing data cleared');
    
    // Create sample epochs
    const epochs = [
      {
        epochId: 1n,
        totalR: '10000.000000',
        machines: [
          { machineId: 1n, Rm: '6000.000000' },
          { machineId: 2n, Rm: '4000.000000' }
        ]
      },
      {
        epochId: 2n,
        totalR: '15000.000000',
        machines: [
          { machineId: 1n, Rm: '9000.000000' },
          { machineId: 2n, Rm: '6000.000000' }
        ]
      },
      {
        epochId: 3n,
        totalR: '8500.000000',
        machines: [
          { machineId: 1n, Rm: '5000.000000' },
          { machineId: 2n, Rm: '3500.000000' }
        ]
      }
    ];
    
    for (const epoch of epochs) {
      console.log(`📊 Creating epoch ${epoch.epochId} with ${epoch.totalR} USDT...`);
      
      // Calculate distribution (exact spec math)
      const totalR = new Decimal(epoch.totalR);
      const DENOM = 10000;
      
      const alphaFloor = totalR.mul(2000).div(DENOM).floor();  // 20%
      const betaFloor = totalR.mul(300).div(DENOM).floor();    // 3%
      const gammaFloor = totalR.mul(300).div(DENOM).floor();   // 3%
      const deltaFloor = totalR.mul(400).div(DENOM).floor();   // 4%
      const opcBase = totalR.mul(7000).div(DENOM).floor();     // 70%
      
      const distributed = alphaFloor.add(betaFloor).add(gammaFloor).add(deltaFloor).add(opcBase);
      const remainder = totalR.sub(distributed);
      const opcFinal = opcBase.add(remainder);
      
      const epochTime = new Date(`2025-09-0${Number(epoch.epochId)}T00:00:00Z`);
      
      // Create revenue epoch
      await prisma.revenueEpoch.create({
        data: {
          epochId: epoch.epochId,
          totalR: totalR,
          alpha: alphaFloor,
          beta: betaFloor,
          gamma: gammaFloor,
          delta: deltaFloor,
          opc: opcFinal,
          blockNumber: BigInt(26129000 + Number(epoch.epochId) * 100),
          blockTime: epochTime,
          txHash: `0x${epoch.epochId.toString().padStart(64, '0')}`,
          createdAt: epochTime,
          updatedAt: epochTime
        }
      });
      
      // Create machine revenues
      for (const machine of epoch.machines) {
        await prisma.machineRevenue.create({
          data: {
            epochId: epoch.epochId,
            machineId: machine.machineId,
            Rm: new Decimal(machine.Rm),
            blockNumber: BigInt(26129000 + Number(epoch.epochId) * 100 + Number(machine.machineId)),
            txHash: `0x${epoch.epochId.toString().padStart(32, '0')}${machine.machineId.toString().padStart(32, '0')}`,
            createdAt: epochTime
          }
        });
      }
      
      // Create sample owner shares
      const owners = [
        { account: '0x1111111111111111111111111111111111111111', machineId: 1n, shareBps: 5000 },
        { account: '0x2222222222222222222222222222222222222222', machineId: 1n, shareBps: 3000 },
        { account: '0x3333333333333333333333333333333333333333', machineId: 1n, shareBps: 2000 },
        { account: '0x4444444444444444444444444444444444444444', machineId: 2n, shareBps: 10000 }
      ];
      
      for (const owner of owners) {
        const machineRevenue = epoch.machines.find(m => m.machineId === owner.machineId);
        if (machineRevenue) {
          const effectiveShare = gammaFloor.mul(owner.shareBps).div(10000).div(epoch.machines.length);
          
          await prisma.ownerShareSnapshot.create({
            data: {
              epochId: epoch.epochId,
              account: owner.account,
              machineId: owner.machineId,
              shareBps: owner.shareBps,
              effectiveShare: effectiveShare,
              createdAt: epochTime
            }
          });
        }
      }
      
      // Create sample staking snapshots
      const stakers = [
        { account: '0x1111111111111111111111111111111111111111', amount: '100000.000000000000000000', weight: 3000 },
        { account: '0x2222222222222222222222222222222222222222', amount: '50000.000000000000000000', weight: 2000 },
        { account: '0x5555555555555555555555555555555555555555', amount: '25000.000000000000000000', weight: 1500 }
      ];
      
      for (const staker of stakers) {
        const effectiveWeight = new Decimal(staker.amount).mul(staker.weight);
        
        await prisma.stakingSnapshot.create({
          data: {
            epochId: epoch.epochId,
            account: staker.account,
            amount: new Decimal(staker.amount),
            weight: staker.weight,
            effectiveWeight: effectiveWeight,
            lockUntil: new Date(epochTime.getTime() + 365 * 24 * 60 * 60 * 1000),
            createdAt: epochTime
          }
        });
      }
      
      // Create sample Merkle data
      const groups = ['A', 'B', 'G'];
      const groupAmounts = [alphaFloor, betaFloor, gammaFloor];
      
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const amount = groupAmounts[i];
        
        // Create Merkle root
        await prisma.merkleRoot.create({
          data: {
            epochId: epoch.epochId,
            group: group,
            root: `0x${group.charCodeAt(0).toString(16).padStart(64, '0')}`,
            total: amount,
            leafCount: group === 'A' ? 3 : group === 'G' ? 4 : 1,
            published: true,
            publishedTx: `0x${epoch.epochId.toString().padStart(32, '0')}${group.charCodeAt(0).toString(16).padStart(32, '0')}`,
            createdAt: epochTime,
            updatedAt: epochTime
          }
        });
        
        // Create sample leaves
        if (group === 'A') {
          // Alpha pool - staking rewards
          for (const staker of stakers) {
            const rewardAmount = amount.mul(staker.weight).div(6500); // Simplified calculation
            
            await prisma.merkleLeaf.create({
              data: {
                epochId: epoch.epochId,
                group: group,
                account: staker.account,
                amount: rewardAmount,
                leafHash: `0x${staker.account.slice(2).padStart(64, '0')}`,
                proof: [`0x${'proof'.padStart(64, '0')}`],
                claimed: Math.random() > 0.8, // 20% claimed
                claimedTx: Math.random() > 0.8 ? `0x${'claimed'.padStart(64, '0')}` : null,
                claimedAt: Math.random() > 0.8 ? epochTime : null,
                createdAt: epochTime,
                updatedAt: epochTime
              }
            });
          }
        }
      }
      
      console.log(`✅ Epoch ${epoch.epochId} created successfully`);
    }
    
    console.log('');
    console.log('🎉 Database seeding completed!');
    console.log('📊 Generated:');
    console.log('- 3 revenue epochs');
    console.log('- 6 machine revenue records');
    console.log('- 12 owner share snapshots');
    console.log('- 9 staking snapshots');
    console.log('- 9 Merkle roots');
    console.log('- 9+ Merkle leaves');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}
