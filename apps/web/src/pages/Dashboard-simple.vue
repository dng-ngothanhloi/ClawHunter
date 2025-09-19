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
          
          <!-- Simple allocation display -->
          <div class="space-y-2">
            <div class="flex justify-between items-center p-2 bg-blue-50 rounded">
              <span class="text-sm font-medium">OPC (70%)</span>
              <span class="text-sm">{{ formatUSDT(latestEpoch.opc) }} USDT</span>
            </div>
            <div class="flex justify-between items-center p-2 bg-green-50 rounded">
              <span class="text-sm font-medium">CHG Staking (20%)</span>
              <span class="text-sm">{{ formatUSDT(latestEpoch.alpha) }} USDT</span>
            </div>
            <div class="flex justify-between items-center p-2 bg-yellow-50 rounded">
              <span class="text-sm font-medium">NFTClaw L1 (3%)</span>
              <span class="text-sm">{{ formatUSDT(latestEpoch.beta) }} USDT</span>
            </div>
            <div class="flex justify-between items-center p-2 bg-red-50 rounded">
              <span class="text-sm font-medium">NFTOwner L2 (3%)</span>
              <span class="text-sm">{{ formatUSDT(latestEpoch.gamma) }} USDT</span>
            </div>
            <div class="flex justify-between items-center p-2 bg-purple-50 rounded">
              <span class="text-sm font-medium">Reward Pool (4%)</span>
              <span class="text-sm">{{ formatUSDT(latestEpoch.delta) }} USDT</span>
            </div>
          </div>
        </div>
        
        <div v-else class="text-center py-8 text-gray-500">
          No epoch data available
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="bg-white shadow rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">System Status</h2>
        
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="text-center p-3 bg-blue-50 rounded-lg">
              <p class="text-2xl font-bold text-blue-600">{{ totalEpochs }}</p>
              <p class="text-sm text-gray-600">Total Epochs</p>
            </div>
            <div class="text-center p-3 bg-green-50 rounded-lg">
              <p class="text-2xl font-bold text-green-600">
                {{ formatUSDT(totalRevenue) }}
              </p>
              <p class="text-sm text-gray-600">Total Revenue</p>
            </div>
          </div>
          
          <div class="text-center p-3 bg-gray-50 rounded-lg">
            <p class="text-sm text-gray-600 mb-2">API Status</p>
            <div :class="[
              'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
              apiStatus === 'connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            ]">
              <div :class="[
                'w-2 h-2 rounded-full mr-1',
                apiStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
              ]"></div>
              {{ apiStatus === 'connected' ? 'Connected' : 'Disconnected' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <router-link
        to="/claim"
        class="bg-blue-600 hover:bg-blue-700 text-white p-6 rounded-lg text-center transition-colors block"
      >
        <h3 class="text-lg font-semibold mb-2">Claim Rewards</h3>
        <p class="text-blue-100">Access your pending rewards</p>
      </router-link>
      
      <router-link
        to="/staking"
        class="bg-green-600 hover:bg-green-700 text-white p-6 rounded-lg text-center transition-colors block"
      >
        <h3 class="text-lg font-semibold mb-2">CHG Staking</h3>
        <p class="text-green-100">Stake CHG for rewards</p>
      </router-link>
      
      <router-link
        to="/machines"
        class="bg-purple-600 hover:bg-purple-700 text-white p-6 rounded-lg text-center transition-colors block"
      >
        <h3 class="text-lg font-semibold mb-2">Machines</h3>
        <p class="text-purple-100">View machine performance</p>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

// Simple state without Pinia
const latestEpoch = ref<any>(null);
const loading = ref(false);
const apiStatus = ref<'connected' | 'disconnected'>('disconnected');
const totalEpochs = ref(0);
const totalRevenue = ref('0');

// API base URL
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

// Methods
const loadLatestEpoch = async () => {
  loading.value = true;
  try {
    const response = await axios.get(`${API_BASE}/revenue/latest`);
    latestEpoch.value = response.data;
    apiStatus.value = 'connected';
  } catch (error) {
    console.warn('Failed to load latest epoch:', error);
    apiStatus.value = 'disconnected';
    // Use mock data for demo
    latestEpoch.value = {
      epochId: 3,
      totalR: '8500.000000',
      opc: '5950.000000',
      alpha: '1700.000000',
      beta: '255.000000',
      gamma: '255.000000',
      delta: '340.000000'
    };
  } finally {
    loading.value = false;
  }
};

const loadStats = async () => {
  try {
    const response = await axios.get(`${API_BASE}/revenue/stats`);
    const stats = response.data;
    totalEpochs.value = stats.epochs.total;
    totalRevenue.value = stats.revenue.totalAllTime;
  } catch (error) {
    // Use mock data
    totalEpochs.value = 3;
    totalRevenue.value = '33500.000000';
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
    loadStats()
  ]);
});
</script>
