#!/usr/bin/env node

/**
 * Minimal Test Data Seeding Script for M4 API
 * Creates basic revenue epoch data without complex relationships
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function seedMinimalData() {
  console.log('🌱 SEEDING MINIMAL TEST DATA');
  console.log('============================');
  console.log('');

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
    console.log('');

    // Create 3 simple epochs
    const epochs = [
      { epochId: 1n, totalR: '10000.000000' },
      { epochId: 2n, totalR: '15000.000000' },
      { epochId: 3n, totalR: '8500.000000' }
    ];

    for (const epoch of epochs) {
      console.log(`📊 Creating epoch ${epoch.epochId} with ${epoch.totalR} USDT...`);
      
      // Calculate distribution using exact spec math
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
      const machines = [
        { machineId: 1n, Rm: totalR.mul(0.6).toString() }, // 60%
        { machineId: 2n, Rm: totalR.mul(0.4).toString() }  // 40%
      ];
      
      for (const machine of machines) {
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

      // Create owner share snapshots
      const owners = [
        { account: '0x1111111111111111111111111111111111111111', machineId: 1n, shareBps: 5000 },
        { account: '0x2222222222222222222222222222222222222222', machineId: 1n, shareBps: 3000 },
        { account: '0x3333333333333333333333333333333333333333', machineId: 1n, shareBps: 2000 },
        { account: '0x4444444444444444444444444444444444444444', machineId: 2n, shareBps: 10000 }
      ];
      
      for (const owner of owners) {
        const effectiveShare = gammaFloor.mul(owner.shareBps).div(10000).div(2); // 2 machines
        
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

      console.log(`✅ Epoch ${epoch.epochId} created successfully`);
    }
    
    console.log('');
    console.log('🎉 Minimal test data seeding completed successfully!');
    console.log('📊 Generated:');
    console.log('- 3 revenue epochs with exact 70/20/3/3/4 distribution');
    console.log('- 6 machine revenue records');
    console.log('- 12 owner share snapshots');
    console.log('');
    console.log('🎯 Database is ready for API testing!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Execute seeding
seedMinimalData()
  .then(() => {
    console.log('✅ Process completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Process failed:', error);
    process.exit(1);
  });
