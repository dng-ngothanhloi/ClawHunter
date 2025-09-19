<template>
  <div class="space-y-6">
    <!-- Back button -->
    <button
      @click="$router.back()"
      class="flex items-center text-blue-600 hover:text-blue-700"
    >
      <ArrowLeftIcon class="h-4 w-4 mr-2" />
      Back to Machines
    </button>

    <!-- Machine Header -->
    <div class="bg-white shadow rounded-lg p-6">
      <div class="flex justify-between items-start">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 mb-2">
            Machine {{ machineId }}
          </h1>
          <p v-if="machine?.location" class="text-gray-600">
            📍 {{ machine.location }}
          </p>
        </div>
        
        <span v-if="machine" :class="[
          'px-3 py-1 text-sm font-medium rounded-full',
          statusColors[machine.status]
        ]">
          {{ machine.status }}
        </span>
      </div>
    </div>

    <!-- Machine Stats -->
    <div v-if="machine" class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Total Revenue</h3>
        <p class="text-2xl font-bold text-green-600">
          {{ formatUSDT(machine.totalRevenue) }}
        </p>
        <p class="text-sm text-gray-600">All Time</p>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Owners</h3>
        <p class="text-2xl font-bold text-purple-600">
          {{ machine.owners?.length || 0 }}
        </p>
        <p class="text-sm text-gray-600">NFTOwner Holders</p>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Last Active</h3>
        <p class="text-2xl font-bold text-blue-600">
          {{ machine.lastEpoch || 'N/A' }}
        </p>
        <p class="text-sm text-gray-600">Epoch</p>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Avg/Epoch</h3>
        <p class="text-2xl font-bold text-orange-600">
          {{ averageRevenue }}
        </p>
        <p class="text-sm text-gray-600">USDT</p>
      </div>
    </div>

    <!-- Revenue History -->
    <div class="bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Revenue History</h2>
      
      <div v-if="revenueLoading" class="flex justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
      
      <div v-else-if="revenueHistory.length === 0" class="text-center py-8 text-gray-500">
        No revenue history available
      </div>
      
      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Epoch
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Revenue (Rm)
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Transaction
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="revenue in revenueHistory" :key="revenue.epochId" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {{ revenue.epochId }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ formatUSDT(revenue.Rm) }} USDT
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ formatDate(revenue.createdAt) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <a
                  :href="`${walletStore.targetChain.explorerUrl}/tx/${revenue.txHash}`"
                  target="_blank"
                  class="text-blue-600 hover:underline flex items-center"
                >
                  <ExternalLinkIcon class="h-3 w-3 mr-1" />
                  {{ revenue.txHash.slice(0, 10) }}...
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Ownership Breakdown -->
    <div v-if="machine?.owners && machine.owners.length > 0" class="bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Ownership Distribution</h2>
      
      <div class="space-y-3">
        <div
          v-for="owner in machine.owners"
          :key="owner.account"
          class="flex justify-between items-center p-3 border border-gray-200 rounded-lg"
        >
          <div>
            <p class="font-medium text-gray-900">
              {{ owner.account.slice(0, 6) }}...{{ owner.account.slice(-4) }}
            </p>
            <p class="text-sm text-gray-600">
              {{ (owner.shareBps / 100).toFixed(2) }}% ownership
            </p>
          </div>
          
          <div class="text-right">
            <p class="font-semibold text-green-600">
              {{ formatUSDT(owner.effectiveShare) }}
            </p>
            <p class="text-xs text-gray-500">Effective Share</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { 
  ArrowLeftIcon, 
  ExternalLinkIcon,
  ExclamationTriangleIcon 
} from '@heroicons/vue/24/outline';
import { useWalletStore } from '@/stores/wallet';
import { apiService } from '@/services/api';
import { useApi } from '@/composables/useApi';
import WalletButton from '@/components/web3/WalletButton.vue';
import type { Machine, MachineRevenue } from '@/types/api';

const route = useRoute();
const walletStore = useWalletStore();
const { execute } = useApi();

const machineId = computed(() => parseInt(route.params.id as string));

// State
const machine = ref<Machine | null>(null);
const revenueHistory = ref<MachineRevenue[]>([]);
const revenueLoading = ref(false);

const statusColors = {
  'ACTIVE': 'bg-green-100 text-green-800',
  'EXPIRED': 'bg-yellow-100 text-yellow-800',
  'BROKEN': 'bg-red-100 text-red-800',
  'DECOMMISSIONED': 'bg-gray-100 text-gray-800'
};

const averageRevenue = computed(() => {
  if (revenueHistory.value.length === 0) return '0';
  
  const total = revenueHistory.value.reduce((sum, rev) => sum + parseFloat(rev.Rm), 0);
  const average = total / revenueHistory.value.length;
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(average);
});

// Methods
const loadMachine = async () => {
  const data = await execute(() => apiService.getMachine(machineId.value));
  if (data) {
    machine.value = data as Machine;
  }
};

const loadRevenueHistory = async () => {
  revenueLoading.value = true;
  const data = await execute(() => apiService.getMachineRevenue(machineId.value, { limit: 20 }));
  if (data) {
    revenueHistory.value = data as MachineRevenue[];
  }
  revenueLoading.value = false;
};

const formatUSDT = (amount: string) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(parseFloat(amount));
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Initialize
onMounted(async () => {
  await Promise.all([
    loadMachine(),
    loadRevenueHistory()
  ]);
});
</script>
