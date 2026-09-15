<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  loading?: boolean
  block?: boolean
}>()
</script>
<template>
  <button
    :disabled="disabled || loading"
    class="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    :class="[
      block ? 'w-full' : '',
      variant === 'secondary'
        ? 'bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700'
        : variant === 'ghost'
        ? 'bg-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
        : 'bg-[#16B8E0] text-white hover:bg-[#2ac6ea]',
    ]"
  >
    <span v-if="loading" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
    <slot />
  </button>
</template>