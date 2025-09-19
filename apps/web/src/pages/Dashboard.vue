<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="bg-white shadow rounded-lg p-6">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">
        Revenue Sharing Dashboard
      </h1>
      <p class="text-gray-600">
        Track daily revenue distribution and epoch performance
      </p>
    </div>

    <!-- Latest Epoch Summary -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Revenue Distribution -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Latest Epoch Distribution</h2>
        
        <div v-if="loading" class="flex justify-center py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
        
        <div v-else-if="latestEpoch" class="space-y-4">
          <div class="text-center mb-4">
            <p class="text-2xl font-bold text-gray-900">
              {{ formatUSDT(latestEpoch.totalR) }} USDT
            </p>
            <p class="text-sm text-gray-600">Epoch {{ latestEpoch.epochId }}</p>
          </div>
          
          <AllocationPie :distribution="latestEpoch" />
        </div>
        
        <div v-else class="text-center py-8 text-gray-500">
          No epoch data available
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">System Stats</h2>
        
        <div v-if="stats" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="text-center p-3 bg-blue-50 rounded-lg">
              <p class="text-2xl font-bold text-blue-600">{{ stats.epochs.total }}</p>
              <p class="text-sm text-gray-600">Total Epochs</p>
            </div>
            <div class="text-center p-3 bg-green-50 rounded-lg">
              <p class="text-2xl font-bold text-green-600">
                {{ formatUSDT(stats.revenue.totalAllTime) }}
              </p>
              <p class="text-sm text-gray-600">Total Revenue</p>
            </div>
          </div>
          
          <div class="text-center p-3 bg-purple-50 rounded-lg">
            <p class="text-lg font-bold text-purple-600">
              {{ formatUSDT(stats.revenue.averagePerEpoch) }}
            </p>
            <p class="text-sm text-gray-600">Average Per Epoch</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Epochs Table -->
    <div class="bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Recent Epochs</h2>
      <EpochTable :epochs="recentEpochs" :loading="epochsLoading" />
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <router-link
        to="/claim"
        class="bg-blue-600 hover:bg-blue-700 text-white p-6 rounded-lg text-center transition-colors"
      >
        <h3 class="text-lg font-semibold mb-2">Claim Rewards</h3>
        <p class="text-blue-100">Access your pending rewards</p>
      </router-link>
      
      <router-link
        to="/staking"
        class="bg-green-600 hover:bg-green-700 text-white p-6 rounded-lg text-center transition-colors"
      >
        <h3 class="text-lg font-semibold mb-2">CHG Staking</h3>
        <p class="text-green-100">Stake CHG for rewards</p>
      </router-link>
      
      <router-link
        to="/machines"
        class="bg-purple-600 hover:bg-purple-700 text-white p-6 rounded-lg text-center transition-colors"
      >
        <h3 class="text-lg font-semibold mb-2">Machines</h3>
        <p class="text-purple-100">View machine performance</p>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { apiService } from '@/services/api';
import { useApi } from '@/composables/useApi';
import AllocationPie from '@/components/charts/AllocationPie.vue';
import EpochTable from '@/components/EpochTable.vue';
import type { RevenueEpoch, RevenueStats } from '@/types/api';

const { execute } = useApi();

// State
const latestEpoch = ref<RevenueEpoch | null>(null);
const recentEpochs = ref<RevenueEpoch[]>([]);
const stats = ref<RevenueStats | null>(null);
const loading = ref(false);
const epochsLoading = ref(false);

// Methods
const loadLatestEpoch = async () => {
  loading.value = true;
  const data = await execute(() => apiService.getLatestEpoch());
  if (data) {
    latestEpoch.value = data;
  }
  loading.value = false;
};

const loadRecentEpochs = async () => {
  epochsLoading.value = true;
  const data = await execute(() => apiService.getEpochs({ limit: 10 }));
  if (data) {
    recentEpochs.value = data.epochs;
  }
  epochsLoading.value = false;
};

const loadStats = async () => {
  const data = await execute(() => apiService.getRevenueStats());
  if (data) {
    stats.value = data;
  }
};

const formatUSDT = (amount: string) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(parseFloat(amount));
};

// Initialize
onMounted(async () => {
  await Promise.all([
    loadLatestEpoch(),
    loadRecentEpochs(),
    loadStats()
  ]);
});
</script>
