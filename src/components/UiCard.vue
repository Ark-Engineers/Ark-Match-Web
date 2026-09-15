<script setup lang="ts">
defineProps<{ clickable?: boolean; hoverable?: boolean }>()
</script>
<template>
  <div
    class="bg-gray-900/80 border border-gray-800 rounded-xl p-6 backdrop-blur-sm"
    :class="{
      'cursor-pointer hover:border-gray-700 hover:bg-gray-900/60 transition': clickable || hoverable,
    }"
  >
    <slot />
  </div>
</template>