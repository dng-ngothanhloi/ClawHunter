<template>
  <button
    @click="handleWalletAction"
    :disabled="walletStore.isConnecting"
    :class="[
      'flex items-center justify-center w-full px-4 py-2 text-sm font-medium rounded-md transition-colors',
      walletStore.isConnected
        ? 'bg-green-100 text-green-700 hover:bg-green-200'
        : 'bg-blue-600 text-white hover:bg-blue-700',
      walletStore.isConnecting ? 'opacity-50 cursor-not-allowed' : ''
    ]"
  >
    <div v-if="walletStore.isConnecting" class="flex items-center">
      <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
      Connecting...
    </div>
    
    <div v-else-if="walletStore.isConnected" class="flex items-center">
      <div class="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
      {{ walletStore.formattedAddress }}
    </div>
    
    <div v-else class="flex items-center">
      <WalletIcon class="h-4 w-4 mr-2" />
      Connect Wallet
    </div>
  </button>

  <!-- Wallet dropdown menu (when connected) -->
  <div
    v-if="walletStore.isConnected && showDropdown"
    class="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-md shadow-lg z-10"
  >
    <div class="p-3 border-b border-gray-200">
      <p class="text-sm font-medium text-gray-900">{{ walletStore.formattedAddress }}</p>
      <p class="text-xs text-gray-600">Balance: {{ walletStore.formattedBalance }} ADL</p>
    </div>
    
    <div class="p-2">
      <button
        @click="copyAddress"
        class="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
      >
        Copy Address
      </button>
      
      <a
        :href="`${walletStore.targetChain.explorerUrl}/address/${walletStore.address}`"
        target="_blank"
        class="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
      >
        View on Explorer
      </a>
      
      <button
        @click="handleDisconnect"
        class="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
      >
        Disconnect
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { WalletIcon } from '@heroicons/vue/24/outline';
import { useWalletStore } from '@/stores/wallet';
import { useAppStore } from '@/stores/app';

const walletStore = useWalletStore();
const appStore = useAppStore();

const showDropdown = ref(false);

const handleWalletAction = async () => {
  if (walletStore.isConnected) {
    showDropdown.value = !showDropdown.value;
  } else {
    await walletStore.connect();
  }
};

const handleDisconnect = async () => {
  showDropdown.value = false;
  await walletStore.disconnect();
};

const copyAddress = async () => {
  if (walletStore.address) {
    try {
      await navigator.clipboard.writeText(walletStore.address);
      appStore.addNotification({
        type: 'success',
        title: 'Address Copied',
        message: 'Wallet address copied to clipboard'
      });
    } catch (error) {
      appStore.addNotification({
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy address to clipboard'
      });
    }
  }
  showDropdown.value = false;
};

// Close dropdown when clicking outside
const handleClickOutside = () => {
  showDropdown.value = false;
};

// Add event listener for clicks outside
if (typeof document !== 'undefined') {
  document.addEventListener('click', handleClickOutside);
}
</script>
