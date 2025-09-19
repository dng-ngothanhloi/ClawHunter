<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="bg-white shadow rounded-lg p-6">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">
        CHG Staking
      </h1>
      <p class="text-gray-600">
        Stake CHG tokens to earn from the α pool (20% of daily revenue)
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
            Please connect your wallet to view staking positions.
          </p>
        </div>
        <div class="ml-auto">
          <WalletButton />
        </div>
      </div>
    </div>

    <!-- Staking Summary -->
    <div v-if="walletStore.isConnected" class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Total Staked</h3>
        <p class="text-3xl font-bold text-blue-600">
          {{ formatCHG(totalStaked) }}
        </p>
        <p class="text-sm text-gray-600">CHG Tokens</p>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Active Positions</h3>
        <p class="text-3xl font-bold text-purple-600">
          {{ activePositions }}
        </p>
        <p class="text-sm text-gray-600">Staking Positions</p>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Total Rewards</h3>
        <p class="text-3xl font-bold text-green-600">
          {{ formatUSDT(totalRewards) }}
        </p>
        <p class="text-sm text-gray-600">USDT Earned</p>
      </div>
    </div>

    <!-- Lock Weight Information -->
    <div v-if="walletStore.isConnected" class="bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Lock Duration Weights</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          v-for="tier in lockTiers"
          :key="tier.days"
          class="text-center p-4 border border-gray-200 rounded-lg"
        >
          <p class="text-lg font-bold text-gray-900">{{ tier.weight }}x</p>
          <p class="text-sm text-gray-600">{{ tier.label }}</p>
          <p class="text-xs text-gray-500">{{ tier.days }} days</p>
        </div>
      </div>
      
      <div class="mt-4 p-4 bg-blue-50 rounded-lg">
        <p class="text-sm text-blue-800">
          <strong>Investor Program:</strong> Lock for 3+ years (1095 days) to qualify for additional benefits and maximum rewards.
        </p>
      </div>
    </div>

    <!-- Staking Positions -->
    <div v-if="walletStore.isConnected" class="bg-white shadow rounded-lg p-6">
      <h2 class="text-xl font-semibold mb-4">Your Staking Positions</h2>
      
      <div v-if="stakingLoading" class="flex justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
      
      <div v-else-if="positions.length === 0" class="text-center py-8 text-gray-500">
        <p class="mb-4">No staking positions found</p>
        <p class="text-sm">Start staking CHG tokens to earn from the α pool!</p>
      </div>
      
      <div v-else class="space-y-4">
        <div
          v-for="position in positions"
          :key="`${position.epochId}-${position.account}`"
          class="border border-gray-200 rounded-lg p-4"
        >
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p class="text-sm text-gray-600">Staked Amount</p>
              <p class="font-semibold">{{ formatCHG(position.amount) }} CHG</p>
            </div>
            
            <div>
              <p class="text-sm text-gray-600">Lock Weight</p>
              <p class="font-semibold">{{ position.weight / 1000 }}x</p>
            </div>
            
            <div>
              <p class="text-sm text-gray-600">Effective Weight</p>
              <p class="font-semibold">{{ formatCHG(position.effectiveWeight) }}</p>
            </div>
            
            <div>
              <p class="text-sm text-gray-600">Lock Until</p>
              <p class="font-semibold">
                {{ position.lockUntil ? formatDate(position.lockUntil) : 'Flexible' }}
              </p>
            </div>
          </div>
          
          <div class="mt-4 flex space-x-2">
            <button 
              @click="handleClaimRewards(position)"
              :disabled="isStakePending || isUnstakePending"
              class="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-1 px-3 rounded text-sm transition-colors"
            >
              {{ isStakePending ? 'Processing...' : 'Claim Rewards' }}
            </button>
            <button 
              v-if="canUnstake(position)"
              @click="handleUnstake(position)"
              :disabled="isStakePending || isUnstakePending"
              class="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white py-1 px-3 rounded text-sm transition-colors"
            >
              {{ isUnstakePending ? 'Unstaking...' : 'Unstake' }}
            </button>
            <button 
              v-else
              disabled
              class="bg-gray-300 text-gray-500 py-1 px-3 rounded text-sm cursor-not-allowed"
            >
              Locked
            </button>
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
import { apiService } from '@/services/api';
import { useApi } from '@/composables/useApi';
import { useTransactions } from '@/composables/useTransactions';
import WalletButton from '@/components/web3/WalletButton.vue';
import MachineCard from '@/components/MachineCard.vue';
import type { StakingPosition } from '@/types/api';

