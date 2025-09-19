#!/usr/bin/env tsx

/**
 * Sample Revenue Data Generator for Testing
 * 
 * Creates realistic test data for M4 API testing including:
 * - Revenue epochs with proper 70/20/3/3/4 distribution
 * - Machine revenue breakdowns
 * - Owner share snapshots
 * - Staking snapshots
 * - Merkle trees and leaves
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

interface SampleEpoch {
  epochId: bigint;
  totalR: string;
  machineRevenues: Array<{
    machineId: bigint;
    Rm: string;
  }>;
  owners: Array<{
    account: string;
    machineId: bigint;
    shareBps: number;
  }>;
  stakers: Array<{
    account: string;
    amount: string;
    weight: number;
    lockUntil?: Date;
  }>;
}

export class SampleDataGenerator {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async generateSampleData(): Promise<void> {
    console.log('🎯 Generating sample revenue data for testing...');
    
    // Clear existing data
    await this.clearExistingData();
    
    // Generate 5 sample epochs
    const epochs = this.createSampleEpochs();
    
    for (const epoch of epochs) {
      await this.createEpochData(epoch);
    }
    
    console.log('✅ Sample data generation completed');
  }

  private async clearExistingData(): Promise<void> {
    console.log('🧹 Clearing existing test data...');
    
    // Delete in reverse dependency order
    await this.prisma.merkleLeaf.deleteMany();
    await this.prisma.merkleRoot.deleteMany();
    await this.prisma.stakingSnapshot.deleteMany();
    await this.prisma.ownerShareSnapshot.deleteMany();
    await this.prisma.machineRevenue.deleteMany();
    await this.prisma.revenueEpoch.deleteMany();
    
    console.log('✅ Existing data cleared');
  }

  private createSampleEpochs(): SampleEpoch[] {
    const baseTime = new Date('2025-09-01T00:00:00Z');
    
    return [
      {
        epochId: 1n,
        totalR: '10000.000000', // 10,000 USDT
        machineRevenues: [
          { machineId: 1n, Rm: '6000.000000' },
          { machineId: 2n, Rm: '4000.000000' }
        ],
        owners: [
          { account: '0x1111111111111111111111111111111111111111', machineId: 1n, shareBps: 5000 }, // 50%
          { account: '0x2222222222222222222222222222222222222222', machineId: 1n, shareBps: 3000 }, // 30%
          { account: '0x3333333333333333333333333333333333333333', machineId: 1n, shareBps: 2000 }, // 20%
          { account: '0x4444444444444444444444444444444444444444', machineId: 2n, shareBps: 10000 } // 100%
        ],
        stakers: [
          { account: '0x1111111111111111111111111111111111111111', amount: '100000.000000000000000000', weight: 3000 }, // 365d lock
          { account: '0x2222222222222222222222222222222222222222', amount: '50000.000000000000000000', weight: 2000 },  // 180d lock
          { account: '0x5555555555555555555555555555555555555555', amount: '25000.000000000000000000', weight: 1500 }   // 90d lock
        ]
      },
      {
        epochId: 2n,
        totalR: '15000.000000', // 15,000 USDT
        machineRevenues: [
          { machineId: 1n, Rm: '9000.000000' },
          { machineId: 2n, Rm: '6000.000000' }
        ],
        owners: [
          { account: '0x1111111111111111111111111111111111111111', machineId: 1n, shareBps: 5000 },
          { account: '0x2222222222222222222222222222222222222222', machineId: 1n, shareBps: 3000 },
          { account: '0x3333333333333333333333333333333333333333', machineId: 1n, shareBps: 2000 },
          { account: '0x4444444444444444444444444444444444444444', machineId: 2n, shareBps: 10000 }
        ],
        stakers: [
          { account: '0x1111111111111111111111111111111111111111', amount: '120000.000000000000000000', weight: 3000 },
          { account: '0x2222222222222222222222222222222222222222', amount: '60000.000000000000000000', weight: 2000 },
          { account: '0x5555555555555555555555555555555555555555', amount: '30000.000000000000000000', weight: 1500 }
        ]
      },
      {
        epochId: 3n,
        totalR: '8500.000000', // 8,500 USDT
        machineRevenues: [
          { machineId: 1n, Rm: '5000.000000' },
          { machineId: 2n, Rm: '3500.000000' }
        ],
        owners: [
          { account: '0x1111111111111111111111111111111111111111', machineId: 1n, shareBps: 4500 },
          { account: '0x2222222222222222222222222222222222222222', machineId: 1n, shareBps: 3500 },
          { account: '0x3333333333333333333333333333333333333333', machineId: 1n, shareBps: 2000 },
          { account: '0x4444444444444444444444444444444444444444', machineId: 2n, shareBps: 7000 },
          { account: '0x6666666666666666666666666666666666666666', machineId: 2n, shareBps: 3000 }
        ],
        stakers: [
          { account: '0x1111111111111111111111111111111111111111', amount: '150000.000000000000000000', weight: 3000 },
          { account: '0x2222222222222222222222222222222222222222', amount: '75000.000000000000000000', weight: 2000 },
          { account: '0x5555555555555555555555555555555555555555', amount: '40000.000000000000000000', weight: 1500 },
          { account: '0x7777777777777777777777777777777777777777', amount: '25000.000000000000000000', weight: 1000 }
        ]
      },
      {
        epochId: 4n,
        totalR: '22000.000000', // 22,000 USDT
        machineRevenues: [
          { machineId: 1n, Rm: '12000.000000' },
          { machineId: 2n, Rm: '8000.000000' },
          { machineId: 3n, Rm: '2000.000000' }
        ],
        owners: [
          { account: '0x1111111111111111111111111111111111111111', machineId: 1n, shareBps: 4000 },
          { account: '0x2222222222222222222222222222222222222222', machineId: 1n, shareBps: 3000 },
          { account: '0x3333333333333333333333333333333333333333', machineId: 1n, shareBps: 3000 },
          { account: '0x4444444444444444444444444444444444444444', machineId: 2n, shareBps: 6000 },
          { account: '0x6666666666666666666666666666666666666666', machineId: 2n, shareBps: 4000 },
          { account: '0x8888888888888888888888888888888888888888', machineId: 3n, shareBps: 10000 }
        ],
        stakers: [
          { account: '0x1111111111111111111111111111111111111111', amount: '200000.000000000000000000', weight: 3000 },
          { account: '0x2222222222222222222222222222222222222222', amount: '100000.000000000000000000', weight: 2000 },
          { account: '0x5555555555555555555555555555555555555555', amount: '50000.000000000000000000', weight: 1500 },
          { account: '0x7777777777777777777777777777777777777777', amount: '30000.000000000000000000', weight: 1000 },
          { account: '0x9999999999999999999999999999999999999999', amount: '75000.000000000000000000', weight: 2000 }
        ]
      },
      {
        epochId: 5n,
        totalR: '5000.000000', // 5,000 USDT
        machineRevenues: [
          { machineId: 1n, Rm: '3000.000000' },
          { machineId: 2n, Rm: '2000.000000' }
        ],
        owners: [
          { account: '0x1111111111111111111111111111111111111111', machineId: 1n, shareBps: 6000 },
          { account: '0x2222222222222222222222222222222222222222', machineId: 1n, shareBps: 4000 },
          { account: '0x4444444444444444444444444444444444444444', machineId: 2n, shareBps: 10000 }
        ],
        stakers: [
          { account: '0x1111111111111111111111111111111111111111', amount: '180000.000000000000000000', weight: 3000 },
          { account: '0x2222222222222222222222222222222222222222', amount: '90000.000000000000000000', weight: 2000 },
          { account: '0x5555555555555555555555555555555555555555', amount: '45000.000000000000000000', weight: 1500 }
        ]
      }
    ];
  }

  private async createEpochData(epoch: SampleEpoch): Promise<void> {
    console.log(`📊 Creating epoch ${epoch.epochId} with ${epoch.totalR} USDT...`);
    
    // Calculate distribution using exact spec math
    const totalR = new Decimal(epoch.totalR);
    const distribution = this.calculateDistribution(totalR);
    
    const baseTime = new Date('2025-09-01T00:00:00Z');
    const epochTime = new Date(baseTime.getTime() + Number(epoch.epochId) * 24 * 60 * 60 * 1000);
    
    // Create revenue epoch
    const revenueEpoch = await this.prisma.revenueEpoch.create({
      data: {
        epochId: epoch.epochId,
        totalR: totalR,
        alpha: distribution.alpha,
        beta: distribution.beta,
        gamma: distribution.gamma,
        delta: distribution.delta,
        opc: distribution.opc,
        blockNumber: BigInt(26129000 + Number(epoch.epochId) * 100),
        blockTime: epochTime,
        txHash: `0x${epoch.epochId.toString().padStart(64, '0')}`,
        createdAt: epochTime,
        updatedAt: epochTime
      }
    });

    // Create machine revenues
    for (const machine of epoch.machineRevenues) {
      await this.prisma.machineRevenue.create({
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
    for (const owner of epoch.owners) {
      const machineRevenue = epoch.machineRevenues.find(m => m.machineId === owner.machineId);
      if (machineRevenue) {
        const effectiveShare = new Decimal(machineRevenue.Rm)
          .mul(distribution.gamma)
          .mul(owner.shareBps)
          .div(10000)
          .div(epoch.machineRevenues.length); // Simplified calculation
        
        await this.prisma.ownerShareSnapshot.create({
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

    // Create staking snapshots
    for (const staker of epoch.stakers) {
      const effectiveWeight = new Decimal(staker.amount).mul(staker.weight);
      
      await this.prisma.stakingSnapshot.create({
        data: {
          epochId: epoch.epochId,
          account: staker.account,
          amount: new Decimal(staker.amount),
          weight: staker.weight,
          effectiveWeight: effectiveWeight,
          lockUntil: staker.lockUntil || new Date(epochTime.getTime() + 365 * 24 * 60 * 60 * 1000),
          createdAt: epochTime
        }
      });
    }

    // Create sample Merkle roots and leaves
    await this.createSampleMerkleData(epoch, distribution);
    
    console.log(`✅ Epoch ${epoch.epochId} data created successfully`);
  }

  private calculateDistribution(totalR: Decimal): {
    alpha: Decimal;
    beta: Decimal;
    gamma: Decimal;
    delta: Decimal;
    opc: Decimal;
  } {
    const DENOM = 10000;
    
    // Use floor division as per spec
    const alphaFloor = totalR.mul(2000).div(DENOM).floor();  // 20%
    const betaFloor = totalR.mul(300).div(DENOM).floor();    // 3%
    const gammaFloor = totalR.mul(300).div(DENOM).floor();   // 3%
    const deltaFloor = totalR.mul(400).div(DENOM).floor();   // 4%
    const opcBase = totalR.mul(7000).div(DENOM).floor();     // 70%
    
    // Remainder goes to OPC
    const distributed = alphaFloor.add(betaFloor).add(gammaFloor).add(deltaFloor).add(opcBase);
    const remainder = totalR.sub(distributed);
    const opcFinal = opcBase.add(remainder);
    
    return {
      alpha: alphaFloor,
      beta: betaFloor,
      gamma: gammaFloor,
      delta: deltaFloor,
      opc: opcFinal
    };
  }

  private async createSampleMerkleData(epoch: SampleEpoch, distribution: any): Promise<void> {
    const groups = ['A', 'B', 'G']; // Alpha, Beta, Gamma
    const amounts = [distribution.alpha, distribution.beta, distribution.gamma];
    
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const totalAmount = amounts[i];
      
      // Create Merkle root
      const merkleRoot = await this.prisma.merkleRoot.create({
        data: {
          epochId: epoch.epochId,
          group: group,
          root: `0x${group.charCodeAt(0).toString(16).padStart(64, '0')}`, // Sample root
          total: totalAmount,
          leafCount: group === 'A' ? epoch.stakers.length : 
                    group === 'B' ? 1 : // NFTClaw rewards (simplified)
                    epoch.owners.length, // NFTOwner rewards
          published: true,
          publishedTx: `0x${epoch.epochId.toString().padStart(32, '0')}${group.charCodeAt(0).toString(16).padStart(32, '0')}`,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Create sample leaves based on group type
      if (group === 'A') {
        // Alpha pool - CHG staking rewards
        const totalWeight = epoch.stakers.reduce((sum, s) => sum + (Number(s.amount) * s.weight / 1e18), 0);
        
        for (const staker of epoch.stakers) {
          const stakerWeight = Number(staker.amount) * staker.weight / 1e18;
          const rewardAmount = totalAmount.mul(stakerWeight).div(totalWeight);
          
          await this.prisma.merkleLeaf.create({
            data: {
              epochId: epoch.epochId,
              group: group,
              account: staker.account,
              amount: rewardAmount,
              leafHash: `0x${staker.account.slice(2).padStart(64, '0')}`,
              proof: [`0x${'proof'.padStart(64, '0')}`], // Sample proof
              claimed: false,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
        }
      } else if (group === 'G') {
        // Gamma pool - NFTOwner rewards
        for (const owner of epoch.owners) {
          const machineRevenue = epoch.machineRevenues.find(m => m.machineId === owner.machineId);
          if (machineRevenue) {
            const rewardAmount = totalAmount.mul(owner.shareBps).div(10000).div(epoch.machineRevenues.length);
            
            await this.prisma.merkleLeaf.create({
              data: {
                epochId: epoch.epochId,
                group: group,
                account: owner.account,
                amount: rewardAmount,
                leafHash: `0x${owner.account.slice(2).padStart(64, '0')}`,
                proof: [`0x${'proof'.padStart(64, '0')}`], // Sample proof
                claimed: Math.random() > 0.7, // 30% claimed randomly
                claimedTx: Math.random() > 0.7 ? `0x${'claimed'.padStart(64, '0')}` : null,
                claimedAt: Math.random() > 0.7 ? new Date() : null,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });
          }
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Main execution
if (require.main === module) {
  const generator = new SampleDataGenerator();
  generator.generateSampleData()
    .then(() => {
      console.log('🎉 Sample data generation completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Sample data generation failed:', error);
      process.exit(1);
    })
    .finally(() => {
      generator.disconnect();
    });
}

export { SampleDataGenerator };
