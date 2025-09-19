import axios from 'axios';
import type { 
  RevenueEpoch, 
  EpochListResponse, 
  ClaimsResponse, 
  MachineListResponse, 
  StakingResponse,
  RevenueStats,
  ClaimRequest,
  ClaimPrepareRequest,
  ApiError
} from '@/types/api';

// Create axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:4000',
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT || '10000'),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add wallet address header if available
    const address = localStorage.getItem('wallet-address');
    if (address) {
      config.headers['X-Wallet-Address'] = address;
    }
    
    // Add request ID for tracing
    config.headers['X-Request-ID'] = `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError: ApiError = {
      error: error.response?.data?.error || 'Request failed',
      message: error.response?.data?.message || error.message,
      details: error.response?.data?.details,
      timestamp: new Date().toISOString()
    };
    
    return Promise.reject(apiError);
  }
);

// API Service methods
export const apiService = {
  // Health endpoints
  health: () => api.get('/healthz'),
  readiness: () => api.get('/readyz'),
  status: () => api.get('/status'),

  // Revenue endpoints
  getEpoch: (epochId: number) => api.get<RevenueEpoch>(`/revenue/epoch/${epochId}`),
  getLatestEpoch: () => api.get<RevenueEpoch>('/revenue/latest'),
  getEpochs: (params?: { page?: number; limit?: number; from?: number; to?: number }) => 
    api.get<EpochListResponse>('/revenue/epochs', { params }),
  getRevenueStats: () => api.get<RevenueStats>('/revenue/stats'),

  // Machine endpoints
  getMachine: (machineId: number) => api.get(`/machine/${machineId}`),
  getMachineRevenue: (machineId: number, params?: { from?: number; to?: number; limit?: number }) =>
    api.get(`/machine/${machineId}/revenue`, { params }),
  getMachines: (params?: { page?: number; limit?: number }) =>
    api.get<MachineListResponse>('/machines', { params }),

  // NFT Owner endpoints
  getOwnerShares: (address: string, epoch?: number) =>
    api.get(`/nftowner/${address}/shares`, { params: { epoch } }),
  getOwnerHistory: (address: string, params?: { page?: number; limit?: number }) =>
    api.get(`/nftowner/${address}/history`, { params }),
  getMachineOwners: (machineId: number) =>
    api.get(`/nftowner/machines/${machineId}/owners`),

  // Staking endpoints
  getStakingPositions: (address: string, epoch?: number) =>
    api.get<StakingResponse>(`/staking/${address}/positions`, { params: { epoch } }),
  getStakingHistory: (address: string, params?: { page?: number; limit?: number }) =>
    api.get(`/staking/${address}/history`, { params }),
  getStakingStats: () => api.get('/staking/stats'),
  getStakingLeaderboard: (params?: { limit?: number }) =>
    api.get('/staking/leaderboard', { params }),

  // Claims endpoints
  getClaims: (address: string, params?: { group?: 'A' | 'B' | 'G'; claimed?: boolean }) =>
    api.get<ClaimsResponse>(`/claims/${address}`, { params }),
  getSpecificClaim: (address: string, epochId: number, group: 'A' | 'B' | 'G') =>
    api.get(`/claims/${address}/${epochId}/${group}`),
  prepareClaims: (request: ClaimPrepareRequest) =>
    api.post('/claims/prepare', request),
  prepareClaimTransaction: (request: { beneficiary: string; epochIds: number[]; groups?: string[] }) =>
    api.post('/claims/prepare-transaction', request),
  getClaimStats: () => api.get('/claims/stats')
};

export default api;
