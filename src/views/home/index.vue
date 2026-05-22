<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { request } from '@/api'
import { useAuthStore } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }

const router = useRouter()
const authStore = useAuthStore()

const isAdmin = computed(() => String(authStore.role ?? '').toUpperCase() === 'ADMIN')
const roleLabel = computed(() => (isAdmin.value ? '管理员' : '普通用户'))

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

async function goAdmin(): Promise<void> {
  await router.push('/admin/dashboard')
}

async function goMyBanRecords(): Promise<void> {
  await router.push('/user/ban-records')
}

async function goAppeal(): Promise<void> {
  await router.push('/user/appeal')
}
</script>

<template>
  <main style="padding: 16px; max-width: 900px; margin: 0 auto">
    <header
      style="
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      "
    >
      <div style="min-width: 240px">
        <div style="font-size: 20px; font-weight: 700">当前登录身份：{{ roleLabel }}</div>
        <div style="opacity: 0.75">用户ID：{{ authStore.session?.userId ?? '-' }}</div>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end">
        <button v-if="isAdmin" @click="goAdmin" style="padding: 10px 12px">系统管理入口</button>
        <button @click="goMyBanRecords" style="padding: 10px 12px">我的封禁记录</button>
        <button @click="goAppeal" style="padding: 10px 12px">申诉入口</button>
        <button @click="logout" :disabled="loading" style="padding: 10px 12px">
          {{ loading ? '登出中...' : '登出' }}
        </button>
      </div>
    </header>

    <section style="margin-top: 16px">
      <h1 style="margin: 0 0 8px">主界面</h1>
      <p style="margin: 0; opacity: 0.75">/home</p>
      <p v-if="error" style="margin-top: 12px; color: #c00">{{ error }}</p>
    </section>
  </main>
</template>
