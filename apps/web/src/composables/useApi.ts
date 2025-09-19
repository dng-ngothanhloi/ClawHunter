import { ref, computed } from 'vue';
import { apiService } from '@/services/api';
import { useAppStore } from '@/stores/app';
import type { ApiError } from '@/types/api';

export const useApi = () => {
  const loading = ref(false);
  const error = ref<ApiError | null>(null);
  const appStore = useAppStore();

  const isLoading = computed(() => loading.value);
  const hasError = computed(() => !!error.value);

  const execute = async <T>(
    apiCall: () => Promise<{ data: T }>,
    options?: {
      showSuccessNotification?: boolean;
      successMessage?: string;
      showErrorNotification?: boolean;
      errorMessage?: string;
    }
  ): Promise<T | null> => {
    loading.value = true;
    error.value = null;

    try {
      const response = await apiCall();
      
      if (options?.showSuccessNotification) {
        appStore.addNotification({
          type: 'success',
          title: 'Success',
          message: options.successMessage || 'Operation completed successfully'
        });
      }
      
      return response.data;
    } catch (err: any) {
      error.value = err as ApiError;
      
      if (options?.showErrorNotification !== false) {
        appStore.addNotification({
          type: 'error',
          title: 'Error',
          message: options?.errorMessage || err.message || 'An error occurred'
        });
      }
      
      return null;
    } finally {
      loading.value = false;
    }
  };

  const clearError = () => {
    error.value = null;
  };

  return {
    loading: isLoading,
    error,
    hasError,
    execute,
    clearError
  };
};
