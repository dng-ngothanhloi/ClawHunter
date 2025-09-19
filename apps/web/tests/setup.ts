import { beforeEach, vi } from 'vitest';
import { config } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Mock global objects
Object.defineProperty(window, 'ethereum', {
  value: {
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    isMetaMask: true
  },
  writable: true
});

// Mock environment variables
vi.mock('import.meta', () => ({
  env: {
    VITE_API_BASE: 'http://localhost:4000',
    VITE_CHAIN_ID: '123456',
    VITE_CHAIN_NAME: 'AdilChain Devnet',
    VITE_RPC_URL: 'https://devnet.adilchain-rpc.io',
    VITE_EXPLORER_URL: 'https://devnet.adilchain-scan.io'
  }
}));

// Setup Pinia for each test
beforeEach(() => {
  const pinia = createPinia();
  setActivePinia(pinia);
});

// Global test configuration
config.global.plugins = [createPinia()];
