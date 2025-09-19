<template>
  <div class="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
    <!-- Header -->
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold text-gray-900">
        Epoch {{ claim.epochId }}
      </h3>
      <span :class="[
        'px-2 py-1 text-xs font-medium rounded-full',
        poolColors[claim.group]
      ]">
        {{ poolNames[claim.group] }}
      </span>
    </div>
    
    <!-- Amount -->
    <div class="mb-4">
      <p class="text-2xl font-bold text-green-600">
        {{ formatUSDT(claim.amount) }}
      </p>
      <p class="text-sm text-gray-600">USDT Claimable</p>
    </div>
    
    <!-- Claim Status -->
    <div class="mb-4">
      <div v-if="claim.claimed" class="flex items-center text-sm text-gray-500">
        <CheckCircleIcon class="h-4 w-4 mr-1 text-green-500" />
        Claimed on {{ formatDate(claim.claimedAt!) }}
      </div>
      <div v-else class="flex items-center text-sm text-blue-600">
        <ClockIcon class="h-4 w-4 mr-1" />
        Ready to claim
      </div>
    </div>
    
    <!-- Action Button -->
    <button
      v-if="!claim.claimed"
      @click="handleClaim"
      :disabled="claiming"
      class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-2 px-4 rounded-md transition-colors font-medium"
    >
      {{ claiming ? 'Processing...' : 'Claim Reward' }}
    </button>
    
    <div v-else class="w-full bg-gray-100 text-gray-500 py-2 px-4 rounded-md text-center font-medium">
      Already Claimed
    </div>
    
    <!-- Transaction Link -->
    <div v-if="claim.claimed && claim.claimedTx" class="mt-3">
      <a
        :href="`${explorerUrl}/tx/${claim.claimedTx}`"
        target="_blank"
        class="text-xs text-blue-600 hover:underline flex items-center justify-center"
      >
        <ExternalLinkIcon class="h-3 w-3 mr-1" />
        View Transaction
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  CheckCircleIcon, 
  ClockIcon, 
  ExternalLinkIcon 
} from '@heroicons/vue/24/outline';
import { useWalletStore } from '@/stores/wallet';
import type { ClaimInfo } from '@/types/api';

interface Props {
  claim: ClaimInfo;
}

interface Emits {
  (e: 'claim', claim: ClaimInfo): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const walletStore = useWalletStore();
const claiming = ref(false);

const poolNames = {
  'A': 'CHG Staking',
  'B': 'NFTClaw L1',
  'G': 'NFTOwner L2'
};

const poolColors = {
  'A': 'bg-green-100 text-green-800',
  'B': 'bg-yellow-100 text-yellow-800',
  'G': 'bg-red-100 text-red-800'
};

const explorerUrl = computed(() => walletStore.targetChain.explorerUrl);

const handleClaim = async () => {
  if (claiming.value || props.claim.claimed) return;
  
  claiming.value = true;
  try {
    emit('claim', props.claim);
  } finally {
    claiming.value = false;
  }
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
</script>
