<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="bg-white shadow rounded-lg p-6">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">
        Claw Machines
      </h1>
      <p class="text-gray-600">
        Monitor machine performance and revenue generation
      </p>
    </div>

    <!-- Machine Grid -->
    <div v-if="loading" class="flex justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
    
    <div v-else-if="machines.length === 0" class="text-center py-8 text-gray-500">
      No machines available
    </div>
    
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <MachineCard
        v-for="machine in machines"
        :key="machine.machineId"
        :machine="machine"
        @click="$router.push(`/machines/${machine.machineId}`)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { apiService } from '@/services/api';
import { useApi } from '@/composables/useApi';
import MachineCard from '@/components/MachineCard.vue';
import type { Machine } from '@/types/api';

const { execute } = useApi();

// State
const machines = ref<Machine[]>([]);
const loading = ref(false);

// Methods
const loadMachines = async () => {
  loading.value = true;
  const data = await execute(() => apiService.getMachines({ limit: 50 }));
  if (data) {
    machines.value = data.machines || [];
  }
  loading.value = false;
};

// Initialize
onMounted(() => {
  loadMachines();
});
</script>
