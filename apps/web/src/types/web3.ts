/**
 * Web3 and Blockchain Types
 */

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface ContractAddresses {
  CHG: string;
  NFTClaw: string;
  NFTOwner: string;
  NFTTicket: string;
  RevenuePool: string;
  RevenueSplitter: string;
  ClaimProcessor: string;
  CHGStaking: string;
}

export interface WalletState {
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  balance: bigint;
  connector: string | null;
}

export interface TransactionState {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  error: string | null;
  gasUsed?: bigint;
  blockNumber?: number;
}

export interface TransactionRequest {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
  gas?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

export interface TransactionReceipt {
  hash: string;
  status: 'success' | 'reverted';
  blockNumber: number;
  gasUsed: bigint;
  effectiveGasPrice?: bigint;
}

export interface ClaimTransaction {
  epochIds: number[];
  groups: ('A' | 'B' | 'G')[];
  totalAmount: string;
  gasEstimate: bigint;
  transaction: TransactionState;
}

export interface StakingTransaction {
  amount: string;
  lockDays: number;
  weight: number;
  transaction: TransactionState;
}

// Contract ABI types (simplified)
export interface ClaimProcessorABI {
  claim: (epochIds: number[], groups: string[]) => Promise<string>;
  getClaim: (beneficiary: string, epochId: number, group: string) => Promise<ClaimInfo>;
  paused: () => Promise<boolean>;
}

export interface CHGStakingABI {
  stake: (amount: bigint, lockDays: number) => Promise<string>;
  unstake: (positionId: number) => Promise<string>;
  claim: (positionId: number) => Promise<string>;
  getPosition: (account: string, positionId: number) => Promise<StakingPosition>;
}

export interface RevenuePoolABI {
  getEpoch: (epochId: number) => Promise<RevenueEpoch>;
  getCurrentEpoch: () => Promise<number>;
  paused: () => Promise<boolean>;
}

// Wallet connector types
export type ConnectorType = 'injected' | 'walletConnect' | 'coinbaseWallet';

export interface WalletConnector {
  id: ConnectorType;
  name: string;
  icon: string;
  available: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}
