<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { request } from '@/api'
import { useAuthStore, type AuthSession } from '@/stores/auth'

type ApiResponse<T> = { code: number; message: string; data: T }

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const form = reactive({
  account: '',
  password: '',
})

const fieldErrors = reactive<{ account?: string; password?: string }>({})
const submitError = ref('')
const loading = ref(false)

function resolveHomePath(role: unknown): string {
  const picked = String(role ?? '').toUpperCase()
  if (picked === 'ADMIN') return '/admin/dashboard'
  return '/user/home'
}

function validate(): boolean {
  fieldErrors.account = undefined
  fieldErrors.password = undefined

  const account = form.account.trim()
  if (!account) {
    fieldErrors.account = '请输入手机号/账号'
  } else if (/^\d+$/.test(account) && !/^1\d{10}$/.test(account)) {
    fieldErrors.account = '手机号格式不正确（需为11位，以1开头）'
  } else if (!/^\d+$/.test(account) && !/^[a-zA-Z0-9_]{3,32}$/.test(account)) {
    fieldErrors.account = '账号格式不正确（3-32位字母/数字/下划线）'
  }

  const password = form.password
  if (!password) {
    fieldErrors.password = '请输入密码'
  }

  return !fieldErrors.account && !fieldErrors.password
}

function resolveErrorMessage(err: unknown): string {
  const anyErr = err as any
  const msgFromApi = anyErr?.response?.data?.message
  if (typeof msgFromApi === 'string' && msgFromApi.trim()) return msgFromApi
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message
  return '登录失败，请稍后重试'
}

async function submit(): Promise<void> {
  submitError.value = ''
  if (!validate()) return

  loading.value = true
  try {
    const res = await request<ApiResponse<AuthSession>>({
      url: '/auth/login',
      method: 'POST',
      data: {
        account: form.account.trim(),
        password: form.password,
      },
    })

    if (res.code !== 0 || !res.data?.accessToken) {
      submitError.value = res.message || '登录失败'
      return
    }

    authStore.setSession(res.data)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : undefined
    await router.replace(redirect || resolveHomePath(res.data.role))
  } catch (err) {
    submitError.value = resolveErrorMessage(err)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (authStore.isAuthenticated) {
    await router.replace(resolveHomePath(authStore.role))
  }
})
</script>

<template>
  <main style="max-width: 420px; margin: 60px auto; padding: 24px">
    <h1 style="margin: 0 0 16px">登录</h1>

    <form @submit.prevent="submit" style="display: grid; gap: 12px">
      <label style="display: grid; gap: 6px">
        <span>手机号/账号</span>
        <input v-model.trim="form.account" autocomplete="username" />
        <span v-if="fieldErrors.account" style="color: #c00">{{ fieldErrors.account }}</span>
      </label>

      <label style="display: grid; gap: 6px">
        <span>密码</span>
        <input v-model="form.password" type="password" autocomplete="current-password" />
        <span v-if="fieldErrors.password" style="color: #c00">{{ fieldErrors.password }}</span>
      </label>

      <button type="submit" :disabled="loading" style="padding: 10px 12px">
        {{ loading ? '登录中...' : '登录' }}
      </button>

      <div v-if="submitError" style="color: #c00">{{ submitError }}</div>

      <div style="display: flex; justify-content: space-between; gap: 12px">
        <RouterLink to="/register">没有账号？去注册</RouterLink>
      </div>
    </form>
  </main>
</template>

