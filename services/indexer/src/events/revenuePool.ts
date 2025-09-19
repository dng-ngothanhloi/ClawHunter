import { Interface } from 'ethers';
import { BaseEventHandler, ParsedEvent } from './base.js';
import { db } from '../db/client.js';
import logger from '../lib/logger.js';
import { getContractManager } from '../contracts.js';

export class RevenuePoolEventHandler extends BaseEventHandler {
  constructor(contractInterface: Interface) {
    super('RevenuePool', contractInterface);
  }

  protected async handleEventBatch(eventName: string, events: ParsedEvent[]): Promise<void> {
    switch (eventName) {
      case 'RevenuePosted':
        await this.handleRevenuePosted(events);
        break;
      case 'OracleUpdated':
        await this.handleOracleUpdated(events);
        break;
      default:
        logger.warn(`Unknown event type for RevenuePool: ${eventName}`);
    }
  }

  private async handleRevenuePosted(events: ParsedEvent[]): Promise<void> {
    const contractManager = getContractManager();
    
    for (const event of events) {
      try {
        // Parse event arguments
        const [epochId, totalRevenue, machineId, metadata] = event.args;
        
        // Get block timestamp
        const blockTime = new Date((await contractManager.getBlockTimestamp(event.blockNumber)) * 1000);
        
        // Calculate revenue distribution using exact spec: 70/20/3/3/4
        const totalR = Number(totalRevenue) / 1e6; // Convert from USDT wei to USDT
        const DENOM = 10000;
        
        // Floor division for each pool
        const alphaFloor = Math.floor((totalR * 2000) / DENOM); // 20%
        const betaFloor = Math.floor((totalR * 300) / DENOM);   // 3%
        const gammaFloor = Math.floor((totalR * 300) / DENOM);  // 3%
        const deltaFloor = Math.floor((totalR * 400) / DENOM);  // 4%
        const opcBase = Math.floor((totalR * 7000) / DENOM);    // 70%
        
        // Calculate remainder and add to OPC (as per spec)
        const allocated = alphaFloor + betaFloor + gammaFloor + deltaFloor + opcBase;
        const remainder = totalR - allocated;
        const opcFinal = opcBase + remainder;

        // Store revenue epoch
        await db.revenueEpoch.upsert({
          where: { epochId: BigInt(epochId) },
          update: {
            totalR,
            alpha: alphaFloor,
            beta: betaFloor,
            gamma: gammaFloor,
            delta: deltaFloor,
            opc: opcFinal,
            blockNumber: BigInt(event.blockNumber),
            blockTime,
            txHash: event.txHash,
            updatedAt: new Date(),
          },
          create: {
            epochId: BigInt(epochId),
            totalR,
            alpha: alphaFloor,
            beta: betaFloor,
            gamma: gammaFloor,
            delta: deltaFloor,
            opc: opcFinal,
            blockNumber: BigInt(event.blockNumber),
            blockTime,
            txHash: event.txHash,
          },
        });

        // Store machine-specific revenue if provided
        if (machineId && machineId > 0) {
          // Parse metadata to get machine revenue (Rm)
          let machineRevenue = totalR; // Default to total if no breakdown
          
          if (metadata && metadata.machineRevenues) {
            // If metadata contains machine revenue breakdown
            const machineData = metadata.machineRevenues.find((m: any) => m.machineId === machineId);
            if (machineData) {
              machineRevenue = Number(machineData.revenue) / 1e6;
            }
          }

          await db.machineRevenue.upsert({
            where: {
              epochId_machineId: {
                epochId: BigInt(epochId),
                machineId: BigInt(machineId),
              },
            },
            update: {
              Rm: machineRevenue,
              blockNumber: BigInt(event.blockNumber),
              txHash: event.txHash,
            },
            create: {
              epochId: BigInt(epochId),
              machineId: BigInt(machineId),
              Rm: machineRevenue,
              blockNumber: BigInt(event.blockNumber),
              txHash: event.txHash,
            },
          });
        }

        await this.markEventProcessed(event);
        
        logger.info(`Processed RevenuePosted event`, {
          epochId: epochId.toString(),
          totalR,
          alpha: alphaFloor,
          beta: betaFloor,
          gamma: gammaFloor,
          delta: deltaFloor,
          opc: opcFinal,
          remainder,
          machineId: machineId ? machineId.toString() : null,
        });

      } catch (error) {
        logger.error('Failed to process RevenuePosted event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async handleOracleUpdated(events: ParsedEvent[]): Promise<void> {
    for (const event of events) {
      try {
        const [signer, allowed] = event.args;
        
        logger.info(`Oracle ${allowed ? 'added' : 'removed'}`, {
          signer,
          allowed,
          txHash: event.txHash,
          blockNumber: event.blockNumber,
        });

        await this.markEventProcessed(event);
      } catch (error) {
        logger.error('Failed to process OracleUpdated event:', error);
        await this.logEventError(event, error instanceof Error ? error.message : String(error));
      }
    }
  }
}
