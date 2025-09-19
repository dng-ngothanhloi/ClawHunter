<template>
  <div class="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
    <!-- Header -->
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold text-gray-900">
        Machine {{ machine.machineId }}
      </h3>
      <span :class="[
        'px-2 py-1 text-xs font-medium rounded-full',
        statusColors[machine.status]
      ]">
        {{ machine.status }}
      </span>
    </div>
    
    <!-- Revenue Info -->
    <div class="space-y-3">
      <div>
        <p class="text-2xl font-bold text-green-600">
          {{ formatUSDT(machine.totalRevenue) }}
        </p>
        <p class="text-sm text-gray-600">Total Revenue</p>
      </div>
      
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p class="font-medium text-gray-900">{{ machine.owners?.length || 0 }}</p>
          <p class="text-gray-600">Owners</p>
        </div>
        <div>
          <p class="font-medium text-gray-900">{{ machine.lastEpoch || 'N/A' }}</p>
          <p class="text-gray-600">Last Epoch</p>
        </div>
      </div>
      
      <div v-if="machine.location" class="text-sm text-gray-600">
        📍 {{ machine.location }}
      </div>
    </div>
    
    <!-- Quick Actions -->
    <div class="mt-4 pt-4 border-t border-gray-200">
      <div class="flex space-x-2">
        <button class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded text-sm transition-colors">
          View Details
        </button>
        <button class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-1 px-3 rounded text-sm transition-colors">
          Revenue History
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Machine } from '@/types/api';

interface Props {
  machine: Machine;
}

defineProps<Props>();

const statusColors = {
  'ACTIVE': 'bg-green-100 text-green-800',
  'EXPIRED': 'bg-yellow-100 text-yellow-800',
  'BROKEN': 'bg-red-100 text-red-800',
  'DECOMMISSIONED': 'bg-gray-100 text-gray-800'
};

const formatUSDT = (amount: string) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parseFloat(amount));
};
</script>
