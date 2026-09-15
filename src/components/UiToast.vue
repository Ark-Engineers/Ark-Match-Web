<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
const ui = useUiStore()
</script>

<template>
  <Transition name="toast">
    <div
      v-if="ui.toastVisible && ui.toastMessage"
      class="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg max-w-sm text-center pointer-events-none"
      :class="{
        'bg-green-900/90 text-green-200 border border-green-700': ui.toastType === 'success',
        'bg-red-900/90 text-red-200 border border-red-700': ui.toastType === 'error',
        'bg-gray-800/90 text-gray-200 border border-gray-700': ui.toastType === 'info',
      }"
    >
      {{ ui.toastMessage }}
    </div>
  </Transition>
</template>

<style scoped>
.toast-enter-active { transition: all 0.2s ease-out; }
.toast-leave-active { transition: all 0.2s ease-in; }
.toast-enter-from { opacity: 0; transform: translate(-50%, -12px); }
.toast-leave-to { opacity: 0; transform: translate(-50%, -12px); }
</style>