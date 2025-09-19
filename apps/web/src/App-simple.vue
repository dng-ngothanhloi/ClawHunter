<template>
  <div id="app" class="min-h-screen bg-gray-50">
    <!-- Simple Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center">
            <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold text-sm">CH</span>
            </div>
            <span class="ml-3 text-xl font-semibold text-gray-900">Claw Hunters</span>
          </div>
          
          <nav class="hidden md:flex space-x-8">
            <router-link
              v-for="item in navigation"
              :key="item.name"
              :to="item.to"
              :class="[
                'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                $route.name === item.name 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-700 hover:bg-gray-100'
              ]"
            >
              {{ item.label }}
            </router-link>
          </nav>
          
          <button
            @click="connectWallet"
            :disabled="connecting"
            :class="[
              'px-4 py-2 text-sm font-medium rounded-md transition-colors',
              isConnected
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            ]"
          >
            {{ connecting ? 'Connecting...' : isConnected ? formatAddress(address) : 'Connect Wallet' }}
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <router-view />
    </main>
    
    <!-- Notifications -->
    <div v-if="notification" class="fixed top-4 right-4 z-50">
      <div :class="[
        'p-4 rounded-lg shadow-lg max-w-sm',
        notification.type === 'success' ? 'bg-green-100 border-green-400 text-green-800' :
        notification.type === 'error' ? 'bg-red-100 border-red-400 text-red-800' :
        'bg-blue-100 border-blue-400 text-blue-800'
      ]">
        <div class="flex justify-between items-start">
          <div>
            <h4 class="font-medium">{{ notification.title }}</h4>
            <p v-if="notification.message" class="text-sm mt-1">{{ notification.message }}</p>
          </div>
          <button @click="notification = null" class="ml-4 text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

// Simple state management without Pinia for MVP
const address = ref<string | null>(null);
const chainId = ref<number | null>(null);
const connecting = ref(false);
const notification = ref<{
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
} | null>(null);

// Navigation
const navigation = [
  { name: 'dashboard', label: 'Dashboard', to: '/' },
  { name: 'claim', label: 'Claim', to: '/claim' },
  { name: 'machines', label: 'Machines', to: '/machines' },
  { name: 'staking', label: 'Staking', to: '/staking' }
];

// Computed
const isConnected = computed(() => !!address.value);

// Methods
const connectWallet = async () => {
  if (isConnected.value) return;
  
  if (!window.ethereum) {
    showNotification('error', 'Wallet Not Found', 'Please install MetaMask');
    return;
  }

  connecting.value = true;
  
  try {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    });
    
    if (accounts.length > 0) {
      address.value = accounts[0];
      
      const currentChainId = await window.ethereum.request({
        method: 'eth_chainId'
      });
      chainId.value = parseInt(currentChainId, 16);
      
      showNotification('success', 'Wallet Connected', `Connected to ${formatAddress(accounts[0])}`);
    }
  } catch (error: any) {
    showNotification('error', 'Connection Failed', error.message);
  } finally {
    connecting.value = false;
  }
};

const formatAddress = (addr: string) => {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const showNotification = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
  notification.value = { type, title, message };
  setTimeout(() => {
    notification.value = null;
  }, 5000);
};

// Listen for account changes
if (typeof window !== 'undefined' && window.ethereum) {
  window.ethereum.on('accountsChanged', (accounts: string[]) => {
    if (accounts.length === 0) {
      address.value = null;
      chainId.value = null;
    } else {
      address.value = accounts[0];
    }
  });

  window.ethereum.on('chainChanged', (newChainId: string) => {
    chainId.value = parseInt(newChainId, 16);
  });
}
</script>
