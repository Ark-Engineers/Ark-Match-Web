<script setup lang="ts">
defineProps<{ label?: string }>()
</script>
<template>
  <div class="flex flex-col items-center justify-center gap-3 py-12">
    <div class="w-8 h-8 border-2 border-gray-700 border-t-cyan-400 rounded-full animate-spin" />
    <p v-if="label" class="text-sm text-gray-400">{{ label }}</p>
  </div>
</template>