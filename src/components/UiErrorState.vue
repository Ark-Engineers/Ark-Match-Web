<script setup lang="ts">
defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <span class="text-4xl">⚠️</span>
    <p class="text-red-400 text-sm">{{ message }}</p>
    <button
      class="px-4 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-700 transition cursor-pointer"
      @click="$emit('retry')"
    >重试</button>
  </div>
</template>