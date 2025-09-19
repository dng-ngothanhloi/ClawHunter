<template>
  <div class="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
    <TransitionGroup
      name="notification"
      tag="div"
      class="space-y-2"
    >
      <div
        v-for="notification in appStore.notifications"
        :key="notification.id"
        :class="[
          'p-4 rounded-lg shadow-lg border-l-4 bg-white',
          notificationStyles[notification.type]
        ]"
      >
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <component 
              :is="notificationIcons[notification.type]" 
              class="h-5 w-5"
            />
          </div>
          
          <div class="ml-3 flex-1">
            <h4 class="text-sm font-medium text-gray-900">
              {{ notification.title }}
            </h4>
            <p v-if="notification.message" class="mt-1 text-sm text-gray-600">
              {{ notification.message }}
            </p>
          </div>
          
          <div class="ml-4 flex-shrink-0">
            <button
              @click="appStore.removeNotification(notification.id)"
              class="inline-flex text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { 
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline';
import { useAppStore } from '@/stores/app';

const appStore = useAppStore();

const notificationStyles = {
  success: 'border-green-400',
  error: 'border-red-400',
  warning: 'border-yellow-400',
  info: 'border-blue-400'
};

const notificationIcons = {
  success: CheckCircleIcon,
  error: ExclamationCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon
};
</script>

<style scoped>
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.notification-move {
  transition: transform 0.3s ease;
}
</style>