const walletStore = useWalletStore();
const { executeStake, executeUnstake, stakeStatus, unstakeStatus, isStakePending, isUnstakePending } = useTransactions();
const { execute } = useApi();

// State
const positions = ref<StakingPosition[]>([]);
const stakingLoading = ref(false);

// Computed
const totalStaked = computed(() => {
  return positions.value
    .reduce((sum, pos) => sum + parseFloat(pos.amount), 0)
    .toString();
});

const activePositions = computed(() => positions.value.length);

const totalRewards = computed(() => {
  // This would come from claims store in a real implementation
  return '0';
});

const lockTiers = [
  { days: 30, label: '<30 days', weight: 1.0 },
  { days: 90, label: '90 days', weight: 1.5 },
  { days: 180, label: '180 days', weight: 2.0 },
  { days: 365, label: '365+ days', weight: 3.0 }
];

// Methods
const loadStakingPositions = async () => {
  if (!walletStore.address) return;
  
  stakingLoading.value = true;
  const data = await execute(() => apiService.getStakingPositions(walletStore.address!));
  if (data) {
    positions.value = data.positions || [];
  }
  stakingLoading.value = false;
};

const canUnstake = (position: StakingPosition) => {
  if (!position.lockUntil) return true;
  return new Date(position.lockUntil) <= new Date();
};

const formatCHG = (amount: string) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(parseFloat(amount));
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

// Watch for wallet connection changes
watch(() => walletStore.address, async (newAddress) => {
  if (newAddress) {
    await loadStakingPositions();
  } else {
    positions.value = [];
  }
});

// Transaction handlers
const handleClaimRewards = async (position: StakingPosition) => {
  try {
    // For staking rewards, we need to claim from the CHGStaking contract
    const stakingContract = await walletStore.getContract('CHGStaking');
    const claimTxHash = await stakingContract.write('claim', [position.id]);
    
    // Wait for confirmation
    await walletStore.waitForTransaction(claimTxHash);
    
    // Refresh positions
    await loadStakingPositions();
    
    // Show success notification
    const appStore = useAppStore();
    appStore.addNotification({
      type: 'success',
      title: 'Rewards Claimed',
      message: `Successfully claimed staking rewards. Tx: ${claimTxHash.slice(0, 10)}...`
    });
    
  } catch (error: any) {
    const appStore = useAppStore();
    appStore.addNotification({
      type: 'error',
      title: 'Claim Failed',
      message: error.message || 'Failed to claim staking rewards'
    });
  }
};

const handleUnstake = async (position: StakingPosition) => {
  try {
    const result = await executeUnstake(position.id);
    
    // Refresh positions
    await loadStakingPositions();
    
    // Show success notification
    const appStore = useAppStore();
    appStore.addNotification({
      type: 'success',
      title: 'Unstaking Successful',
      message: `Successfully unstaked CHG tokens. Tx: ${result.hash.slice(0, 10)}...`
    });
    
  } catch (error: any) {
    const appStore = useAppStore();
    appStore.addNotification({
      type: 'error',
      title: 'Unstaking Failed',
      message: error.message || 'Failed to unstake CHG tokens'
    });
  }
};

const handleNewStake = async (amount: string, lockDuration: number) => {
  try {
    const result = await executeStake(amount, lockDuration);
    
    // Refresh positions
    await loadStakingPositions();
    
    // Show success notification
    const appStore = useAppStore();
    appStore.addNotification({
      type: 'success',
      title: 'Staking Successful',
      message: `Successfully staked ${result.stakedAmount} CHG for ${result.lockDuration} days. Tx: ${result.hash.slice(0, 10)}...`
    });
    
  } catch (error: any) {
    const appStore = useAppStore();
    appStore.addNotification({
      type: 'error',
      title: 'Staking Failed',
      message: error.message || 'Failed to stake CHG tokens'
    });
  }
};

// Initialize
onMounted(async () => {
  if (walletStore.isConnected && walletStore.address) {
    await loadStakingPositions();
  }
});
</script>
