<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="bg-white shadow rounded-lg p-6">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">
        NFT Ownership
      </h1>
      <p class="text-gray-600">
        Manage your NFTOwner tokens and machine ownership shares
      </p>
    </div>

    <!-- Wallet Connection Required -->
    <div v-if="!walletStore.isConnected" class="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
      <div class="flex items-center">
        <div class="flex-shrink-0">
          <ExclamationTriangleIcon class="h-5 w-5 text-yellow-400" />
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-yellow-800">
            Wallet Connection Required
          </h3>
          <p class="mt-1 text-sm text-yellow-700">
            Please connect your wallet to view your NFT ownership.
          </p>
        </div>
        <div class="ml-auto">
          <WalletButton />
        </div>
      </div>
    </div>

    <!-- Ownership Summary -->
    <div v-if="walletStore.isConnected" class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Total Shares</h3>
        <p class="text-3xl font-bold text-purple-600">
          {{ totalShares }}
        </p>
        <p class="text-sm text-gray-600">NFTOwner Tokens</p>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Machines Owned</h3>
        <p class="text-3xl font-bold text-blue-600">
          {{ uniqueMachines }}
        </p>
        <p class="text-sm text-gray-600">Different Machines</p>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Total Value</h3>
        <p class="text-3xl font-bold text-green-600">
          {{ formatUSDT(totalValue) }}
        </p>
        <p class="text-sm text-gray-600">USDT Equivalent</p>
      </div>
    </div>

    <!-- Ownership Positions -->
    <div v-if="walletStore.isConnected" class="bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Your Ownership Positions</h2>
      
      <div v-if="loading" class="flex justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
      
      <div v-else-if="ownerShares.length === 0" class="text-center py-8 text-gray-500">
        <p class="mb-4">No NFTOwner tokens found</p>
        <p class="text-sm">Purchase NFTOwner tokens to earn from machine revenues!</p>
      </div>
      
      <div v-else class="space-y-4">
        <div
          v-for="share in ownerShares"
          :key="`${share.machineId}-${share.account}`"
          class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
        >
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p class="text-sm text-gray-600">Machine</p>
              <p class="font-semibold text-lg">{{ share.machineId }}</p>
            </div>
            
            <div>
              <p class="text-sm text-gray-600">Ownership Share</p>
              <p class="font-semibold">{{ (share.shareBps / 100).toFixed(2) }}%</p>
            </div>
            
            <div>
              <p class="text-sm text-gray-600">Effective Share</p>
              <p class="font-semibold text-green-600">
                {{ formatUSDT(share.effectiveShare) }} USDT
              </p>
            </div>
            
            <div class="flex items-center justify-end space-x-2">
              <button
                @click="viewMachine(share.machineId)"
                class="bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded text-sm transition-colors"
              >
                View Machine
              </button>
              <button class="bg-gray-200 hover:bg-gray-300 text-gray-700 py-1 px-3 rounded text-sm transition-colors">
                Manage
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- NFTOwner Token Management -->
    <div v-if="walletStore.isConnected && ownerShares.length > 0" class="bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Token Management</h2>
      
      <div class="space-y-4">
        <div class="p-4 bg-blue-50 rounded-lg">
          <h3 class="font-medium text-blue-900 mb-2">Staking Status</h3>
          <p class="text-sm text-blue-800">
            Stake your NFTOwner tokens in the ClawOwnerPool to earn rewards from the γ pool (3% of daily revenue).
          </p>
          
          <div class="mt-3">
            <button class="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md text-sm transition-colors">
              Stake All Tokens
            </button>
          </div>
        </div>
        
        <div class="p-4 bg-yellow-50 rounded-lg">
          <h3 class="font-medium text-yellow-900 mb-2">Token Lifecycle</h3>
          <p class="text-sm text-yellow-800">
            NFTOwner tokens are automatically burned when their associated machine expires or is decommissioned.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { 
  ArrowLeftIcon,
  ExclamationTriangleIcon 
} from '@heroicons/vue/24/outline';
import { useWalletStore } from '@/stores/wallet';
import { apiService } from '@/services/api';
import { useApi } from '@/composables/useApi';
import WalletButton from '@/components/web3/WalletButton.vue';
import type { Machine, OwnerShare, MachineRevenue } from '@/types/api';

const router = useRouter();
const walletStore = useWalletStore();
const { execute } = useApi();

// State
const machine = ref<Machine | null>(null);
const ownerShares = ref<OwnerShare[]>([]);
const revenueHistory = ref<MachineRevenue[]>([]);
const loading = ref(false);
const revenueLoading = ref(false);

const statusColors = {
  'ACTIVE': 'bg-green-100 text-green-800',
  'EXPIRED': 'bg-yellow-100 text-yellow-800',
  'BROKEN': 'bg-red-100 text-red-800',
  'DECOMMISSIONED': 'bg-gray-100 text-gray-800'
};

// Computed
const totalShares = computed(() => ownerShares.value.length);

const uniqueMachines = computed(() => {
  const machines = new Set(ownerShares.value.map(share => share.machineId));
  return machines.size;
});

const totalValue = computed(() => {
  return ownerShares.value
    .reduce((sum, share) => sum + parseFloat(share.effectiveShare), 0)
    .toString();
});

// Methods
const loadOwnerShares = async () => {
  if (!walletStore.address) return;
  
  loading.value = true;
  const data = await execute(() => apiService.getOwnerShares(walletStore.address!));
  if (data) {
    ownerShares.value = data.shares || [];
  }
  loading.value = false;
};

const viewMachine = (machineId: number) => {
  router.push(`/machines/${machineId}`);
};

const formatUSDT = (amount: string) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(parseFloat(amount));
};

// Watch for wallet connection changes
watch(() => walletStore.address, async (newAddress) => {
  if (newAddress) {
    await loadOwnerShares();
  } else {
    ownerShares.value = [];
  }
});

// Initialize
onMounted(async () => {
  if (walletStore.isConnected && walletStore.address) {
    await loadOwnerShares();
  }
});
</script>
