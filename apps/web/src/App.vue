<template>
  <div id="app" class="min-h-screen bg-gray-50">
    <AppShell>
      <router-view />
    </AppShell>
    
    <!-- Global notifications -->
    <NotificationContainer />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import AppShell from '@/components/layout/AppShell.vue';
import NotificationContainer from '@/components/ui/NotificationContainer.vue';
import { useAppStore } from '@/stores/app';
import { useWalletStore } from '@/stores/wallet';

const appStore = useAppStore();
const walletStore = useWalletStore();

onMounted(async () => {
  // Initialize app
  appStore.initialize();
  
  // Try to reconnect wallet if previously connected
  await walletStore.tryReconnect();
});
</script>

<style>
#app {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
