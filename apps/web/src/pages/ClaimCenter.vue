<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="bg-white shadow rounded-lg p-6">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">
        Claim Center
      </h1>
      <p class="text-gray-600">
        Claim your accumulated rewards from all pools (α, β, γ)
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
            Please connect your wallet to view and claim rewards.
          </p>
        </div>
        <div class="ml-auto">
          <WalletButton />
        </div>
      </div>
    </div>

    <!-- Claims Summary -->
    <div v-if="walletStore.isConnected" class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Total Claimable</h3>
        <p class="text-3xl font-bold text-green-600">
          {{ formatUSDT(totalClaimable) }} USDT
        </p>
        <p class="text-sm text-gray-600 mt-1">
          Across {{ pendingClaims.length }} epochs
        </p>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Pool Breakdown</h3>
        <div class="space-y-1 text-sm">
          <div class="flex justify-between">
            <span>CHG Staking (α):</span>
            <span class="font-medium">{{ formatUSDT(poolBreakdown.alpha) }}</span>
          </div>
          <div class="flex justify-between">
            <span>NFTClaw L1 (β):</span>
            <span class="font-medium">{{ formatUSDT(poolBreakdown.beta) }}</span>
          </div>
          <div class="flex justify-between">
            <span>NFTOwner L2 (γ):</span>
            <span class="font-medium">{{ formatUSDT(poolBreakdown.gamma) }}</span>
          </div>
        </div>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Claim Status</h3>
        <div class="text-center">
          <button
            @click="handleBatchClaim"
            :disabled="!canClaim || claiming"
            class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-2 px-4 rounded-md transition-colors"
          >
            {{ claiming ? 'Processing...' : `Claim All (${pendingClaims.length})` }}
          </button>
        </div>
      </div>
    </div>

    <!-- Individual Claims -->
    <div v-if="walletStore.isConnected && pendingClaims.length > 0" class="bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Pending Claims</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ClaimCard
          v-for="claim in pendingClaims"
          :key="`${claim.epochId}-${claim.group}`"
          :claim="claim"
          @claim="handleIndividualClaim"
        />
      </div>
    </div>

    <!-- Claim History -->
    <div v-if="walletStore.isConnected" class="bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Claim History</h2>
      
      <div v-if="claimHistory.length === 0" class="text-center py-8 text-gray-500">
        No claims made yet
      </div>
      
      <div v-else class="space-y-3">
        <div
          v-for="claim in claimHistory"
          :key="`${claim.epochId}-${claim.group}-${claim.claimedAt}`"
          class="flex justify-between items-center p-4 border border-gray-200 rounded-lg"
        >
          <div>
            <p class="font-medium">Epoch {{ claim.epochId }} - {{ claim.group }} Pool</p>
            <p class="text-sm text-gray-600">{{ formatDate(claim.claimedAt!) }}</p>
          </div>
          <div class="text-right">
            <p class="font-semibold text-green-600">{{ formatUSDT(claim.amount) }} USDT</p>
            <a
              :href="`${walletStore.targetChain.explorerUrl}/tx/${claim.claimedTx}`"
              target="_blank"
              class="text-xs text-blue-600 hover:underline"
            >
              View Transaction
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline';
import { useWalletStore } from '@/stores/wallet';
import { useClaimsStore } from '@/stores/claims';
import { useContracts } from '@/composables/useContracts';
import { useAppStore } from '@/stores/app';
import { useTransactions } from '@/composables/useTransactions';
import AllocationPie from '@/components/charts/AllocationPie.vue';
import EpochTable from '@/components/EpochTable.vue';
import ClaimCard from '@/components/ClaimCard.vue';
import WalletButton from '@/components/web3/WalletButton.vue';
import type { ClaimInfo } from '@/types/api';

const walletStore = useWalletStore();
const claimsStore = useClaimsStore();
const appStore = useAppStore();
const { processClaim, claimStatus, isClaimPending } = useTransactions();
const { submitClaim } = useContracts();

// State
const claiming = ref(false);
const loading = ref(false);

// Computed
const pendingClaims = computed(() => claimsStore.pendingClaims);
const claimHistory = computed(() => claimsStore.claimHistory);
const totalClaimable = computed(() => claimsStore.totalClaimable);
const latestEpoch = computed(() => claimsStore.latestEpoch);

const poolBreakdown = computed(() => {
  const breakdown = { alpha: '0', beta: '0', gamma: '0' };
  
  pendingClaims.value.forEach(claim => {
    if (claim.group === 'A') breakdown.alpha = (parseFloat(breakdown.alpha) + parseFloat(claim.amount)).toString();
    if (claim.group === 'B') breakdown.beta = (parseFloat(breakdown.beta) + parseFloat(claim.amount)).toString();
    if (claim.group === 'G') breakdown.gamma = (parseFloat(breakdown.gamma) + parseFloat(claim.amount)).toString();
  });
  
  return breakdown;
});

const canClaim = computed(() => {
  return pendingClaims.value.length > 0 && !claiming.value;
});

// Methods
const handleBatchClaim = async () => {
  if (!canClaim.value) return;

  claiming.value = true;
  
  try {
    const epochIds = [...new Set(pendingClaims.value.map(c => c.epochId))];
    const groups = [...new Set(pendingClaims.value.map(c => c.group))];
    
    // Use the new transaction service for complete claim processing
    const result = await processClaim(epochIds, groups);
    
    appStore.addNotification({
      type: 'success',
      title: 'Claim Successful',
      message: `Successfully claimed ${result.claimedAmount} USDT in ${result.claimCount} claims. Tx: ${result.hash.slice(0, 10)}...`
    });
    
    // Refresh claims data
    await claimsStore.fetchPendingClaims(walletStore.address!);
    
  } catch (error: any) {
    appStore.addNotification({
      type: 'error',
      title: 'Claim Failed',
      message: error.message || 'Failed to submit claim transaction'
    });
  } finally {
    claiming.value = false;
  }
};

const handleIndividualClaim = async (claim: ClaimInfo) => {
  // Similar to batch claim but for single claim
  console.log('Individual claim:', claim);
};

const formatUSDT = (amount: string) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(parseFloat(amount));
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Watch for wallet connection changes
watch(() => walletStore.address, async (newAddress) => {
  if (newAddress) {
    await claimsStore.fetchPendingClaims(newAddress);
  } else {
    claimsStore.clearClaims();
  }
});

// Initialize
onMounted(async () => {
  if (walletStore.isConnected && walletStore.address) {
    await claimsStore.fetchPendingClaims(walletStore.address);
  }
});
</script>
