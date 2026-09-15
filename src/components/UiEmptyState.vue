<script setup lang="ts">
defineProps<{ icon?: string; title: string; description?: string }>()
defineEmits<{ action: [] }>()
</script>
<template>
  <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
    <span class="text-4xl">{{ icon || '📭' }}</span>
    <p class="text-gray-300 font-medium">{{ title }}</p>
    <p v-if="description" class="text-sm text-gray-500">{{ description }}</p>
    <slot name="action" />
  </div>
</template>