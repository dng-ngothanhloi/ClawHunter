// Claw Machine Model - Machine lifecycle management
// Implements FR-015 (NFTOwner burning on expiry)

export enum MachineStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  BROKEN = 'BROKEN',
  DECOMMISSIONED = 'DECOMMISSIONED'
}

export interface ClawMachineData {
  machineId: number;
  status: MachineStatus;
  deployedAt: bigint;
  expiresAt?: bigint;
  location?: string;
  lastRevenueEpoch?: number;
}

export class ClawMachine {
  /**
   * Create new claw machine
   */
  static createMachine(
    machineId: number,
    deployedAt: bigint,
    expiresAt?: bigint,
    location?: string
  ): ClawMachineData {
    return {
      machineId,
      status: MachineStatus.ACTIVE,
      deployedAt,
      expiresAt,
      location,
    };
  }

  /**
   * Check if machine is expired based on current timestamp
   */
  static isExpired(machine: ClawMachineData, currentTimestamp: bigint): boolean {
    return machine.expiresAt !== undefined && currentTimestamp >= machine.expiresAt;
  }

  /**
   * Update machine status with validation rules
   */
  static updateStatus(
    machine: ClawMachineData,
    newStatus: MachineStatus,
    currentTimestamp: bigint
  ): ClawMachineData {
    // Validate status transitions
    const validTransitions: Record<MachineStatus, MachineStatus[]> = {
      [MachineStatus.ACTIVE]: [MachineStatus.EXPIRED, MachineStatus.BROKEN],
      [MachineStatus.EXPIRED]: [MachineStatus.DECOMMISSIONED],
      [MachineStatus.BROKEN]: [MachineStatus.DECOMMISSIONED],
      [MachineStatus.DECOMMISSIONED]: [], // Terminal state
    };

    if (!validTransitions[machine.status].includes(newStatus)) {
      throw new Error(`Invalid status transition: ${machine.status} → ${newStatus}`);
    }

    return {
      ...machine,
      status: newStatus,
    };
  }

  /**
   * Update expired machines automatically
   */
  static updateExpiredMachines(
    machines: ClawMachineData[],
    currentTimestamp: bigint
  ): ClawMachineData[] {
    return machines.map(machine => {
      if (machine.status === MachineStatus.ACTIVE && ClawMachine.isExpired(machine, currentTimestamp)) {
        return ClawMachine.updateStatus(machine, MachineStatus.EXPIRED, currentTimestamp);
      }
      return machine;
    });
  }

  /**
   * Calculate machine performance metrics
   */
  static calculatePerformance(
    machine: ClawMachineData,
    revenues: Array<{ epochId: number; revenueAmount: bigint }>
  ): {
    totalRevenue: bigint;
    averageRevenue: bigint;
    activeEpochs: number;
    lastActiveEpoch: number | null;
  } {
    if (revenues.length === 0) {
      return {
        totalRevenue: BigInt(0),
        averageRevenue: BigInt(0),
        activeEpochs: 0,
        lastActiveEpoch: null,
      };
    }

    const totalRevenue = revenues.reduce((sum, r) => sum + r.revenueAmount, BigInt(0));
    const activeRevenues = revenues.filter(r => r.revenueAmount > 0);
    const averageRevenue = activeRevenues.length > 0 
      ? totalRevenue / BigInt(activeRevenues.length)
      : BigInt(0);
    const lastActiveEpoch = activeRevenues.length > 0
      ? Math.max(...activeRevenues.map(r => r.epochId))
      : null;

    return {
      totalRevenue,
      averageRevenue,
      activeEpochs: activeRevenues.length,
      lastActiveEpoch,
    };
  }

  /**
   * Check if machine should force R_m = 0 (decommissioned/broken without token burn)
   */
  static shouldForceZeroRevenue(machine: ClawMachineData, tokensNotBurned: boolean): boolean {
    const terminalStatuses = [MachineStatus.EXPIRED, MachineStatus.BROKEN, MachineStatus.DECOMMISSIONED];
    return terminalStatuses.includes(machine.status) && tokensNotBurned;
  }

  /**
   * Get machines requiring NFTOwner token burning
   */
  static getMachinesRequiringTokenBurn(machines: ClawMachineData[]): ClawMachineData[] {
    const terminalStatuses = [MachineStatus.EXPIRED, MachineStatus.BROKEN, MachineStatus.DECOMMISSIONED];
    return machines.filter(m => terminalStatuses.includes(m.status));
  }
}

export default ClawMachine;
