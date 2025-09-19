/**
 * API Types for Claw Hunters Revenue Sharing System
 * Generated from OpenAPI specification
 */

export interface RevenueEpoch {
  epochId: number;
  totalR: string;
  alpha: string;   // CHG Staking pool (20%)
  beta: string;    // NFTClaw L1 pool (3%)
  gamma: string;   // NFTOwner L2 pool (3%)
  delta: string;   // Reward pool (4%)
  opc: string;     // OPC pool (70% + remainder)
  blockNumber: number;
  blockTime: string;
  txHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface MachineRevenue {
  epochId: number;
  machineId: number;
  Rm: string;      // Machine-specific revenue
  txHash: string;
  blockNumber: number;
  createdAt: string;
}

export interface OwnerShare {
  epochId: number;
  account: string;
  machineId: number;
  shareBps: number;        // Share in basis points (1-10000)
  effectiveShare: string;  // Calculated share amount
  createdAt: string;
}

export interface StakingPosition {
  epochId: number;
  account: string;
  amount: string;          // Staked CHG amount
  weight: number;          // Lock duration weight multiplier
  effectiveWeight: string; // amount * weight
  lockUntil: string | null;
  createdAt: string;
}

export interface ClaimInfo {
  epochId: number;
  group: 'A' | 'B' | 'G';  // Alpha, Beta, Gamma pools
  account: string;
  amount: string;          // Claimable amount
  leafHash: string;
  proof: string[];         // Merkle proof
  claimed: boolean;
  claimedTx: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MerkleRoot {
  epochId: number;
  group: 'A' | 'B' | 'G';
  root: string;
  total: string;
  leafCount: number;
  published: boolean;
  publishedTx: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Machine {
  machineId: number;
  status: 'ACTIVE' | 'EXPIRED' | 'BROKEN' | 'DECOMMISSIONED';
  location?: string;
  totalRevenue: string;
  lastEpoch: number;
  owners: OwnerShare[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// API Response Types
export interface EpochListResponse {
  epochs: RevenueEpoch[];
  pagination: Pagination;
}

export interface ClaimsResponse {
  address: string;
  claims: ClaimInfo[];
  summary: {
    totalClaimable: string;
    claimedTotal: string;
    pendingEpochs: number;
  };
}

export interface MachineListResponse {
  machines: Machine[];
  pagination: Pagination;
}

export interface StakingResponse {
  address: string;
  positions: StakingPosition[];
  summary: {
    totalStaked: string;
    totalRewards: string;
    activePositions: number;
  };
}

export interface RevenueStats {
  epochs: {
    total: number;
    latest: number;
  };
  revenue: {
    totalAllTime: string;
    last30Days: string;
    averagePerEpoch: string;
  };
  distribution: {
    opc: string;
    alpha: string;
    beta: string;
    gamma: string;
    delta: string;
  };
}

// Error Types
export interface ApiError {
  error: string;
  message?: string;
  details?: any;
  timestamp: string;
}

// Request Types
export interface ClaimRequest {
  beneficiaryAddress: string;
  epochIds: number[];
  groups?: ('A' | 'B' | 'G')[];
}

export interface ClaimPrepareRequest {
  epochId: number;
  groups?: ('A' | 'B' | 'G')[];
}
