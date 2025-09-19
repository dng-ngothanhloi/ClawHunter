import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  persistent?: boolean;
}

export const useAppStore = defineStore('app', () => {
  // State
  const theme = ref<'light' | 'dark'>('light');
  const sidebarOpen = ref(false);
  const notifications = ref<Notification[]>([]);
  const loading = ref(false);
  const initialized = ref(false);

  // Getters
  const isDark = computed(() => theme.value === 'dark');
  const hasNotifications = computed(() => notifications.value.length > 0);

  // Actions
  const initialize = () => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      theme.value = savedTheme;
    }
    
    // Apply theme to document
    document.documentElement.classList.toggle('dark', isDark.value);
    
    initialized.value = true;
  };

  const setTheme = (newTheme: 'light' | 'dark') => {
    theme.value = newTheme;
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value;
  };

  const addNotification = (notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    const newNotification: Notification = {
      id,
      duration: 5000,
      ...notification
    };
    
    notifications.value.push(newNotification);
    
    // Auto-remove non-persistent notifications
    if (!newNotification.persistent) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }
  };

  const removeNotification = (id: string) => {
    const index = notifications.value.findIndex(n => n.id === id);
    if (index > -1) {
      notifications.value.splice(index, 1);
    }
  };

  const clearNotifications = () => {
    notifications.value = [];
  };

  const setLoading = (isLoading: boolean) => {
    loading.value = isLoading;
  };

  return {
    // State
    theme,
    sidebarOpen,
    notifications,
    loading,
    initialized,
    
    // Getters
    isDark,
    hasNotifications,
    
    // Actions
    initialize,
    setTheme,
    toggleSidebar,
    addNotification,
    removeNotification,
    clearNotifications,
    setLoading
  };
});
