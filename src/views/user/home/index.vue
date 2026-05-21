<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { request } from '@/api'
import { useAuthStore } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }

const router = useRouter()
const authStore = useAuthStore()

const loading = ref(false)
const error = ref('')

async function clearCaches(): Promise<void> {
  try {
    if (!('caches' in window)) return
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch {}
}

async function logout(): Promise<void> {
  loading.value = true
  error.value = ''

  try {
    const refreshToken = authStore.session?.refreshToken
    if (refreshToken) {
      await request<ApiResponse<null>>({
        url: '/auth/logout',
        method: 'POST',
        data: { refreshToken },
      })
    }
  } catch (e) {
    error.value = '登出接口调用失败，已在前端强制清理登录态'
  } finally {
    authStore.clearAllClientAuthState()
    await clearCaches()
    await router.replace('/login')
    window.location.reload()
    loading.value = false
  }
}
</script>

<template>
  <main style="padding: 16px; max-width: 900px; margin: 0 auto">
    <header style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
      <div>
        <div style="font-size: 20px; font-weight: 700">当前登录身份：普通用户</div>
        <div style="opacity: 0.75">用户ID：{{ authStore.session?.userId ?? '-' }}</div>
      </div>
      <button @click="logout" :disabled="loading" style="padding: 10px 12px">
        {{ loading ? '登出中...' : '登出' }}
      </button>
    </header>

    <section style="margin-top: 16px">
      <h1 style="margin: 0 0 8px">User Home</h1>
      <p style="margin: 0; opacity: 0.75">/user/home</p>
      <p v-if="error" style="margin-top: 12px; color: #c00">{{ error }}</p>
    </section>
  </main>
</template>

