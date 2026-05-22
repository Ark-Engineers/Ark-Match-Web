<script setup lang="ts">
import { computed, onErrorCaptured, ref } from 'vue'

type CapturedError = { message: string; detail?: string }

const error = ref<CapturedError | null>(null)

const hasError = computed(() => !!error.value)

onErrorCaptured((err, instance, info) => {
  const message = err instanceof Error ? err.message : String(err)
  error.value = { message: message || '页面发生错误', detail: info }
  return false
})

function reset(): void {
  error.value = null
}

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <div v-if="hasError" style="min-height: 60vh; display: grid; place-items: center; padding: 24px">
    <div style="max-width: 560px; width: 100%; border: 1px solid #eee; border-radius: 12px; padding: 16px">
      <h1 style="margin: 0 0 8px; font-size: 18px">页面加载失败</h1>
      <div style="opacity: 0.8; line-height: 1.6">
        <div>{{ error?.message }}</div>
        <div v-if="error?.detail" style="margin-top: 8px; font-size: 12px; opacity: 0.7">{{ error.detail }}</div>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px">
        <button @click="reload" style="padding: 10px 12px">刷新重试</button>
        <button @click="reset" style="padding: 10px 12px">继续查看</button>
      </div>
    </div>
  </div>
  <slot v-else />
</template>

