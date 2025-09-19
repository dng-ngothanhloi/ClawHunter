<template>
  <div class="relative">
    <canvas ref="chartCanvas" width="300" height="300"></canvas>
    
    <!-- Legend -->
    <div class="mt-4 grid grid-cols-1 gap-2 text-sm">
      <div v-for="segment in segments" :key="segment.label" class="flex items-center justify-between">
        <div class="flex items-center">
          <div 
            class="w-3 h-3 rounded-full mr-2"
            :style="{ backgroundColor: segment.color }"
          ></div>
          <span class="text-gray-700">{{ segment.label }}</span>
        </div>
        <span class="font-medium">{{ segment.percentage }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { Chart, ArcElement, Tooltip, Legend } from 'chart.js';
import type { RevenueEpoch } from '@/types/api';

interface Props {
  distribution: RevenueEpoch;
}

const props = defineProps<Props>();
const chartCanvas = ref<HTMLCanvasElement>();
let chartInstance: Chart | null = null;

const segments = computed(() => {
  const total = parseFloat(props.distribution.totalR);
  
  return [
    { 
      label: 'OPC', 
      percentage: total > 0 ? ((parseFloat(props.distribution.opc) / total) * 100).toFixed(1) : '70.0',
      color: '#3B82F6',
      amount: props.distribution.opc
    },
    { 
      label: 'CHG Staking (α)', 
      percentage: total > 0 ? ((parseFloat(props.distribution.alpha) / total) * 100).toFixed(1) : '20.0',
      color: '#10B981',
      amount: props.distribution.alpha
    },
    { 
      label: 'NFTClaw L1 (β)', 
      percentage: total > 0 ? ((parseFloat(props.distribution.beta) / total) * 100).toFixed(1) : '3.0',
      color: '#F59E0B',
      amount: props.distribution.beta
    },
    { 
      label: 'NFTOwner L2 (γ)', 
      percentage: total > 0 ? ((parseFloat(props.distribution.gamma) / total) * 100).toFixed(1) : '3.0',
      color: '#EF4444',
      amount: props.distribution.gamma
    },
    { 
      label: 'Reward Pool (δ)', 
      percentage: total > 0 ? ((parseFloat(props.distribution.delta) / total) * 100).toFixed(1) : '4.0',
      color: '#8B5CF6',
      amount: props.distribution.delta
    }
  ];
});

const createChart = () => {
  if (!chartCanvas.value) return;
  
  // Destroy existing chart
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  Chart.register(ArcElement, Tooltip, Legend);
  
  chartInstance = new Chart(chartCanvas.value, {
    type: 'doughnut',
    data: {
      labels: segments.value.map(s => s.label),
      datasets: [{
        data: segments.value.map(s => parseFloat(s.percentage)),
        backgroundColor: segments.value.map(s => s.color),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverBorderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          display: false 
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const segment = segments.value[context.dataIndex];
              return `${segment.label}: ${segment.percentage}% (${formatUSDT(segment.amount)} USDT)`;
            }
          }
        }
      },
      cutout: '60%'
    }
  });
};

const formatUSDT = (amount: string) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(parseFloat(amount));
};

onMounted(() => {
  createChart();
});

watch(() => props.distribution, () => {
  createChart();
}, { deep: true });
</script>
