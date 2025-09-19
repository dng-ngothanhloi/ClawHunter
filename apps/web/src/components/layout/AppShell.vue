<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Sidebar -->
    <div
      :class="[
        'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out',
        appStore.sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0 lg:static lg:inset-0'
      ]"
    >
      <div class="flex flex-col h-full">
        <!-- Logo -->
        <div class="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div class="flex items-center">
            <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold text-sm">CH</span>
            </div>
            <span class="ml-3 text-xl font-semibold text-gray-900">Claw Hunters</span>
          </div>
          
          <button
            @click="appStore.toggleSidebar"
            class="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 px-4 py-6 space-y-2">
          <router-link
            v-for="item in navigation"
            :key="item.name"
            :to="item.to"
            :class="[
              'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
              $route.name === item.name 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            ]"
          >
            <component 
              :is="item.icon" 
              :class="[
                'mr-3 h-5 w-5',
                $route.name === item.name ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
              ]"
            />
            {{ item.label }}
          </router-link>
        </nav>

        <!-- Wallet Status -->
        <div class="p-4 border-t border-gray-200">
          <WalletButton />
          
          <div v-if="walletStore.isConnected" class="mt-3 text-xs text-gray-600">
            <p>Balance: {{ walletStore.formattedBalance }} ADL</p>
            <p>Network: {{ walletStore.targetChain.name }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Overlay for mobile -->
    <div
      v-if="appStore.sidebarOpen"
      @click="appStore.toggleSidebar"
      class="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
    ></div>

    <!-- Main content -->
    <div class="lg:pl-64">
      <!-- Top header -->
      <header class="bg-white shadow-sm border-b border-gray-200">
        <div class="flex items-center justify-between h-16 px-6">
          <button
            @click="appStore.toggleSidebar"
            class="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600"
          >
            <Bars3Icon class="h-5 w-5" />
          </button>
          
          <div class="flex items-center space-x-4">
            <!-- Theme toggle -->
            <button
              @click="toggleTheme"
              class="p-2 rounded-md text-gray-400 hover:text-gray-600"
            >
              <SunIcon v-if="appStore.isDark" class="h-5 w-5" />
              <MoonIcon v-else class="h-5 w-5" />
            </button>
            
            <!-- Notifications -->
            <button
              v-if="appStore.hasNotifications"
              @click="showNotifications"
              class="relative p-2 rounded-md text-gray-400 hover:text-gray-600"
            >
              <BellIcon class="h-5 w-5" />
              <span class="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                {{ appStore.notifications.length }}
              </span>
            </button>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="p-6">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  CurrencyDollarIcon,
  CogIcon,
  ChartBarIcon,
  UserGroupIcon,
  SunIcon,
  MoonIcon,
  BellIcon,
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline';
import { useAppStore } from '@/stores/app';
import { useWalletStore } from '@/stores/wallet';
import WalletButton from '@/components/web3/WalletButton.vue';

const appStore = useAppStore();
const walletStore = useWalletStore();

const navigation = [
  {
    name: 'dashboard',
    label: 'Dashboard',
    to: '/',
    icon: HomeIcon
  },
  {
    name: 'claim',
    label: 'Claim Rewards',
    to: '/claim',
    icon: CurrencyDollarIcon
  },
  {
    name: 'staking',
    label: 'CHG Staking',
    to: '/staking',
    icon: ChartBarIcon
  },
  {
    name: 'machines',
    label: 'Machines',
    to: '/machines',
    icon: CogIcon
  },
  {
    name: 'owners',
    label: 'NFT Ownership',
    to: '/owners',
    icon: UserGroupIcon
  }
];

const toggleTheme = () => {
  appStore.setTheme(appStore.isDark ? 'light' : 'dark');
};

const showNotifications = () => {
  // Toggle notifications panel
  console.log('Show notifications');
};

// Mock data for development
const pendingClaims = computed(() => []);
const claimHistory = computed(() => []);
const totalClaimable = computed(() => '0');
const poolBreakdown = computed(() => ({ alpha: '0', beta: '0', gamma: '0' }));

const handleBatchClaim = () => {
  console.log('Batch claim');
};

const handleIndividualClaim = (claim: any) => {
  console.log('Individual claim:', claim);
};

const formatUSDT = (amount: string) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(parseFloat(amount));
};
</script>
